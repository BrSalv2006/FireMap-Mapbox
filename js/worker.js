importScripts('https://unpkg.com/@turf/turf/turf.min.js');

let workerPortugalGeometry;
let workerConcelhosGeoJSON;
const now = new Date();

const fetchWithRetry = async (url, options = {}, retries = 3, delay = 1000) => {
	for (let i = 0; i < retries; i++) {
		try {
			const response = await fetch(url, options);
			if (!response.ok) {
				if (response.status === 429 && i < retries) {
					await new Promise(resolve => setTimeout(resolve, delay));
					continue;
				}
				throw new Error(`HTTP error! Status: ${response.status}`);
			}
			return await response.json();
		} catch (error) {
			if (i < retries) {
				await new Promise(resolve => setTimeout(resolve, delay));
			} else {
				throw error;
			}
		}
	}
};

const processFirePoints = (fireFeatures, boundary) => {
	const points = fireFeatures.features.map(f => {
		const p = f.properties;
		return turf.point(f.geometry.coordinates, {
			brightness: p.BRIGHTNESS || p.bright_ti4,
			acq_date: new Date(p.ACQ_DATE || p.acq_time).toLocaleString(),
			satellite: { A: 'Aqua', T: 'Terra' }[p.SATELLITE] || p.satellite,
			confidence: { nominal: 'Normal', low: 'Baixa', high: 'Alta' }[p.confidence] || p.CONFIDENCE,
			daynight: (p.DAYNIGHT || p.daynight) === 'D' ? 'Dia' : 'Noite',
			frp: p.FRP || p.frp,
		});
	}).filter(point => !boundary || turf.booleanPointInPolygon(point, boundary));

	return { points, areas: calculateBurntAreas(points) };
};

const calculateBurntAreas = (points) => {
	if (points.length < 3) return null;

	const clustered = turf.clustersDbscan(turf.featureCollection(points), 15, { minPoints: 3 });
	const clusters = clustered.features.reduce((acc, feature) => {
		const id = feature.properties.cluster;
		if (id !== undefined) {
			(acc[id] = acc[id] || []).push(feature);
		}
		return acc;
	}, {});

	const areaPolygons = Object.values(clusters).map(clusterPoints => {
		const buffers = clusterPoints.map(point => turf.buffer(point, 1, { units: 'kilometers' }));
		const union = turf.union(turf.featureCollection(buffers));
		const bufferedUnion = turf.buffer(union, 1, { units: 'kilometers' });
		return turf.buffer(bufferedUnion, -1, { units: 'kilometers' });
	}).filter(Boolean);

	return areaPolygons.length > 0 ? turf.featureCollection(areaPolygons) : null;
};

const getRiskColor = rcm => ({
	1: '#509E2F', 2: '#FFE900', 3: '#E87722', 4: '#CB333B', 5: '#6F263D'
}[rcm] || '#FFFFFF');

const handlers = {
	initData: async ({ url }) => {
		self.postMessage({ type: 'progress', message: 'A carregar dados geográficos...' });
		workerPortugalGeometry = await fetchWithRetry(`${url}json/portugal.json`);
		workerConcelhosGeoJSON = await fetchWithRetry(`${url}json/concelhos.json`);
		self.postMessage({ type: 'initDataComplete' });
	},

	satelliteData: async ({ dayRange }) => {
		self.postMessage({ type: 'progress', message: 'A obter dados de satélite...' });
		if (!workerPortugalGeometry) {
			self.postMessage({ type: 'error', message: 'Geometria de Portugal não carregada.' });
			return;
		}

		const boundary = turf.feature(workerPortugalGeometry.geometries[0]);
		const bbox = turf.bbox(boundary);
		const time = `${new Date().setDate(now.getDate() - dayRange)} - ${now.getTime()}`;
		const baseParams = new URLSearchParams({
			returnGeometry: true, time, outSR: 4326, outFields: '*', inSR: 4326,
			geometry: JSON.stringify({
				xmin: bbox[0], ymin: bbox[1], xmax: bbox[2], ymax: bbox[3],
				spatialReference: { wkid: 4326 },
			}),
			geometryType: 'esriGeometryEnvelope', spatialRel: 'esriSpatialRelIntersects', f: 'geojson',
		});

		const urls = {
			modis: `https://services9.arcgis.com/RHVPKKiFTONKtxq3/ArcGIS/rest/services/MODIS_Thermal_v1/FeatureServer/0/query?${baseParams}`,
			viirs: `https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer/0/query?${baseParams}`,
		};

		const results = {};
		for (const [key, url] of Object.entries(urls)) {
			self.postMessage({ type: 'progress', message: `A obter dados ${key.toUpperCase()}...` });
			const features = await fetchWithRetry(url);
			results[key] = features ? processFirePoints(features, boundary) : null;
		}

		if (Object.values(results).every(res => !res)) {
			self.postMessage({ type: 'error', message: 'Nenhum dado de satélite recente encontrado.' });
		} else {
			self.postMessage({ type: 'satelliteDataComplete', data: results });
		}
	},

	riskData: async () => {
		self.postMessage({ type: 'progress', message: 'A obter dados de Risco...' });
		if (!workerConcelhosGeoJSON) {
			self.postMessage({ type: 'error', message: 'GeoJSON dos Concelhos não carregado.' });
			return;
		}

		const riskUrl = 'https://corsproxy.io/?url=https://www.ipma.pt/en/riscoincendio/rcm.pt/';
		const response = await fetch(riskUrl);
		const text = await response.text();
		const pattern = /rcmF\[\d+\]\s*=\s*(\{\s*[\s\S]*?\s*});/g;
		const matches = [...text.matchAll(pattern)];
		const riskData = matches.map(([, data]) => JSON.parse(data.trim()));

		const riskLayers = riskData.reduce((acc, data) => {
			if (data) {
				const date = new Date(data.dataPrev).toLocaleDateString();
				acc[date] = {
					type: 'FeatureCollection',
					features: workerConcelhosGeoJSON.features.map(f => ({
						...f,
						properties: {
							...f.properties,
							rcm: data.local[f.properties.dtmn]?.data?.rcm,
							fillColor: getRiskColor(data.local[f.properties.dtmn]?.data?.rcm),
						},
					})),
				};
			}
			return acc;
		}, {});

		if (Object.keys(riskLayers).length > 0) {
			self.postMessage({ type: 'riskDataComplete', data: riskLayers });
		} else {
			self.postMessage({ type: 'error', message: 'Nenhuma camada de risco pôde ser carregada.' });
		}
	},

	firesData: async () => {
		self.postMessage({ type: 'progress', message: 'A obter novos dados de incêndios...' });

		const url = 'https://api.fogos.pt/v2/incidents/active';
		const response = await fetchWithRetry(url);

		if (!response?.success) {
			self.postMessage({ type: 'error', message: 'Falha na obtenção de dados de incêndios.' });
			return;
		}

		const processedFires = response.data.map(properties => {
			const start = new Date(properties.created.sec);
			const timeElapsed = (now - start) / 3600000;
			return {
				id: properties.id,
				lat: properties.lat,
				lng: properties.lng,
				statusCode: properties.statusCode,
				man: properties.man,
				aerial: properties.aerial,
				terrain: properties.terrain,
				location: properties.location,
				natureza: properties.natureza,
				status: properties.status,
				startDate: new Date(properties.dateTime.sec * 1000).toLocaleString(),
				updated: new Date(properties.updated.sec * 1000).toLocaleString(),
				important: properties.status === 'Em Curso' && properties.terrain > 15 && timeElapsed >= 3,
			};
		});

		self.postMessage({ type: 'fireDataComplete', data: processedFires });
	},
};

self.onmessage = async ({ data }) => {
	const handler = handlers[data.type];
	if (handler) {
		try {
			await handler(data);
		} catch (err) {
			console.error(err);
			self.postMessage({ type: 'error', message: `Ocorreu um erro no worker: ${err.message}` });
		}
	}
};
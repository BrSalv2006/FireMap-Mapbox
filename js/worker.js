importScripts('https://unpkg.com/@turf/turf/turf.min.js');
let workerPortugalGeometry;
let workerConcelhosGeoJSON;

async function fetchWithRetry(url, options = {}, retries = 3, delay = 1000) {
	for (let i = 0; i < retries; i++) {
		try {
			const response = await fetch(url, options);
			if (!response.ok) {
				if (response.status === 429 && i < retries - 1) {
					await new Promise((resolve) => setTimeout(resolve, delay * 2 ** i));
					continue;
				}
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			return await response.json();
		} catch (error) {
			if (i === retries - 1) {
				throw error;
			}
			await new Promise((resolve) => setTimeout(resolve, delay * 2 ** i));
		}
	}
}

function processFirePoints(fireFeatures, boundary) {
	const points = fireFeatures.features.map((f) => {
		const p = f.properties;
		return turf.point(f.geometry.coordinates, {
			brightness: p.BRIGHTNESS || p.bright_ti4, acq_date: new Date(p.ACQ_DATE || p.acq_time).toLocaleString(), satellite: {
				A: 'Aqua', T: 'Terra'
			}[p.SATELLITE] || p.satellite, confidence: {
				nominal: 'Normal', low: 'Baixa', high: 'Alta'
			}[p.confidence] || p.CONFIDENCE, daynight: (p.DAYNIGHT || p.daynight) === 'D' ? 'Dia' : 'Noite', frp: p.FRP || p.frp
		});
	}).filter((point) => !boundary || turf.booleanPointInPolygon(point, boundary));
	return {
		points, areas: calculateBurntAreas(points)
	};
}

function calculateBurntAreas(points) {
	if (points.length < 3) {
		return null;
	}
	const clustered = turf.clustersDbscan(turf.featureCollection(points), 15, {
		minPoints: 3
	});
	const clusters = clustered.features.reduce((acc, feature) => {
		const id = feature.properties.cluster;
		if (id !== undefined) {
			(acc[id] = acc[id] || []).push(feature);
		}
		return acc;
	}, {});
	const areaPolygons = Object.values(clusters).map((clusterPoints) => {
		const buffers = clusterPoints.map((point) => turf.buffer(point, 1, {
			units: 'kilometers'
		}));
		return turf.buffer(turf.buffer(turf.union(turf.featureCollection(buffers)), 1, {
			units: 'kilometers'
		}), -1, {
			units: 'kilometers'
		});
	}).filter(Boolean);
	return areaPolygons.length > 0 ? turf.featureCollection(areaPolygons) : null;
}

const getRiskColor = (rcm) => ({
	1: '#509E2F', 2: '#FFE900', 3: '#E87722', 4: '#CB333B', 5: '#6F263D'
}[rcm] || '#FFFFFF');

async function handleInitData({
	url
}) {
	self.postMessage({
		type: 'progress', message: 'A carregar dados geográficos...'
	});
	[workerPortugalGeometry, workerConcelhosGeoJSON] = await Promise.all([fetchWithRetry(`${url}/json/portugal.json`), fetchWithRetry(`${url}/json/concelhos.json`)]);
	self.postMessage({
		type: 'initDataComplete'
	});
}

async function handleSatelliteData({
	dayRange
}) {
	self.postMessage({
		type: 'progress', message: 'A obter dados de satélite...'
	});
	if (!workerPortugalGeometry) {
		return self.postMessage({
			type: 'error', message: 'Geometria de Portugal não carregada.'
		});
	}
	const boundary = turf.feature(workerPortugalGeometry.features[0].geometry);
	const bbox = turf.bbox(boundary);
	const time = `${Date.now() - dayRange * 86400000},${Date.now()}`;
	const baseParams = new URLSearchParams({
		returnGeometry: true, time, outSR: 4326, outFields: '*', inSR: 4326, geometry: JSON.stringify({
			xmin: bbox[0], ymin: bbox[1], xmax: bbox[2], ymax: bbox[3], spatialReference: {
				wkid: 4326
			}
		}), geometryType: 'esriGeometryEnvelope', spatialRel: 'esriSpatialRelIntersects', f: 'geojson'
	});
	const urls = {
		modis: `https://services9.arcgis.com/RHVPKKiFTONKtxq3/ArcGIS/rest/services/MODIS_Thermal_v1/FeatureServer/0/query?${baseParams}`, viirs: `https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer/0/query?${baseParams}`
	};
	const results = {};
	for (const [key, url] of Object.entries(urls)) {
		self.postMessage({
			type: 'progress', message: `A obter dados ${key.toUpperCase()}...`
		});
		const features = await fetchWithRetry(url);
		results[key] = features ? processFirePoints(features, boundary) : null;
	}
	if (!results.modis && !results.viirs) {
		self.postMessage({
			type: 'error', message: 'Nenhum dado de satélite recente encontrado.'
		});
	} else {
		self.postMessage({
			type: 'satelliteResult', data: results
		});
	}
}

async function handleRiskData() {
	self.postMessage({
		type: 'progress', message: 'A obter dados de Risco...'
	});
	if (!workerConcelhosGeoJSON) {
		return self.postMessage({
			type: 'error', message: 'GeoJSON dos Concelhos não carregado.'
		});
	}
	const riskUrls = ['https://api.ipma.pt/open-data/forecast/meteorology/rcm/rcm-d0.json', 'https://api.ipma.pt/open-data/forecast/meteorology/rcm/rcm-d1.json'];
	const riskLayers = {};
	const responses = await Promise.all(riskUrls.map((url) => fetchWithRetry(url).catch(() => null)));
	responses.forEach((data) => {
		if (data) {
			const date = new Date(data.dataPrev).toLocaleDateString();
			riskLayers[`Risco ${date}`] = {
				type: 'FeatureCollection', features: workerConcelhosGeoJSON.features.map((f) => ({
					...f, properties: {
						...f.properties, rcm: data.local[f.properties.dtmn]?.data?.rcm, fillColor: getRiskColor(data.local[f.properties.dtmn]?.data?.rcm)
					}
				}))
			};
		}
	});
	if (Object.keys(riskLayers).length > 0) {
		self.postMessage({
			type: 'riskResult', data: riskLayers
		});
	} else {
		self.postMessage({
			type: 'error', message: 'Nenhuma camada de risco pôde ser carregada.'
		});
	}
}

async function handleFiresData() {
	self.postMessage({
		type: 'progress', message: 'A obter novos dados de incêndios...'
	});
	const url = 'https://prociv-agserver.geomai.mai.gov.pt/arcgis/rest/services/Ocorrencias_Base/FeatureServer/0/query';
	const params = new URLSearchParams({
		where: 'CodNatureza IN(3105, 3103, 3101)', outSR: 4326, outFields: '*', f: 'geojson'
	});
	const data = await fetchWithRetry(`${url}?${params}`);
	if (!data?.features) {
		return self.postMessage({
			type: 'error', message: `Falha na obtenção de dados de incêndios.`
		});
	}
	const statusMap = {
		'Despacho de 1.º Alerta': 4, 'Chegada ao TO': 6, 'Em Curso': 5, 'Em Resolução': 7, 'Em Conclusão': 8, Vigilância: 9, Encerrada: 10, 'Falso Alarme': 11, 'Falso Alerta': 12, Despacho: 3, Conclusão: 8
	};
	const processedFires = data.features.map(({properties: p}) => ({
		id: p.Numero, lat: p.Latitude, lng: p.Longitude, statusCode: statusMap[p.EstadoOcorrencia] || 0, man: p.Operacionais, aerial: p.NumeroMeiosAereosEnvolvidos, terrain: p.NumeroMeiosTerrestresEnvolvidos, location: `${p.Concelho}, ${p.Freguesia}, ${p.Localidade}`, natureza: p.Natureza, status: p.EstadoOcorrencia, startDate: new Date(p.DataInicioOcorrencia).toLocaleString(), updated: new Date(p.DataDosDados).toLocaleString(), important: p.NumeroMeiosAereosEnvolvidos > 0 || p.Operacionais > 50
	}));
	self.postMessage({
		type: 'firesResult', data: processedFires
	});
}

self.onmessage = async ({data}) => {
	try {
		switch (data.type) {
			case 'initData':
				await handleInitData(data);
				break;
			case 'satelliteData':
				await handleSatelliteData(data);
				break;
			case 'riskData':
				await handleRiskData(data);
				break;
			case 'firesData':
				await handleFiresData(data);
				break;
		}
	} catch (err) {
		console.log(err)
		self.postMessage({
			type: 'error', message: `Ocorreu um erro no worker: ${err.message}`
		});
	}
};
importScripts('https://unpkg.com/@turf/turf/turf.min.js');

let workerPortugalGeometry;
let workerConcelhosGeoJSON;

async function fetchWithRetry(url, options = {}, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                if (response.status === 429 && i < retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
                    continue;
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data;
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
        }
    }
}

function processFirePoints(fireFeatures, boundaryGeometry) {
    const satelliteData = { points: [], areas: null };
    fireFeatures.features.forEach(f => {
        const props = f.properties;
        const acqDate = props.ACQ_DATE || props.acq_time;
        const date = new Date(acqDate).toLocaleString();

        const confidenceMap = { 'nominal': 'Normal', 'low': 'Baixa', 'high': 'Alta' };
        const confidence = confidenceMap[props.confidence] || props.CONFIDENCE;

        const satelliteMap = { 'A': 'Aqua', 'T': 'Terra' };
        const satellite = satelliteMap[props.SATELLITE] || props.satellite;

        const properties = {
            brightness: props.BRIGHTNESS || props.bright_ti4,
            acq_date: date,
            satellite: satellite,
            confidence: confidence,
            daynight: (props.DAYNIGHT || props.daynight) === 'D' ? 'Dia' : 'Noite',
            frp: props.FRP || props.frp,
        };
        const firePoint = turf.point(f.geometry.coordinates, properties);

        if (!boundaryGeometry || turf.booleanPointInPolygon(firePoint, boundaryGeometry)) {
            satelliteData.points.push(firePoint);
        }
    });
    return satelliteData;
}

function calculateBurntAreas(satelliteData) {
    if (satelliteData.points.length < 3) return;

    const pointsForClustering = turf.featureCollection(satelliteData.points);
    const clustered = turf.clustersDbscan(pointsForClustering, 15, { minPoints: 3 });

    const clusters = {};
    turf.featureEach(clustered, (feature) => {
        const clusterId = feature.properties.cluster;
        if (clusterId !== undefined) {
            if (!clusters[clusterId]) clusters[clusterId] = [];
            clusters[clusterId].push(feature);
        }
    });

    const areaPolygons = [];
    for (const clusterId in clusters) {
        const clusterPoints = clusters[clusterId];
        if (clusterPoints.length > 0) {
            const buffers = clusterPoints.map(point => turf.buffer(point, 1, { units: 'kilometers' }));
            let mergedArea = turf.union(turf.featureCollection(buffers));

            if (mergedArea) {
                let smoothedArea = turf.buffer(mergedArea, 1, { units: 'kilometers' });
                if (smoothedArea) smoothedArea = turf.buffer(smoothedArea, -1, { units: 'kilometers' });
                if (smoothedArea) areaPolygons.push(smoothedArea);
            }
        }
    }
    if (areaPolygons.length > 0) {
        satelliteData.areas = turf.featureCollection(areaPolygons);
    }
}

function getRiskColor(d) {
    if (d === 1) return '#509e2f';
    if (d === 2) return '#ffe900';
    if (d === 3) return '#e87722';
    if (d === 4) return '#cb333b';
    if (d === 5) return '#6f263d';
    return 'rgb(255, 255, 255)';
}

self.onmessage = async function (e) {
    const { type, url, dayRange } = e.data;

    try {
        if (type === 'initData') {
            self.postMessage({ type: 'progress', message: 'A carregar dados geográficos...' });
            workerPortugalGeometry = await fetchWithRetry(`${url}/json/portugal.json`);
            workerConcelhosGeoJSON = await fetchWithRetry(`${url}/json/concelhos.json`)
            self.postMessage({ type: 'initDataComplete' });
        } else if (type === 'satelliteData') {
            self.postMessage({ type: 'progress', message: `A obter dados de satélite...` });

            if (!workerPortugalGeometry?.geometries?.[0]) {
                self.postMessage({ type: 'error', message: "Geometria de Portugal não carregada. Não é possível obter dados de satélite." });
                return;
            }

            const featureGeometry = turf.feature(workerPortugalGeometry.geometries[0]);
            const combinedBbox = turf.bbox(featureGeometry);
            const endDate = new Date().getTime();
            const startDate = endDate - (dayRange * 86400000);

            const satelliteBaseParams = {
                returnGeometry: true,
                time: `${startDate}, ${endDate}`,
                outSR: 4326,
                outFields: '*',
                inSR: 4326,
                geometry: JSON.stringify({
                    xmin: combinedBbox[0],
                    ymin: combinedBbox[1],
                    xmax: combinedBbox[2],
                    ymax: combinedBbox[3],
                    spatialReference: { "wkid": 4326 }
                }),
                geometryType: 'esriGeometryEnvelope',
                spatialRel: 'esriSpatialRelIntersects',
                f: 'geojson'
            };

            const satelliteLayers = {};

            self.postMessage({ type: 'progress', message: 'A obter dados MODIS...' });
            const modisFeatures = await fetchWithRetry(`https://services9.arcgis.com/RHVPKKiFTONKtxq3/ArcGIS/rest/services/MODIS_Thermal_v1/FeatureServer/0/query?${new URLSearchParams(satelliteBaseParams)}`);
            if (modisFeatures) {
                self.postMessage({ type: 'progress', message: 'A processar dados MODIS...' });
                const processedModisData = processFirePoints(modisFeatures, featureGeometry);
                calculateBurntAreas(processedModisData);
                satelliteLayers.modis = processedModisData;
            } else {
                self.postMessage({ type: 'progress', message: "Nenhum dado MODIS recente encontrado." });
                satelliteLayers.modis = null;
            }

            self.postMessage({ type: 'progress', message: 'A obter dados VIIRS...' });
            const viirsFeatures = await fetchWithRetry(`https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer/0/query?${new URLSearchParams(satelliteBaseParams)}`);
            if (viirsFeatures) {
                self.postMessage({ type: 'progress', message: 'A processar dados VIIRS...' });
                const processedViirsData = processFirePoints(viirsFeatures, featureGeometry);
                calculateBurntAreas(processedViirsData);
                satelliteLayers.viirs = processedViirsData;
            } else {
                self.postMessage({ type: 'progress', message: "Nenhum dado VIIRS recente encontrado." });
                satelliteLayers.viirs = null;
            }

            if (!satelliteLayers.modis && !satelliteLayers.viirs) {
                self.postMessage({ type: 'error', message: "Nenhum dado de satélite recente encontrado." });
            } else {
                self.postMessage({ type: 'satelliteResult', data: satelliteLayers });
            }
        } else if (type === 'riskData') {
            if (!workerConcelhosGeoJSON) {
                self.postMessage({ type: 'error', message: "GeoJSON dos Concelhos não carregado. Não é possível adicionar camadas de risco." });
                return;
            }
            const riskLayers = {};
            self.postMessage({ type: 'progress', message: 'A obter dados de Risco...' });

            const riskUrls = [
                'https://api.ipma.pt/open-data/forecast/meteorology/rcm/rcm-d0.json',
                'https://api.ipma.pt/open-data/forecast/meteorology/rcm/rcm-d1.json',
            ];

            const riskDataResponses = await Promise.all(riskUrls.map(url => fetchWithRetry(url)));

            riskDataResponses.forEach((dataResponse, index) => {
                if (dataResponse) {
                    const date = new Date(dataResponse.dataPrev);
                    const geoJson = {
                        type: 'FeatureCollection',
                        features: workerConcelhosGeoJSON.features.map(feature => ({
                            ...feature,
                            properties: {
                                ...feature.properties,
                                rcm: dataResponse.local[feature.properties.DICO]?.data?.rcm,
                                fillColor: getRiskColor(dataResponse.local[feature.properties.DICO]?.data?.rcm)
                            }
                        }))
                    };
                    riskLayers[`Risco ${date.toLocaleDateString()}`] = geoJson;
                } else {
                    self.postMessage({
                        type: 'error',
                        message: `Falha ao carregar dados de risco de ${riskUrls[index]}: ${dataResponse.message}`
                    });
                }
            });

            if (Object.keys(riskLayers).length > 0) {
                self.postMessage({ type: 'riskResult', data: riskLayers });
            } else {
                self.postMessage({ type: 'error', message: "Nenhuma camada de risco pôde ser carregada." });
            }
        } else if (type === 'firesData') {
            self.postMessage({ type: 'progress', message: 'A obter novos dados de incêndios...' });
            try {
                const firesBaseParams = {
                    where: 'CodNatureza IN(3105, 3103, 3101)',
                    outSR: 4326,
                    outFields: '*',
                    f: 'geojson'
                };
                const url = 'https://prociv-agserver.geomai.mai.gov.pt/arcgis/rest/services/Ocorrencias_Base/FeatureServer/0/query';
                const data = await fetchWithRetry(`${url}?${new URLSearchParams(firesBaseParams)}`);

                if (data) {
                    const statusNameToCode = {
                        "Despacho de 1.º Alerta": 4,
                        "Chegada ao TO": 6,
                        "Em Curso": 5,
                        "Em Resolução": 7,
                        "Em Conclusão": 8,
                        "Vigilância": 9,
                        "Encerrada": 10,
                        "Falso Alarme": 11,
                        "Falso Alerta": 12,
                        "Despacho": 3,
                        "Conclusão": 8
                    };

                    const processedFires = data.features.map(fire => {
                        const p = fire.properties;
                        const fireData = {
                            id: p.Numero,
                            lat: p.Latitude,
                            lng: p.Longitude,
                            statusCode: statusNameToCode[p.EstadoOcorrencia] || 0,
                            man: p.Operacionais,
                            aerial: p.NumeroMeiosAereosEnvolvidos,
                            terrain: p.NumeroMeiosTerrestresEnvolvidos,
                            location: `${p.Concelho}, ${p.Freguesia}, ${p.Localidade}`,
                            natureza: p.Natureza,
                            startDate: new Date(p.DataInicioOcorrencia).toLocaleString(),
                            updated: new Date(p.DataDosDados).toLocaleString(),
                            status: p.EstadoOcorrencia,
                            important: (p.NumeroMeiosAereosEnvolvidos > 0 || p.Operacionais > 50)
                        };

                        return fireData;
                    });
                    self.postMessage({ type: 'firesResult', data: processedFires });
                } else {
                    self.postMessage({ type: 'error', message: `A chamada à API prociv-agserver.geomai.mai.gov.pt para novos incêndios não foi bem-sucedida: ${data.message}` });
                }
            } catch (error) {
                self.postMessage({ type: 'error', message: `Erro ao obter novos dados de incêndios: ${error.message}` });
            }
        }
    } catch (err) {
        self.postMessage({ type: 'error', message: `Ocorreu um erro no worker: ${err.message}` });
    }
};
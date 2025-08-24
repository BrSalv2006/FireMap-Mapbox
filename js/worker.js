importScripts('https://unpkg.com/@turf/turf/turf.min.js');

let workerPortugalGeometry;
let workerConcelhosGeoJSON;

const importanceFireData = {
    number: 0,
    topImportance: 0,
    average: 0
};

function calculateImportanceValue(data) {
    const date = new Date().getHours();
    let importance;

    if (date >= 20 || date <= 9) {
        importance = data.man * 1.5 + data.terrain * 4.5;
    } else {
        importance = data.man * 1 + data.terrain * 2.5 + data.aerial * 10;
    }

    importanceFireData.number += 1;
    if (importanceFireData.topImportance < importance) {
        importanceFireData.topImportance = importance;
    }

    importanceFireData.average = (importanceFireData.average * (importanceFireData.number - 1) + importance) / (importanceFireData.number);
    data.importance = importance;
}

async function fetchFireData(baseParams, satelliteType) {
    const apiEndpoints = {
        modis: 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/ArcGIS/rest/services/MODIS_Thermal_v1/FeatureServer/0/query',
        viirs: 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer/0/query'
    };
    try {
        const response = await fetch(`${apiEndpoints[satelliteType]}?${new URLSearchParams(baseParams)}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data && data.features ? data.features : [];
    } catch (error) {
        self.postMessage({
            type: 'error',
            message: `Falha ao obter dados ${satelliteType}: ${error.message}`
        });
        return [];
    }
}

function processFirePoints(fireFeatures, boundaryGeometry) {
    let satelliteData = { points: [], areas: null };
    fireFeatures.forEach(f => {
        const props = f.properties;
        const date = new Date(props.ACQ_DATE || props.acq_time);
        let confidence;
        if (props.confidence === 'nominal') {
            confidence = 'Normal';
        } else if (props.confidence === 'low') {
            confidence = 'Baixa';
        } else if (props.confidence === 'high') {
            confidence = 'Alta';
        } else {
            confidence = props.confidence;
        }
        let satellite;
        if (props.SATELLITE == 'A') {
            satellite = 'Aqua';
        } else if (props.SATELLITE == 'T') {
            satellite = 'Terra';
        }
        const properties = {
            brightness: props.BRIGHTNESS || props.bright_ti4,
            acq_date: date.toLocaleString(),
            satellite: satellite || props.satellite,
            confidence: props.CONFIDENCE || confidence,
            daynight: (props.DAYNIGHT || props.daynight) == 'D' ? 'Dia' : 'Noite',
            frp: props.FRP || props.frp,
        };
        const firePoint = turf.point(f.geometry.coordinates, properties);
        let pointInsideBoundary = true;
        if (boundaryGeometry) {
            pointInsideBoundary = turf.booleanPointInPolygon(firePoint, boundaryGeometry);
        }
        if (pointInsideBoundary) {
            satelliteData.points.push(firePoint);
        }
    });
    return satelliteData;
}

function calculateBurntAreas(satelliteData) {
    if (satelliteData.points.length < 3);
    const pointsForClustering = turf.featureCollection(satelliteData.points);
    const clustered = turf.clustersDbscan(pointsForClustering, 15, {
        minPoints: 3
    });
    const clusters = {};
    turf.featureEach(clustered, (feature) => {
        const clusterId = feature.properties.cluster;
        if (clusterId === undefined) return;
        if (!clusters[clusterId]) clusters[clusterId] = [];
        clusters[clusterId].push(feature);
    });
    const areaPolygons = [];
    for (const clusterId in clusters) {
        const clusterPoints = clusters[clusterId];
        if (clusterPoints.length > 0) {
            const buffers = clusterPoints.map(point => turf.buffer(point, 1, {
                units: 'kilometers'
            }));

            let mergedArea = turf.union(turf.featureCollection(buffers));
            if (mergedArea) {
                let smoothedArea = turf.buffer(mergedArea, 1, {
                    units: 'kilometers'
                });
                if (smoothedArea) {
                    smoothedArea = turf.buffer(smoothedArea, -1, {
                        units: 'kilometers'
                    });
                }
                if (smoothedArea) {
                    areaPolygons.push(smoothedArea);
                }
            }
        }
    }
    if (areaPolygons.length > 0) {
        satelliteData.areas = turf.featureCollection(areaPolygons);
    }
}

function getColor(d) {
    switch (d) {
        case 1:
            return '#509e2f';
        case 2:
            return '#ffe900';
        case 3:
            return '#e87722';
        case 4:
            return '#cb333b';
        case 5:
            return '#6f263d';
        default:
            return 'rgb(255, 255, 255)';
    }
}

async function fetchRiskData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        return {
            success: false,
            message: `Falha ao obter dados de risco: ${error.message}`
        };
    }
}

self.onmessage = async function (e) {
    const {
        type,
        url,
        dayRange
    } = e.data;

    try {
        if (type === 'initData') {
            self.postMessage({
                type: 'progress',
                message: 'A carregar dados geográficos...'
            });
            const responsePortugal = await fetch(`${url}/json/portugal.json`);
            workerPortugalGeometry = await responsePortugal.json();
            const responseConcelhos = await fetch(`${url}/json/concelhos.json`);
            workerConcelhosGeoJSON = await responseConcelhos.json();
            self.postMessage({
                type: 'initDataComplete'
            });
        } else if (type === 'satelliteData') {
            self.postMessage({
                type: 'progress',
                message: `A obter dados de satélite...`
            });

            if (!workerPortugalGeometry || !workerPortugalGeometry.geometries[0]) {
                self.postMessage({
                    type: 'error',
                    message: "Geometria de Portugal não carregada. Não é possível obter dados de satélite."
                });
                return;
            }
            const featureGeometry = turf.feature(workerPortugalGeometry.geometries[0]);
            const combinedBbox = turf.bbox(featureGeometry);
            const endDate = new Date().getTime();
            const startDate = endDate - (dayRange * 86400000);
            const baseParams = {
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
                    spatialReference: {
                        "wkid": 4326
                    }
                }),
                geometryType: 'esriGeometryEnvelope',
                spatialRel: 'esriSpatialRelIntersects',
                f: 'geojson'
            };
            const satelliteLayers = {};
            self.postMessage({
                type: 'progress',
                message: 'A obter dados MODIS...'
            });
            const modisFeatures = await fetchFireData(baseParams, 'modis');
            if (modisFeatures.length > 0) {
                self.postMessage({
                    type: 'progress',
                    message: 'A processar dados MODIS...'
                });
                const processedModisData = processFirePoints(modisFeatures, featureGeometry);
                calculateBurntAreas(processedModisData);
                satelliteLayers.modis = processedModisData;
            } else {
                self.postMessage({
                    type: 'progress',
                    message: "Nenhum dado MODIS recente encontrado."
                });
                satelliteLayers.modis = null;
            }
            self.postMessage({
                type: 'progress',
                message: 'A obter dados VIIRS...'
            });
            const viirsFeatures = await fetchFireData(baseParams, 'viirs');
            if (viirsFeatures.length > 0) {
                self.postMessage({
                    type: 'progress',
                    message: 'A processar dados VIIRS...'
                });
                const processedViirsData = processFirePoints(viirsFeatures, featureGeometry);
                calculateBurntAreas(processedViirsData);
                satelliteLayers.viirs = processedViirsData;
            } else {
                self.postMessage({
                    type: 'progress',
                    message: "Nenhum dado VIIRS recente encontrado."
                });
                satelliteLayers.viirs = null;
            }
            if (!satelliteLayers.modis && !satelliteLayers.viirs) {
                self.postMessage({
                    type: 'error',
                    message: "Nenhum dado recente encontrado."
                });
            } else {
                self.postMessage({
                    type: 'satelliteResult',
                    data: satelliteLayers
                });
            }
        } else if (type === 'riskData') {
            if (!workerConcelhosGeoJSON) {
                self.postMessage({
                    type: 'error',
                    message: "GeoJSON dos Concelhos não carregado. Não é possível adicionar camadas de risco."
                });
                return;
            }
            const riskLayers = {};
            self.postMessage({
                type: 'progress',
                message: 'A obter dados de Risco...'
            });
            const riskUrls = [
                'https://api-dev.fogos.pt/v1/risk-today',
                'https://api-dev.fogos.pt/v1/risk-tomorrow',
                'https://api-dev.fogos.pt/v1/risk-after'
            ];
            for (const riskUrl of riskUrls) {
                const dataResponse = await fetchRiskData(riskUrl);
                if (dataResponse.success) {
                    const date = new Date(dataResponse.data.dataPrev);
                    const geoJson = {
                        type: 'FeatureCollection',
                        features: workerConcelhosGeoJSON.features.map(feature => {
                            const rcm = dataResponse.data.local[feature.properties.DICO]?.data?.rcm;
                            return {
                                ...feature,
                                properties: {
                                    ...feature.properties,
                                    rcm: rcm,
                                    fillColor: getColor(rcm)
                                }
                            };
                        })
                    };
                    riskLayers[`Risco ${date.toLocaleDateString()}`] = geoJson;
                } else {
                    self.postMessage({
                        type: 'error',
                        message: `Falha ao carregar dados de risco de ${riskUrl}: ${dataResponse.message}`
                    });
                }
            }
            if (Object.keys(riskLayers).length > 0) {
                self.postMessage({
                    type: 'riskResult',
                    data: riskLayers
                });
            } else {
                self.postMessage({
                    type: 'error',
                    message: "Nenhuma camada de risco pôde ser carregada."
                });
            }
        } else if (type === 'firesData') {
            self.postMessage({
                type: 'progress',
                message: 'A obter novos dados de incêndios...'
            });
            try {
                const response = await fetch('https://api-dev.fogos.pt/new/fires');
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();

                if (data.success) {
                    const processedFires = data.data.map(fire => {
                        calculateImportanceValue(fire);
                        return fire;
                    });
                    self.postMessage({
                        type: 'firesResult',
                        data: processedFires,
                        fireImportanceData: importanceFireData
                    });
                } else {
                    self.postMessage({
                        type: 'error',
                        message: `A chamada à API fogos.pt para novos incêndios não foi bem-sucedida: ${data.message}`
                    });
                }
            } catch (error) {
                self.postMessage({
                    type: 'error',
                    message: `Erro ao obter novos dados de incêndios: ${error.message}`
                });
            }
        }
    } catch (err) {
        self.postMessage({
            type: 'error',
            message: `Ocorreu um erro: ${err.message}`
        });
    }
};

mapboxgl.accessToken = 'pk.eyJ1IjoiYnJzYWx2MjAwNiIsImEiOiJjbWU0cnA2dGIwZGdzMmxxdHN3aXFla3FhIn0.olUF6dEN497eCVOaaMnBow';
const weatherApiToken = '89ae8b33d0bde5d8a89a7f5550e87869';

let map;
const loader = document.getElementById('loader');
const errorContainer = document.getElementById('error-container');
const isMobile = window.matchMedia("(max-width: 1024px)").matches;
let webWorkersFinished = { fire: false, satellite: false, risk: false };

const baseLayerButtons = {};
let overlayLayers = [];
const overlayButtons = {};

let riskLegend = null;
let weatherLegend = null;

let fireMarkers = {};
let detailsChart = null;
let baseLayerButtonsContainer, fireButtonsContainer, satelliteButtonsContainer, riskButtonsContainer, weatherButtonsContainer;

const baseLayers = [
    { name: 'Standard - Default - Dawn', layer: 'mapbox://styles/mapbox/standard', style: 'dawn', theme: 'default' },
    { name: 'Standard - Default - Day', layer: 'mapbox://styles/mapbox/standard', style: 'day', theme: 'default' },
    { name: 'Standard - Default - Dusk', layer: 'mapbox://styles/mapbox/standard', style: 'dusk', theme: 'default' },
    { name: 'Standard - Default - Night', layer: 'mapbox://styles/mapbox/standard', style: 'night', theme: 'default' },
    { name: 'Standard - Faded - Dawn', layer: 'mapbox://styles/mapbox/standard', style: 'dawn', theme: 'faded' },
    { name: 'Standard - Faded - Day', layer: 'mapbox://styles/mapbox/standard', style: 'day', theme: 'faded' },
    { name: 'Standard - Faded - Dusk', layer: 'mapbox://styles/mapbox/standard', style: 'dusk', theme: 'faded' },
    { name: 'Standard - Faded - Night', layer: 'mapbox://styles/mapbox/standard', style: 'night', theme: 'faded' },
    { name: 'Standard - Monochrome - Dawn', layer: 'mapbox://styles/mapbox/standard', style: 'dawn', theme: 'monochrome' },
    { name: 'Standard - Monochrome - Day', layer: 'mapbox://styles/mapbox/standard', style: 'day', theme: 'monochrome' },
    { name: 'Standard - Monochrome - Dusk', layer: 'mapbox://styles/mapbox/standard', style: 'dusk', theme: 'monochrome' },
    { name: 'Standard - Monochrome - Night', layer: 'mapbox://styles/mapbox/standard', style: 'night', theme: 'monochrome' },
    { name: 'Satellite - Dawn', layer: 'mapbox://styles/mapbox/standard-satellite', style: 'dawn' },
    { name: 'Satellite - Day', layer: 'mapbox://styles/mapbox/standard-satellite', style: 'day' },
    { name: 'Satellite - Dusk', layer: 'mapbox://styles/mapbox/standard-satellite', style: 'dusk' },
    { name: 'Satellite - Night', layer: 'mapbox://styles/mapbox/standard-satellite', style: 'night' }
];

const fireLayers = [
    { name: 'Despacho', id: 3, active: true },
    { name: 'Despacho de 1º Alerta', id: 4, active: true },
    { name: 'Em Curso', id: 5, active: true },
    { name: 'Chegada ao TO', id: 6, active: true },
    { name: 'Em Resolução', id: 7, active: true },
    { name: 'Conclusão', id: 8, active: false },
    { name: 'Vigilância', id: 9, active: false },
    { name: 'Encerrada', id: 10, active: false },
    { name: 'Falso Alarme', id: 11, active: false },
    { name: 'Falso Alerta', id: 12, active: false }
];

const satelliteLayers = [
    { name: 'MODIS', id: 'modis' },
    { name: 'VIIRS', id: 'viirs' }
];

const weatherLayers = [
    { name: 'Temperatura do Ar (2m)', id: 'TA2' },
    { name: 'Temperatura do Ponto de Orvalho', id: 'TD2' },
    { name: 'Temperatura do Solo (0-10cm)', id: 'TS0' },
    { name: 'Temperatura do Solo (>10cm)', id: 'TS10' },
    { name: 'Pressão Atmosférica', id: 'APM' },
    { name: 'Vento (Velocidade & Direção)', id: 'WND' },
    { name: 'Velocidade Vento (10m)', id: 'WS10' },
    { name: 'Humidade Relativa', id: 'HRD0' },
    { name: 'Nebulosidade', id: 'CL' },
    { name: 'Precipitação Convectiva', id: 'PAC0' },
    { name: 'Intensidade Precipitação', id: 'PR0' },
    { name: 'Precipitação Acumulada', id: 'PA0' },
    { name: 'Precipitação Acumulada - Chuva', id: 'PAR0' },
    { name: 'Precipitação Acumulada - Neve', id: 'PAS0' },
    { name: 'Profundidade Neve', id: 'SD0' }
];

const dayNightLayers = [
    { name: 'Ciclo Dia/Noite', id: 'day-night' }
];

function deviceFlyTo(lng, lat) {
    if (isMobile) {
        map.flyTo({
            center: [lng, lat - 0.25], zoom: 9
        });
    } else {
        map.flyTo({
            center: [lng, lat], zoom: 9
        });
    }
}

function showErrorMessage(message) {
    const errorMessage = document.createElement('div');
    errorMessage.className = 'error-message';
    errorMessage.textContent = message;
    errorContainer.appendChild(errorMessage);
    setTimeout(() => errorMessage.remove(), 5000);
};

async function fetchDetails(id) {
    try {
        const response = await fetch(`https://api.fogos.pt/fires/data?id=${id}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const canvas = document.getElementById('fireChart');
        const ctx = canvas.getContext('2d');
        if (detailsChart) {
            detailsChart.destroy();
        }
        if (data.success && data.data && data.data.length) {
            const labels = data.data.map(d => d.label);
            const man = data.data.map(d => d.man);
            const terrain = data.data.map(d => d.terrain);
            const aerial = data.data.map(d => d.aerial);
            detailsChart = new Chart(ctx, {
                type: 'line', data: {
                    labels: labels, datasets: [{
                        label: 'Operacionais', data: man, fill: false, backgroundColor: '#EFC800', borderColor: '#EFC800', tension: 0.1
                    }, {
                        label: 'Terrestres', data: terrain, fill: false, backgroundColor: '#6D720B', borderColor: '#6D720B', tension: 0.1
                    }, {
                        label: 'Aéreos', data: aerial, fill: false, backgroundColor: '#4E88B2', borderColor: '#4E88B2', tension: 0.1
                    }]
                }, options: {
                    responsive: true, maintainAspectRatio: false, plugins: {
                        legend: {
                            display: true, position: 'top'
                        }
                    }, scales: {
                        x: {
                            beginAtZero: true
                        }, y: {
                            beginAtZero: true
                        }
                    }
                }
            });
            canvas.style.display = 'block';
        } else {
            canvas.style.display = 'none';
        }
    } catch (error) {
        console.error('Error fetching fire data for chart:', error);
        if (detailsChart) {
            detailsChart.destroy();
        }
        document.getElementById('fireChart').style.display = 'none';
        showErrorMessage(`Erro ao carregar dados do gráfico: ${error.message}`);
    }

    [
        { url: `https://fogos.pt/views/extra/${id}`, selector: '.f-extra', toggleClass: 'active' },
        { url: `https://fogos.pt/views/status/${id}`, selector: '.f-status' },
        { url: `https://fogos.pt/views/meteo/${id}`, selector: '.f-meteo' },
        { url: `https://fogos.pt/views/risk/${id}`, selector: '.f-danger', toggleClass: 'active' }
    ].forEach(async ({ url, selector, toggleClass = null }) => {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            let data = await response.text();
            const element = document.querySelector(selector);
            const parentRow = element ? element.closest('.card') : null;
            if (data && (data.trim().length > 2)) {
                element.innerHTML = data.replace(/\s<img[\s\S]*\/>/, '');
                if (parentRow && toggleClass) {
                    parentRow.classList.add(toggleClass);
                }
            } else {
                element.innerHTML = '';
                if (parentRow && toggleClass) {
                    parentRow.classList.remove(toggleClass);
                }
            }
        } catch (error) {
            console.error(`Error fetching data for ${selector}:`, error);
            showErrorMessage(`Erro ao carregar dados para ${selector}: ${error.message}`);
            const element = document.querySelector(selector);
            const parentRow = element ? element.closest('.row') : null;
            if (element) {
                element.innerHTML = '';
            }
            if (parentRow && toggleClass) {
                parentRow.classList.remove(toggleClass);
            }
        }
    });
}

function calculateDayNightPolygon() {
    const SunCalc = new sunCalc();
    SunCalc.calculate();

    function latitude(lng) {
        return SunCalc.rad2deg(Math.atan(-Math.cos(SunCalc.deg2rad(SunCalc.observer_hour_angle(SunCalc.data.nu, lng, SunCalc.data.alpha))) / Math.tan(SunCalc.deg2rad(SunCalc.data.delta))));
    }

    let latLngs = [];
    let startMinus = -180;
    for (let i = 0; i <= 360; i++) {
        let lng = startMinus + i;
        let lat = latitude(lng);
        latLngs[i + 1] = [lat, lng];
    }
    if (SunCalc.data.delta < 0) {
        latLngs[0] = [90, startMinus];
        latLngs[latLngs.length] = [90, 180];
    } else {
        latLngs[0] = [-90, startMinus];
        latLngs[latLngs.length] = [-90, 180];
    }
    return {
        'type': 'FeatureCollection', 'features': [{
            'type': 'Feature', 'properties': {}, 'geometry': {
                'type': 'Polygon', 'coordinates': [[...latLngs.map(latLng => {
                    return [latLng[1], latLng[0]];
                }), [latLngs[0][1], latLngs[0][0]]].slice().reverse()]
            }
        }]
    };
}

function fetchFire() {
    fireLayers.forEach((layer) => {
        overlayLayers.push({ name: layer.name, id: layer.id, icon: 'img/fire.png', active: layer.active, category: 'fire' });
    });

    let fireWorker = new Worker('js/worker.js');
    fireWorker.postMessage({ type: 'fireData' });
    fireWorker.onmessage = (event) => {
        const { type, data } = event.data;
        if (type === 'fireDataComplete') {
            loader.innerText = 'A adicionar dados dos incêndios...';
            for (const statusCode in fireMarkers) {
                fireMarkers[statusCode].forEach(marker => marker.remove());
            }
            fireMarkers = {};
            data.forEach(fire => {
                const statusConfig = fireLayers.find(layer => layer.id === fire.statusCode);
                if (!statusConfig) {
                    console.warn(`Unknown fire status code: ${fire.statusCode}`);
                    return;
                }

                if (fire.lat && fire.lng) {
                    let fireClass;
                    if (fire.important && fire.statusCode >= 7) {
                        fireClass = 'dot status-99-r';
                    } else if (fire.important) {
                        fireClass = 'dot status-99';
                    } else {
                        fireClass = `dot status-${fire.statusCode}`;
                    }

                    const element = document.createElement('div');
                    element.className = 'fire-marker';
                    element.innerHTML = `<i class='${fireClass}' id='fire-${fire.id}'></i>`;
                    element.style.width = '22px';
                    element.style.height = '22px';


                    const layer = fireLayers.find(layer => layer.id === fire.statusCode);
                    if (!layer.active) {
                        element.style.display = 'none';
                    }

                    const marker = new mapboxgl.Marker({
                        element: element, anchor: 'center'
                    }).setLngLat([fire.lng, fire.lat]).addTo(map);

                    if (!fireMarkers[fire.statusCode]) {
                        fireMarkers[fire.statusCode] = [];
                    }
                    fireMarkers[fire.statusCode].push(marker);

                    element.addEventListener('click', async (event) => {
                        event.stopPropagation();

                        const newActiveFire = element.querySelector('.dot');
                        const oldActiveFire = document.querySelector('.dot-active');
                        if (oldActiveFire && oldActiveFire !== newActiveFire) {
                            oldActiveFire.classList.remove('dot-active');
                        }
                        newActiveFire.classList.add('dot-active');

                        deviceFlyTo(fire.lng, fire.lat);
                        document.querySelector('.f-local').innerHTML = fire.location;
                        document.querySelector('.f-man').textContent = fire.man;
                        document.querySelector('.f-aerial').textContent = fire.aerial;
                        document.querySelector('.f-terrain').textContent = fire.terrain;
                        document.querySelector('.f-location').innerHTML = `<a href='https://www.google.com/maps/search/${fire.lat},${fire.lng}' target='_blank' rel='noopener noreferrer'>${fire.lat},${fire.lng}</a>`;
                        document.querySelector('.f-nature').textContent = fire.natureza;
                        document.querySelector('.f-update').textContent = fire.updated;
                        document.querySelector('.f-start').textContent = fire.startDate;
                        await fetchDetails(fire.id);

                        document.body.classList.add('sidebar-open');
                        document.querySelector('.sidebar').classList.add('active');
                        window.history.pushState('fogo', '', `?fogo=${fire.id}`);
                    }, {
                        passive: true
                    });

                    const isActive = (new URLSearchParams(window.location.search)).get('fogo') === fire.id.toString();
                    if (isActive) {
                        element.click();
                    }
                }
            });
            webWorkersFinished.fire = true;
        }
    };
}

function fetchSatellite() {
    satelliteLayers.forEach((layer) => {
        overlayLayers.push({ name: layer.name, id: layer.id, icon: 'img/satellite.png', active: false, category: 'satellite', hotspotData: null, areaData: null });
    });

    let satelliteWorker = new Worker('js/worker.js');
    satelliteWorker.postMessage({ type: 'satelliteData', url: window.location.href.split('?')[0] });
    satelliteWorker.onmessage = (event) => {
        const { type, data } = event.data;
        if (type === 'satelliteDataComplete') {
            loader.innerText = 'A adicionar dados dos satélites...';
            satelliteLayers.forEach(satellite => {
                satellite.hotspotData = {
                    type: 'FeatureCollection', features: satellite.points || []
                };
                satellite.areaData = {
                    type: 'FeatureCollection', features: satellite.areas?.features || []
                };
            });

            data.forEach(({ satellite, data }) => {
                if (data) {
                    const hotspotSourceId = `${satellite}-hotspots-source`;
                    const areaSourceId = `${satellite}-areas-source`;
                    const hotspotLayerId = `${satellite}-hotspots`;
                    const areaLayerId = `${satellite}-areas`;
                    const hotspotFeatures = data.points || [];
                    const areaFeatures = (data.areas && data.areas.features) ? data.areas.features : [];

                    overlayLayers.find(layer => layer.id === satellite).hotspotData = {
                        type: 'FeatureCollection', features: hotspotFeatures
                    };
                    overlayLayers.find(layer => layer.id === satellite).areaData = {
                        type: 'FeatureCollection', features: areaFeatures
                    };

                    if (map.getSource(hotspotSourceId)) {
                        map.getSource(hotspotSourceId).setData({
                            type: 'FeatureCollection', features: hotspotFeatures
                        });
                    } else {
                        map.addSource(hotspotSourceId, {
                            type: 'geojson', data: {
                                type: 'FeatureCollection', features: hotspotFeatures
                            }
                        });
                        map.addLayer({
                            id: hotspotLayerId, type: 'circle', source: hotspotSourceId, paint: {
                                'circle-radius': 5, 'circle-color': '#FF0000', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 1, 'circle-opacity': 0.8
                            }, layout: {
                                'visibility': 'none'
                            }
                        });
                    }
                    if (map.getSource(areaSourceId)) {
                        map.getSource(areaSourceId).setData({
                            type: 'FeatureCollection', features: areaFeatures
                        });
                    } else {
                        map.addSource(areaSourceId, {
                            type: 'geojson', data: {
                                type: 'FeatureCollection', features: areaFeatures
                            }
                        });
                        map.addLayer({
                            id: areaLayerId, type: 'fill', source: areaSourceId, paint: {
                                'fill-color': '#FF0000', 'fill-opacity': 0.2, 'fill-outline-color': '#FF0000'
                            }, layout: {
                                'visibility': 'none'
                            }
                        });
                    }
                    map.on('click', hotspotLayerId, (e) => {
                        const p = e.features[0].properties;
                        const popupContent = `<b>Brilho:</b> ${p.brightness}K<br><b>Data, Hora:</b> ${p.acq_date}<br><b>Satélite:</b> ${p.satellite}<br><b>Confiança:</b> ${p.confidence}<br><b>Dia/Noite:</b> ${p.daynight}<br><b>PRF:</b> ${p.frp}MW`;
                        map.flyTo({
                            center: e.features[0].geometry.coordinates, zoom: 12
                        });
                        new mapboxgl.Popup().setLngLat(e.features[0].geometry.coordinates).setHTML(popupContent).addTo(map);
                    });
                    map.on('click', areaLayerId, (e) => {
                        new mapboxgl.Popup().setLngLat(e.lngLat).addTo(map);
                    });
                } else {
                    ['hotspots', 'areas'].forEach(layerPart => {
                        const layerId = `${satellite}-${layerPart}`;
                        const sourceId = `${layerId}-data`;
                        if (map.getLayer(layerId)) {
                            map.removeLayer(layerId);
                        }
                        if (map.getSource(sourceId)) {
                            map.removeSource(sourceId);
                        }
                    });
                }
            });
            webWorkersFinished.satellite = true;
        }
    };
}

function fetchRisk() {
    let riskWorker = new Worker('js/worker.js');
    riskWorker.postMessage({ type: 'riskData', url: window.location.href.split('?')[0] });
    riskWorker.onmessage = (event) => {
        const { type, data } = event.data;
        if (type === 'riskDataComplete') {
            loader.innerText = 'A adicionar camadas de risco...';
            data.forEach((layer) => {
                layer.id = layer.date.toLowerCase().replace(/[^a-z0-9]/g, '-');
                overlayLayers.push({ name: layer.id, id: `risk-${layer.id}`, icon: 'img/fire_risk.png', active: false, category: 'risk', sourceData: layer });
                if (!map.getSource(`risk-${layer.id}-source`)) {
                    map.addSource(`risk-${layer.id}-source`, {
                        type: 'geojson', data: layer
                    });
                }

                if (!map.getLayer(`risk-${layer.id}`)) {
                    map.addLayer({
                        id: `risk-${layer.id}`, type: 'fill', source: `risk-${layer.id}-source`, paint: {
                            'fill-color': ['get', 'fillColor'], 'fill-opacity': 0.6, 'fill-outline-color': '#666666'
                        }, layout: {
                            'visibility': 'none'
                        }
                    });
                }
            });
            webWorkersFinished.risk = true;
        }
    };
}

function fetchWeather() {
    weatherLayers.forEach((layer) => {
        overlayLayers.push({ name: layer.name, id: layer.id, icon: 'img/weather.png', active: false, category: 'weather' });
        if (!map.getSource(`weather-${layer.id}-source`)) {
            map.addSource(`weather-${layer.id}-source`, {
                type: 'raster', tiles: [`https://maps.openweathermap.org/maps/2.0/weather/${layer.id}/{z}/{x}/{y}?appid=${weatherApiToken}`], tileSize: 256
            });
        }

        if (!map.getLayer(`weather-${layer.id}`)) {
            map.addLayer({
                id: `weather-${layer.id}`, type: 'raster', source: `weather-${layer.id}-source`, paint: {
                    'raster-opacity': 0.7
                }, layout: {
                    'visibility': 'none'
                }
            });
        }
    });
}

function fetchDayNight() {
    dayNightLayers.forEach((layer) => {
        overlayLayers.push({ name: layer.name, id: layer.id, icon: 'img/day_night.png', active: false, category: 'day-night', sourceData: null });
    });

    const dayNightGeoJSON = calculateDayNightPolygon();
    overlayLayers.find(layer => layer.id === 'day-night').sourceData = dayNightGeoJSON;
    map.addSource('day-night-source', {
        type: 'geojson', data: dayNightGeoJSON
    });
    map.addLayer({
        id: 'day-night', type: 'fill', source: 'day-night-source', paint: {
            'fill-color': '#000000', 'fill-opacity': 0.4
        }, layout: {
            'visibility': 'none'
        }
    });
}

function addRiskLegend() {
    if (riskLegend) {
        riskLegend.remove();
    }
    const legendContainer = document.createElement('div');
    legendContainer.className = 'mapbox-legend mapbox-risk-legend';
    const labels = ['Reduzido', 'Moderado', 'Elevado', 'Muito Elevado', 'Máximo'];
    const colors = ['#509E2F', '#FFE900', '#E87722', '#CB333B', '#6F263D'];
    legendContainer.innerHTML += '<h4>Risco de Incêndio</h4>';
    labels.forEach((label, i) => {
        legendContainer.innerHTML += `<i style='background:${colors[i]}' class='${label.replace(' ', '.')}.'></i> ${label}<br>`;
    });
    map.getContainer().appendChild(legendContainer);
    riskLegend = legendContainer;
    if (weatherLegend) {
        weatherLegend.classList.remove('mapbox-weather-legend-alone');
        weatherLegend.classList.add('mapbox-weather-legend');
    }
}

function addWeatherLegend(id) {
    let weatherWorker = new Worker('js/worker.js');
    weatherWorker.postMessage({ type: 'weatherData', url: window.location.href.split('?')[0] });
    weatherWorker.onmessage = (event) => {
        const { type, data } = event.data;
        if (type === 'weatherDataComplete') {
            loader.innerText = 'A adicionar legenda meteorológica...';
            const legendData = data[id];
            if (weatherLegend) {
                weatherLegend.remove();
            }
            const legendContainer = document.createElement('div');
            legendContainer.className = riskLegend ? 'mapbox-legend mapbox-weather-legend' : 'mapbox-legend mapbox-weather-legend-alone';
            legendContainer.innerHTML += `<h4>${legendData.name}</h4>`;
            for (let i = 0; i < legendData.stops.length; i++) {
                const stop = legendData.stops[i];
                const nextStop = legendData.stops[i + 1];
                const label = nextStop ? `${stop.value} - ${nextStop.value} ${legendData.unit}` : `${stop.value} ${legendData.unit}+`;
                legendContainer.innerHTML += `<i style='background:${stop.color}'></i> ${label}<br>`;
            }
            map.getContainer().appendChild(legendContainer);
            weatherLegend = legendContainer;
        }
    };
}

const createCategoryDropdown = (title, parent) => {
    const dropdownContainer = document.createElement('div');
    dropdownContainer.className = 'layer-dropdown';

    const toggleButton = document.createElement('button');
    toggleButton.className = 'dropdown-toggle dropdown-toggle-button';
    toggleButton.innerHTML = `${title}`;

    const menu = document.createElement('div');
    menu.className = 'dropdown-menu';

    if (isMobile) {
        document.body.appendChild(menu);
        map.on('click', () => {
            menu.classList.remove('open');
            toggleButton.classList.remove('active');
        });
    } else {
        dropdownContainer.appendChild(menu);
    }

    toggleButton.addEventListener('click', (e) => {
        e.stopPropagation();

        if (isMobile) {
            const isOpen = menu.classList.contains('open');
            document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
            document.querySelectorAll('.dropdown-toggle-button.active').forEach(t => t.classList.remove('active'));

            if (!isOpen) {
                menu.classList.add('open');
                toggleButton.classList.add('active');
            }
        } else {
            document.querySelectorAll('.layer-dropdown.open').forEach(d => {
                if (d !== dropdownContainer) d.classList.remove('open');
            });
            dropdownContainer.classList.toggle('open');
        }
    });

    dropdownContainer.appendChild(toggleButton);
    parent.appendChild(dropdownContainer);
    return menu;
};

function initializeLayerBar() {
    const layerBar = document.getElementById('layer-bar');
    if (!layerBar) return;
    baseLayerButtonsContainer = createCategoryDropdown('Camadas Base', layerBar);
    fireButtonsContainer = createCategoryDropdown('Incêndios', layerBar);
    satelliteButtonsContainer = createCategoryDropdown('Satélite', layerBar);
    riskButtonsContainer = createCategoryDropdown('Risco de Incêndio', layerBar);
    weatherButtonsContainer = createCategoryDropdown('Meteorologia', layerBar);
    window.addEventListener('click', () => {
        document.querySelectorAll('.layer-dropdown.open').forEach(d => d.classList.remove('open'));
    });
}

function updateBaseLayerButtonState(activeLayerName) {
    for (const layerName in baseLayerButtons) {
        baseLayerButtons[layerName].classList.toggle('active', layerName === activeLayerName);
    }
}

function rebuildOverlayControls() {
    [fireButtonsContainer, satelliteButtonsContainer, riskButtonsContainer, weatherButtonsContainer].forEach(container => {
        container.innerHTML = '';
    });

    if (overlayButtons['day-night']) {
        overlayButtons['day-night'].remove();
    }

    for (const key in overlayButtons) {
        delete overlayButtons[key];
    }

    const layerBar = document.getElementById('layer-bar');
    overlayLayers.forEach(layer => {
        const button = document.createElement('button');
        button.classList.toggle('active', layer.active);
        button.dataset.category = layer.category;
        button.dataset.layerId = layer.id;

        button.addEventListener('click', () => {
            const { category, layerId } = button.dataset;
            if (category === 'fire') {
                layer.active = !layer.active;
                overlayButtons[layerId]?.classList.toggle('active', layer.active);
                if (fireMarkers[layerId]) {
                    fireMarkers[layerId].forEach(marker => {
                        marker.getElement().style.display = layer.active ? 'block' : 'none';
                    });
                }
            } else if (category === 'satellite') {
                layer.active = !layer.active;
                overlayButtons[layerId]?.classList.toggle('active', layer.active);
                if (map.getLayer(`${layer.id}-hotspots`)) {
                    map.setLayoutProperty(`${layer.id}-hotspots`, 'visibility', layer.active ? 'visible' : 'none');
                }
                if (map.getLayer(`${layer.id}-areas`)) {
                    map.setLayoutProperty(`${layer.id}-areas`, 'visibility', layer.active ? 'visible' : 'none');
                }
            } else if (category === 'risk') {
                overlayLayers.forEach(layer => {
                    if (layer.category === 'risk' && layer.id !== layerId) {
                        layer.active = false;
                        overlayButtons[layer.id]?.classList.toggle('active', false);
                        if (map.getLayer(layer.id)) {
                            map.setLayoutProperty(layer.id, 'visibility', 'none');
                        }
                    } else if (layer.id === layerId) {
                        layer.active = !layer.active;
                        overlayButtons[layer.id]?.classList.toggle('active', layer.active);
                        if (map.getLayer(layer.id)) {
                            map.setLayoutProperty(layer.id, 'visibility', layer.active ? 'visible' : 'none');
                        }
                    }
                });
            } else if (category === 'weather') {
                overlayLayers.forEach(layer => {
                    if (layer.category === 'weather' && layer.id !== layerId) {
                        layer.active = false;
                        overlayButtons[layer.id]?.classList.toggle('active', false);
                        if (map.getLayer(`weather-${layer.id}`)) {
                            map.setLayoutProperty(`weather-${layer.id}`, 'visibility', 'none');
                        }
                    } else if (layer.id === layerId) {
                        layer.active = !layer.active;
                        overlayButtons[layer.id]?.classList.toggle('active', layer.active);
                        if (map.getLayer(`weather-${layer.id}`)) {
                            map.setLayoutProperty(`weather-${layer.id}`, 'visibility', layer.active ? 'visible' : 'none');
                        }
                    }
                });
            } else if (category === 'day-night') {
                layer.active = !layer.active;
                overlayButtons[layer.id]?.classList.toggle('active', layer.active);
                if (map.getLayer(layer.id)) {
                    map.setLayoutProperty(layer.id, 'visibility', layer.active ? 'visible' : 'none');
                }
            }

            if (category === 'risk') {
                if (layer.active) {
                    addRiskLegend();
                } else if (riskLegend) {
                    riskLegend.remove();
                    riskLegend = null;
                    if (weatherLegend) {
                        weatherLegend.classList.remove('mapbox-weather-legend');
                        weatherLegend.classList.add('mapbox-weather-legend-alone');
                    }
                }
            } else if (category === 'weather') {
                if (layer.active) {
                    addWeatherLegend(layer.id);
                } else if (weatherLegend) {
                    weatherLegend.remove();
                    weatherLegend = null;
                }
            }
        }, {
            passive: true
        });
        const appendButton = (container) => {
            if (container) container.appendChild(button);
        };
        if (layer.category === 'fire') {
            button.innerHTML = `<img src='${layer.icon}' srcset='${layer.icon} 22w, ${layer.icon.replace(".png", "_33.png")} 33w' alt='layer icon'>${layer.name}`;
            appendButton(fireButtonsContainer);
        } else if (layer.category === 'satellite') {
            button.innerHTML = `<img src='${layer.icon}' srcset='${layer.icon} 22w, ${layer.icon.replace(".png", "_33.png")} 33w' alt='layer icon'>${layer.name}`;
            appendButton(satelliteButtonsContainer);
        } else if (layer.category === 'risk') {
            button.innerHTML = `<img src='${layer.icon}' srcset='${layer.icon} 22w, ${layer.icon.replace(".png", "_33.png")} 33w' alt='layer icon'>${layer.name}`;
            appendButton(riskButtonsContainer);
        } else if (layer.category === 'weather') {
            button.innerHTML = `<img src='${layer.icon}' srcset='${layer.icon} 22w, ${layer.icon.replace(".png", "_33.png")} 33w' alt='layer icon'>${layer.name}`;
            appendButton(weatherButtonsContainer);
        } else if (layer.category === 'day-night') {
            button.innerHTML = `<img src='${layer.icon}' srcset='${layer.icon} 18w, ${layer.icon.replace(".png", "_27.png")} 27w' alt='layer icon'>${layer.name}`;
            button.className = 'dropdown-toggle';
            button.classList.toggle('active', layer.active);
            layerBar.appendChild(button);
        }
        overlayButtons[layer.id] = button;
    });
}

function reapplyOverlayLayers() {
    overlayLayers.forEach(layer => {
        if (layer.category === 'fire') {
            if (fireMarkers[layer.id]) {
                fireMarkers[layer.id].forEach(marker => {
                    marker.getElement().style.display = layer.active ? 'block' : 'none';
                });
            }
        } else if (layer.category === 'satellite') {
            hotspotSource = `${layer.id}-hotspots-source`;
            hotspotLayerId = `${layer.id}-hotspots`;
            areaSourceId = `${layer.id}-areas-source`;
            areaLayerId = `${layer.id}-areas`;

            if (map.getSource(hotspotSource)) {
                map.getSource(hotspotSource).setData(layer.hotspotData);
            } else {
                map.addSource(hotspotSource, {
                    type: 'geojson', data: layer.hotspotData
                });
                map.addLayer({
                    id: hotspotLayerId, type: 'circle', source: hotspotSource, paint: {
                        'circle-radius': 5, 'circle-color': '#FF0000', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 1, 'circle-opacity': 0.8
                    }, layout: {
                        'visibility': 'none'
                    }
                });
            }
            if (map.getSource(areaSourceId)) {
                map.getSource(areaSourceId).setData(layer.areaData);
            } else {
                map.addSource(areaSourceId, {
                    type: 'geojson', data: layer.areaData
                });
                map.addLayer({
                    id: areaLayerId, type: 'fill', source: areaSourceId, paint: {
                        'fill-color': '#FF0000', 'fill-opacity': 0.2, 'fill-outline-color': '#FF0000'
                    }, layout: {
                        'visibility': 'none'
                    }
                });
            }

            if (map.getLayer(`${layer.id}-hotspots`)) {
                map.setLayoutProperty(`${layer.id}-hotspots`, 'visibility', layer.active ? 'visible' : 'none');
            }
            if (map.getLayer(`${layer.id}-areas`)) {
                map.setLayoutProperty(`${layer.id}-areas`, 'visibility', layer.active ? 'visible' : 'none');
            }
        } else if (layer.category === 'risk') {
            if (!map.getSource(`risk-${layer.id}-source`)) {
                map.addSource(`risk-${layer.id}-source`, {
                    type: 'geojson', data: layer.sourceData
                });
            }

            if (!map.getLayer(`risk-${layer.id}`)) {
                map.addLayer({
                    id: `risk-${layer.id}`, type: 'fill', source: `risk-${layer.id}-source`, paint: {
                        'fill-color': ['get', 'fillColor'], 'fill-opacity': 0.6, 'fill-outline-color': '#666666'
                    }, layout: {
                        'visibility': 'none'
                    }
                });
            }

            if (map.getLayer(`risk-${layer.id}`)) {
                map.setLayoutProperty(`risk-${layer.id}`, 'visibility', layer.active ? 'visible' : 'none');
            }
        } else if (layer.category === 'weather') {
            if (!map.getSource(`weather-${layer.id}-source`)) {
                map.addSource(`weather-${layer.id}-source`, {
                    type: 'raster', tiles: [`https://maps.openweathermap.org/maps/2.0/weather/${layer.id}/{z}/{x}/{y}?appid=${weatherApiToken}`], tileSize: 256
                });
            }

            if (!map.getLayer(`weather-${layer.id}`)) {
                map.addLayer({
                    id: `weather-${layer.id}`, type: 'raster', source: `weather-${layer.id}-source`, paint: {
                        'raster-opacity': 0.7
                    }, layout: {
                        'visibility': 'none'
                    }
                });
            }

            if (map.getLayer(`weather-${layer.id}`)) {
                map.setLayoutProperty(`weather-${layer.id}`, 'visibility', layer.active ? 'visible' : 'none');
            }
        } else if (layer.category === 'day-night') {
            map.addSource('day-night-source', {
                type: 'geojson', data: layer.sourceData
            });
            map.addLayer({
                id: 'day-night', type: 'fill', source: 'day-night-source', paint: {
                    'fill-color': '#000000', 'fill-opacity': 0.4
                }, layout: {
                    'visibility': 'none'
                }
            });

            if (map.getLayer(layer.id)) {
                map.setLayoutProperty(layer.id, 'visibility', layer.active ? 'visible' : 'none');
            }
        }
    });
}

function setupBaseLayerButtons() {
    if (!baseLayerButtonsContainer) return;
    baseLayerButtonsContainer.innerHTML = '';

    baseLayers.forEach(layer => {
        const button = document.createElement('button');
        button.id = layer.layer;
        button.innerHTML = `<img src='img/map.png' alt='map icon'>${layer.name}`;
        button.addEventListener('click', () => {
            let activeLayer = document.querySelector("#layer-bar > div.layer-dropdown.open > div > button.active")
            if (layer.layer === activeLayer.id) {
                map.setConfigProperty('basemap', 'theme', layer.theme || 'default');
                map.setConfigProperty('basemap', 'lightPreset', layer.style || 'day');
            } else {
                map.setStyle(layer.layer, {
                    config: {
                        basemap: {
                            lightPreset: layer.style || 'day', theme: layer.theme || 'default'
                        }
                    }
                });
                map.once('styledata', () => {
                    reapplyOverlayLayers();
                    rebuildOverlayControls();

                    map.on('style.load', () => {
                        if (!map.getSource('mapbox-dem')) {
                            map.addSource('mapbox-dem', {
                                type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14
                            });
                        }
                        map.setTerrain({
                            'source': 'mapbox-dem',
                            'exaggeration': 1
                        });
                    });
                });
            }
            updateBaseLayerButtonState(layer.name);
        }, {
            passive: true
        });
        baseLayerButtonsContainer.appendChild(button);
        baseLayerButtons[layer.name] = button;
    });
}

async function initializeMap() {
    map = new mapboxgl.Map({
        container: 'map',
        style: baseLayers.find(layer => layer.name === 'Standard - Default - Day').layer,
        projection: 'globe',
        center: [-7.8536599, 39.557191],
        pitch: 0,
        bearing: 0,
        zoom: 6
    });

    map.addControl(new mapboxgl.NavigationControl(), 'top-left');
    map.addControl(new mapboxgl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showUserHeading: true }), 'top-left');

    map.on('load', async () => {
        initializeLayerBar();
        setupBaseLayerButtons();
        fetchFire();
        fetchSatellite();
        fetchRisk();
        fetchWeather();
        fetchDayNight();
        while (!(webWorkersFinished.fire && webWorkersFinished.satellite && webWorkersFinished.risk)) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        rebuildOverlayControls();
        updateBaseLayerButtonState('Standard - Default - Day');
        loader.style.display = 'none';
    });

    map.on('click', () => {
        const activeFire = document.querySelector('.dot-active');
        if (activeFire) {
            activeFire.classList.remove('dot-active');
        }
        document.body.classList.remove('sidebar-open');
        document.querySelector('.sidebar').classList.remove('active');
        map.flyTo({
            center: [-7.8536599, 39.557191],
            pitch: 0,
            bearing: 0,
            zoom: 6
        });
        window.history.pushState('fogo', '', window.location.href.split('?')[0]);
    });

    map.once('style.load', () => {
        map.setTerrain({
            'exaggeration': 1
        });
    });
}

window.onload = async () => {
    loader.style.display = 'block';
    initializeMap();
};
((window, document) => {
    mapboxgl.accessToken = 'pk.eyJ1IjoiYnJzYWx2MjAwNiIsImEiOiJjbWU0cnA2dGIwZGdzMmxxdHN3aXFla3FhIn0.olUF6dEN497eCVOaaMnBow';

    let map;
    let currentWorker = null;
    let currentRiskLegend = null;
    let currentWeatherLegend = null;
    let weatherLegendsData = {};
    const loader = document.getElementById('loader');
    let satelliteDataProcessed = false;
    let riskDataProcessed = false;
    let currentFireMarkers = {};

    const baseSize = 22;

    const weatherLayerMapping = {
        'Temperatura do Ar (2m)': 'TA2',
        'Temperatura do Ponto de Orvalho': 'TD2',
        'Temperatura do Solo (0-10cm)': 'TS0',
        'Temperatura do Solo (>10cm)': 'TS10',
        'Pressão Atmosférica': 'APM',
        'Vento (Velocidade & Direção)': 'WND',
        'Velocidade Vento (10m)': 'WS10',
        'Humidade Relativa': 'HRD0',
        'Nebulosidade': 'CL',
        'Precipitação Convectiva': 'PAC0',
        'Intensidade Precipitação': 'PR0',
        'Precipitação Acumulada': 'PA0',
        'Precipitação Acumulada - Chuva': 'PAR0',
        'Precipitação Acumulada - Neve': 'PAS0',
        'Profundidade Neve': 'SD0'
    };

    function initializeMap() {
        map = new mapboxgl.Map({
            container: 'map',
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [-7.8536599, 39.557191],
            zoom: 6,
            projection: 'globe'
        });

        map.addControl(new mapboxgl.NavigationControl(), 'top-left');
        map.addControl(
            new mapboxgl.GeolocateControl({
                positionOptions: {
                    enableHighAccuracy: true
                },
                trackUserLocation: true,
                showUserHeading: true
            }),
            'top-left'
        );

        map.on('load', () => {
            setupCustomLayerControls();
            addWeatherLayers();
            fetchAndApplyDynamicLayers();
            rebuildOverlayControls();
        });

        map.on('click', () => {
            const previouslyActiveIcon = document.querySelector('.dot-active');
            if (previouslyActiveIcon) {
                changeElementSizeById(previouslyActiveIcon.id, baseSize);
                previouslyActiveIcon.classList.remove('dot-active');
            }
            map.flyTo({ center: [-7.8536599, 39.557191], zoom: 6 });

            document.getElementById('map').style.width = '100%';
            document.querySelector('.sidebar').classList.remove('active');
            window.history.pushState('fogo', '', window.location.href.split('?')[0]);
        });
    }

    function createSatelliteLayers(satelliteData, type) {
        const hotspotFeatures = [];
        const areaFeatures = [];

        satelliteData.points.forEach(point => {
            hotspotFeatures.push(point);
        });

        if (satelliteData.areas && satelliteData.areas.features.length > 0) {
            satelliteData.areas.features.forEach(area => areaFeatures.push(area));
        }

        const hotspotSourceId = `${type}-hotspots-data`;
        const areaSourceId = `${type}-areas-data`;

        if (map.getSource(hotspotSourceId)) {
            map.getSource(hotspotSourceId).setData({ type: 'FeatureCollection', features: hotspotFeatures });
        } else {
            map.addSource(hotspotSourceId, {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: hotspotFeatures }
            });
            map.addLayer({
                id: `${type}-hotspots`,
                type: 'circle',
                source: hotspotSourceId,
                paint: {
                    'circle-radius': 5,
                    'circle-color': '#ff0000',
                    'circle-stroke-color': '#fff',
                    'circle-stroke-width': 1,
                    'circle-opacity': 0.8
                },
                layout: {
                    'visibility': 'none'
                }
            });
        }

        if (map.getSource(areaSourceId)) {
            map.getSource(areaSourceId).setData({ type: 'FeatureCollection', features: areaFeatures });
        } else {
            map.addSource(areaSourceId, {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: areaFeatures }
            });
            map.addLayer({
                id: `${type}-areas`,
                type: 'fill',
                source: areaSourceId,
                paint: {
                    'fill-color': '#ff0000',
                    'fill-opacity': 0.2,
                    'fill-outline-color': '#ff0000'
                },
                layout: {
                    'visibility': 'none'
                }
            });
        }

        map.on('click', `${type}-hotspots`, (e) => {
            const p = e.features[0].properties;
            const popupContent = `<b>Brilho:</b> ${p.brightness}K<br><b>Data, Hora:</b> ${p.acq_date}<br><b>Satélite:</b> ${p.satellite}<br><b>Confiança:</b> ${p.confidence}<br><b>Dia/Noite:</b> ${p.daynight}<br><b>PRF:</b> ${p.frp}MW`;
            new mapboxgl.Popup()
                .setLngLat(e.features[0].geometry.coordinates)
                .setHTML(popupContent)
                .addTo(map);
        });
        map.on('mouseenter', `${type}-hotspots`, () => {
            map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', `${type}-hotspots`, () => {
            map.getCanvas().style.cursor = '';
        });

        map.on('click', `${type}-areas`, (e) => {
            new mapboxgl.Popup()
                .setLngLat(e.lngLat)
                .addTo(map);
        });
        map.on('mouseenter', `${type}-areas`, () => {
            map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', `${type}-areas`, () => {
            map.getCanvas().style.cursor = '';
        });
    }

    function addSatelliteLayers(data) {
        loader.innerText = 'A gerar camadas de satélite...';

        if (data.modis) {
            createSatelliteLayers(data.modis, 'modis');
        } else {
            if (map.getLayer('modis-hotspots')) map.removeLayer('modis-hotspots');
            if (map.getSource('modis-hotspots-data')) map.removeSource('modis-hotspots-data');
            if (map.getLayer('modis-areas')) map.removeLayer('modis-areas');
            if (map.getSource('modis-areas-data')) map.removeSource('modis-areas-data');
        }

        if (data.viirs) {
            createSatelliteLayers(data.viirs, 'viirs');
        } else {
            if (map.getLayer('viirs-hotspots')) map.removeLayer('viirs-hotspots');
            if (map.getSource('viirs-hotspots-data')) map.removeSource('viirs-hotspots-data');
            if (map.getLayer('viirs-areas')) map.removeLayer('viirs-areas');
            if (map.getSource('viirs-areas-data')) map.removeSource('viirs-areas-data');
        }

        satelliteDataProcessed = true;
        checkAllDataProcessed();
    }

    function addRiskLegend() {
        if (currentRiskLegend) {
            currentRiskLegend.remove();
        }

        const legendContainer = document.createElement('div');
        legendContainer.className = 'mapbox-legend mapbox-risk-legend';
        const grades = [1, 2, 3, 4, 5];
        const labels = ['Reduzido', 'Moderado', 'Elevado', 'Muito Elevado', 'Máximo'];
        const colors = ['#509e2f', '#ffe900', '#e87722', '#cb333b', '#6f263d'];
        legendContainer.innerHTML += '<h4>Risco de Incêndio</h4>';
        for (let i = 0; i < grades.length; i++) {
            legendContainer.innerHTML +=
                `<i style="background:${colors[i]}" class="${labels[i]}"></i> ${labels[i]}<br>`;
        }
        
        map.getContainer().appendChild(legendContainer);
        currentRiskLegend = legendContainer;

        if (currentWeatherLegend) {
            currentWeatherLegend.classList.remove('mapbox-weather-legend-alone');
            currentWeatherLegend.classList.add('mapbox-weather-legend');
        }
    }

    function generateWeatherLegend(title, stops, unit) {
        if (currentWeatherLegend) {
            currentWeatherLegend.remove();
        }

        const legendContainer = document.createElement('div');
        if (currentRiskLegend) {
            legendContainer.className = 'mapbox-legend mapbox-weather-legend';
        } else {
            legendContainer.className = 'mapbox-legend mapbox-weather-legend-alone';
        }
        
        legendContainer.innerHTML += `<h4>${title}</h4>`;
        for (let i = 0; i < stops.length; i++) {
            const stop = stops[i];
            const nextStop = stops[i + 1];
            let label = `${stop.value} ${unit}`;
            if (nextStop) {
                label += ` - ${nextStop.value} ${unit}`;
            } else {
                label += '+';
            }
            legendContainer.innerHTML +=
                `<i style="background:${stop.color}"></i> ${label}<br>`;
        }
        
        map.getContainer().appendChild(legendContainer);
        currentWeatherLegend = legendContainer;
    }

    const customLayerControl = document.createElement('div');
    customLayerControl.className = 'mapboxgl-ctrl mapboxgl-ctrl-group custom-controls';

    const baseLayerToggle = document.createElement('div');
    baseLayerToggle.className = 'layer-category-title';
    baseLayerToggle.textContent = 'Camadas Base';
    customLayerControl.appendChild(baseLayerToggle);

    const baseLayers = {
        'Streets': 'mapbox://styles/mapbox/streets-v12',
        'Dark': 'mapbox://styles/mapbox/dark-v11',
        'Light': 'mapbox://styles/mapbox/light-v11',
        'Outdoors': 'mapbox://styles/mapbox/outdoors-v12',
        'Sattelite': 'mapbox://styles/mapbox/satellite-v9',
        'Satellite Streets': 'mapbox://styles/mapbox/satellite-streets-v12',
        'Navigation Day': 'mapbox://styles/mapbox/navigation-day-v1',
        'Navigation Night': 'mapbox://styles/mapbox/navigation-night-v1'
    };

    for (const layerName in baseLayers) {
        const button = document.createElement('button');
        button.innerHTML = `<img src="img/map.png"> ${layerName}`;
        button.onclick = () => {
            map.setStyle(baseLayers[layerName]);
            if (currentRiskLegend) {
                currentRiskLegend.remove();
                currentRiskLegend = null;
            }
            if (currentWeatherLegend) {
                currentWeatherLegend.remove();
                currentWeatherLegend = null;
            }
            map.once('styledata', () => {
                addWeatherLayers();
                fetchAndApplyDynamicLayers();
                reapplyOverlayLayers();
                rebuildOverlayControls();
            });
        };
        customLayerControl.appendChild(button);
    }

    // New containers for different overlay categories
    const fireControls = document.createElement('div');
    fireControls.className = 'layer-category-container';
    fireControls.innerHTML = '<div class="layer-category-title">Incêndios</div>';
    const fireButtonsContainer = document.createElement('div');
    fireButtonsContainer.className = 'overlay-buttons-container';
    fireControls.appendChild(fireButtonsContainer);
    customLayerControl.appendChild(fireControls);

    const satelliteControls = document.createElement('div');
    satelliteControls.className = 'layer-category-container';
    satelliteControls.innerHTML = '<div class="layer-category-title">Satélite</div>';
    const satelliteButtonsContainer = document.createElement('div');
    satelliteButtonsContainer.className = 'overlay-buttons-container';
    satelliteControls.appendChild(satelliteButtonsContainer);
    customLayerControl.appendChild(satelliteControls);

    const riskControls = document.createElement('div');
    riskControls.className = 'layer-category-container';
    riskControls.innerHTML = '<div class="layer-category-title">Risco de Incêndio</div>';
    const riskButtonsContainer = document.createElement('div');
    riskButtonsContainer.className = 'overlay-buttons-container';
    riskControls.appendChild(riskButtonsContainer);
    customLayerControl.appendChild(riskControls);

    const weatherControls = document.createElement('div');
    weatherControls.className = 'layer-category-container';
    weatherControls.innerHTML = '<div class="layer-category-title">Meteorologia</div>';
    const weatherButtonsContainer = document.createElement('div');
    weatherButtonsContainer.className = 'overlay-buttons-container';
    weatherControls.appendChild(weatherButtonsContainer);
    customLayerControl.appendChild(weatherControls);


    const overlayLayers = {
        'Fires': {
            id: 'fires-layer',
            type: 'symbol',
            source: 'fires-data',
            icon: 'img/fire.png',
            active: true,
            category: 'fire',
            sourceData: null
        },
        'MODIS Hotspots': {
            id: 'modis-hotspots',
            type: 'circle',
            source: 'modis-hotspots-data',
            icon: 'img/satellite.png',
            active: false,
            category: 'satellite',
            hotspotData: null,
            areaData: null
        },
        'VIIRS Hotspots': {
            id: 'viirs-hotspots',
            type: 'circle',
            source: 'viirs-hotspots-data',
            icon: 'img/satellite.png',
            active: false,
            category: 'satellite',
            hotspotData: null,
            areaData: null
        }
    };

    const overlayButtons = {};

    function setupCustomLayerControls() {
        map.addControl({
            onAdd: function (mapInstance) {
                return customLayerControl;
            },
            onRemove: function () {
                customLayerControl.parentNode.removeChild(customLayerControl);
            }
        }, 'top-right');
    }

    function rebuildOverlayControls() {
        fireButtonsContainer.innerHTML = '';
        satelliteButtonsContainer.innerHTML = '';
        riskButtonsContainer.innerHTML = '';
        weatherButtonsContainer.innerHTML = '';

        for (const key in overlayButtons) {
            delete overlayButtons[key];
        }

        for (const layerKey in overlayLayers) {
            const layerConfig = overlayLayers[layerKey];
            const button = document.createElement('button');
            button.innerHTML = `<img src="${layerConfig.icon}"> ${layerKey}`;
            button.className = layerConfig.active ? 'active' : '';
            button.dataset.category = layerConfig.category;
            button.dataset.layerId = layerConfig.id;

            button.onclick = () => {
                const clickedCategory = button.dataset.category;
                const clickedLayerId = button.dataset.layerId;
                let newActiveState;

                if (button.classList.contains('active')) {
                    newActiveState = false;
                } else {
                    newActiveState = true;
                }

                if (clickedCategory === 'risk' || clickedCategory === 'weather') {
                    for (const key in overlayLayers) {
                        const currentLayer = overlayLayers[key];
                        if (currentLayer.category === clickedCategory && currentLayer.id !== clickedLayerId) {
                            currentLayer.active = false;
                            if (overlayButtons[key]) {
                                overlayButtons[key].classList.remove('active');
                            }
                            if (map.getLayer(currentLayer.id)) {
                                map.setLayoutProperty(currentLayer.id, 'visibility', 'none');
                            }
                            // Specific handling for satellite areas when modis/viirs are toggled
                            if (currentLayer.id === 'modis-hotspots' && map.getLayer('modis-areas')) {
                                map.setLayoutProperty('modis-areas', 'visibility', 'none');
                            }
                            if (currentLayer.id === 'viirs-hotspots' && map.getLayer('viirs-areas')) {
                                map.setLayoutProperty('viirs-areas', 'visibility', 'none');
                            }
                        }
                    }
                }
                
                layerConfig.active = newActiveState;
                button.classList.toggle('active', newActiveState);

                if (map.getLayer(layerConfig.id)) {
                    map.setLayoutProperty(layerConfig.id, 'visibility', layerConfig.active ? 'visible' : 'none');
                }
                if (layerConfig.id === 'modis-hotspots' && map.getLayer('modis-areas')) {
                    map.setLayoutProperty('modis-areas', 'visibility', layerConfig.active ? 'visible' : 'none');
                }
                if (layerConfig.id === 'viirs-hotspots' && map.getLayer('viirs-areas')) {
                    map.setLayoutProperty('viirs-areas', 'visibility', layerConfig.active ? 'visible' : 'none');
                }

                if (layerConfig.category === 'risk') {
                    if (layerConfig.active) {
                        addRiskLegend();
                    } else if (currentRiskLegend) {
                        currentRiskLegend.remove();
                        currentRiskLegend = null;
                        if (currentWeatherLegend) {
                            currentWeatherLegend.classList.remove('mapbox-weather-legend');
                            currentWeatherLegend.classList.add('mapbox-weather-legend-alone');
                        }
                    }
                } else if (layerConfig.category === 'weather') {
                    if (layerConfig.active && layerConfig.legend && weatherLegendsData[layerConfig.legend]) {
                        const legendInfo = weatherLegendsData[layerConfig.legend];
                        generateWeatherLegend(legendInfo.name, legendInfo.stops, legendInfo.unit);
                    } else if (currentWeatherLegend) {
                        currentWeatherLegend.remove();
                        currentWeatherLegend = null;
                    }
                }
            };
            
            // Append button to the correct container based on category
            if (layerConfig.category === 'fire') {
                fireButtonsContainer.appendChild(button);
            } else if (layerConfig.category === 'satellite') {
                satelliteButtonsContainer.appendChild(button);
            } else if (layerConfig.category === 'risk') {
                riskButtonsContainer.appendChild(button);
            } else if (layerConfig.category === 'weather') {
                weatherButtonsContainer.appendChild(button);
            }
            
            overlayButtons[layerKey] = button;
        }
    }


    function reapplyOverlayLayers() {
        let activeRiskLayerKey = null;
        for (const layerKey in overlayLayers) {
            const layerConfig = overlayLayers[layerKey];
            if (layerConfig.category === 'risk' && layerConfig.active) {
                if (activeRiskLayerKey) {
                    layerConfig.active = false;
                } else {
                    activeRiskLayerKey = layerKey;
                }
            }
        }

        let activeWeatherLayerKey = null;
        for (const layerKey in overlayLayers) {
            const layerConfig = overlayLayers[layerKey];
            if (layerConfig.category === 'weather' && layerConfig.active) {
                if (activeWeatherLayerKey) {
                    layerConfig.active = false;
                } else {
                    activeWeatherLayerKey = layerKey;
                }
            }
        }

        for (const layerKey in overlayLayers) {
            const layerConfig = overlayLayers[layerKey];
            if (layerConfig.active) {
                if (layerConfig.category === 'fire') {
                    for (const fireId in currentFireMarkers) {
                        currentFireMarkers[fireId].remove();
                    }
                    currentFireMarkers = {};
                    currentWorker.postMessage({ type: 'firesData' });
                } else if (layerConfig.category === 'satellite') {
                    if (layerConfig.id === 'modis-hotspots' && layerConfig.hotspotData) {
                        if (!map.getSource('modis-hotspots-data')) {
                            map.addSource('modis-hotspots-data', { type: 'geojson', data: layerConfig.hotspotData });
                        }
                        if (layerConfig.areaData && !map.getSource('modis-areas-data')) {
                            map.addSource('modis-areas-data', { type: 'geojson', data: layerConfig.areaData });
                        }
                        if (!map.getLayer('modis-hotspots')) {
                            map.addLayer({ id: 'modis-hotspots', type: 'circle', source: 'modis-hotspots-data', paint: { 'circle-radius': 5, 'circle-color': '#ff0000', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1, 'circle-opacity': 0.8 }, layout: { 'visibility': 'visible' } });
                        }
                        if (layerConfig.areaData && !map.getLayer('modis-areas')) {
                            map.addLayer({ id: 'modis-areas', type: 'fill', source: 'modis-areas-data', paint: { 'fill-color': '#ff0000', 'fill-opacity': 0.2, 'fill-outline-color': '#ff0000' }, layout: { 'visibility': 'visible' } });
                        }
                        if (map.getLayer('modis-hotspots')) map.setLayoutProperty('modis-hotspots', 'visibility', 'visible');
                        if (map.getLayer('modis-areas')) map.setLayoutProperty('modis-areas', 'visibility', 'visible');
                    }
                    if (layerConfig.id === 'viirs-hotspots' && layerConfig.hotspotData) {
                        if (!map.getSource('viirs-hotspots-data')) {
                            map.addSource('viirs-hotspots-data', { type: 'geojson', data: layerConfig.hotspotData });
                        }
                        if (layerConfig.areaData && !map.getSource('viirs-areas-data')) {
                            map.addSource('viirs-areas-data', { type: 'geojson', data: layerConfig.areaData });
                        }
                        if (!map.getLayer('viirs-hotspots')) {
                            map.addLayer({ id: 'viirs-hotspots', type: 'circle', source: 'viirs-hotspots-data', paint: { 'circle-radius': 5, 'circle-color': '#ff0000', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1, 'circle-opacity': 0.8 }, layout: { 'visibility': 'visible' } });
                        }
                        if (layerConfig.areaData && !map.getLayer('viirs-areas')) {
                            map.addLayer({ id: 'viirs-areas', type: 'fill', source: 'viirs-areas-data', paint: { 'fill-color': '#ff0000', 'fill-opacity': 0.2, 'fill-outline-color': '#ff0000' }, layout: { 'visibility': 'visible' } });
                        }
                        if (map.getLayer('viirs-hotspots')) map.setLayoutProperty('viirs-hotspots', 'visibility', 'visible');
                        if (map.getLayer('viirs-areas')) map.setLayoutProperty('viirs-areas', 'visibility', 'visible');
                    }
                } else if (layerConfig.category === 'risk') {
                    if (layerConfig.sourceData && !map.getSource(layerConfig.source)) {
                        map.addSource(layerConfig.source, {
                            type: 'geojson',
                            data: layerConfig.sourceData
                        });
                    }
                    if (!map.getLayer(layerConfig.id)) {
                        map.addLayer({
                            id: layerConfig.id,
                            type: 'fill',
                            source: layerConfig.source,
                            paint: {
                                'fill-color': ['get', 'fillColor'],
                                'fill-opacity': 0.6,
                                'fill-outline-color': '#666'
                            },
                            layout: {
                                'visibility': 'visible'
                            }
                        });
                    }
                    if (map.getLayer(layerConfig.id)) map.setLayoutProperty(layerConfig.id, 'visibility', 'visible');
                    addRiskLegend();
                } else if (layerConfig.category === 'weather') {
                    const appId = '89ae8b33d0bde5d8a89a7f5550e87869';
                    const weatherKey = weatherLayerMapping[layerKey];
                    const sourceId = `weather-${weatherKey}-source`;
                    const layerId = `weather-${weatherKey}`;

                    if (!map.getSource(sourceId)) {
                        map.addSource(sourceId, {
                            type: 'raster',
                            tiles: [`http://maps.openweathermap.org/maps/2.0/weather/${weatherKey}/{z}/{x}/{y}?appid=${appId}`],
                            tileSize: 256
                        });
                    }
                    if (!map.getLayer(layerId)) {
                        map.addLayer({
                            id: layerId,
                            type: 'raster',
                            source: sourceId,
                            paint: {
                                'raster-opacity': 0.7
                            },
                            layout: {
                                'visibility': 'visible'
                            }
                        });
                    }
                    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', 'visible');
                    if (layerConfig.legend && weatherLegendsData[layerConfig.legend]) {
                        const legendInfo = weatherLegendsData[layerConfig.legend];
                        generateWeatherLegend(legendInfo.name, legendInfo.stops, legendInfo.unit);
                    }
                }
            } else {
                if (map.getLayer(layerConfig.id)) {
                    map.setLayoutProperty(layerConfig.id, 'visibility', 'none');
                }
                if (layerConfig.id === 'modis-hotspots' && map.getLayer('modis-areas')) {
                    map.setLayoutProperty('modis-areas', 'visibility', 'none');
                }
                if (layerConfig.id === 'viirs-hotspots' && map.getLayer('viirs-areas')) {
                    map.setLayoutProperty('viirs-areas', 'visibility', 'none');
                }
            }
        }
    }

    function fetchAndApplyDynamicLayers() {
        currentWorker.postMessage({ type: 'satelliteData', dayRange: 1 });
        currentWorker.postMessage({ type: 'riskData' });
        currentWorker.postMessage({ type: 'firesData' });
    }


    function addWeatherLayers() {
        const appId = '89ae8b33d0bde5d8a89a7f5550e87869';

        for (const layerName in weatherLayerMapping) {
            const weatherKey = weatherLayerMapping[layerName];
            const sourceId = `weather-${weatherKey}-source`;
            const layerId = `weather-${weatherKey}`;

            if (!map.getSource(sourceId)) {
                map.addSource(sourceId, {
                    type: 'raster',
                    tiles: [`http://maps.openweathermap.org/maps/2.0/weather/${weatherKey}/{z}/{x}/{y}?appid=${appId}`],
                    tileSize: 256
                });
            }

            if (!map.getLayer(layerId)) {
                map.addLayer({
                    id: layerId,
                    type: 'raster',
                    source: sourceId,
                    paint: {
                        'raster-opacity': 0.7
                    },
                    layout: {
                        'visibility': 'none'
                    }
                });
            }

            if (!overlayLayers[layerName]) {
                overlayLayers[layerName] = {
                    id: layerId,
                    type: 'raster',
                    source: sourceId,
                    icon: 'img/weather.png',
                    legend: weatherKey,
                    active: false,
                    category: 'weather'
                };
            }
        }
    }


    function getLayerIndexByStatus(status) {
        switch (status) {
            case 'Despacho':
                return 3;
            case 'Despacho de 1º Alerta':
                return 4;
            case 'Em Curso':
                return 5;
            case 'Chegada ao TO':
                return 6;
            case 'Em Resolução':
                return 7;
            case 'Conclusão':
                return 8;
            case 'Vigilância':
                return 9;
            case 'Encerrada':
                return 10;
            case 'Falso Alarme':
                return 11;
            case 'Falso Alerta':
                return 12;
            default:
                return 81;
        }
    }

    function getPonderatedImportanceFactor(importance, statusCode, fireImportanceData) {
        if (statusCode == 11 || statusCode == 12) {
            return 0.6;
        }
        let importanceSize;
        if (importance > fireImportanceData.average) {
            let topPercentage = (importance / fireImportanceData.topImportance) * 2.3 + 0.5;
            let avgPercentage = fireImportanceData.average / importance;
            importanceSize = topPercentage - avgPercentage;
            if (importanceSize > 1.75) importanceSize = 1.75;
            if (importanceSize < 1) importanceSize = 1;
        } else if (importance < fireImportanceData.average) {
            importanceSize = (importance / fireImportanceData.average) * 0.8;
            if (importanceSize < 0.5) importanceSize = 0.5;
        } else {
            importanceSize = 1;
        }
        return importanceSize;
    }

    function changeElementSizeById(id, size) {
        const markerHtml = document.getElementById(id);
        if (markerHtml) {
            markerHtml.style.height = `${size}px`;
            markerHtml.style.width = `${size}px`;
        }
    }

    function addFireMarker(fire, mapInstance, fireImportanceData) {
        const { lat, lng, status, id: fireId } = fire;

        if (lat && lng && status) {
            let iconHtml = `<i class="dot status-`;
            if (fire.important && [7, 8, 9].includes(fire.statusCode)) {
                iconHtml += '99-r';
            } else if (fire.important) {
                iconHtml += '99';
            } else {
                iconHtml += fire.statusCode;
            }

            const isActive = window.location.href.match(/\?fogo\=(\d+)/);
            if (isActive && isActive[1] == fireId) {
                iconHtml += ' dot-active';
                mapInstance.flyTo({ center: [lng, lat], zoom: 9 });
            }

            iconHtml += `" id="${fireId}"></i>`;
            const sizeFactor = getPonderatedImportanceFactor(fire.importance, fire.statusCode, fireImportanceData);
            const size = sizeFactor * baseSize;

            const el = document.createElement('div');
            el.className = 'fire-marker';
            el.innerHTML = iconHtml;
            el.style.width = `${size}px`;
            el.style.height = `${size}px`;

            const marker = new mapboxgl.Marker({
                element: el,
                anchor: 'center'
            })
                .setLngLat([lng, lat])
                .addTo(mapInstance);

            currentFireMarkers[fireId] = marker;

            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const activeIcon = el.querySelector('.dot');
                const previouslyActiveIcon = document.querySelector('.dot-active');

                if (previouslyActiveIcon && previouslyActiveIcon !== activeIcon) {
                    changeElementSizeById(previouslyActiveIcon.id, baseSize);
                    previouslyActiveIcon.classList.remove('dot-active');
                }

                changeElementSizeById(fireId, 48 + sizeFactor);
                activeIcon.classList.add('dot-active');
                mapInstance.flyTo({ center: [lng, lat], zoom: 9 });

                const momentDate = new Date(fire.updated.sec * 1000).toLocaleString();

                const locationLink = `<a href="https://www.google.com/maps/search/${lat},${lng}" target="_blank"><i class="far fa-map"></i> ${lat},${lng}</a>`;

                let locationText = fire.location;
                if (fire.localidade) {
                    locationText += ` - ${fire.localidade}`;
                }

                const sidebar = document.querySelector('.sidebar');
                sidebar.classList.add('active');
                sidebar.scrollTop = 0;

                if (window.innerWidth >= 992) {
                    document.getElementById('map').style.width = '75%';
                }

                document.querySelector('.f-local').innerHTML = locationText;
                document.querySelector('.f-man').textContent = fire.man;
                document.querySelector('.f-aerial').textContent = fire.aerial;
                document.querySelector('.f-terrain').textContent = fire.terrain;
                document.querySelector('.f-location').innerHTML = locationLink;
                document.querySelector('.f-nature').textContent = fire.natureza;
                document.querySelector('.f-update').textContent = momentDate;
                document.querySelector('.f-start').textContent = `${fire.date} ${fire.hour}`;

                window.history.pushState('fogo', '', `?fogo=${fireId}`);
                fireStatus(fireId);
                plot(fireId);
                danger(fireId);
                meteo(fireId);
                extra(fireId);
            });
        }
    }

    let detailsChart;

    async function plot(id) {
        const url = `https://api-dev.fogos.pt/fires/data?id=${id}`;
        try {
            const response = await fetch(url);
            const data = await response.json();

            const canvas = document.getElementById('myChart');
            if (!canvas) {
                console.error('Canvas element #myChart not found.');
                return;
            }
            const ctx = canvas.getContext('2d');

            if (data.success && data.data && data.data.length) {
                const labels = data.data.map(d => d.label);
                const man = data.data.map(d => d.man);
                const terrain = data.data.map(d => d.terrain);
                const aerial = data.data.map(d => d.aerial);

                if (detailsChart) {
                    detailsChart.destroy();
                }

                detailsChart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Operacionais',
                            data: man,
                            fill: false,
                            backgroundColor: '#EFC800',
                            borderColor: '#EFC800',
                        },
                        {
                            label: 'Terrestres',
                            data: terrain,
                            fill: false,
                            backgroundColor: '#6D720B',
                            borderColor: '#6D720B',
                        }, {
                            label: 'Aéreos',
                            data: aerial,
                            fill: false,
                            backgroundColor: '#4E88B2',
                            borderColor: '#4E88B2',
                        }
                        ]
                    }
                });
                canvas.style.display = 'block';
            } else {
                if (detailsChart) {
                    detailsChart.destroy();
                    detailsChart = null;
                }
                canvas.style.display = 'none';
            }
        } catch (error) {
            console.error('Error fetching fire data for plot:', error);
            const canvas = document.getElementById('myChart');
            if (detailsChart) {
                detailsChart.destroy();
                detailsChart = null;
            }
            if (canvas) {
                canvas.style.display = 'none';
            }
        }
    }

    async function fireStatus(id) {
        try {
            const response = await fetch(`https://fogos.pt/views/status/${id}`);
            document.querySelector('.f-status').innerHTML = await response.text();
        } catch (error) {
            console.error('Error fetching fire status:', error);
        }
    }

    async function danger(id) {
        try {
            const response = await fetch(`https://fogos.pt/views/risk/${id}`);
            document.querySelector('.f-danger').innerHTML = await response.text();
        } catch (error) {
            console.error('Error fetching danger info:', error);
        }
    }

    async function meteo(id) {
        try {
            const response = await fetch(`https://fogos.pt/views/meteo/${id}`);
            document.querySelector('.f-meteo').innerHTML = await response.text();
        } catch (error) {
            console.error('Error fetching meteo info:', error);
        }
    }

    async function extra(id) {
        try {
            const response = await fetch(`https://fogos.pt/views/extra/${id}`);
            const data = await response.text();
            const fExtra = document.querySelector('.f-extra');
            const extraRow = document.querySelector('.row.extra');
            if (data && data.trim().length !== 0) {
                fExtra.innerHTML = data;
                extraRow.classList.add('active');
            } else {
                fExtra.innerHTML = '';
                extraRow.classList.remove('active');
            }
        } catch (error) {
            console.error('Error fetching extra info:', error);
        }
    }

    function checkAllDataProcessed() {
        if (satelliteDataProcessed && riskDataProcessed) {
            loader.style.display = 'none';
        }
    }

    function setupWorker() {
        if (currentWorker) {
            return;
        }

        loader.style.display = 'block';
        loader.innerText = 'A inicializar processamento de dados...';
        currentWorker = new Worker('js/worker.js');

        currentWorker.onmessage = (e) => {
            const { type, message, data, fireImportanceData } = e.data;
            if (type === 'progress') {
                loader.innerText = message;
            } else if (type === 'initDataComplete') {
                loader.innerText = 'Dados geográficos carregados. A obter dados de incêndios e risco...';
                currentWorker.postMessage({ type: 'satelliteData', dayRange: 1 });
                currentWorker.postMessage({ type: 'riskData' });
            } else if (type === 'satelliteResult') {
                if (data.modis) {
                    overlayLayers['MODIS Hotspots'].hotspotData = { type: 'FeatureCollection', features: data.modis.points || [] };
                    overlayLayers['MODIS Hotspots'].areaData = { type: 'FeatureCollection', features: (data.modis.areas && data.modis.areas.features) ? data.modis.areas.features : [] };
                }
                if (data.viirs) {
                    overlayLayers['VIIRS Hotspots'].hotspotData = { type: 'FeatureCollection', features: data.viirs.points || [] };
                    overlayLayers['VIIRS Hotspots'].areaData = { type: 'FeatureCollection', features: (data.viirs.areas && data.viirs.areas.features) ? data.viirs.areas.features : [] };
                }
                addSatelliteLayers(data);
                rebuildOverlayControls(); // Rebuild controls after satellite data is processed
            } else if (type === 'riskResult') {
                loader.innerText = 'A adicionar camadas de risco...';
                let newRiskLayerActivated = false;
                let activeRiskLayerKey = null;

                for (const key in data) {
                    const geoJsonData = data[key];
                    const sourceId = `${key.toLowerCase().replace(/[^a-z0-9]/g, '-')}-data`;
                    const layerId = `${key.toLowerCase().replace(/[^a-z0-9]/g, '-')}-layer`;

                    if (!map.getSource(sourceId)) {
                        map.addSource(sourceId, {
                            type: 'geojson',
                            data: geoJsonData
                        });
                    } else {
                        map.getSource(sourceId).setData(geoJsonData);
                    }

                    if (!map.getLayer(layerId)) {
                        map.addLayer({
                            id: layerId,
                            type: 'fill',
                            source: sourceId,
                            paint: {
                                'fill-color': ['get', 'fillColor'],
                                'fill-opacity': 0.6,
                                'fill-outline-color': '#666'
                            },
                            layout: {
                                'visibility': 'none'
                            }
                        });
                    }

                    const wasActive = overlayLayers[key] ? overlayLayers[key].active : false;

                    overlayLayers[key] = {
                        id: layerId,
                        type: 'fill',
                        source: sourceId,
                        icon: 'img/fire_risk.png',
                        legend: 'risk',
                        active: wasActive,
                        category: 'risk',
                        sourceData: geoJsonData
                    };

                    if (wasActive) {
                        newRiskLayerActivated = true;
                        activeRiskLayerKey = key;
                    }
                }

                if (newRiskLayerActivated && activeRiskLayerKey) {
                    for (const key in overlayLayers) {
                        const currentLayer = overlayLayers[key];
                        if (currentLayer.category === 'risk' && key !== activeRiskLayerKey) {
                            currentLayer.active = false;
                        }
                    }
                }
                riskDataProcessed = true;
                checkAllDataProcessed();
                rebuildOverlayControls();
            } else if (type === 'firesResult') {
                loader.innerText = 'A adicionar novos dados de incêndios...';

                for (const fireId in currentFireMarkers) {
                    currentFireMarkers[fireId].remove();
                }
                currentFireMarkers = {};

                for (const fire of data) {
                    addFireMarker(fire, map, fireImportanceData);
                }

                const res = window.location.href.match(/\?fogo\=(\d+)/);
                if (res && res[1]) {
                    const fireIdFromUrl = res[1];
                    setTimeout(() => {
                        const fireElement = document.getElementById(fireIdFromUrl);
                        if (fireElement) {
                            fireElement.click();
                        }
                    }, 500);
                }
                if (overlayButtons['Fires']) {
                    overlayLayers['Fires'].active = true;
                    overlayButtons['Fires'].classList.add('active');
                    overlayLayers['Fires'].sourceData = data;
                }
                checkAllDataProcessed();
                rebuildOverlayControls(); // Rebuild controls after fire data is processed
            } else if (type === 'error') {
                const errorMessage = document.createElement('div');
                errorMessage.className = 'error-message';
                errorMessage.textContent = message;
                document.body.appendChild(errorMessage);
                setTimeout(() => errorMessage.remove(), 5000);
                if (message.includes("fire data")) {
                    satelliteDataProcessed = true;
                } else if (message.includes("risk layers") || message.includes("Concelhos GeoJSON")) {
                    riskDataProcessed = true;
                }
                checkAllDataProcessed();
            }
        };

        currentWorker.onerror = (e) => {
            loader.innerText = 'Ocorreu um erro durante o processamento.';
            const errorMessage = document.createElement('div');
            errorMessage.className = 'error-message';
            errorMessage.textContent = 'Ocorreu um erro crítico no worker. Verifique a consola para detalhes.';
            document.body.appendChild(errorMessage);
            setTimeout(() => errorMessage.remove(), 5000);
            satelliteDataProcessed = true;
            riskDataProcessed = true;
            checkAllDataProcessed();
        };
    }

    function setupControls() {
        setupWorker();
        currentWorker.postMessage({ type: 'initData', url: window.location.href.split('?')[0] });
    }

    async function loadWeatherLegendsData() {
        try {
            const response = await fetch('json/weather_legends.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            weatherLegendsData = await response.json();
        } catch (error) {
            const errorMessage = document.createElement('div');
            errorMessage.className = 'error-message';
            errorMessage.textContent = `Error loading weather legends: ${error.message}`;
            document.body.appendChild(errorMessage);
            setTimeout(() => errorMessage.remove(), 5000);
        }
    }

    window.onload = async () => {
        initializeMap();
        await loadWeatherLegendsData();
        setupControls();
    };
})(window, document);
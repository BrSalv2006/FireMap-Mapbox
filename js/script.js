((window, document) => {
    mapboxgl.accessToken = 'pk.eyJ1IjoiYnJzYWx2MjAwNiIsImEiOiJjbWU0cnA2dGIwZGdzMmxxdHN3aXFla3FhIn0.olUF6dEN497eCVOaaMnBow'; // Substitua pelo seu token de acesso do Mapbox

    let map;
    let currentWorker = null;
    let currentRiskLegend = null;
    let currentWeatherLegend = null;
    let weatherLegendsData = {};
    const loader = document.getElementById('loader');
    let satelliteDataProcessed = false;
    let riskDataProcessed = false;
    let currentFireMarkers = {}; // Para gerir marcadores de incêndio MapboxGL

    const baseSize = 22;

    const weatherLayerMapping = {
        'Temperatura do Ar (2m)': 'TA2',
    //    'Temperatura do Ponto de Orvalho': 'TD2',
    //    'Temperatura do Solo (0-10cm)': 'TS0',
    //    'Temperatura do Solo (>10cm)': 'TS10',
    //    'Pressão Atmosférica': 'APM',
    //    'Vento (Velocidade & Direção)': 'WND',
    //    'Velocidade Vento (10m)': 'WS10',
    //    'Humidade Relativa': 'HRD0',
    //    'Nebulosidade': 'CL',
    //    'Precipitação Convectiva': 'PAC0',
    //    'Intensidade Precipitação': 'PR0',
    //    'Precipitação Acumulada': 'PA0',
    //    'Precipitação Acumulada - Chuva': 'PAR0',
    //    'Precipitação Acumulada - Neve': 'PAS0',
    //    'Profundidade Neve': 'SD0'
    };

    function initializeMap() {
        map = new mapboxgl.Map({
            container: 'map',
            style: 'mapbox://styles/mapbox/streets-v12', // Estilo inicial do Mapbox. Pode ser alterado para globe.
            center: [-7.8536599, 39.557191], // [lng, lat]
            zoom: 7,
            projection: 'globe' // Ativa a projeção de globo
        });

        // Adiciona controlos de navegação e geolocalização
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
            // Adicionar fontes e camadas para dados de incêndio e risco após o mapa carregar
            setupCustomLayerControls(); // Configura os controlos de camada personalizados
            addWeatherLayers(); // Adiciona as camadas meteorológicas como fontes
        });

        map.on('click', () => {
            const previouslyActiveIcon = document.querySelector('.dot-active');
            if (previouslyActiveIcon) {
                changeElementSizeById(previouslyActiveIcon.id, baseSize);
                previouslyActiveIcon.classList.remove('dot-active');
            }
            map.flyTo({ center: [-7.8536599, 39.557191], zoom: 7 });

            document.getElementById('map').style.width = '100%';
            document.querySelector('.sidebar').classList.remove('active');
            window.history.pushState('fogo', '', window.location.href.split('?')[0]);

            // Remove legendas se existirem
            if (currentRiskLegend) {
                currentRiskLegend.remove();
                currentRiskLegend = null;
            }
            if (currentWeatherLegend) {
                currentWeatherLegend.remove();
                currentWeatherLegend = null;
            }
        });
    }

    function removeAllMapboxLayersAndSources() {
        // Remover camadas e fontes de satélite, risco e incêndios
        const layerIds = ['modis-hotspots', 'modis-areas', 'viirs-hotspots', 'viirs-areas', 'fires-layer'];
        const sourceIds = ['modis-data', 'viirs-data', 'risk-data', 'fires-data'];

        // Remover camadas
        layerIds.forEach(id => {
            if (map.getLayer(id)) {
                map.removeLayer(id);
            }
        });

        // Remover fontes
        sourceIds.forEach(id => {
            if (map.getSource(id)) {
                map.removeSource(id);
            }
        });

        // Remover marcadores HTML de incêndio
        for (const fireId in currentFireMarkers) {
            currentFireMarkers[fireId].remove();
        }
        currentFireMarkers = {};
    }

    function createSatelliteLayers(satelliteData, type) {
        const hotspotFeatures = [];
        const areaFeatures = [];

        for (const continent in satelliteData) {
            for (const country in satelliteData[continent]) {
                const countryData = satelliteData[continent][country];
                countryData.points.forEach(point => {
                    hotspotFeatures.push(point);
                });

                if (countryData.areas && countryData.areas.features.length > 0) {
                    countryData.areas.features.forEach(area => areaFeatures.push(area));
                }
            }
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
                }
            });
        }

        // Adicionar eventos de clique para os hotspots e áreas
        map.on('click', `${type}-hotspots`, (e) => {
            const p = e.features[0].properties;
            const popupContent = `<b>Localização:</b> ${p.location}<br><hr style="margin: 4px 0;"><b>Brilho:</b> ${p.brightness}K<br><b>Data, Hora:</b> ${p.acq_date}<br><b>Satélite:</b> ${p.satellite}<br><b>Confiança:</b> ${p.confidence}<br><b>Dia/Noite:</b> ${p.daynight}<br><b>PRF:</b> ${p.frp}MW`;
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
            //const area_sq_km = turf.area(e.features[0]) / 1000000;
            new mapboxgl.Popup()
                .setLngLat(e.lngLat)
                //.setHTML(`Burnt Area: ${Math.round(area_sq_km)} KM²`)
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
            // Certifica-se de que as camadas são removidas se não houver dados
            if (map.getLayer('modis-hotspots')) map.removeLayer('modis-hotspots');
            if (map.getSource('modis-hotspots-data')) map.removeSource('modis-hotspots-data');
            if (map.getLayer('modis-areas')) map.removeLayer('modis-areas');
            if (map.getSource('modis-areas-data')) map.removeSource('modis-areas-data');
        }

        if (data.viirs) {
            createSatelliteLayers(data.viirs, 'viirs');
        } else {
            // Certifica-se de que as camadas são removidas se não houver dados
            if (map.getLayer('viirs-hotspots')) map.removeLayer('viirs-hotspots');
            if (map.getSource('viirs-hotspots-data')) map.removeSource('viirs-hotspots-data');
            if (map.getLayer('viirs-areas')) map.removeLayer('viirs-areas');
            if (map.getSource('viirs-areas-data')) map.removeSource('viirs-areas-data');
        }

        satelliteDataProcessed = true;
        checkAllDataProcessed();
    }

    function addRiskLegend(mapInstance) {
        if (currentRiskLegend) {
            currentRiskLegend.remove();
        }

        const legendContainer = document.createElement('div');
        legendContainer.className = 'mapbox-legend';
        const grades = [1, 2, 3, 4, 5];
        const labels = ['Reduzido', 'Moderado', 'Elevado', 'Muito Elevado', 'Máximo'];
        const colors = ['#509e2f', '#ffe900', '#e87722', '#cb333b', '#6f263d'];
        legendContainer.innerHTML += '<h4>Risco de Incêndio</h4>';
        for (let i = 0; i < grades.length; i++) {
            legendContainer.innerHTML +=
                `<i style="background:${colors[i]}" class="${labels[i]}"></i> ${labels[i]}<br>`;
        }

        currentRiskLegend = new mapboxgl.Marker(legendContainer, { anchor: 'bottom-right' })
            .setLngLat([-7.8536599, 39.557191]) // Posição arbitrária, o CSS irá posicionar
            .addTo(mapInstance);
        currentRiskLegend.getElement().style.position = 'absolute';
        currentRiskLegend.getElement().style.bottom = '20px';
        currentRiskLegend.getElement().style.right = '10px';
    }

    function generateWeatherLegend(title, stops, unit) {
        if (currentWeatherLegend) {
            currentWeatherLegend.remove();
        }

        const legendContainer = document.createElement('div');
        legendContainer.className = 'mapbox-legend';
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

        currentWeatherLegend = new mapboxgl.Marker(legendContainer, { anchor: 'bottom-right' })
            .setLngLat([-7.8536599, 39.557191]) // Posição arbitrária, o CSS irá posicionar
            .addTo(map);
        currentWeatherLegend.getElement().style.position = 'absolute';
        currentWeatherLegend.getElement().style.bottom = '20px';
        currentWeatherLegend.getElement().style.right = '10px';
    }

    // Custom Layer Control
    const customLayerControl = document.createElement('div');
    customLayerControl.className = 'mapboxgl-ctrl mapboxgl-ctrl-group custom-controls';

    const baseLayerToggle = document.createElement('div');
    baseLayerToggle.className = 'layer-category-title';
    baseLayerToggle.textContent = 'Camadas Base';
    customLayerControl.appendChild(baseLayerToggle);

    const baseLayers = {
        'Street': 'mapbox://styles/mapbox/streets-v12',
        'Street Dark': 'mapbox://styles/mapbox/dark-v11',
        'Street Light': 'mapbox://styles/mapbox/light-v11',
        'Outdoor': 'mapbox://styles/mapbox/outdoors-v12',
        'Satellite': 'mapbox://styles/mapbox/satellite-streets-v12',
    };

    for (const layerName in baseLayers) {
        const button = document.createElement('button');
        //button.innerHTML = `<img src="img/${layerName.toLowerCase().replace(' ', '_')}.png"> ${layerName}`; // Assumindo ícones
        button.onclick = () => {
            map.setStyle(baseLayers[layerName]);
            // Remover legendas ao mudar camada base
            if (currentRiskLegend) {
                currentRiskLegend.remove();
                currentRiskLegend = null;
            }
            if (currentWeatherLegend) {
                currentWeatherLegend.remove();
                currentWeatherLegend = null;
            }
        };
        customLayerControl.appendChild(button);
    }

    const overlayLayerToggle = document.createElement('div');
    overlayLayerToggle.className = 'layer-category-title';
    overlayLayerToggle.textContent = 'Camadas Adicionais';
    customLayerControl.appendChild(overlayLayerToggle);

    const overlayLayers = {
        'Fires': {
            id: 'fires-layer',
            type: 'symbol',
            source: 'fires-data',
            icon: 'img/fire.png',
            active: true
        },
        'MODIS Hotspots': {
            id: 'modis-hotspots',
            type: 'circle',
            source: 'modis-hotspots-data',
            icon: 'img/satellite.png',
            active: false
        },
        'VIIRS Hotspots': {
            id: 'viirs-hotspots',
            type: 'circle',
            source: 'viirs-hotspots-data',
            icon: 'img/satellite.png',
            active: false
        },
        'Risco de Incêndio (Hoje)': {
            id: 'risk-today-layer',
            type: 'fill',
            source: 'risk-today-data',
            icon: 'img/fire_risk.png',
            legend: 'risk',
            active: false
        },
        'Risco de Incêndio (Amanhã)': {
            id: 'risk-tomorrow-layer',
            type: 'fill',
            source: 'risk-tomorrow-data',
            icon: 'img/fire_risk.png',
            legend: 'risk',
            active: false
        },
        'Risco de Incêndio (Depois de Amanhã)': {
            id: 'risk-after-layer',
            type: 'fill',
            source: 'risk-after-data',
            icon: 'img/fire_risk.png',
            legend: 'risk',
            active: false
        },
        'Temperatura do Ar (2m)': {
            id: 'weather-TA2',
            type: 'raster',
            source: 'weather-TA2-source',
            icon: 'img/weather.png',
            legend: 'TA2',
            active: false
        },
        // Adicionar outras camadas meteorológicas aqui
    };

    const overlayButtons = {};

    function setupCustomLayerControls() {
        map.addControl({
            onAdd: function(mapInstance) {
                return customLayerControl;
            },
            onRemove: function() {
                customLayerControl.parentNode.removeChild(customLayerControl);
            }
        }, 'top-right');

        for (const layerKey in overlayLayers) {
            const layerConfig = overlayLayers[layerKey];
            const button = document.createElement('button');
            button.innerHTML = `<img src="${layerConfig.icon}"> ${layerKey}`;
            button.className = layerConfig.active ? 'active' : '';
            button.onclick = () => {
                layerConfig.active = !layerConfig.active;
                button.classList.toggle('active', layerConfig.active);

                // Gerir visibilidade das camadas no Mapbox
                if (map.getLayer(layerConfig.id)) {
                    map.setLayoutProperty(layerConfig.id, 'visibility', layerConfig.active ? 'visible' : 'none');
                }
                // Para camadas de satélite, gerir também as áreas
                if (layerConfig.id === 'modis-hotspots' && map.getLayer('modis-areas')) {
                    map.setLayoutProperty('modis-areas', 'visibility', layerConfig.active ? 'visible' : 'none');
                }
                if (layerConfig.id === 'viirs-hotspots' && map.getLayer('viirs-areas')) {
                    map.setLayoutProperty('viirs-areas', 'visibility', layerConfig.active ? 'visible' : 'none');
                }

                // Gerir legendas
                if (currentRiskLegend) {
                    currentRiskLegend.remove();
                    currentRiskLegend = null;
                }
                if (currentWeatherLegend) {
                    currentWeatherLegend.remove();
                    currentWeatherLegend = null;
                }

                // Adicionar legenda se a camada estiver ativa
                if (layerConfig.active && layerConfig.legend === 'risk') {
                    addRiskLegend(map);
                } else if (layerConfig.active && layerConfig.legend && weatherLegendsData[layerConfig.legend]) {
                    const legendInfo = weatherLegendsData[layerConfig.legend];
                    generateWeatherLegend(legendInfo.name, legendInfo.stops, legendInfo.unit);
                }
            };
            customLayerControl.appendChild(button);
            overlayButtons[layerKey] = button;
        }
    }


    function addWeatherLayers() {
        const appId = '89ae8b33d0bde5d8a89a7f5550e87869'; // Mantenha o seu ID OpenWeatherMap

        for (const layerName in weatherLayerMapping) {
            const weatherKey = weatherLayerMapping[layerName];
            const sourceId = `weather-${weatherKey}-source`;
            const layerId = `weather-${weatherKey}`;

            // Adicionar fonte de raster para cada camada meteorológica
            map.addSource(sourceId, {
                type: 'raster',
                tiles: [`http://maps.openweathermap.org/maps/2.0/weather/${weatherKey}/{z}/{x}/{y}?appid=${appId}`],
                tileSize: 256
            });

            // Adicionar camada de raster, inicialmente invisível
            map.addLayer({
                id: layerId,
                type: 'raster',
                source: sourceId,
                paint: {
                    'raster-opacity': 0.7
                },
                layout: {
                    'visibility': 'none' // Invisível por defeito
                }
            });

            // Adicionar a camada aos controlos de overlay
            overlayLayers[layerName] = {
                id: layerId,
                type: 'raster',
                source: sourceId,
                icon: 'img/weather.png', // Ícone genérico para meteorologia
                legend: weatherKey,
                active: false
            };
            // Se os controlos já estiverem configurados, adicionar o botão
            if (customLayerControl.childElementCount > 0) {
                const button = document.createElement('button');
                button.innerHTML = `<img src="${overlayLayers[layerName].icon}"> ${layerName}`;
                button.className = overlayLayers[layerName].active ? 'active' : '';
                button.onclick = () => {
                    overlayLayers[layerName].active = !overlayLayers[layerName].active;
                    button.classList.toggle('active', overlayLayers[layerName].active);
                    map.setLayoutProperty(layerId, 'visibility', overlayLayers[layerName].active ? 'visible' : 'none');

                    // Gerir legendas
                    if (currentRiskLegend) {
                        currentRiskLegend.remove();
                        currentRiskLegend = null;
                    }
                    if (currentWeatherLegend) {
                        currentWeatherLegend.remove();
                        currentWeatherLegend = null;
                    }

                    if (overlayLayers[layerName].active && overlayLayers[layerName].legend && weatherLegendsData[overlayLayers[layerName].legend]) {
                        const legendInfo = weatherLegendsData[overlayLayers[layerName].legend];
                        generateWeatherLegend(legendInfo.name, legendInfo.stops, legendInfo.unit);
                    }
                };
                customLayerControl.appendChild(button);
                overlayButtons[layerName] = button;
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
                mapInstance.flyTo({ center: [lng, lat], zoom: 10 });
            }

            iconHtml += `" id="${fireId}"></i>`;
            const sizeFactor = getPonderatedImportanceFactor(fire.importance, fire.statusCode, fireImportanceData);
            const size = sizeFactor * baseSize;

            const el = document.createElement('div');
            el.className = 'fire-marker'; // Classe para estilização global se necessário
            el.innerHTML = iconHtml;
            el.style.width = `${size}px`;
            el.style.height = `${size}px`;

            const marker = new mapboxgl.Marker({
                element: el,
                anchor: 'center'
            })
            .setLngLat([lng, lat])
            .addTo(mapInstance);

            currentFireMarkers[fireId] = marker; // Armazenar o marcador para fácil acesso

            el.addEventListener('click', (e) => {
                e.stopPropagation(); // Previne o clique do mapa de fechar o sidebar
                const activeIcon = el.querySelector('.dot'); // O ícone dentro do div do marcador Mapbox
                const previouslyActiveIcon = document.querySelector('.dot-active');

                if (previouslyActiveIcon && previouslyActiveIcon !== activeIcon) {
                    changeElementSizeById(previouslyActiveIcon.id, baseSize);
                    previouslyActiveIcon.classList.remove('dot-active');
                }

                changeElementSizeById(fireId, 48 + sizeFactor); // Aumentar o tamanho
                activeIcon.classList.add('dot-active');
                mapInstance.flyTo({ center: [lng, lat], zoom: 10 });

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
            // editBackgroundImages(); // Não necessário com Mapbox, usar ícones no custom control
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
                currentWorker.postMessage({ type: 'firesData' });
            } else if (type === 'satelliteResult') {
                addSatelliteLayers(data);
            } else if (type === 'riskResult') {
                loader.innerText = 'A adicionar camadas de risco...';
                for (const key in data) {
                    const geoJsonData = data[key];
                    const sourceId = `${key.toLowerCase().replace(/[^a-z0-9]/g, '-')}-data`;
                    const layerId = `${key.toLowerCase().replace(/[^a-z0-9]/g, '-')}-layer`;

                    if (map.getSource(sourceId)) {
                        map.getSource(sourceId).setData(geoJsonData);
                    } else {
                        map.addSource(sourceId, {
                            type: 'geojson',
                            data: geoJsonData
                        });
                        map.addLayer({
                            id: layerId,
                            type: 'fill',
                            source: sourceId,
                            paint: {
                                'fill-color': ['get', 'fillColor'], // Usa a propriedade fillColor do GeoJSON
                                'fill-opacity': 0.6,
                                'fill-outline-color': '#666'
                            },
                            layout: {
                                'visibility': 'none' // Invisível por defeito
                            }
                        });
                        // Adicionar a camada aos controlos de overlay, se ainda não estiver lá
                        if (!overlayLayers[key]) {
                            overlayLayers[key] = {
                                id: layerId,
                                text: layerId,
                                type: 'fill',
                                source: sourceId,
                                icon: 'img/fire_risk.png',
                                legend: 'risk', // Todas as camadas de risco usam a mesma legenda
                                active: false
                            };
                            // Adicionar botão ao controlo personalizado
                            if (customLayerControl.childElementCount > 0) {
                                const button = document.createElement('button');
                                button.innerHTML = `<img src="${overlayLayers[key].icon}"> ${key}`;
                                button.className = overlayLayers[key].active ? 'active' : '';
                                button.onclick = () => {
                                    overlayLayers[key].active = !overlayLayers[key].active;
                                    button.classList.toggle('active', overlayLayers[key].active);
                                    map.setLayoutProperty(layerId, 'visibility', overlayLayers[key].active ? 'visible' : 'none');

                                    // Gerir legendas
                                    if (currentRiskLegend) {
                                        currentRiskLegend.remove();
                                        currentRiskLegend = null;
                                    }
                                    if (currentWeatherLegend) {
                                        currentWeatherLegend.remove();
                                        currentWeatherLegend = null;
                                    }

                                    if (overlayLayers[key].active && overlayLayers[key].legend === 'risk') {
                                        addRiskLegend(map);
                                    }
                                };
                                customLayerControl.appendChild(button);
                                overlayButtons[key] = button;
                            }
                        }
                    }
                }
                riskDataProcessed = true;
                checkAllDataProcessed();
            } else if (type === 'firesResult') {
                loader.innerText = 'A adicionar novos dados de incêndios...';

                // Remover marcadores existentes antes de adicionar novos
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
                    // Ativa o clique no marcador após um pequeno atraso para garantir que tudo está renderizado
                    setTimeout(() => {
                        const fireElement = document.getElementById(fireIdFromUrl);
                        if (fireElement) {
                            fireElement.click();
                        }
                    }, 500);
                }
                // Marcar a camada de incêndios como processada e visível por defeito no controlo
                if (overlayButtons['Fires']) {
                    overlayLayers['Fires'].active = true;
                    overlayButtons['Fires'].classList.add('active');
                }
                checkAllDataProcessed();
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

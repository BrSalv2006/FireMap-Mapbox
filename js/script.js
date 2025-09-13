mapboxgl.accessToken = 'pk.eyJ1IjoiYnJzYWx2MjAwNiIsImEiOiJjbWU0cnA2dGIwZGdzMmxxdHN3aXFla3FhIn0.olUF6dEN497eCVOaaMnBow';
let map;
let currentWorker = null;
let currentRiskLegend = null;
let currentWeatherLegend = null;
let weatherLegendsData = {};
const loader = document.getElementById('loader');
const errorContainer = document.getElementById('error-container');
let satelliteDataProcessed = false;
let riskDataProcessed = false;
let allFireMarkersByStatus = {};
let detailsChart = null;
const isMobile = window.matchMedia("(max-width: 1024px)").matches;
const BASE_FIRE_SIZE = 22;
const WEATHER_API_APP_ID = '89ae8b33d0bde5d8a89a7f5550e87869';
const weatherLayerMapping = {
	'Temperatura do Ar (2m)': 'TA2', 'Temperatura do Ponto de Orvalho': 'TD2', 'Temperatura do Solo (0-10cm)': 'TS0', 'Temperatura do Solo (>10cm)': 'TS10', 'Pressão Atmosférica': 'APM', 'Vento (Velocidade & Direção)': 'WND', 'Velocidade Vento (10m)': 'WS10', 'Humidade Relativa': 'HRD0', 'Nebulosidade': 'CL', 'Precipitação Convectiva': 'PAC0', 'Intensidade Precipitação': 'PR0', 'Precipitação Acumulada': 'PA0', 'Precipitação Acumulada - Chuva': 'PAR0', 'Precipitação Acumulada - Neve': 'PAS0', 'Profundidade Neve': 'SD0'
};
const fireStatusLayers = {
	'Despacho': {
		statusCode: 3, icon: 'img/fire.png', defaultActive: true
	}, 'Despacho de 1º Alerta': {
		statusCode: 4, icon: 'img/fire.png', defaultActive: true
	}, 'Em Curso': {
		statusCode: 5, icon: 'img/fire.png', defaultActive: true
	}, 'Chegada ao TO': {
		statusCode: 6, icon: 'img/fire.png', defaultActive: true
	}, 'Em Resolução': {
		statusCode: 7, icon: 'img/fire.png', defaultActive: true
	}, 'Conclusão': {
		statusCode: 8, icon: 'img/fire.png', defaultActive: false
	}, 'Vigilância': {
		statusCode: 9, icon: 'img/fire.png', defaultActive: false
	}, 'Encerrada': {
		statusCode: 10, icon: 'img/fire.png', defaultActive: false
	}, 'Falso Alarme': {
		statusCode: 11, icon: 'img/fire.png', defaultActive: false
	}, 'Falso Alerta': {
		statusCode: 12, icon: 'img/fire.png', defaultActive: false
	}
};
const overlayLayers = {
	'MODIS': {
		id: 'modis-hotspots', type: 'circle', source: 'modis-hotspots-data', icon: 'img/satellite.png', active: false, category: 'satellite', hotspotData: null, areaData: null
	}, 'VIIRS': {
		id: 'viirs-hotspots', type: 'circle', source: 'viirs-hotspots-data', icon: 'img/satellite.png', active: false, category: 'satellite', hotspotData: null, areaData: null
	}, 'Ciclo Dia/Noite': {
		id: 'day-night-layer', type: 'fill', source: 'day-night-data', icon: 'img/day_night.png', active: false, category: 'day-night', sourceData: null
	}
};
const baseLayersConfig = {
	'Standard - Default - Dawn': {
		layer: 'mapbox://styles/mapbox/standard', style: 'dawn', theme: 'default'
	}, 'Standard - Default - Day': {
		layer: 'mapbox://styles/mapbox/standard', style: 'day', theme: 'default'
	}, 'Standard - Default - Dusk': {
		layer: 'mapbox://styles/mapbox/standard', style: 'dusk', theme: 'default'
	}, 'Standard - Default - Night': {
		layer: 'mapbox://styles/mapbox/standard', style: 'night', theme: 'default'
	}, 'Standard - Faded - Dawn': {
		layer: 'mapbox://styles/mapbox/standard', style: 'dawn', theme: 'faded'
	}, 'Standard - Faded - Day': {
		layer: 'mapbox://styles/mapbox/standard', style: 'day', theme: 'faded'
	}, 'Standard - Faded - Dusk': {
		layer: 'mapbox://styles/mapbox/standard', style: 'dusk', theme: 'faded'
	}, 'Standard - Faded - Night': {
		layer: 'mapbox://styles/mapbox/standard', style: 'night', theme: 'faded'
	}, 'Standard - Monochrome - Dawn': {
		layer: 'mapbox://styles/mapbox/standard', style: 'dawn', theme: 'monochrome'
	}, 'Standard - Monochrome - Day': {
		layer: 'mapbox://styles/mapbox/standard', style: 'day', theme: 'monochrome'
	}, 'Standard - Monochrome - Dusk': {
		layer: 'mapbox://styles/mapbox/standard', style: 'dusk', theme: 'monochrome'
	}, 'Standard - Monochrome - Night': {
		layer: 'mapbox://styles/mapbox/standard', style: 'night', theme: 'monochrome'
	}, 'Satellite - Dawn': {
		layer: 'mapbox://styles/mapbox/satellite-streets-v12', style: 'dawn'
	}, 'Satellite - Day': {
		layer: 'mapbox://styles/mapbox/satellite-streets-v12', style: 'day'
	}, 'Satellite - Dusk': {
		layer: 'mapbox://styles/mapbox/satellite-streets-v12', style: 'dusk'
	}, 'Satellite - Night': {
		layer: 'mapbox://styles/mapbox/satellite-streets-v12', style: 'night'
	}
};
const baseLayerButtons = {};
let baseLayerButtonsContainer, fireButtonsContainer, satelliteButtonsContainer, riskButtonsContainer, weatherButtonsContainer;

function initializeOverlayLayers() {
	for (const statusName in fireStatusLayers) {
		const statusConfig = fireStatusLayers[statusName];
		overlayLayers[statusName] = {
			id: `fires-status-${statusConfig.statusCode}-layer`, type: 'symbol', source: `fires-status-${statusConfig.statusCode}-data`, icon: statusConfig.icon, active: statusConfig.defaultActive, category: 'fire-status', statusCode: statusConfig.statusCode, sourceData: []
		};
	}
	for (const layerName in weatherLayerMapping) {
		const weatherKey = weatherLayerMapping[layerName];
		const sourceId = `weather-${weatherKey}-source`;
		const layerId = `weather-${weatherKey}`;
		overlayLayers[layerName] = {
			id: layerId, type: 'raster', source: sourceId, icon: 'img/weather.png', legend: weatherKey, active: false, category: 'weather'
		};
	}
}

function showErrorMessage(message) {
	const errorMessage = document.createElement('div');
	errorMessage.className = 'error-message';
	errorMessage.textContent = message;
	errorContainer.appendChild(errorMessage);
	setTimeout(() => errorMessage.remove(), 5000);
}

function initializeMap() {
	map = new mapboxgl.Map({
		container: 'map',
		style: baseLayersConfig['Standard - Default - Day'].layer,
		projection: 'globe',
		center: [-7.8536599, 39.557191],
		pitch: 0,
		bearing: 0,
		zoom: 6
	});
	map.addControl(new mapboxgl.NavigationControl(), 'top-left');
	map.addControl(new mapboxgl.GeolocateControl({
		positionOptions: {
			enableHighAccuracy: true
		}, trackUserLocation: true, showUserHeading: true
	}), 'top-left');
	map.once('style.load', () => {
		map.setTerrain({
			'exaggeration': 1
		});
	});
	map.on('load', () => {
		initializeLayerBar();
		setupBaseLayerButtons();
		addWeatherLayers();
		rebuildOverlayControls();
		updateBaseLayerButtonState('Standard - Default - Day');
		updateDayNightLayer();
	});
	map.on('click', () => {
		const previouslyActiveIcon = document.querySelector('.dot-active');
		if (previouslyActiveIcon) {
			previouslyActiveIcon.classList.remove('dot-active');
		}
		hideSidebar();
		window.history.pushState('fogo', '', window.location.href.split('?')[0]);
	});
}

function showSidebar() {
	document.body.classList.add('sidebar-open');
	document.querySelector('.sidebar').classList.add('active');
}

function hideSidebar() {
	document.body.classList.remove('sidebar-open');
	document.querySelector('.sidebar').classList.remove('active');
	map.flyTo({
		center: [-7.8536599, 39.557191],
		pitch: 0,
		bearing: 0,
		zoom: 6
	});
}

function createSatelliteLayers(satelliteData, type) {
	const hotspotSourceId = `${type}-hotspots-data`;
	const areaSourceId = `${type}-areas-data`;
	const hotspotLayerId = `${type}-hotspots`;
	const areaLayerId = `${type}-areas`;
	const hotspotFeatures = satelliteData.points || [];
	const areaFeatures = (satelliteData.areas && satelliteData.areas.features) ? satelliteData.areas.features : [];
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
	map.off('click', hotspotLayerId);
	map.off('mouseenter', hotspotLayerId);
	map.off('mouseleave', hotspotLayerId);
	map.off('click', areaLayerId);
	map.off('mouseenter', areaLayerId);
	map.off('mouseleave', areaLayerId);
	map.on('click', hotspotLayerId, (e) => {
		const p = e.features[0].properties;
		const popupContent = `<b>Brilho:</b> ${p.brightness}K<br><b>Data, Hora:</b> ${p.acq_date}<br><b>Satélite:</b> ${p.satellite}<br><b>Confiança:</b> ${p.confidence}<br><b>Dia/Noite:</b> ${p.daynight}<br><b>PRF:</b> ${p.frp}MW`;
		map.flyTo({
			center: e.features[0].geometry.coordinates, zoom: 12
		});
		new mapboxgl.Popup().setLngLat(e.features[0].geometry.coordinates).setHTML(popupContent).addTo(map);
	});
	map.on('mouseenter', hotspotLayerId, () => {
		map.getCanvas().style.cursor = 'pointer';
	});
	map.on('mouseleave', hotspotLayerId, () => {
		map.getCanvas().style.cursor = '';
	});
	map.on('click', areaLayerId, (e) => {
		new mapboxgl.Popup().setLngLat(e.lngLat).addTo(map);
	});
	map.on('mouseenter', areaLayerId, () => {
		map.getCanvas().style.cursor = 'pointer';
	});
	map.on('mouseleave', areaLayerId, () => {
		map.getCanvas().style.cursor = '';
	});
}

function addSatelliteLayers(data) {
	loader.innerText = 'A gerar camadas de satélite...';
	const updateOrRemoveLayer = (type, hasData) => {
		if (hasData) {
			createSatelliteLayers(data[type], type);
		} else {
			['hotspots', 'areas'].forEach(layerPart => {
				const layerId = `${type}-${layerPart}`;
				const sourceId = `${layerId}-data`;
				if (map.getLayer(layerId)) {
					map.removeLayer(layerId);
				}
				if (map.getSource(sourceId)) {
					map.removeSource(sourceId);
				}
			});
		}
	};
	updateOrRemoveLayer('modis', data.modis);
	updateOrRemoveLayer('viirs', data.viirs);
	satelliteDataProcessed = true;
	checkAllDataProcessed();
}

function addRiskLegend() {
	if (currentRiskLegend) {
		currentRiskLegend.remove();
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
	legendContainer.className = currentRiskLegend ? 'mapbox-legend mapbox-weather-legend' : 'mapbox-legend mapbox-weather-legend-alone';
	legendContainer.innerHTML += `<h4>${title}</h4>`;
	for (let i = 0; i < stops.length; i++) {
		const stop = stops[i];
		const nextStop = stops[i + 1];
		const label = nextStop ? `${stop.value} - ${nextStop.value} ${unit}` : `${stop.value} ${unit}+`;
		legendContainer.innerHTML += `<i style='background:${stop.color}'></i> ${label}<br>`;
	}
	map.getContainer().appendChild(legendContainer);
	currentWeatherLegend = legendContainer;
}

const createCategoryDropdown = (title, parent) => {
	const dropdownContainer = document.createElement('div');
	dropdownContainer.className = 'layer-dropdown';

	const toggleButton = document.createElement('button');
	toggleButton.className = 'dropdown-toggle';
	toggleButton.innerHTML = `${title}`;

	const menu = document.createElement('div');
	menu.className = 'dropdown-menu';

	if (isMobile) {
		document.body.appendChild(menu);
	} else {
		dropdownContainer.appendChild(menu);
	}

	toggleButton.addEventListener('click', (e) => {
		e.stopPropagation();

		if (isMobile) {
			const isOpen = menu.classList.contains('open');
			document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
			document.querySelectorAll('.dropdown-toggle.active').forEach(t => t.classList.remove('active'));

			if (!isOpen) {
				menu.classList.add('open');
				toggleButton.classList.add('active');
			}
		} else {
			const isOpen = dropdownContainer.classList.contains('open');
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

function setupBaseLayerButtons() {
	if (!baseLayerButtonsContainer) return;
	baseLayerButtonsContainer.innerHTML = '';
	for (const layerName in baseLayersConfig) {
		const button = document.createElement('button');
		button.innerHTML = `<img src='img/map.png' alt='map icon'>${layerName}`;
		button.addEventListener('click', () => {
			const {
				layer, style, theme
			} = baseLayersConfig[layerName];
			const previousActiveLayer = document.querySelector('.dropdown-menu button.active');
			const previousActiveLayerName = previousActiveLayer ? previousActiveLayer.textContent.split('-')[0].trim() : '';
			const newActiveLayerName = layerName.split('-')[0].trim();
			const isStandardStyle = layer.includes('mapbox/standard');
			if (isStandardStyle && previousActiveLayerName === newActiveLayerName) {
				map.setConfigProperty('basemap', 'lightPreset', style);
				map.setConfigProperty('basemap', 'theme', theme);
			} else {
				map.setStyle(layer, {
					config: {
						basemap: {
							lightPreset: style, theme: theme
						}
					}
				});
				if (currentRiskLegend) {
					currentRiskLegend.remove();
				}
				if (currentWeatherLegend) {
					currentWeatherLegend.remove();
				}
				currentRiskLegend = null;
				currentWeatherLegend = null;
				map.once('styledata', () => {
					addWeatherLayers();
					fetchAndApplyDynamicLayers();
					reapplyOverlayLayers();
					rebuildOverlayControls();
					if (overlayLayers['Ciclo Dia/Noite'].active) {
						updateDayNightLayer();
					}
					map.on('style.load', () => {
						map.setTerrain({
							'source': 'mapbox-dem',
							'exaggeration': 1
						});
					});
				});
			}
			updateBaseLayerButtonState(layerName);
		}, {
			passive: true
		});
		baseLayerButtonsContainer.appendChild(button);
		baseLayerButtons[layerName] = button;
	}
}

const overlayButtons = {};

function rebuildOverlayControls() {
	const containers = [fireButtonsContainer, satelliteButtonsContainer, riskButtonsContainer, weatherButtonsContainer];
	containers.forEach(container => {
		if (container) container.innerHTML = '';
	});
	if (overlayButtons['Ciclo Dia/Noite']) {
		overlayButtons['Ciclo Dia/Noite'].remove();
	}
	for (const key in overlayButtons) {
		delete overlayButtons[key];
	}
	const layerBar = document.getElementById('layer-bar');
	for (const layerKey in overlayLayers) {
		const layerConfig = overlayLayers[layerKey];
		const button = document.createElement('button');
		const iconSrc = layerConfig.icon || 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3C%2Fsvg%3E';
		button.classList.toggle('active', layerConfig.active);
		button.dataset.category = layerConfig.category;
		button.dataset.layerId = layerConfig.id;
		if (layerConfig.statusCode) {
			button.dataset.statusCode = layerConfig.statusCode;
		}
		button.addEventListener('click', () => {
			const { category, layerId, statusCode } = button.dataset;
			let newActiveState = !button.classList.contains('active');
			if (['risk', 'weather'].includes(category)) {
				for (const key in overlayLayers) {
					const currentLayer = overlayLayers[key];
					if (currentLayer.category === category && currentLayer.id !== layerId) {
						currentLayer.active = false;
						overlayButtons[key]?.classList.remove('active');
						if (map.getLayer(currentLayer.id)) {
							map.setLayoutProperty(currentLayer.id, 'visibility', 'none');
						}
					}
				}
			}
			if (['day-night'].includes(category)) {
				if (button.classList.contains('active')) {
					button.classList.remove('active');
				} else {
					button.classList.add('active');
				}
			}

			layerConfig.active = newActiveState;
			button.classList.toggle('active', newActiveState);
			if (category === 'fire-status') {
				if (allFireMarkersByStatus[statusCode]) {
					allFireMarkersByStatus[statusCode].forEach(marker => {
						marker.getElement().style.display = newActiveState ? 'block' : 'none';
					});
				}
			} else {
				if (map.getLayer(layerConfig.id)) {
					map.setLayoutProperty(layerConfig.id, 'visibility', layerConfig.active ? 'visible' : 'none');
				}
				if (layerConfig.id === 'modis-hotspots' && map.getLayer('modis-areas')) {
					map.setLayoutProperty('modis-areas', 'visibility', layerConfig.active ? 'visible' : 'none');
				}
				if (layerConfig.id === 'viirs-hotspots' && map.getLayer('viirs-areas')) {
					map.setLayoutProperty('viirs-areas', 'visibility', layerConfig.active ? 'visible' : 'none');
				}
			}
			if (category === 'risk') {
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
			} else if (category === 'weather') {
				if (layerConfig.active && layerConfig.legend && weatherLegendsData[layerConfig.legend]) {
					const legendInfo = weatherLegendsData[layerConfig.legend];
					generateWeatherLegend(legendInfo.name, legendInfo.stops, legendInfo.unit);
				} else if (currentWeatherLegend) {
					currentWeatherLegend.remove();
					currentWeatherLegend = null;
				}
			} else if (category === 'day-night') {
				if (newActiveState) {
					updateDayNightLayer();
				} else {
					if (map.getLayer('day-night-layer')) {
						map.setLayoutProperty('day-night-layer', 'visibility', 'none');
					}
				}
			}
		}, {
			passive: true
		});
		const appendButton = (container) => {
			if (container) container.appendChild(button);
		};
		if (layerConfig.category === 'day-night') {
			button.innerHTML = `<img src='${iconSrc}' srcset='${iconSrc} 18w, ${iconSrc.replace(".png", "_27.png")} 27w' alt='layer icon'>${layerKey}`;
			button.className = 'dropdown-toggle';
			button.classList.toggle('active', layerConfig.active);
			layerBar.appendChild(button);
		} else if (layerConfig.category === 'fire-status') {
			button.innerHTML = `<img src='${iconSrc}' srcset='${iconSrc} 22w, ${iconSrc.replace(".png", "_33.png")} 33w' alt='layer icon'>${layerKey}`;
			appendButton(fireButtonsContainer);
		} else if (layerConfig.category === 'satellite') {
			button.innerHTML = `<img src='${iconSrc}' srcset='${iconSrc} 22w, ${iconSrc.replace(".png", "_33.png")} 33w' alt='layer icon'>${layerKey}`;
			appendButton(satelliteButtonsContainer);
		} else if (layerConfig.category === 'risk') {
			button.innerHTML = `<img src='${iconSrc}' srcset='${iconSrc} 22w, ${iconSrc.replace(".png", "_33.png")} 33w' alt='layer icon'>${layerKey}`;
			appendButton(riskButtonsContainer);
		} else if (layerConfig.category === 'weather') {
			button.innerHTML = `<img src='${iconSrc}' srcset='${iconSrc} 22w, ${iconSrc.replace(".png", "_33.png")} 33w' alt='layer icon'>${layerKey}`;
			appendButton(weatherButtonsContainer);
		}
		overlayButtons[layerKey] = button;
	}
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

function updateDayNightLayer() {
	const dayNightGeoJSON = calculateDayNightPolygon();
	overlayLayers['Ciclo Dia/Noite'].sourceData = dayNightGeoJSON;
	if (overlayLayers['Ciclo Dia/Noite'].active) {
		if (!map.getSource('day-night-data')) {
			map.addSource('day-night-data', {
				type: 'geojson', data: dayNightGeoJSON
			});
			map.addLayer({
				id: 'day-night-layer', type: 'fill', source: 'day-night-data', paint: {
					'fill-color': '#000000', 'fill-opacity': 0.4
				}
			});
		} else {
			map.getSource('day-night-data').setData(dayNightGeoJSON);
		}
		map.setLayoutProperty('day-night-layer', 'visibility', 'visible');
	}
}

function reapplyOverlayLayers() {
	let activeRiskLayerKey = null;
	let activeWeatherLayerKey = null;
	for (const layerKey in overlayLayers) {
		const layerConfig = overlayLayers[layerKey];
		if (layerConfig.category === 'risk' && layerConfig.active) {
			if (activeRiskLayerKey) {
				layerConfig.active = false;
			} else {
				activeRiskLayerKey = layerKey;
			}
		} else if (layerConfig.category === 'weather' && layerConfig.active) {
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
			if (layerConfig.category === 'fire-status') {
				if (allFireMarkersByStatus[layerConfig.statusCode]) {
					allFireMarkersByStatus[layerConfig.statusCode].forEach(marker => marker.getElement().style.display = 'block');
				}
			} else if (layerConfig.category === 'satellite') {
				const hotspotSourceId = `${layerKey.toLowerCase().replace(' ', '-')}-hotspots-data`;
				const areaSourceId = `${layerKey.toLowerCase().replace(' ', '-')}-areas-data`;
				const hotspotLayerId = `${layerKey.toLowerCase().replace(' ', '-')}-hotspots`;
				const areaLayerId = `${layerKey.toLowerCase().replace(' ', '-')}-areas`;
				if (layerConfig.hotspotData && !map.getSource(hotspotSourceId)) {
					map.addSource(hotspotSourceId, {
						type: 'geojson', data: layerConfig.hotspotData
					});
					map.addLayer({
						id: hotspotLayerId, type: 'circle', source: hotspotSourceId, paint: {
							'circle-radius': 5, 'circle-color': '#FF0000', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 1, 'circle-opacity': 0.8
						}, layout: {
							'visibility': 'visible'
						}
					});
				}
				if (layerConfig.areaData && !map.getSource(areaSourceId)) {
					map.addSource(areaSourceId, {
						type: 'geojson', data: layerConfig.areaData
					});
					map.addLayer({
						id: areaLayerId, type: 'fill', source: areaSourceId, paint: {
							'fill-color': '#FF0000', 'fill-opacity': 0.2, 'fill-outline-color': '#FF0000'
						}, layout: {
							'visibility': 'visible'
						}
					});
				}
				if (map.getLayer(hotspotLayerId)) {
					map.setLayoutProperty(hotspotLayerId, 'visibility', 'visible');
				}
				if (map.getLayer(areaLayerId)) {
					map.setLayoutProperty(areaLayerId, 'visibility', 'visible');
				}
			} else if (layerConfig.category === 'risk') {
				if (layerConfig.sourceData && !map.getSource(layerConfig.source)) {
					map.addSource(layerConfig.source, {
						type: 'geojson', data: layerConfig.sourceData
					});
				}
				if (!map.getLayer(layerConfig.id)) {
					map.addLayer({
						id: layerConfig.id, type: 'fill', source: layerConfig.source, paint: {
							'fill-color': ['get', 'fillColor'], 'fill-opacity': 0.6, 'fill-outline-color': '#666666'
						}, layout: {
							'visibility': 'visible'
						}
					});
				}
				if (map.getLayer(layerConfig.id)) {
					map.setLayoutProperty(layerConfig.id, 'visibility', 'visible');
				}
				addRiskLegend();
			} else if (layerConfig.category === 'weather') {
				const weatherKey = weatherLayerMapping[layerKey];
				const sourceId = `weather-${weatherKey}-source`;
				const layerId = `weather-${weatherKey}`;
				if (!map.getSource(sourceId)) {
					map.addSource(sourceId, {
						type: 'raster', tiles: [`https://maps.openweathermap.org/maps/2.0/weather/${weatherKey}/{z}/{x}/{y}?appid=${WEATHER_API_APP_ID}`], tileSize: 256
					});
				}
				if (!map.getLayer(layerId)) {
					map.addLayer({
						id: layerId, type: 'raster', source: sourceId, paint: {
							'raster-opacity': 0.7
						}, layout: {
							'visibility': 'visible'
						}
					});
				}
				if (map.getLayer(layerId)) {
					map.setLayoutProperty(layerId, 'visibility', 'visible');
				}
				if (layerConfig.legend && weatherLegendsData[layerConfig.legend]) {
					const legendInfo = weatherLegendsData[layerConfig.legend];
					generateWeatherLegend(legendInfo.name, legendInfo.stops, legendInfo.unit);
				}
			} else if (layerConfig.category === 'day-night' && layerConfig.active) {
				updateDayNightLayer();
			}
		} else if (layerConfig.category === 'fire-status') {
			if (allFireMarkersByStatus[layerConfig.statusCode]) {
				allFireMarkersByStatus[layerConfig.statusCode].forEach(marker => marker.getElement().style.display = 'none');
			}
		} else if (layerConfig.category === 'day-night') {
			if (map.getLayer('day-night-layer')) {
				map.setLayoutProperty('day-night-layer', 'visibility', 'none');
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
	currentWorker.postMessage({
		type: 'satelliteData', dayRange: 1
	});
	currentWorker.postMessage({
		type: 'riskData'
	});
	currentWorker.postMessage({
		type: 'firesData'
	});
}

function addWeatherLayers() {
	if (!map.getSource('mapbox-dem')) {
		map.addSource('mapbox-dem', {
			type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14
		});
	}
	for (const layerName in weatherLayerMapping) {
		const weatherKey = weatherLayerMapping[layerName];
		const sourceId = `weather-${weatherKey}-source`;
		const layerId = `weather-${weatherKey}`;
		if (!map.getSource(sourceId)) {
			map.addSource(sourceId, {
				type: 'raster', tiles: [`https://maps.openweathermap.org/maps/2.0/weather/${weatherKey}/{z}/{x}/{y}?appid=${WEATHER_API_APP_ID}`], tileSize: 256
			});
		}
		if (!map.getLayer(layerId)) {
			map.addLayer({
				id: layerId, type: 'raster', source: sourceId, paint: {
					'raster-opacity': 0.7
				}, layout: {
					'visibility': 'none'
				}
			});
		}
	}
}

function addFireMarker(fire, mapInstance) {
	const {
		lat, lng, id: fireId, statusCode
	} = fire;
	const statusConfig = Object.values(fireStatusLayers).find(s => s.statusCode === statusCode);
	if (!statusConfig) {
		console.warn(`Unknown fire status: ${statusCode}`);
		return;
	}
	if (lat && lng) {
		let iconClass = `dot status-${statusCode}`;
		if (fire.important && [7, 8, 9].includes(statusCode)) {
			iconClass = 'dot status-99-r';
		} else if (fire.important) {
			iconClass = 'dot status-99';
		}
		const urlParams = new URLSearchParams(window.location.search);
		const fireIdFromUrl = urlParams.get('fogo');
		const isInitiallyActive = fireIdFromUrl === fireId.toString();
		if (isInitiallyActive) {
			iconClass += ' dot-active';

			if (isMobile) {
				mapInstance.flyTo({
					center: [lng, lat-0.25], zoom: 9
				});
			} else {
				mapInstance.flyTo({
					center: [lng, lat], zoom: 9
				});
			}
		}
		const el = document.createElement('div');
		el.className = 'fire-marker';
		el.innerHTML = `<i class='${iconClass}' id='fire-${fireId}'></i>`;
		el.style.width = `${BASE_FIRE_SIZE}px`;
		el.style.height = `${BASE_FIRE_SIZE}px`;
		const layerKey = Object.keys(fireStatusLayers).find(key => fireStatusLayers[key].statusCode === statusCode);
		if (overlayLayers[layerKey] && !overlayLayers[layerKey].active) {
			el.style.display = 'none';
		}
		const marker = new mapboxgl.Marker({
			element: el, anchor: 'center'
		}).setLngLat([lng, lat]).addTo(mapInstance);
		if (!allFireMarkersByStatus[statusCode]) {
			allFireMarkersByStatus[statusCode] = [];
		}
		allFireMarkersByStatus[statusCode].push(marker);
		el.addEventListener('click', (e) => {
			e.stopPropagation();
			const activeIcon = el.querySelector('.dot');
			const previouslyActiveIcon = document.querySelector('.dot-active');
			if (previouslyActiveIcon && previouslyActiveIcon !== activeIcon) {
				previouslyActiveIcon.classList.remove('dot-active');
			}
			activeIcon.classList.add('dot-active');
			if (isMobile) {
				mapInstance.flyTo({
					center: [lng, lat-0.25], zoom: 9
				});
			} else {
				mapInstance.flyTo({
					center: [lng, lat], zoom: 9
				});
			}
			updateSidebarDetails(fire, lat, lng);
			showSidebar();
			window.history.pushState('fogo', '', `?fogo=${fireId}`);
		}, {
			passive: true
		});
	}
}

function updateSidebarDetails(fire, lat, lng) {
	const locationLink = `<a href='https://www.google.com/maps/search/${lat},${lng}' target='_blank' rel='noopener noreferrer'><i class='fas fa-map-marker-alt'></i> ${lat},${lng}</a>`;
	document.querySelector('.f-local').innerHTML = fire.location;
	document.querySelector('.f-man').textContent = fire.man;
	document.querySelector('.f-aerial').textContent = fire.aerial;
	document.querySelector('.f-terrain').textContent = fire.terrain;
	document.querySelector('.f-location').innerHTML = locationLink;
	document.querySelector('.f-nature').textContent = fire.natureza;
	document.querySelector('.f-update').textContent = fire.updated;
	document.querySelector('.f-start').textContent = fire.startDate;
	fetchFireDetails(fire.id);
}

async function fetchFireDetails(id) {
	await Promise.all([plotFireData(id), fetchAndRenderStatus(id), fetchAndRenderDanger(id), fetchAndRenderMeteo(id), fetchAndRenderExtra(id)]);
}

async function plotFireData(id) {
	const url = `https://api-dev.fogos.pt/fires/data?id=${id}`;
	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		const data = await response.json();
		const canvas = document.getElementById('fireChart');
		if (!canvas) {
			console.error('Canvas element #fireChart not found.');
			return;
		}
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
}

async function fetchAndRender(url, selector, toggleClass = null) {
	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		let data = await response.text();
		const element = document.querySelector(selector);
		const parentRow = element ? element.closest('.card') : null;
		if (data && (data.trim().length > 2)) {
			element.innerHTML = data.replace(/\s<img[\s\S]*\/>/, '');;
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
}

const fetchAndRenderStatus = (id) => fetchAndRender(`https://fogos.pt/views/status/${id}`, '.f-status');
const fetchAndRenderDanger = (id) => fetchAndRender(`https://fogos.pt/views/risk/${id}`, '.f-danger', 'active');
const fetchAndRenderMeteo = (id) => fetchAndRender(`https://fogos.pt/views/meteo/${id}`, '.f-meteo');
const fetchAndRenderExtra = (id) => fetchAndRender(`https://fogos.pt/views/extra/${id}`, '.f-extra', 'active');

function checkAllDataProcessed() {
	if (satelliteDataProcessed && riskDataProcessed) {
		loader.style.display = 'none';
		const urlParams = new URLSearchParams(window.location.search);
		const fireIdFromUrl = urlParams.get('fogo');
		if (fireIdFromUrl) {
			setTimeout(() => {
				const targetMarkerElement = document.getElementById(`fire-${fireIdFromUrl}`);
				if (targetMarkerElement) {
					targetMarkerElement.click();
				}
			}, 500);
		}
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
		const {
			type, message, data
		} = e.data;
		if (type === 'progress') {
			loader.innerText = message;
		} else if (type === 'initDataComplete') {
			loader.innerText = 'Dados geográficos carregados. A obter dados de incêndios e risco...';
			fetchAndApplyDynamicLayers();
		} else if (type === 'satelliteResult') {
			overlayLayers['MODIS'].hotspotData = {
				type: 'FeatureCollection', features: data.modis?.points || []
			};
			overlayLayers['MODIS'].areaData = {
				type: 'FeatureCollection', features: data.modis?.areas?.features || []
			};
			overlayLayers['VIIRS'].hotspotData = {
				type: 'FeatureCollection', features: data.viirs?.points || []
			};
			overlayLayers['VIIRS'].areaData = {
				type: 'FeatureCollection', features: data.viirs?.areas?.features || []
			};
			addSatelliteLayers(data);
			rebuildOverlayControls();
		} else if (type === 'riskResult') {
			loader.innerText = 'A adicionar camadas de risco...';
			let activeRiskLayerKey = null;
			for (const key in data) {
				const geoJsonData = data[key];
				const sourceId = `${key.toLowerCase().replace(/[^a-z0-9]/g, '-')}-data`;
				const layerId = `${key.toLowerCase().replace(/[^a-z0-9]/g, '-')}-layer`;
				if (!map.getSource(sourceId)) {
					map.addSource(sourceId, {
						type: 'geojson', data: geoJsonData
					});
				} else {
					map.getSource(sourceId).setData(geoJsonData);
				}
				if (!map.getLayer(layerId)) {
					map.addLayer({
						id: layerId, type: 'fill', source: sourceId, paint: {
							'fill-color': ['get', 'fillColor'], 'fill-opacity': 0.6, 'fill-outline-color': '#666666'
						}, layout: {
							'visibility': 'none'
						}
					});
				}
				const wasActive = overlayLayers[key]?.active || false;
				overlayLayers[key] = {
					id: layerId, type: 'fill', source: sourceId, icon: 'img/fire_risk.png', legend: 'risk', active: wasActive, category: 'risk', sourceData: geoJsonData
				};
				if (wasActive) {
					activeRiskLayerKey = key;
				}
			}
			if (activeRiskLayerKey) {
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
			for (const statusCode in allFireMarkersByStatus) {
				allFireMarkersByStatus[statusCode].forEach(marker => marker.remove());
			}
			allFireMarkersByStatus = {};
			data.forEach(fire => addFireMarker(fire, map));
			checkAllDataProcessed();
			rebuildOverlayControls();
		} else if (type === 'error') {
			showErrorMessage(message);
			if (message.includes('incêndio')) {
				satelliteDataProcessed = true;
			} else if (message.includes('risco') || message.includes('Concelhos GeoJSON')) {
				riskDataProcessed = true;
			}
			checkAllDataProcessed();
		}
	};
	currentWorker.onerror = (e) => {
		console.error('Worker error:', e);
		showErrorMessage('Ocorreu um erro crítico no worker. Verifique a consola para detalhes.');
		satelliteDataProcessed = true;
		riskDataProcessed = true;
		checkAllDataProcessed();
	};
}

async function loadWeatherLegendsData() {
	try {
		const response = await fetch('json/weather_legends.json');
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		weatherLegendsData = await response.json();
	} catch (error) {
		console.error('Error loading weather legends:', error);
		showErrorMessage(`Erro ao carregar legendas meteorológicas: ${error.message}`);
	}
}

window.onload = async () => {
	initializeOverlayLayers();
	initializeMap();
	await loadWeatherLegendsData();
	setupWorker();
	await currentWorker.postMessage({
		type: 'initData', url: window.location.href.split('?')[0]
	});
};
L.Control.Boating = L.Control.extend({
    options: {
        position: 'topleft',
        legendPosition: 'topright',
        boatColor: '#3388ff',
        otherBoatColor: '#ff8c00', // Orange color for online ships
        offlineBoatColor: '#202978', // Blue color for offline ships
        fleetUrl: 'location.json',
        offlineUrl: 'geolocation.json', // Path to offline GeoJSON
        fleetInterval: 5000,
        lineColor1: 'transparent',
        lineColor2: 'transparent',
        circleColor: '#3388ff',
        cacheLength: 4,
        myBoatName: '' // Add a default name for the local device
    },
    onAdd: function (map) {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control')
        const link = L.DomUtil.create('a', 'leaflet-bar-part leaflet-bar-part-single', container)
        this.icon = L.DomUtil.create('span', 'leaflet-control-boating-arrow', link)
        link.href = '#'
        L.DomEvent.on(link, 'click', function (e) {
            L.DomEvent.stopPropagation(e)
            L.DomEvent.preventDefault(e)
            this.onClick()
        }, this)
        this.legend = L.control({
            position: this.options.legendPosition,
            lineColor1: this.options.lineColor1,
            lineColor2: this.options.lineColor2
        })
        const pluginScope = this;
        this.legend.onAdd = function (map) {
            const container = L.DomUtil.create('div', 'leaflet-control leaflet-bar leaflet-control-boating-legend')
            container.innerHTML = `
            <div id="weather-sidebar-widget-item" style="align-items: center;">
                <div id="dashboard_container">
                    <div class="detail-item-rigth">
                        <div class="detail-label">
                            <span class="current-condition-text" id="boatName"></span>
                        </div>
                        <div class="detail-label">
                            <span class="current-condition-text">TOTAL TIME</span>
                        </div>
                        <div class="detail-value flex-center">
                            <div class="detail-item">
                                <div class="detail-value flex-center">
                                    <div class="f-temp-sm">
                                        <span id="timeElapsed"></span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="detail-label">
                            <span class="current-condition-text">HEADING</span>
                        </div>
                        <div class="detail-value flex-center">
                            <div class="detail-item">
                                <div class="detail-value flex-center">
                                    <div class="f-heading">
                                        <span id="heading"> °</span>
                                        <span style='vertical-align: super; font-size: 15px;'>°</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="detail-label">
                            <span class="current-condition-text">SPEED</span>
                        </div>
                        <div class="detail-value flex-center">
                            <div class="detail-item">
                                <div class="detail-value flex-center">
                                    <div class="f-heading">
                                        <span id="knots"></span>
                                        <span
                                            style="font-weight: bold; color: var(--text-main); font-size:10px;">kt</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="detail-label">
                            <span class="current-condition-text">DISTANCE</span>
                        </div>
                        <div class="detail-value flex-center">
                            <div class="detail-item">
                                <div class="detail-value flex-center">
                                    <div class="f-heading">
                                        <span id="totalDist"></span>
                                        <span
                                            style="font-weight: bold; color: var(--text-main); font-size:7px;">NM</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`
            this.boatName = container.querySelector('#boatName')
            this.boatDesc = container.querySelector('#boatDesc')
            this.heading = container.querySelector('#heading')
            this.knots = container.querySelector('#knots')
            this.timeElapsed = container.querySelector('#timeElapsed')
            this.timeElapsed = container.querySelector('#timeElapsed')
            this.totalDist = container.querySelector('#totalDist')
            return container
        }
        this.boat = L.marker([0, 0], {
            icon: L.divIcon({
                iconAnchor: [11.5, 11.5], iconSize: [23, 23], className: 'ship',
                html: `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" id="boat-svg" style="filter: drop-shadow(0px 0px 3px rgba(255,255,255,0.8));">
                <path d="M 128 512 C 128 512 128 128 256 0 C 384 128 384 512 384 512 Z" fill="${this.options.boatColor}" stroke="white" stroke-width="40" stroke-linejoin="round"/>
              </svg>`,
            })
        })
        this.boat.on('add', function () { this.svg = this.getElement().querySelector('#boat-svg') })
        this.circle = L.circle([0, 0], { color: this.options.circleColor, stroke: false })
        this.line = L.polyline([[0, 0], [0, 0]], { color: this.options.lineColor2, lineCap: 'square' })
        this.linebg = L.polyline([[0, 0], [0, 0]], { color: this.options.lineColor1 })
        this.fleetMarkers = {};
        this.offlineMarkers = {}; // Object to track offline blue boats
        this.followedUserId = null;
        this.sessionData = null;
        this.fleetTrackLine = L.polyline([], { color: '#3388ff', weight: 3 });
        this.fleetCircle = L.circle([0, 0], { color: '#3388ff', stroke: false })
        this.viewedRouteLayer = L.polyline([], { color: '#3388ff', weight: 3 });
        this.viewedRouteID = null;
        setTimeout(() => this.updateRouteList(), 500);
        return container
    },
    cosD: function (deg) { return Math.cos(deg * Math.PI / 180) },
    sinD: function (deg) { return Math.sin(deg * Math.PI / 180) },
    atan2D: function (x, y) { return ((Math.atan2(x, y) * 180 / Math.PI) + 360) % 360 },
    isRequesting: function () { return this.icon.classList.contains('requesting') },
    isLocating: function () { return this.icon.classList.contains('locating') },
    isFollowing: function () { return this.icon.classList.contains('following') },
    onClick: function () {
        if (window.activeSearchTrack && window.activeSearchTrack.name) {
            if (this.isFollowing()) {
                if (window.activeSearchTrack.session) this.saveRoute(window.activeSearchTrack.session);
                if (this._map.hasLayer(window.activeSearchTrack.line)) this._map.removeLayer(window.activeSearchTrack.line);
                if (this._map.hasLayer(window.activeSearchTrack.circle)) this._map.removeLayer(window.activeSearchTrack.circle);
                window.activeSearchTrack.name = null;
                window.activeSearchTrack.session = null;
                this.icon.classList.remove('following', 'requesting', 'locating');
                this._map.removeControl(this.legend);
                if (this._stopwatchTimer) clearInterval(this._stopwatchTimer);
            } else {
                this._map.panTo(window.activeSearchTrack.session.lastLatLng);
                this.follow();
            }
            return;
        }
        if (this.followedUserId && this.sessionData) {
            if (this.isFollowing()) {
                this.saveRoute(this.sessionData);
                this.followedUserId = null;
                this.sessionData = null;
                if (this._map.hasLayer(this.fleetTrackLine)) this._map.removeLayer(this.fleetTrackLine);
                if (this._map.hasLayer(this.fleetCircle)) this._map.removeLayer(this.fleetCircle);
                this.icon.classList.remove('following', 'requesting', 'locating');
                this._map.removeControl(this.legend);
                if (this._stopwatchTimer) clearInterval(this._stopwatchTimer);
                const listContainer = document.getElementById('device-list-container');
                if (listContainer) {
                    const items = listContainer.querySelectorAll('a.report-routes');
                    items.forEach(item => item.style.backgroundColor = 'transparent');
                }
            } else {
                this._map.panTo(this.sessionData.lastLatLng);
                this.follow();
            }
            return;
        }
        if (this.isFollowing()) this.stop()
        else if (this.isLocating()) { this._map.panTo(this.lastPosition.latlng); this.follow(); }
        else if (!this.isRequesting()) this.request()
    },
    onDragStart: function () { if (this.isFollowing()) this.unfollow() },
    onMoveEnd: function () { if ((this.isLocating() || this.isFollowing()) && this.lastPosition) this.updateLine(this.lastPosition) },
    request: function () {
        this._map.on('moveend', this.onMoveEnd, this)
        this._map.on('dragstart', this.onDragStart, this)
        this._map.on('locationfound', this.onLocationFound, this)
        this._map.on('locationerror', this.onLocationError, this)
        this._map.on('zoomend', this.updateSizes, this) // <-- Add this line
        this._map.locate({ watch: true, enableHighAccuracy: true })
        this.icon.classList.remove('following', 'locating')
        this.icon.classList.add('requesting')
        this.fetchFleetData();
        this.fetchOfflineData();
        this.fleetIntervalId = setInterval(() => {
            this.fetchFleetData();
            this.fetchOfflineData();
        }, this.options.fleetInterval);
        this.myStartTime = new Date(); // New: Start time
        this.myTotalDistance = 0;      // New: Distance counter
        this.myLastLatLng = null;      // New: Last coordinate tracker
        this._map.locate({ watch: true, enableHighAccuracy: true })
    },
    follow: function () {
        this._map.options.scrollWheelZoom = 'center'
        this._map.options.doubleClickZoom = 'center'
        this.icon.classList.remove('requesting', 'locating')
        this.icon.classList.add('following')
    },
    unfollow: function () {
        this._map.options.scrollWheelZoom = true
        this._map.options.doubleClickZoom = true
        this.icon.classList.remove('requesting', 'following')
        this.icon.classList.add('locating')
    },
    stop: function () {
        this._map.stopLocate()
        this._map.off('moveend', this.onMoveEnd, this)
        this._map.off('dragstart', this.onDragStart, this)
        this._map.off('locationfound', this.onLocationFound, this)
        this._map.off('locationerror', this.onLocationError, this)
        this._map.off('zoomend', this.updateSizes, this) // <-- Add this line
        this._map.options.scrollWheelZoom = true
        this._map.options.doubleClickZoom = true
        this.icon.classList.remove('requesting', 'following', 'locating')
        this._map.removeControl(this.legend)
        this._map.removeLayer(this.circle)
        this._map.removeLayer(this.linebg)
        this._map.removeLayer(this.line)
        this._map.removeLayer(this.boat)
        if (this._stopwatchTimer) {
            clearInterval(this._stopwatchTimer);
            this._stopwatchTimer = null;
        }
        if (this.fleetIntervalId) clearInterval(this.fleetIntervalId);
        if (this.sessionData) {
            this.saveRoute(this.sessionData);
        }
        for (let id in this.fleetMarkers) this._map.removeLayer(this.fleetMarkers[id]);
        this.fleetMarkers = {};
        for (let name in this.offlineMarkers) this._map.removeLayer(this.offlineMarkers[name]);
        this.offlineMarkers = {};
        if (this._map.hasLayer(this.fleetTrackLine)) this._map.removeLayer(this.fleetTrackLine);
        if (this._map.hasLayer(this.fleetCircle)) this._map.removeLayer(this.fleetCircle);
        this.followedUserId = null;
        this.sessionData = null;
        const listContainer = document.getElementById('device-list-container');
        if (listContainer) listContainer.innerHTML = '';
        this.myStartTime = null;
        this.myTotalDistance = 0;
        this.myLastLatLng = null;
    },
    fetchOfflineData: function () {
        const cacheBuster = '?t=' + new Date().getTime();
        fetch(this.options.offlineUrl + cacheBuster)
            .then(response => response.json())
            .then(data => this.updateOfflineMarkers(data))
            .catch(err => console.error('Error fetching offline fleet data:', err));
    },
    updateOfflineMarkers: function (data) {
        if (!data || !data.features) return;
        const activeOfflineNames = new Set();
        data.features.forEach(feature => {
            if (!feature.properties || !feature.properties.name) return;
            if (!feature.properties || !feature.properties.number) return;
            const shipName = String(feature.properties.name);
            const shipNumber = String(feature.properties.number);
            activeOfflineNames.add(shipName);
            const lng = parseFloat(feature.geometry.coordinates[0]);
            const lat = parseFloat(feature.geometry.coordinates[1]);
            const latlng = [lat, lng];
            if (this.offlineMarkers[shipName]) {
                this.offlineMarkers[shipName].setLatLng(latlng);
            } else {
                const marker = L.marker(latlng, {
                    title: shipName, // Used by propertyName: 'title'
                    speed: 0,                // Used by your buildTip
                    heading: 0,            // Used by your click event
                    boatLabel: '../assets/blue-icon.png',
                    icon: L.divIcon({
                        iconAnchor: [11.5, 11.5], iconSize: [23, 23], className: 'boat offline-boat',
                        html: `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" style="transform: rotate(45deg); filter: drop-shadow(0px 0px 3px rgba(255,255,255,0.8));"> 
                        <path d="M 128 512 C 128 512 128 128 256 0 C 384 128 384 512 384 512 Z" fill="${this.options.offlineBoatColor}" stroke="white" stroke-width="40" stroke-linejoin="round"/> 
                    </svg>`
                    })
                });
                marker.bindTooltip(`${shipNumber}`, {
                    permanent: true, direction: 'top', className: 'transparent-tooltip', offset: [0, -10]
                });
                if (window.template5) {
                    window.template5.addLayer(marker);
                } else {
                    marker.addTo(this._map);
                }
                this.offlineMarkers[shipName] = marker;
            }
        });
        for (let name in this.offlineMarkers) {
            if (!activeOfflineNames.has(name)) {
                this._map.removeLayer(this.offlineMarkers[name]);
                delete this.offlineMarkers[name];
            }
        }
    },
    fetchFleetData: function () {
        const cacheBuster = '?t=' + new Date().getTime();
        fetch(this.options.fleetUrl + cacheBuster)
            .then(response => response.json())
            .then(data => this.updateFleetMarkers(data))
            .catch(err => console.error('Error fetching fleet data:', err));
    },
    updateFleetMarkers: function (data) {
        let listContainer = document.getElementById('device-list-container');
        const activeUserIds = new Set(data.map(ship => String(ship.UserId)));
        for (let id in this.fleetMarkers) {
            if (!activeUserIds.has(String(id))) {
                this._map.removeLayer(this.fleetMarkers[id]);
                delete this.fleetMarkers[id];
            }
        }
        data.forEach(ship => {
            const shipIdStr = String(ship.UserId);
            const latlng = [parseFloat(ship.lat), parseFloat(ship.lng)];
            const newLeafletLatLng = L.latLng(latlng[0], latlng[1]);
            const heading = parseFloat(ship.bearing || 0);
            if (this.fleetMarkers[shipIdStr]) {
                const marker = this.fleetMarkers[shipIdStr];
                marker.setLatLng(latlng);
                const el = marker.getElement();
                if (el) {
                    const svg = el.querySelector('svg');
                    if (svg) svg.style.transform = 'rotate(' + heading + 'deg)';
                }
                if (this.followedUserId === shipIdStr && this.sessionData) {
                    const distMoved = this.sessionData.lastLatLng.distanceTo(newLeafletLatLng);
                    if (distMoved > 0) {
                        this.sessionData.totalDistance += distMoved;
                        this.sessionData.path.push(newLeafletLatLng);
                        this.sessionData.lastLatLng = newLeafletLatLng;
                        this.fleetTrackLine.setLatLngs(this.sessionData.path);
                        this.fleetCircle.setLatLng(newLeafletLatLng);
                        if (this.isFollowing()) {
                            this._map.panTo(newLeafletLatLng);
                        }
                    }
                    this.updateFleetLegend(ship);
                }
            } else {
                const marker = L.marker(latlng, {
                    icon: L.divIcon({
                        iconAnchor: [11.5, 11.5], iconSize: [23, 23], className: 'boat fleet-boat',
                        html: `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" style="transform: rotate(${heading}deg); filter: drop-shadow(0px 0px 3px rgba(255,255,255,0.8));">
                        <path d="M 128 512 C 128 512 128 128 256 0 C 384 128 384 512 384 512 Z" fill="${this.options.otherBoatColor}" stroke="white" stroke-width="40" stroke-linejoin="round"/>
                        </svg>`
                    })
                }).addTo(this._map);
                marker.bindTooltip(`${ship.Number || 'Unknown'}`, {
                    permanent: true, direction: 'top', className: 'transparent-tooltip', offset: [0, -10]
                });
                this.fleetMarkers[shipIdStr] = marker;
            }
        });
        if (listContainer) {
            listContainer.innerHTML = '';
            data.forEach(ship => {
                const shipIdStr = String(ship.UserId);
                let isCameraActive = false;
                let activeSenderId = shipIdStr;
                const checkId = shipIdStr ? String(shipIdStr).toLowerCase() : "";
                const cleanName = ship.Name ? String(ship.Name).toLowerCase().replace(/\s+/g, '') : "";
                const cleanNum = ship.Number ? String(ship.Number).toLowerCase().replace(/\s+/g, '') : "";
                const extractedNum = cleanName.replace(/\D/g, '');
                if (window.activeCameras) {
                    for (let camKey in window.activeCameras) {
                        if (!camKey || camKey === "undefined" || camKey === "null") continue;
                        let webrtcId = window.activeCameras[camKey];
                        let cleanCam = camKey.toLowerCase().replace(/\s+/g, '');
                        if (!cleanCam) continue;
                        if (cleanName && cleanName === cleanCam) { isCameraActive = true; activeSenderId = webrtcId; break; }
                        if (cleanNum && cleanNum === cleanCam) { isCameraActive = true; activeSenderId = webrtcId; break; }
                        if (extractedNum.length > 0 && extractedNum === cleanCam) { isCameraActive = true; activeSenderId = webrtcId; break; }
                        if (checkId === cleanCam || checkId.endsWith("." + cleanCam) || checkId.endsWith("_" + cleanCam)) { isCameraActive = true; activeSenderId = webrtcId; break; }
                    }
                }
                const listItem = document.createElement('li'); // Creating an <li> element
                listItem.id = `device-item-${shipIdStr}`;
                listItem.style.marginBottom = '5px';
                listItem.style.listStyle = 'none'; // Ensures no bullets are shown
                listItem.className = 'device-list-item';
                let displayName = ship.Name || 'Unknown';
                let speedVal = ship.speed || ship.Speed || "0.00";
                let formattedSpeed = parseFloat(speedVal).toFixed(1);
                let iconPath = ship.icon || '../assets/orange-icon.png';
                let dotColor = isCameraActive ? '#28a745' : 'transparent';
                let dotHtml = `<span style="display: inline-block; width: 10px; height: 1px; border-radius: 50%; background-color: ${dotColor}; margin-left: 4px; box-shadow: 0 0 4px ${dotColor}80;" title="${isCameraActive ? 'Connected' : 'Not Connected'}"></span>`;
                listItem.innerHTML = `<a href="#" class="search-result-item" style="padding-right: 10px; display: flex; width: 100%; height: 35px;">
                    <img src="${iconPath}" style="width: 18px; height: 18px; margin-top: 5px;">
                    <span style="font-family: Futura Lt BT, Prompt, sans-serif; font-size: 14px; font-weight: bold; margin-top: 10px; margin-left: 10px;">${displayName} ${dotHtml}</span>
                    <span style="font-family: Futura Lt BT, Prompt, sans-serif; margin-left: auto; font-size: 12px; color: #5f6368; font-weight: bold; margin-top: 15px; margin-right: 10px;">${formattedSpeed} kt</span>
                    </a>`;
                listItem.addEventListener('click', (event) => {
                    event.preventDefault();
                    if (this._map && this.fleetMarkers[shipIdStr]) {
                        const currentLatLng = this.fleetMarkers[shipIdStr].getLatLng();
                        if (this.followedUserId && this.followedUserId !== shipIdStr) {
                            if (this.sessionData) {
                                this.saveRoute(this.sessionData);
                            }
                        }
                        if (this.viewedRouteLayer && this._map.hasLayer(this.viewedRouteLayer)) {
                            this._map.removeLayer(this.viewedRouteLayer);
                            this.viewedRouteID = null;
                        }
                        this.followedUserId = shipIdStr;
                        this.icon.classList.remove('locating', 'requesting');
                        this.icon.classList.add('following');

                        if (this.legend && !this.legend._map) {
                            this._map.addControl(this.legend);
                        }
                        if (this._map.hasLayer(this.circle)) this._map.removeLayer(this.circle);
                        if (this._map.hasLayer(this.line)) this._map.removeLayer(this.line);
                        if (this._map.hasLayer(this.linebg)) this._map.removeLayer(this.linebg);
                        this.updateFleetLegend(ship);
                        this.sessionData = {
                            boatName: ship.Name || 'Unknown',
                            startTime: new Date(),
                            path: [currentLatLng],
                            totalDistance: 0,
                            lastLatLng: currentLatLng
                        };
                        this.fleetTrackLine.setLatLngs([currentLatLng]);
                        if (!this._map.hasLayer(this.fleetTrackLine)) this.fleetTrackLine.addTo(this._map);
                        this.fleetCircle.setLatLng(currentLatLng);
                        if (!this._map.hasLayer(this.fleetCircle)) this.fleetCircle.addTo(this._map);
                        this._map.setView(currentLatLng, 18);
                        this.fleetMarkers[shipIdStr].openTooltip();
                        const items = listContainer.querySelectorAll('a.search-result-item');
                        items.forEach(item => {
                            let hasCam = item.querySelector('span[title="Connected"]') !== null;
                            item.style.backgroundColor = hasCam ? 'rgba(40, 167, 69, 0.2)' : 'rgba(255, 255, 255, 0.05)';
                        });
                        if (isCameraActive) {
                            if (typeof window.activatePiPMode === 'function') {
                                window.activatePiPMode(ship.Name, activeSenderId);
                            }
                        } else {
                            if (typeof window.closePiP === 'function') {
                                window.closePiP();
                            }
                        }
                    }
                });
                listContainer.appendChild(listItem);
            });
        } else {
            console.warn("Sidebar missing: Make sure coastal_stations.html has <ul id='device-list-container'></ul>");
        }
    },
    saveRoute: function (session) {
        if (!session || session.path.length < 2) return;
        var endTime = new Date();
        var startTime = session.startTime;
        var durationMs = endTime - startTime;
        var durationMinutes = (durationMs / 60000).toFixed(2);
        var distanceNM = session.totalDistance / 1852;
        var durationHours = durationMs / 3600000;
        var avgSpeed = durationHours > 0 ? (distanceNM / durationHours) : 0;
        var timeRoute = "";
        var totalSeconds = Math.floor(durationMs / 1000);
        var hours = Math.floor(totalSeconds / 3600);
        var minutes = Math.floor((totalSeconds % 3600) / 60);
        var seconds = totalSeconds % 60;
        if (hours > 0) { timeRoute += hours + "h "; }
        timeRoute += minutes + "m " + seconds + "s";
        var routeItem = {
            id: Date.now(),
            boatName: session.boatName,
            date: startTime.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', calendar: 'buddhist' }),
            startTime: startTime.toLocaleTimeString('th-TH'),
            endTime: endTime.toLocaleTimeString('th-TH'),
            distance: distanceNM.toFixed(2),
            time: timeRoute,
            totalMinutes: durationMinutes,
            speed: avgSpeed.toFixed(2),
            path: session.path
        };
        var routes = JSON.parse(localStorage.getItem('boatRoutes')) || [];
        routes.push(routeItem);
        localStorage.setItem('boatRoutes', JSON.stringify(routes));
        this.updateRouteList();
    },
    updateRouteList: function () {
        var container = document.getElementById('report-routes-container');
        if (!container) return;
        var routes = JSON.parse(localStorage.getItem('boatRoutes')) || [];
        container.innerHTML = '';
        var reversedRoutes = routes.slice().reverse();
        reversedRoutes.forEach((item) => {
            var li = document.createElement('li');
            li.style.marginBottom = '15px';
            var anchor = document.createElement('a');
            anchor.href = '#';
            anchor.className = 'report-routes';
            anchor.onclick = function () { return false; };
            var titleName = document.createElement('h5');
            titleName.className = 'text-white text-uppercase m-b-20';
            titleName.textContent = '' + item.boatName + '';
            anchor.appendChild(titleName);
            var titleTime = document.createElement('h5');
            titleTime.className = 'text-white text-uppercase m-b-20';
            titleTime.textContent = '' + item.date + ' เวลา ' + item.startTime + ' - ' + item.endTime + ' น.';
            anchor.appendChild(titleTime);
            var table = document.createElement('table');
            table.setAttribute('width', '100%');
            var tbody = document.createElement('tbody');
            var tr = document.createElement('tr');
            function createInfoCell(label, value, unit) {
                var td = document.createElement('td');
                td.setAttribute('width', '33%');
                var spanLabel = document.createElement('span');
                spanLabel.className = 'text-white';
                spanLabel.textContent = label;
                td.appendChild(spanLabel);
                var h1Value = document.createElement('h1');
                h1Value.className = 'm-b-20 text-white counter';
                h1Value.textContent = value;
                td.appendChild(h1Value);
                var h6Unit = document.createElement('h6');
                h6Unit.className = 'text-white text-uppercase m-b-20';
                h6Unit.textContent = unit;
                td.appendChild(h6Unit);
                return td;
            }
            tr.appendChild(createInfoCell('ระยะทาง', item.distance, 'ไมล์ทะเล'));
            tr.appendChild(createInfoCell('เวลา(นาที)', item.totalMinutes, item.time));
            tr.appendChild(createInfoCell('ความเร็วเดินทาง', item.speed, 'ไมล์ทะเล/ชั่วโมง'));
            tbody.appendChild(tr);
            table.appendChild(tbody);
            anchor.appendChild(table);
            var actionContainer = document.createElement('div');
            actionContainer.style.display = 'flex';
            actionContainer.style.justifyContent = 'space-between';
            actionContainer.style.marginTop = '0px';
            var deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-danger';
            deleteBtn.style.fontSize = '14px';
            deleteBtn.innerHTML = '<i class="fa fa-trash" style="font-size: 20px; margin-right: 5px;"></i> ลบ';
            anchor.appendChild(deleteBtn);
            li.appendChild(anchor);
            anchor.addEventListener('click', (e) => {
                if (e.target === deleteBtn) return;
                this.viewRoute(item);
            });
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteRoute(item.id);
            });
            actionContainer.appendChild(deleteBtn);
            li.appendChild(anchor);
            li.appendChild(actionContainer);
            container.appendChild(li);
        });
    },
    deleteRoute: function (id) {
        var routes = JSON.parse(localStorage.getItem('boatRoutes')) || [];
        routes = routes.filter(function (r) { return r.id !== id; });
        localStorage.setItem('boatRoutes', JSON.stringify(routes));
        if (this.viewedRouteID === id && this.viewedRouteLayer) {
            this._map.removeLayer(this.viewedRouteLayer);
            this.viewedRouteID = null;
        }
        this.updateRouteList();
    },
    viewRoute: function (item) {
        if (!item.path || item.path.length === 0) return;
        if (this.viewedRouteLayer && this._map.hasLayer(this.viewedRouteLayer)) {
            this.viewedRouteLayer.setLatLngs([]);
            this._map.removeLayer(this.viewedRouteLayer);
        }
        this.viewedRouteLayer.setLatLngs(item.path);
        this.viewedRouteLayer.addTo(this._map);
        this.viewedRouteID = item.id;
        this._map.fitBounds(this.viewedRouteLayer.getBounds());
    },
    onLocationFound: function (e) {
        e.latlngDMS = this.latlngDMS(e);
        e.smooth = this.smoothMotion(e);
        if (this.isRequesting()) {
            this._map.addControl(this.legend);
            this._map.addLayer(this.boat);
            if (!this.followedUserId) {
                this._map.addLayer(this.circle);
                this._map.addLayer(this.linebg);
                this._map.addLayer(this.line);
            }
            this.follow();
        }
        this.updateBoat(e);
        if (!this.followedUserId) {
            if (this.isFollowing()) { this._map.setView(e.latlng, 18); }
            this.updateLegend(e);
            this.updateCircle(e);
            this.updateLine(e);
            this.updateSizes()
        }
        this.lastPosition = e;
    },
    onLocationError: function (e) {
        console.error(e)
        if (e.code === 1) {
            alert('unlock geolocation please')
            this.stop()
        }
    },
    updateSizes: function () {
        if (!this._map) return;
        const currentZoom = this._map.getZoom();
        let newIconSize;
        let newWeight; // We also need to step the line weight to match
        if (currentZoom >= 15) {
            newIconSize = 25;
            newWeight = 1;    // Original maximum weight
        } else if (currentZoom >= 8) {
            newIconSize = 14;
            newWeight = 0.25;    // Medium weight
        } else {
            newIconSize = 11;
            newWeight = 0.5;    // Minimum weight
        }
        if (this.boat && this.boat.getElement()) {
            const boatEl = this.boat.getElement();
            boatEl.style.width = newIconSize + 'px';
            boatEl.style.height = newIconSize + 'px';
            boatEl.style.marginLeft = -(newIconSize / 2) + 'px';
            boatEl.style.marginTop = -(newIconSize / 2) + 'px';
            if (this.boat.svg) {
                this.boat.svg.style.width = '100%';
                this.boat.svg.style.height = '100%';
            }
        }
        if (this.line) this.line.setStyle({ weight: newWeight });
        if (this.linebg) this.linebg.setStyle({ weight: newWeight + 2 });
    },
    updateCircle: function (e) {
        this.circle.setLatLng(e.latlng)
        this.circle.setRadius(e.accuracy)
    },
    updateBoat: function (e) {
        const heading = e.smooth.heading
        this.boat.svg.style.transform = 'rotate(' + heading + 'deg)'
        this.boat.setLatLng(e.latlng)
    },
    updateLine: function (e) {
        const zoom = this._map.getZoom()
        const mapBounds = this._map.getBounds()
        const heading = e.smooth.heading
        const speed = e.smooth.speed
        const length = Math.max(
            mapBounds.getNorthWest().distanceTo(e.latlng),
            mapBounds.getNorthEast().distanceTo(e.latlng),
            mapBounds.getSouthEast().distanceTo(e.latlng),
            mapBounds.getSouthWest().distanceTo(e.latlng),
        )
        const lengthDeg = length * 360 / 40000000
        const dirPoint = L.latLng(
            e.latlng.lat + (lengthDeg * this.cosD(heading)),
            e.latlng.lng + (lengthDeg * this.sinD(heading) / this.cosD(e.latlng.lat)),
        )
        this.line.setLatLngs([e.latlng, dirPoint])
        this.linebg.setLatLngs([e.latlng, dirPoint])
        const metersPerPixel = 40000000 * this.cosD(e.latlng.lat) / (256 * Math.pow(2, zoom))
        const pixelsPerHour = speed / metersPerPixel * 3600
        this.line.setStyle({
            dashArray: pixelsPerHour + ',' + pixelsPerHour,
            dashOffset: pixelsPerHour,
        })
    },
    updateFleetLegend: function (ship) {
        const heading = Math.round(parseFloat(ship.bearing || 0));
        const speed = parseFloat(ship.speed || 0).toFixed(2);
        let distNM = "0.00";
        if (this.sessionData) {
            distNM = (this.sessionData.totalDistance / 1852).toFixed(2);
            if (this.legend.boatName) this.legend.boatName.innerHTML = this.sessionData.boatName;
        }
        let descHtml = "";
        if (ship.Type || ship.UnitName) {
            descHtml = `Type: ${ship.Type || 'Unknown'}<br>Unit: ${ship.UnitName || 'Unknown'}`;
        } else if (ship.mmis || ship.callsign) {
            descHtml = `MMSI: ${ship.mmis || 'N/A'}<br>Callsign: ${ship.callsign || 'N/A'}`;
        } else {
            descHtml = "No description available";
        }
        if (this.legend.boatDesc) this.legend.boatDesc.innerHTML = descHtml;
        if (this.legend.heading) this.legend.heading.innerHTML = heading;
        if (this.legend.knots) this.legend.knots.innerHTML = speed;
        if (this.legend.totalDist) this.legend.totalDist.innerHTML = distNM;
        if (this._stopwatchTimer) clearInterval(this._stopwatchTimer);
        if (this.sessionData && this.sessionData.startTime && this.legend.timeElapsed) {
            const startTime = this.sessionData.startTime;
            const timeElement = this.legend.timeElapsed;
            const tick = () => {
                const diff = new Date() - startTime;
                const h = Math.floor(diff / 3600000);
                const m = Math.floor((diff % 3600000) / 60000);
                const s = Math.floor((diff % 60000) / 1000);
                timeElement.innerHTML = `${h}h ${m}m ${s}s`;
            };

            tick();
            this._stopwatchTimer = setInterval(tick, 1000);
        }
    },
    updateLegend: function (e) {
        const nautic = 40000 / 360 / 60
        const heading = Math.round(e.smooth.heading)
        const speed = Math.round(e.smooth.speed * 36 / nautic) / 10
        if (this.myLastLatLng) {
            this.myTotalDistance += this.myLastLatLng.distanceTo(e.latlng);
        }
        this.myLastLatLng = e.latlng;
        const distNM = (this.myTotalDistance / 1852).toFixed(2);
        if (this.legend.boatName) this.legend.boatName.innerHTML = this.options.myBoatName;
        this.legend.heading.innerHTML = heading;
        this.legend.knots.innerHTML = speed;
        if (this.legend.totalDist) this.legend.totalDist.innerHTML = distNM;
        if (this._stopwatchTimer) clearInterval(this._stopwatchTimer);
        if (this.myStartTime && this.legend.timeElapsed) {
            const startTime = this.myStartTime;
            const timeElement = this.legend.timeElapsed;
            const tick = () => {
                const diff = new Date() - startTime;
                const h = Math.floor(diff / 3600000);
                const m = Math.floor((diff % 3600000) / 60000);
                const s = Math.floor((diff % 60000) / 1000);
                timeElement.innerHTML = `${h}h ${m}m ${s}s`;
            };
            tick();
            this._stopwatchTimer = setInterval(tick, 1000);
        }
    },
    latlngDMS: function (e) {
        function dms(coord) {
            let float = Math.abs(coord)
            let d = Math.floor(float)
            float = (float - d) * 60
            let m = Math.floor(float)
            float = (float - m) * 60
            let s = Math.round(float)
            if (s === 60) {
                m = m + 1
                s = 0
            }
            if (m === 60) {
                d = d + 1
                m = 0
            }
            if (s < 10) {
                s = '0' + s
            }
            if (m < 10) {
                m = '0' + m
            }
            return d + '&deg; ' + m + '&apos; ' + s + '&quot; '
        }
        return {
            lat: dms(e.latlng.lat) + ((e.latlng.lat > 0) ? 'N' : 'S'),
            lng: dms(e.latlng.lng) + ((e.latlng.lng > 0) ? 'E' : 'W'),
        }
    },
    smoothMotion: (function () {
        const cache = []
        return function (e) {
            cache.push(e)
            if (cache.length > this.options.cacheLength) {
                cache.shift()
            }
            const sumX = cache.reduce(
                (sum, e) => sum + (e.speed || 0) * this.cosD(e.heading || 0), 0
            )
            const sumY = cache.reduce(
                (sum, e) => sum + (e.speed || 0) * this.sinD(e.heading || 0), 0
            )
            return {
                speed: Math.sqrt(sumX ** 2 + sumY ** 2) / cache.length,
                heading: this.atan2D(sumY, sumX),
            }
        }
    })(),
})
L.control.boating = function (options) {
    return new L.Control.Boating(options)
}
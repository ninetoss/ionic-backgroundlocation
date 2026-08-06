L.Control.Boating = L.Control.extend({
    options: {
        position: 'topleft',
        legendPosition: 'topright',
        boatColor: '#3388ff',
        peerColor: '#ff8833',
        fleetUrl: 'location.json',
        offlineUrl: 'geolocation.json', // Path to offline GeoJSON
        lineColor1: '#3388ff',
        lineColor2: 'transparent',
        circleColor: '#3388ff',
        cacheLength: 4
    },
    onAdd: function (map) {
        this.peers = {};           // Store other users here
        this.myMotionCache = [];   // Store smoothing data for "Me" here
        map.on('rotate moveend', function () {
            let b = (map && map.getBearing) ? map.getBearing() : 0;
            if (typeof window.updateAllBoatMarkersRotation === 'function') {
                window.updateAllBoatMarkersRotation(b);
            }
            if (typeof window.updatePolylineMeasureArrowsRotation === 'function') {
                window.updatePolylineMeasureArrowsRotation(b);
            }
        });
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
        this.legend.onAdd = function (map) {
            const container = L.DomUtil.create('div', 'leaflet-control leaflet-bar leaflet-control-boating-legend');
            container.innerHTML = `
            <div id="weather-sidebar-widget-item" style="align-items: center;">
                <div id="boat_dashboard_container">
                    <div class="detail-item-rigth">
                        <div class="detail-label">
                            <span class="f-temp-sm" id="boatName"></span>
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
                        <div id="boatToContainer" style="display: none;">
                            <div class="detail-label">
                                <span class="current-condition-text">BOAT TO</span>
                            </div>
                            <div class="detail-value flex-center">
                                <div class="detail-item">
                                    <div class="detail-value flex-center">
                                        <div class="f-heading">
                                            <span id="totalBoatTo"></span>
                                            <span style="font-weight: bold; color: var(--text-main); font-size:7px;"></span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div id="obstacleWarningContainer" style="display: none;">
                            <div class="detail-label">
                                <span class="current-condition-text"
                                    style="color: red; font-weight: bold; animation: blink 1s linear infinite;">OBSTACLE
                                    AHEAD</span>
                            </div>
                            <div class="detail-value flex-center">
                                <div class="detail-item" style="width: 100%;">
                                    <div class="detail-value flex-center" style="justify-content: flex-end; width: 100%;">
                                        <div class="f-heading" style="text-align: right;">
                                            <span id="obstacleDist"
                                                style="color: red; font-weight: bold; animation: blink 1s linear infinite;"></span>
                                            <span
                                                style="font-weight: bold; color: red; font-size:7px; animation: blink 1s linear infinite;">NM</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div id="pier_dashboard_container" style="display: none;">
                    <div class="detail-item-rigth">
                        <div class="detail-label">
                            <span class="f-temp-sm" id="pierName"></span>
                        </div>
                        <div class="detail-label">
                            <span class="current-condition-text">PROVINCE</span>
                        </div>
                        <div class="detail-value flex-center">
                            <div class="detail-item">
                                <div class="detail-value flex-center">
                                    <div class="current-condition-value">
                                        <span id="pierProvince"></span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="detail-label">
                            <span class="current-condition-text">PIER TYPE</span>
                        </div>
                        <div class="detail-value flex-center">
                            <div class="detail-item">
                                <div class="detail-value flex-center">
                                    <div class="current-condition-value">
                                        <span id="pierType"></span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="detail-label">
                            <span class="current-condition-text">COORDINATES</span>
                        </div>
                        <div class="detail-value flex-center">
                            <div class="detail-item">
                                <div class="detail-value flex-center">
                                    <div class="current-condition-value">
                                        <span id="pierCoords"></span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
            this.boatName = container.querySelector('#boatName');
            this.heading = container.querySelector('#heading');
            this.knots = container.querySelector('#knots');
            this.timeElapsed = container.querySelector('#timeElapsed');
            this.totalDist = container.querySelector('#totalDist');
            this.totalBoatTo = container.querySelector('#totalBoatTo');
            this.boatToContainer = container.querySelector('#boatToContainer');
            this.obstacleWarningContainer = container.querySelector('#obstacleWarningContainer');
            this.obstacleDist = container.querySelector('#obstacleDist');
            this._boatDashboard = container.querySelector('#boat_dashboard_container');
            this._pierDashboard = container.querySelector('#pier_dashboard_container');
            this._pierName = container.querySelector('#pierName');
            this._pierProvince = container.querySelector('#pierProvince');
            this._pierType = container.querySelector('#pierType');
            this._pierCoords = container.querySelector('#pierCoords');
            return container;
        };
        this.legend.updatePierData = function (name, province, pierType, lat, lng) {
            if (this._boatDashboard) this._boatDashboard.style.display = 'none';
            if (this._pierDashboard) this._pierDashboard.style.display = 'block';
            if (this._pierName) this._pierName.innerText = name || '-';
            if (this._pierProvince) this._pierProvince.innerText = province || '-';
            if (this._pierType) this._pierType.innerText = pierType || '-';
            if (this._pierCoords) {
                let parsedLat = parseFloat(lat);
                let parsedLng = parseFloat(lng);
                if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
                    let latStr = Math.abs(parsedLat).toFixed(5) + (parsedLat >= 0 ? '°N' : '°S');
                    let lngStr = Math.abs(parsedLng).toFixed(5) + (parsedLng >= 0 ? '°E' : '°W');
                    this._pierCoords.innerText = `${latStr}, ${lngStr}`;
                } else {
                    this._pierCoords.innerText = '-';
                }
            } else {
                console.warn("ไม่พบ Element id='pierCoords' ใน HTML"); // แจ้งเตือนใน Console ถ้ายึดตัวแปรไม่สำเร็จ
            }
        };
        this.boat = L.marker([0, 0], {
            icon: L.divIcon({
                iconAnchor: [11.5, 11.5],
                iconSize: [23, 23],
                className: 'ship',
                html: `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" id="boat-svg" style="filter: drop-shadow(0px 0px 3px rgba(255,255,255,0.8));">
                <path d="M 128 512 C 128 512 128 128 256 0 C 384 128 384 512 384 512 Z" fill="${this.options.boatColor}" stroke="white" stroke-width="40" stroke-linejoin="round"/>
            </svg>`
            })
        })
        this.boat.on('add', function () {
            this.svg = this.getElement().querySelector('#boat-svg')
        })
        this.circle = L.circle([0, 0], { color: this.options.circleColor, stroke: false })
        this.line = L.polyline([[0, 0], [0, 0]], { color: this.options.lineColor2, lineCap: 'square' })
        this.linebg = L.polyline([[0, 0], [0, 0]], { color: this.options.lineColor1 })
        this.track = L.polyline([], { color: '#3388ff', weight: 3 })
        this.trackingLine = L.polyline([], { color: 'transparent', weight: 3, dashArray: '5, 10' })
        this.evasiveLine = L.polyline([], { color: '#ff0000', weight: 3, dashArray: '5, 10' })
        this.viewedRouteLayer = L.polyline([], { color: '#3388ff', weight: 3 });
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
                if (window.activeSearchTrack.session) {
                    var sessionToSave = window.activeSearchTrack.session;
                    if (sessionToSave.path && sessionToSave.path.length < 2 && this.sessionData && this.sessionData.path && this.sessionData.path.length >= 2) {
                        sessionToSave.path = this.sessionData.path;
                        sessionToSave.totalDistance = this.sessionData.totalDistance;
                        sessionToSave.startTime = this.sessionData.startTime;
                        this.sessionData.path = [];
                    }
                    if (sessionToSave.path && sessionToSave.path.length === 1) {
                        sessionToSave.path.push(sessionToSave.path[0]);
                    }
                    this.saveRoute(sessionToSave);
                }
                if (window.activeSearchTrack.line && this._map && this._map.hasLayer(window.activeSearchTrack.line)) {
                    this._map.removeLayer(window.activeSearchTrack.line);
                }
                if (window.activeSearchTrack.circle && this._map && this._map.hasLayer(window.activeSearchTrack.circle)) {
                    this._map.removeLayer(window.activeSearchTrack.circle);
                }
                window.activeSearchTrack.name = null;
                window.activeSearchTrack.session = null;
                this.stop();
                const cm = document.querySelector('.create-minimap');
                if (cm) cm.classList.remove('active');
            } else {
                let targetLL = null;
                if (window.activeSearchTrack.session && window.activeSearchTrack.session.lastLatLng) {
                    targetLL = window.activeSearchTrack.session.lastLatLng;
                } else if (window.activeSearchTrack.layer && typeof window.activeSearchTrack.layer.getLatLng === 'function') {
                    targetLL = window.activeSearchTrack.layer.getLatLng();
                }
                if (targetLL && this._map && typeof this._map.panTo === 'function') {
                    this._map.panTo(targetLL);
                }
                this.follow();
            }
            return;
        }
        if (window.activePatrolRoute && window.activePatrolRoute.length > 0) {
            if (this.isFollowing()) {
                if (this.sessionData) {
                    this.saveRoute(this.sessionData);
                }
                this.stop();
            } else {
                let centerLatLng = null;
                if (window.followSimulation && window.followSimulation.marker && typeof window.followSimulation.marker.getLatLng === 'function') {
                    centerLatLng = window.followSimulation.marker.getLatLng();
                } else if (window.followSimulation && window.followSimulation.data && typeof window.followSimulation.data.lat === 'number' && typeof window.followSimulation.data.lng === 'number') {
                    centerLatLng = L.latLng(window.followSimulation.data.lat, window.followSimulation.data.lng);
                } else if (this.lastPosition && this.lastPosition.latlng) {
                    centerLatLng = this.lastPosition.latlng;
                } else if (this.sessionData && this.sessionData.lastLatLng) {
                    centerLatLng = this.sessionData.lastLatLng;
                }
                if (centerLatLng && this._map && typeof this._map.panTo === 'function') {
                    this._map.panTo(centerLatLng);
                }
                this.follow();
            }
            return;
        }
        if (this.followedPeerId && this.sessionData) {
            if (this.isFollowing()) {
                this.saveRoute(this.sessionData);
                this.followedPeerId = null;
                this.stop();
                const cd = document.querySelector('.create-display');
                if (cd) cd.classList.remove('active');
            } else {
                this._map.panTo(this.sessionData.lastLatLng);
                this.follow();
            }
            return;
        }
        if (this.viewedRouteLayer && this._map.hasLayer(this.viewedRouteLayer)) {
            this._map.removeLayer(this.viewedRouteLayer);
            return;
        }
        if (this.isFollowing()) this.stop()
        else if (this.isLocating()) {
            let boatLL = null;
            if (this.lastPosition && this.lastPosition.latlng) {
                boatLL = this.lastPosition.latlng;
            } else if (window.followSimulation && window.followSimulation.data && typeof window.followSimulation.data.lat === 'number') {
                boatLL = L.latLng(window.followSimulation.data.lat, window.followSimulation.data.lng);
            }
            if (boatLL && this._map && typeof this._map.panTo === 'function') {
                this._map.panTo(boatLL);
            }
            this.follow();
        }
        else if (!this.isRequesting()) this.request()
    },
    request: function () {
        this._map.on('moveend', this.onMoveEnd, this)
        this._map.on('dragstart', this.onDragStart, this)
        this._map.on('locationfound', this.onLocationFound, this)
        this._map.on('locationerror', this.onLocationError, this)
        this._map.on('zoomend', this.updateSizes, this)
        this._map.locate({ watch: true, enableHighAccuracy: true, timeout: 60000, maximumAge: 0 })
        this.icon.classList.remove('following')
        this.icon.classList.remove('locating')
        this.icon.classList.add('requesting')
        if (window.Android && window.Android.startTracking) {
            window.Android.startTracking();
        }
        this.myStartTime = new Date();
        this.myTotalDistance = 0;
        this.myLastLatLng = null;
    },
    stop: function () {
        this.stopStopwatch();
        if (this.legend && this.legend.timeElapsed) {
            this.legend.timeElapsed.innerHTML = "0h 0m 0s";
        }
        window.activePatrolRoute = null;
        if (window.simTrackingLine && this._map.hasLayer(window.simTrackingLine)) {
            this._map.removeLayer(window.simTrackingLine);
            window.simTrackingLine = null;
        }
        if (window.simEvasiveLine && this._map.hasLayer(window.simEvasiveLine)) {
            this._map.removeLayer(window.simEvasiveLine);
            window.simEvasiveLine = null;
        }
        if (this.legend && this.legend.obstacleWarningContainer) {
            this.legend.obstacleWarningContainer.style.display = 'none';
        }
        if (window.followSimulation) {
            if (window.followSimulation.interval) clearInterval(window.followSimulation.interval);
            if (window.followSimulation.data) {
                window.followSimulation.data.speed = 0;
                let speedInput = document.getElementById('follow-speed');
                if (speedInput) speedInput.value = "0";
            }
            window.followSimulation = null;
        }
        if (this.sessionData) {
            this.saveRoute(this.sessionData);
            this.sessionData = null;
        }
        if (this.trackingLine && this._map.hasLayer(this.trackingLine)) {
            this._map.removeLayer(this.trackingLine);
        }
        if (this.evasiveLine && this._map.hasLayer(this.evasiveLine)) {
            this._map.removeLayer(this.evasiveLine);
        }
        if (window.activeSearchTrack) {
            window.activeSearchTrack.name = null;
            if (window.activeSearchTrack.line && this._map.hasLayer(window.activeSearchTrack.line)) this._map.removeLayer(window.activeSearchTrack.line);
            if (window.activeSearchTrack.circle && this._map.hasLayer(window.activeSearchTrack.circle)) this._map.removeLayer(window.activeSearchTrack.circle);
        }
        this._map.stopLocate()
        this._map.off('moveend', this.onMoveEnd, this)
        this._map.off('dragstart', this.onDragStart, this)
        this._map.off('locationfound', this.onLocationFound, this)
        this._map.off('locationerror', this.onLocationError, this)
        this._map.off('zoomend', this.updateSizes, this) // <-- Add this line
        this._map.options.scrollWheelZoom = true
        this._map.options.doubleClickZoom = true
        this.icon.classList.remove('requesting')
        this.icon.classList.remove('following')
        this.icon.classList.remove('locating')
        if (this.legend && this.legend._map) this._map.removeControl(this.legend)
        this._map.removeLayer(this.circle)
        this._map.removeLayer(this.linebg)
        this._map.removeLayer(this.line)
        this._map.removeLayer(this.boat)
        this._map.removeLayer(this.track)
        this.track.setLatLngs([]);
        if (this.viewedRouteLayer) {
            this._map.removeLayer(this.viewedRouteLayer);
        }
        if (this._map.setBearing) {
            this._map.setBearing(0);
        }
        if (window.Android && window.Android.stopTracking) {
            window.Android.stopTracking();
        }
        this.myStartTime = null;
        this.myTotalDistance = 0;
        this.myLastLatLng = null;
    },
    pause: function () {
        this._map.options.scrollWheelZoom = true;
        this._map.options.doubleClickZoom = true;
        this.icon.classList.remove('requesting', 'following');
        this.icon.classList.add('locating');
    },
    onDragStart: function () {
        if (this.isFollowing()) {
            this.pause()
        }
    },
    onMoveEnd: function () {
        if ((this.isLocating() || this.isFollowing()) && this.lastPosition) {
            this.updateLine(this.lastPosition)
        }
    },
    follow: function () {
        this._map.options.scrollWheelZoom = 'center'
        this._map.options.doubleClickZoom = 'center'
        this.icon.classList.remove('requesting')
        this.icon.classList.remove('locating')
        this.icon.classList.add('following')
    },
    unfollow: function () {
        this._map.options.scrollWheelZoom = true;
        this._map.options.doubleClickZoom = true;
        this.icon.classList.remove('requesting', 'following');
        this.icon.classList.add('locating');
        if (this._map.hasLayer(this.circle)) {
            this._map.removeLayer(this.circle);
        }
        if (this.sessionData) {
            this.saveRoute(this.sessionData);
            this.sessionData = null;
            this.followedPeerId = null;
            this.track.setLatLngs([]);
            if (this._map.hasLayer(this.track)) {
                this._map.removeLayer(this.track);
            }
        }
    },
    saveRoute: function (session) {
        if (!session || session.path.length < 2) return;
        var myBoatName = this.options.boatName || this.options.myBoatName || 'Me';
        if (session.boatName === myBoatName) {
            return;
        }
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
            anchor.addEventListener('click', (e) => {
                if (e.target === deleteBtn) return;
                const searchIcon = document.querySelector('.search-panel-btn');
                if (searchIcon) {
                    searchIcon.classList.remove('active');
                }
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
        if (window.isSimulatingPatrol && !e.isSimulated) return;
        e.latlngDMS = this.latlngDMS(e);
        if (this.legend && this.legend.boatToContainer) {
            this.legend.boatToContainer.style.display = ((window.activeSearchTrack && window.activeSearchTrack.name) || (window.activePatrolRoute && window.activePatrolRoute.length > 0)) ? 'block' : 'none';
        }
        e.smooth = this.smoothMotion(e);
        if (!this.sessionData) {
            let activeBoatName = this.options.boatName || 'เรือตรวจการณ์';
            const nameInput = document.getElementById("name");
            if (window.isSimulatingPatrol) {
                try {
                    const simState = JSON.parse(localStorage.getItem('patrolSimState'));
                    if (simState && simState.name) activeBoatName = simState.name;
                } catch (e) { }
            } else if (nameInput && nameInput.value.trim() !== "") {
                activeBoatName = nameInput.value;
            }
            this.sessionData = {
                startTime: new Date(),
                totalDistance: 0,
                path: [e.latlng],
                lastLatLng: e.latlng,
                lastTrackLatLng: e.latlng,
                boatName: activeBoatName
            };
            if (typeof this.startStopwatch === 'function') this.startStopwatch();
        }
        if (this._map && !this._map.hasLayer(this.boat)) {
            if (this.legend && !this.legend._map) {
                this._map.addControl(this.legend);
            }
            if (!this._map.hasLayer(this.circle)) this._map.addLayer(this.circle);
            if (!this._map.hasLayer(this.linebg)) this._map.addLayer(this.linebg);
            if (!this._map.hasLayer(this.line)) this._map.addLayer(this.line);
            if (!this._map.hasLayer(this.boat)) this._map.addLayer(this.boat);
            if (!this._map.hasLayer(this.track)) this._map.addLayer(this.track);
            this.follow();
        }
        if (this.sessionData) {
            const refLatLng = this.sessionData.lastTrackLatLng || (this.sessionData.path && this.sessionData.path.length > 0 ? this.sessionData.path[this.sessionData.path.length - 1] : this.sessionData.lastLatLng);
            const trackDist = refLatLng ? e.latlng.distanceTo(refLatLng) : Infinity;
            var isDualTracking = window.activeSearchTrack && window.activeSearchTrack.session && window.activeSearchTrack.session.lastLatLng;
            if (trackDist >= 8 || !refLatLng) {
                this.sessionData.totalDistance += trackDist;
                this.sessionData.path.push(e.latlng);
                this.sessionData.lastTrackLatLng = e.latlng;
                if (!isDualTracking && this.track) {
                    this.track.addLatLng(e.latlng);
                }
            }
            this.sessionData.lastLatLng = e.latlng;
        }
        this.lastPosition = e;
        if (this.isAppVisible === false) return;
        if (this.isFollowing()) {
            this._map.setView(e.latlng, 18);
        }
        this.updateCircle(e)
        this.updateLine(e)
        this.updateBoat(e)
        this.updateSizes()
        let trackingTargetLatLng = null;
        if (window.activeSearchTrack && window.activeSearchTrack.session && window.activeSearchTrack.session.lastLatLng) {
            trackingTargetLatLng = window.activeSearchTrack.session.lastLatLng;
        } else if (window.activePatrolRoute && window.activePatrolRoute.length > 0) {
            let currentIdx = (typeof window.activePatrolRouteIndex !== 'undefined') ? window.activePatrolRouteIndex : 0;
            if (currentIdx >= window.activePatrolRoute.length) currentIdx = window.activePatrolRoute.length - 1;
            trackingTargetLatLng = window.activePatrolRoute[currentIdx];
            if (!window.isSimulatingPatrol && e && e.latlng) {
                const isFinalWaypoint = (currentIdx === window.activePatrolRoute.length - 1);
                const reachThreshold = window.isEvadingObstacle ? 180 : (isFinalWaypoint ? 10 : 60);
                if (e.latlng.distanceTo(trackingTargetLatLng) <= reachThreshold) {
                    window.activePatrolRouteIndex = currentIdx + 1;
                    if (window.activePatrolRouteIndex >= window.activePatrolRoute.length) {
                        window.activePatrolRoute = null;
                        trackingTargetLatLng = null;
                        if (this.trackingLine && this._map && this._map.hasLayer(this.trackingLine)) this._map.removeLayer(this.trackingLine);
                        if (this.evasiveLine && this._map && this._map.hasLayer(this.evasiveLine)) this._map.removeLayer(this.evasiveLine);
                        if (this.legend && this.legend.obstacleWarningContainer) this.legend.obstacleWarningContainer.style.display = 'none';
                    } else {
                        trackingTargetLatLng = window.activePatrolRoute[window.activePatrolRouteIndex];
                    }
                }
            }
        }
        if (!trackingTargetLatLng) {
            if (this.trackingLine && this._map && this._map.hasLayer(this.trackingLine)) this._map.removeLayer(this.trackingLine);
            if (this.evasiveLine && this._map && this._map.hasLayer(this.evasiveLine)) this._map.removeLayer(this.evasiveLine);
            this.updateLegend(e)
        } else {
            if (this.sessionData && this.sessionData.startTime && this.legend && this.legend.timeElapsed) {
                const diff = new Date() - this.sessionData.startTime;
                const h = Math.floor(diff / 3600000);
                const m = Math.floor((diff % 3600000) / 60000);
                const s = Math.floor((diff % 60000) / 1000);
                this.legend.timeElapsed.innerHTML = h + "h " + m + "m " + s + "s";
            }
            if (typeof this.startStopwatch === 'function') this.startStopwatch();
            if (trackingTargetLatLng) {
                var targetLatLng = trackingTargetLatLng;
                var distNM = e.latlng.distanceTo(targetLatLng) / 1852;
                if (this.legend && this.legend.totalDist) {
                    this.legend.totalDist.innerHTML = distNM.toFixed(2);
                }
                const nautic = 40000 / 360 / 60;
                let headingVal = (e.smooth && e.smooth.heading) ? e.smooth.heading : 0;
                let speedVal = (e.smooth && e.smooth.speed) ? (e.smooth.speed * 36 / nautic) / 10 : 0;
                if (this.legend && this.legend.totalBoatTo) {
                    if (speedVal > 0) {
                        let hours = distNM / speedVal;
                        let totalSeconds = Math.floor(hours * 3600);
                        let h = Math.floor(totalSeconds / 3600);
                        let m = Math.floor((totalSeconds % 3600) / 60);
                        let s = totalSeconds % 60;
                        this.legend.totalBoatTo.innerHTML = `${h}h ${m}m ${s}s`;
                    } else {
                        this.legend.totalBoatTo.innerHTML = "--";
                    }
                }
                if (this.legend.heading) this.legend.heading.innerHTML = Math.round(headingVal);
                if (this.legend.knots) this.legend.knots.innerHTML = parseFloat(speedVal).toFixed(2);
                if (window.miniMapInstance) {
                    if (window.miniUserMarker) {
                        window.miniUserMarker.setLatLng(e.latlng);
                        var userHeading = (e.smooth && e.smooth.heading) ? e.smooth.heading : 0;
                        window.miniUserMarker.setIcon(L.divIcon({
                            className: 'boat',
                            html: `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" style="transform: rotate(${userHeading}deg); filter: drop-shadow(0px 0px 3px rgba(255,255,255,0.8));"><path d="M 128 512 C 128 512 128 128 256 0 C 384 128 384 512 384 512 Z" fill="#3388ff" stroke="white" stroke-width="40" stroke-linejoin="round"/></svg>`
                        }));
                    }
                    window.miniMapInstance.fitBounds(L.latLngBounds([e.latlng, targetLatLng]), { padding: [20, 20], maxZoom: 18 });
                }
                if (this.trackingLine) {
                    if (window.isSimulatingPatrol) {
                        if (this._map.hasLayer(this.trackingLine)) this._map.removeLayer(this.trackingLine);
                        if (this.evasiveLine && this._map.hasLayer(this.evasiveLine)) this._map.removeLayer(this.evasiveLine);
                    } else {
                        let finalTargetLatLng = targetLatLng;
                        if (typeof window.calculateEvasiveHeading === 'function') {
                            let brng = headingVal;
                            const distanceToTarget = e.latlng.distanceTo(targetLatLng);
                            const speedKnots = parseFloat(speedVal) || 0;
                            const userHeading = (e.smooth && e.smooth.heading) ? e.smooth.heading : brng;
                            const evasiveResult = window.calculateEvasiveHeading(e.latlng.lat, e.latlng.lng, brng, speedKnots, userHeading, distanceToTarget);
                            if (evasiveResult && evasiveResult.isEvasive) {
                                const targetDist = Math.min(distanceToTarget, 2000);
                                const R = 6371e3;
                                const evBrng = evasiveResult.heading * Math.PI / 180;
                                const lat1 = e.latlng.lat * Math.PI / 180;
                                const lon1 = e.latlng.lng * Math.PI / 180;
                                let lat2 = Math.asin(Math.sin(lat1) * Math.cos(targetDist / R) + Math.cos(lat1) * Math.sin(targetDist / R) * Math.cos(evBrng));
                                let lon2 = lon1 + Math.atan2(Math.sin(evBrng) * Math.sin(targetDist / R) * Math.cos(lat1), Math.cos(targetDist / R) - Math.sin(lat1) * Math.sin(lat2));
                                finalTargetLatLng = L.latLng(lat2 * 180 / Math.PI, lon2 * 180 / Math.PI);
                                if (this.legend && this.legend.obstacleWarningContainer) {
                                    this.legend.obstacleWarningContainer.style.display = 'block';
                                    if (this.legend.obstacleDist) {
                                        this.legend.obstacleDist.innerText = evasiveResult.nmDist;
                                    }
                                }
                            } else {
                                if (this.legend && this.legend.obstacleWarningContainer) {
                                    this.legend.obstacleWarningContainer.style.display = 'none';
                                }
                            }
                        }
                        this.trackingLine.setLatLngs([e.latlng, targetLatLng]);
                        if (!this._map.hasLayer(this.trackingLine)) this.trackingLine.addTo(this._map);

                        if (!this.evasiveLine) {
                            this.evasiveLine = L.polyline([], { color: '#ff0000', weight: 3, dashArray: '5, 10' });
                        }
                        this.evasiveLine.setLatLngs([e.latlng, finalTargetLatLng]);
                        if (!this._map.hasLayer(this.evasiveLine)) this.evasiveLine.addTo(this._map);
                    }
                }
            } else {
                if (this.trackingLine && this._map.hasLayer(this.trackingLine)) this._map.removeLayer(this.trackingLine);
                if (this.evasiveLine && this._map.hasLayer(this.evasiveLine)) this._map.removeLayer(this.evasiveLine);
            }
        }
    },
    updatePeer: function (userId, number, name, type, unit_name, e) {
        if (!this.peerData) {
            this.peerData = {};
        }
        const speedVal = parseFloat(e.speed) || 0;
        const isDocked = speedVal <= 0;
        const currentColor = isDocked ? '#ff8833' : this.options.peerColor;
        this.peerData[userId] = {
            number: number || 'Unknown',
            name: name || 'Unknown',
            type: type || 'Unknown',
            unit_name: unit_name || 'Unknown',
            latlng: e.latlng,
            speed: e.speed,
            heading: e.heading
        };
        if (!this.peers[userId]) {
            let mapBearing = (this._map && this._map.getBearing) ? this._map.getBearing() : 0;
            let initialVisualHeading = ((e.heading || 0) + mapBearing + 360) % 360;
            const marker = L.marker(e.latlng, {
                title: name || number || 'Unknown', // Used by propertyName: 'title'
                speed: e.speed || 0,                // Used by your buildTip
                heading: e.heading || 0,            // Used by your click event
                boatType: type || 'Unknown',        // Used by your click event
                boatLabel: 'assets/orange-icon.png',
                icon: L.divIcon({
                    iconAnchor: [11.5, 11.5],
                    iconSize: [23, 23],
                    className: 'boat peer-boat',
                    html: `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" style="transform: rotate(${initialVisualHeading}deg); filter: drop-shadow(0px 0px 3px rgba(255,255,255,0.8));">
                    <path d="M 128 512 C 128 512 128 128 256 0 C 384 128 384 512 384 512 Z" fill="${currentColor}" stroke="white" stroke-width="40" stroke-linejoin="round"/>
                    </svg>`
                })
            });
            marker.bindTooltip(`${number || 'Unknown'}`, {
                permanent: true,
                direction: 'top',
                className: 'transparent-tooltip'
            });
            marker.on('add', function () {
                this.svg = this.getElement().querySelector('svg');
            });
            if (window.template5) {
                window.template5.addLayer(marker);
            } else {
                marker.addTo(this._map);
            }
            this.peers[userId] = marker;
        }
        const marker = this.peers[userId];
        marker.setLatLng(e.latlng);
        marker.setTooltipContent(`${number || 'Unknown'}`);
        marker.options.speed = e.speed || 0;
        marker.options.heading = e.heading || 0;
        if (marker.svg) {
            let mapBearing = (this._map && this._map.getBearing) ? this._map.getBearing() : 0;
            let visualHeading = ((e.heading || 0) + mapBearing + 360) % 360;
            marker.svg.style.transform = `rotate(${visualHeading}deg)`;
            const path = marker.svg.querySelector('path');
            if (path && path.getAttribute('fill') !== currentColor) {
                path.setAttribute('fill', currentColor);
            }
        }
        if (window.activeSearchTrack && window.activeSearchTrack.name) {
            const trackName = String(window.activeSearchTrack.name).trim();
            const pName = String(name || '').trim();
            const pNumber = String(number || '').trim();
            const pTitle = String(marker.options.title || '').trim();
            const isMatch = (window.activeSearchTrack.layer === marker) ||
                (trackName === pName) ||
                (trackName === pNumber) ||
                (trackName === pTitle) ||
                (pName && trackName.includes(pName)) ||
                (pNumber && trackName.includes(pNumber));
            if (isMatch) {
                if (typeof window.updateSearchTrack === 'function') {
                    window.updateSearchTrack(e.latlng);
                }
                if (this.legend) {
                    if (this.legend.heading) this.legend.heading.innerHTML = Math.round(e.heading || 0);
                    if (this.legend.knots) this.legend.knots.innerHTML = parseFloat(e.speed || 0).toFixed(2);
                }
            }
        }
        if (this.isFollowing() && this.followedPeerId === String(userId)) {
            this._map.setView(e.latlng, 20); // Keeps the map centered and zoomed
            if (this._map.hasLayer(this.circle)) {
                this.circle.setLatLng(e.latlng);
                this.circle.setRadius(e.accuracy || 15);
            }
        }
        if (this.followedPeerId === String(userId)) {
            if (this.isFollowing()) {
                this._map.setView(e.latlng, 20); // Keeps the map centered and zoomed
            }
            e.latlngDMS = this.latlngDMS(e);
            let timeStr = "0h 0m 0s";
            let distNM = "0.00";
            if (this.sessionData) {
                const refLatLng = this.sessionData.lastTrackLatLng || (this.sessionData.path && this.sessionData.path.length > 0 ? this.sessionData.path[this.sessionData.path.length - 1] : this.sessionData.lastLatLng);
                const trackDist = refLatLng ? e.latlng.distanceTo(refLatLng) : Infinity;
                if (trackDist >= 8 || !refLatLng) {
                    if (refLatLng) {
                        this.sessionData.totalDistance += trackDist;
                    }
                    this.sessionData.path.push(e.latlng);
                    this.sessionData.lastTrackLatLng = e.latlng;
                    if (this.track) this.track.addLatLng(e.latlng);
                }
                this.sessionData.lastLatLng = e.latlng;
                if (this.sessionData.startTime) {
                    const diff = new Date() - this.sessionData.startTime;
                    const h = Math.floor(diff / 3600000);
                    const m = Math.floor((diff % 3600000) / 60000);
                    const s = Math.floor((diff % 60000) / 1000);
                    timeStr = h + "h " + m + "m " + s + "s";
                }
                distNM = (this.sessionData.totalDistance / 1852).toFixed(2);
            }
            if (this.legend) {
                if (this.legend.showBoatDashboard && !this.legend.isPierMode) this.legend.showBoatDashboard();
                if (!this.legend._map) {
                    this._map.addControl(this.legend);
                }
                const headingVal = Math.round(parseFloat(e.heading || 0));
                const speedValNum = parseFloat(e.speed || 0).toFixed(2);
                if (this.legend.boatName) this.legend.boatName.innerHTML = name || number || 'Unknown';
                if (this.legend.heading) this.legend.heading.innerHTML = headingVal;
                if (this.legend.knots) this.legend.knots.innerHTML = speedValNum;
                if (this.legend.timeElapsed) this.legend.timeElapsed.innerHTML = timeStr;
                if (this.legend.totalDist) this.legend.totalDist.innerHTML = distNM;
            }
        }
        this.renderPeerList();
    },
    trackPeerByName: function (name) {
        let targetId = null;
        for (let id in this.peerData) {
            if (this.peerData[id].name === name) {
                targetId = id;
                break;
            }
        }
        if (this.sessionData && this.followedPeerId !== String(targetId)) {
            this.saveRoute(this.sessionData);
            this.sessionData = null;
            this.track.setLatLngs([]);
        }
        this.icon.classList.remove('requesting', 'locating');
        this.icon.classList.add('following');
        if (this.legend && !this.legend._map) {
            this._map.addControl(this.legend);
        }
        if (!this._map.hasLayer(this.circle)) {
            this._map.addLayer(this.circle);
        }
        if (!this.sessionData) {
            this.sessionData = {
                startTime: new Date(),
                totalDistance: 0,
                path: [],
                lastLatLng: null,
                boatName: name
            };
            if (!this._map.hasLayer(this.track)) {
                this._map.addLayer(this.track);
            }
        }
        if (targetId) {
            this.followedPeerId = String(targetId);
            const peer = this.peerData[targetId];
            if (peer.latlng) {
                this.circle.setLatLng(peer.latlng);
                this.circle.setRadius(15);
                this.sessionData.path.push(peer.latlng);
                this.sessionData.lastLatLng = peer.latlng;
                this.track.setLatLngs([peer.latlng]);
                this._map.setView(peer.latlng, 20);
            }
            if (this.legend) {
                const headingVal = Math.round(parseFloat(peer.heading || 0));
                const speedValNum = parseFloat(peer.speed || 0).toFixed(2);
                if (this.legend.boatName) this.legend.boatName.innerHTML = peer.name;
                if (this.legend.heading) this.legend.heading.innerHTML = headingVal;
                if (this.legend.knots) this.legend.knots.innerHTML = speedValNum;
                if (this.legend.totalDist) this.legend.totalDist.innerHTML = "0.00";
            }
        } else {
            if (this.legend && this.legend.boatName) {
                this.legend.boatName.innerHTML = name;
            }
        }
        this.startStopwatch();
    },
    startStopwatch: function () {
        if (this.stopwatchInterval) return; // Ensure no duplicate intervals and avoid resetting running interval
        const updateTime = () => {
            if (this.sessionData && this.sessionData.startTime && this.legend && this.legend.timeElapsed) {
                const diff = new Date() - this.sessionData.startTime;
                const h = Math.floor(diff / 3600000);
                const m = Math.floor((diff % 3600000) / 60000);
                const s = Math.floor((diff % 60000) / 1000);
                this.legend.timeElapsed.innerHTML = h + "h " + m + "m " + s + "s";
            }
        };
        updateTime();
        this.stopwatchInterval = setInterval(updateTime, 1000);
    },
    stopStopwatch: function () {
        if (this.stopwatchInterval) {
            clearInterval(this.stopwatchInterval);
            this.stopwatchInterval = null;
        }
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
        this.circle.setStyle({ opacity: 1, fillOpacity: 0.2 });
    },
    updateBoat: function (e) {
        const heading = e.smooth.heading;
        if (this.boat.svg) {
            this.boat.svg.style.transform = 'rotate(0deg)';
        }
        this.boat.setLatLng(e.latlng);
        if (this.isFollowing() && this._map.setBearing) {
            this._map.setBearing(-heading);
            if (typeof window.updateAllBoatMarkersRotation === 'function') {
                window.updateAllBoatMarkersRotation(-heading);
            }
            if (typeof window.updatePolylineMeasureArrowsRotation === 'function') {
                window.updatePolylineMeasureArrowsRotation(-heading);
            }
        }
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
            dashOffset: 0,
        })
    },
    updateLegend: function (e) {
        const nautic = 40000 / 360 / 60
        const heading = Math.round(e.smooth.heading)
        const speed = Math.round(e.smooth.speed * 36 / nautic) / 10
        let timeStr = "0h 0m 0s";
        let distNM = "0.00";
        if (this.sessionData) {
            const diff = new Date() - this.sessionData.startTime;
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            timeStr = h + "h " + m + "m " + s + "s";
            distNM = (this.sessionData.totalDistance / 1852).toFixed(2);
        }
        let displayBoatName = this.options.boatName || 'เรือตรวจการณ์';
        const nameInput = document.getElementById("name");
        if (window.isSimulatingPatrol) {
            try {
                const simState = JSON.parse(localStorage.getItem('patrolSimState'));
                if (simState && simState.name) displayBoatName = simState.name;
            } catch (e) { }
        } else if (nameInput && nameInput.value.trim() !== "") {
            displayBoatName = nameInput.value;
        }
        if (this.legend.boatName) {
            this.legend.boatName.innerHTML = displayBoatName;
        }
        this.legend.heading.innerHTML = heading;     // Removed + ' °'
        this.legend.knots.innerHTML = speed;         // Removed + ' kts'
        if (this.legend.timeElapsed) this.legend.timeElapsed.innerHTML = timeStr;
        if (this.legend.totalDist) this.legend.totalDist.innerHTML = distNM; // Removed + ' NM'
    },
    latlngDMS: function (e) {
        function dms(coord) {
            let float = Math.abs(coord)
            let d = Math.floor(float)
            float = (float - d) * 60
            let m = Math.floor(float)
            float = (float - m) * 60
            let s = Math.round(float)
            if (s === 60) { m = m + 1; s = 0; }
            if (m === 60) { d = d + 1; m = 0; }
            if (s < 10) { s = '0' + s }
            if (m < 10) { m = '0' + m }
            return d + '&deg; ' + m + '&apos; ' + s + '&quot; '
        }
        return {
            lat: dms(e.latlng.lat) + ((e.latlng.lat > 0) ? 'N' : 'S'),
            lng: dms(e.latlng.lng) + ((e.latlng.lng > 0) ? 'E' : 'W'),
        }
    },
    smoothMotion: (function () {
        const cache = [];
        let lastValidHeading = 0;
        return function (e) {
            cache.push(e);
            if (cache.length > this.options.cacheLength) {
                cache.shift();
            }
            const sumX = cache.reduce(
                (sum, e) => sum + (e.speed || 0) * this.cosD(e.heading || 0), 0
            );
            const sumY = cache.reduce(
                (sum, e) => sum + (e.speed || 0) * this.sinD(e.heading || 0), 0
            );
            const avgSpeed = Math.sqrt(sumX ** 2 + sumY ** 2) / cache.length;
            if (avgSpeed > 0.5) {
                lastValidHeading = this.atan2D(sumY, sumX);
            }
            return {
                speed: avgSpeed,
                heading: lastValidHeading,
            };
        };
    })()
});
L.control.boating = function (options) {
    return new L.Control.Boating(options)
}
function receiveServiceLocation(UserId, Number, Name, lat, lng, bearing, speed) {
    if (window.boatingControl) {
        const id = UserId;
        const number = Number;
        const name = Name;
        window.myBoatNumber = number;
        window.myBoatName = name;
        if (window.boatingControl.inactiveMarkers && window.boatingControl.inactiveMarkers[name]) {
            const markerToRemove = window.boatingControl.inactiveMarkers[name];
            if (window.template5 && window.template5.hasLayer(markerToRemove)) {
                window.template5.removeLayer(markerToRemove);
            } else if (window.boatingControl._map.hasLayer(markerToRemove)) {
                window.boatingControl._map.removeLayer(markerToRemove);
            }
            delete window.boatingControl.inactiveMarkers[name];
        }
        const locationEvent = {
            latlng: L.latLng(lat, lng),
            accuracy: 10,
            heading: bearing,
            speed: speed
        };
        window.boatingControl.onLocationFound(locationEvent);
    }
}
function fetchOnlineLocations() {
    fetch('location.json')
        .then(response => response.json())
        .then(data => {
            data.forEach(boat => {
                receiveServerLocation(
                    boat.UserId,
                    boat.Number,
                    boat.Name,
                    boat.Type,
                    boat.UnitName,
                    boat.lat,
                    boat.lng,
                    boat.bearing,
                    boat.speed
                );
            });
        })
        .catch(err => console.error("Error loading online locations:", err));
}
function receiveServerLocation(UserId, Number, Name, Type, UnitName, lat, lng, bearing, speed) {
    if (UserId == 1) {
        return;
    }
    if (window.boatingControl) {
        let currentBoatName = window.boatingControl.options.boatName || 'เรือตรวจการณ์';
        const nameInput = document.getElementById("name");
        if (window.isSimulatingPatrol) {
            try {
                const simState = JSON.parse(localStorage.getItem('patrolSimState'));
                if (simState && simState.name) currentBoatName = simState.name;
            } catch (e) { }
        } else if (nameInput && nameInput.value.trim() !== "") {
            currentBoatName = nameInput.value.trim();
        }
        if ((window.myBoatName && Name == window.myBoatName) ||
            (window.myBoatNumber && Number == window.myBoatNumber) ||
            Name == currentBoatName) {
            return;
        }
        const id = UserId || "Me";
        const number = Number;
        const name = Name;
        const type = Type;
        const unit_name = UnitName;
        const locationEvent = {
            latlng: L.latLng(lat, lng),
            accuracy: 10,
            heading: bearing,
            speed: speed
        };
        window.boatingControl.updatePeer(id, number, name, type, unit_name, locationEvent);
    }
    if (window.boatingControl && window.boatingControl.followedPeerId === UserId) {
        var newLL = L.latLng(lat, lng);
        if (window.boatingControl.circle) {
            window.boatingControl.circle.setLatLng(newLL);
        }
        if (window.boatingControl.track) {
            var refLatLng = window.boatingControl.sessionData && window.boatingControl.sessionData.lastTrackLatLng;
            if (!refLatLng && window.boatingControl.sessionData && window.boatingControl.sessionData.path && window.boatingControl.sessionData.path.length > 0) {
                refLatLng = window.boatingControl.sessionData.path[window.boatingControl.sessionData.path.length - 1];
            }
            var trackDist = refLatLng ? newLL.distanceTo(refLatLng) : Infinity;
            if (trackDist >= 8 || !refLatLng) {
                window.boatingControl.track.addLatLng(newLL);
                if (window.boatingControl.sessionData) {
                    window.boatingControl.sessionData.path.push(newLL);
                    window.boatingControl.sessionData.lastTrackLatLng = newLL;
                }
            }
        }
        if (window.boatingControl.isFollowing() && window.boatingControl.sessionData) {
            window.boatingControl.sessionData.lastLatLng = newLL;
        }
        window.boatingControl._map.setView(newLL);
    }
}
function fetchOfflineLocations() {
    fetch('geolocation.json')
        .then(response => response.json())
        .then(data => {
            if (data && data.type === "FeatureCollection" && data.features) {
                data.features.forEach(feature => {
                    const props = feature.properties;
                    const coords = feature.geometry.coordinates;
                    const lng = coords[0];
                    const lat = coords[1];
                    if (lat !== 0 && lng !== 0) {
                        receiveInactiveLocation(props.name, props.number, lat, lng);
                    }
                });
            }
        })
        .catch(err => console.error("Error loading offline locations:", err));
}
function receiveInactiveLocation(name, number, lat, lng) {
    if (window.boatingControl && window.boatingControl._map) {
        let currentBoatName = window.boatingControl.options.boatName || 'เรือตรวจการณ์';
        const nameInput = document.getElementById("name");
        if (window.isSimulatingPatrol) {
            try {
                const simState = JSON.parse(localStorage.getItem('patrolSimState'));
                if (simState && simState.name) currentBoatName = simState.name;
            } catch (e) { }
        } else if (nameInput && nameInput.value.trim() !== "") {
            currentBoatName = nameInput.value.trim();
        }
        if ((window.myBoatName && name == window.myBoatName) ||
            (window.myBoatNumber && number == window.myBoatNumber) ||
            name == currentBoatName) {
            return;
        }
        const validLat = parseFloat(lat);
        const validLng = parseFloat(lng);
        if (isNaN(validLat) || isNaN(validLng)) return;
        if (!window.boatingControl.inactiveMarkers) {
            window.boatingControl.inactiveMarkers = {};
        }
        if (window.boatingControl.inactiveMarkers[name]) {
            const marker = window.boatingControl.inactiveMarkers[name];
            marker.setLatLng([validLat, validLng]);
            if (window.activeSearchTrack && window.activeSearchTrack.name) {
                const trackName = String(window.activeSearchTrack.name).trim();
                const inactName = String(name || '').trim();
                const inactNumber = String(number || '').trim();
                const inactTitle = String(marker.options.title || '').trim();
                const isMatch = (window.activeSearchTrack.layer === marker) ||
                    (trackName === inactName) ||
                    (trackName === inactNumber) ||
                    (trackName === inactTitle) ||
                    (inactName && trackName.includes(inactName)) ||
                    (inactNumber && trackName.includes(inactNumber));
                if (isMatch) {
                    if (typeof window.updateSearchTrack === 'function') {
                        window.updateSearchTrack(L.latLng(validLat, validLng));
                    }
                }
            }
            return; // Stop the function here so a duplicate isn't created
        }
        let mapBearing = (window.boatingControl && window.boatingControl._map && window.boatingControl._map.getBearing) ? window.boatingControl._map.getBearing() : 0;
        let visualHeading = (45 + mapBearing + 360) % 360;
        const dockedIcon = L.divIcon({
            iconAnchor: [11.5, 11.5],
            iconSize: [23, 23],
            className: 'boat peer-boat',
            html: `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" style="transform: rotate(${visualHeading}deg); filter: drop-shadow(0px 0px 3px rgba(255,255,255,0.8));">
                <path d="M 128 512 C 128 512 128 128 256 0 C 384 128 384 512 384 512 Z" fill="#202978" stroke="white" stroke-width="40" stroke-linejoin="round"/>
            </svg>`
        });
        const marker = L.marker([validLat, validLng], { icon: dockedIcon, title: name, speed: 0, heading: 45, boatLabel: 'assets/blue-icon.png' });
        marker.bindTooltip(`${number}`, {
            permanent: true,
            direction: 'top',
            className: 'transparent-tooltip'
        });
        window.boatingControl.inactiveMarkers[name] = marker;
        if (window.template5) {
            marker.addTo(window.template5);
        } else {
            marker.addTo(window.boatingControl._map);
        }
    }
}
window.liveMarkers = window.liveMarkers || {};
window.wfsMarkers = window.wfsMarkers || {};
window.liveBoatCluster = null;
window.wfsBoatCluster = null;
function initializeClusters(map) {
    if (!window.liveBoatCluster) {
        window.liveBoatCluster = L.markerClusterGroup({
            animate: false,
            animateAddingMarkers: false,
            spiderfyOnMaxZoom: false,
            zoomToBoundsOnClick: false, // Prevents the map from zooming in when a cluster is clicked
            spiderfyOnMaxZoom: false,   // Prevents markers from fanning out when clicked at max zoom
            showCoverageOnHover: false,  // Keeps the UI clean by removing hover polygons
            disableClusteringAtZoom: 13,
            maxClusterRadius: 30,
            iconCreateFunction: function (cluster) {
                return L.divIcon({
                    html: `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" style="transform: rotate(45deg); width: 100%; height: 100%; filter: drop-shadow(0px 0px 3px rgba(255,255,255,0.8));"> 
                    <path d="M 128 512 C 128 512 128 128 256 0 C 384 128 384 512 384 512 Z" fill="#48975b" stroke="white" stroke-width="40" stroke-linejoin="round"/> 
                    </svg>`,
                    className: 'boat',
                    iconAnchor: [11.5, 11.5],
                    iconSize: [23, 23]
                });
            }
        });
        window.liveBoatCluster.addTo(map);
    }
    if (!window.wfsBoatCluster) {
        window.wfsBoatCluster = L.markerClusterGroup({
            animate: false,
            animateAddingMarkers: false,
            spiderfyOnMaxZoom: false,
            zoomToBoundsOnClick: false, // Prevents the map from zooming in when a cluster is clicked
            spiderfyOnMaxZoom: false,   // Prevents markers from fanning out when clicked at max zoom
            showCoverageOnHover: false,  // Keeps the UI clean by removing hover polygons
            disableClusteringAtZoom: 13,
            maxClusterRadius: 30,
            iconCreateFunction: function (cluster) {
                return L.divIcon({
                    html: `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" style="transform: rotate(45deg); width: 100%; height: 100%; filter: drop-shadow(0px 0px 3px rgba(255,255,255,0.8));"> 
                    <path d="M 128 512 C 128 512 128 128 256 0 C 384 128 384 512 384 512 Z" fill="#ff0000" stroke="white" stroke-width="40" stroke-linejoin="round"/> 
                    </svg>`,
                    className: 'wfs-boat',
                    iconAnchor: [11.5, 11.5],
                    iconSize: [23, 23]
                });
            }
        });
        window.wfsBoatCluster.addTo(map);
    }
}
window.receiveLiveBoatLocation = function (name, lat, lng, heading, speed) {
    const map = window.template5 || (window.boatingControl && window.boatingControl._map);
    if (!map || isNaN(lat) || isNaN(lng)) return;
    initializeClusters(map);
    heading = parseFloat(heading) || 45;
    let mapBearing = 0;
    if (window.boatingControl && window.boatingControl._map && window.boatingControl._map.getBearing) {
        mapBearing = window.boatingControl._map.getBearing();
    }
    const visualHeading = heading + mapBearing;
    const getIcon = (deg) => L.divIcon({
        iconAnchor: [11.5, 11.5],
        iconSize: [23, 23],
        className: 'boat',
        html: `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" style="transform: rotate(${deg}deg); width: 100%; height: 100%; filter: drop-shadow(0px 0px 3px rgba(255,255,255,0.8));"> 
        <path d="M 128 512 C 128 512 128 128 256 0 C 384 128 384 512 384 512 Z" fill="#48975b" stroke="white" stroke-width="40" stroke-linejoin="round"/> 
        </svg>`
    });
    if (window.liveMarkers[name]) {
        const marker = window.liveMarkers[name];
        marker.setLatLng([lat, lng]);
        marker.options.heading = heading;
        marker.setIcon(getIcon(visualHeading));
    } else {
        const marker = L.marker([lat, lng], { icon: getIcon(visualHeading), title: name, boatColor: '#48975b', boatLabel: 'assets/green-icon.png', heading: heading, speed: speed });
        marker.bindTooltip(name, { permanent: true, direction: 'top', className: 'transparent-tooltip', offset: [0, -10] });
        window.liveMarkers[name] = marker;
        window.liveBoatCluster.addLayer(marker);
    }
    if (window.activeSearchTrack && window.activeSearchTrack.name && String(window.activeSearchTrack.name).trim() === String(name).trim()) {
        updateSearchTrack({ lat: lat, lng: lng });
        if (window.boatingControl && window.boatingControl.legend) {
            const legend = window.boatingControl.legend;
            if (legend.heading) legend.heading.innerHTML = Math.round(heading);
            if (legend.knots) legend.knots.innerHTML = parseFloat(speed || 0).toFixed(2);
        }
    }
    if (window.OfflineHelper) {
        window.OfflineHelper.saveBoatLocation('VMS', name, lat, lng, heading, speed, { type: 'VMS' });
    }
};
window.receiveWfsBoatLocation = function (name, lat, lng, heading, speed) {
    const map = window.template5 || (window.boatingControl && window.boatingControl._map);
    if (!map || isNaN(lat) || isNaN(lng)) return;
    initializeClusters(map);
    heading = parseFloat(heading) || 0;
    let mapBearing = 0;
    if (window.boatingControl && window.boatingControl._map && window.boatingControl._map.getBearing) {
        mapBearing = window.boatingControl._map.getBearing();
    }
    const visualHeading = heading + mapBearing;
    const getIcon = (deg) => L.divIcon({
        iconAnchor: [11.5, 11.5],
        iconSize: [23, 23],
        className: 'wfs-boat',
        html: `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" style="transform: rotate(${deg}deg); width: 100%; height: 100%; filter: drop-shadow(0px 0px 3px rgba(255,255,255,0.8));"> 
        <path d="M 128 512 C 128 512 128 128 256 0 C 384 128 384 512 384 512 Z" fill="#ff0000" stroke="white" stroke-width="40" stroke-linejoin="round"/> 
        </svg>`
    });
    if (window.wfsMarkers[name]) {
        const marker = window.wfsMarkers[name];
        marker.setLatLng([lat, lng]);
        marker.options.heading = heading;
        marker.setIcon(getIcon(visualHeading));
    } else {
        const marker = L.marker([lat, lng], { icon: getIcon(visualHeading), title: name, boatColor: '#ff0000', boatLabel: 'assets/red-icon.png', heading: heading, speed: speed });
        marker.bindTooltip(name, { permanent: true, direction: 'top', className: 'transparent-tooltip', offset: [0, -10] });
        window.wfsMarkers[name] = marker;
        window.wfsBoatCluster.addLayer(marker);
    }
    if (window.activeSearchTrack && window.activeSearchTrack.name && String(window.activeSearchTrack.name).trim() === String(name).trim()) {
        updateSearchTrack({ lat: lat, lng: lng });
        if (window.boatingControl && window.boatingControl.legend) {
            const legend = window.boatingControl.legend;
            if (legend.heading) legend.heading.innerHTML = Math.round(heading);
            if (legend.knots) legend.knots.innerHTML = parseFloat(speed || 0).toFixed(2);
        }
    }
    if (window.OfflineHelper) {
        window.OfflineHelper.saveBoatLocation('AIS', name, lat, lng, heading, speed, { type: 'AIS' });
    }
};
window.updateAllBoatMarkersRotation = function (mapBearing) {
    if (mapBearing === undefined && window.boatingControl && window.boatingControl._map && window.boatingControl._map.getBearing) {
        mapBearing = window.boatingControl._map.getBearing();
    }
    mapBearing = parseFloat(mapBearing) || 0;
    if (typeof window.updatePolylineMeasureArrowsRotation === 'function') {
        window.updatePolylineMeasureArrowsRotation(mapBearing);
    }
    const updateIconHtml = (marker, defaultFillColor) => {
        if (!marker || marker.options.heading === undefined) return;
        const trueHeading = parseFloat(marker.options.heading) || 0;
        const visualDeg = (trueHeading + mapBearing + 360) % 360;
        const el = marker.getElement();
        let fillColor = marker.options.boatColor || marker.options.fillColor || defaultFillColor || '#202978';
        if (el) {
            const path = el.querySelector('path');
            if (path && path.getAttribute('fill')) {
                fillColor = path.getAttribute('fill');
            }
            const svg = el.querySelector('svg');
            if (svg) svg.style.transform = `rotate(${visualDeg}deg)`;
        }
        if (marker.options.icon && marker.options.icon.options) {
            marker.options.icon.options.html = `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" style="transform: rotate(${visualDeg}deg); width: 100%; height: 100%; filter: drop-shadow(0px 0px 3px rgba(255,255,255,0.8));"> 
            <path d="M 128 512 C 128 512 128 128 256 0 C 384 128 384 512 384 512 Z" fill="${fillColor}" stroke="white" stroke-width="40" stroke-linejoin="round"/> 
            </svg>`;
        }
    };
    if (window.liveMarkers) {
        Object.values(window.liveMarkers).forEach(marker => updateIconHtml(marker, '#48975b'));
    }
    if (window.wfsMarkers) {
        Object.values(window.wfsMarkers).forEach(marker => updateIconHtml(marker, '#ff0000'));
    }
    if (window.targetMarkers) {
        Object.values(window.targetMarkers).forEach(marker => updateIconHtml(marker, '#202978'));
    }
    if (window.activeTargets) {
        Object.values(window.activeTargets).forEach(target => {
            if (target && target.marker) updateIconHtml(target.marker, '#202978');
        });
    }
    if (window.boatingControl && window.boatingControl.peers) {
        Object.values(window.boatingControl.peers).forEach(marker => updateIconHtml(marker, '#ff8833'));
    }
    if (window.boatingControl && window.boatingControl.inactiveMarkers) {
        Object.values(window.boatingControl.inactiveMarkers).forEach(marker => updateIconHtml(marker, '#202978'));
    }
    if (window.liveBoatCluster) {
        window.liveBoatCluster.eachLayer(marker => updateIconHtml(marker, '#48975b'));
    }
    if (window.wfsBoatCluster) {
        window.wfsBoatCluster.eachLayer(marker => updateIconHtml(marker, '#ff0000'));
    }
};
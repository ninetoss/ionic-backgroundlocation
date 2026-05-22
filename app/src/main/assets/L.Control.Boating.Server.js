L.Control.Boating = L.Control.extend({
    options: {
        position: 'topleft',
        legendPosition: 'topright',
        boatColor: '#3388ff',      // Color for "Me"
        peerColor: '#ff8833',      // New: Color for other users
        lineColor1: 'transparent',
        lineColor2: 'transparent',
        circleColor: '#3388ff',
        cacheLength: 4,
        boatName: '' // Add a default name for the local device
    },
    onAdd: function (map) {
        this.peers = {};           // Store other users here
        this.myMotionCache = [];   // Store smoothing data for "Me" here
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
            this.heading = container.querySelector('#heading')
            this.knots = container.querySelector('#knots')
            this.timeElapsed = container.querySelector('#timeElapsed')
            this.totalDist = container.querySelector('#totalDist')
            return container
        }
        this.boat = this.createBoatMarker(this.options.boatColor);
        this.circle = L.circle([0, 0], { color: this.options.circleColor, stroke: false })
        this.line = L.polyline([[0, 0], [0, 0]], { color: this.options.lineColor2, lineCap: 'square' })
        this.linebg = L.polyline([[0, 0], [0, 0]], { color: this.options.lineColor1 })
        this.track = L.polyline([], { color: '#3388ff', weight: 3 })
        this.viewedRouteLayer = L.polyline([], { color: '#3388ff', weight: 3 });
        setTimeout(() => this.updateRouteList(), 500);
        return container
    },
    createBoatMarker: function (color) {
        const marker = L.marker([0, 0], {
            icon: L.divIcon({
                iconAnchor: [11.5, 11.5],
                iconSize: [23, 23],
                className: 'ship',
                html: `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" class="boat-svg" style="filter: drop-shadow(0px 0px 3px rgba(255,255,255,0.8));">
                <path d="M 128 512 C 128 512 128 128 256 0 C 384 128 384 512 384 512 Z" fill="${color}" stroke="white" stroke-width="40" stroke-linejoin="round"/>
            </svg>`
            })
        });
        marker.on('add', function () {
            this.svg = this.getElement().querySelector('.boat-svg');
        });
        return marker;
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
                this.stopStopwatch();
            } else {
                this._map.panTo(window.activeSearchTrack.session.lastLatLng);
                this.follow();
            }
            return;
        }
        if (this.followedPeerId && this.sessionData) {
            if (this.isFollowing()) {
                this.saveRoute(this.sessionData);
                this.followedPeerId = null;
                this.sessionData = null;
                if (this._map.hasLayer(this.track)) this._map.removeLayer(this.track);
                if (this._map.hasLayer(this.circle)) this._map.removeLayer(this.circle);
                this.icon.classList.remove('following', 'requesting', 'locating');
                this._map.removeControl(this.legend);
                this.stopStopwatch();
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
        else if (this.isLocating()) { this._map.panTo(this.lastPosition.latlng); this.follow(); }
        else if (!this.isRequesting()) this.request()
    },
    request: function () {
        this._map.on('moveend', this.onMoveEnd, this)
        this._map.on('dragstart', this.onDragStart, this)
        this._map.on('locationfound', this.onLocationFound, this)
        this._map.on('locationerror', this.onLocationError, this)
        this._map.on('zoomend', this.updateSizes, this)
        this._map.locate({ watch: true, enableHighAccuracy: true })
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
        this._map.removeControl(this.legend)
        this._map.removeLayer(this.circle)
        this._map.removeLayer(this.linebg)
        this._map.removeLayer(this.line)
        this._map.removeLayer(this.boat)
        if (this.sessionData) {
            this.saveRoute(this.sessionData);
            this.sessionData = null;
        }
        if (this._map) {
            this._map.stopLocate()
            this._map.off('moveend', this.onMoveEnd, this);
            this._map.off('dragstart', this.onDragStart, this);
            this._map.off('locationfound', this.onLocationFound, this)
            this._map.off('locationerror', this.onLocationError, this)
            this._map.off('zoomend', this.updateSizes, this) // <-- Add this line
            this._map.options.scrollWheelZoom = true;
            this._map.options.doubleClickZoom = true;
            if (this.legend && this.legend._map) {
                this._map.removeControl(this.legend);
            }
            if (this._map.hasLayer(this.circle)) this._map.removeLayer(this.circle);
            if (this._map.hasLayer(this.linebg)) this._map.removeLayer(this.linebg);
            if (this._map.hasLayer(this.line)) this._map.removeLayer(this.line);
            if (this._map.hasLayer(this.boat)) this._map.removeLayer(this.boat);
            if (this._map.hasLayer(this.track)) this._map.removeLayer(this.track);
            if (this.viewedRouteLayer && this._map.hasLayer(this.viewedRouteLayer)) {
                this._map.removeLayer(this.viewedRouteLayer);
            }
            for (let userId in this.peers) {
                if (this._map.hasLayer(this.peers[userId])) {
                    this._map.removeLayer(this.peers[userId]);
                }
            }
        }
        this.track.setLatLngs([]);
        this.icon.classList.remove('requesting', 'following', 'locating');
        this.peers = {};
        this.peerData = {};
        this.renderPeerList();
        if (window.Android && window.Android.stopTracking) {
            window.Android.stopTracking();
        }
        if (this.inactiveMarkers) {
            if (window.template5) {
                window.template5.clearLayers();
            } else {
                for (let boatName in this.inactiveMarkers) {
                    if (this._map && this._map.hasLayer(this.inactiveMarkers[boatName])) {
                        this._map.removeLayer(this.inactiveMarkers[boatName]);
                    }
                }
            }
            this.inactiveMarkers = {}; // Reset the dictionary
        }
        this.stopPolling();
        this.myStartTime = null;
        this.myTotalDistance = 0;
        this.myLastLatLng = null;
    },
    onDragStart: function () {
        if (this.isFollowing()) {
            this.unfollow()
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
        const userId = e.UserId || 'Me';
        const number = e.Number;
        const name = e.Name;
        const type = e.Type;
        const unit_name = e.UnitName;
        if (userId === 'Me') {
            this.updateMyself(e);
        } else {
            this.updatePeer(userId, number, name, type, unit_name, e);
        }
    },
    updateMyself: function (e) {
        e.smooth = this.smoothMotion(e, this.myMotionCache);
        e.latlngDMS = this.latlngDMS(e);
        if (this.isRequesting()) {
            this.sessionData = {
                startTime: new Date(),
                totalDistance: 0,
                path: [e.latlng],
                lastLatLng: e.latlng,
                boatName: this.options.boatName || this.options.myBoatName || 'Me'
            };
            this._map.addControl(this.legend)
            this._map.addLayer(this.circle)
            this._map.addLayer(this.linebg)
            this._map.addLayer(this.line)
            this._map.addLayer(this.boat)
            this._map.addLayer(this.track)
            this.follow()
        }
        if (!this.followedPeerId || this.followedPeerId === 'Me') {
            if (this.isFollowing()) {
                this._map.setView(e.latlng, 20);
            }
            if (this.sessionData) {
                const dist = e.latlng.distanceTo(this.sessionData.lastLatLng);
                this.sessionData.totalDistance += dist;
                this.sessionData.path.push(e.latlng);
                this.sessionData.lastLatLng = e.latlng;
            }
            const myName = this.sessionData ? this.sessionData.boatName : 'Me';
            this.updateLegend(e, myName);
            this.updateCircle(e);
            this.updateLine(e);
            this.track.addLatLng(e.latlng);
        }
        this.updateBoat(this.boat, e)
        this.lastPosition = e
        this.updateSizes()
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
            const marker = L.marker(e.latlng, {
                title: name || number || 'Unknown', // Used by propertyName: 'title'
                speed: e.speed || 0,                // Used by your buildTip
                heading: e.heading || 0,            // Used by your click event
                boatType: type || 'Unknown',        // Used by your click event
                boatLabel: '../assets/orange-icon.png',
                icon: L.divIcon({
                    iconAnchor: [11.5, 11.5],
                    iconSize: [23, 23],
                    className: 'boat peer-boat',
                    html: `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 0px 3px rgba(255,255,255,0.8));">
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
            marker.svg.style.transform = `rotate(${e.heading}deg)`;
            const path = marker.svg.querySelector('path');
            if (path && path.getAttribute('fill') !== currentColor) {
                path.setAttribute('fill', currentColor);
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
                if (this.sessionData.lastLatLng) {
                    const dist = e.latlng.distanceTo(this.sessionData.lastLatLng);
                    this.sessionData.totalDistance += dist;
                }
                this.sessionData.path.push(e.latlng);
                this.sessionData.lastLatLng = e.latlng;
                this.track.addLatLng(e.latlng);
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
    renderPeerList: function () {
        const container = document.getElementById('device-list-container');
        if (!container) return;
        container.innerHTML = '';
        Object.keys(this.peerData).forEach(id => {
            const peer = this.peerData[id];
            const li = document.createElement('li');
            li.id = `peer-item-${id}`;
            li.style.marginBottom = '10px';
            li.style.listStyle = 'none';
            let isCameraActive = false;
            let activeSenderId = id;
            const checkId = id ? String(id).toLowerCase() : "";
            const cleanName = peer.name ? String(peer.name).toLowerCase().replace(/\s+/g, '') : "";
            const cleanNum = peer.number ? String(peer.number).toLowerCase().replace(/\s+/g, '') : "";
            const extractedNum = cleanName.replace(/\D/g, '');
            if (window.activeCameras) {
                for (let camKey in window.activeCameras) {
                    if (!camKey || camKey === "undefined" || camKey === "null") continue;
                    let webrtcId = window.activeCameras[camKey];
                    let cleanCam = camKey.toLowerCase().replace(/\s+/g, '');
                    if (!cleanCam) continue;
                    if (cleanName && cleanName === cleanCam) {
                        isCameraActive = true; activeSenderId = webrtcId; break;
                    }
                    if (cleanNum && cleanNum === cleanCam) {
                        isCameraActive = true; activeSenderId = webrtcId; break;
                    }
                    if (extractedNum.length > 0 && extractedNum === cleanCam) {
                        isCameraActive = true; activeSenderId = webrtcId; break;
                    }
                    if (checkId === cleanCam || checkId.endsWith("." + cleanCam) || checkId.endsWith("_" + cleanCam)) {
                        isCameraActive = true; activeSenderId = webrtcId; break;
                    }
                }
            }
            let displayName = peer.name || 'Unknown';
            let speedVal = peer.speed || "0.00";
            let formattedSpeed = parseFloat(speedVal).toFixed(1);
            let iconPath = peer.icon || '../assets/orange-icon.png';
            let dotColor = isCameraActive ? '#28a745' : 'transparent';
            let dotHtml = `<span style="display: inline-block; width: 10px; height: 1px; border-radius: 50%; background-color: ${dotColor}; margin-left: 4px; box-shadow: 0 0 4px ${dotColor}80;" title="${isCameraActive ? 'Connected' : 'Not Connected'}"></span>`;
            li.innerHTML = `<a href="#" class="search-result-item" style="padding-right: 10px; display: flex; width: 100%; height: 35px;">
            <img src="${iconPath}" style="width: 18px; height: 18px; margin-top: 5px;">
            <span style="font-size: 14px; font-weight: bold; margin-top: 10px; margin-left: 10px;">${displayName} ${dotHtml}</span>
            <span style="margin-left: auto; font-size: 12px; color: #5f6368; font-weight: bold; margin-top: 15px; margin-right: 10px;">${formattedSpeed} kt</span>
            </a>`;
            li.addEventListener('click', (e) => {
                e.preventDefault();
                if (this.sessionData && this.followedPeerId !== String(id)) {
                    this.saveRoute(this.sessionData);
                    this.sessionData = null;
                    this.track.setLatLngs([]);
                }
                this.followedPeerId = String(id);
                this.icon.classList.remove('requesting', 'locating');
                this.icon.classList.add('following');
                if (this.legend && !this.legend._map) {
                    this._map.addControl(this.legend);
                }
                if (!this._map.hasLayer(this.circle)) {
                    this._map.addLayer(this.circle);
                }
                if (peer.latlng) {
                    this.circle.setLatLng(peer.latlng);
                    this.circle.setRadius(15);
                }
                if (!this.sessionData) {
                    this.sessionData = {
                        startTime: new Date(),
                        totalDistance: 0,
                        path: [],
                        lastLatLng: null,
                        boatName: peer.name
                    };
                    if (peer.latlng) {
                        this.sessionData.path.push(peer.latlng);
                        this.sessionData.lastLatLng = peer.latlng;
                        this.track.setLatLngs([peer.latlng]);
                    }
                    if (!this._map.hasLayer(this.track)) {
                        this._map.addLayer(this.track);
                    }
                }
                if (this.legend) {
                    const headingVal = Math.round(parseFloat(peer.heading || 0));
                    const speedValNum = parseFloat(peer.speed || 0).toFixed(2);
                    if (this.legend.boatName) this.legend.boatName.innerHTML = peer.name || 'Unknown';
                    if (this.legend.heading) this.legend.heading.innerHTML = headingVal;
                    if (this.legend.knots) this.legend.knots.innerHTML = speedValNum;
                    if (this.legend.timeElapsed) this.legend.timeElapsed.innerHTML = "0h 0m 0s";
                    if (this.legend.totalDist) this.legend.totalDist.innerHTML = "0.00";
                }
                if (this._map && peer.latlng) {
                    this._map.setView(peer.latlng, 20);
                }
                if (isCameraActive) {
                    if (typeof window.activatePiPMode === 'function') {
                        window.activatePiPMode(peer.name, activeSenderId);
                    }
                } else {
                    if (typeof window.closePiP === 'function') {
                        window.closePiP();
                    }
                }
            });
            container.appendChild(li);
        });
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
        this.stopStopwatch(); // Ensure no duplicates run
        this.stopwatchInterval = setInterval(() => {
            if (this.sessionData && this.sessionData.startTime && this.legend && this.legend.timeElapsed) {
                const diff = new Date() - this.sessionData.startTime;
                const h = Math.floor(diff / 3600000);
                const m = Math.floor((diff % 3600000) / 60000);
                const s = Math.floor((diff % 60000) / 1000);
                this.legend.timeElapsed.innerHTML = h + "h " + m + "m " + s + "s";
            }
        }, 1000);
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
    updateBoat: function (boat, e) {
        const heading = e.smooth.heading;
        if (boat.svg) {
            boat.svg.style.transform = 'rotate(' + heading + 'deg)';
        }
        boat.setLatLng(e.latlng);
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
    updatePeerLegend: function (peerId) {
        const peer = this.peers[peerId];
        if (!peer || !this.legend) return;
        const heading = Math.round(parseFloat(peer.heading || peer.bearing || 0));
        const speed = parseFloat(peer.speed || 0).toFixed(2);
        let dms = { lat: peer.lat.toFixed(5), lng: peer.lng.toFixed(5) };
        if (this.latlngDMS) {
            dms = this.latlngDMS({ latlng: L.latLng(peer.lat, peer.lng) });
        }
        if (this.legend.boatName) this.legend.boatName.innerHTML = peer.name || peerId;
        if (this.legend.heading) this.legend.heading.innerHTML = heading;
        if (this.legend.knots) this.legend.knots.innerHTML = speed;
    },
    updateLegend: function (e, boatName) {
        let speed = 0;
        let heading = 0;
        if (e.smooth) {
            const nautic = 40000 / 360 / 60;
            heading = Math.round(e.smooth.heading);
            speed = (Math.round(e.smooth.speed * 36 / nautic) / 10).toFixed(1);
        } else {
            heading = (e.heading || 0).toFixed(0);
            speed = (parseFloat(e.speed) || 0).toFixed(1);
        }
        if (boatName && this.legend.boatName) {
            this.legend.boatName.innerHTML = boatName;
        }
        if (this.myLastLatLng) {
            this.myTotalDistance += this.myLastLatLng.distanceTo(e.latlng);
        }
        this.myLastLatLng = e.latlng;
        const distNM = (this.myTotalDistance / 1852).toFixed(2);
        let timeStr = "0h 0m 0s"; // Updated default format
        if (this.myStartTime) {
            const diff = new Date() - this.myStartTime;
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            timeStr = h + "h " + m + "m " + s + "s";
        }
        if (this.legend.boatName) this.legend.boatName.innerHTML = this.options.boatName;
        if (this.legend.heading) this.legend.heading.innerHTML = heading;  // Removed + ' °'
        if (this.legend.knots) this.legend.knots.innerHTML = speed;        // Removed + ' kts'
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
    smoothMotion: function (e, cache) {
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
});
L.control.boating = function (options) {
    return new L.Control.Boating(options)
}
function receiveServerLocation(UserId, Number, Name, Type, UnitName, lat, lng, bearing, speed) {
    if (UserId == 1) {
        return;
    }
    if (window.boatingControl) {
        const id = UserId || "Me";
        const number = Number;
        const name = Name;
        const type = Type;
        const unit_name = UnitName;
        const locationEvent = {
            UserId: id,
            Number: number,
            Name: name,
            Type: type,
            UnitName: unit_name,
            latlng: L.latLng(lat, lng),
            accuracy: 10,
            heading: bearing,
            speed: speed
        };
        window.boatingControl.onLocationFound(locationEvent);
    }
    if (window.boatingControl && window.boatingControl.followedPeerId === userId) {
        var newLL = L.latLng(lat, lng);
        if (window.boatingControl.circle) {
            window.boatingControl.circle.setLatLng(newLL);
        }
        if (window.boatingControl.track) {
            window.boatingControl.track.addLatLng(newLL);
        }
        if (window.boatingControl.sessionData) {
            window.boatingControl.sessionData.path.push(newLL);
            window.boatingControl.sessionData.lastLatLng = newLL; // Keep last known location updated
        }
        map.setView(newLL);
    }
}
function receiveServiceLocation(UserId, Number, lat, lng, bearing, speed) {
    if (window.boatingControl) {
        const id = UserId;
        const number = Number;
        const locationEvent = {
            latlng: L.latLng(lat, lng),
            accuracy: 10,
            heading: bearing,
            speed: speed
        };
        window.boatingControl.onLocationFound(locationEvent);
    }
}
function receiveInactiveLocation(name, number, lat, lng) {
    if (window.boatingControl && window.boatingControl._map) {
        if (window.boatingControl.peerData) {
            for (let id in window.boatingControl.peerData) {
                if (window.boatingControl.peerData[id].name === name) {
                    return; // Abort drawing the offline icon
                }
            }
        }
        const validLat = parseFloat(lat);
        const validLng = parseFloat(lng);
        if (isNaN(validLat) || isNaN(validLng)) return;
        if (!window.boatingControl.inactiveMarkers) {
            window.boatingControl.inactiveMarkers = {};
        }
        if (window.boatingControl.inactiveMarkers[name]) {
            window.boatingControl.inactiveMarkers[name].setLatLng([validLat, validLng]);
            return; // Stop the function here so a duplicate isn't created
        }
        const dockedIcon = L.divIcon({
            iconAnchor: [11.5, 11.5],
            iconSize: [23, 23],
            className: 'boat peer-boat',
            html: `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" style="transform: rotate(45deg); filter: drop-shadow(0px 0px 3px rgba(255,255,255,0.8));">
                <path d="M 128 512 C 128 512 128 128 256 0 C 384 128 384 512 384 512 Z" fill="#202978" stroke="white" stroke-width="40" stroke-linejoin="round"/>
            </svg>`
        });
        const marker = L.marker([validLat, validLng], { icon: dockedIcon, title: name, speed: 0, heading: 0, boatLabel: '../assets/blue-icon.png' });
        marker.bindTooltip(`${number}`, {
            permanent: true,
            direction: 'top',
            className: 'transparent-tooltip'
        });
        window.boatingControl.inactiveMarkers[name] = marker;
        if (window.template6) {
            marker.addTo(window.template6);
        } else {
            marker.addTo(window.boatingControl._map);
        }
    }
}
function purgeOfflineServerLocations(activeIdsString) {
    if (!window.boatingControl || !window.boatingControl.peers) return;
    try {
        const activeIds = JSON.parse(activeIdsString).map(String);
        for (let id in window.boatingControl.peers) {
            if (!activeIds.includes(String(id))) {
                const peerMarker = window.boatingControl.peers[id];
                if (window.boatingControl._map.hasLayer(peerMarker)) {
                    window.boatingControl._map.removeLayer(peerMarker);
                }
                delete window.boatingControl.peers[id];
                if (window.boatingControl.peerData) {
                    delete window.boatingControl.peerData[id];
                }
                window.boatingControl.renderPeerList();
            }
        }
    } catch (e) {
        console.error("Error parsing active IDs for purge:", e);
    }
}
window.purgeInactiveLocations = function (inactiveNamesString) {
    if (!window.boatingControl || !window.boatingControl.inactiveMarkers) return;
    try {
        const inactiveNames = JSON.parse(inactiveNamesString).map(String);
        for (let number in window.boatingControl.inactiveMarkers) {
            if (!inactiveNames.includes(String(number))) {
                const marker = window.boatingControl.inactiveMarkers[number];
                if (window.boatingControl._map.hasLayer(marker)) {
                    window.boatingControl._map.removeLayer(marker);
                }
                if (window.template5 && window.template5.hasLayer(marker)) {
                    window.template5.removeLayer(marker);
                }
                delete window.boatingControl.inactiveMarkers[number];
            }
        }
    } catch (e) {
        console.error("Error parsing inactive names for purge:", e);
    }
};
window.liveMarkers = window.liveMarkers || {};
window.wfsMarkers = window.wfsMarkers || {};
window.liveBoatCluster = null;
window.wfsBoatCluster = null;
function initializeClusters(map) {
    if (!window.liveBoatCluster) {
        window.liveBoatCluster = L.markerClusterGroup({
            animate: false,
            animateAddingMarkers: false,
            zoomToBoundsOnClick: false,
            spiderfyOnMaxZoom: false,
            showCoverageOnHover: false,
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
            zoomToBoundsOnClick: false,
            spiderfyOnMaxZoom: false,
            showCoverageOnHover: false,
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
    const map = window.template6 || (window.boatingControl && window.boatingControl._map);
    if (!map || isNaN(lat) || isNaN(lng)) return;
    initializeClusters(map);
    heading = parseFloat(heading) || 45;
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
        marker.setIcon(getIcon(heading));
    } else {
        const marker = L.marker([lat, lng], { icon: getIcon(heading), title: name, boatColor: '#48975b', boatLabel: '../assets/green-icon.png', heading: heading, speed: speed });
        marker.bindTooltip(name, { permanent: true, direction: 'top', className: 'transparent-tooltip', offset: [0, -10] });
        window.liveMarkers[name] = marker;
        window.liveBoatCluster.addLayer(marker);
    }
    if (window.activeSearchTrack && window.activeSearchTrack.name === name) {
        updateSearchTrack({ lat: lat, lng: lng });
        if (window.boatingControl && window.boatingControl.legend) {
            const legend = window.boatingControl.legend;
            if (legend.heading) legend.heading.innerHTML = Math.round(heading);
            if (legend.knots) legend.knots.innerHTML = parseFloat(speed || 0).toFixed(2);
        }
    }
};
window.receiveWfsBoatLocation = function (name, lat, lng, heading, speed) {
    const map = window.template6 || (window.boatingControl && window.boatingControl._map);
    if (!map || isNaN(lat) || isNaN(lng)) return;
    initializeClusters(map);
    heading = parseFloat(heading) || 0;
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
        marker.setIcon(getIcon(heading));
    } else {
        const marker = L.marker([lat, lng], { icon: getIcon(heading), title: name, boatColor: '#ff0000', boatLabel: '../assets/red-icon.png', heading: heading, speed: speed });
        marker.bindTooltip(name, { permanent: true, direction: 'top', className: 'transparent-tooltip', offset: [0, -10] });
        window.wfsMarkers[name] = marker;
        window.wfsBoatCluster.addLayer(marker);
    }
    if (window.activeSearchTrack && window.activeSearchTrack.name === name) {
        updateSearchTrack({ lat: lat, lng: lng });
        if (window.boatingControl && window.boatingControl.legend) {
            const legend = window.boatingControl.legend;
            if (legend.heading) legend.heading.innerHTML = Math.round(heading);
            if (legend.knots) legend.knots.innerHTML = parseFloat(speed || 0).toFixed(2);
        }
    }
};

L.Control.Boating = L.Control.extend({
    options: {
        position: 'topleft',
        legendPosition: 'topright',
        boatColor: '#3388ff',
        lineColor1: '#3388ff',
        lineColor2: 'transparent',
        circleColor: '#3388ff',
        cacheLength: 4
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
        if (this.sessionData) {
            this.saveRoute(this.sessionData);
            this.sessionData = null;
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
        e.latlngDMS = this.latlngDMS(e);
        e.smooth = this.smoothMotion(e);
        if (this.isRequesting()) {
            const nameInput = document.getElementById("name");
            const activeBoatName = (nameInput && nameInput.value.trim() !== "")
                ? nameInput.value
                : (this.options.boatName || 'Unknown Boat');
            this.sessionData = {
                startTime: new Date(),
                totalDistance: 0,
                path: [e.latlng],
                lastLatLng: e.latlng,
                boatName: activeBoatName // <-- Store the fetched name here for the report
            };
            this._map.addControl(this.legend)
            this._map.addLayer(this.circle)
            this._map.addLayer(this.linebg)
            this._map.addLayer(this.line)
            this._map.addLayer(this.boat)
            this._map.addLayer(this.track)
            this.follow()
        }
        if (this.sessionData) {
            const dist = e.latlng.distanceTo(this.sessionData.lastLatLng);
            this.sessionData.totalDistance += dist;
            this.sessionData.path.push(e.latlng);
            this.sessionData.lastLatLng = e.latlng;
        }
        this.track.addLatLng(e.latlng);
        this.lastPosition = e;
        if (this.isAppVisible === false) return;
        if (this.isFollowing()) {
            this._map.setView(e.latlng, 18);
        }
        this.updateLegend(e)
        this.updateCircle(e)
        this.updateLine(e)
        this.updateBoat(e)
        this.updateSizes()
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
    updateBoat: function (e) {
        const heading = e.smooth.heading;
        if (this.boat.svg) {
            this.boat.svg.style.transform = 'rotate(0deg)';
        }
        this.boat.setLatLng(e.latlng);
        if (this.isFollowing() && this._map.setBearing) {
            this._map.setBearing(-heading);
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
            dashOffset: pixelsPerHour,
        })
    },
    updateLegend: function (e) {
        const nautic = 40000 / 360 / 60
        const heading = Math.round(e.smooth.heading)
        const speed = Math.round(e.smooth.speed * 36 / nautic) / 10
        let timeStr = "00:00:00";
        let distNM = "0.00";
        if (this.sessionData) {
            const diff = new Date() - this.sessionData.startTime;
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            timeStr = h + "h " + m + "m " + s + "s";
            distNM = (this.sessionData.totalDistance / 1852).toFixed(2);
        }
        const nameInput = document.getElementById("name");
        let displayBoatName = this.options.boatName || 'Unknown Boat';
        if (nameInput && nameInput.value.trim() !== "") {
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
function receiveServiceLocation(UserId, Number, lat, lng, bearing, speed) {
    if (window.boatingControl) {
        const locationEvent = {
            latlng: L.latLng(lat, lng),
            accuracy: 10,
            heading: bearing,
            speed: speed
        };
        window.boatingControl.onLocationFound(locationEvent);
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
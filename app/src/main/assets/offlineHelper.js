const OfflineHelper = {
    dbName: 'MarineAppOfflineDB',
    dbVersion: 2,
    db: null,

    init: function () {
        return new Promise((resolve, reject) => {
            if (this.db) {
                resolve(this.db);
                return;
            }
            if (typeof indexedDB === 'undefined') {
                reject(new Error("IndexedDB is not supported in this environment"));
                return;
            }
            const request = indexedDB.open(this.dbName, this.dbVersion);
            request.onerror = (event) => {
                console.error("IndexedDB error:", event.target.error);
                reject(event.target.error);
            };
            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('weather')) {
                    db.createObjectStore('weather', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('wms')) {
                    db.createObjectStore('wms', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('tiles')) {
                    db.createObjectStore('tiles', { keyPath: 'url' });
                }
                if (!db.objectStoreNames.contains('boats')) {
                    db.createObjectStore('boats', { keyPath: 'name' });
                }
            };
        });
    },

    isOffline: function () {
        return (typeof navigator !== 'undefined' && 'onLine' in navigator) ? !navigator.onLine : false;
    },

    formatDate: function (input) {
        if (!input) return new Date().toISOString().split('T')[0];
        let str = String(input).trim().split(' ')[0].split('T')[0];
        if (str.includes('/')) {
            let parts = str.split('/');
            if (parts.length === 3) {
                let year = parts[2];
                let month = parts[1].padStart(2, '0');
                let day = parts[0].padStart(2, '0');
                return `${year}-${month}-${day}`;
            }
        }
        return str;
    },

    getBBox: function (lines) {
        if (!lines || !Array.isArray(lines) || lines.length === 0) return null;
        let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
        let hasPoints = false;
        lines.forEach(line => {
            if (Array.isArray(line)) {
                line.forEach(pt => {
                    if (!pt) return;
                    let lat = pt.lat !== undefined ? Number(pt.lat) : Number(pt[0]);
                    let lng = pt.lng !== undefined ? Number(pt.lng) : Number(pt[1]);
                    if (isNaN(lat) || isNaN(lng)) return;
                    hasPoints = true;
                    if (lat < minLat) minLat = lat;
                    if (lat > maxLat) maxLat = lat;
                    if (lng < minLng) minLng = lng;
                    if (lng > maxLng) maxLng = lng;
                });
            }
        });
        if (!hasPoints) return null;
        return {
            minLat: Math.max(-85.051, minLat - 0.05),
            maxLat: Math.min(85.051, maxLat + 0.05),
            minLng: Math.max(-180, minLng - 0.05),
            maxLng: Math.min(180, maxLng + 0.05)
        };
    },

    lon2tile: function (lon, zoom) {
        return (Math.floor((lon + 180) / 360 * Math.pow(2, zoom)));
    },
    lat2tile: function (lat, zoom) {
        const rad = lat * Math.PI / 180;
        return (Math.floor((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * Math.pow(2, zoom)));
    },

    blobToBase64: function (blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = (e) => reject(e);
            reader.readAsDataURL(blob);
        });
    },

    saveMissionData: async function (report, mapLines) {
        try {
            if (!report || !report.id) return;
            await this.init();
            const bbox = this.getBBox(mapLines);
            if (!bbox) return;

            let centerLat = (bbox.minLat + bbox.maxLat) / 2;
            let centerLng = (bbox.minLng + bbox.maxLng) / 2;

            let dateStr = this.formatDate(report.startDate);

            // 1. Weather Data Parsing & Sampling
            let allPts = [];
            if (mapLines && Array.isArray(mapLines)) {
                mapLines.forEach(line => {
                    if (Array.isArray(line)) {
                        line.forEach(pt => {
                            if (!pt) return;
                            let lat = pt.lat !== undefined ? Number(pt.lat) : Number(pt[0]);
                            let lng = pt.lng !== undefined ? Number(pt.lng) : Number(pt[1]);
                            if (!isNaN(lat) && !isNaN(lng)) {
                                allPts.push({ lat, lng });
                            }
                        });
                    }
                });
            }
            let samplePts = [];
            if (allPts.length <= 50) {
                samplePts = allPts;
            } else {
                let step = allPts.length / 50;
                for (let i = 0; i < 50; i++) {
                    samplePts.push(allPts[Math.floor(i * step)]);
                }
            }
            if (samplePts.length === 0) {
                samplePts.push({ lat: centerLat, lng: centerLng });
            }
            await this.downloadWeather(report.id, dateStr, centerLat, centerLng, samplePts);

            // 2. Save WMS
            await this.downloadWMS(report.id, bbox);

            // 3. Save Base Tiles (Zoom 6 to 18)
            this.downloadTilesBackground(mapLines, 6, 18);

            console.log("Offline data caching started for mission:", report.id);
        } catch (e) {
            console.error("Error saving mission offline data", e);
        }
    },

    deleteMissionData: async function (report) {
        try {
            if (!report || !report.id) return;
            await this.init();

            // Delete Weather
            try {
                const txW = this.db.transaction(['weather'], 'readwrite');
                txW.objectStore('weather').delete(report.id);
            } catch (e) { }

            // Delete WMS
            try {
                const txM = this.db.transaction(['wms'], 'readwrite');
                txM.objectStore('wms').delete(report.id);
            } catch (e) { }

            // Delete Tiles (Zoom 6 to 18 - aligned with caching range)
            if (report.lines) {
                const bbox = this.getBBox(report.lines);
                if (bbox) {
                    const minZoom = 6, maxZoom = 18;
                    const subdomains = ['0', '1', '2', '3'];
                    try {
                        const txT = this.db.transaction(['tiles'], 'readwrite');
                        const tileStore = txT.objectStore('tiles');

                        for (let z = minZoom; z <= maxZoom; z++) {
                            const minX = this.lon2tile(bbox.minLng, z);
                            const maxX = this.lon2tile(bbox.maxLng, z);
                            const minY = this.lat2tile(bbox.maxLat, z);
                            const maxY = this.lat2tile(bbox.minLat, z);

                            for (let x = minX; x <= maxX; x++) {
                                for (let y = minY; y <= maxY; y++) {
                                    const s = subdomains[Math.abs(x + y) % 4];
                                    const url = `https://mt${s}.google.com/vt/lyrs=m&x=${x}&y=${y}&z=${z}`;
                                    tileStore.delete(url);
                                }
                            }
                        }
                    } catch (e) {
                        console.warn("Could not delete tiles batch", e);
                    }
                }
            }
            console.log("Deleted offline data for mission:", report.id);
        } catch (e) {
            console.error("Error deleting mission offline data", e);
        }
    },

    downloadWeather: async function (missionId, dateStr, centerLat, centerLng, samplePts) {
        if (!samplePts || samplePts.length === 0) samplePts = [{ lat: centerLat, lng: centerLng }];
        let lats = samplePts.map(p => Number(p.lat).toFixed(5)).join(',');
        let lngs = samplePts.map(p => Number(p.lng).toFixed(5)).join(',');

        let omUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m&hourly=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m&daily=sunrise,sunset&timezone=auto&start_date=${dateStr}&end_date=${dateStr}`;
        let marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lngs}&current=wave_height,sea_level_height_msl&hourly=wave_height,sea_level_height_msl&timezone=auto&start_date=${dateStr}&end_date=${dateStr}`;

        try {
            let [omRes, marineRes] = await Promise.all([
                fetch(omUrl).catch(() => null),
                fetch(marineUrl).catch(() => null)
            ]);

            if (!omRes || !omRes.ok) {
                // Fallback to default 7-day forecast if date is out of range
                omUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m&hourly=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m&daily=sunrise,sunset&timezone=auto`;
                marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lngs}&current=wave_height,sea_level_height_msl&hourly=wave_height,sea_level_height_msl&timezone=auto`;
                const fallbackRes = await Promise.all([
                    fetch(omUrl).catch(() => null),
                    fetch(marineUrl).catch(() => null)
                ]);
                omRes = fallbackRes[0];
                marineRes = fallbackRes[1];
            }

            if (omRes && omRes.ok) {
                let weatherData = await omRes.json();
                let marineData = null;
                if (marineRes && marineRes.ok) {
                    try { marineData = await marineRes.json(); } catch (e) { }
                }

                if (!Array.isArray(weatherData)) weatherData = [weatherData];
                if (marineData && !Array.isArray(marineData)) marineData = [marineData];

                let pointsData = [];
                for (let i = 0; i < samplePts.length; i++) {
                    pointsData.push({
                        lat: samplePts[i].lat,
                        lng: samplePts[i].lng,
                        weather: weatherData[i] || weatherData[0],
                        marine: marineData ? (marineData[i] || marineData[0]) : null
                    });
                }

                const transaction = this.db.transaction(['weather'], 'readwrite');
                const store = transaction.objectStore('weather');
                store.put({
                    id: missionId,
                    weather: pointsData[0].weather,
                    marine: pointsData[0].marine,
                    date: dateStr,
                    lat: centerLat,
                    lng: centerLng,
                    points: pointsData
                });
            }
        } catch (e) {
            console.warn("Could not cache weather", e);
        }
    },

    getWeatherData: async function (missionId) {
        await this.init();
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction(['weather'], 'readonly');
                const store = transaction.objectStore('weather');
                const request = store.get(missionId);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } catch (e) {
                reject(e);
            }
        });
    },

    downloadWMS: async function (missionId, bbox) {
        const wmsUrl = `https://portal.marineportal.gistda.or.th/geoserver/wms?service=WMS&request=GetMap&layers=geonode:BATHYMETRY1&styles=&format=image/png&transparent=true&version=1.1.1&width=1000&height=1000&srs=EPSG:4326&bbox=${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`;

        try {
            const res = await fetch(wmsUrl);
            if (res.ok) {
                const blob = await res.blob();
                const base64 = await this.blobToBase64(blob);
                const transaction = this.db.transaction(['wms'], 'readwrite');
                const store = transaction.objectStore('wms');
                store.put({ id: missionId, bbox: bbox, image: base64 });
            }
        } catch (e) {
            console.warn("Could not cache WMS", e);
        }
    },

    getWMSData: async function (missionId) {
        await this.init();
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction(['wms'], 'readonly');
                const store = transaction.objectStore('wms');
                const request = store.get(missionId);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } catch (e) {
                reject(e);
            }
        });
    },

    downloadTilesBackground: async function (mapLines, minZoom, maxZoom) {
        const subdomains = ['0', '1', '2', '3'];

        let points = [];
        if (mapLines && Array.isArray(mapLines)) {
            mapLines.forEach(line => {
                if (Array.isArray(line)) {
                    line.forEach(pt => {
                        if (!pt) return;
                        let lat = pt.lat !== undefined ? Number(pt.lat) : Number(pt[0]);
                        let lng = pt.lng !== undefined ? Number(pt.lng) : Number(pt[1]);
                        if (!isNaN(lat) && !isNaN(lng)) {
                            points.push({ lat, lng });
                        }
                    });
                }
            });
        }
        if (points.length === 0) return;

        for (let z = minZoom; z <= maxZoom; z++) {
            let tiles = new Set();
            const buffer = 1;

            for (let i = 0; i < points.length - 1; i++) {
                let p1 = points[i];
                let p2 = points[i + 1];
                let x1 = this.lon2tile(p1.lng, z);
                let y1 = this.lat2tile(p1.lat, z);
                let x2 = this.lon2tile(p2.lng, z);
                let y2 = this.lat2tile(p2.lat, z);

                let dx = Math.abs(x2 - x1);
                let dy = Math.abs(y2 - y1);
                let sx = (x1 < x2) ? 1 : -1;
                let sy = (y1 < y2) ? 1 : -1;
                let err = dx - dy;

                let cx = x1, cy = y1;

                while (true) {
                    for (let bx = -buffer; bx <= buffer; bx++) {
                        for (let by = -buffer; by <= buffer; by++) {
                            tiles.add(`${cx + bx},${cy + by}`);
                        }
                    }
                    if (cx === x2 && cy === y2) break;
                    let e2 = 2 * err;
                    if (e2 > -dy) { err -= dy; cx += sx; }
                    if (e2 < dx) { err += dx; cy += sy; }
                }
            }

            if (points.length === 1) {
                let cx = this.lon2tile(points[0].lng, z);
                let cy = this.lat2tile(points[0].lat, z);
                for (let bx = -buffer; bx <= buffer; bx++) {
                    for (let by = -buffer; by <= buffer; by++) {
                        tiles.add(`${cx + bx},${cy + by}`);
                    }
                }
            }

            let tileArr = Array.from(tiles);
            for (let i = 0; i < tileArr.length; i++) {
                let parts = tileArr[i].split(',');
                let x = parseInt(parts[0]);
                let y = parseInt(parts[1]);
                const s = subdomains[Math.abs(x + y) % 4];
                const url = `https://mt${s}.google.com/vt/lyrs=m&x=${x}&y=${y}&z=${z}`;
                await this.cacheSingleTile(url);
                await new Promise(r => setTimeout(r, 20));
            }
        }
    },

    cacheSingleTile: async function (url) {
        try {
            await this.init();
            const exists = await new Promise((resolve) => {
                try {
                    const t = this.db.transaction(['tiles'], 'readonly');
                    const req = t.objectStore('tiles').get(url);
                    req.onsuccess = () => resolve(!!req.result);
                    req.onerror = () => resolve(false);
                } catch (e) {
                    resolve(false);
                }
            });
            if (exists) return;

            const res = await fetch(url);
            if (res.ok) {
                const blob = await res.blob();
                const t = this.db.transaction(['tiles'], 'readwrite');
                t.objectStore('tiles').put({ url: url, blob: blob });
            }
        } catch (e) { }
    },

    getTileBlob: async function (url) {
        await this.init();
        return new Promise((resolve, reject) => {
            try {
                const t = this.db.transaction(['tiles'], 'readonly');
                const req = t.objectStore('tiles').get(url);
                req.onsuccess = () => resolve(req.result ? req.result.blob : null);
                req.onerror = () => reject(req.error);
            } catch (e) {
                reject(e);
            }
        });
    },

    createOfflineTileLayer: function (urlTemplate, options) {
        if (typeof L === 'undefined') return null;

        const emptyFallback = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

        const OfflineLayerClass = L.TileLayer.extend({
            createTile: function (coords, done) {
                var tile = document.createElement('img');

                L.DomEvent.on(tile, 'load', L.Util.bind(this._tileOnLoad, this, done, tile));
                L.DomEvent.on(tile, 'error', L.Util.bind(this._tileOnError, this, done, tile));

                // Revoke object URL when tile is unloaded to prevent memory leaks
                L.DomEvent.on(tile, 'unload', function () {
                    if (tile.src && tile.src.startsWith('blob:')) {
                        URL.revokeObjectURL(tile.src);
                    }
                });

                if (this.options.crossOrigin || this.options.crossOrigin === '') {
                    tile.crossOrigin = this.options.crossOrigin === true ? '' : this.options.crossOrigin;
                }

                tile.alt = '';
                tile.setAttribute('role', 'presentation');

                var url = this.getTileUrl(coords);

                OfflineHelper.getTileBlob(url).then(blob => {
                    if (blob) {
                        tile.src = URL.createObjectURL(blob);
                    } else if (OfflineHelper.isOffline()) {
                        tile.src = emptyFallback;
                    } else {
                        tile.src = url;
                    }
                }).catch(() => {
                    if (OfflineHelper.isOffline()) {
                        tile.src = emptyFallback;
                    } else {
                        tile.src = url;
                    }
                });

                return tile;
            }
        });
        return new OfflineLayerClass(urlTemplate, options);
    },

    _saveQueue: [],
    _saveTimerScheduled: false,

    saveBoatLocation: function (group, name, lat, lng, heading, speed, properties) {
        if (lat === undefined || lng === undefined || !name) return;
        this._saveQueue.push({
            group: group,
            name: name,
            lat: Number(lat),
            lng: Number(lng),
            heading: Number(heading || 0),
            speed: Number(speed || 0),
            properties: properties || {},
            timestamp: Date.now()
        });

        if (!this._saveTimerScheduled) {
            this._saveTimerScheduled = true;
            setTimeout(() => {
                this._saveTimerScheduled = false;
                this._processSaveQueue();
            }, 1000);
        }
    },

    _processSaveQueue: async function () {
        if (this._saveQueue.length === 0) return;

        const boatsToSave = [...this._saveQueue];
        this._saveQueue = [];

        try {
            await this.init();
            const transaction = this.db.transaction(['boats'], 'readwrite');
            const store = transaction.objectStore('boats');

            boatsToSave.forEach(b => {
                store.put({
                    name: b.name,
                    group: b.group,
                    lat: b.lat,
                    lng: b.lng,
                    heading: b.heading,
                    speed: b.speed,
                    properties: b.properties,
                    timestamp: b.timestamp
                });
            });
        } catch (e) {
            console.warn("Could not save boat locations offline", e);
        }
    },

    getOfflineBoats: async function (group) {
        try {
            await this.init();
            return new Promise((resolve, reject) => {
                try {
                    const transaction = this.db.transaction(['boats'], 'readonly');
                    const store = transaction.objectStore('boats');
                    const request = store.getAll();
                    request.onsuccess = () => {
                        const boats = request.result || [];
                        const now = Date.now();
                        const validBoats = [];
                        const obsoleteNames = [];

                        boats.forEach(b => {
                            if (now - b.timestamp > 24 * 60 * 60 * 1000) {
                                obsoleteNames.push(b.name);
                            } else {
                                validBoats.push(b);
                            }
                        });

                        if (obsoleteNames.length > 0) {
                            try {
                                const delTx = this.db.transaction(['boats'], 'readwrite');
                                const delStore = delTx.objectStore('boats');
                                obsoleteNames.forEach(name => delStore.delete(name));
                            } catch (e) { }
                        }

                        if (group) {
                            resolve(validBoats.filter(b => b.group === group));
                        } else {
                            resolve(validBoats);
                        }
                    };
                    request.onerror = () => reject(request.error);
                } catch (e) {
                    reject(e);
                }
            });
        } catch (e) {
            console.error("Error getting offline boats", e);
            return [];
        }
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = OfflineHelper;
}

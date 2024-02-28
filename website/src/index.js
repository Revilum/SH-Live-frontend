const API_URL = "http://localhost:1825"
const WEBSOCKET_SERVER = "ws://localhost:1934"

let ACTIVE_MARKER

const MARKERS = {}

const map = L.map('map', {
    center: [54.3126897, 10.129182],
    zoom: 17
})

const trainIcon = L.icon({
    iconUrl: './img/train.png',
    iconSize:     [32, 32],
    iconAnchor:   [16, 16],
    shadowAnchor: [4, 62],
    popupAnchor:  [0, -16]
});



L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

map.on("click", clearActiveMarker)

const ws = new WebSocket(WEBSOCKET_SERVER)

ws.onmessage = (event) => {
    let data = JSON.parse(event.data)
    const currentUpdateTime = Date.now().toString()
    data.movements.forEach((train) => {
        if (MARKERS[train.tripId] !== undefined) {
            MARKERS[train.tripId].marker.setLatLng(new L.LatLng(train.location.latitude, train.location.longitude))
            MARKERS[train.tripId].lastUpdate = currentUpdateTime
        } else {
            const newMarker = L.marker([train.location.latitude, train.location.longitude], {icon: trainIcon})
                .bindPopup(train.line.name + " nach " + train.direction, {autoPan: false})
                .on("click", async () => { // get the current trip.
                    clearActiveMarker()
                    ACTIVE_MARKER = train.tripId
                    let response = await fetch(API_URL + "/trip", {
                        method: "POST",
                        body: JSON.stringify({id: train.tripId}),
                        headers: {
                            "Content-Type": "application/json"
                        }
                    })
                    let trip = await response.json()
                    // draw path to map
                    let line = trip.trip.polyline.features.map((x) => x.geometry.coordinates.reverse())
                    MARKERS[train.tripId].layers.push(L.polyline(line, {
                        color: "blue",
                        weight: 4,
                        opacity: 1
                    }).addTo(map))
                    // add stations with current departure
                    const newMarkers = trip.trip.stopovers.map((stopover) => {
                        let stationText = `${stopover.stop.name}`
                        if (stopover.arrival !== null) {
                            stationText += `<br>Ankunft: ${(new Date(stopover.departure)).toLocaleTimeString("de-DE", {hour: '2-digit', minute:'2-digit'})}`
                        }
                        if (stopover.departure !== null) {
                            stationText += `<br>Abfahrt: ${(new Date(stopover.departure)).toLocaleTimeString("de-DE", {hour: '2-digit', minute:'2-digit'})}`
                        }

                        return L.marker([stopover.stop.location.latitude, stopover.stop.location.longitude])
                            .bindPopup(stationText)
                            .addTo(map)
                    })
                    MARKERS[train.tripId].layers = MARKERS[train.tripId].layers.concat(newMarkers)


                }).addTo(map)
            // save active markers
            MARKERS[train.tripId] = {
                marker: newMarker,
                layers: [],
                lastUpdate: currentUpdateTime
            }
        }
    })
    // remove all trains that were not present since the last update => train has finished its route
    for (const [trip, marker] of Object.entries(MARKERS)) {
        if (marker.lastUpdate !== currentUpdateTime) {
            clearMarker(trip)
            map.removeLayer(marker.marker)
            delete MARKERS[trip]
        }
    }
}

function clearMarker(cMarker) {
    if (cMarker !== undefined) {
        MARKERS[cMarker].layers.forEach((m) => map.removeLayer(m))
        MARKERS[cMarker].layers = []
    }
}

function clearActiveMarker() {
    clearMarker(ACTIVE_MARKER)
    ACTIVE_MARKER = undefined
}
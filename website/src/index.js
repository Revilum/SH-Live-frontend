import "../../node_modules/leaflet/dist/leaflet.js"
import * as conf from "./config.js";

let ACTIVE_MARKER = undefined
const MARKERS = {}

const map = L.map('map', {
    center: [54.3126897, 10.129182],
    zoom: 17
})

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

map.on("click", async () => await deselectMarker(ACTIVE_MARKER))

const ws = new WebSocket(conf.WEBSOCKET_URL)

ws.onmessage = async (event) => {
    const data = JSON.parse(event.data)
    const currentUpdateTime = Date.now().toString()
    data.movements.forEach((train) => {
        if (MARKERS[train.tripId] !== undefined) { // train is already present on the map
            updateTrain(train, currentUpdateTime) // update position of the train on the map
        } else { // train is new and needs to be added to the map
            const newMarker = L.marker([train.location.latitude, train.location.longitude], conf.TRAIN_OPTIONS)
                .bindPopup(train.line.name + " nach " + train.direction, {autoPan: false})
                .on("click", async () => { // get the current trip.
                    MARKERS[train.tripId].layers = new Promise(async (resolve, _) => {
                        const oldActiveMarker = ACTIVE_MARKER
                        ACTIVE_MARKER = train.tripId
                        await deselectMarker(oldActiveMarker)
                        let trip = (await fetchPOST("trip", {id: train.tripId})).trip
                        // add station markers
                        const newMarkers = (trip.stopovers.map((stopover) =>
                            L.marker([stopover.stop.location.latitude, stopover.stop.location.longitude])
                                .bindPopup(getStationTextFromStopover(stopover, trip.line.product))
                                .addTo(map)
                        ))

                        newMarkers.push(getPolylineFromTrip(trip)) // draw train path to map and add it to the markers
                        resolve(newMarkers)
                        // setTimeout(() => resolve(newMarkers), 10)
                    })
                }).addTo(map)
            // store new train
            MARKERS[train.tripId] = {
                marker: newMarker,
                layers: new Promise((resolve, _) => resolve([])),
                lastUpdate: currentUpdateTime
            }
        }
    })
    // remove all trains that were not present since the last update => train has finished its route
    for (const [trip, marker] of Object.entries(MARKERS)) {
        if (marker.lastUpdate !== currentUpdateTime) {
            await deselectMarker(trip)
            map.removeLayer(marker.marker)
            delete MARKERS[trip]
        }
    }
}

async function deselectMarker(cMarker) {
    if (cMarker !== undefined) { // train hasn't been removed already or no train is selected
        (await MARKERS[cMarker].layers).forEach((m) => map.removeLayer(m))
        MARKERS[cMarker].layers = []
        if (cMarker === ACTIVE_MARKER) {
            ACTIVE_MARKER = undefined
        }
    }
}

function updateTrain(train, updateTime) {
    MARKERS[train.tripId].marker.setLatLng(new L.LatLng(train.location.latitude, train.location.longitude))
    MARKERS[train.tripId].lastUpdate = updateTime
}

async function fetchPOST(path, data) {
    const endpoint = new URL(conf.API_URL)
    endpoint.pathname = path
    const response = await fetch(endpoint, {
        method: "POST",
        body: JSON.stringify(data),
        headers: {
            "Content-Type": "application/json"
        }
    })
    return await response.json()
    // simulate shitty internet
    //return new Promise((r, _) => setTimeout(async () => r(await response.json()), 3000))
}

function getStationTextFromStopover(station, product) {
    let stationText = `<b>${station.stop.name}</b>`
    if (station.arrival !== null) {
        stationText += `<br>Ankunft: ${(new Date(station.arrival)).toLocaleTimeString("de-DE", conf.TIME_FORMAT)}`
    }
    if (station.departure !== null) {
        stationText += `<br>Abfahrt: ${(new Date(station.departure)).toLocaleTimeString("de-DE", conf.TIME_FORMAT)}`
    }
    if (station.remarks !== undefined) {
        station.remarks.forEach((remark) => {
            if (remark.type === "warning" && remark.products[product]) {
                stationText += `<br>${remark.text}`
            }
        })
    }
    return stationText
}

const getPolylineFromTrip = (trip) =>
    L.polyline(trip.polyline.features.map((x) => x.geometry.coordinates.reverse()), conf.LINE_OPTIONS).addTo(map)
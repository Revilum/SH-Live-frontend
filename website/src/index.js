import "../../node_modules/leaflet/dist/leaflet.js"
import * as conf from "./config.js";

let ACTIVE_MARKER = undefined
const MARKERS = {}

let HASH_WAS_NOT_HIGHLIGHT = true

const map = L.map('map', {
    center: [54.1958021,9.5727771],
    zoom: 9
})

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

map.on("click", async () => await deselectMarker(ACTIVE_MARKER))

const ws = new WebSocket(conf.WEBSOCKET_URL)

ws.onmessage = async (event) => {
    const data = JSON.parse(event.data)
    data.movements.forEach((train) => {
        if (MARKERS[train.tripId] !== undefined) { // train is already present on the map
            updateTrain(train, data.realtimeDataUpdatedAt) // update position of the train on the map
        } else { // train is new and needs to be added to the map
            const newMarker = L.marker([train.location.latitude, train.location.longitude], conf.TRAIN_OPTIONS)
                .bindPopup(train.line.name + " nach " + train.direction, {autoPan: false})
                .on("click", async () => { // get the current trip.
                    await selectMarker(train.tripId)
                }).addTo(map)
            // store new train
            MARKERS[train.tripId] = {
                marker: newMarker,
                layers: new Promise((resolve, _) => resolve([])),
                lastUpdate: data.realtimeDataUpdatedAt,
                data: train
            }
        }
    })

    await selectMarkerFromHash() // auto highlights train from url if present

    // remove all trains that were not present since the last update => train has finished its route
    for (const [trip, marker] of Object.entries(MARKERS)) {
        if (marker.lastUpdate !== data.realtimeDataUpdatedAt) {
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
    }
}

async function selectMarker(tripId) {
    const layerBuffer = new Promise(async (resolve, _) => {

        const oldActiveMarker = ACTIVE_MARKER
        ACTIVE_MARKER = tripId; // setting ACTIVE_MARKER before deselecting is needed if deselecting takes too long
        await deselectMarker(oldActiveMarker)
        let trip = (await fetchPOST("trip", {id: tripId})).trip
        // add station markers
        const newMarkers = (trip.stopovers.map((stopover) =>
            L.marker([stopover.stop.location.latitude, stopover.stop.location.longitude])
                .bindPopup(getStationTextFromStopover(stopover, trip.line.product))
                .addTo(map)
        ))

        newMarkers.push(getPolylineFromTrip(trip)) // draw train path to map and add it to the markers
        resolve(newMarkers)
    })

    await layerBuffer
    MARKERS[tripId].layers = new Promise((resolve, _) => resolve(layerBuffer))
}

async function selectMarkerFromHash() {
    const hash = window.location.hash
    //if (HASH_WAS_NOT_HIGHLIGHT && hash !== "" && hash.substring(1) in MARKERS) {
    if (HASH_WAS_NOT_HIGHLIGHT && hash !== "") {
        //const tripId = hash.substring(1)
        const tripId = await shittyWorkaround(hash.substring(1))
        HASH_WAS_NOT_HIGHLIGHT = false

        if (tripId === undefined) { return } // delete

        map.flyTo(MARKERS[tripId].marker.getLatLng(), 12, conf.FOCUS_ANIMATION)
        MARKERS[tripId].marker.fire("click")
    } else {
        //TODO: nice popup which informs the user that the train has already terminated or has started
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


async function shittyWorkaround(id) {
   const req = await fetch("https://derbusnachraisdorf.de/bahn/api/trip/" + id)
    const data = await req.json()

    for (const [trip, marker] of Object.entries(MARKERS)) {
        const myArrival = new Date(marker.data.nextStopovers.slice(-1)[0].plannedArrival)
        const theirArrival = new Date(data.stops.slice(-1)[0].stop.arrival.plannedTime)

        if (marker.data.line.id.replace(/\D/g, "") === data.line.toLowerCase() && marker.data.direction === data.stops.slice(-1)[0].info.name
        && myArrival.toISOString() === theirArrival.toISOString()) {
            console.log(trip)
            return trip
        }
    }
}
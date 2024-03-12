const WEBSOCKET_URL = new URL("ws://localhost:1934") // change me or run local backend instance

const API_URL = new URL("http://localhost:1825") // change me or run local backend instance


// leaflet marker options

const LINE_OPTIONS = {
    color: "blue",
    weight: 4,
    opacity: 1
}

const trainIcon = L.icon({
    iconUrl: "./img/train.png",
    iconSize:     [32, 32],
    iconAnchor:   [16, 16],
    shadowAnchor: [4, 62],
    popupAnchor:  [0, -16]
});

const TRAIN_OPTIONS = {
    icon: trainIcon
}

// time format

const TIME_FORMAT = {hour: '2-digit', minute:'2-digit'}

export {WEBSOCKET_URL, API_URL, LINE_OPTIONS, TIME_FORMAT, TRAIN_OPTIONS}
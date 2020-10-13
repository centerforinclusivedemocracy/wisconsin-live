// a simple control to display a map legend, when given a list of jQuery DOM objects
L.Control.StatewideMapLegend = L.Control.extend({
    options: {
        position: 'bottomleft',
    },
    initialize: function(options) {
        L.setOptions(this,options);
    },
    onAdd: function (map) {
        this._map = map;
        this.container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-statewidemaplegend-control');

        this.container.innerHTML = '';
        // this.container.innerHTML += '<div class="legend-entry"><span class="legend-swatch legend-swatch-lite"></span> Community-Level Demographic and Voter Data</div>';
        this.container.innerHTML += '<div class="legend-entry"><span class="legend-swatch legend-swatch-fullmodel"></span> Suggested Voting Locations</div>';
        this.container.innerHTML += '<div class="legend-entry"><span class="legend-swatch legend-swatch-none"></span> Not Analyzed</div>';

        // absorb some events e.g. don't zoom the map when someone double-clicks this panel
        L.DomEvent
        .addListener(this.container, 'mousedown', L.DomEvent.stopPropagation)
        .addListener(this.container, 'click', L.DomEvent.stopPropagation)
        .addListener(this.container, 'dblclick', L.DomEvent.stopPropagation);

        // all done
        return this.container;
    },
});

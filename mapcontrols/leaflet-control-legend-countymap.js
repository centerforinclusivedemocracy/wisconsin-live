// a simple control to display a map legend, when given a list of jQuery DOM objects
L.Control.CountyMapLegend = L.Control.extend({
    options: {
        position: 'bottomleft',
    },
    initialize: function(options) {
        L.setOptions(this,options);
    },
    onAdd: function (map) {
        this._map = map;
        this.container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-countymaplegend-control');

        this.legendarea = L.DomUtil.create('div', 'leaflet-countymaplegend-control-legendarea', this.container);

        // absorb some events e.g. don't zoom the map when someone double-clicks this panel
        L.DomEvent
        .addListener(this.container, 'mousedown', L.DomEvent.stopPropagation)
        .addListener(this.container, 'click', L.DomEvent.stopPropagation)
        .addListener(this.container, 'dblclick', L.DomEvent.stopPropagation);

        // all done
        return this.container;
    },
    updateLegends: function ($legendcontent) {
        // accept a jQuery DOM object to become the new legend
        // a little unusual, in that this pushes processing of the legend into the application, but the calculations required are unusual and that's those belong
        const $legendarea = $(this.legendarea);
        $legendarea.empty().append($legendcontent);
    }
});

// a simple control to display a map legend, when given a list of jQuery DOM objects
L.Control.CountyPicker = L.Control.extend({
    options: {
        position: 'bottomleft',
        counties: [],  // a list of select2-compatible objects, to use as the options
    },
    initialize: function(options) {
        L.setOptions(this,options);
    },
    onAdd: function (map) {
        this._map = map;
        this._container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-countypicker-control');

        // create the select element and load it with the counties options
        // then put jQuery Select2 on it, but use a timeout because we're not actually in the DOM yet
        const selector = L.DomUtil.create('select', '', this._container);
        selector.add(new Option('Select a county',''));
        this.options.counties.forEach(function (option) {
            selector.add(new Option(option.text, option.id));
        });
        this._container.appendChild(selector);
        this._selector = selector;

        setTimeout(function () {
            $(selector).select2()
            .on('select2:select', function () {
                const countyfp = $(this).val();
                if (! countyfp) return;
                const url = `county.html?county=${countyfp}`;
                document.location.href = url;
            });
        }, 0.5 * 1000);

        // absorb some events e.g. don't zoom the map when someone double-clicks this panel
        L.DomEvent
        .addListener(this._container, 'mousedown', L.DomEvent.stopPropagation)
        .addListener(this._container, 'click', L.DomEvent.stopPropagation)
        .addListener(this._container, 'dblclick', L.DomEvent.stopPropagation);

        // all done
        return this._container;
    },
});

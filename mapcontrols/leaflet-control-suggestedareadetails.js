// a simple control to display details about a suggested vote center point-circle
L.Control.SuggestedAreaDetails = L.Control.extend({
    options: {
        position: 'bottomleft',
    },
    initialize: function(options) {
        L.setOptions(this,options);
    },
    onAdd: function (map) {
        this._map = map;
        this.container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-suggestedarea-control');

        this.container.innerHTML = '<h4>Characteristics of Suggested Area (0.5 mi. Square)</h4>';

        this.detailsarea = L.DomUtil.create('div', 'leaflet-suggestedarea-details', this.container);
        this.detailsarea.innerHTML += '<span class="leaflet-suggestedarea-swatch" data-swatch="vage"></span> County Percentage of Voting Age Citizens<br/>';
        this.detailsarea.innerHTML += '<span class="leaflet-suggestedarea-swatch" data-swatch="cowo"></span> County Worker Percentage<br/>';
        this.detailsarea.innerHTML += '<span class="leaflet-suggestedarea-swatch" data-swatch="popd"></span> Population Density<br/>';
        this.detailsarea.innerHTML += '<span class="leaflet-suggestedarea-swatch" data-swatch="pcar"></span> Percent of Population with Vehicle Access<br/>';
        this.detailsarea.innerHTML += '<span class="leaflet-suggestedarea-swatch" data-swatch="nonv"></span> Eligible Non-Registered Voter Rate<br/>';
        this.detailsarea.innerHTML += '<span class="leaflet-suggestedarea-swatch" data-swatch="disb"></span> Percent Disabled Population<br/>';
        this.detailsarea.innerHTML += '<span class="leaflet-suggestedarea-swatch" data-swatch="latn"></span> Percent Latino Population<br/>';
        this.detailsarea.innerHTML += '<span class="leaflet-suggestedarea-swatch" data-swatch="noen"></span> Percent Limited English Proficient Population<br/>';
        this.detailsarea.innerHTML += '<span class="leaflet-suggestedarea-swatch" data-swatch="povr"></span> Percent of the Population in Poverty<br/>';
        this.detailsarea.innerHTML += '<span class="leaflet-suggestedarea-swatch" data-swatch="yout"></span> Percent of Population Youth<br/>';
        this.detailsarea.innerHTML += '<span class="leaflet-suggestedarea-swatch" data-swatch="vbmr"></span> Vote by Mail Rate (Total)<br/>';
        this.detailsarea.innerHTML += '<span class="leaflet-suggestedarea-swatch" data-swatch="poll"></span> Polling Place Voter Percentage<br/>';

        this.closebutton = L.DomUtil.create('a', 'leaflet-suggestedarea-closebutton', this.container);
        this.closebutton.setAttribute('href', 'javascript:void(0);');
        this.closebutton.innerHTML = '<i class="fa fa-times" />';
        L.DomEvent.addListener(this.closebutton, 'click', function () {
            showSuggestedSiteInfo(null);  // call the external function that made us exist, to dispel us
        });

        this.methodslink = L.DomUtil.create('p', '', this.container);
        this.methodslink.innerHTML = '<a target="_blank" href="methodology.html">Methodology <i class="fa fa-external-link"></i></a>';

        // absorb some events e.g. don't zoom the map when someone double-clicks this panel
        L.DomEvent
        .addListener(this.container, 'mousedown', L.DomEvent.stopPropagation)
        .addListener(this.container, 'click', L.DomEvent.stopPropagation)
        .addListener(this.container, 'dblclick', L.DomEvent.stopPropagation);

        // all done
        return this.container;
    },
    updateLegend: function (newstats) {
        // go over the set of statistics, each one being a value: hi, md, lo
        // translate that into the swatches we're displaying
        // just use jQuery here since we're tightly contrived to this one use case, where we are using jQuery
        const $swatches = $(this.detailsarea).find('span[data-swatch]');
        const allstats = [ 'vage', 'cowo', 'popd', 'pcar', 'nonv', 'disb', 'latn', 'noen', 'povr', 'yout', 'vbmr', 'poll'];

        allstats.forEach(function (statname) {
            const score = newstats[statname];
            const $swatch = $swatches.filter(`[data-swatch="${statname}"]`);

            $swatch.text('');
            $swatch.removeClass('leaflet-suggestedarea-swatch-high');
            $swatch.removeClass('leaflet-suggestedarea-swatch-medium');
            $swatch.removeClass('leaflet-suggestedarea-swatch-low');

            switch (score) {
                case 'hi':
                    $swatch.text('High').addClass('leaflet-suggestedarea-swatch-high');
                    break;
                case 'md':
                    $swatch.text('Med').addClass('leaflet-suggestedarea-swatch-medium');
                    break;
                case 'lo':
                    $swatch.text('Low').addClass('leaflet-suggestedarea-swatch-low');
                    break;
            }
        });
    },
});

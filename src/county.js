let MAP;
let COUNTYINFO;
const QUANTILEBREAKS = {};  // see initLoadQuantileBreaks() and circleSymbolizer()
const INDICATORS_BY_TRACT = {};  // see initLoadQuantileBreaks() and addIndicatorChoroplethToMap()
const SITESCOREBREAKS = {};  // see initLoadQuantileBreaks() and showSuggestedSiteInfo()
const SITESCORES = {}; // // see initLoadQuantileBreaks() and showSuggestedSiteInfo()


$(document).ready(function () {
    initCountyInfo();
    initAdditionalDataWording();
    initLoadQuantileBreaks();
    initSidebarTogglers();
    initCountyMap();
    initLayerControls();
    initDownloadModal();
    initTooltips();
});


function initCountyInfo () {
    // populate the global which we'll use often
    COUNTYINFO = getParticipatingCountyInfo((new URLSearchParams(window.location.search)).get('county'));

    // fill in the county name into the title bar
    $('#sidebar > h1').text(`${COUNTYINFO.name} County`);

    // if there is an Out Of Order message, fill in the explanation why the county is broken
    if (COUNTYINFO.outoforder) $('#outoforder').text(COUNTYINFO.outoforder);
    else $('#outoforder').remove();
}


function initAdditionalDataWording () {
    // hack to change the words Additional Data if there are no suggested / additional sites
    // because then it's not "additional" data
    const $addldatatitle = $('#additionaldata-title');

    const hasareas = COUNTYINFO.datalayers.suggestedareas.length || COUNTYINFO.datalayers.additionalareas.length;

    if (! hasareas) {
        $addldatatitle.text('Data');
    }
}


function initLoadQuantileBreaks () {
    // create the choropleth QUANTILEBREAKS from the all_sites_scored.csv and indicator_data.csv
    // some layers ue one, some use the other
    // QUANTILEBREAKS is keyed by layer ID even though many fields share the same field and thus the same breaks & ramp,
    // but keying it by layer ID gives more flexibility in the future if they want some idiosynractic processing for some unusual layers

    // in the case of indicator_data.csv we also cache the scores into INDICATORS_BY_TRACT, keyed by tract geoid
    // this is used to score & style them later e.g. addIndicatorChoroplethToMap()
    const layers_using_indicator_data = [];
    Object.keys(COUNTYINFO.datalayers).forEach(function (groupname) {
        COUNTYINFO.datalayers[groupname].forEach(function (layerinfo) {
            if (layerinfo.breaksource == 'indicatordata' &&  layerinfo.quantilefield && layerinfo.quantilecolors) {
                layers_using_indicator_data.push(layerinfo.id);
            }
        });
    });

    if (layers_using_indicator_data.length) {
        const fileurl = `data/${COUNTYINFO.countyfp}/indicator_files/indicator_data.csv`;

        busySpinner(true);

        Papa.parse(fileurl, {
            download: true,
            header: true,
            skipEmptyLines: 'greedy',
            complete: function (results) {
                // QUANTILEBREAKS
                Object.keys(COUNTYINFO.datalayers).forEach(function (groupname) {
                    COUNTYINFO.datalayers[groupname].forEach(function (layerinfo) {
                        if (layers_using_indicator_data.indexOf(layerinfo.id) === -1) return;

                        // take a quick moment to look for non-null NaNs (garbage data) and report it
                        results.data.forEach(function (row) {
                            const raw = row[layerinfo.quantilefield];
                            const value = parseFloat(raw);
                            if (raw && isNaN(value)) console.error(`indicator_data.csv found non-numeric value ${raw} in field ${layerinfo.quantilefield}`);
                        });

                        const values = results.data.map(function (row) { return parseFloat(row[layerinfo.quantilefield]); }).filter(function (value) { return ! isNaN(value); });
                        values.sort();
                        const howmanybreaks = layerinfo.quantilecolors.length;
                        const breaks = calculateModifiedJenksBreaks(values, howmanybreaks);

                        QUANTILEBREAKS[layerinfo.id] = breaks;
                    });
                });

                // INDICATORS_BY_TRACT
                results.data.forEach(function (row) {
                    const geoid = parseInt(row.geoid);  // indicator_data.csv omits leading 0, work around by treating geoids as integers (smh)
                    INDICATORS_BY_TRACT[geoid] = row;
                });

                //done
                busySpinner(false);
            },
            error: function (err) {
                busySpinner(false);
                console.error(err);
                // alert(`Problem loading or parsing ${fileurl}`);
            },
        });
    }

    const layers_using_sitescore_data = [];
    Object.keys(COUNTYINFO.datalayers).forEach(function (groupname) {
        COUNTYINFO.datalayers[groupname].forEach(function (layerinfo) {
            if (layerinfo.breaksource == 'sitescores' && layerinfo.quantilefield && layerinfo.quantilecolors) {
                layers_using_sitescore_data.push(layerinfo.id);
            }
        });
    });

    if (layers_using_sitescore_data.length) {
        const fileurl = `data/${COUNTYINFO.countyfp}/model_files/all_sites_scored.csv`;

        busySpinner(true);

        Papa.parse(fileurl, {
            download: true,
            header: true,
            skipEmptyLines: 'greedy',
            complete: function (results) {
                // go over all of the layers in this county's profile, which use quantilefield & quantilecolors AND calculate ramp from site scores
                Object.keys(COUNTYINFO.datalayers).forEach(function (groupname) {
                    COUNTYINFO.datalayers[groupname].forEach(function (layerinfo) {
                        if (layers_using_sitescore_data.indexOf(layerinfo.id) === -1) return;

                        // take a quick moment to look for non-null NaNs (garbage data) and report it
                        results.data.forEach(function (row) {
                            const raw = row[layerinfo.quantilefield];
                            const value = parseFloat(raw);
                            if (raw && isNaN(value)) console.error(`all_sites_scored.csv found non-numeric value ${raw} in field ${layerinfo.quantilefield}`);
                        });

                        const values = results.data.map(function (row) { return parseFloat(row[layerinfo.quantilefield]); }).filter(function (value) { return ! isNaN(value); });
                        values.sort();
                        const howmanybreaks = layerinfo.quantilecolors.length;
                        const breaks = calculateModifiedJenksBreaks(values, howmanybreaks);

                        QUANTILEBREAKS[layerinfo.id] = breaks;
                    });
                });

                // for individual site scoring, log a lookup of site ID number => site scores, and a lookup of the quantile breaks for these scoring fields
                // these will be used in showSuggestedSiteInfo() to display details for a single site
                /*
                dens.cvap.std: County Percentage of Voting Age Citizens
                dens.work.std: County Worker Percentage
                popDens.std: Population Density
                prc.CarAccess.std: Percent of Population with Vehicle Access
                prc.ElNonReg.std : Eligible Non-Registered Voter Rate
                prc.disabled.std: Percent Disabled Population
                prc.latino.std: Percent Latino Population
                prc.nonEngProf.std:Percent Limited English Proficient Population
                prc.pov.std: Percent of the Population in Poverty
                prc.youth.std: Percent of the Youth Population
                rate.vbm.std: Vote by Mail Rate (Total)
                dens.poll.std: Polling Place Voter Percentage
                */

                results.data.forEach(function (row) {
                    const siteid = row.idnum;
                    SITESCORES[siteid] = {};
                    SITE_SCORING_FIELDS.forEach(function (fieldname) {
                        const raw = row[fieldname];
                        const value = parseFloat(raw);
                        if (raw && isNaN(value)) console.error(`all_sites_scored.csv found non-numeric value ${raw} in field ${fieldname}`);
                        SITESCORES[siteid][fieldname] = value;
                    });
                });

                SITE_SCORING_FIELDS.forEach(function (fieldname) {
                    const values = results.data.map(function (row) { return parseFloat(row[fieldname]); }).filter(function (value) { return ! isNaN(value); });
                    values.sort();
                    const howmanybreaks = 3;
                    const breaks = ss.jenks(values, howmanybreaks);

                    SITESCOREBREAKS[fieldname] = breaks;
                });

                // done
                busySpinner(false);
            },
            error: function (err) {
                busySpinner(false);
                console.error(err);
                // alert(`Problem loading or parsing ${fileurl}`);
            },
        });
    }
}


function initSidebarTogglers () {
    jQuery('#sidebar-and-map div.sidebar-closer').click(function (event) {
        event.stopPropagation();
        toggleSidebar(false);
    });

    jQuery('#sidebar-and-map div.sidebar-opener').click(function (event) {
        event.stopPropagation();
        toggleSidebar(true);
    }).click();
}


function initTooltips () {
    // Tooltipster will look for a param called  which is a jQuery/querySelector string, and use that HTML block as the tooltip content
    const $tipbuttons = $('i[data-tooltip-content]');

    $tipbuttons.each(function () {
        $(this).tooltipster({
            trigger: 'click',
            animation: 'fade',
            animationDuration: 150,
            distance: 0,
            maxWidth: 300,
            side: [ 'right', 'bottom' ],
            contentCloning: true,  // allow multiple i links with the same tooltip
            interactive: true, // don't auto-dismiss on mouse activity inside, let user copy text, follow links, ...
            functionBefore: function (instance, helper) { // close open ones before opening this one
                jQuery.each(jQuery.tooltipster.instances(), function(i, instance) {
                    instance.close();
                });
            },
        });
    });
}


function initDownloadModal () {
    // fill in the list of dowload offerings in the Desceriptions and Download modal
    const $listing = $('#modal-download-filedownloads');

    {
        const $link = $(`<a href="data/${COUNTYINFO.countyfp}/indicator_files/indicator_data.zip" target="_blank">Demographic, Voter, and Population Data (SHP)</a>`);
        $('<li></li>').append($link).appendTo($listing);
    }
    {
        const $link = $(`<a href="data/${COUNTYINFO.countyfp}/indicator_files/indicator_data.csv" target="_blank">Demographic, Voter, and Population Data (CSV)</a>`);
        $('<li></li>').append($link).appendTo($listing);
    }

    COUNTYINFO.datalayers.suggestedareas.forEach(function (layerinfo) {
        if (! layerinfo.downloadfile) return;

        const $link = $(`<a href="data/${COUNTYINFO.countyfp}/${layerinfo.downloadfile}" target="_blank">${layerinfo.title}</a>`);
        $(`<li data-layer-id="${layerinfo.id}"></li>`).append($link).appendTo($listing);
    });

    COUNTYINFO.datalayers.additionalareas.forEach(function (layerinfo) {
        if (! layerinfo.downloadfile) return;

        const $link = $(`<a href="data/${COUNTYINFO.countyfp}/${layerinfo.downloadfile}" target="_blank">${layerinfo.title}</a>`);
        $(`<li data-layer-id="${layerinfo.id}"></li>`).append($link).appendTo($listing);
    });

    COUNTYINFO.datalayers.sitingcriteria.forEach(function (layerinfo) {
        if (! layerinfo.downloadfile) return;

        const $link = $(`<a href="data/${COUNTYINFO.countyfp}/${layerinfo.downloadfile}" target="_blank">${layerinfo.title}</a>`);
        $(`<li data-layer-id="${layerinfo.id}"></li>`).append($link).appendTo($listing);
    });

    COUNTYINFO.datalayers.populationdata.forEach(function (layerinfo) {
        if (! layerinfo.downloadfile) return;

        const $link = $(`<a href="data/${COUNTYINFO.countyfp}/${layerinfo.downloadfile}" target="_blank">${layerinfo.title}</a>`);
        $(`<li data-layer-id="${layerinfo.id}"></li>`).append($link).appendTo($listing);
    });

    COUNTYINFO.datalayers.pointsofinterest.forEach(function (layerinfo) {
        if (! layerinfo.downloadfile) return;

        const $link = $(`<a href="data/${COUNTYINFO.countyfp}/${layerinfo.downloadfile}" target="_blank">${layerinfo.title}</a>`);
        $(`<li data-layer-id="${layerinfo.id}"></li>`).append($link).appendTo($listing);
    });
}


function initLayerControls () {
    // lay out the checkboxes for the layers described in this county's data profile
    // see also findCheckboxForLayerId() which can look up one of these by the layer id
    const $sections = $('#sidebar div[data-section]');
    const $section_sugg = $sections.filter('[data-section="suggestedareas"]');
    const $section_addl = $sections.filter('[data-section="additionalareas"]');
    const $section_site = $sections.filter('[data-section="sitingcriteria"]');
    const $section_popn = $sections.filter('[data-section="populationdata"]');
    const $section_poi = $sections.filter('[data-section="pointsofinterest"]');

    COUNTYINFO.datalayers.suggestedareas.forEach(function (layerinfo) {
        const $cb = $(`<div class="form-check"><input class="form-check-input" type="checkbox" name="layers" value="${layerinfo.id}" id="layercheckbox-${layerinfo.id}"> <label class="form-check-label" for="layercheckbox-${layerinfo.id}">${layerinfo.title}</label></div>`);
        $section_sugg.append($cb);
    });
    COUNTYINFO.datalayers.additionalareas.forEach(function (layerinfo) {
        const $cb = $(`<div class="form-check"><input class="form-check-input" type="checkbox" name="layers" value="${layerinfo.id}" id="layercheckbox-${layerinfo.id}"> <label class="form-check-label" for="layercheckbox-${layerinfo.id}">${layerinfo.title}</label></div>`);
        $section_addl.append($cb);
    });
    COUNTYINFO.datalayers.sitingcriteria.forEach(function (layerinfo) {
        const $cb = $(`<div class="form-check"><input class="form-check-input" type="checkbox" name="layers" value="${layerinfo.id}" id="layercheckbox-${layerinfo.id}"> <label class="form-check-label" for="layercheckbox-${layerinfo.id}">${layerinfo.title}</label></div>`);
        $section_site.append($cb);
    });
    COUNTYINFO.datalayers.populationdata.forEach(function (layerinfo) {
        const $cb = $(`<div class="form-check"><input class="form-check-input" type="checkbox" name="layers" value="${layerinfo.id}" id="layercheckbox-${layerinfo.id}"> <label class="form-check-label" for="layercheckbox-${layerinfo.id}">${layerinfo.title}</label></div>`);
        $section_popn.append($cb);
    });
    COUNTYINFO.datalayers.pointsofinterest.forEach(function (layerinfo) {
        const $cb = $(`<div class="form-check"><input class="form-check-input" type="checkbox" name="layers" value="${layerinfo.id}" id="layercheckbox-${layerinfo.id}"> <label class="form-check-label" for="layercheckbox-${layerinfo.id}">${layerinfo.title}</label></div>`);
        $section_poi.append($cb);
    });

    // check-change behavior on those checkboxes, to toggle layers
    const $checkboxes = $('#sidebar div[data-section] input[type="checkbox"][name="layers"]');
    $checkboxes.change(function () {
        const layerid = $(this).prop('value');
        const checked = $(this).is(':checked');
        toggleMapLayer(layerid, checked);
        refreshMapLegend();
    });

    // afterthought: any of those layer sets with 0 layers, we should delete their placeholder UI e.g. a title bar with nothing under it
    if (! COUNTYINFO.datalayers.suggestedareas.length) {
        $section_sugg.parents('div').first().remove();
    }
    if (! COUNTYINFO.datalayers.additionalareas.length) {
        $section_addl.parents('div').first().remove();
    }
    if (! COUNTYINFO.datalayers.sitingcriteria.length) {
        $section_site.prev('button').remove();
        $section_site.remove();
    }
    if (! COUNTYINFO.datalayers.populationdata.length) {
        $section_popn.prev('button').remove();
        $section_popn.remove();
    }
    if (! COUNTYINFO.datalayers.pointsofinterest.length) {
        $section_poi.prev('button').remove();
        $section_poi.remove();
    }

    // the toggle sections of the Additional Data accordion, need their chvrons to change when they expand/collapse
    $('#sidebar div.collapse')
    .on('hide.bs.collapse', function () {
        const myid = $(this).prop('id');
        const $button = $(`#sidebar button[data-target="#${myid}"]`);
        const $chevron = $button.find('i');
        $chevron.removeClass('fa-chevron-down').addClass('fa-chevron-right');
    })
    .on('show.bs.collapse', function () {
        const myid = $(this).prop('id');
        const $button = $(`#sidebar button[data-target="#${myid}"]`);
        const $chevron = $button.find('i');
        $chevron.removeClass('fa-chevron-right').addClass('fa-chevron-down');
    });

    // a CSV file has a list of how many points are in each of the point files
    // load that, and add readouts to each layer showing this
    const sacfileurl = `data/${COUNTYINFO.countyfp}/model_files/site_area_count.csv`;
    Papa.parse(sacfileurl, {
        download: true,
        header: true,
        skipEmptyLines: 'greedy',
        complete: function (results) {
            results.data.forEach(function (line) {
                // the layer ID corresponds to a checkbox, a label, and so on
                // although in an edge case the layer may be disabled, and no checkbox; so we have to be circumspect about assuming that
                const layerid = line.file;
                let $checkbox;
                try { $checkbox = findCheckboxForLayerId(layerid); } catch (err) {}
                if (! $checkbox) return;

                const howmany = parseInt(line.count);
                const $label = $checkbox.siblings('label');
                const $cbdiv = $checkbox.closest('div.form-check');
                const $dllink = $(`#modal-download-filedownloads li[data-layer-id="${layerid}"]`);

                // if it's 0 then delete BOTH the checkbox's row and its download link; a lot of cross-dependencies here, see also initDownloadModal()
                if (howmany) {
                    $(`<span class="ml-2">(${howmany})</span>`).appendTo($label);
                }
                else {
                    $cbdiv.remove();
                    $dllink.remove();
                }
            });
        },
        error: function (err) {
            // the site_area_count.csv is mostly used for the suggested areas, and some data profiles won't have that
            // and setting up these (X) count readouts is not vital to functioning,
            // so it's okay if the file is not found, and we won't throw a fit
            busySpinner(false);
            //console.error(err);
            // alert(`Problem loading or parsing ${sacfileurl}`);
        },
    });

    // the Clear All button simply unchecks everything
    // also, be extra snazzy and show/hide when have any layers/no layers to clear
    const $clearbuttondiv = $('#clearselections');
    const $clearbutton = $clearbuttondiv.find('a');
    $clearbutton.click(function () {
        clearAllSelections();
    });
    $checkboxes.change(function () {
        const selectedlayerids = getEnabledLayerIds();
        if (selectedlayerids.length) $clearbuttondiv.removeClass('d-none');
        else $clearbuttondiv.addClass('d-none');
    });
}


function initCountyMap () {
    // the map, a fixed basemap, a labels overlay, and our special map controls
    // note the ZoomBar which we add after we have GeoJSON data and therefore a home extent
    MAP = L.map('countymap', {
        zoomControl: false,
        maxZoom: 18,
        minZoom: 6,
    });

    L.control.scale({
        position: 'bottomleft',
        updateWhenIdle: true
    })
    .addTo(MAP);

    new L.controlCredits({
        image: './images/greeninfo.png',
        link: 'https://www.greeninfo.org/',
        text: 'Interactive mapping<br/>by GreenInfo Network',
        position: 'bottomleft',
    })
    .addTo(MAP);

    MAP.BASEMAPBAR = new L.Control.BasemapBar({
        position: 'topright',
        layers: BASEMAP_OPTIONS,
    })
    .addTo(MAP)
    .selectLayer(BASEMAP_OPTIONS[0].label);

    // two controls at the bottom to open some modals
    L.easyButton('Data Descriptions and Download <i class="fa fa-download"></i>', function () {
        $('#modal-download').modal('show');
    }, { position: 'bottomright' }).addTo(MAP);
    L.easyButton('Using This Tool <i class="fa fa-info-circle"></i>', function () {
        $('#modal-usingthistool').modal('show');
    }, { position: 'bottomright' }).addTo(MAP);

    // the legend control; see refreshMapLegend() which recalculates from all visible layers, and submits to this control
    // and the suggested area details special control
    // and a click behavior to dismiss the SuggestedAreaDetails control
    MAP.LEGENDCONTROL = new L.Control.CountyMapLegend();
    MAP.SUGGESTEDAREACONTROL = new L.Control.SuggestedAreaDetails();
    MAP.SUGGESTEDAREAHIGHLIGHT = L.featureGroup([]).addTo(MAP);
    MAP.on('click', function () {
        showSuggestedSiteInfo(null);
    });

    // load the statewide counties GeoJSON and filter to this one
    const gjurl = `data/counties.js`;
    $.get(gjurl, function (data) {
        MAP.COUNTYOVERLAY = L.geoJson(data, {
            filter: function (feature) {
                return feature.properties.countyfp == COUNTYINFO.countyfp;
            },
            style: SINGLECOUNTY_STYLE,
        })
        .addTo(MAP);

        const bbox = MAP.COUNTYOVERLAY.getBounds();
        MAP.fitBounds(bbox);

        // now that we have a home bounds, add the zoom+home control then the geocoder control under it (they are positioned in sequence)
        MAP.ZOOMBAR = new L.Control.ZoomBar({
            position: 'topright',
            homeBounds: bbox,
        }).addTo(MAP);

        MAP.GEOCODER = L.Control.geocoder({
            position: 'topright',
            showUniqueResult: false,
            defaultMarkGeocode: false,
            placeholder: 'Search for address or place',
            collapsed: true,  // control is buggy if expanded, won't close results list
        })
        .on('markgeocode', function (event) {
            MAP.fitBounds(event.geocode.bbox);
        })
        .addTo(MAP);
    }, 'json')
    .fail(function (err) {
        busySpinner(false);
        console.error(err);
        // alert(`Problem loading or parsing ${gjurl}`);
    });

    // a registry of layers currently in the map: layer ID => L.tileLayer or L.geoJson or L.featureGroup or whatever
    // and some panes for prioritizing them by mapzindex
    // managed by toggleMapLayer()
    MAP.OVERLAYS = {};

    MAP.createPane('low'); MAP.getPane('low').style.zIndex = 400;
    MAP.createPane('medium'); MAP.getPane('medium').style.zIndex = 410;
    MAP.createPane('high'); MAP.getPane('high').style.zIndex = 420;
    MAP.createPane('highest'); MAP.getPane('highest').style.zIndex = 430;
    MAP.createPane('highlights'); MAP.getPane('highlights').style.zIndex = 490;
}


function toggleSidebar (desired) {
    const $sidebar = jQuery('#sidebar');
    const $themap = jQuery('#countymap');
    const $opener = jQuery('#sidebar-and-map div.sidebar-opener');
    const $closer = jQuery('#sidebar-and-map div.sidebar-closer');
    const show = desired !== undefined ? desired : ! $sidebar.is(':visible');

    if (show) {
        $sidebar.removeClass('d-none');
        $closer.removeClass('d-none');
        $opener.addClass('d-none');
        $themap.addClass('map-with-sidebar');
    }
    else {
        $sidebar.addClass('d-none');
        $closer.addClass('d-none');
        $opener.removeClass('d-none');
        $themap.removeClass('map-with-sidebar');
    }

    if (MAP) {
        MAP.invalidateSize();
    }
}


function toggleMapLayer (layerid, visible) {
    const layerinfo = getLayerInfoByid(layerid);
    if (! layerinfo) throw new Error(`getLayerInfoByid() no layer named ${layerid}`);

    // turn off a map layer is easy!
    if (! visible) {
        if (MAP.OVERLAYS[layerid]) {
            MAP.removeLayer(MAP.OVERLAYS[layerid]);
            delete MAP.OVERLAYS[layerid];
        }

        // well, slightly less easy because turning off vote center layers should also stop showing highlights
        // potential bug-like behavior would be turning on multiple suggested areas, highlighting one in one layer, and finding it un-highlghted when turning off the other layer
        // but that's really an edge case, and would be quite difficult to work around
        const issuggestedarea = layerinfo.breaksource == 'sitescores' && (layerinfo.quantilefield == 'center_score' || layerinfo.quantilefield == 'droppoff_score');
        if (issuggestedarea) showSuggestedSiteInfo(null);

        return;
    }

    // if we're turning on a layer, and it is part of a radiogroup, then turn off all others layers in that same radiogroup
    if (visible && layerinfo.radiogroup) {
        Object.keys(COUNTYINFO.datalayers).forEach(function (groupname) {
            COUNTYINFO.datalayers[groupname].forEach(function (thislayerinfo) {
                if (thislayerinfo.radiogroup != layerinfo.radiogroup) return;  // not in the same group
                if (! MAP.OVERLAYS[thislayerinfo.id]) return;  // not currently on the map
                if (thislayerinfo.id == layerinfo.id) return;  // it's this-here layer we're turning on

                const $uncheckme = findCheckboxForLayerId(thislayerinfo.id);
                setTimeout(function () {  // use a timeout so that a failure won't block continued execution of turning on our layer
                    $uncheckme.prop('checked', false).change();
                }, 1);
            });
        });
    }

    // hand off to whichever type of layer this is:
    // site scoring indicator. tract demographics indicator, point file for GeoJSON circles, custom GeoJSON file, ...
    if (layerinfo.customgeojsonfile) {
        addCustomGeoJsonFileToMap(layerinfo);
    }
    else if (layerinfo.csvfile) {
        addCsvPointFileToMap(layerinfo);
    }
    else if (layerinfo.scoresource == 'indicatordata') {
        addIndicatorChoroplethToMap(layerinfo);
    }
    else {
        throw new Error(`toggleMapLayer() not sure what to do with ${layerid}`);
    }
}


function getEnabledLayerIds () {
    const $checkboxes = $('#sidebar div[data-section] input[type="checkbox"][name="layers"]');
    const $checked = $checkboxes.filter(':checked');
    const ids = $checked.map(function () { return $(this).prop('value'); }).get();
    return ids;
}


function clearAllSelections () {
    const $checkboxes = $('#sidebar div[data-section] input[type="checkbox"][name="layers"]');
    $checkboxes.prop('checked', false).change();  // these have change handlers
}


function refreshMapLegend () {
    // compose a list of HTML legends (jQuery items) for all visible layers
    // do this in a few apsses to accommodate multiple types of legend: demographic detailed with break values, simple low-to-high, plain icons with layer title, ...
    const enabledlayerids = getEnabledLayerIds();
    const $collectedlegends = $('<div class="legend"></div>');

    // if there are no layers, then we can simply hide the legend control and be done with it
    // it only needs all the update code below if we're showing and updating
    if (! enabledlayerids.length) return MAP.removeControl(MAP.LEGENDCONTROL);

    // simple circle icons with the layer title
    enabledlayerids.forEach(function (layerid) {
        const layerinfo = getLayerInfoByid(layerid);
        if (layerinfo.legendformat || layerinfo.quantilefield) return;  // uses the more detailed legends, not simple point/circle legend
        if (! layerinfo.circle) return;  // not a circle icon

        const bgcolor = layerinfo.circle.fillColor;  // this being the "simple" point legends, this is a fixed style color, not a computation
        const bordercolor = layerinfo.circle.color;
        const opacity = layerinfo.circle.fillOpacity;

        const $legend = $(`<div class="legend-layer" data-layer-id="${layerinfo.id}"></div>`);
        const $swatch = $(`<h4><div class="legend-swatch legend-swatch-circle" style="background-color: ${bgcolor}; border-color: ${bordercolor}; opacity: ${opacity};"></div> ${layerinfo.title}</h4>`);
        $swatch.appendTo($legend);

        // done, add to the list
        $collectedlegends.append($legend);
    });

    // low-to-high circle swatches, used for site scoring
    enabledlayerids.forEach(function (layerid) {
        const layerinfo = getLayerInfoByid(layerid);
        if (layerinfo.legendformat != 'lowtohigh') return;  // uses the simpler low-to-high legend, not a detailed one like for demographics
        if (! layerinfo.quantilecolors) return;  // no colors defined, that's not right

        const $legend = $(`<div class="legend-layer" data-layer-id="${layerinfo.id}"></div>`);
        $(`<h4>${layerinfo.title}</h4>`).appendTo($legend);

        const $entry = $('<div class="legend-entry"></div>').appendTo($legend);
        $('<span>Low</span>').appendTo($entry);
        $('<span>&nbsp;</span>').appendTo($entry);
        layerinfo.quantilecolors.forEach(function (color) {
            const bordercolor = layerinfo.circle.color;
            $(`<div class="legend-swatch legend-swatch-square" style="background-color: ${color}; border-color: ${bordercolor}"></div>`).appendTo($entry);
            $('<span>&nbsp;</span>').appendTo($entry);
        });
        $('<span>High</span>').appendTo($entry);

        $('<br />').appendTo($entry);
        $('<span><a target="_blank" href="./methodology.html">Methodology</a> | <a target="_blank" href="./methodology.html#scoring-model">Site Scores <i class="fa fa-external-link"></i></a></span>').appendTo($entry);

        // done, add to the list
        $collectedlegends.append($legend);
    });

    // quantile ramps with detailed break values, e.g. demographics and percentages
    enabledlayerids.forEach(function (layerid) {
        const layerinfo = getLayerInfoByid(layerid);
        if (! layerinfo.legendformat) return;  // no legend format given, skip it
        if (! layerinfo.quantilefield) return;  // not a quantiled color ramp legend, so skip it
        if (layerinfo.legendformat == 'lowtohigh') return;  // uses the simpler low-to-high legend, not a detailed one like for demographics

        const title = layerinfo.title;
        const breaks = QUANTILEBREAKS[layerinfo.id];
        const colors = layerinfo.quantilecolors;

        const $legend = $(`<div class="legend-layer" data-layer-id="${layerinfo.id}"></div>`);
        $(`<h4>${title}</h4>`).appendTo($legend);

        // super-duper special workaround for very skewed data: a single value, nodata conditions, ...
        if (! breaks) {
            // no breaks at all = fail with a nodata legend
            const color = NODATA_COLOR;
            const text = 'No Data';
            $(`<div class="legend-entry"><div class="legend-swatch" style="background-color: ${color};"></div> ${text}</div>`).appendTo($legend);
        }
        else if (breaks.length == 1) {
            // single break value = all data have same value = very short special legend
            const color = colors[0];
            const text = formatValue(breaks[0], layerinfo.legendformat);
            $(`<div class="legend-entry"><div class="legend-swatch" style="background-color: ${color};"></div> ${text}</div>`).appendTo($legend);

            // add the No Data swatch to the end
            $(`<div class="legend-entry"><div class="legend-swatch" style="background-color: ${NODATA_COLOR};"></div> No Data</div>`).appendTo($legend);
        }
        else {
            // hey, real data with breaks that we can color and print out
            for (var i=0, l=breaks.length; i<l; i++) {
                const nextvalue = breaks[i + 1];
                const isthefirst = i == 0;
                const isthelast = i == breaks.length - 1;

                const color = colors[i];
                const value = breaks[i];

                const valuetext = formatValue(value, layerinfo.legendformat);
                const nextvaluetext = formatValue(nextvalue, layerinfo.legendformat);

                let text;
                if (isthefirst) text = `Under ${nextvaluetext}`;
                else if (isthelast) text = `${valuetext} or higher`;
                else text = `${valuetext} - ${nextvaluetext}`;
                $(`<div class="legend-entry"><div class="legend-swatch" style="background-color: ${color};"></div> ${text}</div>`).appendTo($legend);
            }

            // add the No Data swatch to the end
            $(`<div class="legend-entry"><div class="legend-swatch" style="background-color: ${NODATA_COLOR};"></div> No Data</div>`).appendTo($legend);
        }

        // done, add to the list
        $collectedlegends.append($legend);

        // add the legend entry for unreliable squares
        $(`<div class="legend-entry"><div class="legend-swatch legend-swatch-nodata"></div> Estimates that have a high degree of uncertainty</div>`).appendTo($legend);

        // do we have a caveat footnote?
        if (COUNTYINFO.censusfootnote) {
            $(`<div class="legend-entry">${COUNTYINFO.censusfootnote}</div>`).appendTo($legend);
        }
    });

    // send them to the legend control for a refresh
    MAP.addControl(MAP.LEGENDCONTROL);
    MAP.LEGENDCONTROL.updateLegends($collectedlegends);
}


function addIndicatorChoroplethToMap (layerinfo) {
    // fetch the tracts GeoJSON file and look up scores from the cached indicator data
    // add the vector features to the map, styled by their score
    // don't worry about "downloading" these files with every request; in reality they'll be cached
    const tractsurl = `data/${COUNTYINFO.countyfp}/tracts.json`;
    busySpinner(true);
    $.getJSON(tractsurl, function (gjdata) {
        busySpinner(false);

        const featuregroup = L.geoJson(gjdata, {
            style: function (feature) {
                const style = Object.assign({}, CENSUSTRACT_STYLE);
                const geoid = parseInt(feature.properties.geoid);  // indicator_data.csv omits leading 0, work around by treating geoids as integers (smh)
                const indicators = INDICATORS_BY_TRACT[geoid];
                if (! indicators) { console.debug(`No INDICATORS_BY_TRACT entry for ${geoid}`); return style; }
                const value = parseFloat(indicators[layerinfo.scorefield]);
                const breaks = QUANTILEBREAKS[layerinfo.id];
                const colors = layerinfo.quantilecolors;
                const thiscolor = pickColorByValue(value, breaks, colors);

                // fill is either the solid color, or else a StripePattern if the data are unreliable
                // note that L.StripePattern must be added to the Map, but we don't have a way of tracking which ones are in use so they will pile up over time and be a potential memory leak
                // that's probably not realistic unless one toggles thousnads of times between reloading
                const unreliable = parseInt(indicators[`${layerinfo.scorefield}_unreliable_flag`]) == 1;
                if (unreliable) {
                    const stripes = new L.StripePattern({
                        angle: -45,
                        weight: 7, spaceWeight: 1,  // default width is 8, this defines a 7:1 ratio
                        color: thiscolor, opacity: 1,  // fill is the selected color
                        spaceColor: 'black', spaceOpacity: 0.25,  // stripes, half-black
                    }).addTo(MAP);
                    style.fillPattern = stripes;
                }
                else {
                    style.fillColor = thiscolor;
                }

                return style;
            },
        });

        // add to the map and to the registry
        MAP.OVERLAYS[layerinfo.id] = featuregroup;
        featuregroup.addTo(MAP);
    })
    .fail(function (err) {
        busySpinner(false);
        console.error(err);
        // alert(`Problem loading or parsing ${tractsurl}`);
    });
}


function addCsvPointFileToMap (layerinfo) {
    const fileurl = `data/${COUNTYINFO.countyfp}/${layerinfo.csvfile}`;
    busySpinner(true);
    Papa.parse(fileurl, {
        download: true,
        header: true,
        skipEmptyLines: 'greedy',
      	complete: function (results) {
            busySpinner(false);

            // data fix: standardize lat & lon to numbers
            results.data.forEach(function (row) {
                row.lat = parseFloat(row.lat);
                row.lon = parseFloat(row.lon);
            });

            // populate a new FeatureGroup with these circles, markers, whatever
            const featuregroup = L.featureGroup([]);
            results.data.forEach(function (row) {
                const issuggestedarea = layerinfo.breaksource == 'sitescores' && (layerinfo.quantilefield == 'center_score' || layerinfo.quantilefield == 'droppoff_score');
                if (issuggestedarea) {
                    const square = suggestedAreaSymbolizer(layerinfo, row);
                    square.addTo(featuregroup);
                }
                else if (layerinfo.circle) {
                    const circle = circleSymbolizer(layerinfo, row);
                    circle.addTo(featuregroup);
                }
            });

            // add to the map and to the registry
            MAP.OVERLAYS[layerinfo.id] = featuregroup;
            featuregroup.addTo(MAP);
        },
        error: function (err) {
            busySpinner(false);
            console.error(err);
            // alert(`Problem loading or parsing ${fileurl}`);
        },
    });
}


function addCustomGeoJsonFileToMap (layerinfo) {
    // fetch the custom GeoJSON file and add it to the map, using the given style
    busySpinner(true);
    $.getJSON(`data/${COUNTYINFO.countyfp}/${layerinfo.customgeojsonfile}`, function (gjdata) {
        busySpinner(false);

        const featuregroup = L.geoJson(gjdata, {
            style: function (feature) {
                return layerinfo.style;  // just use the supplied layerinfo.style... for now
            },
        });

        // add to the map and to the registry
        MAP.OVERLAYS[layerinfo.id] = featuregroup;
        featuregroup.addTo(MAP);
    });
}


function suggestedAreaSymbolizer (layerinfo, row) {
    // Leaflet hack: a circle bounds can only be computer if the circle is on the map, so we do need to add it for a split-second
    const circle = L.circle([row.lat, row.lon], {radius: layerinfo.circle.radius}).addTo(MAP);

    const squareoptions = Object.assign({}, layerinfo.circle);
    squareoptions.bubblingMouseEvents = false;
    squareoptions.pane = layerinfo.mapzindex ? layerinfo.mapzindex : 'low';

    if (squareoptions.fillColor == 'quantile') {
        const value = parseFloat(row[layerinfo.quantilefield]);
        const breaks = QUANTILEBREAKS[layerinfo.id];
        const colors = layerinfo.quantilecolors;

        // start with the highest color, work downward until we find our value >=X, and that's our break
        let color;
        for (var i=breaks.length-1; i>=0; i--) {
            if (value >= breaks[i]) { color = colors[i]; break; }
        }

        squareoptions.fillColor = color;
    }

    const square = L.rectangle(circle.getBounds(), squareoptions);
    circle.removeFrom(MAP);

    // suggested areas get a special click behavior
    // see also the MAP click behavior which dismisses this by clicking anywhere else
    square.on('click', function () {
        square.feature = {};
        square.feature.properties = row;
        showSuggestedSiteInfo(square, row, layerinfo);
    });

    return square;
}


function circleSymbolizer (layerinfo, row) {
    // given a point data row and a layerinfo from the county's data profile,
    // return a Leaflet layer (here, a L.Circle) suited to adding to the new layergroup
    const circleoptions = Object.assign({}, layerinfo.circle);
    circleoptions.interactive = layerinfo.popupnamefield ? true : false;
    circleoptions.bubblingMouseEvents = false;
    circleoptions.pane = layerinfo.mapzindex ? layerinfo.mapzindex : 'low';

    if (circleoptions.fillColor == 'quantile') {
        const value = parseFloat(row[layerinfo.quantilefield]);
        const breaks = QUANTILEBREAKS[layerinfo.id];
        const colors = layerinfo.quantilecolors;

        const thiscolor = pickColorByValue(value, breaks, colors);
        circleoptions.fillColor = thiscolor;
    }

    const circle = L.circle([row.lat, row.lon], circleoptions);

    // compose a popup of Type and Name; type may be a fixed string or a field in the CSV
    if (layerinfo.popupnamefield) {
        const name = layerinfo.popupnametext ? layerinfo.popupnametext : row[layerinfo.popupnamefield];
        const type = layerinfo.popuptypetext ? layerinfo.popuptypetext : row[layerinfo.popuptypefield];

        const htmllines = [];
        if (type) htmllines.push(`<b>Type:</b> ${type.toTitleCase()}`);
        if (name) htmllines.push(`<b>Name</b>: ${name}`);

        if (htmllines.length) {  // no text fields = no lines = no popup
            let popuphtml = htmllines.join('<br />');
            popuphtml = popupContentPostprocessing(popuphtml, COUNTYINFO.countyfp, layerinfo, row);

            circle.bindPopup(popuphtml);
        }
    }

    return circle;
}


function getLayerInfoByid (layerid) {
    let foundlayer;
    Object.keys(COUNTYINFO.datalayers).forEach(function (groupname) {
        COUNTYINFO.datalayers[groupname].forEach(function (layerinfo) {
            if (layerinfo.id == layerid) foundlayer = Object.assign({}, layerinfo);  // return a copy, no mutating  ;)
        });
    });
    return foundlayer;
}


function findCheckboxForLayerId (layerid) {
    const $sections = $('#sidebar div[data-section]');
    const $checkbox = $sections.find(`input[type="checkbox"][name="layers"][value="${layerid}"]`);
    if (! $checkbox.length) throw new Error(`findCheckboxForLayerId() no checkbox for ${layerid}`);
    return $checkbox;
}


function showSuggestedSiteInfo (square, row, layerinfo) {
    // passing a single null is OK = stop highlighting any sugegsted site
    if (! row) {
        MAP.SUGGESTEDAREAHIGHLIGHT.clearLayers();
        MAP.removeControl(MAP.SUGGESTEDAREACONTROL);
        return;
    }

    // highlight the square on the map, by drawing a second square at the same latlng+center but with this highlight style
    const highlightsquareoptions = Object.assign({}, HIGHLIGHT_SUGGESTED_AREA);
    highlightsquareoptions.radius = square.options.radius;
    highlightsquareoptions.pane = 'highlights';

    const highlightsquare = L.rectangle(square.getBounds(), highlightsquareoptions);
    MAP.SUGGESTEDAREAHIGHLIGHT.clearLayers().addLayer(highlightsquare);

    // show the Suggested Area Details map control, and fill in the details
    const siteid = square.feature.properties.idnum;
    const scores = SITESCORES[siteid];

    const stats = {};
    stats.vage = scores['dens.cvap.std'] >= SITESCOREBREAKS['dens.cvap.std'][2] ? 'hi' : scores['dens.cvap.std'] >= SITESCOREBREAKS['dens.cvap.std'][1] ? 'md' : 'lo';
    stats.cowo = scores['dens.work.std'] >= SITESCOREBREAKS['dens.work.std'][2] ? 'hi' : scores['dens.work.std'] >= SITESCOREBREAKS['dens.work.std'][1] ? 'md' : 'lo';
    stats.popd = scores['popDens.std'] >= SITESCOREBREAKS['popDens.std'][2] ? 'hi' : scores['popDens.std'] >= SITESCOREBREAKS['popDens.std'][1] ? 'md' : 'lo';
    stats.pcar = scores['prc.CarAccess.std'] >= SITESCOREBREAKS['prc.CarAccess.std'][2] ? 'hi' : scores['prc.CarAccess.std'] >= SITESCOREBREAKS['prc.CarAccess.std'][1] ? 'md' : 'lo';
    stats.nonv = scores['prc.ElNonReg.std'] >= SITESCOREBREAKS['prc.ElNonReg.std'][2] ? 'hi' : scores['prc.ElNonReg.std'] >= SITESCOREBREAKS['prc.ElNonReg.std'][1] ? 'md' : 'lo';
    stats.disb = scores['prc.disabled.std'] >= SITESCOREBREAKS['prc.disabled.std'][2] ? 'hi' : scores['prc.disabled.std'] >= SITESCOREBREAKS['prc.disabled.std'][1] ? 'md' : 'lo';
    stats.latn = scores['prc.latino.std'] >= SITESCOREBREAKS['prc.latino.std'][2] ? 'hi' : scores['prc.latino.std'] >= SITESCOREBREAKS['prc.latino.std'][1] ? 'md' : 'lo';
    stats.noen = scores['prc.nonEngProf.std'] >= SITESCOREBREAKS['prc.nonEngProf.std'][2] ? 'hi' : scores['prc.nonEngProf.std'] >= SITESCOREBREAKS['prc.nonEngProf.std'][1] ? 'md' : 'lo';
    stats.povr = scores['prc.pov.std'] >= SITESCOREBREAKS['prc.pov.std'][2] ? 'hi' : scores['prc.pov.std'] >= SITESCOREBREAKS['prc.pov.std'][1] ? 'md' : 'lo';
    stats.yout = scores['prc.youth.std'] >= SITESCOREBREAKS['prc.youth.std'][2] ? 'hi' : scores['prc.youth.std'] >= SITESCOREBREAKS['prc.youth.std'][1] ? 'md' : 'lo';
    stats.vbmr = scores['rate.vbm.std'] >= SITESCOREBREAKS['rate.vbm.std'][2] ? 'hi' : scores['rate.vbm.std'] >= SITESCOREBREAKS['rate.vbm.std'][1] ? 'md' : 'lo';
    stats.poll = scores['dens.poll.std'] >= SITESCOREBREAKS['dens.poll.std'][2] ? 'hi' : scores['dens.poll.std'] >= SITESCOREBREAKS['dens.poll.std'][1] ? 'md' : 'lo';

    // feed the stats into the control and open it
    MAP.addControl(MAP.SUGGESTEDAREACONTROL);
    MAP.SUGGESTEDAREACONTROL.updateLegend(stats);
}


function formatValue (value, legendformat) {
    let valuetext = value;  // start with the value. format it below with rounding, adding %, whatever

    switch (legendformat) {
        case 'decimal':
            valuetext = value.toFixed(1);
            break;
        case 'percent':
            valuetext = (100 * value).toFixed(1) + '%';
            break;
        case 'integer':
            valuetext = Math.round(value).toLocaleString();
            break;
    }

    return valuetext;
}


function calculateModifiedJenksBreaks (values, howmanybreaks) {
    // ss.jenks() has weird failure modes when fed some non-ideal data, and we get plenty of that!
    // even with good data, it has some quirky behaviors such as undefined breaks, repeated break values, ...
    // and we work around those to give back nice, clean breaks ... or else a null

    // run ss.jenks() and let it stay null if there was some critical failure
    // if there aren't enough data points, try making fewer classes, sometimes it works
    let howmanybreaksforreal = howmanybreaks;
    if (howmanybreaks > values.length && values.length > 1) howmanybreaksforreal = values.length;
    let breaks = null;
    try { breaks = ss.jenks(values, howmanybreaksforreal); } catch (err) {}

    if (breaks) {
        // got breaks; good, but still need to clean up the results
        // then ss.jenks() has some quirky behaviors with monotonous data: undefined breaks, same break numbers, 0s as breaks, ... try to prune these out
        breaks.length = breaks.length - 1;  // trim the last (max value, not a break)
        breaks.splice(0, 1);  // trim the first (min value, not a break)

        breaks = breaks.filter(function (value) { return value; }); // remove undefined break points (data with insufficient variation and/or length)
        breaks = breaks.unique();  // remove duplicate break values (data with insufficient variation)

        breaks.splice(0, 0, 0);  // prepend a 0 so color array is aligned: color 0 = "up to" 1stbreak value
    }
    else if (values.length) {
        // didn't get breaks but we did have data
        // this means insufficient data values or variation, for Jenks breaks to even give back quirky results
        // make up a single-value set of breaks, so we can move on
        breaks = [ values[values.length - 1] ];
    }
    // else
    // we didn't get back breaks, because we had no real data values (0 length or all null/nodata)
    // just leave it at null, and callers will need to handle that condition

    // done
    return breaks;
}


function pickColorByValue (value, breaks, colors) {
    if (! breaks || isNaN(value)) return NODATA_COLOR;

    // start with the highest color, work downward until we find our value >=X, and that's our break
    let color;
    for (var i=breaks.length-1; i>=0; i--) {
        if (value >= breaks[i]) { color = colors[i]; break; }
    }

    return color;
}


function busySpinner (showit) {
    const $modal = $('#modal-busy');
    if (showit) $modal.modal('show');
    else $modal.modal('hide');
}

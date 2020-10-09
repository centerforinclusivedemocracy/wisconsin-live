$(document).ready(function () {
    initFillScopeLists();
});


function initFillScopeLists () {
    // fill in the two Scope sections, which counties use which model
    const $listing_full = $('#fullAnalysisCountyList');
    const $listing_lite = $('#liteAnalysisCountyList');

    PARTICIPATING_COUNTIES.forEach(function (countyinfo) {
        let $targetlist;
        switch (countyinfo.profile) {
            case 'fullmodel':
                $targetlist = $listing_full;
                break;
            case 'lite':
                $targetlist = $listing_lite;
                break;
            default:
                console.error(`County ${countyinfo.countyfp} has unknown profile '${countyinfo.profile}' for Scope list`);
                break;
        }

        if ($targetlist) {
            $(`<li>${countyinfo.name}</li>`).appendTo($targetlist);
        }
    });
}

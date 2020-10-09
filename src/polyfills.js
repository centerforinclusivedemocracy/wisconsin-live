// some utility functions

String.prototype.toTitleCase = function () {
    return this.replace('_',' ').replace(/\w\S*/g, function (txt) { return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase(); });
};

Array.prototype.unique = function () {
    return this.filter(function (x, i, a) { return a.indexOf(x) == i; });
};

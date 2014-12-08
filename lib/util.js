// util.js
// Utility functions, mostly to get rid of dependency libraries
//

module.exports = {
    isArray: function(a) {
        return Array.isArray ? Array.isArray(a) :
            Object.prototype.toString.call(a) === '[object Array]';
    },

    has: function(obj, key) {
        return obj && obj[key] !== undefined;
    },

    zipObject: function(a, b) {
        var l = Math.min(a.length, b.length);

        var o = {};
        for (var i = 0 ; i < l ; i ++) {
            o[a[i]] = b[i];
        }

        return o;
    }
};

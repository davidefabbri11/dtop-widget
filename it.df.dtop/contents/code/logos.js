// App logo for a container image: a port of dtop's src/ui/app_logos.rs (MIT, Copyright (c) 2025
// Amir Raminfar), itself a port of Dozzle's iconSlugForImage. No Qt/QML APIs — runs in QML and Node.
// `data` is logodata.js (passed in: QML JS imports can't import each other portably).

function normalized(name) {
    return name.replace(/_/g, "-").toLowerCase();
}

// dtop compares with ASCII lowercasing only: non-ASCII names never match a slug.
function isAscii(s) {
    return /^[\x00-\x7f]*$/.test(s);
}

function stripSuffix(name, data) {
    for (var i = 0; i < data.SUFFIXES.length; i++) {
        var cut = name.length - data.SUFFIXES[i].length - 1;
        if (cut < 0) continue;
        if (normalized(name.substring(cut)) === "-" + data.SUFFIXES[i]) return cut > 1 ? name.substring(0, cut) : name;
    }
    return name;
}

var cachedData = null;
var cachedSet = null;

function logoSet(data) {
    if (cachedData !== data) {
        cachedSet = {};
        data.LOGOS.forEach(function (s) { cachedSet[s] = true; });
        cachedData = data;
    }
    return cachedSet;
}

function slugForImage(image, data) {
    var reference = String(image || "").split("@")[0];
    var colon = reference.lastIndexOf(":");
    if (colon >= 0 && colon > reference.lastIndexOf("/")) reference = reference.substring(0, colon);
    var segments = reference.split("/").filter(function (s) { return s.length > 0; });
    var hasHost = segments.length > 1
        && (/[.:]/.test(segments[0]) || segments[0].toLowerCase() === "localhost");
    var usable = segments.length - (hasHost ? 1 : 0);
    var logos = logoSet(data);
    var names = segments.slice().reverse().slice(0, Math.min(usable, 2));
    for (var i = 0; i < names.length; i++) {
        var name = names[i];
        if (!isAscii(name)) continue;
        var n = normalized(name);
        if (data.GENERIC.indexOf(n) >= 0 || data.DISTRIBUTORS.indexOf(n) >= 0) continue;
        var stripped = normalized(stripSuffix(name, data));
        var candidates = [data.ALIASES[n], n, data.ALIASES[stripped], stripped];
        for (var j = 0; j < candidates.length; j++) {
            if (candidates[j] && logos[candidates[j]]) return candidates[j];
        }
    }
    return null;
}

// Slug of the image to show, or null. A light background prefers the "-dark" variant, a dark one "-light".
function logoForImage(image, lightBackground, data) {
    var slug = slugForImage(image, data);
    if (!slug) return null;
    var themed = slug + (lightBackground ? "-dark" : "-light");
    return logoSet(data)[themed] ? themed : slug;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        logoForImage: logoForImage
    };
}

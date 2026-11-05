// Parsers for `docker ps` / `docker stats` JSON-lines output. No Qt/QML APIs — runs in QML and Node.

var SIZE_UNITS = {
    "B": 1, "kB": 1e3, "KB": 1e3, "MB": 1e6, "GB": 1e9, "TB": 1e12,
    "KiB": 1024, "MiB": 1024 * 1024, "GiB": 1024 * 1024 * 1024, "TiB": 1024 * 1024 * 1024 * 1024
};

// Values may contain commas (compose depends_on), so only split before a "key=".
function parseLabels(s) {
    var labels = {};
    if (!s) return labels;
    var parts = String(s).split(/,(?=[A-Za-z0-9_.\/-]+=)/);
    for (var i = 0; i < parts.length; i++) {
        var eq = parts[i].indexOf("=");
        if (eq <= 0) continue;
        labels[parts[i].substring(0, eq)] = parts[i].substring(eq + 1);
    }
    return labels;
}

function parseSize(s) {
    var m = /^\s*([0-9.]+)\s*([A-Za-z]+)\s*$/.exec(String(s || ""));
    if (!m || !(m[2] in SIZE_UNITS)) return 0;
    return parseFloat(m[1]) * SIZE_UNITS[m[2]];
}

function parsePair(s) {
    var parts = String(s || "").split("/");
    return [parseSize(parts[0]), parseSize(parts[1])];
}

function parsePercent(s) {
    var v = parseFloat(String(s || "").replace("%", ""));
    return isNaN(v) ? 0 : v;
}

// "2026-11-04 12:42:54 +0100 CET" -> epoch ms
function parseCreatedAt(s) {
    var m = /^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d(?:\.\d+)?) ([+-]\d\d)(\d\d)/.exec(String(s || ""));
    if (!m) return 0;
    return Date.parse(m[1] + "T" + m[2] + m[3] + ":" + m[4]);
}

function jsonLines(stdout) {
    var out = [];
    var lines = String(stdout || "").split("\n");
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line.charAt(0) !== "{") continue;
        try { out.push(JSON.parse(line)); } catch (e) { /* not JSON: skip */ }
    }
    return out;
}

function firstLabel(labels, keys, fallback) {
    for (var i = 0; i < keys.length; i++) {
        var v = labels[keys[i]];
        if (v !== undefined && String(v).trim().length > 0) return v;
    }
    return fallback;
}

function healthOf(obj) {
    if (obj.HealthStatus && obj.HealthStatus !== "none") return obj.HealthStatus;
    var m = /\((healthy|unhealthy|health: starting)\)/.exec(obj.Status || "");
    if (!m) return "";
    return m[1] === "health: starting" ? "starting" : m[1];
}

function parsePs(stdout, hostName) {
    return jsonLines(stdout).map(function (o) {
        var labels = parseLabels(o.Labels);
        var id = o.ID || "";
        return {
            key: hostName + "/" + id,
            host: hostName,
            id: id,
            shortId: id.substring(0, 12),
            name: firstLabel(labels, ["dev.dozzle.name", "coolify.serviceName"], o.Names || ""),
            compose: firstLabel(labels, ["dev.dozzle.group", "coolify.projectName", "com.docker.compose.project"], ""),
            image: o.Image || "",
            ports: o.Ports || "",
            state: o.State || "",
            status: o.Status || "",
            health: healthOf(o),
            createdMs: parseCreatedAt(o.CreatedAt),
            labels: labels
        };
    });
}

function parseStats(stdout) {
    var stats = {};
    jsonLines(stdout).forEach(function (o) {
        var mem = parsePair(o.MemUsage);
        var net = parsePair(o.NetIO);
        var blk = parsePair(o.BlockIO);
        stats[o.Container || o.ID] = {
            cpu: parsePercent(o.CPUPerc),
            memUsed: mem[0], memLimit: mem[1],
            memPerc: parsePercent(o.MemPerc),
            netRx: net[0], netTx: net[1],
            blkRead: blk[0], blkWrite: blk[1],
            pids: parseInt(o.PIDs, 10) || 0
        };
    });
    return stats;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        parseLabels: parseLabels,
        parseSize: parseSize,
        parsePair: parsePair,
        parsePercent: parsePercent,
        parseCreatedAt: parseCreatedAt,
        parsePs: parsePs,
        parseStats: parseStats
    };
}

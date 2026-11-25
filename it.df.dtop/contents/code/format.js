// Display formatting helpers. No Qt/QML APIs — runs in QML and Node.

var BYTE_UNITS = ["B", "KiB", "MiB", "GiB", "TiB"];

function formatBytes(n) {
    var i = 0;
    var v = n || 0;
    while (v >= 1024 && i < BYTE_UNITS.length - 1) { v /= 1024; i++; }
    return i === 0 ? Math.round(v) + " B" : v.toFixed(1) + " " + BYTE_UNITS[i];
}

function formatRate(n) {
    if (n === null || n === undefined) return "—";
    return formatBytes(n) + "/s";
}

function formatPercent(n) {
    return (n || 0).toFixed(1) + "%";
}

function formatUptime(row) {
    if (row.state !== "running") return "";
    return String(row.status || "").replace(/^Up\s+/, "").replace(/\s*\(.*\)$/, "");
}

// Colour band of a usage percentage, shared by the header bars and the table.
function level(percent) {
    if (percent === null || percent === undefined) return "";
    if (percent >= 80) return "high";
    if (percent >= 50) return "warn";
    return "ok";
}

var COMPACT_UNITS = ["B", "K", "M", "G", "T"];

// dtop-style sizes for the header: "512M", "25.5G", "32G".
function formatCompactBytes(n) {
    if (n === null || n === undefined) return "—";
    var i = 0;
    var v = n;
    while (v >= 1024 && i < COMPACT_UNITS.length - 1) { v /= 1024; i++; }
    return String(Math.round(v * 10) / 10) + COMPACT_UNITS[i];
}

function formatHostUptime(sec) {
    if (sec === null || sec === undefined) return "—";
    var m = Math.floor(sec / 60);
    var h = Math.floor(m / 60);
    var d = Math.floor(h / 24);
    if (d > 0) return d + "d " + (h % 24) + "h";
    if (h > 0) return h + "h " + (m % 60) + "m";
    return m + "m";
}

function formatLoad(load) {
    if (!load) return "—";
    return load.map(function (l) { return l.toFixed(2); }).join(" ");
}

// dtop's status symbol; tone picks the colour (ok / warn / high / off). First match wins.
function statusIcon(row) {
    // ✗ (not dtop's ✖): common fonts lack ✖, and the emoji fallback draws it grey, ignoring the colour.
    if (row.health === "unhealthy" || row.state === "dead") return { glyph: "✗", tone: "high" };
    if (row.state === "restarting") return { glyph: "↻", tone: "warn" };
    if (row.state === "exited") return { glyph: "■", tone: "high" };
    if (row.state === "paused") return { glyph: "‖", tone: "warn" };
    if (row.state === "created") return { glyph: "○", tone: "off" };
    if (row.health === "healthy") return { glyph: "✓", tone: "ok" };
    if (row.health === "starting") return { glyph: "▶", tone: "warn" };
    return { glyph: "▶", tone: "ok" };
}

function memPercent(row) {
    return row.memLimit ? 100 * row.memUsed / row.memLimit : null;
}

var METRIC_COLUMNS = { pids: true, cpu: true, memory: true, net_tx: true, net_rx: true, io_read: true, io_write: true };

function formatCell(row, colId) {
    if (METRIC_COLUMNS[colId] && row.state !== "running") return "";
    switch (colId) {
    case "id": return row.shortId;
    case "status": return row.status;
    case "name": return row.name;
    case "host": return row.host;
    case "compose": return row.compose;
    case "image": return row.image;
    case "ports": return row.ports;
    case "pids": return String(row.pids);
    case "cpu": return formatPercent(row.cpu);
    case "memory": return formatCompactBytes(row.memUsed) + (row.memLimit ? "/" + formatCompactBytes(row.memLimit) : "");
    case "net_tx": return formatRate(row.netTxRate);
    case "net_rx": return formatRate(row.netRxRate);
    case "io_read": return formatRate(row.readRate);
    case "io_write": return formatRate(row.writeRate);
    case "uptime": return formatUptime(row);
    case "created": return row.createdText;
    case "restarts": return String(row.restarts);
    default: return "";
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        formatCell: formatCell,
        formatBytes: formatBytes,
        formatRate: formatRate,
        formatPercent: formatPercent,
        formatUptime: formatUptime,
        level: level,
        formatCompactBytes: formatCompactBytes,
        formatHostUptime: formatHostUptime,
        formatLoad: formatLoad,
        statusIcon: statusIcon,
        memPercent: memPercent
    };
}

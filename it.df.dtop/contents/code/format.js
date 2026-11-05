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

function formatMem(used, limit) {
    return formatBytes(used) + " / " + formatBytes(limit);
}

function formatUptime(row) {
    if (row.state !== "running") return "";
    return String(row.status || "").replace(/^Up\s+/, "");
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
    case "memory": return formatMem(row.memUsed, row.memLimit);
    case "net_tx": return formatRate(row.netTxRate);
    case "net_rx": return formatRate(row.netRxRate);
    case "io_read": return formatRate(row.readRate);
    case "io_write": return formatRate(row.writeRate);
    case "uptime": return formatUptime(row);
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
        formatMem: formatMem,
        formatUptime: formatUptime
    };
}

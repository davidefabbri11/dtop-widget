// Row model: merges ps + stats into rows with rates; sorting, filtering, per-host summary.
// No Qt/QML APIs — runs in QML and Node.

function rate(prevSample, cur, field, nowMs) {
    if (!prevSample) return null;
    var elapsed = (nowMs - prevSample.t) / 1000;
    var delta = cur[field] - prevSample[field];
    if (elapsed <= 0 || delta < 0) return null;
    return delta / elapsed;
}

function mergeSnapshot(prevRows, ps, stats, nowMs, restarts) {
    var prevByKey = {};
    for (var i = 0; i < prevRows.length; i++) prevByKey[prevRows[i].key] = prevRows[i];
    return ps.map(function (p) {
        var row = Object.assign({}, p);
        var s = p.state === "running" ? stats[p.id] : null;
        var prev = prevByKey[p.key];
        var prevSample = prev && prev.sample ? prev.sample : null;
        row.cpu = s ? s.cpu : 0;
        row.memUsed = s ? s.memUsed : 0;
        row.memLimit = s ? s.memLimit : 0;
        row.memPerc = s ? s.memPerc : 0;
        row.pids = s ? s.pids : 0;
        row.netRxRate = s ? rate(prevSample, s, "netRx", nowMs) : null;
        row.netTxRate = s ? rate(prevSample, s, "netTx", nowMs) : null;
        row.readRate = s ? rate(prevSample, s, "blkRead", nowMs) : null;
        row.writeRate = s ? rate(prevSample, s, "blkWrite", nowMs) : null;
        row.sample = s ? { t: nowMs, netRx: s.netRx, netTx: s.netTx, blkRead: s.blkRead, blkWrite: s.blkWrite } : null;
        row.restarts = (restarts && restarts[p.id]) || 0;
        return row;
    });
}

// Lower = needs more attention.
function statusRank(row) {
    if (row.health === "unhealthy") return 0;
    if (row.state === "restarting") return 1;
    if (row.state === "exited") {
        var m = /Exited \((\d+)\)/.exec(row.status || "");
        return m && m[1] !== "0" ? 2 : 7;
    }
    if (row.state === "dead") return 3;
    if (row.health === "starting") return 4;
    if (row.state === "paused") return 5;
    if (row.state === "created") return 6;
    return 8;
}

function nullable(v) { return v === null || v === undefined ? -1 : v; }

var SORT_VALUE = {
    id: function (r) { return r.shortId; },
    status: statusRank,
    name: function (r) { return r.name.toLowerCase(); },
    host: function (r) { return r.host.toLowerCase(); },
    compose: function (r) { return r.compose.toLowerCase(); },
    image: function (r) { return r.image.toLowerCase(); },
    ports: function (r) { return r.ports; },
    pids: function (r) { return r.pids; },
    cpu: function (r) { return r.cpu; },
    memory: function (r) { return r.memUsed; },
    net_tx: function (r) { return nullable(r.netTxRate); },
    net_rx: function (r) { return nullable(r.netRxRate); },
    io_read: function (r) { return nullable(r.readRate); },
    io_write: function (r) { return nullable(r.writeRate); },
    uptime: function (r) { return -r.createdMs; },   // ascending age = newest first
    restarts: function (r) { return r.restarts; }
};

function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

function sortRows(rows, key, desc) {
    var value = SORT_VALUE[key] || SORT_VALUE.name;
    var dir = desc ? -1 : 1;
    return rows.slice().sort(function (a, b) {
        var c = cmp(value(a), value(b)) * dir;
        return c !== 0 ? c : cmp(a.name.toLowerCase(), b.name.toLowerCase());
    });
}

function filterRows(rows, opts) {
    var q = (opts.search || "").trim().toLowerCase();
    return rows.filter(function (r) {
        if (!opts.showAll && r.state !== "running") return false;
        if (!q) return true;
        return r.name.toLowerCase().indexOf(q) >= 0
            || r.compose.toLowerCase().indexOf(q) >= 0
            || r.image.toLowerCase().indexOf(q) >= 0
            || r.host.toLowerCase().indexOf(q) >= 0
            || r.id.toLowerCase().indexOf(q) === 0;
    });
}

function hostSummary(rows, hostName) {
    var s = { running: 0, total: 0, cpu: 0, memUsed: 0, netRxRate: 0, netTxRate: 0, unhealthy: 0 };
    rows.forEach(function (r) {
        if (r.host !== hostName) return;
        s.total++;
        if (r.state === "running") s.running++;
        if (r.health === "unhealthy") s.unhealthy++;
        s.cpu += r.cpu;
        s.memUsed += r.memUsed;
        s.netRxRate += r.netRxRate || 0;
        s.netTxRate += r.netTxRate || 0;
    });
    return s;
}

// Rows an action applies to: the visible part of the selection if `row` is selected, else just `row`.
// Hidden (filtered-out) selected rows are never acted on.
function actionTargets(row, selection, visibleRows) {
    if (!selection[row.key]) return [row];
    return visibleRows.filter(function (r) { return selection[r.key]; });
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        actionTargets: actionTargets,
        mergeSnapshot: mergeSnapshot,
        statusRank: statusRank,
        sortRows: sortRows,
        filterRows: filterRows,
        hostSummary: hostSummary
    };
}

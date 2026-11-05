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

// ----- grouping by compose project -----

function groupKey(host, project) {
    return host + "/" + project;
}

// Flat list for the table: a { type: "group" } header per (host, compose project), each followed
// by its visible member rows ({ type: "row" }) unless collapsed. Header totals cover ALL of the
// project's containers (project actions act on all of them), not just the visible ones.
// A project header stays even when all its rows are hidden (e.g. Show all off), so it can be started;
// with a search, only groups with visible rows or a matching project name remain.
function groupRows(visibleRows, allRows, opts) {
    var q = (opts.search || "").trim().toLowerCase();
    var groups = {};
    allRows.forEach(function (r) {
        var key = groupKey(r.host, r.composeProject);
        var g = groups[key] || (groups[key] = {
            type: "group", key: key, host: r.host, project: r.composeProject, rows: [], members: [],
            running: 0, paused: 0, total: 0, cpu: 0, memUsed: 0, collapsed: !!opts.collapsed[key]
        });
        g.rows.push(r);
        g.total++;
        if (r.state === "running") g.running++;
        if (r.state === "paused") g.paused++;
        g.cpu += r.cpu || 0;
        g.memUsed += r.memUsed || 0;
    });
    visibleRows.forEach(function (r) {
        var g = groups[groupKey(r.host, r.composeProject)];
        if (g) g.members.push(r);
    });
    var ordered = Object.keys(groups).map(function (k) { return groups[k]; }).filter(function (g) {
        if (g.members.length > 0) return true;
        if (g.project === "") return false;
        return !q || g.project.toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) {
        return cmp(a.host, b.host) || cmp(a.project === "" ? 1 : 0, b.project === "" ? 1 : 0) || cmp(a.project, b.project);
    });
    var items = [];
    ordered.forEach(function (g) {
        var members = g.members;
        delete g.members;
        items.push(g);
        if (!g.collapsed) members.forEach(function (r) { items.push({ type: "row", row: r }); });
    });
    return items;
}

function displayedRows(items) {
    return items.filter(function (i) { return i.type === "row"; }).map(function (i) { return i.row; });
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        groupKey: groupKey,
        groupRows: groupRows,
        displayedRows: displayedRows,
        actionTargets: actionTargets,
        mergeSnapshot: mergeSnapshot,
        statusRank: statusRank,
        sortRows: sortRows,
        filterRows: filterRows,
        hostSummary: hostSummary
    };
}

import QtQuick
import org.kde.plasma.plasmoid
import org.kde.plasma.plasma5support as P5Support
import "../code/hosts.js" as Hosts
import "../code/parse.js" as Parse
import "../code/model.js" as Model
import "../code/commands.js" as Cmd

PlasmoidItem {
    id: root

    // ----- configuration -----
    readonly property var cfg: Plasmoid.configuration
    readonly property var hosts: Hosts.parseHosts(cfg.hosts)
    readonly property int refreshSeconds: Math.max(1, cfg.refreshSeconds)

    // Column catalogue; `columns` config holds the visible ids. Widths in grid units.
    readonly property var allColumns: [
        { id: "id", title: "ID", width: 6 },
        { id: "status", title: "Status", width: 2 },
        { id: "name", title: "Name", width: 12 },
        { id: "host", title: "Host", width: 5 },
        { id: "compose", title: "Compose", width: 7 },
        { id: "image", title: "Image", width: 10 },
        { id: "ports", title: "Ports", width: 9 },
        { id: "pids", title: "PIDs", width: 3 },
        { id: "cpu", title: "CPU", width: 4 },
        { id: "memory", title: "Memory", width: 9 },
        { id: "net_tx", title: "Net TX", width: 5 },
        { id: "net_rx", title: "Net RX", width: 5 },
        { id: "io_read", title: "Disk R", width: 5 },
        { id: "io_write", title: "Disk W", width: 5 },
        { id: "uptime", title: "Uptime", width: 7 },
        { id: "restarts", title: "Restarts", width: 4 }
    ]
    readonly property var visibleColumns: allColumns.filter(function (c) { return cfg.columns.indexOf(c.id) >= 0; })

    // ----- runtime state -----
    property var hostState: ({})        // { name: { status: "loading"|"ok"|"error", error, lastMs } }
    property var rows: []               // all hosts, unfiltered
    property string searchText: ""
    property var selection: ({})        // { rowKey: true }
    property string actionError: ""
    property int configEpoch: 0         // bumped when hosts change; stale callbacks bail
    property var inFlight: ({})         // { hostName: true }
    property var restartCounts: ({})    // { hostName: { id: count } }

    readonly property var visibleRows: Model.sortRows(
        Model.filterRows(rows, { showAll: cfg.showAll, search: searchText }), cfg.sortKey, cfg.sortDesc)
    property var collapsedGroups: ({})  // { groupKey: true }, in memory only
    property var busyGroups: ({})       // { groupKey: true } while a compose command runs
    // What the table shows: group headers + rows when grouping, else just rows.
    readonly property var tableItems: cfg.groupByCompose
        ? Model.groupRows(visibleRows, rows, { collapsed: collapsedGroups, search: searchText })
        : visibleRows.map(function (r) { return { type: "row", row: r }; })
    // Rows actually on screen (collapsed groups excluded): the only rows actions may target.
    readonly property var displayedRows: Model.displayedRows(tableItems)
    readonly property var summaries: hosts.map(function (h) { return Model.hostSummary(rows, h.name); })
    readonly property int runningCount: summaries.reduce(function (a, s) { return a + s.running; }, 0)
    readonly property int totalCount: summaries.reduce(function (a, s) { return a + s.total; }, 0)
    readonly property int unhealthyCount: summaries.reduce(function (a, s) { return a + s.unhealthy; }, 0)
    readonly property int errorCount: hosts.filter(function (h) {
        return hostState[h.name] && hostState[h.name].status === "error";
    }).length

    // ----- shell commands via the executable data source -----
    P5Support.DataSource {
        id: exec
        engine: "executable"
        property var callbacks: ({})
        property int seq: 0
        onNewData: function (sourceName, data) {
            disconnectSource(sourceName);
            var cb = callbacks[sourceName];
            if (cb) { delete callbacks[sourceName]; cb(data["stdout"] || "", data["stderr"] || "", data["exit code"]); }
        }
        // The trailing shell comment makes every source name unique, so identical
        // commands issued concurrently never share (or overwrite) a callback.
        function run(cmd, cb) {
            var source = cmd + " #" + (++seq);
            callbacks[source] = cb;
            connectSource(source);
        }
    }

    function run(cmd, cb) { exec.run(cmd, cb || function () {}); }

    function hostOf(row) {
        for (var i = 0; i < hosts.length; i++) if (hosts[i].name === row.host) return hosts[i];
        return null;
    }

    function setHostState(name, state) {
        var s = Object.assign({}, hostState);
        s[name] = state;
        hostState = s;
    }

    // ----- polling -----
    function pollHost(h) {
        if (inFlight[h.name]) return;
        inFlight[h.name] = true;
        var epoch = configEpoch;
        var withStats = root.expanded;
        var timeoutSec = refreshSeconds * 5;
        run(Cmd.pollCommand(h, timeoutSec, withStats), function (out, err, code) {
            if (epoch !== configEpoch) return;
            inFlight[h.name] = false;
            var parts = Cmd.splitPoll(out);
            var ps = Parse.parsePs(parts.ps, h.name);
            if (ps.length === 0 && (code !== 0 || err.trim().length > 0)) {
                setHostState(h.name, { status: "error", error: Cmd.pollError(err, code, timeoutSec), lastMs: Date.now() });
                return;
            }
            var prev = rows.filter(function (r) { return r.host === h.name; });
            var merged = Model.mergeSnapshot(prev, ps, Parse.parseStats(parts.stats), Date.now(), restartCounts[h.name] || {});
            rows = rows.filter(function (r) { return r.host !== h.name; }).concat(merged);
            setHostState(h.name, { status: "ok", error: "", lastMs: Date.now() });
            if (withStats && cfg.columns.indexOf("restarts") >= 0 && ps.length > 0) fetchRestartCounts(h, ps, epoch);
        });
    }

    function fetchRestartCounts(h, ps, epoch) {
        run(Cmd.restartCountsCommand(h, ps.map(function (p) { return p.id; })), function (out) {
            if (epoch !== configEpoch) return;
            var all = Object.assign({}, restartCounts);
            all[h.name] = Cmd.parseRestartCounts(out);
            restartCounts = all;
        });
    }

    function pollAll() { hosts.forEach(pollHost); }

    function resetForHosts() {
        configEpoch++;
        inFlight = ({});
        var names = hosts.map(function (h) { return h.name; });
        rows = rows.filter(function (r) { return names.indexOf(r.host) >= 0; });
        var s = {};
        names.forEach(function (n) { s[n] = hostState[n] || { status: "loading", error: "", lastMs: 0 }; });
        hostState = s;
        pollAll();
    }

    // ----- actions -----
    function act(action, targetRows) {
        var byHost = {};
        targetRows.forEach(function (r) { (byHost[r.host] = byHost[r.host] || []).push(r.id); });
        actionError = "";
        Object.keys(byHost).forEach(function (name) {
            var h = hostOf({ host: name });
            if (!h) return;
            run(Cmd.actionCommand(h, action, byHost[name]), function (out, err, code) {
                if (code !== 0) actionError = (actionError ? actionError + "\n" : "") + (err.trim() || out.trim());
                pollHost(h);
            });
        });
    }

    function setBusy(key, busy) {
        var b = Object.assign({}, busyGroups);
        if (busy) b[key] = true; else delete b[key];
        busyGroups = b;
    }

    // `docker compose` on a whole project. No timeout: pull/build can legitimately take minutes.
    function composeAct(group, action) {
        var h = hostOf({ host: group.host });
        if (!h || busyGroups[group.key]) return;
        var cmd;
        try {
            cmd = Cmd.composeCommand(h, action, group.project, Cmd.pickFileSet(group.rows));
        } catch (e) {
            actionError = group.project + ": " + e.message;
            return;
        }
        actionError = "";
        setBusy(group.key, true);
        run(cmd, function (out, err, code) {
            setBusy(group.key, false);
            if (code !== 0) actionError = (actionError ? actionError + "\n" : "") + group.project + ": " + Cmd.composeError(out, err, code);
            pollHost(h);
        });
    }

    function openShell(row) {
        run(Cmd.shellCommand(hostOf(row), row.id, cfg.terminalCommand));
    }

    function openDozzle(row) {
        var url = Cmd.dozzleUrl(hostOf(row), row);
        if (url) Qt.openUrlExternally(url);
    }

    Timer {
        interval: root.refreshSeconds * 1000
        repeat: true
        running: true
        triggeredOnStart: true
        onTriggered: root.pollAll()
    }

    onHostsChanged: resetForHosts()
    onExpandedChanged: if (root.expanded) pollAll()

    toolTipMainText: "dtop"
    toolTipSubText: errorCount > 0
        ? runningCount + "/" + totalCount + " running · " + errorCount + " host(s) unreachable"
        : runningCount + "/" + totalCount + " running" + (unhealthyCount > 0 ? " · " + unhealthyCount + " unhealthy" : "")

    compactRepresentation: CompactView {}
    fullRepresentation: FullView {}
}

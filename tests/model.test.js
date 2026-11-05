const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../it.df.dtop/contents/code/model.js");

function ps(o) {
    const id = o.id || "id-" + o.name;
    return Object.assign({
        key: "local/" + id, host: "local", id, shortId: id.substring(0, 12), name: "c", compose: "",
        image: "img", ports: "", state: "running", status: "Up 1 minute", health: "", createdMs: 0, labels: {},
    }, o, { id, key: "local/" + id });
}

function st(o) {
    return Object.assign({ cpu: 0, memUsed: 0, memLimit: 0, memPerc: 0, netRx: 0, netTx: 0, blkRead: 0, blkWrite: 0, pids: 0 }, o);
}

test("mergeSnapshot computes byte rates from the previous sample of the same key", () => {
    const p = ps({ id: "a", name: "web" });
    const first = M.mergeSnapshot([], [p], { a: st({ netRx: 1000, netTx: 10, blkRead: 0, blkWrite: 0 }) }, 10000, {});

    const second = M.mergeSnapshot(first, [p], { a: st({ netRx: 5000, netTx: 10, blkRead: 4000, blkWrite: 0, cpu: 3.5 }) }, 12000, { a: 2 });

    assert.equal(first[0].netRxRate, null);
    assert.equal(second[0].netRxRate, 2000);
    assert.equal(second[0].netTxRate, 0);
    assert.equal(second[0].readRate, 2000);
    assert.equal(second[0].cpu, 3.5);
    assert.equal(second[0].restarts, 2);
});

test("mergeSnapshot yields null rates on counter reset", () => {
    const p = ps({ id: "a" });
    const first = M.mergeSnapshot([], [p], { a: st({ netRx: 5000 }) }, 10000, {});

    const second = M.mergeSnapshot(first, [p], { a: st({ netRx: 100 }) }, 12000, {});

    assert.equal(second[0].netRxRate, null);
});

test("mergeSnapshot yields null rates when a same-named container gets a new id", () => {
    const first = M.mergeSnapshot([], [ps({ id: "old", name: "web" })], { old: st({ netRx: 1000 }) }, 10000, {});

    const second = M.mergeSnapshot(first, [ps({ id: "new", name: "web" })], { new: st({ netRx: 5000 }) }, 12000, {});

    assert.equal(second[0].netRxRate, null);
});

test("mergeSnapshot zeroes metrics for non-running containers", () => {
    const rows = M.mergeSnapshot([], [ps({ id: "a", state: "exited", status: "Exited (0) 1 hour ago" })], {}, 1000, {});

    assert.equal(rows[0].cpu, 0);
    assert.equal(rows[0].memUsed, 0);
    assert.equal(rows[0].netRxRate, null);
    assert.equal(rows[0].restarts, 0);
});

test("sortRows by status puts containers needing attention first", () => {
    const rows = [
        ps({ id: "1", name: "run", state: "running" }),
        ps({ id: "2", name: "ok-exit", state: "exited", status: "Exited (0) 1 hour ago" }),
        ps({ id: "3", name: "sick", state: "running", health: "unhealthy" }),
        ps({ id: "4", name: "crash", state: "exited", status: "Exited (1) 2 minutes ago" }),
        ps({ id: "5", name: "loop", state: "restarting", status: "Restarting (1) 3 seconds ago" }),
    ];

    const names = M.sortRows(rows, "status", false).map(r => r.name);

    assert.deepEqual(names, ["sick", "loop", "crash", "ok-exit", "run"]);
});

test("sortRows by cpu descending puts the highest first and returns a new array", () => {
    const rows = [Object.assign(ps({ id: "1", name: "a" }), { cpu: 1 }), Object.assign(ps({ id: "2", name: "b" }), { cpu: 9 })];

    const sorted = M.sortRows(rows, "cpu", true);

    assert.deepEqual(sorted.map(r => r.name), ["b", "a"]);
    assert.notEqual(sorted, rows);
});

test("sortRows by uptime ascending puts the newest container first", () => {
    const rows = [ps({ id: "1", name: "old", createdMs: 1000 }), ps({ id: "2", name: "new", createdMs: 5000 })];

    const names = M.sortRows(rows, "uptime", false).map(r => r.name);

    assert.deepEqual(names, ["new", "old"]);
});

test("sortRows breaks ties by name", () => {
    const rows = [ps({ id: "1", name: "zeta" }), ps({ id: "2", name: "alpha" })];

    const names = M.sortRows(rows, "host", false).map(r => r.name);

    assert.deepEqual(names, ["alpha", "zeta"]);
});

test("filterRows hides non-running containers unless showAll", () => {
    const rows = [ps({ id: "1", name: "up" }), ps({ id: "2", name: "down", state: "exited" })];

    const running = M.filterRows(rows, { showAll: false, search: "" }).map(r => r.name);
    const all = M.filterRows(rows, { showAll: true, search: "" }).map(r => r.name);

    assert.deepEqual(running, ["up"]);
    assert.deepEqual(all, ["up", "down"]);
});

test("filterRows search is case-insensitive over compose and matches id prefix", () => {
    const rows = [ps({ id: "04e4310777", name: "termite", compose: "stada-platflow" }), ps({ id: "ffff", name: "other" })];

    const byCompose = M.filterRows(rows, { showAll: true, search: "STADA" }).map(r => r.name);
    const byId = M.filterRows(rows, { showAll: true, search: "04e43" }).map(r => r.name);
    const midId = M.filterRows(rows, { showAll: true, search: "4310" }).map(r => r.name);

    assert.deepEqual(byCompose, ["termite"]);
    assert.deepEqual(byId, ["termite"]);
    assert.deepEqual(midId, []);
});

test("hostSummary aggregates one host and treats null rates as zero", () => {
    const rows = [
        Object.assign(ps({ id: "1" }), { cpu: 2, memUsed: 100, netRxRate: 10, netTxRate: null }),
        Object.assign(ps({ id: "2", health: "unhealthy" }), { cpu: 3, memUsed: 50, netRxRate: null, netTxRate: 5 }),
        Object.assign(ps({ id: "3", state: "exited" }), { cpu: 0, memUsed: 0, netRxRate: null, netTxRate: null }),
        Object.assign(ps({ id: "4" }), { host: "other", cpu: 50, memUsed: 1, netRxRate: 1, netTxRate: 1 }),
    ];

    const s = M.hostSummary(rows, "local");

    assert.deepEqual(s, { running: 2, total: 3, cpu: 5, memUsed: 150, netRxRate: 10, netTxRate: 5, unhealthy: 1 });
});

test("actionTargets uses the visible selection when the clicked row is selected", () => {
    const a = ps({ id: "a" }), b = ps({ id: "b" }), c = ps({ id: "c" });
    const selection = { "local/a": true, "local/b": true };

    const both = M.actionTargets(a, selection, [a, b, c]).map(r => r.id);
    const hiddenB = M.actionTargets(a, selection, [a, c]).map(r => r.id);
    const unselected = M.actionTargets(c, selection, [a, b, c]).map(r => r.id);

    assert.deepEqual(both, ["a", "b"]);
    assert.deepEqual(hiddenB, ["a"]);
    assert.deepEqual(unselected, ["c"]);
});

function cps(name, project, o) {
    return ps(Object.assign({ id: name, name, composeProject: project }, o));
}

function groupKeys(items) {
    return items.filter((i) => i.type === "group").map((i) => i.key);
}

test("groupRows orders groups by host then project with No compose project last", () => {
    const rows = [
        cps("s", "stada", { host: "b" }), cps("z", "zeta", { host: "a" }),
        cps("n", "", { host: "a" }), cps("al", "alpha", { host: "a" }),
    ];

    const items = M.groupRows(rows, rows, { collapsed: {}, search: "" });

    assert.deepEqual(groupKeys(items), ["a/alpha", "a/zeta", "a/", "b/stada"]);
});

test("groupRows lists member rows after their header in visible order", () => {
    const rows = [cps("web", "stada"), cps("db", "stada"), cps("x", "other")];

    const items = M.groupRows(rows, rows, { collapsed: {}, search: "" });

    assert.deepEqual(items.map((i) => i.type === "group" ? "#" + i.project : i.row.name), ["#other", "x", "#stada", "web", "db"]);
});

test("groupRows totals count all project containers, not only visible ones", () => {
    const all = [cps("a", "stada", { cpu: 2, memUsed: 10 }), cps("b", "stada", { state: "exited" }), cps("c", "stada", { state: "exited" })];

    const items = M.groupRows([all[0]], all, { collapsed: {}, search: "" });

    assert.equal(items.length, 2);
    assert.equal(items[0].running, 1);
    assert.equal(items[0].total, 3);
    assert.equal(items[0].rows.length, 3);
    assert.equal(items[0].cpu, 2);
    assert.equal(items[0].memUsed, 10);
    assert.equal(items[1].row.name, "a");
});

test("groupRows keeps a fully hidden project header when search is empty", () => {
    const all = [cps("a", "stada", { state: "exited" })];

    const items = M.groupRows([], all, { collapsed: {}, search: "" });

    assert.deepEqual(items.map((i) => i.type), ["group"]);
});

test("groupRows drops the No compose project header when it has no visible rows", () => {
    const all = [cps("a", "", { state: "exited" })];

    const items = M.groupRows([], all, { collapsed: {}, search: "" });

    assert.deepEqual(items, []);
});

test("groupRows hides collapsed members and marks the group collapsed", () => {
    const rows = [cps("web", "stada"), cps("x", "other")];

    const items = M.groupRows(rows, rows, { collapsed: { "local/stada": true }, search: "" });

    assert.deepEqual(items.map((i) => i.type === "group" ? i.key + ":" + i.collapsed : i.row.name),
        ["local/other:false", "x", "local/stada:true"]);
});

test("groupRows with a search shows only matching groups", () => {
    const all = [cps("db", "stada"), cps("web", "sporting")];
    const visible = [all[1]];

    const byProject = M.groupRows(visible, all, { collapsed: {}, search: "stad" });
    const byRow = M.groupRows(visible, all, { collapsed: {}, search: "web" });

    assert.deepEqual(groupKeys(byProject), ["local/sporting", "local/stada"]);
    assert.deepEqual(groupKeys(byRow), ["local/sporting"]);
});

test("displayedRows excludes rows of collapsed groups", () => {
    const rows = [cps("web", "stada"), cps("x", "other")];
    const items = M.groupRows(rows, rows, { collapsed: { "local/stada": true }, search: "" });

    const shown = M.displayedRows(items);

    assert.deepEqual(shown.map((r) => r.name), ["x"]);
});

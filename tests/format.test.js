const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("../it.df.dtop/contents/code/format.js");

test("formatBytes uses binary units with one decimal", () => {
    const values = [0, 512, 1536, 365.4 * 1024 * 1024, 31 * 1024 ** 3].map(F.formatBytes);

    assert.deepEqual(values, ["0 B", "512 B", "1.5 KiB", "365.4 MiB", "31.0 GiB"]);
});

test("formatRate appends /s and shows a dash for unknown rates", () => {
    assert.equal(F.formatRate(1229), "1.2 KiB/s");
    assert.equal(F.formatRate(null), "—");
});

test("formatPercent keeps one decimal", () => {
    assert.equal(F.formatPercent(0.18), "0.2%");
    assert.equal(F.formatPercent(113.456), "113.5%");
});

test("formatMem shows usage over limit", () => {
    assert.equal(F.formatMem(365.4 * 1024 * 1024, 30.99 * 1024 ** 3), "365.4 MiB / 31.0 GiB");
});

test("formatUptime strips the Up prefix for running containers only", () => {
    assert.equal(F.formatUptime({ state: "running", status: "Up 2 hours (healthy)" }), "2 hours (healthy)");
    assert.equal(F.formatUptime({ state: "exited", status: "Exited (0) 3 minutes ago" }), "");
});

test("formatCell renders each column id from a row", () => {
    const row = {
        shortId: "04e431077791", status: "Up 2 hours", state: "running", name: "web", host: "local", compose: "proj",
        image: "nginx:1", ports: "0.0.0.0:80->80/tcp", pids: 7, cpu: 1.23, memUsed: 1536, memLimit: 2048,
        netTxRate: 1024, netRxRate: null, readRate: 0, writeRate: 2048, restarts: 3,
    };
    const ids = ["id", "status", "name", "host", "compose", "image", "ports", "pids", "cpu", "memory",
        "net_tx", "net_rx", "io_read", "io_write", "uptime", "restarts", "bogus"];

    const cells = ids.map(id => F.formatCell(row, id));

    assert.deepEqual(cells, ["04e431077791", "Up 2 hours", "web", "local", "proj", "nginx:1", "0.0.0.0:80->80/tcp", "7",
        "1.2%", "1.5 KiB / 2.0 KiB", "1.0 KiB/s", "—", "0 B/s", "2.0 KiB/s", "2 hours", "3", ""]);
});

test("formatCell blanks metrics for stopped containers", () => {
    const row = { state: "exited", status: "Exited (0) 1 hour ago", pids: 0, cpu: 0, memUsed: 0, memLimit: 0, netTxRate: null, restarts: 0 };

    const cells = ["pids", "cpu", "memory", "net_tx"].map(id => F.formatCell(row, id));

    assert.deepEqual(cells, ["", "", "", ""]);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const S = require("../it.df.dtop/contents/code/sysstats.js");

const PROC = fs.readFileSync(path.join(__dirname, "fixtures/proc.txt"), "utf8");

function proc(o) {
    return Object.assign({
        cpuTotal: 1000, cpuIdle: 800, cores: 2, memTotal: 100, memAvailable: 40, swapTotal: 10, swapFree: 4,
        load: [1, 2, 3], uptimeSec: 60, netRx: 1000, netTx: 500,
    }, o);
}

test("parseProc reads cpu, memory, swap, load, uptime and host network from cat output", () => {
    const p = S.parseProc(PROC);

    assert.deepEqual(p, {
        cpuTotal: 1000 + 50 + 400 + 8000 + 200 + 30 + 20 + 0,
        cpuIdle: 8000 + 200,
        cores: 2,
        memTotal: 32768000 * 1024,
        memAvailable: 8192000 * 1024,
        swapTotal: 4194304 * 1024,
        swapFree: 2936012 * 1024,
        load: [2.84, 2.61, 2.40],
        uptimeSec: 725400.12,
        netRx: 1000000 + 500000,
        netTx: 400000 + 100000,
    });
});

test("parseProc falls back to MemFree + Buffers + Cached without MemAvailable", () => {
    const text = PROC.replace(/^MemAvailable:.*\n/m, "");

    const p = S.parseProc(text);

    assert.equal(p.memAvailable, (2048000 + 512000 + 4096000) * 1024);
});

test("parseProc returns null fields for empty output", () => {
    const p = S.parseProc("");

    assert.deepEqual(p, {
        cpuTotal: null, cpuIdle: null, cores: null, memTotal: null, memAvailable: null, swapTotal: null,
        swapFree: null, load: null, uptimeSec: null, netRx: null, netTx: null,
    });
});

test("systemSample has no cpu or rates on the first sample but already has memory and load", () => {
    const s = S.systemSample(null, proc({}), 0);

    assert.equal(s.cpu, null);
    assert.equal(s.netRxRate, null);
    assert.equal(s.netTxRate, null);
    assert.equal(s.memUsed, 60);
    assert.equal(s.memTotal, 100);
    assert.equal(s.swapUsed, 6);
    assert.deepEqual(s.load, [1, 2, 3]);
    assert.equal(s.cores, 2);
});

test("systemSample computes cpu percent and byte rates from the previous sample", () => {
    const first = S.systemSample(null, proc({}), 10000);

    const second = S.systemSample(first, proc({ cpuTotal: 1400, cpuIdle: 1100, netRx: 3000, netTx: 900 }), 12000);

    assert.equal(second.cpu, 25);
    assert.equal(second.netRxRate, 1000);
    assert.equal(second.netTxRate, 200);
});

test("systemSample gives null rates when a counter went down (host rebooted)", () => {
    const first = S.systemSample(null, proc({}), 10000);

    const second = S.systemSample(first, proc({ cpuTotal: 100, cpuIdle: 50, netRx: 10, netTx: 900 }), 12000);

    assert.equal(second.cpu, null);
    assert.equal(second.netRxRate, null);
    assert.equal(second.netTxRate, 200);
});

test("systemSample gives null rates when no time passed", () => {
    const first = S.systemSample(null, proc({}), 10000);

    const second = S.systemSample(first, proc({ cpuTotal: 1400, netRx: 3000 }), 10000);

    assert.equal(second.cpu, null);
    assert.equal(second.netRxRate, null);
});

test("systemSample gives null rates after a reboot even when counters already passed the old values", () => {
    const first = S.systemSample(null, proc({ cpuTotal: 1000, cpuIdle: 100, uptimeSec: 600 }), 10000);

    const second = S.systemSample(first, proc({ cpuTotal: 1100, cpuIdle: 1050, netRx: 5000, uptimeSec: 300 }), 12000);

    assert.equal(second.cpu, null);
    assert.equal(second.netRxRate, null);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const P = require("../it.df.dtop/contents/code/parse.js");

const PS = fs.readFileSync(path.join(__dirname, "fixtures/ps.jsonl"), "utf8");
const STATS = fs.readFileSync(path.join(__dirname, "fixtures/stats.jsonl"), "utf8");

function psLine(overrides) {
    return JSON.stringify(Object.assign({
        ID: "abcdef0123456789abcdef", Names: "plain", Image: "alpine", Labels: "", Ports: "",
        State: "running", Status: "Up 5 minutes", HealthStatus: "none",
        CreatedAt: "2026-11-04 12:42:54 +0100 CET",
    }, overrides));
}

test("parseLabels keeps commas that belong to a label value", () => {
    const labels = P.parseLabels("a=1,com.docker.compose.depends_on=yoda:service_started:false,whale:service_started:false,b=x=y");

    assert.deepEqual(labels, {
        "a": "1",
        "com.docker.compose.depends_on": "yoda:service_started:false,whale:service_started:false",
        "b": "x=y",
    });
});

test("parseSize handles decimal, binary and empty units", () => {
    const values = ["365.4MiB", "8.7MB", "30.99GiB", "12kB", "0B", "--", ""].map(P.parseSize);

    assert.deepEqual(values, [365.4 * 1024 * 1024, 8.7e6, 30.99 * 1024 ** 3, 12000, 0, 0, 0]);
});

test("parsePair and parsePercent parse docker stats strings", () => {
    const pair = P.parsePair("35MB / 8.7MB");
    const pct = P.parsePercent("0.18%");

    assert.deepEqual(pair, [35e6, 8.7e6]);
    assert.equal(pct, 0.18);
});

test("parseCreatedAt converts docker's CreatedAt to epoch ms", () => {
    const ms = P.parseCreatedAt("2026-11-04 12:42:54 +0100 CET");

    assert.equal(ms, Date.parse("2026-11-04T12:42:54+01:00"));
});

test("parsePs resolves compose project and name from real docker output", () => {
    const rows = P.parsePs(PS, "local");

    const termite = rows.find(r => r.name === "termite-backend-stada-platflow");
    assert.equal(rows.length, 2);
    assert.equal(termite.compose, "stada-platflow");
    assert.equal(termite.host, "local");
    assert.equal(termite.key, "local/" + termite.id);
    assert.equal(termite.shortId, termite.id.substring(0, 12));
    assert.equal(termite.state, "exited");
    assert.equal(termite.labels["com.docker.compose.depends_on"], "yoda-backend:service_started:false,whale:service_started:false");
});

test("parsePs prefers dozzle/coolify labels and skips whitespace-only ones", () => {
    const line = psLine({ Labels: "dev.dozzle.name= ,coolify.serviceName=svc,dev.dozzle.group=grp,com.docker.compose.project=proj" });

    const [row] = P.parsePs(line, "h");

    assert.equal(row.name, "svc");
    assert.equal(row.compose, "grp");
});

test("parsePs takes health from HealthStatus, falling back to Status text", () => {
    const text = [
        psLine({ ID: "a1", HealthStatus: "unhealthy" }),
        psLine({ ID: "a2", Status: "Up 2 minutes (health: starting)" }),
        psLine({ ID: "a3", Status: "Up 2 minutes (healthy)" }),
        psLine({ ID: "a4" }),
    ].join("\n");

    const health = P.parsePs(text, "h").map(r => r.health);

    assert.deepEqual(health, ["unhealthy", "starting", "healthy", ""]);
});

test("parsePs and parseStats ignore blank and non-JSON lines", () => {
    const junk = "\nWARNING: something\n" + psLine({}) + "\n\n";

    const rows = P.parsePs(junk, "h");
    const stats = P.parseStats("garbage\n\n");

    assert.equal(rows.length, 1);
    assert.deepEqual(stats, {});
});

test("parseStats keys by full container id with numeric metrics", () => {
    const line = JSON.stringify({ BlockIO: "432MB / 1.07GB", CPUPerc: "0.18%", Container: "04e431", ID: "04e4", MemPerc: "1.15%", MemUsage: "365.4MiB / 30.99GiB", NetIO: "35MB / 8.7MB", PIDs: "94" });

    const stats = P.parseStats(line + "\n" + STATS);

    assert.deepEqual(stats["04e431"], {
        cpu: 0.18, memUsed: 365.4 * 1024 * 1024, memLimit: 30.99 * 1024 ** 3, memPerc: 1.15,
        netRx: 35e6, netTx: 8.7e6, blkRead: 432e6, blkWrite: 1.07 * 1e9, pids: 94,
    });
    assert.equal(Object.keys(stats).length, 3);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../it.df.dtop/contents/code/commands.js");

function host(endpoint, extra) {
    return Object.assign({ endpoint, name: "x", dozzle: "", certs: "", filters: [] }, extra);
}

const SSH = host("ssh://me@prod", { filters: ["status=running", "name=a b'c"] });

test("shQuote wraps in single quotes and escapes embedded quotes", () => {
    const quoted = C.shQuote("a'b $x");

    assert.equal(quoted, "'a'\\''b $x'");
});

test("dockerBase builds the docker prefix for each endpoint scheme", () => {
    const endpoints = [
        host("local"), host("unix:///var/run/docker.sock"), host("ssh://me@prod"), host("tcp://host:2375"),
        host("tls://host:2376"), host("tls://host:2376", { certs: "/etc/certs" }),
    ];

    const results = endpoints.map(C.dockerBase);

    assert.deepEqual(results, [
        "docker",
        "docker -H 'unix:///var/run/docker.sock'",
        "env SSH_ASKPASS_REQUIRE=never docker -H 'ssh://me@prod'",
        "docker -H 'tcp://host:2375'",
        "docker --tlsverify --tlscacert \"$HOME/.docker\"'/ca.pem' --tlscert \"$HOME/.docker\"'/cert.pem' --tlskey \"$HOME/.docker\"'/key.pem' -H 'tcp://host:2376'",
        "docker --tlsverify --tlscacert '/etc/certs/ca.pem' --tlscert '/etc/certs/cert.pem' --tlskey '/etc/certs/key.pem' -H 'tcp://host:2376'",
    ]);
});

test("pollCommand runs ps with quoted filters and stats, both under timeout, separated by SEP", () => {
    const cmd = C.pollCommand(SSH, 15, true);

    assert.equal(cmd,
        "timeout 15 env SSH_ASKPASS_REQUIRE=never docker -H 'ssh://me@prod' ps -a --no-trunc --format '{{json .}}' --filter 'status=running' --filter 'name=a b'\\''c'"
        + " && echo '@@DTOP-STATS@@' && "
        + "timeout 15 env SSH_ASKPASS_REQUIRE=never docker -H 'ssh://me@prod' stats --no-stream --no-trunc --format '{{json .}}'");
});

test("pollCommand without stats runs only ps", () => {
    const cmd = C.pollCommand(host("local"), 9, false);

    assert.equal(cmd, "timeout 9 docker ps -a --no-trunc --format '{{json .}}'");
});

test("splitPoll separates ps and stats output", () => {
    const out = C.splitPoll("{\"ps\":1}\n@@DTOP-STATS@@\n{\"stats\":1}\n");

    assert.deepEqual(out, { ps: "{\"ps\":1}\n", stats: "\n{\"stats\":1}\n" });
});

test("splitPoll without separator treats everything as ps output", () => {
    const out = C.splitPoll("{\"ps\":1}\n");

    assert.deepEqual(out, { ps: "{\"ps\":1}\n", stats: "" });
});

test("restartCountsCommand inspects all ids and parseRestartCounts reads them", () => {
    const cmd = C.restartCountsCommand(host("local"), ["aa", "bb"]);
    const counts = C.parseRestartCounts("aa 0\nbb 3\n\n");

    assert.equal(cmd, "docker inspect --format '{{.Id}} {{.RestartCount}}' 'aa' 'bb'");
    assert.deepEqual(counts, { aa: 0, bb: 3 });
});

test("actionCommand builds start/stop/restart/rm for several ids and rejects others", () => {
    const rm = C.actionCommand(host("local"), "rm", ["aa", "bb"]);
    const stop = C.actionCommand(SSH, "stop", ["aa"]);

    assert.equal(rm, "docker rm 'aa' 'bb'");
    assert.equal(stop, "env SSH_ASKPASS_REQUIRE=never docker -H 'ssh://me@prod' stop 'aa'");
    assert.throws(() => C.actionCommand(host("local"), "kill", ["aa"]), /unknown action/);
});

test("inspectCommand inspects one container", () => {
    assert.equal(C.inspectCommand(host("local"), "aa"), "docker inspect 'aa'");
});

test("logsCommand always adds timestamps, merges stderr, and quotes since/until", () => {
    const tail = C.logsCommand(host("local"), "aa", { tail: 1000 });
    const since = C.logsCommand(host("local"), "aa", { since: "2026-11-04T11:00:00.1Z" });
    const until = C.logsCommand(host("local"), "aa", { until: "2026-11-04T11:00:00Z", tail: 50 });

    assert.equal(tail, "docker logs --timestamps --tail 1000 'aa' 2>&1");
    assert.equal(since, "docker logs --timestamps --since '2026-11-04T11:00:00.1Z' 'aa' 2>&1");
    // docker applies --tail before --until, so paging older lines must tail in the shell instead.
    assert.equal(until, "docker logs --timestamps --until '2026-11-04T11:00:00Z' 'aa' 2>&1 | tail -n 50");
});

test("shellCommand opens the terminal detached with docker exec preferring bash", () => {
    const cmd = C.shellCommand(SSH, "aa", "konsole -e");

    assert.equal(cmd,
        "setsid konsole -e sh -c "
        + C.shQuote("env SSH_ASKPASS_REQUIRE=never docker -H 'ssh://me@prod' exec -it 'aa' sh -c 'command -v bash >/dev/null && exec bash || exec sh'")
        + " >/dev/null 2>&1 &");
});

test("dozzleUrl is empty without dozzle and trims the trailing slash", () => {
    const row = { shortId: "04e431077791" };

    assert.equal(C.dozzleUrl(host("local"), row), "");
    assert.equal(C.dozzleUrl(host("local", { dozzle: "https://dz.example/" }), row), "https://dz.example/container/04e431077791");
});

test("pollError dedupes repeated lines and explains timeouts", () => {
    const dup = C.pollError("Cannot connect\nCannot connect\n", 1, 15);
    const timeout = C.pollError("", 124, 15);
    const bare = C.pollError("  ", 2, 15);

    assert.equal(dup, "Cannot connect");
    assert.equal(timeout, "timed out after 15 s (host unreachable or waiting for an ssh prompt?)");
    assert.equal(bare, "docker exited with code 2");
});

test("pollCommand for an ssh host is valid shell (env prefix survives timeout)", () => {
    const { execSync } = require("node:child_process");
    const cmd = C.pollCommand(host("ssh://me@prod"), 5, false).replace(/ docker /, " echo docker ");

    const out = execSync(cmd, { shell: "/bin/sh" }).toString();

    assert.match(out, /^docker -H ssh:\/\/me@prod ps/);
});

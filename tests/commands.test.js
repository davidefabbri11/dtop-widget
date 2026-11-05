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

function crow(workingDir, file, createdMs) {
    return {
        composeWorkingDir: workingDir, composeConfigFiles: file ? [file] : [], composeEnvFile: "",
        createdMs: createdMs || 0,
    };
}

function repeat(n, make) {
    return Array.from({ length: n }, make);
}

const FS = { workingDir: "/w", configFiles: ["/w/a.yml"], envFile: "" };

test("pickFileSet chooses the set used by most containers", () => {
    const rows = [].concat(
        repeat(14, () => crow("/w/next", "/w/next/p.yml")),
        repeat(2, () => crow("/w/2026.2", "/w/2026.2/p.yml")),
        [crow("/w/pg", "/w/pg/pg18.yml")]);

    const fileSet = C.pickFileSet(rows);

    assert.deepEqual(fileSet, { workingDir: "/w/next", configFiles: ["/w/next/p.yml"], envFile: "", others: 3 });
});

test("pickFileSet breaks ties with the newest container and skips label-less rows", () => {
    const rows = [crow("/a", "/a/x.yml", 1), crow("/b", "/b/x.yml", 2), crow("", "", 3)];

    const fileSet = C.pickFileSet(rows);

    assert.deepEqual(fileSet, { workingDir: "/b", configFiles: ["/b/x.yml"], envFile: "", others: 1 });
});

test("pickFileSet returns null when no row has file labels", () => {
    const rows = [crow("", ""), crow("/w", "")];

    const fileSet = C.pickFileSet(rows);

    assert.equal(fileSet, null);
});

test("fileSetLabel keeps the last two path segments", () => {
    const fileSet = { configFiles: ["/a/b/next/docker-compose_platflow.yml"] };

    const label = C.fileSetLabel(fileSet);

    assert.equal(label, "next/docker-compose_platflow.yml");
});

test("composeCommand builds file-less actions on the docker prefix", () => {
    const local = host("local");

    const cmds = [
        C.composeCommand(local, "start", "stada", null),
        C.composeCommand(local, "downVolumes", "stada", null),
        C.composeCommand(host("ssh://me@prod"), "stop", "stada", null),
    ];

    assert.deepEqual(cmds, [
        "docker compose -p 'stada' start",
        "docker compose -p 'stada' down -v",
        "env SSH_ASKPASS_REQUIRE=never docker -H 'ssh://me@prod' compose -p 'stada' stop",
    ]);
});

test("composeCommand passes files, project dir and env file for up", () => {
    const fileSet = { workingDir: "/w/my dir", configFiles: ["/w/my dir/a.yml", "/w/b.yml"], envFile: "/w/.env" };

    const cmd = C.composeCommand(host("local"), "up", "stada", fileSet);

    assert.equal(cmd, "docker compose -p 'stada' -f '/w/my dir/a.yml' -f '/w/b.yml' --project-directory '/w/my dir' --env-file '/w/.env' up -d");
});

test("composeCommand runs file-based actions over ssh with port and double quoting", () => {
    const sshHost = host("ssh://me@prod:2222");

    const cmd = C.composeCommand(sshHost, "pull", "it's", FS);

    assert.equal(cmd, "env SSH_ASKPASS_REQUIRE=never ssh -o BatchMode=yes -p 2222 'me@prod' "
        + C.shQuote("cd '/w' && docker compose -p 'it'\\''s' -f '/w/a.yml' --project-directory '/w' pull"));
});

test("composeCommand over ssh without user or port", () => {
    const sshHost = host("ssh://prod");

    const cmd = C.composeCommand(sshHost, "build", "stada", FS);

    assert.ok(cmd.startsWith("env SSH_ASKPASS_REQUIRE=never ssh -o BatchMode=yes 'prod' "), cmd);
});

test("composeUnavailable explains why file-based actions cannot run", () => {
    const tcp = host("tcp://h:2375");

    const reasons = [
        C.composeUnavailable(tcp, "up", FS),
        C.composeUnavailable(host("local"), "up", null),
        C.composeUnavailable(tcp, "stop", null),
    ];

    assert.deepEqual(reasons, ["needs SSH access to the host", "no compose file labels on its containers", ""]);
});

test("composeCommand rejects unknown and unavailable actions", () => {
    const local = host("local");

    const unknown = () => C.composeCommand(local, "rm", "stada", null);
    const unavailable = () => C.composeCommand(host("tcp://h:2375"), "up", "stada", FS);

    assert.throws(unknown, /unknown compose action: rm/);
    assert.throws(unavailable, /needs SSH access/);
});

test("composeLogsCommand mirrors logsCommand options", () => {
    const local = host("local");

    const tail = C.composeLogsCommand(local, "stada", { tail: 500 });
    const until = C.composeLogsCommand(local, "stada", { until: "2026-11-05T06:00:00Z", tail: 500 });

    assert.equal(tail, "docker compose -p 'stada' logs --no-color --timestamps --tail 500 2>&1");
    assert.equal(until, "docker compose -p 'stada' logs --no-color --timestamps --until '2026-11-05T06:00:00Z' 2>&1 | tail -n 500");
});

// Builds every shell command the widget runs (via the Plasma "executable" engine, i.e. sh -c).
// Every user- or Docker-supplied token goes through shQuote. No Qt/QML APIs — runs in QML and Node.

var SEP = "@@DTOP-STATS@@";
var JSON_FORMAT = "'{{json .}}'";
var ACTIONS = { start: true, stop: true, restart: true, rm: true };
var INSTALL_HINT = "install Docker (https://docs.docker.com/engine/install/) and make sure `docker` is on plasmashell's PATH";

function shQuote(s) {
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

function dockerBase(host) {
    var ep = host.endpoint;
    if (ep === "local") return "docker";
    if (ep.indexOf("tls://") === 0) {
        var certFile = function (f) {
            return host.certs ? shQuote(host.certs + "/" + f) : "\"$HOME/.docker\"" + shQuote("/" + f);
        };
        return "docker --tlsverify --tlscacert " + certFile("ca.pem") + " --tlscert " + certFile("cert.pem")
            + " --tlskey " + certFile("key.pem") + " -H " + shQuote("tcp://" + ep.substring(6));
    }
    // Plasma sessions set SSH_ASKPASS; without this every poll of a key-less host would pop a password dialog.
    if (ep.indexOf("ssh://") === 0) return "env SSH_ASKPASS_REQUIRE=never docker -H " + shQuote(ep);
    return "docker -H " + shQuote(ep);
}

function quoteAll(items) {
    return items.map(shQuote).join(" ");
}

// withStats=false skips the (slow, ~2 s) docker stats call, e.g. while the popup is closed.
function pollCommand(host, timeoutSec, withStats) {
    var base = "timeout " + timeoutSec + " " + dockerBase(host);
    var filters = host.filters.map(function (f) { return " --filter " + shQuote(f); }).join("");
    var ps = base + " ps -a --no-trunc --format " + JSON_FORMAT + filters;
    if (!withStats) return ps;
    // && so an unreachable host fails once (one timeout), not once per docker call.
    return ps + " && echo " + shQuote(SEP) + " && "
        + base + " stats --no-stream --no-trunc --format " + JSON_FORMAT;
}

function splitPoll(stdout) {
    var s = String(stdout || "");
    var i = s.indexOf(SEP);
    if (i < 0) return { ps: s, stats: "" };
    return { ps: s.substring(0, i), stats: s.substring(i + SEP.length) };
}

// ps and stats usually fail with the same message; `timeout` exits with 124.
function pollError(stderr, code, timeoutSec) {
    if (code === 124) return "timed out after " + timeoutSec + " s (host unreachable or waiting for an ssh prompt?)";
    // sh/env/timeout exit 127 when the program itself is missing.
    if (code === 127) return "docker CLI not found: " + INSTALL_HINT;
    var seen = {};
    var lines = String(stderr || "").split("\n").map(function (l) { return l.trim(); }).filter(function (l) {
        if (!l || seen[l]) return false;
        seen[l] = true;
        return true;
    });
    return lines.length > 0 ? lines.join("\n") : "docker exited with code " + code;
}

function restartCountsCommand(host, ids) {
    return dockerBase(host) + " inspect --format '{{.Id}} {{.RestartCount}}' " + quoteAll(ids);
}

function parseRestartCounts(stdout) {
    var counts = {};
    String(stdout || "").split("\n").forEach(function (line) {
        var parts = line.trim().split(/\s+/);
        if (parts.length === 2) counts[parts[0]] = parseInt(parts[1], 10) || 0;
    });
    return counts;
}

function actionCommand(host, action, ids) {
    if (!ACTIONS[action]) throw new Error("unknown action: " + action);
    return dockerBase(host) + " " + action + " " + quoteAll(ids);
}

function inspectCommand(host, id) {
    return dockerBase(host) + " inspect " + shQuote(id);
}

// docker applies --tail before --until, so with `until` the tail is taken in the shell.
function logsCommand(host, id, opts) {
    var tail = opts.tail ? parseInt(opts.tail, 10) : 0;
    var cmd = dockerBase(host) + " logs --timestamps";
    if (tail && !opts.until) cmd += " --tail " + tail;
    if (opts.since) cmd += " --since " + shQuote(opts.since);
    if (opts.until) cmd += " --until " + shQuote(opts.until);
    cmd += " " + shQuote(id) + " 2>&1";
    if (tail && opts.until) cmd += " | tail -n " + tail;
    return cmd;
}

// terminalCommand is the user's configured launcher (e.g. "konsole -e") and is intentionally not quoted.
function shellCommand(host, id, terminalCommand) {
    var exec = dockerBase(host) + " exec -it " + shQuote(id) + " sh -c "
        + shQuote("command -v bash >/dev/null && exec bash || exec sh");
    return "setsid " + terminalCommand + " sh -c " + shQuote(exec) + " >/dev/null 2>&1 &";
}

// ----- docker compose (project actions) -----

var COMPOSE_ARGS = {
    start: "start", stop: "stop", restart: "restart", pause: "pause", unpause: "unpause",
    down: "down", downVolumes: "down -v",
    up: "up -d", pull: "pull", build: "build", recreate: "up -d --force-recreate"
};
var COMPOSE_ACTIONS = Object.keys(COMPOSE_ARGS);
var FILE_ACTIONS = { up: true, pull: true, build: true, recreate: true };

function needsFiles(action) {
    return !!FILE_ACTIONS[action];
}

// A file set is (working_dir, config_files, environment_file). Containers of one project may come
// from different file sets; use the one most containers share (tie: newest container), never the union.
function pickFileSet(projectRows) {
    var sets = {};
    projectRows.forEach(function (r) {
        if (!r.composeWorkingDir || r.composeConfigFiles.length === 0) return;
        var key = r.composeWorkingDir + "\n" + r.composeConfigFiles.join(",") + "\n" + r.composeEnvFile;
        var s = sets[key] || (sets[key] = {
            workingDir: r.composeWorkingDir, configFiles: r.composeConfigFiles, envFile: r.composeEnvFile,
            count: 0, newest: -Infinity
        });
        s.count++;
        s.newest = Math.max(s.newest, r.createdMs || 0);
    });
    var best = null, usable = 0;
    Object.keys(sets).forEach(function (k) {
        var s = sets[k];
        usable += s.count;
        if (!best || s.count > best.count || (s.count === best.count && s.newest > best.newest)) best = s;
    });
    if (!best) return null;
    return { workingDir: best.workingDir, configFiles: best.configFiles.slice(), envFile: best.envFile, others: usable - best.count };
}

function fileSetLabel(fileSet) {
    return fileSet.configFiles[0].split("/").filter(function (p) { return p.length > 0; }).slice(-2).join("/");
}

function composeUnavailable(host, action, fileSet) {
    if (!needsFiles(action)) return "";
    if (/^(tcp|tls):\/\//.test(host.endpoint)) return "needs SSH access to the host";
    if (!fileSet) return "no compose file labels on its containers";
    return "";
}

// ssh://[user@]host[:port]
function sshTarget(endpoint) {
    var m = /^ssh:\/\/([^\/:]+(?:@[^\/:]+)?)(?::(\d+))?/.exec(endpoint);
    return { dest: m[1], port: m[2] || "" };
}

function composeCommand(host, action, project, fileSet) {
    if (!COMPOSE_ARGS.hasOwnProperty(action)) throw new Error("unknown compose action: " + action);
    var reason = composeUnavailable(host, action, fileSet);
    if (reason) throw new Error(action + ": " + reason);
    var args = "-p " + shQuote(project) + " ";
    if (!needsFiles(action)) return dockerBase(host) + " compose " + args + COMPOSE_ARGS[action];
    args += fileSet.configFiles.map(function (f) { return "-f " + shQuote(f) + " "; }).join("")
        + "--project-directory " + shQuote(fileSet.workingDir) + " "
        + (fileSet.envFile ? "--env-file " + shQuote(fileSet.envFile) + " " : "")
        + COMPOSE_ARGS[action];
    if (host.endpoint.indexOf("ssh://") !== 0) return dockerBase(host) + " compose " + args;
    // The compose files live on the remote host, which `docker -H ssh://` cannot read: run compose there.
    var t = sshTarget(host.endpoint);
    var remote = "cd " + shQuote(fileSet.workingDir) + " && docker compose " + args;
    return "env SSH_ASKPASS_REQUIRE=never ssh -o BatchMode=yes " + (t.port ? "-p " + t.port + " " : "")
        + shQuote(t.dest) + " " + shQuote(remote);
}

// Error text for a failed compose command. Without the Compose plugin, docker parses `compose -p`
// itself ("unknown shorthand flag: 'p'"); exit 127 means docker (or ssh, for ssh:// hosts) is missing.
function composeError(stdout, stderr, code) {
    var text = String(stderr || "").trim() || String(stdout || "").trim();
    if (code === 127) return "command not found (docker, or ssh for ssh:// hosts): " + INSTALL_HINT + "\n" + text;
    if (/unknown shorthand flag: 'p'|unknown command: docker compose|'compose' is not a docker command/.test(text))
        return "Docker Compose plugin not found: install Docker Compose v2 (https://docs.docker.com/compose/install/linux/), e.g. the docker-compose-plugin package";
    return text;
}

// Same options as logsCommand; compose prefixes each line with "<container> | ".
// compose applies --tail per container and interleaves streams, so neither --tail with --until nor a
// shell `tail` yields the newest N lines overall: the caller sorts and trims with Logs.keepNewest.
function composeLogsCommand(host, project, opts) {
    var tail = opts.tail ? parseInt(opts.tail, 10) : 0;
    var cmd = dockerBase(host) + " compose -p " + shQuote(project) + " logs --no-color --timestamps";
    if (tail && !opts.until) cmd += " --tail " + tail;
    if (opts.since) cmd += " --since " + shQuote(opts.since);
    if (opts.until) cmd += " --until " + shQuote(opts.until);
    return cmd + " 2>&1";
}

function dozzleUrl(host, row) {
    if (!host.dozzle) return "";
    return host.dozzle.replace(/\/+$/, "") + "/container/" + row.shortId;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        SEP: SEP,
        shQuote: shQuote,
        dockerBase: dockerBase,
        pollCommand: pollCommand,
        splitPoll: splitPoll,
        pollError: pollError,
        restartCountsCommand: restartCountsCommand,
        parseRestartCounts: parseRestartCounts,
        actionCommand: actionCommand,
        inspectCommand: inspectCommand,
        logsCommand: logsCommand,
        shellCommand: shellCommand,
        dozzleUrl: dozzleUrl,
        COMPOSE_ACTIONS: COMPOSE_ACTIONS,
        needsFiles: needsFiles,
        pickFileSet: pickFileSet,
        fileSetLabel: fileSetLabel,
        composeUnavailable: composeUnavailable,
        composeCommand: composeCommand,
        composeError: composeError,
        composeLogsCommand: composeLogsCommand
    };
}

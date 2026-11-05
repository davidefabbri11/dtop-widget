// Builds every shell command the widget runs (via the Plasma "executable" engine, i.e. sh -c).
// Every user- or Docker-supplied token goes through shQuote. No Qt/QML APIs — runs in QML and Node.

var SEP = "@@DTOP-STATS@@";
var JSON_FORMAT = "'{{json .}}'";
var ACTIONS = { start: true, stop: true, restart: true, rm: true };

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
        dozzleUrl: dozzleUrl
    };
}

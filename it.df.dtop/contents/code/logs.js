// `docker logs --timestamps` parsing and rich-text rendering (JSON colourised).
// No Qt/QML APIs — runs in QML and Node.

var TS_RE = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)) (.*)$/;
var COLOR = { key: "#5fafd7", string: "#87af5f", number: "#d7af5f", literal: "#af87d7", time: "#808080" };

function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Date.parse only handles millisecond precision reliably; docker emits nanoseconds.
function tsToMs(ts) {
    return Date.parse(ts.replace(/(\.\d{3})\d+/, "$1"));
}

function parseLogLines(stdout) {
    var lines = [];
    String(stdout || "").split("\n").forEach(function (raw) {
        if (raw.length === 0) return;
        var m = TS_RE.exec(raw);
        var ts = m ? m[1] : "";
        var text = m ? m[4] : raw;
        var json = null;
        if (text.trim().charAt(0) === "{") {
            try { json = JSON.parse(text); } catch (e) { json = null; }
        }
        lines.push({ ts: ts, tsMs: ts ? tsToMs(ts) : 0, text: text, json: json });
    });
    return lines;
}

function span(color, html) {
    return "<span style=\"color:" + color + "\">" + html + "</span>";
}

// pretty=true renders indented multi-line rich text (details view); otherwise one line.
function renderJson(value, pretty, depth) {
    depth = depth || 0;
    var nl = pretty ? "<br>" : "";
    var pad = function (d) { return pretty ? new Array(d + 1).join("&nbsp;&nbsp;") : ""; };
    var sep = pretty ? ", " : ",";
    if (value === null || typeof value === "boolean") return span(COLOR.literal, String(value));
    if (typeof value === "number") return span(COLOR.number, String(value));
    if (typeof value === "string") return span(COLOR.string, escapeHtml(JSON.stringify(value)));
    if (Array.isArray(value)) {
        if (value.length === 0) return "[]";
        return "[" + nl + value.map(function (v) {
            return pad(depth + 1) + renderJson(v, pretty, depth + 1);
        }).join(sep.trim() + nl) + nl + pad(depth) + "]";
    }
    var keys = Object.keys(value);
    if (keys.length === 0) return "{}";
    return "{" + nl + keys.map(function (k) {
        return pad(depth + 1) + span(COLOR.key, escapeHtml(JSON.stringify(k))) + ":" + (pretty ? " " : "")
            + renderJson(value[k], pretty, depth + 1);
    }).join(sep.trim() + nl) + nl + pad(depth) + "}";
}

// For widgets that auto-detect rich text (InlineMessage, dialogs): escaped text that is
// always treated as rich, so "<none>" shows literally and newlines/indentation survive.
function asRichText(s) {
    return "<span style=\"white-space:pre-wrap\">" + escapeHtml(s) + "</span>";
}

function formatLogLine(line, localTime, jsonMode) {
    var time = line.ts ? span(COLOR.time, escapeHtml(localTime(line.tsMs))) + " " : "";
    // Compose lines keep their container prefix in front of rendered JSON.
    var body = jsonMode && line.json !== null
        ? (line.prefix ? escapeHtml(line.prefix) + " | " : "") + renderJson(line.json, false)
        : escapeHtml(line.text);
    // pre-wrap keeps indentation (stack traces, aligned output) that rich text would collapse.
    return time + "<span style=\"white-space:pre-wrap\">" + body + "</span>";
}

// Docker trims trailing zeros (RFC3339Nano), so pad the fraction to 9 digits to make
// timestamps comparable as strings.
function tsKey(ts) {
    var m = /^([^.Z+]+?)(?:\.(\d+))?(Z|[+-]\d\d:\d\d)$/.exec(ts);
    if (!m) return ts;
    return m[1] + "." + ((m[2] || "") + "000000000").substring(0, 9) + m[3];
}

// Merge a --since (append) or --until (prepend) batch, dropping lines on the far side
// of the boundary and exact duplicates of boundary lines.
function mergeLogs(existing, incoming, mode) {
    if (existing.length === 0) return incoming.slice();
    var append = mode === "append";
    var edge = tsKey(append ? existing[existing.length - 1].ts : existing[0].ts);
    var seen = {};
    existing.forEach(function (l) { if (tsKey(l.ts) === edge) seen[l.text] = true; });
    var kept = incoming.filter(function (l) {
        var k = tsKey(l.ts);
        if (append ? k < edge : k > edge) return false;
        if (k === edge && seen[l.text]) { delete seen[l.text]; return false; }
        return true;
    });
    return append ? existing.concat(kept) : kept.concat(existing);
}

// `docker compose logs --no-color --timestamps`: "<container>   | <ts> <text>", streams interleaved
// out of order. Keep the container name in the text and sort by time so mergeLogs' edges hold.
function parseComposeLogLines(stdout) {
    var lines = [];
    String(stdout || "").split("\n").forEach(function (raw) {
        if (raw.length === 0) return;
        var m = /^(\S+)\s+\| ?(.*)$/.exec(raw);
        var parsed = parseLogLines(m ? m[2] : raw)[0];
        if (!parsed) return;
        if (m) {
            parsed.prefix = m[1];
            parsed.text = m[1] + " | " + parsed.text;
        }
        lines.push(parsed);
    });
    return lines
        .map(function (l, i) { return { l: l, i: i, k: tsKey(l.ts) }; })
        .sort(function (a, b) { return a.k < b.k ? -1 : a.k > b.k ? 1 : a.i - b.i; })
        .map(function (x) { return x.l; });
}

// Newest n of time-sorted lines (n <= 0: all). For project logs, where compose's --tail is per container.
function keepNewest(lines, n) {
    return n > 0 && lines.length > n ? lines.slice(lines.length - n) : lines;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        keepNewest: keepNewest,
        parseComposeLogLines: parseComposeLogLines,
        asRichText: asRichText,
        mergeLogs: mergeLogs,
        escapeHtml: escapeHtml,
        parseLogLines: parseLogLines,
        renderJson: renderJson,
        formatLogLine: formatLogLine
    };
}

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
    var body = jsonMode && line.json !== null ? renderJson(line.json, false) : escapeHtml(line.text);
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

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        asRichText: asRichText,
        mergeLogs: mergeLogs,
        escapeHtml: escapeHtml,
        parseLogLines: parseLogLines,
        renderJson: renderJson,
        formatLogLine: formatLogLine
    };
}

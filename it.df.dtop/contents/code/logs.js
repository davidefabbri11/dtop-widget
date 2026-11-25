// `docker logs --timestamps` parsing and rich-text rendering (JSON colourised).
// No Qt/QML APIs — runs in QML and Node.

var TS_RE = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)) (.*)$/;
var COLOR = { key: "#5fafd7", string: "#87af5f", number: "#d7af5f", literal: "#af87d7", time: "#808080",
              match: "#d7af5f", current: "#ff8700", matchText: "#1c1c1c" };
// No backslash: inside JSON-encoded strings it starts an escape (\n, \", \u...), never part of the URL.
var URL_RE = /https?:\/\/[^\s<>"'`\\]+/g;
var URL_TRAILING_RE = /[.,;:!?)\]}'"]+$/;

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

// Escaped `s` with every case-insensitive occurrence of `needle` highlighted.
function highlight(s, needle, current) {
    if (!needle) return escapeHtml(s);
    var lower = s.toLowerCase();
    var n = needle.toLowerCase();
    var out = "";
    var from = 0;
    var i;
    while ((i = lower.indexOf(n, from)) >= 0) {
        out += escapeHtml(s.substring(from, i))
            + "<span style=\"background-color:" + (current ? COLOR.current : COLOR.match) + ";color:" + COLOR.matchText + "\">"
            + escapeHtml(s.substring(i, i + n.length)) + "</span>";
        from = i + n.length;
    }
    return out + escapeHtml(s.substring(from));
}

// Plain text to rich text: escaped, http(s) URLs as links, matches of `needle` highlighted
// (per segment, so a match spanning a URL boundary is not highlighted).
function markup(text, needle, current) {
    var s = String(text);
    var out = "";
    var last = 0;
    var m;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(s)) !== null) {
        var url = m[0].replace(URL_TRAILING_RE, "");
        out += highlight(s.substring(last, m.index), needle, current)
            + "<a href=\"" + escapeHtml(url) + "\">" + highlight(url, needle, current) + "</a>";
        last = m.index + url.length;
        URL_RE.lastIndex = last;
    }
    return out + highlight(s.substring(last), needle, current);
}

// Indices of lines whose raw text contains `needle`, case-insensitively.
function matchLines(lines, needle) {
    if (!needle) return [];
    var n = needle.toLowerCase();
    var found = [];
    lines.forEach(function (l, i) { if (l.text.toLowerCase().indexOf(n) >= 0) found.push(i); });
    return found;
}

// pretty=true renders indented multi-line rich text (details view); otherwise one line.
// `mark` = { needle, current } links URLs and highlights matches inside string values.
function renderJson(value, pretty, depth, mark) {
    depth = depth || 0;
    var nl = pretty ? "<br>" : "";
    var pad = function (d) { return pretty ? new Array(d + 1).join("&nbsp;&nbsp;") : ""; };
    var sep = pretty ? ", " : ",";
    var text = function (t) { return mark ? highlight(t, mark.needle, mark.current) : escapeHtml(t); };
    if (value === null || typeof value === "boolean") return span(COLOR.literal, text(String(value)));
    if (typeof value === "number") return span(COLOR.number, text(String(value)));
    if (typeof value === "string") {
        if (!mark) return span(COLOR.string, escapeHtml(JSON.stringify(value)));
        var inner = JSON.stringify(value);
        return span(COLOR.string, "&quot;" + markup(inner.substring(1, inner.length - 1), mark.needle, mark.current) + "&quot;");
    }
    if (Array.isArray(value)) {
        if (value.length === 0) return "[]";
        return "[" + nl + value.map(function (v) {
            return pad(depth + 1) + renderJson(v, pretty, depth + 1, mark);
        }).join(sep.trim() + nl) + nl + pad(depth) + "]";
    }
    var keys = Object.keys(value);
    if (keys.length === 0) return "{}";
    return "{" + nl + keys.map(function (k) {
        return pad(depth + 1) + span(COLOR.key, text(JSON.stringify(k))) + ":" + (pretty ? " " : "")
            + renderJson(value[k], pretty, depth + 1, mark);
    }).join(sep.trim() + nl) + nl + pad(depth) + "}";
}

// For widgets that auto-detect rich text (InlineMessage, dialogs): escaped text that is
// always treated as rich, so "<none>" shows literally and newlines/indentation survive.
function asRichText(s) {
    return "<span style=\"white-space:pre-wrap\">" + escapeHtml(s) + "</span>";
}

// opts = { timestamps (default true), search, current (this line holds the current match) }.
function formatLogLine(line, localTime, jsonMode, opts) {
    opts = opts || {};
    var needle = opts.search || "";
    var current = !!opts.current;
    var time = line.ts && opts.timestamps !== false ? span(COLOR.time, escapeHtml(localTime(line.tsMs))) + " " : "";
    // Compose lines keep their container prefix in front of rendered JSON.
    var body = jsonMode && line.json !== null
        ? (line.prefix ? highlight(line.prefix, needle, current) + " | " : "")
          + renderJson(line.json, false, 0, { needle: needle, current: current })
        : markup(line.text, needle, current);
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
        formatLogLine: formatLogLine,
        markup: markup,
        matchLines: matchLines
    };
}

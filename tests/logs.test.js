const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../it.df.dtop/contents/code/logs.js");

const OUT = "2026-11-04T11:00:00.123456789Z {\"level\":\"info\",\"msg\":\"<hi>\"}\n"
    + "2026-11-04T11:00:01Z {not json & <b>\n"
    + "2026-11-04T11:00:02Z plain line\n\n";

test("parseLogLines splits timestamp and text and parses JSON bodies only", () => {
    const lines = L.parseLogLines(OUT);

    assert.equal(lines.length, 3);
    assert.equal(lines[0].ts, "2026-11-04T11:00:00.123456789Z");
    assert.equal(lines[0].tsMs, Date.parse("2026-11-04T11:00:00.123Z"));
    assert.equal(lines[0].json.level, "info");
    assert.equal(lines[1].json, null);
    assert.equal(lines[2].text, "plain line");
});

test("parseLogLines keeps lines without a timestamp as text", () => {
    const [line] = L.parseLogLines("Error response from daemon: No such container: x\n");

    assert.equal(line.ts, "");
    assert.equal(line.text, "Error response from daemon: No such container: x");
});

test("escapeHtml escapes markup characters", () => {
    assert.equal(L.escapeHtml("<a href=\"x\">&</a>"), "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
});

test("formatLogLine escapes JSON string values and never emits raw markup", () => {
    const [jsonLine, badLine] = L.parseLogLines(OUT);

    const json = L.formatLogLine(jsonLine, () => "12:00:00", true);
    const bad = L.formatLogLine(badLine, () => "12:00:01", true);

    assert.match(json, /&lt;hi&gt;/);
    assert.doesNotMatch(json, /<hi>/);
    assert.match(json, /<span style="color:#5fafd7">&quot;level&quot;<\/span>/);
    assert.match(bad, /\{not json &amp; &lt;b&gt;/);
    assert.match(bad, /^<span style="color:#808080">12:00:01<\/span> /);
});

test("formatLogLine shows raw text for JSON lines when json mode is off", () => {
    const [jsonLine] = L.parseLogLines(OUT);

    const raw = L.formatLogLine(jsonLine, () => "t", false);

    assert.match(raw, /\{&quot;level&quot;:&quot;info&quot;/);
});

test("renderJson colours numbers, booleans and null", () => {
    const html = L.renderJson({ n: 1, b: true, z: null });

    assert.match(html, /<span style="color:#d7af5f">1<\/span>/);
    assert.match(html, /<span style="color:#af87d7">true<\/span>/);
    assert.match(html, /<span style="color:#af87d7">null<\/span>/);
});

function lines(...specs) {
    return L.parseLogLines(specs.map(([ts, text]) => ts + " " + text).join("\n") + "\n");
}

test("mergeLogs append drops the boundary duplicates returned by --since", () => {
    const existing = lines(["2026-11-04T11:00:00Z", "a"], ["2026-11-04T11:00:01.5Z", "b"]);
    const incoming = lines(["2026-11-04T11:00:01.500000000Z", "b"], ["2026-11-04T11:00:01.5Z", "b2"], ["2026-11-04T11:00:02Z", "c"]);

    const merged = L.mergeLogs(existing, incoming, "append");

    assert.deepEqual(merged.map(l => l.text), ["a", "b", "b2", "c"]);
});

test("mergeLogs prepend drops the boundary duplicates returned by --until", () => {
    const existing = lines(["2026-11-04T11:00:05Z", "e"], ["2026-11-04T11:00:06Z", "f"]);
    const incoming = lines(["2026-11-04T11:00:04Z", "d"], ["2026-11-04T11:00:05Z", "e"], ["2026-11-04T11:00:07Z", "later"]);

    const merged = L.mergeLogs(existing, incoming, "prepend");

    assert.deepEqual(merged.map(l => l.text), ["d", "e", "f"]);
});

test("mergeLogs into an empty list keeps everything", () => {
    const incoming = lines(["2026-11-04T11:00:04Z", "d"]);

    const merged = L.mergeLogs([], incoming, "append");

    assert.deepEqual(merged.map(l => l.text), ["d"]);
});

test("formatLogLine preserves indentation and runs of spaces", () => {
    const [line] = L.parseLogLines("2026-11-04T11:00:00Z \tat com.Foo(Foo.java:1)   x\n");

    const html = L.formatLogLine(line, () => "t", true);

    assert.match(html, /<span style="white-space:pre-wrap">\tat com.Foo\(Foo.java:1\)   x<\/span>$/);
});

test("asRichText escapes untrusted text inside an explicit rich-text wrapper", () => {
    const html = L.asRichText("image <none>\n& more");

    assert.equal(html, "<span style=\"white-space:pre-wrap\">image &lt;none&gt;\n&amp; more</span>");
});

test("parseComposeLogLines strips the padded prefix, keeps the name in text and sorts by time", () => {
    const out = "b-1   | 2026-11-05T06:00:02.000000001Z two\na-1 | 2026-11-05T06:00:01Z one\n";

    const lines = L.parseComposeLogLines(out);

    assert.deepEqual(lines.map((l) => l.text), ["a-1 | one", "b-1 | two"]);
    assert.equal(lines[0].ts, "2026-11-05T06:00:01Z");
});

test("keepNewest keeps the newest lines across containers with skewed log rates", () => {
    const out = [
        "quiet-1 | 2026-11-01T00:00:00Z old",
        "busy-1 | 2026-11-05T06:00:10Z b10",
        "busy-1 | 2026-11-05T06:00:11Z b11",
        "busy-1 | 2026-11-05T06:00:12Z b12",
    ].join("\n");
    const lines = L.parseComposeLogLines(out);

    const kept = L.keepNewest(lines, 2);
    const all = L.keepNewest(lines, 0);

    assert.deepEqual(kept.map((l) => l.text), ["busy-1 | b11", "busy-1 | b12"]);
    assert.equal(all.length, 4);
});

test("formatLogLine keeps the compose container prefix when rendering JSON", () => {
    const line = L.parseComposeLogLines('shop-api-1  | 2026-11-05T06:00:01Z {"level":"info"}\n')[0];

    const html = L.formatLogLine(line, () => "07:00:01", true);

    assert.match(html, /shop-api-1 \| \{<span style="color:#5fafd7">&quot;level&quot;<\/span>/);
});

test("markup escapes text and turns http(s) URLs into links without trailing punctuation", () => {
    const html = L.markup("see <https://example.com/a?b=1&c=2>. or (http://x.io/p).", "");

    assert.equal(html,
        "see &lt;<a href=\"https://example.com/a?b=1&amp;c=2\">https://example.com/a?b=1&amp;c=2</a>&gt;. or "
        + "(<a href=\"http://x.io/p\">http://x.io/p</a>).");
});

test("markup links nothing but http and https", () => {
    const html = L.markup("javascript:alert(1) file:///etc/passwd ftp://h/x", "");

    assert.equal(html, "javascript:alert(1) file:///etc/passwd ftp://h/x");
});

test("markup highlights every case-insensitive match, also inside link text, and escapes the match", () => {
    const html = L.markup("Error <b> error at https://err.io", "ERR");

    const mark = (s) => "<span style=\"background-color:#d7af5f;color:#1c1c1c\">" + s + "</span>";
    assert.equal(html, mark("Err") + "or &lt;b&gt; " + mark("err") + "or at <a href=\"https://err.io\">https://" + mark("err") + ".io</a>");
});

test("formatLogLine hides the time when timestamps are off and marks the current match strongly", () => {
    const line = L.parseLogLines("2024-01-01T00:00:00Z disk full\n")[0];

    const html = L.formatLogLine(line, () => "T", false, { timestamps: false, search: "full", current: true });

    assert.equal(html, "<span style=\"white-space:pre-wrap\">disk <span style=\"background-color:#ff8700;color:#1c1c1c\">full</span></span>");
});

test("formatLogLine keeps today's output without options", () => {
    const line = L.parseLogLines("2024-01-01T00:00:00Z a https://x.io\n")[0];

    const html = L.formatLogLine(line, () => "T", false);

    assert.equal(html, "<span style=\"color:#808080\">T</span> <span style=\"white-space:pre-wrap\">a <a href=\"https://x.io\">https://x.io</a></span>");
});

test("formatLogLine links and highlights inside JSON string values only", () => {
    const line = L.parseLogLines("2024-01-01T00:00:00Z {\"url\":\"https://x.io\",\"n\":1}\n")[0];

    const html = L.formatLogLine(line, () => "T", true, { timestamps: false, search: "" });

    assert.ok(html.includes("<a href=\"https://x.io\">https://x.io</a>"));
    assert.ok(!html.includes("<a href=\"https://x.io&quot;"));
});

test("matchLines returns indices of lines containing the needle, case-insensitively", () => {
    const lines = L.parseLogLines("a\nERROR one\nok\nan error\n");

    const results = [L.matchLines(lines, "error"), L.matchLines(lines, "")];

    assert.deepEqual(results, [[1, 3], []]);
});

test("formatLogLine highlights matches in JSON keys, numbers and literals too", () => {
    const line = L.parseLogLines("2024-01-01T00:00:00Z {\"level\":\"info\",\"code\":500,\"ok\":true}\n")[0];

    const html = ["level", "500", "true"].map((s) => L.formatLogLine(line, () => "T", true, { timestamps: false, search: s }));

    html.forEach((h) => assert.ok(h.includes("background-color:#d7af5f"), h));
});

test("URLs in JSON strings stop at escape sequences", () => {
    const line = L.parseLogLines("2024-01-01T00:00:00Z {\"msg\":\"see https://x.io/a\\nnext\"}\n")[0];

    const html = L.formatLogLine(line, () => "T", true, { timestamps: false, search: "" });

    assert.ok(html.includes("<a href=\"https://x.io/a\">"), html);
});

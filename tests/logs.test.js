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

const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("../it.df.dtop/contents/code/hosts.js");

test("parseHosts parses endpoint, options, repeated filters and skips comments/blank lines", () => {
    const text = "local\n# c\n\nssh://me@prod name=prod dozzle=https://dz filter=status=running filter=label=env=prod";

    const hosts = H.parseHosts(text);

    assert.deepEqual(hosts, [
        { endpoint: "local", name: "local", dozzle: "", certs: "", filters: [] },
        { endpoint: "ssh://me@prod", name: "prod", dozzle: "https://dz", certs: "", filters: ["status=running", "label=env=prod"] },
    ]);
});

test("parseHosts defaults to a single local host for empty text", () => {
    const hosts = H.parseHosts("  \n# only a comment\n");

    assert.deepEqual(hosts, [{ endpoint: "local", name: "local", dozzle: "", certs: "", filters: [] }]);
});

test("parseHosts defaults name to endpoint without scheme and ignores unknown keys", () => {
    const hosts = H.parseHosts("ssh://me@prod:22 colour=red");

    assert.deepEqual(hosts, [{ endpoint: "ssh://me@prod:22", name: "me@prod:22", dozzle: "", certs: "", filters: [] }]);
});

test("validateHosts flags unknown schemes, duplicate names and bad options by line number", () => {
    const text = "local\nhttp://bad\n# fine\nssh://a name=x\ntcp://b:2375 name=x\ntls://c dozzle\n";

    const problems = H.validateHosts(text);

    assert.deepEqual(problems, [
        "line 2: unknown endpoint \"http://bad\" (use local, unix://, ssh://, tcp:// or tls://)",
        "line 5: duplicate name \"x\"",
        "line 6: option \"dozzle\" needs key=value",
    ]);
});

test("validateHosts accepts the default", () => {
    assert.deepEqual(H.validateHosts("local"), []);
});

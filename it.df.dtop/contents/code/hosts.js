// Host list parsing. No Qt/QML APIs — runs in QML and Node.

// One host per line: <endpoint> [name=..] [dozzle=..] [certs=..] [filter=k=v]...
function parseHosts(text) {
    var hosts = [];
    var lines = String(text || "").split("\n");
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].replace(/#.*$/, "").trim();
        if (line.length === 0) continue;
        var tokens = line.split(/\s+/);
        var host = { endpoint: tokens[0], name: "", dozzle: "", certs: "", filters: [] };
        for (var j = 1; j < tokens.length; j++) {
            var eq = tokens[j].indexOf("=");
            if (eq <= 0) continue;
            var key = tokens[j].substring(0, eq);
            var value = tokens[j].substring(eq + 1);
            if (key === "filter") host.filters.push(value);
            else if (key === "name" || key === "dozzle" || key === "certs") host[key] = value;
        }
        if (!host.name) host.name = host.endpoint.replace(/^[a-z]+:\/\//, "");
        hosts.push(host);
    }
    if (hosts.length === 0) hosts.push({ endpoint: "local", name: "local", dozzle: "", certs: "", filters: [] });
    return hosts;
}

// Human-readable problems for the settings page, one per offending line.
function validateHosts(text) {
    var problems = [];
    var names = {};
    String(text || "").split("\n").forEach(function (raw, i) {
        var line = raw.replace(/#.*$/, "").trim();
        if (line.length === 0) return;
        var tokens = line.split(/\s+/);
        var where = "line " + (i + 1) + ": ";
        if (tokens[0] !== "local" && !/^(unix|ssh|tcp|tls):\/\/./.test(tokens[0])) {
            problems.push(where + "unknown endpoint \"" + tokens[0] + "\" (use local, unix://, ssh://, tcp:// or tls://)");
            return;
        }
        for (var j = 1; j < tokens.length; j++) {
            if (tokens[j].indexOf("=") <= 0) {
                problems.push(where + "option \"" + tokens[j] + "\" needs key=value");
                return;
            }
        }
        var name = parseHosts(line)[0].name;
        if (names[name]) problems.push(where + "duplicate name \"" + name + "\"");
        names[name] = true;
    });
    return problems;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        validateHosts: validateHosts,
        parseHosts: parseHosts
    };
}

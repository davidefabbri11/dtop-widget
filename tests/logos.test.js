const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../it.df.dtop/contents/code/logos.js");
const D = require("../it.df.dtop/contents/code/logodata.js");

// Cases ported from dtop's src/ui/app_logos.rs tests.
test("logoForImage matches images like dtop and Dozzle", () => {
    const images = ["nginx", "nginx:1.27-alpine", "docker.io/library/postgres:16", "lscr.io/linuxserver/sonarr:latest",
        "ghcr.io/goauthentik/server:2024.2", "amir20/dozzle:latest", "registry:5000/redis", "localhost/grafana/grafana",
        "redis@sha256:abc", "Home_Assistant/home-assistant", "vaultwarden/server"];

    const slugs = images.map((i) => L.logoForImage(i, false, D));

    assert.deepEqual(slugs, ["nginx", "nginx", "postgresql", "sonarr", "authentik", "dozzle", "redis", "grafana", "redis",
        "home-assistant", "vaultwarden-light"]);   // dark background: the light variant where one exists
});

test("logoForImage gives no logo for unknown, generic and non-ASCII images", () => {
    const images = ["mycompany/internal-tool", "server", "linuxserver/app", "", "aéalpine", "ü", "日本語サーバー"];

    const slugs = images.map((i) => L.logoForImage(i, false, D));

    assert.deepEqual(slugs, [null, null, null, null, null, null, null]);
});

test("logoForImage picks the themed variant for the background when it exists", () => {
    const results = [L.logoForImage("mintplex/anythingllm", false, D), L.logoForImage("mintplex/anythingllm", true, D),
        L.logoForImage("nginx", true, D)];

    assert.deepEqual(results, ["anything-llm-light", "anything-llm", "nginx"]);
});

test("every logo slug has a bundled image", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const dir = path.join(__dirname, "../it.df.dtop/contents/images/app-logos");

    const missing = D.LOGOS.filter((s) => !fs.existsSync(path.join(dir, s + ".png")));

    assert.deepEqual(missing, []);
});

test("logoForImage strips known suffixes like -alpine, -server and -nightly", () => {
    const images = ["x/nginx-alpine", "foo/vaultwarden-server", "jellyfin/jellyfin-nightly", "x/a-server"];

    const slugs = images.map((i) => L.logoForImage(i, false, D));

    assert.deepEqual(slugs, ["nginx", "vaultwarden-light", "jellyfin", null]);
});

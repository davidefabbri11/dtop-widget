#!/usr/bin/env python3
"""Demo stand-in for `docker` and `ssh` (by argv[0]) so the widget can be screenshotted with fake data."""
import json, os, sys, time, datetime, hashlib

NOW = time.time()

def cid(name):
    return hashlib.sha256(name.encode()).hexdigest()

# name, image, project, state, status, cpu%, mem MiB, mem limit MiB, rx kB/s, tx kB/s, running_for
HOSTS = {
    "homelab": dict(cores=12, mem=32 * 1024**3, containers=[
        ("monitoring-grafana-1", "grafana/grafana:11.2.0", "monitoring", "running", "Up 6 hours (healthy)", 4.1, 182, 0, 21, 9, "2 weeks ago"),
        ("monitoring-prometheus-1", "prom/prometheus:v2.54.1", "monitoring", "running", "Up 6 hours", 23.8, 1650, 2048, 38, 12, "2 weeks ago"),
        ("monitoring-node-exporter-1", "prom/node-exporter:v1.8.2", "monitoring", "running", "Up 6 hours", 0.6, 18, 0, 10, 31, "2 weeks ago"),
        ("shop-api-1", "ghcr.io/acme/shop-api:1.4.2", "shop", "running", "Up 3 days (healthy)", 62.4, 412, 512, 140, 380, "3 days ago"),
        ("shop-web-1", "nginx:1.27-alpine", "shop", "running", "Up 3 days (healthy)", 1.2, 24, 0, 520, 2400, "3 days ago"),
        ("shop-postgres-1", "postgres:16", "shop", "running", "Up 3 days (healthy)", 18.5, 1430, 2048, 95, 260, "3 days ago"),
        ("shop-redis-1", "redis:7-alpine", "shop", "running", "Up 3 days", 2.3, 61, 256, 44, 52, "3 days ago"),
        ("shop-worker-1", "ghcr.io/acme/shop-worker:1.4.2", "shop", "running", "Up 2 minutes", 91.7, 930, 1024, 12, 6, "3 days ago"),
        ("portainer", "portainer/portainer-ce:2.21.0", "", "running", "Up 12 days", 0.2, 33, 0, 3, 2, "4 weeks ago"),
        ("backup-restic", "restic/restic:0.17.1", "", "exited", "Exited (1) 5 hours ago", 0, 0, 0, 0, 0, "2 weeks ago"),
    ]),
    "nas": dict(cores=4, mem=16 * 1024**3, containers=[
        ("media-jellyfin-1", "jellyfin/jellyfin:10.9.11", "media", "running", "Up 2 weeks (healthy)", 47.2, 1290, 0, 820, 9400, "3 weeks ago"),
        ("media-sonarr-1", "lscr.io/linuxserver/sonarr:latest", "media", "running", "Up 2 weeks", 0.8, 240, 0, 28, 14, "3 weeks ago"),
        ("syncthing", "syncthing/syncthing:1.27", "", "running", "Up 2 weeks (unhealthy)", 5.5, 96, 0, 44, 120, "1 month ago"),
        ("uptime-kuma", "louislam/uptime-kuma:1", "", "paused", "Up 9 days (Paused)", 0, 0, 0, 0, 0, "1 month ago"),
    ]),
    "edge": dict(cores=8, mem=16 * 1024**3, containers=[
        ("traefik", "traefik:v3.1", "", "running", "Up 41 days", 3.4, 88, 0, 2100, 2300, "2 months ago"),
        ("vaultwarden", "vaultwarden/server:1.32.0", "", "running", "Up 41 days (healthy)", 0.3, 41, 0, 6, 9, "2 months ago"),
        ("gitea", "gitea/gitea:1.22", "", "restarting", "Restarting (1) 8 seconds ago", 0, 0, 0, 0, 0, "1 month ago"),
    ]),
}

def host_from(args):
    joined = " ".join(args)
    for h in HOSTS:
        if h in joined or (h == "edge" and "10.0.4.12" in joined):
            return h
    return "homelab"

def ps(h):
    for c in HOSTS[h]["containers"]:
        name, image, project, state, status = c[0], c[1], c[2], c[3], c[4]
        labels = []
        if project:
            labels = ["com.docker.compose.project=" + project, "com.docker.compose.service=" + name.split("-")[1],
                      "com.docker.compose.project.working_dir=/srv/" + project,
                      "com.docker.compose.project.config_files=/srv/" + project + "/compose.yaml"]
        print(json.dumps({"ID": cid(h + name), "Names": name, "Image": image, "State": state, "Status": status,
                          "Labels": ",".join(labels), "CreatedAt": "2026-11-01 10:00:00 +0100 CET",
                          "RunningFor": c[10], "Ports": "0.0.0.0:443->443/tcp" if "web" in name or name == "traefik" else ""}))

def fmt_size(b):
    for u in ["B", "kB", "MB", "GB"]:
        if b < 1000:
            return "%.3g%s" % (b, u)
        b /= 1000
    return "%.3gTB" % b

def stats(h):
    total = HOSTS[h]["mem"]
    for c in HOSTS[h]["containers"]:
        if c[3] != "running":
            continue
        limit = c[7] * 1024**2 if c[7] else total
        wobble = 1 + 0.08 * ((int(NOW) // 3 + len(c[0])) % 5 - 2)
        print(json.dumps({"Container": cid(h + c[0]), "ID": cid(h + c[0]), "Name": c[0],
                          "CPUPerc": "%.2f%%" % (c[5] * wobble), "MemUsage": "%.1fMiB / %.2fGiB" % (c[6], limit / 1024**3),
                          "MemPerc": "%.2f%%" % (100 * c[6] * 1024**2 / limit),
                          "NetIO": "%dB / %dB" % (c[8] * 1000 * (NOW % 1e6), c[9] * 1000 * (NOW % 1e6)),
                          "BlockIO": "0B / 0B", "PIDs": "12"}))

def ts(sec_ago):
    return datetime.datetime.fromtimestamp(NOW - sec_ago, datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")

def logs(args):
    if "--since" in args:
        return
    lines = []
    for i in range(40, 0, -1):
        if i % 4 == 0:
            lines.append(json.dumps({"level": "info", "msg": "GET /api/orders", "status": 200, "ms": 12 + i}))
        elif i % 4 == 1:
            lines.append(json.dumps({"level": "error", "msg": "payment provider timeout", "url": "https://payments.example.com/v2/charge", "retry": i % 3}))
        elif i % 4 == 2:
            lines.append("checkpoint complete: wrote %d buffers (0.%d%%); see https://www.postgresql.org/docs/16/wal-configuration.html" % (30 + i, i % 9))
        else:
            lines.append("worker heartbeat ok, queue depth %d" % (i * 3))
    for i, l in enumerate(lines):
        print(ts((len(lines) - i) * 7) + " " + l)

def proc(h):
    cores = HOSTS[h]["cores"]
    t = NOW * 100
    busy = {"homelab": 0.32, "nas": 0.55, "edge": 0.12}[h]
    total = int(t * cores)
    idle = int(total * (1 - busy))
    print("cpu  %d 0 %d %d 0 0 0 0 0 0" % ((total - idle) * 3 // 4, (total - idle) // 4, idle))
    for i in range(cores):
        print("cpu%d 1 0 1 1 0 0 0 0 0 0" % i)
    memk = HOSTS[h]["mem"] // 1024
    print("MemTotal: %d kB" % memk)
    print("MemAvailable: %d kB" % int(memk * {"homelab": 0.42, "nas": 0.25, "edge": 0.7}[h]))
    print("SwapTotal: %d kB" % (4 * 1024 * 1024))
    print("SwapFree: %d kB" % (3 * 1024 * 1024))
    print("%s 3/1234 5678" % {"homelab": "2.84 2.61 2.40", "nas": "3.91 3.70 3.55", "edge": "0.42 0.38 0.40"}[h])
    print("%d.00 1.00" % {"homelab": 8 * 86400 + 9 * 3600, "nas": 41 * 86400 + 7200, "edge": 2 * 86400}[h])
    rx, tx = {"homelab": (2.7e6, 1.9e6), "nas": (4.8e6, 9.6e6), "edge": (2.2e6, 2.4e6)}[h]
    print("Inter-|   Receive\n face |bytes")
    print("  eth0: %d 0 0 0 0 0 0 0 %d 0 0 0 0 0 0 0" % (int(rx * (NOW % 1e6)), int(tx * (NOW % 1e6))))

def main():
    me = os.path.basename(sys.argv[0])
    args = sys.argv[1:]
    if me == "ssh":
        proc(host_from(args))
        return
    h = host_from(args)
    rest = [a for a in args if a not in ("-H",) and not a.startswith(("ssh://", "tcp://"))]
    cmd = rest[0] if rest else ""
    if cmd == "ps": ps(h)
    elif cmd == "stats": stats(h)
    elif cmd == "info": print("%d %d" % (HOSTS[h]["cores"], HOSTS[h]["mem"]))
    elif cmd == "logs": logs(args)
    elif cmd == "compose": logs(args)
    elif cmd == "inspect": print("{}")

main()

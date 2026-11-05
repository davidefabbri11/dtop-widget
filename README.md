# dtop Plasma widget

A KDE Plasma 6 widget (`it.df.dtop`) that does what the [`dtop`](https://github.com/amir20/dtop) terminal app does: monitor Docker containers across hosts, sort and filter them, read logs, and start/stop/restart/remove them.

It drives the `docker` CLI (Docker 29), so anything `docker -H …` can reach works.

## Install / upgrade

```bash
kpackagetool6 -t Plasma/Applet -i it.df.dtop   # first time
kpackagetool6 -t Plasma/Applet -u it.df.dtop   # after changes
```

Then add "dtop" to a panel or the desktop.
To try it in a window: `plasmawindowed it.df.dtop`.

## Tests

```bash
npm test
```

Pure logic lives in `it.df.dtop/contents/code/*.js` and is tested with `node --test`.
QML can be linted with `/usr/lib/qt6/bin/qmllint it.df.dtop/contents/ui/*.qml`.

## Hosts setting

One host per line:

```
<endpoint> [name=<label>] [dozzle=<url>] [certs=<dir>] [filter=<key=value>]...
```

- Endpoints: `local` (follows `DOCKER_HOST` / the active `docker context`), `unix://…`, `ssh://user@host[:port]`, `tcp://host:port`, `tls://host:port`.
- `certs=` is the directory holding `ca.pem`, `cert.pem`, `key.pem` for `tls://` (default `~/.docker`).
- `filter=` is passed to `docker ps --filter`; repeat it for several filters (same key = OR, different keys = AND).
- `#` starts a comment.

SSH hosts must work non-interactively (key auth / agent); a host that hangs times out after 5 × the refresh interval and shows its error.

## Mapping from `~/.config/dtop/config.yaml`

| dtop | widget |
|---|---|
| `hosts[].host` / `name` / `dozzle` / `filter` | Hosts setting line: `<host> name=… dozzle=… filter=…` |
| `all` | "Show all" toolbar toggle |
| `sort`, `sort_direction` | Click a column header (again to reverse) |
| `columns` | "Columns" toolbar menu |
| `stats_header` | Settings → Host stats header |
| `icons`, `hyperlinks` | Not applicable |

## Using it

- Panel: icon + `running/total`; a red dot means an unreachable host or an unhealthy container.
- Popup: search field, per-host summary, sortable table.
- Mouse: click, Ctrl-click, Shift-click to select; right-click for the action menu; double-click for logs.
- Keyboard: Up/Down or j/k, PageUp/PageDown, Home/End; Enter opens the action menu; Right arrow opens logs; Esc/Left goes back.
- Action menu: Logs, Details (`docker inspect`), Start, Stop, Restart, Remove (with confirmation), Open shell (in the configured terminal), Open in Dozzle, Select compose project.
  Actions apply to the whole selection when the clicked row is part of it.
- Logs: last N lines (Settings → Log lines per page), "Load older" pages backwards, Follow appends new lines, JSON toggle colourises JSON log lines.
- Group (toolbar): groups the table by Compose project (`com.docker.compose.project`), one collapsible header per host and project; containers without a project go under "No compose project".
  Header: status (`running N/M` counts all of the project's containers), CPU/memory, and ▶ Start, ■ Stop, ⟳ Restart, ⋯ (or right-click) for the project menu: Start, Up (apply changes), Stop, Restart, Pause, Unpause, Pull images, Build, Recreate, Project logs, Select all containers, Down… (confirmation, optional `-v`).
  Up, Pull, Build and Recreate need the compose files: they use the file set (`working_dir` + `config_files` labels) shared by most of the project's containers, run over `ssh` on `ssh://` hosts, and are disabled on `tcp://`/`tls://` hosts.
  Containers in a collapsed group are never targeted by container actions.

## Known limitations

- `docker stats` rounds network/disk counters to 3 significant figures (`35MB`), so low rates jump between 0 and bursts.
- Stats (CPU, memory, I/O) are only collected while the popup is open; the panel only needs container counts.
- The Dozzle link format is `<dozzle>/container/<short id>`; it was not verified against a live Dozzle.
- A project disappears from the grouped view after Down: the list comes from existing containers (same as `docker compose ls`).
- Project actions act on every container of the project, including ones hidden by the host's `filter=` options.
- No live output for Pull/Build/Up: the result (or error) shows when the command exits.

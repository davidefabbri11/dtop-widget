import QtQuick
import org.kde.plasma.components as PlasmaComponents

// dtop's action menu. Container actions apply to `targets` (selection or clicked row).
PlasmaComponents.Menu {
    id: menu
    property var row: null
    property var targets: []

    signal logsRequested(var row)
    signal detailsRequested(var row)
    signal removeRequested(var targets)

    readonly property string targetLabel: targets.length > 1 ? " (" + targets.length + ")" : ""
    readonly property var host: row ? root.hostOf(row) : null

    PlasmaComponents.MenuItem {
        text: "Logs"
        icon.name: "view-list-text"
        onTriggered: menu.logsRequested(menu.row)
    }
    PlasmaComponents.MenuItem {
        text: "Details"
        icon.name: "documentinfo"
        onTriggered: menu.detailsRequested(menu.row)
    }
    PlasmaComponents.MenuSeparator {}
    PlasmaComponents.MenuItem {
        text: "Start" + menu.targetLabel
        icon.name: "media-playback-start"
        onTriggered: root.act("start", menu.targets)
    }
    PlasmaComponents.MenuItem {
        text: "Stop" + menu.targetLabel
        icon.name: "media-playback-stop"
        onTriggered: root.act("stop", menu.targets)
    }
    PlasmaComponents.MenuItem {
        text: "Restart" + menu.targetLabel
        icon.name: "view-refresh"
        onTriggered: root.act("restart", menu.targets)
    }
    PlasmaComponents.MenuItem {
        text: "Remove" + menu.targetLabel + "…"
        icon.name: "edit-delete"
        onTriggered: menu.removeRequested(menu.targets)
    }
    PlasmaComponents.MenuSeparator {}
    PlasmaComponents.MenuItem {
        text: "Open shell"
        icon.name: "utilities-terminal"
        enabled: !!menu.row && menu.row.state === "running"
        onTriggered: root.openShell(menu.row)
    }
    PlasmaComponents.MenuItem {
        text: "Open in Dozzle"
        icon.name: "internet-web-browser"
        enabled: !!menu.host && menu.host.dozzle.length > 0
        onTriggered: root.openDozzle(menu.row)
    }
    PlasmaComponents.MenuItem {
        text: menu.row && menu.row.compose ? "Select compose project “" + menu.row.compose + "”" : "Select compose project"
        icon.name: "edit-select-all"
        enabled: !!menu.row && menu.row.compose.length > 0
        onTriggered: {
            var s = {};
            root.rows.forEach(function (r) {
                if (r.host === menu.row.host && r.compose === menu.row.compose) s[r.key] = true;
            });
            root.selection = s;
        }
    }
}

import QtQuick
import org.kde.plasma.components as PlasmaComponents
import "../code/commands.js" as Cmd

// Compose project actions for one group header (`group` is a model.js group item).
PlasmaComponents.Menu {
    id: menu
    property var group: null
    readonly property var host: group ? root.hostOf({ host: group.host }) : null
    readonly property var fileSet: group ? Cmd.pickFileSet(group.rows) : null

    signal logsRequested(var group)
    signal downRequested(var group)

    // File-based actions name the file set they use when the project has several,
    // and say why they can't run (tcp/tls host, no file labels).
    function label(action, base) {
        if (!group || !host) return base;
        var why = Cmd.composeUnavailable(host, action, fileSet);
        if (why) return base + " — " + why;
        if (Cmd.needsFiles(action) && fileSet.others > 0) return base + " (" + Cmd.fileSetLabel(fileSet) + ")";
        return base;
    }

    function tip(action) {
        if (!group || !host || !Cmd.needsFiles(action) || !fileSet || fileSet.others === 0) return "";
        return fileSet.others + " container(s) of this project come from other compose files and are left as they are.";
    }

    function allowed(action) {
        if (!group || !host || root.busyGroups[group.key]) return false;
        if (Cmd.composeUnavailable(host, action, fileSet)) return false;
        if (action === "stop" || action === "pause") return group.running > 0;
        if (action === "unpause") return group.paused > 0;
        if (action === "start") return group.running < group.total;
        return true;
    }

    component ActionItem: PlasmaComponents.MenuItem {
        property string composeAction
        property string baseText
        text: menu.label(composeAction, baseText)
        enabled: menu.allowed(composeAction)
        onTriggered: root.composeAct(menu.group, composeAction)
        PlasmaComponents.ToolTip.text: menu.tip(composeAction)
        PlasmaComponents.ToolTip.visible: hovered && menu.tip(composeAction).length > 0
    }

    ActionItem { composeAction: "start"; baseText: "Start"; icon.name: "media-playback-start" }
    ActionItem { composeAction: "up"; baseText: "Up (apply changes)"; icon.name: "go-up" }
    ActionItem { composeAction: "stop"; baseText: "Stop"; icon.name: "media-playback-stop" }
    ActionItem { composeAction: "restart"; baseText: "Restart"; icon.name: "view-refresh" }
    ActionItem { composeAction: "pause"; baseText: "Pause"; icon.name: "media-playback-pause" }
    ActionItem { composeAction: "unpause"; baseText: "Unpause"; icon.name: "media-playback-start" }
    PlasmaComponents.MenuSeparator {}
    ActionItem { composeAction: "pull"; baseText: "Pull images"; icon.name: "download" }
    ActionItem { composeAction: "build"; baseText: "Build"; icon.name: "run-build" }
    ActionItem { composeAction: "recreate"; baseText: "Recreate"; icon.name: "view-refresh" }
    PlasmaComponents.MenuSeparator {}
    PlasmaComponents.MenuItem {
        text: "Project logs"
        icon.name: "view-list-text"
        onTriggered: menu.logsRequested(menu.group)
    }
    PlasmaComponents.MenuItem {
        text: "Select all containers"
        icon.name: "edit-select-all"
        onTriggered: {
            var s = {};
            menu.group.rows.forEach(function (r) { s[r.key] = true; });
            root.selection = s;
        }
    }
    PlasmaComponents.MenuSeparator {}
    PlasmaComponents.MenuItem {
        text: "Down…"
        icon.name: "edit-delete"
        enabled: !!menu.group && !root.busyGroups[menu.group.key]
        onTriggered: menu.downRequested(menu.group)
    }
}

import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2
import org.kde.plasma.plasmoid
import org.kde.plasma.components as PlasmaComponents
import org.kde.plasma.extras as PlasmaExtras
import org.kde.kirigami as Kirigami
import "../code/logs.js" as Logs

PlasmaExtras.Representation {
    id: full
    readonly property real columnsWidth: root.visibleColumns.reduce(function (a, c) { return a + c.width; }, 0)
                                         * Kirigami.Units.gridUnit
    Layout.minimumWidth: Kirigami.Units.gridUnit * 30
    Layout.preferredWidth: Math.max(Layout.minimumWidth, columnsWidth + Kirigami.Units.gridUnit * 2)
                           + (logsMode === "side" ? Kirigami.Units.gridUnit * 24 : 0)

    property string logsMode: "closed"     // "closed" | "side" (beside the table) | "max" (table hidden)
    property string shownKey: ""           // row key in the log panel; "" for project logs
    Binding { target: root; property: "compactTable"; value: full.logsMode === "side" }
    Layout.minimumHeight: Kirigami.Units.gridUnit * 16
    Layout.preferredHeight: Kirigami.Units.gridUnit * 28
    collapseMarginsHint: true

    function toggleColumn(id) {
        var cols = Plasmoid.configuration.columns.slice();
        var i = cols.indexOf(id);
        if (i >= 0) { if (cols.length > 1) cols.splice(i, 1); }
        else cols.push(id);
        // Keep catalogue order so toggling never reshuffles columns.
        Plasmoid.configuration.columns = root.allColumns
            .map(function (c) { return c.id; })
            .filter(function (c) { return cols.indexOf(c) >= 0; });
    }

    header: PlasmaExtras.PlasmoidHeading {
        contentItem: RowLayout {
            PlasmaExtras.SearchField {
                id: search
                Layout.fillWidth: true
                onTextChanged: root.searchText = text
                Keys.onDownPressed: table.focusList()
            }
            PlasmaComponents.ToolButton {
                icon.name: Plasmoid.configuration.showAll ? "view-visible" : "view-hidden"
                text: "Show all"
                checkable: true
                checked: Plasmoid.configuration.showAll
                onToggled: Plasmoid.configuration.showAll = checked
                PlasmaComponents.ToolTip.text: "Show stopped containers too"
            }
            PlasmaComponents.ToolButton {
                icon.name: "view-group"
                text: "Group"
                checkable: true
                checked: Plasmoid.configuration.groupByCompose
                onToggled: Plasmoid.configuration.groupByCompose = checked
                PlasmaComponents.ToolTip.text: "Group containers by Compose project"
            }
            PlasmaComponents.ToolButton {
                id: columnsButton
                icon.name: "view-list-details"
                text: "Columns"
                onClicked: columnsMenu.popup(columnsButton, 0, columnsButton.height)
                PlasmaComponents.Menu {
                    id: columnsMenu
                    Repeater {
                        model: root.allColumns
                        delegate: PlasmaComponents.MenuItem {
                            text: modelData.title
                            checkable: true
                            checked: Plasmoid.configuration.columns.indexOf(modelData.id) >= 0
                            onTriggered: full.toggleColumn(modelData.id)
                        }
                    }
                }
            }
            PlasmaComponents.ToolButton {
                icon.name: "configure"
                display: PlasmaComponents.AbstractButton.IconOnly
                text: "Configure…"
                onClicked: Plasmoid.internalAction("configure").trigger()
                PlasmaComponents.ToolTip.text: text
            }
        }
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: Kirigami.Units.smallSpacing

        Kirigami.InlineMessage {
            Layout.fillWidth: true
            type: Kirigami.MessageType.Error
            // No built-in close button: it would assign visible=false and break this binding.
            visible: root.actionError.length > 0
            text: Logs.asRichText(root.actionError)
            actions: [
                Kirigami.Action {
                    icon.name: "dialog-close"
                    text: "Dismiss"
                    onTriggered: root.actionError = ""
                }
            ]
        }

        Repeater {
            model: root.hosts
            delegate: HostHeader {
                // Errors are shown even with the stats header off: an unreachable host must never look empty.
                visible: Plasmoid.configuration.statsHeader || hs.status === "error"
                Layout.fillWidth: true
                Layout.leftMargin: Kirigami.Units.smallSpacing
                host: modelData
                summary: root.summaries[index]
            }
        }

        StackLayout {
            id: pages
            Layout.fillWidth: true
            Layout.fillHeight: true
            currentIndex: 0     // 0 table (+ log panel), 1 details

            QQC2.SplitView {
                orientation: Qt.Horizontal

                ContainerTable {
                    id: table
                    visible: full.logsMode !== "max"
                    clip: true      // the column header row is as wide as all columns
                    QQC2.SplitView.fillWidth: true
                    QQC2.SplitView.minimumWidth: Kirigami.Units.gridUnit * 16
                    onMenuRequested: function (row, item, x, y) {
                        actionMenu.row = row;
                        actionMenu.targets = table.targetRows(row);
                        actionMenu.popup(item, x, y);
                    }
                    onLogsRequested: function (row) { full.showLogs(row); }
                    onProjectMenuRequested: function (group, item, x, y) {
                        projectMenu.group = group;
                        projectMenu.popup(item, x, y);
                    }
                    logsOpen: full.logsMode !== "closed"
                    onCloseLogsRequested: full.closeLogs()
                    // While the panel is open the logs follow the current row once it stops moving.
                    // currentKey (not currentRow) so the per-poll row refresh never counts as a move.
                    onCurrentKeyChanged: if (full.logsMode !== "closed") followTimer.restart()
                }

                LogView {
                    id: logView
                    visible: full.logsMode !== "closed"
                    maximized: full.logsMode === "max"
                    QQC2.SplitView.fillWidth: full.logsMode === "max"
                    // Shrinks toward its 20-unit minimum in a narrow popup so the table can keep its 16 grid units.
                    QQC2.SplitView.preferredWidth: Math.max(Kirigami.Units.gridUnit * 20,
                        Math.min(Kirigami.Units.gridUnit * 24, parent.width - Kirigami.Units.gridUnit * 16))
                    QQC2.SplitView.minimumWidth: Kirigami.Units.gridUnit * 20  // room for 7 toolbar buttons and the title
                    onCloseRequested: full.closeLogs()
                    onMaximizeToggled: {
                        full.logsMode = full.logsMode === "max" ? "side" : "max";
                        if (full.logsMode === "side") table.focusList(); else logView.focusList();
                    }
                    onLeave: table.focusList()
                }
            }

            DetailsView {
                id: detailsView
                onBack: full.showTable()
            }
        }

        Timer {
            id: followTimer
            interval: 300
            onTriggered: {
                var r = table.currentRow;
                if (full.logsMode === "closed" || !r || r.key === full.shownKey) return;
                full.shownKey = r.key;
                logView.open(r);
            }
        }
    }

    ActionMenu {
        id: actionMenu
        onLogsRequested: function (row) { full.showLogs(row); }
        onDetailsRequested: function (row) { detailsView.row = row; pages.currentIndex = 1; detailsView.forceActiveFocus(); }
        onRemoveRequested: function (targets) { removeDialog.targets = targets; removeDialog.open(); }
    }

    ProjectMenu {
        id: projectMenu
        onLogsRequested: function (group) { full.showLogs({ project: group.project, host: group.host, name: group.project }); }
        onDownRequested: function (group) {
            downDialog.group = group;
            volumesBox.checked = false;
            downDialog.open();
        }
    }

    Kirigami.Dialog {
        id: downDialog
        property var group: null
        readonly property var host: group ? root.hostOf({ host: group.host }) : null
        title: group ? "Down “" + group.project + "”?" : ""
        standardButtons: Kirigami.Dialog.Ok | Kirigami.Dialog.Cancel
        padding: Kirigami.Units.largeSpacing
        onAccepted: root.composeAct(group, volumesBox.checked ? "downVolumes" : "down")

        ColumnLayout {
            PlasmaComponents.Label {
                text: downDialog.group ? "Stops and removes " + downDialog.group.total + " containers and the project network." : ""
            }
            PlasmaComponents.Label {
                visible: !!downDialog.host && downDialog.host.filters.length > 0
                text: "This host has filters; containers hidden by them are affected too."
                color: Kirigami.Theme.neutralTextColor
            }
            PlasmaComponents.CheckBox {
                id: volumesBox
                text: "Also remove volumes (-v)"
            }
        }
    }

    Kirigami.PromptDialog {
        id: removeDialog
        property var targets: []
        title: "Remove container" + (targets.length > 1 ? "s" : "") + "?"
        subtitle: Logs.asRichText(targets.map(function (r) { return r.name + " (" + r.host + ")"; }).join("\n"))
        standardButtons: Kirigami.Dialog.Ok | Kirigami.Dialog.Cancel
        onAccepted: root.act("rm", targets)
    }

    // Back from Details: the log panel, if open, stays as it was.
    function showTable() {
        pages.currentIndex = 0;
        detailsView.row = null;
        table.focusList();
    }

    function showLogs(row) {
        pages.currentIndex = 0;
        // Already shown (e.g. Left then Right): keep loaded pages and scroll position.
        if (logsMode !== "closed" && row.key && row.key === shownKey) {
            logView.focusList();
            return;
        }
        if (logsMode === "closed") logsMode = "side";
        followTimer.stop();
        shownKey = row.key || "";
        logView.open(row);
        logView.focusList();
    }

    function closeLogs() {
        if (logsMode === "closed") return;
        followTimer.stop();
        logsMode = "closed";
        shownKey = "";
        logView.close();
        table.focusList();
    }

    Connections {
        target: root
        function onExpandedChanged() {
            if (!root.expanded || pages.currentIndex !== 0) return;
            if (full.logsMode === "max") logView.focusList(); else table.focusList();
        }
    }
}

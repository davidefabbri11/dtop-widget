import QtQuick
import QtQuick.Layouts
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
            currentIndex: 0     // 0 table, 1 details, 2 logs

            ContainerTable {
                id: table
                onMenuRequested: function (row, item, x, y) {
                    actionMenu.row = row;
                    actionMenu.targets = table.targetRows(row);
                    actionMenu.popup(item, x, y);
                }
                onLogsRequested: function (row) { full.showLogs(row); }
            }

            DetailsView {
                id: detailsView
                onBack: full.showTable()
            }

            LogView {
                id: logView
                onBack: full.showTable()
            }
        }
    }

    ActionMenu {
        id: actionMenu
        onLogsRequested: function (row) { full.showLogs(row); }
        onDetailsRequested: function (row) { detailsView.row = row; pages.currentIndex = 1; detailsView.forceActiveFocus(); }
        onRemoveRequested: function (targets) { removeDialog.targets = targets; removeDialog.open(); }
    }

    Kirigami.PromptDialog {
        id: removeDialog
        property var targets: []
        title: "Remove container" + (targets.length > 1 ? "s" : "") + "?"
        subtitle: Logs.asRichText(targets.map(function (r) { return r.name + " (" + r.host + ")"; }).join("\n"))
        standardButtons: Kirigami.Dialog.Ok | Kirigami.Dialog.Cancel
        onAccepted: root.act("rm", targets)
    }

    function showTable() {
        pages.currentIndex = 0;
        detailsView.row = null;
        logView.close();
        table.focusList();
    }

    function showLogs(row) {
        pages.currentIndex = 2;
        logView.open(row);
        logView.focusList();
    }

    Connections {
        target: root
        function onExpandedChanged() { if (root.expanded && pages.currentIndex === 0) table.focusList(); }
    }
}

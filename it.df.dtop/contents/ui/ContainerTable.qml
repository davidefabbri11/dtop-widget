import QtQuick
import QtQuick.Layouts
import org.kde.plasma.plasmoid
import org.kde.plasma.components as PlasmaComponents
import org.kde.kirigami as Kirigami
import "../code/model.js" as Model

// Sortable container table with dtop-style selection and keyboard navigation.
ColumnLayout {
    id: table
    spacing: 0

    signal menuRequested(var row, Item item, real x, real y)
    signal logsRequested(var row)

    property string currentKey: ""
    property string anchorKey: ""

    readonly property var rows: root.visibleRows
    readonly property var currentRow: {
        var i = indexOfKey(currentKey);
        return i >= 0 ? rows[i] : null;
    }

    function indexOfKey(key) {
        for (var i = 0; i < rows.length; i++) if (rows[i].key === key) return i;
        return -1;
    }

    // Rows the action applies to; selected rows hidden by search/Show all are excluded.
    function targetRows(row) {
        return Model.actionTargets(row, root.selection, rows);
    }

    function selectOnly(row) {
        var s = {};
        s[row.key] = true;
        root.selection = s;
        anchorKey = row.key;
    }

    function clickRow(index, mouse) {
        var row = rows[index];
        currentKey = row.key;
        list.currentIndex = index;
        list.forceActiveFocus();
        if (mouse.button === Qt.RightButton) {
            if (!root.selection[row.key]) selectOnly(row);
            return;
        }
        if (mouse.modifiers & Qt.ShiftModifier) {
            var a = Math.max(0, indexOfKey(anchorKey));
            var s = {};
            for (var i = Math.min(a, index); i <= Math.max(a, index); i++) s[rows[i].key] = true;
            root.selection = s;
        } else if (mouse.modifiers & Qt.ControlModifier) {
            var t = Object.assign({}, root.selection);
            if (t[row.key]) delete t[row.key]; else t[row.key] = true;
            root.selection = t;
            anchorKey = row.key;
        } else {
            selectOnly(row);
        }
    }

    function moveTo(index) {
        if (rows.length === 0) return;
        index = Math.max(0, Math.min(rows.length - 1, index));
        list.currentIndex = index;
        currentKey = rows[index].key;
        selectOnly(rows[index]);
        list.positionViewAtIndex(index, ListView.Contain);
    }

    function sortBy(id) {
        if (Plasmoid.configuration.sortKey === id) {
            Plasmoid.configuration.sortDesc = !Plasmoid.configuration.sortDesc;
        } else {
            Plasmoid.configuration.sortKey = id;
            Plasmoid.configuration.sortDesc = false;
        }
    }

    // Keep the highlighted row on the same container across polls and re-sorts.
    // callLater: a changed int model resets the view (currentIndex -> 0) after this handler may have run.
    onRowsChanged: Qt.callLater(function () { list.currentIndex = table.indexOfKey(table.currentKey); })

    Row {
        Layout.fillWidth: true
        Repeater {
            model: root.visibleColumns
            delegate: MouseArea {
                width: modelData.width * Kirigami.Units.gridUnit
                height: headerLabel.implicitHeight + Kirigami.Units.smallSpacing * 2
                cursorShape: Qt.PointingHandCursor
                onClicked: table.sortBy(modelData.id)
                PlasmaComponents.Label {
                    id: headerLabel
                    anchors.fill: parent
                    anchors.leftMargin: Kirigami.Units.smallSpacing
                    verticalAlignment: Text.AlignVCenter
                    elide: Text.ElideRight
                    font.bold: true
                    text: modelData.title + (Plasmoid.configuration.sortKey === modelData.id
                                             ? (Plasmoid.configuration.sortDesc ? " ▼" : " ▲") : "")
                }
            }
        }
    }

    Kirigami.Separator { Layout.fillWidth: true }

    PlasmaComponents.ScrollView {
        Layout.fillWidth: true
        Layout.fillHeight: true

        ListView {
            id: list
            clip: true
            focus: true
            currentIndex: -1
            highlightFollowsCurrentItem: false
            keyNavigationEnabled: false
            // An int model keeps delegates (and scroll position) alive across polls;
            // delegates read their row from root.visibleRows.
            model: table.rows.length
            delegate: ContainerRow {
                width: ListView.view.width
                row: table.rows[index]
                selected: !!root.selection[row.key]
                current: ListView.isCurrentItem && list.activeFocus
                stale: !!root.hostState[row.host] && root.hostState[row.host].status === "error"
                onClicked: function (mouse, item) {
                    table.clickRow(index, mouse);
                    if (mouse.button === Qt.RightButton) table.menuRequested(row, item, mouse.x, mouse.y);
                }
                onDoubleClicked: table.logsRequested(row)
            }

            Keys.onPressed: function (event) {
                var page = Math.max(1, Math.floor(list.height / (Kirigami.Units.gridUnit * 1.4)) - 1);
                var i = list.currentIndex;
                switch (event.key) {
                case Qt.Key_Down: case Qt.Key_J: table.moveTo(i + 1); break;
                case Qt.Key_Up: case Qt.Key_K: table.moveTo(i - 1); break;
                case Qt.Key_PageDown: table.moveTo(i + page); break;
                case Qt.Key_PageUp: table.moveTo(i - page); break;
                case Qt.Key_Home: table.moveTo(0); break;
                case Qt.Key_End: table.moveTo(table.rows.length - 1); break;
                case Qt.Key_Return: case Qt.Key_Enter:
                    if (table.currentRow && list.currentItem)
                        table.menuRequested(table.currentRow, list.currentItem, Kirigami.Units.gridUnit * 4, list.currentItem.height);
                    break;
                case Qt.Key_Right:
                    if (table.currentRow) table.logsRequested(table.currentRow);
                    break;
                default: return;
                }
                event.accepted = true;
            }
        }
    }

    PlasmaComponents.Label {
        visible: table.rows.length === 0
        Layout.alignment: Qt.AlignHCenter
        Layout.margins: Kirigami.Units.largeSpacing
        opacity: 0.6
        textFormat: Text.PlainText
        text: root.searchText ? "No containers match “" + root.searchText + "”" : "No containers"
    }

    function focusList() { list.forceActiveFocus(); }
}

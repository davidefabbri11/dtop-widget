import QtQuick
import org.kde.plasma.components as PlasmaComponents
import org.kde.kirigami as Kirigami
import "../code/format.js" as Format
import "../code/model.js" as Model

// One table row. `row` is a model.js Row; cells follow root.visibleColumns.
Rectangle {
    id: rowItem
    property var row
    property bool selected: false
    property bool current: false
    property bool stale: false
    signal clicked(var mouse, Item item)
    signal doubleClicked()

    height: Kirigami.Units.gridUnit * 1.4
    color: selected ? Qt.alpha(Kirigami.Theme.highlightColor, 0.35)
                    : (hover.hovered ? Qt.alpha(Kirigami.Theme.highlightColor, 0.12) : "transparent")
    border.width: current ? 1 : 0
    border.color: Kirigami.Theme.highlightColor
    opacity: stale ? 0.5 : 1

    function statusColor() {
        var rank = Model.statusRank(row);
        if (rank <= 3) return Kirigami.Theme.negativeTextColor;
        if (rank <= 6) return Kirigami.Theme.neutralTextColor;
        if (rank === 7) return Kirigami.Theme.disabledTextColor;
        return Kirigami.Theme.positiveTextColor;
    }

    HoverHandler { id: hover }

    Row {
        anchors.fill: parent
        Repeater {
            model: root.visibleColumns
            delegate: Item {
                width: modelData.width * Kirigami.Units.gridUnit
                height: rowItem.height

                Rectangle {
                    visible: modelData.id === "status"
                    anchors.centerIn: parent
                    width: Kirigami.Units.smallSpacing * 2.5
                    height: width
                    radius: width / 2
                    color: rowItem.statusColor()
                }
                PlasmaComponents.Label {
                    visible: modelData.id !== "status"
                    anchors.fill: parent
                    anchors.leftMargin: Kirigami.Units.smallSpacing
                    anchors.rightMargin: Kirigami.Units.smallSpacing
                    verticalAlignment: Text.AlignVCenter
                    elide: Text.ElideRight
                    textFormat: Text.PlainText
                    text: Format.formatCell(rowItem.row, modelData.id)
                    font.family: modelData.id === "id" ? "monospace" : Kirigami.Theme.defaultFont.family
                }
                HoverHandler { id: cellHover }
                PlasmaComponents.ToolTip.visible: cellHover.hovered && (modelData.id === "status" || modelData.id === "name")
                PlasmaComponents.ToolTip.delay: Kirigami.Units.toolTipDelay
                PlasmaComponents.ToolTip.text: modelData.id === "status"
                    ? rowItem.row.status + (rowItem.row.health ? " — " + rowItem.row.health : "")
                    : rowItem.row.image + (rowItem.row.ports ? "\n" + rowItem.row.ports : "")
            }
        }
    }

    MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        onClicked: function (mouse) { rowItem.clicked(mouse, rowItem); }
        onDoubleClicked: rowItem.doubleClicked()
    }
}

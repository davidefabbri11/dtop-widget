import QtQuick
import QtQuick.Layouts
import org.kde.plasma.components as PlasmaComponents
import org.kde.kirigami as Kirigami
import "../code/format.js" as Format

// Compose project header row in the grouped table. `group` is a model.js group item.
Rectangle {
    id: header
    property var group
    property bool busy: false
    readonly property bool isProject: group.project.length > 0
    signal toggled()
    signal actionRequested(string action)
    signal menuRequested(Item item, real x, real y)

    height: Kirigami.Units.gridUnit * 1.6
    color: hover.hovered ? Qt.alpha(Kirigami.Theme.highlightColor, 0.12) : Qt.alpha(Kirigami.Theme.textColor, 0.06)

    function statusText() {
        if (group.running > 0) return "running " + group.running + "/" + group.total;
        if (group.paused > 0) return "paused " + group.paused + "/" + group.total;
        return "exited 0/" + group.total;
    }

    function statusColor() {
        if (group.running > 0) return Kirigami.Theme.positiveTextColor;
        if (group.paused > 0) return Kirigami.Theme.neutralTextColor;
        return Kirigami.Theme.disabledTextColor;
    }

    HoverHandler { id: hover }

    // Below the buttons, so their clicks don't toggle the group.
    MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        onClicked: function (mouse) {
            if (mouse.button === Qt.RightButton) {
                if (header.isProject) header.menuRequested(header, mouse.x, mouse.y);
            } else {
                header.toggled();
            }
        }
    }

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: Kirigami.Units.smallSpacing
        anchors.rightMargin: Kirigami.Units.smallSpacing
        spacing: Kirigami.Units.smallSpacing

        PlasmaComponents.Label {
            text: header.group.collapsed ? "▸" : "▾"
        }
        PlasmaComponents.Label {
            text: header.isProject ? header.group.project : "No compose project"
            textFormat: Text.PlainText
            font.bold: true
            font.italic: !header.isProject
        }
        PlasmaComponents.Label {
            text: header.group.host
            textFormat: Text.PlainText
            opacity: 0.6
        }
        PlasmaComponents.Label {
            text: header.statusText()
            color: header.statusColor()
        }
        PlasmaComponents.Label {
            visible: header.group.cpu > 0
            text: "CPU " + Format.formatPercent(header.group.cpu) + "   Mem " + Format.formatBytes(header.group.memUsed)
            opacity: 0.8
        }
        PlasmaComponents.BusyIndicator {
            visible: header.busy
            running: header.busy
            Layout.preferredHeight: Kirigami.Units.iconSizes.small
            Layout.preferredWidth: Layout.preferredHeight
        }
        PlasmaComponents.Label {
            visible: header.busy
            text: "working…"
            opacity: 0.6
        }
        Item { Layout.fillWidth: true }

        Repeater {
            model: header.isProject ? [
                { action: "start", icon: "media-playback-start", tip: "Start" },
                { action: "stop", icon: "media-playback-stop", tip: "Stop" },
                { action: "restart", icon: "view-refresh", tip: "Restart" }
            ] : []
            delegate: PlasmaComponents.ToolButton {
                icon.name: modelData.icon
                display: PlasmaComponents.AbstractButton.IconOnly
                text: modelData.tip
                enabled: !header.busy
                Layout.preferredHeight: header.height
                onClicked: header.actionRequested(modelData.action)
                PlasmaComponents.ToolTip.text: text
            }
        }
        PlasmaComponents.ToolButton {
            id: moreButton
            visible: header.isProject
            icon.name: "overflow-menu"
            display: PlasmaComponents.AbstractButton.IconOnly
            text: "More actions"
            enabled: !header.busy
            Layout.preferredHeight: header.height
            onClicked: header.menuRequested(moreButton, 0, moreButton.height)
            PlasmaComponents.ToolTip.text: text
        }
    }
}

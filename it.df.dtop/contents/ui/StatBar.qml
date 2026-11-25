import QtQuick
import org.kde.kirigami as Kirigami
import "../code/format.js" as Format

// Horizontal usage bar, coloured by Format.level (green / amber / red).
Rectangle {
    id: bar
    property var percent: null

    implicitWidth: Kirigami.Units.gridUnit * 5
    implicitHeight: Math.round(Kirigami.Units.gridUnit * 0.6)
    radius: 2
    color: Qt.alpha(Kirigami.Theme.textColor, 0.12)

    function levelColor(level) {
        if (level === "high") return Kirigami.Theme.negativeTextColor;
        if (level === "warn") return Kirigami.Theme.neutralTextColor;
        return Kirigami.Theme.positiveTextColor;
    }

    Rectangle {
        anchors.left: parent.left
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        radius: parent.radius
        width: bar.percent === null ? 0 : parent.width * Math.max(0, Math.min(1, bar.percent / 100))
        color: bar.levelColor(Format.level(bar.percent))
    }
}

import QtQuick
import QtQuick.Layouts
import org.kde.plasma.components as PlasmaComponents
import org.kde.kirigami as Kirigami

MouseArea {
    id: compact
    Layout.minimumWidth: row.implicitWidth + Kirigami.Units.smallSpacing * 2
    onClicked: root.expanded = !root.expanded

    RowLayout {
        id: row
        anchors.fill: parent
        spacing: Kirigami.Units.smallSpacing

        Kirigami.Icon {
            source: "yast-docker"
            Layout.preferredWidth: Kirigami.Units.iconSizes.smallMedium
            Layout.preferredHeight: Kirigami.Units.iconSizes.smallMedium

            Rectangle {
                visible: root.errorCount > 0 || root.unhealthyCount > 0
                width: Kirigami.Units.smallSpacing * 2
                height: width
                radius: width / 2
                color: Kirigami.Theme.negativeTextColor
                anchors.right: parent.right
                anchors.top: parent.top
            }
        }

        PlasmaComponents.Label {
            text: root.runningCount + "/" + root.totalCount
        }
    }
}

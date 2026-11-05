import QtQuick
import QtQuick.Layouts
import org.kde.plasma.components as PlasmaComponents
import org.kde.kirigami as Kirigami
import "../code/format.js" as Format

// One summary line per host: counts, CPU, memory, network; or the host's error.
RowLayout {
    id: header
    property var host
    property var summary
    property var hs: root.hostState[host.name] || { status: "loading", error: "" }

    spacing: Kirigami.Units.largeSpacing

    PlasmaComponents.Label {
        text: header.host.name
        textFormat: Text.PlainText
        font.bold: true
    }
    PlasmaComponents.Label {
        visible: header.hs.status === "loading"
        text: "connecting…"
        opacity: 0.6
    }
    PlasmaComponents.Label {
        visible: header.hs.status === "error"
        Layout.fillWidth: true
        text: header.hs.error
        textFormat: Text.PlainText
        color: Kirigami.Theme.negativeTextColor
        elide: Text.ElideRight
        PlasmaComponents.ToolTip.text: header.hs.error
        PlasmaComponents.ToolTip.visible: errorHover.hovered
        HoverHandler { id: errorHover }
    }
    PlasmaComponents.Label {
        visible: header.hs.status !== "loading"
        text: header.summary.running + "/" + header.summary.total + " running"
              + (header.summary.unhealthy > 0 ? " · " + header.summary.unhealthy + " unhealthy" : "")
        color: header.summary.unhealthy > 0 ? Kirigami.Theme.negativeTextColor : Kirigami.Theme.textColor
    }
    PlasmaComponents.Label {
        visible: header.hs.status === "ok"
        text: "CPU " + Format.formatPercent(header.summary.cpu)
              + "   Mem " + Format.formatBytes(header.summary.memUsed)
              + "   ↓ " + Format.formatRate(header.summary.netRxRate)
              + "   ↑ " + Format.formatRate(header.summary.netTxRate)
        opacity: 0.8
    }
    Item { Layout.fillWidth: true; visible: header.hs.status !== "error" }
}

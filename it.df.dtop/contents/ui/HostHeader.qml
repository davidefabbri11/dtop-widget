import QtQuick
import QtQuick.Layouts
import org.kde.plasma.components as PlasmaComponents
import org.kde.kirigami as Kirigami
import "../code/format.js" as Format

// Per host: a System row (the machine, from /proc; local and ssh:// only) and a Docker row
// (its containers), or the host's error. Fixed column widths keep values aligned across hosts.
ColumnLayout {
    id: header
    property var host
    property var summary
    property var hs: root.hostState[host.name] || { status: "loading", error: "" }
    readonly property var sys: root.systemStats[host.name]
    readonly property var sample: sys ? sys.sample : null
    readonly property real gu: Kirigami.Units.gridUnit

    spacing: 0

    function cpuText(percent, cores) {
        return (percent === null ? "—" : Format.formatPercent(percent))
            + (cores ? " of " + cores + " cores" : "");
    }

    function memText(used, total) {
        return Format.formatCompactBytes(used) + (total ? "/" + Format.formatCompactBytes(total) : "");
    }

    function percentOf(used, total) {
        return used === null || !total ? null : 100 * used / total;
    }

    // Inline components only use their own properties: outer ids are not visible inside them.
    component Kind: PlasmaComponents.Label {
        Layout.preferredWidth: Kirigami.Units.gridUnit * 3.5
        color: Kirigami.Theme.highlightColor
        font.bold: true
    }
    component HostName: PlasmaComponents.Label {
        Layout.preferredWidth: Kirigami.Units.gridUnit * 7
        textFormat: Text.PlainText
        elide: Text.ElideRight
    }
    // "CPU [bar] 46.9% of 10 cores" / "MEM [bar] 25.5G/32G"
    component Meter: RowLayout {
        id: meter
        property string label
        property var percent: null
        property string value
        property real valueWidth
        property bool showBar: true
        spacing: Kirigami.Units.smallSpacing
        PlasmaComponents.Label { text: meter.label; color: Kirigami.Theme.highlightColor }
        StatBar {
            percent: meter.percent
            opacity: meter.showBar ? 1 : 0
        }
        PlasmaComponents.Label {
            Layout.preferredWidth: meter.valueWidth
            text: meter.value
            color: {
                var level = Format.level(meter.percent);
                if (level === "high") return Kirigami.Theme.negativeTextColor;
                if (level === "warn") return Kirigami.Theme.neutralTextColor;
                return Kirigami.Theme.textColor;
            }
        }
    }

    // ----- loading / error -----
    RowLayout {
        visible: header.hs.status !== "ok"
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
    }

    // ----- System row -----
    RowLayout {
        visible: header.hs.status === "ok" && !!header.sys
        spacing: Kirigami.Units.largeSpacing
        Kind { text: "System" }
        HostName { text: header.host.name }
        PlasmaComponents.Label {
            visible: !!header.sys && header.sys.status === "error"
            Layout.fillWidth: true
            text: header.sys ? header.sys.error.split("\n")[0] : ""
            textFormat: Text.PlainText
            opacity: 0.6
            elide: Text.ElideRight
            PlasmaComponents.ToolTip.text: header.sys ? header.sys.error : ""
            PlasmaComponents.ToolTip.visible: sysErrorHover.hovered
            HoverHandler { id: sysErrorHover }
        }
        RowLayout {
            visible: !!header.sys && header.sys.status === "ok" && !!header.sample
            spacing: Kirigami.Units.largeSpacing
            Meter {
                label: "CPU"
                percent: header.sample ? header.sample.cpu : null
                value: header.sample ? header.cpuText(header.sample.cpu, header.sample.cores) : ""
                valueWidth: header.gu * 7.5
            }
            Meter {
                label: "MEM"
                percent: header.sample ? header.percentOf(header.sample.memUsed, header.sample.memTotal) : null
                value: header.sample ? header.memText(header.sample.memUsed, header.sample.memTotal) : ""
                valueWidth: header.gu * 5
            }
            PlasmaComponents.Label {
                Layout.preferredWidth: header.gu * 11
                text: header.sample ? "TX " + Format.formatRate(header.sample.netTxRate)
                                      + "   RX " + Format.formatRate(header.sample.netRxRate) : ""
            }
            PlasmaComponents.Label {
                text: !header.sample ? ""
                    : (header.sample.swapTotal ? "Swap " + header.memText(header.sample.swapUsed, header.sample.swapTotal) + "   " : "")
                      + "Load " + Format.formatLoad(header.sample.load)
                      + "   Up " + Format.formatHostUptime(header.sample.uptimeSec)
                opacity: 0.8
            }
        }
        Item { Layout.fillWidth: true }
    }

    // ----- Docker row -----
    RowLayout {
        visible: header.hs.status === "ok"
        spacing: Kirigami.Units.largeSpacing
        Kind { text: "Docker" }
        HostName { text: header.host.name }
        Meter {
            label: "CPU"
            percent: header.summary.cpuOfCores
            showBar: header.summary.cores !== null
            value: header.cpuText(header.summary.cores !== null ? header.summary.cpuOfCores : header.summary.cpu,
                                  header.summary.cores)
            valueWidth: header.gu * 7.5
        }
        Meter {
            label: "MEM"
            percent: header.summary.memPercent
            showBar: header.summary.memTotal !== null
            value: header.memText(header.summary.memUsed, header.summary.memTotal)
            valueWidth: header.gu * 5
        }
        // Lines up with the System row's TX/RX column.
        Item { Layout.preferredWidth: header.gu * 11 }
        PlasmaComponents.Label {
            text: header.summary.running + "/" + header.summary.total + " running"
                  + (header.summary.unhealthy > 0 ? " · " + header.summary.unhealthy + " unhealthy" : "")
            color: header.summary.unhealthy > 0 ? Kirigami.Theme.negativeTextColor : Kirigami.Theme.textColor
        }
        Item { Layout.fillWidth: true }
    }
}

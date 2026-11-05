pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kcmutils as KCM
import org.kde.kirigami as Kirigami
import "../code/hosts.js" as Hosts

KCM.SimpleKCM {
    id: page

    property alias cfg_hosts: hostsField.text
    property alias cfg_refreshSeconds: refreshSpin.value
    property alias cfg_statsHeader: statsHeaderCheck.checked
    property alias cfg_logTail: logTailSpin.value
    property alias cfg_terminalCommand: terminalField.text

    readonly property var problems: Hosts.validateHosts(hostsField.text)

    Kirigami.FormLayout {
        QQC2.TextArea {
            id: hostsField
            Kirigami.FormData.label: "Docker hosts:"
            Layout.preferredWidth: Kirigami.Units.gridUnit * 26
            Layout.preferredHeight: Kirigami.Units.gridUnit * 6
            font.family: "monospace"
            placeholderText: "local"
        }
        QQC2.Label {
            Kirigami.FormData.label: ""
            Layout.maximumWidth: Kirigami.Units.gridUnit * 26
            wrapMode: Text.WordWrap
            font: Kirigami.Theme.smallFont
            opacity: 0.7
            text: "One host per line: <endpoint> [name=…] [dozzle=<url>] [certs=<dir>] [filter=<key=value>]…\n"
                + "Endpoints: local (DOCKER_HOST / docker context), unix://, ssh://user@host[:port], tcp://host:port, tls://host:port "
                + "(certs= directory with ca.pem, cert.pem, key.pem; default ~/.docker). "
                + "Repeat filter= for docker ps filters; # starts a comment.\n"
                + "Example: ssh://me@prod name=prod dozzle=https://dozzle.prod filter=status=running"
        }
        Kirigami.InlineMessage {
            Kirigami.FormData.label: ""
            Layout.preferredWidth: Kirigami.Units.gridUnit * 26
            type: Kirigami.MessageType.Warning
            visible: page.problems.length > 0
            text: page.problems.join("\n")
        }

        Item { Kirigami.FormData.isSection: true }

        QQC2.SpinBox {
            id: refreshSpin
            Kirigami.FormData.label: "Refresh every (s):"
            from: 1; to: 60
        }
        QQC2.CheckBox {
            id: statsHeaderCheck
            Kirigami.FormData.label: "Host stats header:"
            text: "Show per-host summary above the list"
        }
        QQC2.SpinBox {
            id: logTailSpin
            Kirigami.FormData.label: "Log lines per page:"
            from: 100; to: 100000; stepSize: 100
        }
        QQC2.TextField {
            id: terminalField
            Kirigami.FormData.label: "Terminal for shell:"
            Layout.preferredWidth: Kirigami.Units.gridUnit * 14
            placeholderText: "konsole -e"
        }
    }
}

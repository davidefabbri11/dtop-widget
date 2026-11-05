import QtQuick
import QtQuick.Layouts
import org.kde.plasma.plasmoid
import org.kde.plasma.components as PlasmaComponents
import org.kde.kirigami as Kirigami
import "../code/commands.js" as Cmd
import "../code/logs.js" as Logs

// Container logs: initial tail, "load older" pagination, follow, JSON colouring.
ColumnLayout {
    id: logView
    property var row: null
    property var lines: []          // logs.js LogLine[], oldest first
    property bool follow: true
    property bool jsonMode: true
    property bool loading: false
    property bool noOlder: false
    property string error: ""
    property int epoch: 0
    signal back()

    readonly property int tail: Math.max(1, Plasmoid.configuration.logTail)

    function localTime(ms) { return Qt.formatDateTime(new Date(ms), "yyyy-MM-dd hh:mm:ss.zzz"); }
    function render(line) { return Logs.formatLogLine(line, localTime, jsonMode); }

    function open(r) {
        row = r;
        lines = [];
        logModel.clear();
        noOlder = false;
        error = "";
        epoch++;
        fetch({ tail: tail }, "append");
    }

    function close() {
        epoch++;
        row = null;
        lines = [];
        logModel.clear();
    }

    function fetch(opts, mode) {
        var e = epoch;
        loading = true;
        // `row` is a container row or a compose project target { project, host, name }.
        var project = row.project || "";
        var cmd = project ? Cmd.composeLogsCommand(root.hostOf(row), project, opts)
                          : Cmd.logsCommand(root.hostOf(row), row.id, opts);
        var parse = project ? Logs.parseComposeLogLines : Logs.parseLogLines;
        root.run(cmd, function (out, err, code) {
            if (e !== epoch) return;
            loading = false;
            if (code !== 0) { error = String(out + err).trim() || ("docker logs failed (exit code " + code + ")"); return; }
            error = "";
            var atEnd = list.atYEnd || logModel.count === 0;
            var before = lines.length;
            lines = Logs.mergeLogs(lines, parse(out), mode);
            var added = lines.length - before;
            if (mode === "append") {
                for (var i = before; i < lines.length; i++) logModel.append({ html: render(lines[i]) });
                if (atEnd) list.positionViewAtEnd();
            } else {
                for (var j = added - 1; j >= 0; j--) logModel.insert(0, { html: render(lines[j]) });
                if (added === 0) noOlder = true;
                list.positionViewAtIndex(added, ListView.Beginning);
            }
        });
    }

    function loadOlder() {
        if (lines.length > 0) fetch({ until: lines[0].ts, tail: tail }, "prepend");
    }

    function rerender() {
        logModel.clear();
        lines.forEach(function (l) { logModel.append({ html: render(l) }); });
        list.positionViewAtEnd();
    }

    onJsonModeChanged: rerender()
    Keys.onEscapePressed: back()

    ListModel { id: logModel }

    Timer {
        interval: root.refreshSeconds * 1000
        repeat: true
        running: logView.follow && !!logView.row && logView.visible && root.expanded && !logView.loading
        onTriggered: {
            if (logView.lines.length > 0) logView.fetch({ since: logView.lines[logView.lines.length - 1].ts }, "append");
            else logView.fetch({ tail: logView.tail }, "append");
        }
    }

    RowLayout {
        Layout.fillWidth: true
        PlasmaComponents.ToolButton {
            icon.name: "go-previous"
            text: "Back"
            onClicked: logView.back()
        }
        PlasmaComponents.Label {
            Layout.fillWidth: true
            text: logView.row ? logView.row.name + " — logs (" + logView.lines.length + " lines)" : ""
            font.bold: true
            elide: Text.ElideRight
        }
        PlasmaComponents.BusyIndicator {
            running: logView.loading
            visible: running
            Layout.preferredHeight: Kirigami.Units.iconSizes.small
            Layout.preferredWidth: Layout.preferredHeight
        }
        PlasmaComponents.ToolButton {
            icon.name: "go-up"
            text: "Load older"
            enabled: !logView.noOlder && logView.lines.length > 0 && !logView.loading
            onClicked: logView.loadOlder()
        }
        PlasmaComponents.ToolButton {
            icon.name: "code-context"
            text: "JSON"
            checkable: true
            checked: logView.jsonMode
            onToggled: logView.jsonMode = checked
        }
        PlasmaComponents.ToolButton {
            icon.name: "go-bottom"
            text: "Follow"
            checkable: true
            checked: logView.follow
            onToggled: { logView.follow = checked; if (checked) list.positionViewAtEnd(); }
        }
    }

    Kirigami.InlineMessage {
        Layout.fillWidth: true
        type: Kirigami.MessageType.Error
        visible: logView.error.length > 0
        text: Logs.asRichText(logView.error)
    }

    PlasmaComponents.ScrollView {
        Layout.fillWidth: true
        Layout.fillHeight: true

        ListView {
            id: list
            clip: true
            focus: true
            model: logModel
            reuseItems: true
            delegate: TextEdit {
                width: ListView.view.width
                readOnly: true
                selectByMouse: true
                textFormat: TextEdit.RichText
                wrapMode: TextEdit.Wrap
                font.family: "monospace"
                color: Kirigami.Theme.textColor
                selectionColor: Kirigami.Theme.highlightColor
                text: model.html
            }

            Keys.onPressed: function (event) {
                switch (event.key) {
                case Qt.Key_PageDown: list.contentY = Math.min(list.contentY + list.height, Math.max(0, list.contentHeight - list.height)); break;
                case Qt.Key_PageUp: list.contentY = Math.max(0, list.contentY - list.height); break;
                case Qt.Key_Home: list.positionViewAtBeginning(); break;
                case Qt.Key_End: list.positionViewAtEnd(); break;
                case Qt.Key_Left: logView.back(); break;
                default: return;
                }
                event.accepted = true;
            }
        }
    }

    function focusList() { list.forceActiveFocus(); }
}

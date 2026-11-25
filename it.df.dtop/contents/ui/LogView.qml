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
    property bool maximized: false  // true: the table is hidden and the logs take the whole popup
    signal closeRequested()
    signal maximizeToggled()
    signal leave()                  // hand keyboard focus back to the table, panel stays open
    property bool searchOpen: false
    property string search: ""      // applied needle (debounced from the search field)
    property var matches: []        // indices into `lines`
    property int matchPos: -1       // index into `matches` of the current match
    readonly property bool timestamps: Plasmoid.configuration.logTimestamps

    readonly property int tail: Math.max(1, Plasmoid.configuration.logTail)

    function localTime(ms) { return Qt.formatDateTime(new Date(ms), "yyyy-MM-dd hh:mm:ss.zzz"); }
    function render(line, index) {
        return Logs.formatLogLine(line, localTime, jsonMode, {
            timestamps: timestamps,
            search: search,
            current: matchPos >= 0 && matches[matchPos] === index
        });
    }

    function open(r) {
        row = r;
        lines = [];
        matches = [];
        matchPos = -1;
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
        var parse = project
            ? function (o) { return Logs.keepNewest(Logs.parseComposeLogLines(o), opts.tail || 0); }
            : Logs.parseLogLines;
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
                refreshMatches(0);
                for (var i = before; i < lines.length; i++) logModel.append({ html: render(lines[i], i) });
                if (atEnd) list.positionViewAtEnd();
            } else {
                refreshMatches(added);
                for (var j = added - 1; j >= 0; j--) logModel.insert(0, { html: render(lines[j], j) });
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
        lines.forEach(function (l, i) { logModel.append({ html: render(l, i) }); });
        if (matchPos >= 0) list.positionViewAtIndex(matches[matchPos], ListView.Center);
        else list.positionViewAtEnd();
    }

    // Recompute matches after `lines` changed; `shift` = lines prepended, so the current match stays put.
    function refreshMatches(shift) {
        var cur = matchPos >= 0 ? matches[matchPos] + shift : -1;
        matches = Logs.matchLines(lines, search);
        matchPos = cur >= 0 ? matches.indexOf(cur) : (matches.length > 0 ? matches.length - 1 : -1);
    }

    function applySearch(text) {
        search = text;
        matchPos = -1;
        refreshMatches(0);      // starts at the newest match
        rerender();
    }

    // delta +1 = next (newer, further down), -1 = previous; wraps around.
    function jump(delta) {
        if (matches.length === 0) return;
        var old = matches[matchPos];
        matchPos = (matchPos + delta + matches.length) % matches.length;
        var now = matches[matchPos];
        if (old !== undefined) logModel.setProperty(old, "html", render(lines[old], old));
        logModel.setProperty(now, "html", render(lines[now], now));
        list.positionViewAtIndex(now, ListView.Center);
    }

    function openSearch() {
        searchOpen = true;
        searchField.forceActiveFocus();
        searchField.selectAll();
    }

    function closeSearch() {
        searchOpen = false;
        searchTimer.stop();
        searchField.text = "";
        if (search) applySearch("");
        list.forceActiveFocus();
    }

    onJsonModeChanged: rerender()
    onTimestampsChanged: rerender()
    Keys.onEscapePressed: maximized ? maximizeToggled() : closeRequested()

    ListModel { id: logModel }

    Timer {
        id: searchTimer
        interval: 200
        onTriggered: logView.applySearch(searchField.text)
    }

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
            display: logView.maximized ? PlasmaComponents.AbstractButton.TextBesideIcon : PlasmaComponents.AbstractButton.IconOnly
            PlasmaComponents.ToolTip.text: text
            enabled: !logView.noOlder && logView.lines.length > 0 && !logView.loading
            onClicked: logView.loadOlder()
        }
        PlasmaComponents.ToolButton {
            icon.name: "code-context"
            text: "JSON"
            display: logView.maximized ? PlasmaComponents.AbstractButton.TextBesideIcon : PlasmaComponents.AbstractButton.IconOnly
            PlasmaComponents.ToolTip.text: text
            checkable: true
            checked: logView.jsonMode
            onToggled: logView.jsonMode = checked
        }
        PlasmaComponents.ToolButton {
            icon.name: "go-bottom"
            text: "Follow"
            display: logView.maximized ? PlasmaComponents.AbstractButton.TextBesideIcon : PlasmaComponents.AbstractButton.IconOnly
            PlasmaComponents.ToolTip.text: text
            checkable: true
            checked: logView.follow
            onToggled: { logView.follow = checked; if (checked) list.positionViewAtEnd(); }
        }
        PlasmaComponents.ToolButton {
            icon.name: "chronometer"
            text: "Timestamps"
            display: PlasmaComponents.AbstractButton.IconOnly
            checkable: true
            checked: logView.timestamps
            onToggled: Plasmoid.configuration.logTimestamps = checked
            PlasmaComponents.ToolTip.text: text
        }
        PlasmaComponents.ToolButton {
            icon.name: "edit-find"
            text: "Search (Ctrl+F)"
            display: PlasmaComponents.AbstractButton.IconOnly
            checkable: true
            checked: logView.searchOpen
            onToggled: checked ? logView.openSearch() : logView.closeSearch()
            PlasmaComponents.ToolTip.text: text
        }
        PlasmaComponents.ToolButton {
            icon.name: logView.maximized ? "view-restore" : "view-fullscreen"
            display: PlasmaComponents.AbstractButton.IconOnly
            text: logView.maximized ? "Restore" : "Maximize"
            onClicked: logView.maximizeToggled()
            PlasmaComponents.ToolTip.text: text
        }
        PlasmaComponents.ToolButton {
            icon.name: "window-close"
            display: PlasmaComponents.AbstractButton.IconOnly
            text: "Close logs"
            onClicked: logView.closeRequested()
            PlasmaComponents.ToolTip.text: text
        }
    }

    RowLayout {
        Layout.fillWidth: true
        visible: logView.searchOpen
        PlasmaComponents.TextField {
            id: searchField
            Layout.fillWidth: true
            placeholderText: "Search logs…"
            onTextChanged: searchTimer.restart()
            Keys.onPressed: function (event) {
                if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                    if (searchTimer.running) { searchTimer.stop(); logView.applySearch(text); }
                    else logView.jump((event.modifiers & Qt.ShiftModifier) ? -1 : 1);
                } else if (event.key === Qt.Key_Escape) {
                    logView.closeSearch();
                } else {
                    return;
                }
                event.accepted = true;
            }
        }
        PlasmaComponents.Label {
            text: !logView.search ? "" : logView.matches.length === 0 ? "no matches"
                : (logView.matchPos + 1) + "/" + logView.matches.length
            opacity: 0.7
        }
        PlasmaComponents.ToolButton {
            icon.name: "go-up-search"
            display: PlasmaComponents.AbstractButton.IconOnly
            text: "Previous match (Shift+Enter)"
            enabled: logView.matches.length > 0
            onClicked: logView.jump(-1)
            PlasmaComponents.ToolTip.text: text
        }
        PlasmaComponents.ToolButton {
            icon.name: "go-down-search"
            display: PlasmaComponents.AbstractButton.IconOnly
            text: "Next match (Enter)"
            enabled: logView.matches.length > 0
            onClicked: logView.jump(1)
            PlasmaComponents.ToolTip.text: text
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
                onLinkActivated: function (link) { Qt.openUrlExternally(link); }
                HoverHandler { cursorShape: parent.hoveredLink ? Qt.PointingHandCursor : Qt.IBeamCursor }
            }

            Keys.onPressed: function (event) {
                switch (event.key) {
                case Qt.Key_PageDown: list.contentY = Math.min(list.contentY + list.height, Math.max(0, list.contentHeight - list.height)); break;
                case Qt.Key_PageUp: list.contentY = Math.max(0, list.contentY - list.height); break;
                case Qt.Key_Home: list.positionViewAtBeginning(); break;
                case Qt.Key_End: list.positionViewAtEnd(); break;
                case Qt.Key_Left: if (logView.maximized) logView.maximizeToggled(); else logView.leave(); break;
                case Qt.Key_Slash: logView.openSearch(); break;
                case Qt.Key_F:
                    if (!(event.modifiers & Qt.ControlModifier)) return;
                    logView.openSearch();
                    break;
                default: return;
                }
                event.accepted = true;
            }
        }
    }

    function focusList() { list.forceActiveFocus(); }
}

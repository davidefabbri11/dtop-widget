import QtQuick
import QtQuick.Layouts
import org.kde.plasma.components as PlasmaComponents
import org.kde.kirigami as Kirigami
import "../code/commands.js" as Cmd
import "../code/logs.js" as Logs

// `docker inspect` of one container, rendered as colourised JSON.
ColumnLayout {
    id: details
    property var row: null
    property string html: ""
    property string error: ""
    signal back()

    function load() {
        html = "";
        error = "";
        if (!row) return;
        var key = row.key;
        root.run(Cmd.inspectCommand(root.hostOf(row), row.id), function (out, err, code) {
            if (!details.row || details.row.key !== key) return;
            try {
                var parsed = JSON.parse(out);
                details.html = Logs.renderJson(Array.isArray(parsed) ? parsed[0] : parsed, true);
            } catch (e) {
                details.error = err.trim() || ("docker inspect failed (exit code " + code + ")");
            }
        });
    }

    onRowChanged: load()
    Keys.onEscapePressed: back()

    RowLayout {
        PlasmaComponents.ToolButton {
            icon.name: "go-previous"
            text: "Back"
            onClicked: details.back()
        }
        PlasmaComponents.Label {
            Layout.fillWidth: true
            text: details.row ? details.row.name + " — details" : ""
            font.bold: true
            elide: Text.ElideRight
        }
    }

    Kirigami.InlineMessage {
        Layout.fillWidth: true
        type: Kirigami.MessageType.Error
        visible: details.error.length > 0
        text: Logs.asRichText(details.error)
    }

    PlasmaComponents.ScrollView {
        Layout.fillWidth: true
        Layout.fillHeight: true
        TextEdit {
            readOnly: true
            selectByMouse: true
            textFormat: TextEdit.RichText
            wrapMode: TextEdit.Wrap
            font.family: "monospace"
            color: Kirigami.Theme.textColor
            selectionColor: Kirigami.Theme.highlightColor
            text: details.html
        }
    }
}

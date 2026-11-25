#!/usr/bin/env python3
"""Screenshot the widget with demo data, never touching the real desktop, hosts or widget install.

Runs the repo's it.df.dtop in `plasmawindowed` on its own rootful Xwayland display, with fake
`docker` and `ssh` (fake.py) on PATH, Breeze Dark, a private D-Bus session and throwaway
XDG dirs. Only that display is captured.

Usage: scripts/demo/shot.py OUT.png [--group] [--hide-stopped] [ACTION...]
Actions, run in order after the first refreshes:
  wait:SECONDS  key:KEYSYM  shift:KEYSYM  type:TEXT  click:X,Y  dbl:X,Y  move:X,Y
Coordinates are in the 1560x820 window. Needs Xwayland, xwd, ffmpeg, python3-xlib, python3-pil.

README screenshots:
  shot.py screenshots/dtop-grouped-show-all.png --group click:800,800 move:1500,800 wait:4
  shot.py screenshots/dtop-flat.png click:800,800 move:1500,800 wait:4
  shot.py screenshots/dtop-log-panel.png dbl:220,380 wait:3 key:slash type:error key:Return wait:1 key:Return move:600,760 wait:2
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

from PIL import Image
from Xlib import X, XK, display
from Xlib.ext import xtest

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.join(HERE, "..", "..", "it.df.dtop")
HOSTS = "ssh://ops@homelab name=homelab\nssh://admin@nas name=nas\ntcp://10.0.4.12:2375 name=edge"
W, H = 1560, 820
PAD = 12


def setup(tmp, group, hide_stopped):
    """Install a copy of the widget whose defaults point at the demo hosts; dark theme config."""
    pkg = os.path.join(tmp, "data/plasma/plasmoids/it.df.dtop")
    shutil.copytree(PKG, pkg)
    xml = os.path.join(pkg, "contents/config/main.xml")
    s = open(xml).read()
    s = re.sub(r'(<entry name="hosts" type="String">\s*<default>)[^<]*', lambda m: m.group(1) + HOSTS, s)
    s = re.sub(r'(<entry name="groupByCompose" type="Bool">\s*<default>)\w+', r"\g<1>" + str(group).lower(), s)
    s = re.sub(r'(<entry name="showAll" type="Bool">\s*<default>)\w+', r"\g<1>" + str(not hide_stopped).lower(), s)
    open(xml, "w").write(s)
    cfg = os.path.join(tmp, "config")
    os.makedirs(cfg)
    colors = open("/usr/share/color-schemes/BreezeDark.colors").read()
    with open(os.path.join(cfg, "kdeglobals"), "w") as f:
        f.write(colors + "\n[General]\nColorScheme=BreezeDark\n[KDE]\nLookAndFeelPackage=org.kde.breezedark.desktop\n")
    with open(os.path.join(cfg, "plasmarc"), "w") as f:
        f.write("[Theme]\nname=breeze-dark\n")
    bin_dir = os.path.join(tmp, "bin")
    os.makedirs(bin_dir)
    for name in ("docker", "ssh"):
        os.symlink(os.path.join(HERE, "fake.py"), os.path.join(bin_dir, name))
    return os.path.join(tmp, "data"), cfg, bin_dir


def find_window(d):
    for _ in range(60):
        for w in d.screen().root.query_tree().children:
            try:
                if w.get_attributes().map_state == X.IsViewable and w.get_geometry().width > 100:
                    return w
            except Exception:
                continue
        time.sleep(0.5)
    sys.exit("widget window did not appear")


def key(d, name, mods=()):
    codes = [d.keysym_to_keycode(XK.string_to_keysym(m)) for m in mods]
    k = d.keysym_to_keycode(XK.string_to_keysym(name))
    for c in codes:
        xtest.fake_input(d, X.KeyPress, c)
    xtest.fake_input(d, X.KeyPress, k)
    xtest.fake_input(d, X.KeyRelease, k)
    for c in reversed(codes):
        xtest.fake_input(d, X.KeyRelease, c)
    d.sync()
    time.sleep(0.15)


def pointer(d, x, y, clicks):
    xtest.fake_input(d, X.MotionNotify, x=x, y=y)
    d.sync()
    time.sleep(0.1)
    for _ in range(clicks):
        xtest.fake_input(d, X.ButtonPress, 1)
        xtest.fake_input(d, X.ButtonRelease, 1)
        d.sync()
        time.sleep(0.05)
    time.sleep(0.4)


def run_action(d, action):
    kind, _, arg = action.partition(":")
    if kind == "wait":
        time.sleep(float(arg))
    elif kind == "key":
        key(d, arg)
    elif kind == "shift":
        key(d, arg, ["Shift_L"])
    elif kind == "type":
        for ch in arg:
            key(d, ch)
    elif kind in ("click", "dbl", "move"):
        x, y = map(int, arg.split(","))
        pointer(d, x, y, {"move": 0, "click": 1, "dbl": 2}[kind])
    else:
        sys.exit("unknown action: " + action)


def main():
    args = sys.argv[1:]
    if not args or args[0].startswith("-"):
        sys.exit(__doc__)
    out = os.path.abspath(args.pop(0))
    group = "--group" in args
    hide_stopped = "--hide-stopped" in args
    actions = [a for a in args if not a.startswith("--")]

    tmp = tempfile.mkdtemp(prefix="dtop-shot-")
    disp = ":%d" % (100 + os.getpid() % 100)
    xw = subprocess.Popen(["Xwayland", disp, "-geometry", "%dx%d" % (W, H), "-noreset"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    widget = None
    try:
        time.sleep(2)
        data, cfg, bin_dir = setup(tmp, group, hide_stopped)
        env = dict(os.environ, DISPLAY=disp, WAYLAND_DISPLAY="", QT_QPA_PLATFORM="xcb",
                   XDG_DATA_HOME=data, XDG_CONFIG_HOME=cfg, PATH=bin_dir + ":" + os.environ["PATH"])
        # Own D-Bus session: plasmawindowed is single-instance and would hand off to a running one.
        widget = subprocess.Popen(["dbus-run-session", "--", "plasmawindowed", "it.df.dtop"], env=env,
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        d = display.Display(disp)
        w = find_window(d)
        w.configure(x=0, y=0, width=W, height=H)
        d.sync()
        time.sleep(10)      # two refreshes: CPU and rates need a previous sample
        for a in actions:
            run_action(d, a)
        time.sleep(1)
        xwd = os.path.join(tmp, "shot.xwd")
        png = os.path.join(tmp, "shot.png")
        with open(xwd, "wb") as f:
            subprocess.run(["xwd", "-silent", "-display", disp, "-id", str(w.id)], stdout=f, check=True)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", xwd, "-vf", "crop=%d:%d:0:0" % (W, H), png],
                       check=True)
        im = Image.open(png).convert("RGB")
        bg = im.getpixel((W // 2, H - 10))
        padded = Image.new("RGB", (W + 2 * PAD, H + 2 * PAD), bg)
        padded.paste(im, (PAD, PAD))
        padded.save(out)
        print(out)
    finally:
        if widget:
            widget.terminate()
            widget.wait(10)
        xw.terminate()
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()

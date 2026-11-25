// Machine stats for the System row of the host header, from `cat /proc/stat /proc/meminfo
// /proc/loadavg /proc/uptime /proc/net/dev`. No Qt/QML APIs — runs in QML and Node.

// Container and bridge interfaces carry traffic already counted on the physical ones.
var SKIP_IFACE = /^(lo$|veth|docker|br-)/;

function parseProc(stdout) {
    var p = {
        cpuTotal: null, cpuIdle: null, cores: null, memTotal: null, memAvailable: null, swapTotal: null,
        swapFree: null, load: null, uptimeSec: null, netRx: null, netTx: null
    };
    var mem = {};
    String(stdout || "").split("\n").forEach(function (line) {
        var m;
        if ((m = /^cpu\s+(.*)$/.exec(line))) {
            var f = m[1].trim().split(/\s+/).map(Number);
            p.cpuTotal = f.slice(0, 8).reduce(function (a, b) { return a + b; }, 0);
            p.cpuIdle = f[3] + (f[4] || 0);
        } else if (/^cpu\d+\s/.test(line)) {
            p.cores = (p.cores || 0) + 1;
        } else if ((m = /^(\w+):\s+(\d+) kB$/.exec(line))) {
            mem[m[1]] = parseInt(m[2], 10) * 1024;
        } else if ((m = /^([\d.]+) ([\d.]+) ([\d.]+) \d+\/\d+ \d+$/.exec(line))) {
            p.load = [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
        } else if ((m = /^([\d.]+) [\d.]+$/.exec(line))) {
            p.uptimeSec = parseFloat(m[1]);
        } else if ((m = /^\s*([^\s:|]+):\s*((?:\d+\s+){15}\d+)\s*$/.exec(line))) {
            // /proc/net/dev: 16 counters per interface (meminfo lines without "kB" have one).
            if (SKIP_IFACE.test(m[1])) return;
            var n = m[2].split(/\s+/).map(Number);
            p.netRx = (p.netRx || 0) + n[0];
            p.netTx = (p.netTx || 0) + n[8];
        }
    });
    if (mem.MemTotal !== undefined) p.memTotal = mem.MemTotal;
    if (mem.MemAvailable !== undefined) p.memAvailable = mem.MemAvailable;
    else if (mem.MemFree !== undefined) p.memAvailable = mem.MemFree + (mem.Buffers || 0) + (mem.Cached || 0);
    if (mem.SwapTotal !== undefined) p.swapTotal = mem.SwapTotal;
    if (mem.SwapFree !== undefined) p.swapFree = mem.SwapFree;
    return p;
}

// Rate per second of a counter, or null without a usable previous value (first sample, reset, no time).
function delta(prev, cur, seconds) {
    if (prev === null || prev === undefined || cur === null || seconds <= 0 || cur < prev) return null;
    return (cur - prev) / seconds;
}

function systemSample(prev, proc, nowMs) {
    var seconds = prev ? (nowMs - prev.nowMs) / 1000 : 0;
    // Uptime going backwards means a reboot: counters restarted, the old sample is meaningless.
    var rebooted = prev && proc.uptimeSec !== null && prev.proc.uptimeSec !== null && proc.uptimeSec < prev.proc.uptimeSec;
    var pp = prev && !rebooted ? prev.proc : {};
    var cpu = null;
    var dTotal = delta(pp.cpuTotal, proc.cpuTotal, seconds);
    var dIdle = delta(pp.cpuIdle, proc.cpuIdle, seconds);
    if (dTotal !== null && dIdle !== null && dTotal > 0) cpu = 100 * (1 - dIdle / dTotal);
    var minus = function (a, b) { return a === null || b === null ? null : a - b; };
    return {
        proc: proc,
        nowMs: nowMs,
        cpu: cpu,
        cores: proc.cores,
        memUsed: minus(proc.memTotal, proc.memAvailable),
        memTotal: proc.memTotal,
        swapUsed: minus(proc.swapTotal, proc.swapFree),
        swapTotal: proc.swapTotal,
        load: proc.load,
        uptimeSec: proc.uptimeSec,
        netRxRate: delta(pp.netRx, proc.netRx, seconds),
        netTxRate: delta(pp.netTx, proc.netTx, seconds)
    };
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        parseProc: parseProc,
        systemSample: systemSample
    };
}

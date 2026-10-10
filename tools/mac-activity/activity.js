// Alyx's Studio — computer time, for the private journal.
// Runs once a minute on your Mac (installed by install.sh). It notes whether you are using the
// computer and which app is in front (and, for browsers, which website), then every 10 minutes sends
// a summary of the day to your private repository: journal/activity/YYYY-MM-DD.json.
// Nothing is sent anywhere else. Uninstall any time with uninstall.sh.
ObjC.import("Foundation");
var app = Application.currentApplication();
app.includeStandardAdditions = true;

var REPO = "alyxsstudio/studio-drafts";
var DIR = $.NSHomeDirectory().js + "/Library/Application Support/AlyxActivity";
var IDLE_AFTER = 300;   // seconds without keyboard or mouse = a break
var SYNC_EVERY = 10;    // minutes

function sh(cmd) { try { return app.doShellScript(cmd); } catch (e) { return ""; } }
function readText(p) { var s = $.NSString.stringWithContentsOfFileEncodingError(p, $.NSUTF8StringEncoding, null); return s.isNil() ? "" : s.js; }
function writeText(p, t) { $(t).writeToFileAtomicallyEncodingError(p, true, $.NSUTF8StringEncoding, null); }
function pad(n) { return (n < 10 ? "0" : "") + n; }

/* ===== pure part (also tested on its own) ===== */
function classify(appName, host, rules) {
  var has = function (list, v) { return (list || []).some(function (x) { return v && String(v).toLowerCase().indexOf(String(x).toLowerCase()) > -1; }); };
  if (host) {
    if (has(rules.work_sites, host)) return "w";
    if (has(rules.rest_sites, host)) return "r";
  }
  if ((rules.work || []).indexOf(appName) > -1) return "w";
  if ((rules.rest || []).indexOf(appName) > -1) return "r";
  return "o";
}
function summarize(day, log) {
  var tl = log.timeline || "", kinds = { work: 0, rest: 0, other: 0 }, sessions = [], cur = null, gap = 0;
  for (var i = 0; i < tl.length; i++) {
    var c = tl.charAt(i);
    if (c === "w") kinds.work++; else if (c === "r") kinds.rest++; else if (c === "o") kinds.other++;
    var on = c === "w" || c === "r" || c === "o";
    if (on) { if (!cur) cur = { start: i, end: i }; else cur.end = i; gap = 0; }
    else if (cur) { gap++; if (gap > 5) { sessions.push(cur); cur = null; gap = 0; } }
  }
  if (cur) sessions.push(cur);
  var hm = function (m) { return pad(Math.floor(m / 60)) + ":" + pad(m % 60); };
  var apps = Object.keys(log.apps || {}).map(function (n) { return { name: n, minutes: log.apps[n].m, kind: log.apps[n].k }; })
    .sort(function (a, b) { return b.minutes - a.minutes; }).slice(0, 15);
  var sites = Object.keys(log.sites || {}).map(function (n) { return { name: n, minutes: log.sites[n] }; })
    .sort(function (a, b) { return b.minutes - a.minutes; }).slice(0, 15);
  return {
    date: day, updated: new Date().toISOString(), timeline: tl,
    kinds: kinds, active_minutes: kinds.work + kinds.rest + kinds.other,
    sessions: sessions.filter(function (s) { return s.end - s.start >= 4; }).map(function (s) { return { from: hm(s.start), to: hm(s.end + 1), minutes: s.end - s.start + 1 }; }),
    apps: apps, sites: sites
  };
}
function record(log, minute, state, appName, host) {
  var tl = log.timeline || "";
  while (tl.length < 1440) tl += ".";
  log.timeline = tl.slice(0, minute) + state + tl.slice(minute + 1);
  if (state !== ".") {
    log.apps = log.apps || {}; log.apps[appName] = log.apps[appName] || { m: 0, k: state }; log.apps[appName].m++; log.apps[appName].k = state;
    if (host) { log.sites = log.sites || {}; log.sites[host] = (log.sites[host] || 0) + 1; }
  }
  return log;
}
/* ===== end of pure part ===== */

function frontApp() {
  var out = sh("lsappinfo info -only name `lsappinfo front`");
  var m = out.match(/"([^"]+)"\s*$/);
  return m ? m[1] : "";
}
function browserHost(name) {
  var url = "";
  try {
    if (name === "Safari") url = Application("Safari").documents[0].url();
    else if (/Chrome|Arc|Brave|Edge|Vivaldi|Opera/.test(name)) url = Application(name).windows[0].activeTab.url();
  } catch (e) { url = ""; }
  var m = String(url || "").match(/^https?:\/\/(?:www\.)?([^\/:?#]+)/);
  return m ? m[1] : "";
}
function sync(day, summary) {
  var tmp = DIR + "/upload.json", path = "journal/activity/" + day + ".json";
  var api = "https://api.github.com/repos/" + REPO + "/contents/" + path;
  var auth = "security find-generic-password -s alyx-studio-activity -w | sed 's/^/header = \"Authorization: Bearer /; s/$/\"/'";
  var cur = sh(auth + " | curl -s -K - -H 'Accept: application/vnd.github+json' '" + api + "'");
  var sha = (cur.match(/"sha"\s*:\s*"([0-9a-f]+)"/) || [])[1];
  writeText(DIR + "/summary.json", JSON.stringify(summary));
  var b64 = sh("base64 -i '" + DIR + "/summary.json' | tr -d '\\n'");
  writeText(tmp, JSON.stringify({ message: "Computer time " + day, content: b64, sha: sha || undefined }));
  var res = sh(auth + " | curl -s -K - -X PUT -H 'Accept: application/vnd.github+json' --data-binary @'" + tmp + "' '" + api + "'");
  writeText(DIR + "/last-sync.txt", new Date().toISOString() + "\n" + res.slice(0, 300));
}

function run() {
  sh("mkdir -p '" + DIR + "'");
  var now = new Date(), day = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
  var minute = now.getHours() * 60 + now.getMinutes();
  var rules = {}; try { rules = JSON.parse(readText(DIR + "/apps.json") || "{}"); } catch (e) {}
  var idle = parseInt(sh("ioreg -c IOHIDSystem | awk '/HIDIdleTime/ {print int($NF/1000000000); exit}'"), 10) || 0;
  var logPath = DIR + "/log-" + day + ".json", log = {};
  try { log = JSON.parse(readText(logPath) || "{}"); } catch (e) { log = {}; }
  var state = ".", name = "", host = "";
  if (idle < IDLE_AFTER) {
    name = frontApp() || "Unknown";
    host = browserHost(name);
    state = classify(name, host, rules);
  }
  record(log, minute, state, name, host);
  writeText(logPath, JSON.stringify(log));
  if (now.getMinutes() % SYNC_EVERY === 0) sync(day, summarize(day, log));
  // at the first minute of a new day, send yesterday's final summary too
  if (minute === 0) {
    var y = new Date(now.getTime() - 864e5), yd = y.getFullYear() + "-" + pad(y.getMonth() + 1) + "-" + pad(y.getDate());
    try { var ylog = JSON.parse(readText(DIR + "/log-" + yd + ".json") || "{}"); if (ylog.timeline) sync(yd, summarize(yd, ylog)); } catch (e) {}
  }
}
run();

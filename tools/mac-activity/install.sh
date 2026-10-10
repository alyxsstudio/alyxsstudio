#!/bin/bash
# Alyx's Studio — install the computer-time helper on this Mac.
#   curl -fsSL https://raw.githubusercontent.com/alyxsstudio/alyxsstudio/main/tools/mac-activity/install.sh | bash
set -e
SRC="https://raw.githubusercontent.com/alyxsstudio/alyxsstudio/main/tools/mac-activity"
DIR="$HOME/Library/Application Support/AlyxActivity"
PLIST="$HOME/Library/LaunchAgents/com.alyxsstudio.activity.plist"
mkdir -p "$DIR" "$HOME/Library/LaunchAgents"
echo "Downloading…"
curl -fsSL "$SRC/activity.js" -o "$DIR/activity.js"
[ -f "$DIR/apps.json" ] || curl -fsSL "$SRC/apps.json" -o "$DIR/apps.json"
if ! security find-generic-password -s alyx-studio-activity >/dev/null 2>&1; then
  echo
  echo "Paste the GitHub token for your private repository (studio-drafts), then press Return."
  echo "(The characters won't show. It is kept in your Mac's Keychain.)"
  read -r -s TOKEN < /dev/tty
  echo
  security add-generic-password -U -s alyx-studio-activity -a github -w "$TOKEN"
fi
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.alyxsstudio.activity</string>
  <key>ProgramArguments</key><array><string>/usr/bin/osascript</string><string>-l</string><string>JavaScript</string><string>$DIR/activity.js</string></array>
  <key>StartInterval</key><integer>60</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardErrorPath</key><string>$DIR/errors.log</string>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo
echo "Done. Your computer time will appear in the Feed journal within 10 minutes."
echo "The first time, your Mac may ask whether 'osascript' may see Safari or Chrome: allow it to sort websites into work or breaks, or say no to skip websites."

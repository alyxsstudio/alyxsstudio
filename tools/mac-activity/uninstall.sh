#!/bin/bash
# Alyx's Studio — remove the computer-time helper from this Mac.
PLIST="$HOME/Library/LaunchAgents/com.alyxsstudio.activity.plist"
launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
rm -f "$PLIST"
security delete-generic-password -s alyx-studio-activity >/dev/null 2>&1 || true
rm -rf "$HOME/Library/Application Support/AlyxActivity"
echo "Removed."

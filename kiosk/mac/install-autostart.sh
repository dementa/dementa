#!/bin/bash
# Makes Dementa OS open full screen (Chrome kiosk mode) every time this user logs in to the Mac.
# Usage:  bash install-autostart.sh [address]
# Remove: bash install-autostart.sh --uninstall
# To leave kiosk mode press Cmd+Q.

set -euo pipefail

URL="${1:-https://practices-surprising-enjoy-corrected.trycloudflare.com}"
LABEL="org.dementa.os.kiosk"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [[ "${1:-}" == "--uninstall" ]]; then
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Dementa OS will no longer open at login."
  exit 0
fi

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [[ ! -x "$CHROME" ]]; then
  echo "Google Chrome is not installed in /Applications. Install it first." >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$CHROME</string>
    <string>--kiosk</string>
    <string>$URL</string>
    <string>--user-data-dir=$HOME/Library/Application Support/DementaOS/browser-profile</string>
    <string>--no-first-run</string>
  </array>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Done! Dementa OS will open full screen at every login ($URL)."

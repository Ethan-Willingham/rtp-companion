#!/bin/zsh
set -eu
cd "${0:A:h}"
app="/Applications/RTP Companion.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
xcrun swiftc -O -parse-as-library -swift-version 5 -target arm64-apple-macosx14.0 Main.swift -o "$app/Contents/MacOS/RTPCompanion" -framework AppKit -framework Vision -framework ScreenCaptureKit
xcrun swift Icon.swift /tmp/rtp-companion.iconset
iconutil -c icns /tmp/rtp-companion.iconset -o "$app/Contents/Resources/AppIcon.icns"
cat > "$app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>RTPCompanion</string>
<key>CFBundleIdentifier</key><string>local.ethan.rtpcompanion</string>
<key>CFBundleName</key><string>RTP Companion</string>
<key>CFBundleDisplayName</key><string>RTP Companion</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>CFBundleShortVersionString</key><string>2.1</string>
<key>CFBundleVersion</key><string>3</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSScreenCaptureUsageDescription</key><string>Read the F3 coordinates visible in your Minecraft window so your map marker can follow you. Pixels are processed locally and are never uploaded or saved.</string>
</dict></plist>
PLIST
codesign --force --sign - --identifier local.ethan.rtpcompanion --requirements '=designated => identifier "local.ethan.rtpcompanion"' "$app"
"$app/Contents/MacOS/RTPCompanion" --self-test

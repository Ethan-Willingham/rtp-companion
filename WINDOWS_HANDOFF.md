# Windows handoff for Codex

## Owner's goal

A simple clickable app beside Minecraft Java. Read visible F3 coordinates locally, follow manual /rtp landings on DonutSMP's public heatmap, and label US West, US East, EU West, EU Central, Asia and Oceania. No mods, game memory, packets, account login or automated controls.

The owner is bringing this repository from the Mac to a Windows PC and wants Codex there to verify it against the actual game.

## Current implementation

- Mac: native ScreenCaptureKit and Apple Vision app, tested against live Minecraft Java on Apple Silicon. Source: native/.
- Windows: Electron app with its own window, included runtime, automatic game-window selection, automatic Tesseract OCR row detection, manual crop fallback, signed-coordinate confirmation, stale status, history and local CSV export.
- Map: Donut Auction public heatmap and region APIs. Six labels, boundaries and current-region lookup are included.
- Packaging: Windows NSIS installer with Start menu/desktop shortcuts and a portable ZIP. GitHub Actions runs Windows checks and uploads both with SHA256SUMS.txt.

## Start on Windows

Use the release installer, or extract the entire portable ZIP and open RTP Companion.exe. Node and a separate browser are not required for those downloads.

For source work, install Node.js 22 LTS and Git, clone the repository and run:

```powershell
npm ci
npm run assets
npm test
npx playwright install chromium
npm run test:auto
npm run test:electron
npm start
```

Open Minecraft Java in windowed or borderless mode, press F3 and click Start tracking. Multiple game windows expose a selection dropdown. Do not capture unrelated windows. Coordinates hidden by the server or game cannot be recovered.

## What is verified

The Mac native app was checked against a live game window, including screen permission, position updates and region labels. Windows code is checked with real local Tesseract OCR on synthetic screen content: automatic detection, signed coordinates, large jumps, stale readings, renderer isolation, map/regions and Stop. Consult Actions for the actual Windows workflow result and Releases for published artifacts.

Synthetic tests do not validate Windows graphics capture, the owner's GPU/driver, exclusive fullscreen or exact GUI scale. The preparing Mac cannot run a Windows GUI app directly. Do not equate CI packaging or synthetic OCR with live-game testing.

## Live Windows checklist

1. Verify the standalone EXE opens without Node, browser, administrator rights or a Terminal window.
2. Press F3 in Minecraft and Start tracking. Confirm the source is the Java game, not the launcher or browser.
3. Compare X, Y and Z, including negative signs. Readouts use floored block coordinates. XYZ is preferred; Block is accepted.
4. Type /rtp manually. Confirm the new marker after two consistent readings. Never automate the command.
5. Hide F3 and verify stale status instead of invented coordinates. Restore it and verify recovery.
6. Resize the game and change GUI scale. Verify automatic rediscovery. Check the owner's normal Windows display scaling and mixed-DPI monitors if applicable.
7. For black exclusive-fullscreen capture, first try windowed/borderless. Do not add capture hooks or disable protections.
8. Compare the six labels and current region with the public map. Switch Nether/End manually and confirm Overworld regions disappear.
9. Quit and verify the app process, capture and local server stop. Reopen and verify coordinates were not persisted.
10. Record Windows/Minecraft versions, GPU, scaling, tested GUI scales, results and changes below.

## Constraints and build

Read AGENTS.md. Keep the one-button flow. Restrict preload to game-window selection; preserve renderer sandboxing, context isolation, Node isolation and fixed loopback proxy routes. No uploads, telemetry, remote OCR, login, mods, memory reads, packet access or game automation. No Accessibility permission or administrator mode.

Build updated installers with npm run build:windows. The app is unsigned; normal Windows security prompts can occur. Do not disable security software. No signing certificate is configured. Preserve LICENSE, THIRD_PARTY.md and Donut Auction attribution.

## Live validation record

2026-10-22, Windows PC, Minecraft Java 26.3 vanilla: standalone 2.2.0 opened and captured the game, but the height-based tracking CSS shrank the map and small F3 glyphs produced stale or incorrect digits. Version 2.2.1 fills the map panel, uses a sidebar at wide window sizes, defaults to Follow, requests detailed high-resolution capture, increases discovery scaling, tightens row bounds, and rejects OCR below 70 percent confidence. Live capture and the reader preview were checked on the selected game window. At the observed 854 by 480 game rendering size, Block-row OCR confused 9 with 2 at 49 percent confidence. Those readings are now rejected; a full live-game accuracy pass with larger F3 text remains required. Increase Minecraft GUI Scale before relying on the marker. Synthetic browser, automatic OCR and Electron tests cover signed coordinates and tracking. No live RTP, mixed-DPI or exclusive-fullscreen validation is claimed.

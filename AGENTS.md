# RTP Companion

Standalone companion app, separate from the owner's portfolio. Read README.md and WINDOWS_HANDOFF.md before Windows work.

- Capture only the selected Minecraft window. Read visible F3 coordinates locally.
- No Minecraft mods, game-file reads, memory access, network interception, packet changes, anti-cheat evasion, input injection or automated commands.
- Never upload pixels, coordinates or session histories. Public map requests contain no player coordinates.
- Preserve the one-button Start tracking flow, automatic coordinate detection and manual crop fallback.
- The owner keeps the normal small F3 text. Do not require or recommend increasing Minecraft GUI Scale to make tracking work. Read native pixel glyphs first and cross-check XYZ against Block when both rows are visible.
- On tall windows, give the map the full horizontal width with setup above it. Start Follow off; updating the marker must not recenter the map unless the owner explicitly enables Follow.
- Keep all six region labels, borders and current-region readout. Nether and End cannot use Overworld regions.
- No emojis or em dashes in UI, docs or commit messages.
- Do not claim zero ban risk or live Windows testing without doing it.

Windows uses Electron with a sandboxed renderer, context isolation and nodeIntegration disabled. The preload exposes only listMinecraftWindows and selectMinecraftWindow. Validate IPC callers and restrict selection to the Minecraft game. The local server binds to loopback and proxies only fixed public map routes.

Generate OCR assets with npm run assets. Versions are pinned and the English model is SHA-256 verified. Do not commit public/vendor, node_modules, dist, real screenshots, personal files, credentials or user logs. Synthetic screenshots belong in ignored test/output.

Mac uses native/Main.swift and native/build.sh. Preserve bundle identifier local.ethan.rtpcompanion and its stable designated signing requirement. Previous hash-based identities caused repeat Screen Recording prompts. Never reset all TCC permissions, disable system protections or request Accessibility access.

Run npm test for core/server changes. Capture/OCR/UI changes need npm run test:auto and npm run test:electron with real local OCR. Browser fallback changes also need npm run test:browser. Harnesses must close their exact browser process in finally. On the owner's Mac, use /Users/ethan/.local/bin/agent-chrome-for-testing or Playwright-managed Chromium, never personal Chrome with headless/debugging flags.

Build Windows with npm run build:windows or the Windows GitHub Actions workflow. Record actual hardware results and unresolved issues in WINDOWS_HANDOFF.md. Keep release notes honest about synthetic versus live validation. Publishing this app publicly is authorized; avoid unrelated repositories or account changes.

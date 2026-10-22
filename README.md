# RTP Companion

A separate desktop map for Minecraft Java and DonutSMP. Keep Minecraft beside the app, show F3 and click **Start tracking**. Your marker follows the visible coordinates, including after you type `/rtp` yourself.

The map labels US West, US East, EU West, EU Central, Asia and Oceania, with region borders and a current-region readout. Public observations come from [Donut Auction](https://donut.auction/rtp-heatmap).

## Windows

Download the Windows installer or portable ZIP from this repository's **Releases** page. The installer adds Start menu and desktop shortcuts. For the portable version, extract the entire ZIP and open **RTP Companion.exe**, keeping its other files beside it. Node and a separate browser are not needed.

1. Open Minecraft Java in windowed or borderless mode beside the app.
2. Press F3 so the XYZ or Block coordinate line is visible. Increase Minecraft GUI Scale if the debug text is tiny; low-confidence readings are rejected.
3. Click **Start tracking**. If multiple game windows are open, select the intended window and start again.
4. Use `/rtp` normally. The app confirms readings before moving the marker. It never executes game commands.

Coordinates are found automatically. If needed, click **Adjust coordinate row** and select the whole XYZ or Block line, including minus signs. Resizing the game triggers rediscovery. Keep F3 visible; hidden coordinates cannot be recovered. Select the dimension manually after portals. Regions and the public heatmap apply only to the Overworld.

The Windows app is unsigned. Release downloads include SHA-256 checksums. Follow your computer's normal security policy; do not disable security software to run it.

**Validation:** Windows capture was checked on the owner's PC. Small F3 text produced incorrect OCR digits, so the reader now rejects low-confidence readings and asks for larger GUI text. Accurate tracking at the owner's larger GUI scale, mixed display scaling and graphics-driver behavior still need checking. Automated tests use actual local OCR against synthetic screen content. [WINDOWS_HANDOFF.md](WINDOWS_HANDOFF.md) gives Codex the exact next steps.

## Mac

The lightweight native Mac app in `native/` uses Apple's ScreenCaptureKit and Vision. It has been verified against a live Minecraft Java window on Apple Silicon, including coordinate tracking, region labels and screen permission.

Run `./native/build.sh`, then open **Applications > RTP Companion**. The script builds and installs an Apple Silicon app to `/Applications/RTP Companion.app`, signs it locally and runs a native OCR self-test. Requires Apple's command-line developer tools and macOS 14 or newer. `Start.command` opens that installed app.

macOS requires Screen Recording permission. The build script preserves the bundle identifier and stable designated code requirement. For a one-time migration from early hash-based builds, remove only RTP Companion's old Screen Recording entry, add the current app, then choose **Quit & Reopen**. Normal updates retain the stable identity.

## Privacy and limits

- Reads only the selected Minecraft window's visible pixels, locally. No audio is requested.
- No Minecraft mods, game files, process memory, packet inspection, login or API token.
- No mouse/keyboard automation, automatic RTP, movement or mining.
- No screen uploads, analytics or coordinate transmission. Positions remain in memory; CSV export is an explicit local download.
- The desktop app serves bundled files on a random loopback port. Its server fetches only the public heatmap and region endpoints at `api.donut.auction`, with no player coordinates in requests.

This avoids modifying Minecraft, but cannot guarantee zero detection or ban risk. DonutSMP staff decide which tools are allowed. Follow [the server rules](https://rules.donutsmp.net/).

Map colors show raw RTP observations on a logarithmic scale. Dark areas do not guarantee safety, lack of bases or impossible RTPs. Data and regions can change. Public data is fetched on opening/manual refresh and cached in memory for one hour.

## Develop and build on Windows

Install Node.js 22 LTS and Git, clone this repository, then run:

```powershell
npm ci
npm run assets
npm start
```

`npm run assets` copies the pinned OCR engine and downloads the English model with SHA-256 verification. The app bundles these files, so no OCR assets are downloaded while playing.

```powershell
npm test
npx playwright install chromium
npm run test:browser
npm run test:auto
npm run test:electron
npm run build:windows
```

Outputs appear in `dist/`. GitHub Actions runs these checks on Windows and uploads installer/ZIP artifacts. Builds need no publishing credentials; releases are published separately.

The optional browser fallback runs with `npm run assets` and `npm run start:browser` at `http://localhost:4317` in Chrome/Edge. It uses a screen picker and manual crop. `Start-Windows.cmd` starts the desktop development app after dependencies are installed.

## Source layout

| Path | Purpose |
| --- | --- |
| `electron/` | Windows shell, restricted preload and Minecraft window selection |
| `public/` | Map, automatic/manual OCR, coordinate confirmation and region labels |
| `server.cjs` | Bundled files and fixed public-map proxy routes |
| `native/` | Native Mac source, icon and build script |
| `test/` | Core/server checks and synthetic browser/Electron OCR checks |
| `.github/workflows/windows.yml` | Windows testing and packaging |
| `WINDOWS_HANDOFF.md` | Context and hardware-validation checklist for Codex |

Original code is [MIT licensed](LICENSE). [THIRD_PARTY.md](THIRD_PARTY.md) lists OCR, Electron and map attribution. Independent of Donut Auction, DonutSMP, Mojang and Microsoft.

# CS2 Companion

A local-first desktop companion app for **Counter-Strike 2**. It captures live game
data via Valve's official **Game State Integration (GSI)**, enriches it after each
match by parsing the demo file, stores everything in a local SQLite database, and
surfaces improvement-focused stats in a polished dashboard.

> **Status:** early scaffold. The project structure, build tooling, GSI listener,
> SQLite layer, IPC bridge, and a live dashboard panel are in place. The demo
> enrichment pipeline and most UI panels are stubbed and ready to be built out.
> The full design lives in [`cs2-companion-spec (1).md`](./cs2-companion-spec%20(1).md).

---

## How it works

```
CS2 ──HTTP POST (GSI JSON)──▶ localhost:3000 ──▶ Electron main process
                                                  ├─ GSI listener  → SQLite
                                                  ├─ Demo pipeline  → SQLite  (post-match)
                                                  └─ IPC ──▶ React dashboard (renderer)
```

- **Push-based:** CS2 sends state to the app; nothing is polled.
- **No login:** your profile is the SteamID64 inside the GSI payload.
- **Anti-cheat safe:** GSI is Valve's sanctioned API (the same one tournament
  broadcasts use). It does not read memory, inject code, or mod the game.

---

## Tech stack

| Layer        | Choice                                   |
| ------------ | ---------------------------------------- |
| Desktop      | Electron + electron-builder (NSIS `.exe`) |
| Build tool   | electron-vite (Vite HMR)                  |
| UI           | React 18 + Tailwind CSS + shadcn/ui       |
| Charts       | Recharts                                  |
| Database     | better-sqlite3 (single local `.db` file)  |
| GSI listener | Node `http` module on `localhost:3000`    |
| Demo parsing | `@laihoe/demoparser2` (Rust core)         |
| Demo download| `steam-user` + `globaloffensive`          |

---

## Prerequisites

- **Node.js 20+** and npm. Verified on Node 24.
- **For live data / packaging:** Windows with CS2 installed via Steam.
- **For demo enrichment:** the Steam client running and logged in.

> **Native modules:** `better-sqlite3` ships prebuilt binaries for both Node and
> Electron, so a normal `npm install` downloads them — **no C++ compiler needed.**
> Only if a prebuilt binary is missing for your exact runtime does it fall back to
> compiling from source, which would need a C++ toolchain (VS Build Tools with the
> "Desktop development with C++" workload + Python 3 on Windows; Xcode CLT on macOS).

---

## Getting started (development)

```bash
git clone https://github.com/Mellidium/cs2-app.git
cd cs2-app
npm install            # postinstall rebuilds native modules against Electron
npm run dev            # launches Electron with hot-reload
```

`npm run dev` opens the app window and starts the GSI listener on
`http://127.0.0.1:3000`. On first launch it generates an auth token and (on
Windows) writes the GSI config into your CS2 install.

> If native modules fail to load after an Electron upgrade, run `npm run rebuild`.

### Developing without CS2 (macOS or no game running)

You don't need CS2 to work on the UI, listener, or database. Feed the app
synthetic GSI events with the mock sender:

```bash
# Terminal 1
npm run dev

# Terminal 2 — token must match the running app's token (see below)
GSI_TOKEN=<token> npm run mock-gsi
```

Find the app's token in its user-data folder, in `gsi-token.json`:

- **Windows:** `%APPDATA%\cs2-companion\gsi-token.json`
- **macOS:** `~/Library/Application Support/cs2-companion/gsi-token.json`

The live panel updates as the mock sender simulates a short match.

### Connecting real CS2 on macOS

Auto-setup only runs on Windows. To test against real CS2 on macOS, generate a
config and copy it into the game's cfg folder manually:

```bash
npm run gen-cfg     # writes gamestate_integration_companion.cfg + prints a token
```

Copy that file into
`~/Library/Application Support/Steam/steamapps/common/Counter-Strike Global Offensive/game/csgo/cfg/`,
put the printed token into the app's `gsi-token.json`, then restart CS2.

### Adding UI components

shadcn/ui copies component source into [`src/renderer/components/ui/`](src/renderer/components/ui/):

```bash
npx shadcn@latest add button card tabs badge
```

---

## Project layout

```
src/
├── main/                 # Electron main process
│   ├── index.ts          #   app entry: window, GSI server, IPC wiring
│   ├── gsi-server.ts     #   HTTP listener on :3000, payload → LiveGameState
│   ├── gsi-types.ts      #   raw GSI payload types
│   ├── database.ts       #   better-sqlite3 wrapper + schema
│   ├── ipc-handlers.ts   #   renderer → main request/response handlers
│   ├── auto-setup.ts     #   Windows registry lookup + .cfg writer (no-op elsewhere)
│   ├── tray.ts           #   system tray icon + menu
│   └── demo/             #   post-match demo enrichment (stubs)
├── preload/index.ts      # contextBridge → window.electronAPI
├── renderer/             # React dashboard (Vite)
│   ├── App.tsx, main.tsx
│   ├── components/        #   LivePanel + (planned) panels, ui/ = shadcn
│   ├── hooks/             #   useGSI, useStats
│   ├── lib/utils.ts       #   cn() helper
│   └── styles/globals.css
└── shared/types.ts       # types shared across main ↔ renderer

scripts/                  # gen-cfg, mock-gsi-sender
resources/                # app + tray icons (placeholders — see resources/README.md)
```

---

## npm scripts

| Script                 | What it does                                            |
| ---------------------- | ------------------------------------------------------- |
| `npm run dev`          | Launch app with HMR + GSI listener                      |
| `npm run build`        | Type-check and build main/preload/renderer to `out/`    |
| `npm run typecheck`    | Type-check node + web projects                           |
| `npm run mock-gsi`     | POST synthetic GSI payloads to a running app            |
| `npm run gen-cfg`      | Generate a GSI `.cfg` for manual install                |
| `npm run rebuild`      | Rebuild `better-sqlite3` against the current Electron    |
| `npm run package:win`  | Build + produce the Windows NSIS installer (`release/`) |
| `npm run package:dir`  | Build an unpacked app dir (fast packaging sanity check) |

---

## Building the Windows installer

Run on Windows (cross-compiling native modules from macOS is not supported here):

```bash
npm run package:win
```

The signed-or-unsigned NSIS installer lands in `release/`. Add real icons to
[`resources/`](resources/README.md) first (`icon.ico` is referenced by the build).

---

## Installation & usage (end user)

1. Download and run the **CS2 Companion** installer (`.exe`).
2. Launch the app once. It auto-detects your CS2 install and writes the GSI
   config. If CS2 is open, **restart it** so the config loads.
3. Play CS2 normally. Live stats appear in the dashboard as you play.
4. After each match, the app downloads and parses the demo in the background to
   fill in deeper improvement stats (requires the Steam client to be running).

No account, login, or configuration is required — your profile is detected
automatically from the game.

---

## License

[MIT](./LICENSE) © Mellidium

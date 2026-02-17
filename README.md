<p align="center">
  <img src="https://img.shields.io/badge/⚡-QDM-6c5ce7?style=for-the-badge&logoColor=white" alt="QDM" />
</p>

<h1 align="center">Quantum Download Manager</h1>

<p align="center">
  <strong>A modern, open-source download manager for Windows</strong><br>
  <em>Multi-segment downloading • Pause/Resume • Beautiful UI • Free & Open Source</em>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#development">Development</a> •
  <a href="#credits">Credits</a> •
  <a href="#license">License</a>
</p>

---

## ✨ Features

- **⚡ Multi-Segment Downloads** — Split files into multiple segments downloaded in parallel for maximum speed (inspired by XDM/IDM)
- **⏸️ Pause & Resume** — Pause downloads and resume them later, even after closing the app
- **📂 Smart Categorization** — Automatically categorizes downloads by file type (compressed, documents, music, videos, programs)
- **🎨 Modern Dark UI** — Beautiful, clean interface designed for productivity
- **🔄 Retry Failed Downloads** — Automatically retry failed segments without restarting the entire download
- **📊 Real-Time Segment Visualization** — See each download segment's progress in real-time
- **🔍 Search & Filter** — Quickly find downloads with search and category filters
- **⚙️ Configurable** — Customize max segments, concurrent downloads, speed limits, and more
- **💾 State Persistence** — Downloads survive app restarts with automatic state saving
- **🖥️ Custom Title Bar** — Native-feeling frameless window with custom controls

## 🏗️ Architecture

QDM is built with a modern tech stack:

- **Electron** — Cross-platform desktop framework
- **React 18** — UI library with hooks
- **TypeScript** — Type safety throughout
- **Vite** — Lightning-fast build tool
- **Tailwind CSS** — Utility-first styling
- **Zustand** — Lightweight state management
- **Lucide React** — Beautiful icons

### Download Engine

The download engine implements **multi-segment/multi-connection downloading**, inspired by [XDM's architecture](https://github.com/subhra74/xdm):

1. **URL Probing** — HEAD request to determine file size, resumability, and filename
2. **Segment Splitting** — File divided into N segments based on configuration
3. **Parallel Download** — Each segment downloaded via separate HTTP connection with Range headers
4. **Progress Tracking** — Real-time speed calculation with moving averages
5. **File Assembly** — Segments assembled into final file in correct order
6. **State Persistence** — Segment states saved to disk for crash recovery

```
┌──────────────────────────────────────────────┐
│                  File (100 MB)                │
├───────────┬───────────┬──────────┬───────────┤
│ Segment 1 │ Segment 2 │ Segment 3│ Segment 4 │
│  25 MB    │  25 MB    │  25 MB   │  25 MB    │
│ ████████░ │ ██████░░░ │ ████░░░░ │ ██░░░░░░░ │
│ Conn #1   │ Conn #2   │ Conn #3  │ Conn #4   │
└───────────┴───────────┴──────────┴───────────┘
```

## 📦 Installation

### Pre-built Releases

Download the latest release from the [Releases page](https://github.com/CloudflareHackers/QDM/releases):

| File | Description |
|------|-------------|
| `QDM-Setup-x.x.x-x64.exe` | Windows Installer (NSIS) — installs to Program Files |
| `QDM-Portable-x.x.x.exe` | Portable version — no installation needed, run anywhere |

### Build from Source

```bash
# Clone the repository
git clone https://github.com/CloudflareHackers/QDM.git
cd QDM

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run electron:build
```

## 🛠️ Development

```bash
# Start development server (UI only, hot-reload)
npm run dev

# Start with Electron (full app)
npm run electron:dev

# Build production app
npm run electron:build
```

## 📦 Packaging for Windows (.exe)

### Method 1: Local Build (on Windows)

```bash
# Build NSIS installer (.exe setup)
npm run electron:build:win

# Build portable version (single .exe, no install)
npm run electron:build:win:portable

# Output will be in the release/ folder:
#   release/QDM-Setup-1.0.0-x64.exe     (installer)
#   release/QDM-Portable-1.0.0.exe      (portable)
```

### Method 2: GitHub Actions (Automated)

The project includes a GitHub Actions workflow that automatically builds Windows executables:

1. **On every push to `main`**: Builds are uploaded as GitHub Actions artifacts
2. **On tag push (e.g., `v1.0.0`)**: Automatically creates a GitHub Release with downloadable .exe files

To create a release:
```bash
git tag v1.0.0
git push origin v1.0.0
# GitHub Actions will build and create a release with .exe files
```

### Method 3: Cross-compile from macOS/Linux

You can build Windows .exe from macOS or Linux using Wine:
```bash
# Install Wine (macOS)
brew install --cask wine-stable

# Then build normally
npm run electron:build:win
```

### Custom Icon

To set a custom app icon:
1. Create a 512×512 PNG image and save as `build/icon.png`
2. Generate platform icons:
   ```bash
   npx electron-icon-builder --input=build/icon.png --output=build
   ```
3. This creates `build/icon.ico` (Windows) and `build/icon.icns` (macOS)

### Available Build Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (UI only, hot-reload) |
| `npm run electron:dev` | Start full Electron app in dev mode |
| `npm run electron:build` | Build for current platform |
| `npm run electron:build:win` | Build Windows NSIS installer + portable |
| `npm run electron:build:win:portable` | Build Windows portable only |
| `npm run electron:build:linux` | Build Linux AppImage + .deb |
| `npm run electron:build:mac` | Build macOS .dmg |

### Project Structure

```
QDM/
├── electron/                 # Electron main process
│   ├── main.ts              # App entry, window management, IPC
│   ├── preload.ts           # Context bridge (main ↔ renderer)
│   ├── download-engine.ts   # Multi-segment download engine
│   └── types.ts             # Shared TypeScript types
├── src/                     # React renderer
│   ├── main.tsx             # React entry
│   ├── App.tsx              # Root component
│   ├── index.css            # Tailwind + custom styles
│   ├── components/          # UI components
│   │   ├── TitleBar.tsx     # Custom window title bar
│   │   ├── Sidebar.tsx      # Category navigation
│   │   ├── Toolbar.tsx      # Action toolbar
│   │   ├── DownloadList.tsx # Download list with segments
│   │   ├── NewDownloadDialog.tsx
│   │   ├── SettingsDialog.tsx
│   │   └── AboutDialog.tsx
│   ├── store/               # Zustand state management
│   ├── types/               # TypeScript types
│   └── utils/               # Formatting utilities
├── index.html               # HTML entry
├── vite.config.ts           # Vite + Electron config
├── tailwind.config.js       # Tailwind theme
└── package.json
```

## 🙏 Credits & Acknowledgments

### XDM (Xtreme Download Manager)
**By [subhra74](https://github.com/subhra74)** — [github.com/subhra74/xdm](https://github.com/subhra74/xdm)

QDM's download engine architecture is directly inspired by XDM's brilliant multi-segment download approach. XDM pioneered the open-source download manager space with features like:
- Multi-segment file downloading with dynamic piece splitting
- HTTP Range header-based resume support
- Segment state persistence and crash recovery
- Speed calculation with moving averages

QDM is a spiritual successor to XDM, which is no longer actively maintained. We carry forward its legacy with a modern tech stack and fresh UI design. **Thank you, subhra74, for your incredible work.**

### IDM (Internet Download Manager)
**By [Tonec Inc.](https://www.internetdownloadmanager.com/)**

IDM has been the gold standard in download acceleration for decades. Their pioneering work in segmented download technology established the patterns that the entire download manager category follows today. We acknowledge and honor their hard work and innovation.

### Open Source Community

QDM is built on the shoulders of giants:
- [Electron](https://www.electronjs.org/) by GitHub
- [React](https://react.dev/) by Meta
- [Vite](https://vitejs.dev/) by Evan You
- [Tailwind CSS](https://tailwindcss.com/) by Tailwind Labs
- [Zustand](https://github.com/pmndrs/zustand) by Poimandres
- [Lucide Icons](https://lucide.dev/)

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/CloudflareHackers">CloudflareHackers</a>
</p>

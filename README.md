# Origin Reader

A Windows desktop reader inspired by the supplied concept: see a few large words, then move forward or back at your own pace.

## Open the app

Double-click **release/Origin-Reader-1.0.0.exe**. This portable build needs no installer. It is unsigned, so Windows may show an unfamiliar-app warning.

Open a PDF, `.txt`, or `.md` document with **Open document**, **Ctrl+O**, or drag and drop. Use **→** for the next words and **←** for the previous words. The on-screen buttons do the same thing.

- **Reading settings:** 1–24 words per step, text size, and serif or sans serif font. Text scales down if needed to fit the window.
- **Page context:** see the text of the current page with your current phrase highlighted.
- **Progress bar:** jump within the document. **Home / End:** first or last group.
- **F11:** full screen. The sun button changes between dark and light themes.
- Your library, reading positions, and preferences are stored locally in the Windows application data folder. Documents are never uploaded. Removing a library entry leaves the original file alone.

PDFs need selectable text. Image-only scans need OCR first. PDF columns and complex layouts may not always extract in their intended reading order. Password-protected PDFs prompt for their password. The file limit is 100 MB.

## Develop

Requires Node.js 22.13 or newer and npm.

```powershell
npm install
npm start
```

```powershell
npm test
npm run test:e2e
npm run build
```

The app uses Electron, plain HTML/CSS/JavaScript, and Mozilla PDF.js. It runs offline after installation. The renderer uses context isolation and sandboxing; only file selection and full-screen control are exposed by the preload bridge. The end-to-end tests launch the real desktop app with an isolated local profile and exercise navigation, settings, PDF extraction, reading-position persistence, error handling, library removal, and narrow-window fitting.

The Windows build is in `release/`. To move the unpacked build, copy the entire `release/win-unpacked` folder, then open `Origin Reader.exe` inside it.

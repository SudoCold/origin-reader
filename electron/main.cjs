const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

if (process.env.ORIGIN_TEST_DATA) app.setPath('userData', process.env.ORIGIN_TEST_DATA);
let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 860, minWidth: 420, minHeight: 560,
    title: 'Origin Reader', backgroundColor: '#131714', show: false,
    autoHideMenuBar: true, titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#131714', symbolColor: '#aab2a7', height: 40 },
    icon: path.join(__dirname, '../assets/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      spellcheck: false,
    },
  });
  Menu.setApplicationMenu(null);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.loadFile(path.join(__dirname, '../src/index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
}
ipcMain.handle('document:open', async event => {
  if (event.sender !== mainWindow?.webContents) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open a document', properties: ['openFile'],
    filters: [{ name: 'Reading documents', extensions: ['pdf', 'txt', 'md'] }],
  });
  if (result.canceled) return null;
  const file = result.filePaths[0];
  const stat = await fs.stat(file);
  if (stat.size > 100 * 1024 * 1024) throw new Error('Choose a document smaller than 100 MB.');
  return { name: path.basename(file), bytes: new Uint8Array(await fs.readFile(file)) };
});
ipcMain.handle('window:fullscreen', event => {
  if (event.sender === mainWindow?.webContents) mainWindow.setFullScreen(!mainWindow.isFullScreen());
});
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

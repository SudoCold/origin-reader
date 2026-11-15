const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

let app, window, dataPath;
const root = path.resolve(__dirname, '../..');
test.beforeAll(async () => {
  dataPath = await fs.mkdtemp(path.join(root, '.cache', 'test-profile-'));
  app = await electron.launch({
    ...(process.env.ORIGIN_EXECUTABLE ? { executablePath: process.env.ORIGIN_EXECUTABLE } : {}),
    args: process.env.ORIGIN_EXECUTABLE ? [] : [root],
    env: { ...process.env, ORIGIN_TEST_DATA: dataPath },
  });
  window = await app.firstWindow();
  window.on('pageerror', error => console.error('Renderer error:', error));
  window.on('console', message => { if (message.type() === 'error') console.error('Renderer console:', message.text()); });
  await expect(window.locator('#reading-text')).not.toBeEmpty();
});
test.afterAll(async () => { await app?.close(); });
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus) {
    console.log(await window.locator('body').innerText());
    await window.screenshot({ path: info.outputPath('failure.png') });
  }
});

test('keyboard and buttons move forward and backward with safe boundaries', async () => {
  const first = await window.locator('#reading-text').textContent();
  await expect(window.locator('#previous')).toBeDisabled();
  await window.keyboard.press('ArrowLeft');
  await expect(window.locator('#reading-text')).toHaveText(first);
  await window.keyboard.press('ArrowRight');
  await expect(window.locator('#reading-text')).not.toHaveText(first);
  await window.locator('#previous').click();
  await expect(window.locator('#reading-text')).toHaveText(first);
  await window.locator('#next').click();
  await expect(window.locator('#chunk-count')).toContainText('2');
  await window.keyboard.press('End');
  await expect(window.locator('#next')).toBeDisabled();
  await expect(window.locator('#percent-label')).toHaveText('100%');
  await expect(window.locator('#end-label')).toBeVisible();
  await window.keyboard.press('Home');
  await expect(window.locator('#reading-text')).toHaveText(first);
});

test('settings change chunk size, font, and theme without stealing range keys', async () => {
  await window.locator('#toggle-settings').click();
  await window.locator('#words-per-step').fill('3');
  await expect(window.locator('#reading-text')).toHaveText('There is a');
  await window.locator('#words-per-step').focus();
  await window.keyboard.press('ArrowRight');
  await expect(window.locator('#words-value')).toHaveText('4');
  await expect(window.locator('#chunk-count')).toContainText('1');
  await window.locator('#font-family').selectOption('sans');
  await window.locator('#font-size').fill('80');
  await window.locator('#close-settings').click();
  await window.locator('#toggle-theme').click();
  await expect(window.locator('html')).toHaveAttribute('data-theme', 'light');
  await window.locator('#toggle-theme').click();
  await window.locator('#toggle-settings').click();
  await window.locator('#words-per-step').fill('6');
  await window.locator('#font-size').fill('64');
  await window.locator('#font-family').selectOption('serif');
  await window.locator('#close-settings').click();
});

test('page context highlights the current phrase and does not navigate behind the dialog', async () => {
  const words = await window.locator('#reading-text').textContent();
  await window.locator('#show-source').click();
  await expect(window.locator('#source-text mark')).toHaveText(words);
  await window.keyboard.press('ArrowRight');
  await expect(window.locator('#reading-text')).toHaveText(words);
  await window.keyboard.press('Escape');
  await expect(window.locator('#source-dialog')).not.toBeVisible();
});

test('imports text, restores reading position after reload, and handles duplicate documents', async () => {
  const file = { name: 'My reading.txt', mimeType: 'text/plain', buffer: Buffer.from('One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen.') };
  const fixturePath = path.join(dataPath, file.name);
  await fs.writeFile(fixturePath, file.buffer);
  await app.evaluate(({ dialog }, selectedPath) => {
    global.originalOpenDialog = dialog.showOpenDialog;
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] });
  }, fixturePath);
  await window.locator('#open-document').click();
  await expect(window.locator('#document-title')).toHaveText('My reading');
  await expect(window.locator('#reading-text')).toHaveText('One two three four five six');
  await app.evaluate(({ dialog }) => { dialog.showOpenDialog = global.originalOpenDialog; });
  await window.keyboard.press('ArrowRight');
  await expect(window.locator('#reading-text')).toHaveText('seven eight nine ten eleven twelve');
  await expect.poll(() => window.evaluate(async () => {
    const db = await new Promise(resolve => { const req = indexedDB.open('origin-reader', 1); req.onsuccess = () => resolve(req.result); });
    return new Promise(resolve => { const req = db.transaction('documents').objectStore('documents').getAll(); req.onsuccess = () => resolve(req.result.find(doc => doc.name === 'My reading')?.word); });
  })).toBe(6);
  await window.reload();
  await expect(window.locator('#document-title')).toHaveText('My reading');
  await expect(window.locator('#reading-text')).toHaveText('seven eight nine ten eleven twelve');
  await window.locator('#file-input').setInputFiles(file);
  await expect(window.locator('#loading')).not.toBeVisible();
  await expect(window.locator('#library-count')).toHaveText('2');
  await expect(window.locator('#reading-text')).toHaveText('seven eight nine ten eleven twelve');
});

function makePdf(pages) {
  const objects = [null, '<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids = [];
  for (const text of pages) {
    const number = objects.length;
    kids.push(`${number} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 3 0 R >> >> /Contents ${number + 1} 0 R >>`);
    const stream = `BT /F1 16 Tf 50 700 Td (${text}) Tj ET`;
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${kids.join(' ')}] >>`;
  let result = '%PDF-1.4\n';
  const offsets = [0];
  for (let n = 1; n < objects.length; n++) { offsets.push(Buffer.byteLength(result)); result += `${n} 0 obj\n${objects[n]}\nendobj\n`; }
  const xref = Buffer.byteLength(result);
  result += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  result += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  result += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(result);
}

test('extracts an actual multi-page PDF and navigates across page boundaries', async () => {
  await window.locator('#file-input').setInputFiles({ name: 'Research.pdf', mimeType: 'application/pdf', buffer: makePdf(['This study comprehensively explores virtual reality technology.', 'Second page with a final thought.']) });
  await expect(window.locator('#document-title')).toHaveText('Research');
  await expect(window.locator('#reading-text')).toHaveText('This study comprehensively explores virtual reality');
  await expect(window.locator('#page-label')).toHaveText('PAGE 1 OF 2');
  await window.keyboard.press('ArrowRight');
  await expect(window.locator('#reading-text')).toHaveText('technology.');
  await window.keyboard.press('ArrowRight');
  await expect(window.locator('#page-label')).toHaveText('PAGE 2 OF 2');
  await expect(window.locator('#reading-text')).toHaveText('Second page with a final thought.');
  await window.keyboard.press('ArrowLeft');
  await expect(window.locator('#reading-text')).toHaveText('technology.');
});

test('handles empty, corrupt, and scanned files without replacing the current read', async () => {
  await window.locator('#file-input').setInputFiles({ name: 'Empty.txt', mimeType: 'text/plain', buffer: Buffer.from('   ') });
  await expect(window.locator('#toast')).toContainText('empty');
  await expect(window.locator('#document-title')).toHaveText('Research');
  await window.locator('#file-input').setInputFiles({ name: 'Broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a pdf') });
  await expect(window.locator('#toast')).toContainText('damaged');
  await window.locator('#file-input').setInputFiles({ name: 'Scan.pdf', mimeType: 'application/pdf', buffer: makePdf(['']) });
  await expect(window.locator('#toast')).toContainText('OCR');
  await expect(window.locator('#document-title')).toHaveText('Research');
});

test('removes a document permanently and handles a narrow window', async () => {
  await window.getByRole('button', { name: 'Remove Research from library', exact: true }).click({ force: true });
  await expect(window.locator('#library-count')).toHaveText('2');
  await window.reload();
  await expect(window.locator('#library-count')).toHaveText('2');
  await expect(window.locator('#document-title')).not.toHaveText('Research');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(460, 640));
  await window.locator('#toggle-library').click();
  await expect(window.locator('#sidebar')).toBeVisible();
  await window.locator('.library-open').filter({ hasText: 'The art of paying attention' }).click();
  await expect(window.locator('#sidebar')).not.toBeVisible();
  const fits = await window.locator('#reading-text').evaluate(element => {
    const a = element.getBoundingClientRect(), b = document.querySelector('#word-area').getBoundingClientRect();
    return a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom;
  });
  expect(fits).toBeTruthy();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 860));
  await window.locator('body').click({ position: { x: 950, y: 140 } });
  await window.keyboard.press('Home');
  await window.screenshot({ path: path.join(root, 'assets', 'origin-reader-preview.png'), animations: 'disabled' });
});

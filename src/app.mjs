import { makeChunks, chunkAtWord, tokenize, extractPageText } from './reader.mjs';
import { listDocuments, saveDocument, deleteDocument } from './storage.mjs';

const $ = selector => document.querySelector(selector);
const icons = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  document: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  sliders: '<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  'arrow-left': '<path d="m11 5-7 7 7 7M4 12h16"/>',
  'arrow-right': '<path d="m13 5 7 7-7 7M20 12H4"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  align: '<path d="M4 5h16M4 10h16M4 15h16M4 20h10"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || ''}</svg>`;
document.querySelectorAll('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon); });

const sample = {
  id: 'origin-welcome', name: 'The art of paying attention', type: 'GUIDE', word: 0,
  pages: [
    'There is a quiet kind of clarity that comes from slowing down. From letting a single thought arrive before reaching for the next. We built Origin around that feeling. A little less on the screen. A little more room in your mind. This is your space to read at your own pace, a few words at a time. Press the right arrow to keep going. Press the left arrow whenever you want to return. There is no timer, no finish line, and no need to rush.',
    'Make yourself comfortable. Open a PDF or a text file using the button in your library, or simply drop one into this window. Origin brings the words forward and lets the rest fall away. In Reading settings, choose how many words appear at once and find a text size that feels right. Try a single word for a deliberate pace, or a longer phrase to follow the flow of an idea. Your reading position is saved automatically on this device. When you return, your place will be waiting.',
    'Sometimes a thought needs its surroundings. Open Page context below to see the full text of the page you are reading. Your current words will be highlighted, so you can find your way back. Use the progress bar to move to a different part of your document. Change the color theme for a softer page, or enter full screen for a little more quiet. That is all you need. A document, a comfortable space, and your curiosity. One small step at a time. Happy reading.',
  ],
};
let settings;
try { settings = JSON.parse(localStorage.getItem('origin-settings') || '{}'); } catch { settings = {}; }
settings = {
  words: Math.max(1, Math.min(24, Number(settings.words) || 6)),
  fontSize: Math.max(32, Math.min(96, Number(settings.fontSize) || 64)),
  font: settings.font === 'sans' ? 'sans' : 'serif', theme: settings.theme === 'light' ? 'light' : 'dark',
};
let documents = [];
let current = structuredClone(sample);
let chunks = [];
let index = 0;
let busy = false;
let persistTimer;
let toastTimer;
let pendingPassword;
let pdfTask;
let passwordCancelled = false;
let storageAvailable = true;

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 6000);
}

function applySettings() {
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.style.setProperty('--reading-font', settings.font === 'sans' ? "'Segoe UI', Arial, sans-serif" : 'var(--serif)');
  $('#words-per-step').value = settings.words;
  $('#words-value').textContent = settings.words;
  $('#font-size').value = settings.fontSize;
  $('#font-value').textContent = settings.fontSize;
  $('#font-family').value = settings.font;
  $('#words-label').textContent = `${settings.words} ${settings.words === 1 ? 'word' : 'words'} at a time`;
  $('#toggle-theme').setAttribute('aria-label', `Switch to ${settings.theme === 'dark' ? 'light' : 'dark'} theme`);
  try { localStorage.setItem('origin-settings', JSON.stringify(settings)); } catch { /* Reading still works without preferences. */ }
}

function fitText() {
  const area = $('#word-area');
  const text = $('#reading-text');
  if (!area.clientHeight) return;
  const style = getComputedStyle(area);
  const availableHeight = area.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const availableWidth = area.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  let size = settings.fontSize;
  text.style.fontSize = `${size}px`;
  while (size > 16 && (text.scrollHeight > availableHeight || text.scrollWidth > availableWidth)) {
    size -= 2;
    text.style.fontSize = `${size}px`;
  }
}

function updateLibrary() {
  const list = $('#library-list');
  list.replaceChildren();
  $('#library-count').textContent = documents.length;
  for (const doc of documents) {
    const row = document.createElement('div');
    row.className = `library-item${current.id === doc.id ? ' active' : ''}`;
    const button = document.createElement('button');
    button.className = 'library-open';
    button.innerHTML = `${icon('document')}<div><span class="library-name"></span><span class="library-detail"></span></div>`;
    button.querySelector('.library-name').textContent = doc.name;
    button.querySelector('.library-detail').textContent = `${doc.type}  ·  ${doc.pages.length} ${doc.pages.length === 1 ? 'page' : 'pages'}`;
    button.title = doc.name;
    button.setAttribute('aria-current', String(doc.id === current.id));
    button.onclick = () => { if (!busy) { switchDocument(doc); $('#sidebar').classList.remove('open'); } };
    row.append(button);
    if (doc.id !== sample.id) {
      const remove = document.createElement('button');
      remove.className = 'library-remove';
      remove.setAttribute('aria-label', `Remove ${doc.name} from library`);
      remove.title = 'Remove from library';
      remove.innerHTML = icon('close');
      remove.onclick = async () => {
        if (busy) return;
        clearTimeout(persistTimer);
        try { await deleteDocument(doc.id); } catch { toast('Could not remove this document from the saved library.'); return; }
        documents = documents.filter(item => item.id !== doc.id);
        if (current.id === doc.id) switchDocument(documents[0]);
        updateLibrary();
      };
      row.append(remove);
    }
    list.append(row);
  }
}

function persist() {
  clearTimeout(persistTimer);
  const snapshot = structuredClone(current);
  persistTimer = setTimeout(async () => {
    try {
      localStorage.setItem('origin-current', snapshot.id);
      if (storageAvailable) await saveDocument(snapshot);
    } catch { toast('Your device could not save this reading position. You can keep reading.'); }
  }, 180);
}

function render(animate = false) {
  const chunk = chunks[index];
  if (!chunk) return;
  $('#reading-text').textContent = chunk.text;
  if (animate) {
    $('#reading-text').classList.remove('enter');
    void $('#reading-text').offsetWidth;
    $('#reading-text').classList.add('enter');
  }
  $('#page-label').textContent = `PAGE ${chunk.page} OF ${current.pages.length}`;
  $('#chunk-count').replaceChildren(document.createTextNode(String(index + 1)), Object.assign(document.createElement('span'), { textContent: `/ ${chunks.length}` }));
  $('#previous').disabled = index === 0;
  $('#next').disabled = index === chunks.length - 1;
  const percentage = chunks.length === 1 ? 100 : Math.round(index / (chunks.length - 1) * 100);
  $('#percent-label').textContent = `${percentage}%`;
  $('#progress').max = chunks.length - 1;
  $('#progress').value = index;
  $('#progress').setAttribute('aria-valuetext', `Step ${index + 1} of ${chunks.length}, page ${chunk.page}`);
  $('#progress').style.background = `linear-gradient(to right, var(--accent) ${percentage}%, var(--border) ${percentage}%)`;
  const total = chunks.at(-1).start + chunks.at(-1).count;
  $('#progress-label').textContent = `${Math.min(total, chunk.start + chunk.count).toLocaleString()} of ${total.toLocaleString()} words`;
  $('#end-label').hidden = index !== chunks.length - 1;
  current.word = chunk.start;
  try { localStorage.setItem('origin-checkpoint', JSON.stringify({ id: current.id, word: current.word })); } catch { /* Best-effort checkpoint for immediate window closes. */ }
  fitText();
  persist();
}

function switchDocument(doc) {
  if (!doc) return;
  // Save the outgoing document before canceling its delayed write.
  clearTimeout(persistTimer);
  if (storageAvailable && documents.includes(current)) saveDocument(structuredClone(current)).catch(() => {});
  current = doc;
  chunks = makeChunks(current.pages, settings.words);
  index = chunkAtWord(chunks, current.word || 0);
  $('#document-title').textContent = current.name;
  $('#document-subtitle').textContent = current.id === sample.id ? 'A short introduction to Origin' : `${current.type} document · Saved on this device`;
  updateLibrary();
  render();
}

function navigate(delta) {
  if (busy || $('dialog[open]')) return;
  const target = Math.max(0, Math.min(chunks.length - 1, index + delta));
  if (target !== index) { index = target; render(true); }
}

async function requestPassword(callback, reason) {
  $('#password-error').textContent = reason === 2 ? 'That password did not match. Try again.' : '';
  $('#pdf-password').value = '';
  pendingPassword = callback;
  if (!$('#password-dialog').open) $('#password-dialog').showModal();
  $('#pdf-password').focus();
}

async function loadDocument(file) {
  if (busy || !file) return;
  if (!/\.(pdf|txt|md)$/i.test(file.name)) { toast('Choose a PDF, plain text (.txt), or Markdown (.md) file.'); return; }
  const nativeBytes = file.bytes && typeof file.bytes !== 'function' ? file.bytes : null;
  if ((file.size || nativeBytes?.byteLength || 0) > 100 * 1024 * 1024) { toast('Choose a document smaller than 100 MB.'); return; }
  busy = true;
  passwordCancelled = false;
  $('#loading').hidden = false;
  $('#loading-label').textContent = 'Opening your document…';
  $('#settings-panel').hidden = true;
  $('#toggle-settings').setAttribute('aria-expanded', 'false');
  try {
    const bytes = nativeBytes ? new Uint8Array(nativeBytes) : new Uint8Array(await file.arrayBuffer());
    // Content identity keeps reading positions separate even for identically named files.
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const id = Array.from(new Uint8Array(digest), item => item.toString(16).padStart(2, '0')).join('');
    const existing = documents.find(doc => doc.id === id);
    if (existing) { switchDocument(existing); return; }
    let pages;
    let type = 'TXT';
    if (/\.pdf$/i.test(file.name)) {
      type = 'PDF';
      const pdfjs = await import('../node_modules/pdfjs-dist/build/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('../node_modules/pdfjs-dist/build/pdf.worker.mjs', import.meta.url).href;
      pdfTask = pdfjs.getDocument({
        data: bytes,
        cMapUrl: new URL('../node_modules/pdfjs-dist/cmaps/', import.meta.url).href,
        cMapPacked: true,
        standardFontDataUrl: new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).href,
        wasmUrl: new URL('../node_modules/pdfjs-dist/wasm/', import.meta.url).href,
        isEvalSupported: false,
      });
      pdfTask.onPassword = requestPassword;
      const pdf = await pdfTask.promise;
      pages = [];
      for (let number = 1; number <= pdf.numPages; number++) {
        $('#loading-label').textContent = `Preparing page ${number} of ${pdf.numPages}…`;
        const page = await pdf.getPage(number);
        const content = await page.getTextContent();
        pages.push(extractPageText(content.items));
        page.cleanup();
      }
    } else {
      type = /\.md$/i.test(file.name) ? 'MD' : 'TXT';
      pages = new TextDecoder().decode(bytes).split('\f');
    }
    if (!pages.some(page => tokenize(page).length)) {
      throw new Error(type === 'PDF' ? 'This PDF has no selectable text. Scanned PDFs need OCR before Origin can read them.' : 'This document is empty. Try a file with some text.');
    }
    const doc = { id, name: file.name.replace(/\.(pdf|txt|md)$/i, '').replace(/[_]/g, ' '), pages, type, word: 0 };
    if (storageAvailable) {
      try { await saveDocument(doc); } catch { toast('The document is open, but your device could not save it to the library.'); }
    }
    documents.splice(0, 0, doc);
    switchDocument(doc);
    $('#sidebar').classList.remove('open');
  } catch (error) {
    if (!passwordCancelled) {
      console.error(error);
      toast(error?.name === 'InvalidPDFException' ? 'This PDF appears to be damaged. Try another file.' : error?.message || 'This document could not be opened. Try another file.');
    }
  } finally {
    if (pdfTask) { await pdfTask.destroy().catch(() => {}); pdfTask = null; }
    pendingPassword = null;
    $('#password-dialog').close();
    busy = false;
    $('#loading').hidden = true;
    $('#file-input').value = '';
  }
}

async function openDocument() {
  if (busy) return;
  if (window.desktop) {
    try { await loadDocument(await window.desktop.openDocument()); }
    catch (error) { toast(error.message || 'Could not open the document.'); }
  } else $('#file-input').click();
}

$('#open-document').onclick = openDocument;
$('#file-input').onchange = event => loadDocument(event.target.files[0]);
$('#previous').onclick = () => navigate(-1);
$('#next').onclick = () => navigate(1);
$('#progress').oninput = event => { if (!busy) { index = Number(event.target.value); render(); } };
$('#toggle-library').onclick = () => $('#sidebar').classList.toggle('open');
$('.brand').onclick = event => { event.preventDefault(); if (!busy) switchDocument(documents.find(doc => doc.id === sample.id)); };
$('#toggle-theme').onclick = () => { settings.theme = settings.theme === 'dark' ? 'light' : 'dark'; applySettings(); };
$('#fullscreen').onclick = () => window.desktop?.toggleFullscreen();
function toggleSettings(show) {
  const open = show ?? $('#settings-panel').hidden;
  $('#settings-panel').hidden = !open;
  $('#toggle-settings').setAttribute('aria-expanded', String(open));
}
$('#toggle-settings').onclick = () => toggleSettings();
$('#close-settings').onclick = () => toggleSettings(false);
document.addEventListener('pointerdown', event => { if (!event.target.closest('#settings-panel, #toggle-settings')) toggleSettings(false); });
$('#words-per-step').oninput = event => {
  settings.words = Number(event.target.value);
  const word = chunks[index]?.start || 0;
  chunks = makeChunks(current.pages, settings.words);
  index = chunkAtWord(chunks, word);
  applySettings(); render();
};
$('#font-size').oninput = event => { settings.fontSize = Number(event.target.value); applySettings(); fitText(); };
$('#font-family').onchange = event => { settings.font = event.target.value; applySettings(); fitText(); };
$('#show-source').onclick = () => {
  const chunk = chunks[index];
  if (!chunk) return;
  $('#source-title').textContent = `Page ${chunk.page} of ${current.pages.length}`;
  const pageWords = tokenize(current.pages[chunk.page - 1]);
  const pageStart = chunks.find(item => item.page === chunk.page).start;
  const position = chunk.start - pageStart;
  const mark = document.createElement('mark');
  mark.textContent = pageWords.slice(position, position + chunk.count).join(' ');
  $('#source-text').replaceChildren(document.createTextNode(pageWords.slice(0, position).join(' ') + (position ? ' ' : '')), mark, document.createTextNode(' ' + pageWords.slice(position + chunk.count).join(' ')));
  $('#source-dialog').showModal();
  mark.scrollIntoView({ block: 'center' });
};
$('#close-source').onclick = () => $('#source-dialog').close();
$('#source-dialog').onclick = event => {
  if (event.target !== $('#source-dialog')) return;
  const rect = event.target.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close();
};
$('#password-form').onsubmit = event => {
  event.preventDefault();
  const callback = pendingPassword;
  $('#password-dialog').close();
  callback?.($('#pdf-password').value);
};
async function cancelPassword() {
  passwordCancelled = true;
  pendingPassword = null;
  $('#password-dialog').close();
  await pdfTask?.destroy();
}
$('#cancel-password').onclick = cancelPassword;
$('#password-dialog').addEventListener('cancel', event => { event.preventDefault(); cancelPassword(); });

document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') { event.preventDefault(); if (!$('dialog[open]')) openDocument(); return; }
  if (event.key === 'F11') { event.preventDefault(); window.desktop?.toggleFullscreen(); return; }
  if (event.key === 'Escape') { toggleSettings(false); $('#sidebar').classList.remove('open'); return; }
  if (event.altKey || event.ctrlKey || event.metaKey || $('dialog[open]') || busy) return;
  if (event.target.closest('input, textarea, select, [contenteditable=true]')) return;
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault(); navigate(event.key === 'ArrowRight' ? 1 : -1);
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault(); index = event.key === 'Home' ? 0 : chunks.length - 1; render(true);
  }
});
let dragDepth = 0;
document.addEventListener('dragenter', event => {
  event.preventDefault();
  if ([...(event.dataTransfer?.types || [])].includes('Files')) { dragDepth++; if (!busy) $('#drop-overlay').hidden = false; }
});
document.addEventListener('dragover', event => event.preventDefault());
document.addEventListener('dragleave', event => { event.preventDefault(); if (--dragDepth <= 0) { dragDepth = 0; $('#drop-overlay').hidden = true; } });
document.addEventListener('drop', event => {
  event.preventDefault(); dragDepth = 0; $('#drop-overlay').hidden = true;
  loadDocument(event.dataTransfer.files[0]);
});
new ResizeObserver(() => fitText()).observe($('#word-area'));
document.addEventListener('visibilitychange', () => {
  if (document.hidden && storageAvailable) saveDocument(structuredClone(current)).catch(() => {});
});

async function initialize() {
  applySettings();
  try {
    documents = await listDocuments();
  } catch { storageAvailable = false; toast('Local saving is unavailable. You can still open and read documents.'); }
  if (!documents.some(doc => doc.id === sample.id)) documents.push(structuredClone(sample));
  let savedId;
  try { savedId = localStorage.getItem('origin-current'); } catch { /* Use the guide. */ }
  let checkpoint;
  try { checkpoint = JSON.parse(localStorage.getItem('origin-checkpoint')); } catch { /* Use the saved document. */ }
  const selected = documents.find(doc => doc.id === checkpoint?.id) || documents.find(doc => doc.id === savedId) || documents[0];
  if (selected.id === checkpoint?.id && Number.isFinite(checkpoint.word)) selected.word = checkpoint.word;
  switchDocument(selected);
}
initialize();

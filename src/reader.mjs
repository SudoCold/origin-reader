export function tokenize(text) {
  return text.replace(/\u00ad/g, '').trim().split(/\s+/u).filter(Boolean);
}

export function makeChunks(pages, size = 6) {
  size = Math.max(1, Math.min(24, Math.round(Number(size) || 6)));
  const chunks = [];
  let offset = 0;
  pages.forEach((text, index) => {
    const words = tokenize(text);
    for (let start = 0; start < words.length; start += size) {
      const selected = words.slice(start, start + size);
      chunks.push({ text: selected.join(' '), page: index + 1, start: offset + start, count: selected.length });
    }
    offset += words.length;
  });
  return chunks;
}

export function chunkAtWord(chunks, word) {
  const index = chunks.findIndex(chunk => chunk.start + chunk.count > word);
  return index < 0 ? Math.max(0, chunks.length - 1) : index;
}

// Use PDF positioning to retain spaces without splitting words composed of several glyph runs.
export function extractPageText(items) {
  let result = '';
  let previous = null;
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    if (previous && result && !/\s$/.test(result) && !/^\s/.test(item.str)) {
      const lineChanged = Math.abs((previous.transform?.[5] || 0) - (item.transform?.[5] || 0)) > 2;
      const gap = (item.transform?.[4] || 0) - ((previous.transform?.[4] || 0) + (previous.width || 0));
      const threshold = Math.max(0.6, Math.abs(previous.transform?.[0] || 10) * 0.08);
      if (previous.hasEOL || lineChanged || gap > threshold) {
        if (lineChanged && /[a-z]-$/i.test(result) && /^[a-z]/.test(item.str)) result = result.slice(0, -1);
        else result += ' ';
      }
    }
    result += item.str;
    previous = item;
  }
  return result.replace(/\s+/g, ' ').trim();
}

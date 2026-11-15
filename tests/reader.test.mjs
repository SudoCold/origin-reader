import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, makeChunks, chunkAtWord, extractPageText } from '../src/reader.mjs';

test('chunking visits every word exactly once and retains the PDF page number', () => {
  const pages = ['  This study comprehensively explores the incorporation of virtual reality. ', '', 'Second page\nwith a final thought.'];
  const chunks = makeChunks(pages, 4);
  assert.deepEqual(chunks.map(chunk => chunk.text), ['This study comprehensively explores', 'the incorporation of virtual', 'reality.', 'Second page with a', 'final thought.']);
  assert.deepEqual(chunks.map(chunk => chunk.page), [1, 1, 1, 3, 3]);
  assert.deepEqual(chunks.flatMap(chunk => tokenize(chunk.text)), pages.flatMap(tokenize));
  assert.deepEqual(chunks.map(chunk => chunk.start), [0, 4, 8, 9, 13]);
});

test('changing the number of words keeps the current word in view', () => {
  const chunks = makeChunks(['one two three four five six seven eight nine ten'], 3);
  assert.equal(chunkAtWord(chunks, 5), 1);
  assert.equal(chunkAtWord(chunks, 9), 3);
  assert.equal(chunkAtWord(chunks, 900), 3);
  assert.deepEqual(makeChunks(['  \n  '], 6), []);
});

test('word groups support multilingual text, soft hyphens, and safe size limits', () => {
  assert.deepEqual(tokenize('Hello\u00a0world\nre\u00adading 日本語'), ['Hello', 'world', 'reading', '日本語']);
  assert.equal(makeChunks(['one two three'], -5).length, 3);
  assert.equal(makeChunks(['one two three'], 'invalid').length, 1);
});

test('PDF extraction joins glyph runs, separates words, and repairs line-end hyphens', () => {
  const item = (str, x, y, width, hasEOL = false) => ({ str, transform: [12, 0, 0, 12, x, y], width, hasEOL });
  assert.equal(extractPageText([
    item('Compre', 0, 100, 40), item('hensive', 40, 100, 45),
    item('reading', 90, 100, 40), item('improves', 0, 80, 48),
  ]), 'Comprehensive reading improves');
  assert.equal(extractPageText([item('comprehen-', 0, 100, 60, true), item('sively', 0, 80, 30)]), 'comprehensively');
});

const assert = require('assert');
const Notepad = require('../notepad.js');
const ViewHistory = require('../history.js');

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
  };
}

let pass = 0, fail = 0;
function ok(desc, cond) {
  if (cond) pass++;
  else { fail++; console.error(`FAIL: ${desc}`); }
}

// --- Notepad ---
{
  const np = Notepad.create(memStorage());
  ok('empty list initially', np.list().length === 0);
  const entry = { seq: '1358280', shard: 'た', kanji: '食べる', reading: 'たべる', gloss: 'to eat' };
  np.save(entry, ['verb', 'food']);
  ok('saved entry appears', np.list().length === 1);
  ok('isSaved true', np.isSaved('1358280', 'た'));
  ok('isSaved false for other entry', !np.isSaved('999', 'あ'));
  np.addTag('1358280', 'た', 'jlpt-n5');
  ok('tag added', np.list()[0].tags.includes('jlpt-n5'));
  ok('allTags includes all three', np.allTags().length === 3);
  np.removeTag('1358280', 'た', 'food');
  ok('tag removed', !np.list()[0].tags.includes('food'));
  ok('byTag finds it', np.byTag('verb').length === 1);
  ok('byTag misses unrelated', np.byTag('nonexistent').length === 0);
  np.remove('1358280', 'た');
  ok('removed', np.list().length === 0);
}

// --- History ---
{
  const h = ViewHistory.create(memStorage(), 3);
  h.record({ kind: 'word', seq: '1', shard: 'あ', kanji: '愛', reading: 'あい', gloss: 'love' });
  h.record({ kind: 'kanji', char: '食' });
  h.record({ kind: 'word', seq: '2', shard: 'か', kanji: '海', reading: 'うみ', gloss: 'sea' });
  ok('3 entries, most recent first', h.list().length === 3 && h.list()[0].kind === 'word' && h.list()[0].seq === '2');
  h.record({ kind: 'word', seq: '1', shard: 'あ', kanji: '愛', reading: 'あい', gloss: 'love' });
  ok('revisit moves to front without duplicating', h.list().length === 3 && h.list()[0].seq === '1');
  h.record({ kind: 'word', seq: '3', shard: 'さ', kanji: '桜', reading: 'さくら', gloss: 'cherry blossom' });
  ok('cap enforced at max=3', h.list().length === 3);
  h.clear();
  ok('clear empties', h.list().length === 0);
}

console.log(`notepad+history: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

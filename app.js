// Farsi-Voc: Karteikarten-Trainer (PWA)
// Lernstand liegt im localStorage dieses Browsers.

const KEY = 'farsi-voc-v1';
const SESSION_SIZE = 20;
const GAP_MIN = 6;   // gewusste Wörter kommen frühestens nach 6 Sitzungen wieder
const GAP_MAX = 15;  // ... und spätestens nach 15 Sitzungen

let vocab = [];
let state = { session: 0, items: {}, wod: null, wodShown: false, lang: 'fa' };
let queue = [];
let cur = null;
let sess = { ok: 0, no: 0, total: 0 };
let mode = 'main';

// ---------- Speicher ----------
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = Object.assign(state, JSON.parse(raw));
  } catch (e) { /* kaputter Speicher: Standardwerte */ }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}

// ---------- Hilfen ----------
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const byId = id => vocab.find(v => v.id === id);
const $ = id => document.getElementById(id);

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id));
  window.scrollTo(0, 0);
}

// ---------- Wort des Tages ----------
function pickWod(exclude) {
  const pool = vocab.filter(v => v.id !== exclude);
  return pool[rnd(0, pool.length - 1)].id;
}
function refreshWod() {
  // Nach dem Ansehen wechselt das Wort beim nächsten Öffnen
  if (!state.wod || !byId(state.wod) || state.wodShown) {
    state.wod = pickWod(state.wod);
    state.wodShown = false;
    save();
  }
  const w = byId(state.wod);
  $('wod-fa').textContent = state.lang === 'fa' ? w.fa : w.de;
  $('wod-fa').lang = state.lang === 'fa' ? 'fa' : 'de';
  $('wod-reveal').classList.add('hidden');
  $('wod-btn').classList.remove('hidden');
}
function revealWod() {
  const w = byId(state.wod);
  $('wod-fin').textContent = w.fin;
  $('wod-de').textContent = state.lang === 'fa' ? w.de : w.fa;
  $('wod-reveal').classList.remove('hidden');
  $('wod-btn').classList.add('hidden');
  state.wodShown = true;
  save();
}

// ---------- Auswahl der Karten ----------
function isDue(id) {
  const it = state.items[id];
  if (!it) return true;                        // noch nie gesehen
  if (it.pile) return true;                    // im „nicht gewusst“-Haufen
  return it.next <= state.session;             // Pause vorbei
}

function buildSession() {
  const pile = vocab.filter(v => state.items[v.id] && state.items[v.id].pile).map(v => v.id);
  const due = vocab.filter(v => !pile.includes(v.id) && isDue(v.id)).map(v => v.id);
  shuffle(due);
  return [...shuffle(pile), ...due].slice(0, SESSION_SIZE);
}

// ---------- Sitzung ----------
function startSession() {
  mode = 'main';
  state.session += 1;
  queue = buildSession();
  sess = { ok: 0, no: 0, total: queue.length };
  save();
  if (!queue.length) { alert('Heute ist nichts offen.'); return; }
  show('s-card'); render();
}
function startRetry() {
  mode = 'retry';
  queue = vocab.filter(v => state.items[v.id] && state.items[v.id].pile).map(v => v.id);
  shuffle(queue);
  sess = { ok: 0, no: 0, total: queue.length };
  show('s-card'); render();
}

function render() {
  if (!queue.length) return finish();
  cur = byId(queue[0]);
  const done = sess.total - queue.length;
  $('bar').style.width = (sess.total ? done / sess.total * 100 : 0) + '%';
  $('pos').textContent = 'Karte ' + (done + 1) + ' von ' + sess.total;

  const faSide = state.lang === 'fa';
  const front = $('front');
  front.textContent = faSide ? cur.fa : cur.de;
  front.className = faSide ? 'front' : 'de';
  front.lang = faSide ? 'fa' : 'de';

  // Umschrift nur als Hilfe auf der Farsi-Seite, per Button
  $('fin').textContent = cur.fin;
  $('fin').classList.add('hidden');
  $('fin-btn').classList.toggle('hidden', !faSide);

  $('back').classList.add('hidden');
  $('back-fin').classList.add('hidden');
  $('hint').classList.remove('hidden');
  $('actions').classList.add('hidden');
}

function showFin() {
  $('fin').classList.remove('hidden');
  $('fin-btn').classList.add('hidden');
}

function flip() {
  if (!$('back').classList.contains('hidden')) return;
  const faSide = state.lang === 'fa';
  const back = $('back');
  back.textContent = faSide ? cur.de : cur.fa;
  back.className = faSide ? 'back' : 'front';
  back.lang = faSide ? 'de' : 'fa';
  back.classList.remove('hidden');
  // Auf der deutschen Seite immer die Umschrift darunter
  $('back-fin').textContent = cur.fin;
  $('back-fin').classList.remove('hidden');
  $('hint').classList.add('hidden');
  $('actions').classList.remove('hidden');
}

function answer(known) {
  const id = queue.shift();
  const it = state.items[id] || {};
  if (known) {
    state.items[id] = { pile: false, next: state.session + rnd(GAP_MIN, GAP_MAX) };
    sess.ok++;
  } else {
    state.items[id] = { pile: true, next: state.session };
    sess.no++;
    queue.push(id); // kommt in dieser Sitzung wieder
  }
  save();
  updateCounts();
  render();
}

function finish() {
  $('res-ok').textContent = sess.ok;
  $('res-no').textContent = Object.values(state.items).filter(i => i.pile).length;
  $('retry').classList.toggle('hidden', !Object.values(state.items).some(i => i.pile));
  show('s-end');
}

function updateCounts() {
  const pile = Object.values(state.items).filter(i => i.pile).length;
  const due = vocab.filter(v => isDue(v.id)).length;
  $('cnt-due').textContent = due;
  $('cnt-pile').textContent = pile;
  $('cnt-total').textContent = Object.keys(state.items).length + '/' + vocab.length;
}

// ---------- Sichern / Wiederherstellen ----------
function exportState() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'farsi-voc-stand.json';
  a.click();
}
function importState(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (!data || typeof data.items !== 'object') throw new Error('kein Lernstand');
      state = Object.assign(state, data);
      save(); updateCounts(); refreshWod();
      alert('Lernstand wiederhergestellt.');
    } catch (e) { alert('Datei passt nicht zu Farsi-Voc.'); }
  };
  r.readAsText(file);
}

// ---------- Ereignisse ----------
$('start').onclick = startSession;
$('retry').onclick = startRetry;
$('done').onclick = () => { show('s-home'); refreshWod(); updateCounts(); };
$('wod-btn').onclick = revealWod;
$('fin-btn').onclick = e => { e.stopPropagation(); showFin(); };
$('card').addEventListener('click', e => { if (!e.target.closest('button')) flip(); });
$('yes').onclick = () => answer(true);
$('no').onclick = () => answer(false);
$('export').onclick = exportState;
$('import').onclick = () => $('import-file').click();
$('import-file').onchange = e => e.target.files[0] && importState(e.target.files[0]);
document.querySelectorAll('#lang button').forEach(b => b.onclick = () => {
  state.lang = b.dataset.l; save();
  document.querySelectorAll('#lang button').forEach(x => x.classList.toggle('on', x === b));
  refreshWod();
  if ($('s-card').classList.contains('on')) render();
});

// ---------- Start ----------
fetch('data/vocab.json')
  .then(r => r.json())
  .then(data => {
    vocab = data;
    load();
    document.querySelectorAll('#lang button').forEach(x => x.classList.toggle('on', x.dataset.l === state.lang));
    refreshWod();
    updateCounts();
  })
  .catch(() => alert('Vokabeldatei konnte nicht geladen werden.'));

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

// Farsi-Voc: Karteikarten-Trainer (PWA)
// Lernstand liegt im localStorage dieses Browsers.

const KEY = 'farsi-voc-v3';      // Lernstand zur neuen Vokabelliste
const OLD_KEY = 'farsi-voc-v1';  // alter Lernstand (andere Wort-IDs, wird nicht übernommen)
const DATA_VERSION = 3;          // steht in jeder Sicherungsdatei
const SESSION_SIZE = 20;
const GAP_MIN = 8;   // gewusste Wörter kommen frühestens nach 8 Sitzungen wieder
const GAP_MAX = 20;  // ... und spätestens nach 20 Sitzungen

let vocab = [];
let vocabMap = new Map();
let state = { dataVersion: DATA_VERSION, session: 0, items: {}, wod: null, wodStep: 0, lang: 'fa', changed: 0, lastBackup: 0 };
let queue = [];
let cur = null;
let sess = { ok: 0, no: 0, total: 0 };
let backupTimer = null;

// ---------- Speicher ----------
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && typeof data.items === 'object') state = Object.assign(state, data);
    }
  } catch (e) { /* kaputter Speicher: Standardwerte */ }
  state.dataVersion = DATA_VERSION;
}
// touch = true: Lernfortschritt hat sich geändert (dann ist die letzte Sicherung nicht mehr aktuell)
function save(touch = true) {
  if (touch) state.changed = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}

// ---------- Hilfen ----------
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const byId = id => vocabMap.get(id);
const $ = id => document.getElementById(id);
const isPile = id => !!(state.items[id] && state.items[id].pile);
const pileIds = () => vocab.filter(v => isPile(v.id)).map(v => v.id);

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id));
  window.scrollTo(0, 0);
}

// Beispielsätze eines Worts in ein Element schreiben (nur textContent, kein HTML)
function fillExamples(el, w, max) {
  el.textContent = '';
  const list = Array.isArray(w.bsp) ? w.bsp : [];
  (max ? list.slice(0, max) : list).forEach(s => {
    const box = document.createElement('div');
    box.className = 'sent';
    const fa = document.createElement('div'); fa.className = 'sfa'; fa.lang = 'fa'; fa.textContent = s.fa || '';
    const fin = document.createElement('div'); fin.className = 'sfin'; fin.textContent = s.fin || '';
    const de = document.createElement('div'); de.className = 'sde'; de.textContent = s.de || '';
    box.append(fa, fin, de);
    el.appendChild(box);
  });
  return list.length > 0;
}

// ---------- Wort des Tages ----------
// Zwei getrennte Klicks: Schritt 0 -> 1 -> 2. Nach Schritt 2 wechselt das Wort beim nächsten Öffnen.
//   Farsi-Modus:   Klick 1 = Umschrift, Klick 2 = Deutsch + Beispielsatz
//   Deutsch-Modus: Klick 1 = Farsi,     Klick 2 = Umschrift + Beispielsatz
function pickWod(exclude) {
  const pool = vocab.filter(v => v.id !== exclude);
  return pool[rnd(0, pool.length - 1)].id;
}
function refreshWod(keep) {
  if (!state.wod || !byId(state.wod) || (!keep && state.wodStep >= 2)) {
    state.wod = pickWod(state.wod);
    state.wodStep = 0;
    save(false);
  }
  renderWod();
}
function renderWod() {
  const w = byId(state.wod);
  const fa = state.lang === 'fa';
  const step = state.wodStep || 0;
  $('wod-fa').textContent = fa ? w.fa : w.de;
  $('wod-fa').lang = fa ? 'fa' : 'de';
  $('wod-fa').className = fa ? 'fa' : 'de';

  const fin = $('wod-fin'), de = $('wod-de'), ex = $('wod-ex');
  fin.textContent = w.fin;
  de.textContent = fa ? w.de : w.fa;
  de.lang = fa ? 'de' : 'fa';
  de.className = fa ? 'de' : 'fa';
  const showFinNow = fa ? step >= 1 : step >= 2;
  const showOtherNow = fa ? step >= 2 : step >= 1;
  fin.classList.toggle('hidden', !showFinNow);
  de.classList.toggle('hidden', !showOtherNow);
  ex.textContent = '';
  if (step >= 2 && Array.isArray(w.bsp) && w.bsp.length) {
    fillExamples(ex, { bsp: [w.bsp[rnd(0, w.bsp.length - 1)]] });
  }
  $('wod-reveal').classList.toggle('hidden', step < 1);
  const btn = $('wod-btn');
  btn.classList.toggle('hidden', step >= 2);
  if (step === 0) btn.textContent = fa ? 'Umschrift anzeigen' : 'Farsi anzeigen';
  else if (step === 1) btn.textContent = fa ? 'Übersetzung anzeigen' : 'Umschrift + Beispiel anzeigen';
}
function stepWod() {
  if (state.wodStep >= 2) return;
  state.wodStep = (state.wodStep || 0) + 1;
  save(false);
  renderWod();
}

// ---------- Auswahl der Karten ----------
function isDue(id) {
  const it = state.items[id];
  if (!it) return true;                        // noch nie gesehen
  if (it.pile) return true;                    // im „nicht gewusst“-Haufen
  return it.next <= state.session;             // Pause vorbei
}

function buildSession() {
  const pile = pileIds();
  const pset = new Set(pile);
  const due = vocab.filter(v => !pset.has(v.id) && isDue(v.id)).map(v => v.id);
  shuffle(due);
  return [...shuffle(pile), ...due].slice(0, SESSION_SIZE);
}

// ---------- Sitzung ----------
function startSession() {
  const q = buildSession();
  if (!q.length) { alert('Heute ist nichts offen.'); return false; }
  state.session += 1;
  queue = q;
  sess = { ok: 0, no: 0, total: queue.length };
  save();
  show('s-card'); render();
  return true;
}
// Nur Wörter aus dem Kasten „Nicht gewusst“ (ohne unbekannte neue Wörter)
function startPileOnly() {
  const q = shuffle(pileIds());
  if (!q.length) { alert('Der Haufen „nicht gewusst“ ist leer.'); return false; }
  queue = q;
  sess = { ok: 0, no: 0, total: queue.length };
  show('s-card'); render();
  return true;
}

function render() {
  if (!queue.length) return finish();
  cur = byId(queue[0]);
  updateLive();

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
  $('examples').classList.add('hidden');
  $('hint').classList.remove('hidden');
  $('actions').classList.add('hidden');
}

// Zähler: wird bei jedem Klick (Umblättern, Antwort) neu berechnet
function updateLive() {
  const done = sess.total - queue.length;
  $('bar').style.width = (sess.total ? done / sess.total * 100 : 0) + '%';
  $('pos').textContent = 'Noch ' + queue.length + ' von ' + sess.total + ' offen';
  $('live').textContent = '✓ ' + sess.ok + '   ✗ ' + sess.no;
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
  // Beispielsätze auf der Rückseite
  const has = fillExamples($('examples'), cur);
  $('examples').classList.toggle('hidden', !has);
  $('hint').classList.add('hidden');
  $('actions').classList.remove('hidden');
  updateLive();
}

function answer(known) {
  const id = queue.shift();
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
  const pile = pileIds().length;
  $('res-ok').textContent = sess.ok;
  $('res-no').textContent = pile;
  $('retry').classList.toggle('hidden', pile === 0);
  updateCounts();
  show('s-end');
}

function toHome() {
  show('s-home');
  refreshWod();
  updateCounts();
  updateBackupUI();
}

function updateCounts() {
  const pile = pileIds().length;
  const due = vocab.filter(v => isDue(v.id)).length;
  const seen = vocab.filter(v => state.items[v.id]).length;
  $('cnt-due').textContent = due;
  $('cnt-pile').textContent = pile;
  $('cnt-total').textContent = seen + '/' + vocab.length;
  $('pile-box').disabled = pile === 0;
}

// ---------- Sichern / Wiederherstellen ----------
// Teilen über das iOS-Share-Sheet (Web Share API); sonst normaler Download.
async function shareOrDownload(name, text) {
  let file = null;
  try { file = new File([text], name, { type: 'application/json' }); } catch (e) {}
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Farsi-Voc Lernstand' });
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') return false; // vom Nutzer abgebrochen
      // anderer Fehler: weiter mit Download
    }
  }
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}

function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

async function exportState() {
  const ok = await shareOrDownload('farsi-voc-stand-' + stamp() + '.json', JSON.stringify(state, null, 2));
  if (!ok) return;
  state.lastBackup = state.changed || Date.now();
  save(false);
  updateBackupUI(true);
}

function updateBackupUI(justNow) {
  const btn = $('export'), note = $('backup-note');
  const backed = state.lastBackup && state.lastBackup >= (state.changed || 0);
  btn.textContent = backed ? 'Gesichert ✓' : 'Sichern';
  btn.classList.toggle('done', !!backed);
  if (state.lastBackup) {
    const d = new Date(state.lastBackup);
    note.textContent = 'Zuletzt gesichert: ' + d.toLocaleDateString('de-DE') + ' ' +
      d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) +
      (backed ? '. Seitdem nichts geändert.' : '. Seitdem hast du gelernt, bitte neu sichern.');
  } else {
    note.textContent = 'Der Lernstand wird nur in diesem Browser gespeichert. Sichere ihn regelmäßig.';
  }
}

function importState(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (!data || typeof data.items !== 'object') throw new Error('kein Lernstand');
      if (data.dataVersion !== DATA_VERSION) {
        alert('Diese Datei stammt von der alten Vokabelliste. Die Wort-Nummern passen nicht mehr, sie kann nicht geladen werden.');
        return;
      }
      state = Object.assign(state, data);
      state.lastBackup = state.changed || Date.now(); // frisch geladen = entspricht der Sicherung
      save(false);
      updateCounts(); refreshWod(true); updateBackupUI();
      alert('Lernstand wiederhergestellt.');
    } catch (e) { alert('Datei passt nicht zu Farsi-Voc.'); }
  };
  r.readAsText(file);
}

// ---------- Hinweis auf alten Lernstand ----------
let oldBackedUp = false;
function oldStateRaw() { try { return localStorage.getItem(OLD_KEY); } catch (e) { return null; } }
function needsNotice() {
  try { return !!localStorage.getItem(OLD_KEY) && !localStorage.getItem(KEY); } catch (e) { return false; }
}
async function backupOld() {
  const raw = oldStateRaw();
  if (!raw) return;
  const ok = await shareOrDownload('farsi-voc-alter-stand-' + stamp() + '.json', raw);
  if (ok) { oldBackedUp = true; $('notice-backup').textContent = 'Gesichert ✓'; }
}
function leaveNotice() {
  if (!oldBackedUp && !confirm('Der alte Stand ist noch nicht gesichert und wird nicht übernommen. Trotzdem neu beginnen?')) return;
  save(false);   // legt den neuen Datenstand an, der Hinweis erscheint nicht mehr
  toHome();
}

// ---------- Ereignisse ----------
$('start').onclick = startSession;
$('pile-box').onclick = startPileOnly;
$('retry').onclick = startPileOnly;
$('more-all').onclick = () => { if (!startSession()) toHome(); };
$('done').onclick = toHome;
$('abort').onclick = () => { if (confirm('Sitzung abbrechen? Bisherige Antworten bleiben gespeichert.')) toHome(); };
$('wod-btn').onclick = stepWod;
$('fin-btn').onclick = e => { e.stopPropagation(); showFin(); };
$('card').addEventListener('click', e => { if (!e.target.closest('button')) flip(); });
$('yes').onclick = () => answer(true);
$('no').onclick = () => answer(false);
$('export').onclick = exportState;
$('import').onclick = () => $('import-file').click();
$('import-file').onchange = e => { if (e.target.files[0]) importState(e.target.files[0]); e.target.value = ''; };
$('notice-backup').onclick = backupOld;
$('notice-go').onclick = leaveNotice;
document.querySelectorAll('#lang button').forEach(b => b.onclick = () => {
  state.lang = b.dataset.l; save(false);
  document.querySelectorAll('#lang button').forEach(x => x.classList.toggle('on', x === b));
  renderWod();
  if ($('s-card').classList.contains('on')) render();
});

// ---------- Start ----------
function applyUrlParams() {
  // ?wod=1 (vom Widget): Wort des Tages zeigen, nicht weiterschalten. Optional &id=<Wort-ID> vom Widget.
  let p;
  try { p = new URLSearchParams(location.search); } catch (e) { return false; }
  if (p.get('wod') !== '1') return false;
  const id = parseInt(p.get('id'), 10);
  if (id && byId(id) && id !== state.wod) {
    state.wod = id;
    state.wodStep = 0;
    save(false);
  }
  try { history.replaceState(null, '', location.pathname); } catch (e) {}
  return true;
}

fetch('data/vocab.json')
  .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(data => {
    vocab = data;
    vocabMap = new Map(vocab.map(v => [v.id, v]));
    load();
    document.querySelectorAll('#lang button').forEach(x => x.classList.toggle('on', x.dataset.l === state.lang));
    if (needsNotice()) {   // vor allem anderen prüfen, damit nichts den neuen Stand anlegt
      show('s-notice');
      return;
    }
    const fromWidget = applyUrlParams();
    show('s-home');
    refreshWod(fromWidget);
    updateCounts();
    updateBackupUI();
    if (fromWidget) {
      const box = $('wod-box');
      box.classList.add('flash');
      box.scrollIntoView({ block: 'center' });
    }
  })
  .catch(() => alert('Vokabeldatei konnte nicht geladen werden.'));

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

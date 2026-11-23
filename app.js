// Farsi-Voc: Karteikarten-Trainer (PWA)
// Lernstand liegt im localStorage dieses Browsers.

const KEY = 'farsi-voc-v3';      // Lernstand zur neuen Vokabelliste
const OLD_KEY = 'farsi-voc-v1';  // alter Lernstand (andere Wort-IDs, wird nicht übernommen)
const DATA_VERSION = 3;          // steht in jeder Sicherungsdatei
const SESSION_SIZE = 20;
const GAP_MIN = 8;   // gewusste Wörter kommen frühestens nach 8 Sessions wieder
const GAP_MAX = 20;  // ... und spätestens nach 20 Sessions

// Gelöschte Dubletten -> behaltener Eintrag (Lernstand wird übertragen)
const MERGED = { 3122: 138, 3117: 236, 3147: 376, 3150: 379, 510: 472, 3149: 381 };

let vocab = [];
let vocabMap = new Map();
let extra = {};            // data/extra.json: Niveau, Themen, Synonyme (Schlüssel = Wort-ID)
let filterSets = {};       // Filtername -> Set(ids)
let state = { dataVersion: DATA_VERSION, session: 0, items: {}, wod: null, wodStep: 0, lang: 'fa', tr: 'fin', filter: '', changed: 0, lastBackup: 0 };
let cur = null;
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
  migrateMerged();
}
function migrateMerged() {
  let changed = false;
  Object.keys(MERGED).forEach(old => {
    const keep = MERGED[old];
    if (state.items[old]) {
      if (!state.items[keep]) state.items[keep] = state.items[old];
      delete state.items[old];
      changed = true;
    }
    if (state.wod === Number(old)) { state.wod = keep; changed = true; }
  });
  if (changed) save(false);
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

// Umschrift: 'fin' = Finglish (unsere Schreibweise), 'bh' = Schreibweise aus dem Bā-ham-Buch
const BH = { kh: 'x', sh: 'š', zh: 'ž', ch: 'č', gh: 'ġ', ei: 'ej', j: 'ǧ', y: 'j', v: 'w' };
function T(s) {
  if (state.tr !== 'bh' || !s) return s || '';
  return s.replace(/kh|sh|zh|ch|gh|ei|j|y|v/gi, m => {
    const r = BH[m.toLowerCase()];
    return m[0] === m[0].toLowerCase() ? r : r.toUpperCase();
  });
}

// Beispielsätze eines Worts in ein Element schreiben (nur textContent, kein HTML)
function fillExamples(el, w, max) {
  el.textContent = '';
  const list = Array.isArray(w.bsp) ? w.bsp : [];
  (max ? list.slice(0, max) : list).forEach(s => {
    const box = document.createElement('div');
    box.className = 'sent';
    const fa = document.createElement('div'); fa.className = 'sfa'; fa.lang = 'fa'; fa.textContent = s.fa || '';
    const fin = document.createElement('div'); fin.className = 'sfin'; fin.textContent = T(s.fin);
    const de = document.createElement('div'); de.className = 'sde'; de.textContent = s.de || '';
    box.append(fa, fin, de);
    el.appendChild(box);
  });
  return list.length > 0;
}

// Synonyme eines Worts mit Hinweis und Beispielsatz (nur textContent, kein HTML)
function fillSynonyms(el, id) {
  el.textContent = '';
  const e = extra[id];
  const list = (e && e.s) || [];
  if (!list.length) return false;
  const h = document.createElement('div'); h.className = 'syn-title'; h.textContent = 'Synonyme';
  el.appendChild(h);
  list.forEach(x => {
    const box = document.createElement('div'); box.className = 'syn';
    const head = document.createElement('div'); head.className = 'syn-head';
    const fa = document.createElement('span'); fa.className = 'syn-fa'; fa.lang = 'fa'; fa.textContent = x.fa;
    const fin = document.createElement('span'); fin.className = 'syn-fin'; fin.textContent = T(x.fin);
    const de = document.createElement('span'); de.className = 'syn-de'; de.textContent = x.de;
    head.append(fa, fin, de);
    const hint = document.createElement('div'); hint.className = 'syn-hint'; hint.textContent = x.h;
    const sent = document.createElement('div'); sent.className = 'sent';
    const sfa = document.createElement('div'); sfa.className = 'sfa'; sfa.lang = 'fa'; sfa.textContent = x.b.fa;
    const sfin = document.createElement('div'); sfin.className = 'sfin'; sfin.textContent = T(x.b.fin);
    const sde = document.createElement('div'); sde.className = 'sde'; sde.textContent = x.b.de;
    sent.append(sfa, sfin, sde);
    box.append(head, hint, sent);
    el.appendChild(box);
  });
  return true;
}

// ---------- Filter ----------
function setupFilter() {
  const sel = $('filter');
  filterSets = {};
  const label = {};
  Object.keys(extra).forEach(k => {
    const id = parseInt(k, 10);
    if (!vocabMap.has(id)) return;
    const e = extra[k];
    const add = (key, text) => { (filterSets[key] = filterSets[key] || new Set()).add(id); label[key] = text; };
    if (e.n) add('n:' + e.n, 'Niveau ' + e.n);
    (e.t || []).forEach(t => add('t:' + t, t));
  });
  const keys = Object.keys(filterSets).sort((a, b) => label[a].localeCompare(label[b], 'de'));
  if (!keys.length) { $('filter-wrap').classList.add('hidden'); state.filter = ''; return; }
  sel.textContent = '';
  const all = document.createElement('option'); all.value = ''; all.textContent = 'Alle Wörter (' + vocab.length + ')';
  sel.appendChild(all);
  keys.forEach(k => {
    const o = document.createElement('option'); o.value = k; o.textContent = label[k] + ' (' + filterSets[k].size + ')';
    sel.appendChild(o);
  });
  if (state.filter && !filterSets[state.filter]) state.filter = '';
  sel.value = state.filter;
  sel.onchange = () => { state.filter = sel.value; save(false); updateCounts(); };
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
  fin.textContent = T(w.fin);
  de.textContent = fa ? w.de : w.fa;
  de.lang = fa ? 'de' : 'fa';
  de.className = fa ? 'de' : 'fa';
  const showFinNow = fa ? step >= 1 : step >= 2;
  const showOtherNow = fa ? step >= 2 : step >= 1;
  fin.classList.toggle('hidden', !showFinNow);
  de.classList.toggle('hidden', !showOtherNow);
  ex.textContent = '';
  // Alle Beispielsätze des Worts, immer in gleicher Reihenfolge (nichts Zufälliges beim Neuzeichnen)
  if (step >= 2) fillExamples(ex, w);
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
// Regulär fällig: nie gesehen oder Pause vorbei. Wörter im Haufen „nicht gewusst“ gehören nicht dazu,
// sie werden nur über den Kasten „nicht gewusst“ geübt.
function isDue(id) {
  const it = state.items[id];
  if (!it) return true;                        // noch nie gesehen
  if (it.pile) return false;                   // im Haufen: eigene Session
  return it.next <= state.session;             // Pause vorbei
}

// Zufällige Auswahl bei jedem Start einer Session
// Filter (Wortart, Niveau, Thema) gilt für normale Sessions; die „nicht gewusst“-Session nimmt immer alle Haufen-Wörter
function inFilter(id) {
  if (!state.filter) return true;
  const set = filterSets[state.filter];
  return !set || set.has(id);
}
function buildSession() {
  const due = vocab.filter(v => isDue(v.id) && inFilter(v.id)).map(v => v.id);
  if (due.length) return shuffle(due).slice(0, SESSION_SIZE);
  // Nichts mehr fällig: trotzdem weiterlernen. Dann kommen die gewussten Wörter dran,
  // deren Pause am bald endet (kleinstes „next“ zuerst).
  const early = vocab.filter(v => inFilter(v.id) && state.items[v.id] && !state.items[v.id].pile)
    .map(v => ({ id: v.id, next: state.items[v.id].next, r: Math.random() }))
    .sort((a, b) => a.next - b.next || a.r - b.r);
  return shuffle(early.slice(0, SESSION_SIZE).map(x => x.id));
}

// ---------- Session ----------
let deck = [];       // Reihenfolge der Karten dieser Session
let pos = 0;         // aktuelle Karte
let ans = {};        // id -> true (gewusst) / false (nicht gewusst); fehlt = noch nicht bearbeitet
let mode = 'main';   // 'main' = normale Session, 'pile' = Haufen „nicht gewusst“

function begin(ids, m) {
  deck = ids; ans = {}; pos = 0; mode = m;
  show('s-card'); render();
}
function startSession() {
  const q = buildSession();
  if (!q.length) { alert(state.filter ? 'Für diesen Filter gibt es gerade keine Wörter. Wähle einen anderen Filter oder „Alle Wörter“.' : 'Es gibt gerade keine Wörter zum Lernen. Nicht gewusste Wörter findest du im Kasten „nicht gewusst“.'); return false; }
  state.session += 1;
  save();
  begin(q, 'main');
  return true;
}
// Alle Wörter, die sich bis jetzt im Haufen „nicht gewusst“ angesammelt haben (beliebig viele)
function startPileOnly() {
  const q = shuffle(pileIds());
  if (!q.length) { alert('Der Haufen „nicht gewusst“ ist leer.'); return false; }
  begin(q, 'pile');
  return true;
}

const countAns = v => Object.values(ans).filter(x => x === v).length;

function render() {
  cur = byId(deck[pos]);
  updateLive();

  const faSide = state.lang === 'fa';
  const front = $('front');
  front.textContent = faSide ? cur.fa : cur.de;
  front.className = faSide ? 'front' : 'de';
  front.lang = faSide ? 'fa' : 'de';

  // Umschrift nur als Hilfe auf der Farsi-Seite, per Button
  $('fin').textContent = T(cur.fin);
  $('fin').classList.add('hidden');
  $('fin-btn').classList.toggle('hidden', !faSide);

  $('back').classList.add('hidden');
  $('back-fin').classList.add('hidden');
  $('examples').classList.add('hidden');
  $('synonyms').classList.add('hidden');
  $('hint').classList.remove('hidden');
  $('actions').classList.add('hidden');

  // Bereits bearbeitete Karte: gestrichelter Rahmen, Lösung gleich zeigen, gewählte Antwort markieren
  $('card').classList.toggle('done', ans[cur.id] !== undefined);
  $('card').classList.toggle('ok', ans[cur.id] === true);
  $('card').classList.toggle('no', ans[cur.id] === false);
  if (ans[cur.id] !== undefined) flip();
  $('yes').classList.toggle('sel', ans[cur.id] === true);
  $('no').classList.toggle('sel', ans[cur.id] === false);

  // Zurück ab Karte 2, Vor bis zur letzten Karte
  $('prev').style.visibility = pos >= 1 ? 'visible' : 'hidden';
  $('next').style.visibility = pos < deck.length - 1 ? 'visible' : 'hidden';
}

// Kästchen-Leiste: aktuell = dicker Rand, bearbeitet = gestrichelt, offen = dünner Rand
function drawStrip() {
  const strip = $('strip');
  strip.textContent = '';
  strip.classList.toggle('many', deck.length > 30);
  deck.forEach((id, i) => {
    const c = document.createElement('span');
    c.className = 'chip' + (i === pos ? ' cur' : '') +
      (ans[id] === true ? ' done ok' : ans[id] === false ? ' done no' : '');
    strip.appendChild(c);
  });
}

// Zähler: wird bei jedem Klick (Umblättern, Antwort) neu berechnet
function updateLive() {
  const done = Object.keys(ans).length;
  $('bar').style.width = (deck.length ? done / deck.length * 100 : 0) + '%';
  $('pos').textContent = 'Karte ' + (pos + 1) + ' von ' + deck.length + (mode === 'pile' ? ' (nicht gewusst)' : '');
  $('live').textContent = '✓ ' + countAns(true) + '   ✗ ' + countAns(false);
  drawStrip();
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
  // Umschrift steht ab jetzt unter der Lösung, die Hilfe oben wird nicht mehr gebraucht
  $('fin-btn').classList.add('hidden');
  $('fin').classList.add('hidden');
  $('back-fin').textContent = T(cur.fin);
  $('back-fin').classList.remove('hidden');
  // Beispielsätze auf der Rückseite
  const has = fillExamples($('examples'), cur);
  $('examples').classList.toggle('hidden', !has);
  const hasSyn = fillSynonyms($('synonyms'), cur.id);
  $('synonyms').classList.toggle('hidden', !hasSyn);
  $('hint').classList.add('hidden');
  $('actions').classList.remove('hidden');
}

function go(delta) {
  const n = pos + delta;
  if (n < 0 || n >= deck.length) return;
  pos = n; render();
}

// „Nicht gewusst“ wird in dieser Session nicht wiederholt, das Wort landet im Haufen.
function answer(known) {
  const id = deck[pos];
  ans[id] = known;
  if (known) state.items[id] = { pile: false, next: state.session + rnd(GAP_MIN, GAP_MAX) };
  else state.items[id] = { pile: true, next: state.session };
  save();
  updateCounts();
  // weiter zur nächsten noch nicht bearbeiteten Karte; keine mehr offen = Ende
  let nxt = -1;
  for (let k = 1; k <= deck.length; k++) {
    const i = (pos + k) % deck.length;
    if (ans[deck[i]] === undefined) { nxt = i; break; }
  }
  if (nxt < 0) return finish();
  pos = nxt; render();
}

function finish() {
  $('res-ok').textContent = countAns(true);
  $('res-no').textContent = countAns(false);
  $('res-pile').textContent = pileIds().length;
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
  const known = vocab.filter(v => state.items[v.id] && !state.items[v.id].pile).length;
  $('cnt-known').textContent = known + ' von ' + vocab.length;
  $('cnt-pile').textContent = pile;
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
      migrateMerged();
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
$('more-all').onclick = () => { if (!startSession()) toHome(); };
$('done').onclick = toHome;
$('prev').onclick = () => go(-1);
$('next').onclick = () => go(1);
$('abort').onclick = () => { if (confirm('Session abbrechen? Bisherige Antworten bleiben gespeichert.')) toHome(); };
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
function syncToggles() {
  $('lang').dataset.state = state.lang === 'fa' ? '0' : '1';
  $('lang').setAttribute('aria-checked', state.lang === 'de' ? 'true' : 'false');
  $('tr').dataset.state = state.tr === 'bh' ? '1' : '0';
  $('tr').setAttribute('aria-checked', state.tr === 'bh' ? 'true' : 'false');
}
// Ansicht neu zeichnen, ohne den Stand der Karte (aufgedeckt oder nicht) zu verlieren
function redraw() {
  renderWod();
  if ($('s-card').classList.contains('on')) {
    const flipped = !$('back').classList.contains('hidden');
    render();
    if (flipped) flip();
  }
}
$('lang').onclick = () => { state.lang = state.lang === 'fa' ? 'de' : 'fa'; save(false); syncToggles(); redraw(); };
$('tr').onclick = () => { state.tr = state.tr === 'bh' ? 'fin' : 'bh'; save(false); syncToggles(); redraw(); };

// ---------- Hell / Dunkel ----------
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.content = t === 'dark' ? '#14181a' : '#1f6b4f';
  $('theme').setAttribute('aria-checked', t === 'dark' ? 'true' : 'false');
}
$('theme').onclick = () => {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(t);
  try { localStorage.setItem('farsi-voc-theme', t); } catch (e) {}
};
applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

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
    // Ergänzungsliste (weitere Wörter im gleichen Format) ist optional und ändert vocab.json nicht
    const files = ['data/vocab-ergaenzung.json', 'data/vocab-kurs.json'];
    return Promise.all(files.map(f => fetch(f).then(r => r.ok ? r.json() : []).catch(() => [])));
  })
  .then(lists => {
    const have = new Set(vocab.map(v => v.id));
    lists.forEach(more => (Array.isArray(more) ? more : []).forEach(v => { if (v && !have.has(v.id)) { vocab.push(v); have.add(v.id); } }));
    vocabMap = new Map(vocab.map(v => [v.id, v]));
    // Zusatzdaten sind optional: ohne sie fehlen nur Filter und Synonyme
    return fetch('data/extra.json').then(r => r.ok ? r.json() : null).catch(() => null);
  })
  .then(ex => {
    extra = (ex && ex.w) || {};
    load();
    setupFilter();
    syncToggles();
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

// Version (steht unten auf der Startseite, damit man den geladenen Stand erkennt)
const BUILD = 'v14';
$('ver').textContent = 'Version ' + BUILD;

// Service Worker: bei einer neuen Version die Seite einmal automatisch neu laden
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js').then(reg => { try { reg.update(); } catch (e) {} }).catch(() => {});
}

// Scriptable-Widget: zeigt ein zufälliges Wort aus Farsi-Voc mit einem Beispielsatz.
// Tipp auf das Widget öffnet die App beim Wort des Tages (?wod=1).
// Format der Vokabeldatei: { id, fa, fin, de, bsp: [ { fa, fin, de, quelle } ] }
const VOCAB_URL = 'https://mkoebrich.github.io/Farsi-Voc/data/vocab.json';
const APP_URL = 'https://mkoebrich.github.io/Farsi-Voc/';

let words = [];
try {
  words = await new Request(VOCAB_URL).loadJSON();
} catch (e) {
  words = [{ id: 0, fa: 'کتاب', fin: 'ketāb', de: 'Buch', bsp: [{ fa: 'این کتاب است.', fin: 'in ketāb ast.', de: 'Das ist ein Buch.' }] }];
}
const w = words[Math.floor(Math.random() * words.length)];
const sentences = Array.isArray(w.bsp) ? w.bsp : [];
const s = sentences.length ? sentences[Math.floor(Math.random() * sentences.length)] : null;

const widget = new ListWidget();
widget.url = APP_URL + '?wod=1' + (w.id ? '&id=' + w.id : '');
widget.backgroundColor = new Color('#eef4f0');
widget.setPadding(14, 16, 14, 16);

const label = widget.addText('WORT DES TAGES');
label.font = Font.semiboldSystemFont(10);
label.textColor = new Color('#6b757c');
widget.addSpacer(6);

const fa = widget.addText(w.fa);
fa.font = new Font('Vazirmatn', 26);
fa.rightAlignText();
fa.textColor = new Color('#1d2327');

widget.addSpacer(4);
const de = widget.addText(w.de);
de.font = Font.systemFont(14);
de.textColor = new Color('#1d2327');

// Beispielsatz nur, wenn Platz ist (nicht im kleinen Widget)
if (s && config.widgetFamily !== 'small') {
  widget.addSpacer(8);
  const sfa = widget.addText(s.fa);
  sfa.font = new Font('Vazirmatn', 15);
  sfa.rightAlignText();
  sfa.textColor = new Color('#1d2327');
  sfa.lineLimit = 2;
  const sde = widget.addText(s.de);
  sde.font = Font.italicSystemFont(11);
  sde.textColor = new Color('#6b757c');
  sde.lineLimit = 2;
}

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  widget.presentMedium();
}
Script.complete();

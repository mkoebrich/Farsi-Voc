// Scriptable-Widget: zeigt ein zufälliges Wort aus Farsi-Voc.
// Tipp auf das Widget öffnet die App.
const VOCAB_URL = 'https://mkoebrich.github.io/Farsi-Voc/data/vocab.json';
const APP_URL = 'https://mkoebrich.github.io/Farsi-Voc/?wod=1';

let words = [];
try {
  words = await new Request(VOCAB_URL).loadJSON();
} catch (e) {
  words = [{ fa: 'کتاب', de: 'Buch' }];
}
const w = words[Math.floor(Math.random() * words.length)];

const widget = new ListWidget();
widget.url = APP_URL;
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

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  widget.presentSmall();
}
Script.complete();

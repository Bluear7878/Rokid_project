import assert from 'node:assert/strict';
import pageDefinition from '../pages/index/index.js';

let clock = 0, nextId = 0, starts = 0;
const timers = new Map();
Date.now = () => clock;
globalThis.setTimeout = (fn, ms) => { const id = ++nextId; timers.set(id, {fn, at: clock + ms}); return id; };
globalThis.clearTimeout = id => timers.delete(id);
function advance(ms) {
  const end = clock + ms;
  for (;;) {
    const next = [...timers].filter(([, t]) => t.at <= end).sort((a,b) => a[1].at - b[1].at)[0];
    if (!next) break;
    timers.delete(next[0]); clock = next[1].at; next[1].fn();
  }
  clock = end;
}
globalThis.SpeechRecognition = class {
  start() { starts++; this.onstart?.(); }
  stop() {}
  abort() {}
};
globalThis.LanguageModel = {};
const isFrench = 'french' in pageDefinition.data;
const result = isFrench ? {french:'Bonjour.', pronunciation:'봉주르.', korean:'안녕하세요.'} : {translation:'Hello.', sourceText:'안녕하세요.'};
function page(choose = true) {
  const p = {...pageDefinition, data: structuredClone(pageDefinition.data), setData(v) { Object.assign(this.data, v); }};
  p.onLoad(); p.onShow();
  if (choose) { if (isFrench) p.chooseWithPronunciation(); else p.pickEnglish(); }
  return p;
}
function key(p, code) { p.onKeyUp({code, preventDefault() {}}); }
let count = 0;
function test(name, fn) { fn(); assert.equal(timers.size, 0); count++; console.log('PASS ' + name); }

test('Result remains until 60 seconds, clears all text without leaving, and confirm starts a new turn', () => {
  const p = page(); p.setPhase('done', result); const before = starts;
  advance(59999); assert.equal(p.data.screenBlank, false);
  advance(1); assert.equal(p.data.screenBlank, true); assert.equal(p._visible, true);
  for (const name of [...Object.keys(result), 'status', 'actionLabel', 'error']) assert.equal(p.data[name], '');
  assert.equal(starts, before); assert.equal(p._recognition, null);
  key(p, 'Enter'); assert.equal(p.data.screenBlank, false); assert.equal(starts, before + 1);
  p.onUnload();
});
test('Scrolling resets inactivity and a queued old timer cannot clear a newer result', () => {
  const p = page(); p.setPhase('done', result);
  const old = timers.get(p._screenTimer).fn;
  advance(45000); key(p, 'ArrowDown'); old(); assert.equal(p.data.screenBlank, false);
  advance(59999); assert.equal(p.data.screenBlank, false);
  advance(1); assert.equal(p.data.screenBlank, true);
  key(p, 'ArrowUp'); assert.equal(p.data.screenBlank, false); assert.equal(p.data.phase, 'idle');
  p.onUnload();
});
test('Recording and translation never run a screen-clearing timer; result gets a full minute', () => {
  const p = page(); const stale = timers.get(p._screenTimer).fn;
  for (const phase of ['starting','listening','finalizing','translating']) {
    p.setPhase(phase); stale(); advance(60000);
    assert.equal(p.data.screenBlank, false); assert.equal(p.data.phase, phase);
  }
  p.setPhase('done', result); advance(59999); assert.equal(p.data.screenBlank, false);
  advance(1); assert.equal(p.data.screenBlank, true); p.onUnload();
});
test('Idle and error screens also clear, while hide and unload cancel timers', () => {
  const p = page(); advance(60000); assert.equal(p.data.screenBlank, true);
  p.setPhase('error', {error:'오류'}); advance(60000); assert.equal(p.data.error, '');
  p.setPhase('idle'); const stale = timers.get(p._screenTimer).fn;
  p.onHide(); assert.equal(timers.size, 0); stale(); assert.equal(p.data.screenBlank, false);
  p.onShow(); advance(60000); assert.equal(p.data.screenBlank, true); p.onUnload();
});
test('Blank language menu restores first, then accepts a target without capture', () => {
 const p=page(false), before=starts; advance(60000); key(p,'Enter');
 assert.equal(p.data.screenBlank,false); assert.equal(p.data.modeChosen,false);
 advance(500); key(p,'Enter'); assert.equal(p.data.targetCode,'en'); assert.equal(p.data.modeChosen,true);
 assert.equal(starts,before); p.onUnload();
});
if (isFrench) {
  test('Opening asks for a mode; swipe and confirm choose translation only without recording', () => {
    const p = page(false), before = starts;
    assert.equal(p.data.phase, 'choosing'); assert.equal(p.data.modeChosen, false);
    key(p, 'ArrowDown'); key(p, 'Enter');
    assert.equal(p.data.showPronunciation, false); assert.equal(p.data.phase, 'idle'); assert.equal(starts, before);
    advance(60000); key(p, 'Enter'); assert.equal(starts, before + 1); assert.equal(p.data.showPronunciation, false);
    p.onUnload(); const fresh = page(false); assert.equal(fresh.data.modeChosen, false); fresh.onUnload();
  });
  test('A blank unchosen screen restores the chooser before accepting a mode', () => {
    const p = page(false), before = starts; advance(60000); assert.equal(p.data.screenBlank, true);
    key(p, 'Enter'); assert.equal(p.data.screenBlank, false); assert.equal(p.data.modeChosen, false);
    advance(500); key(p, 'Enter'); assert.equal(p.data.showPronunciation, true); assert.equal(p.data.modeChosen, true);
    assert.equal(starts, before); p.onUnload();
  });
}
console.log(`${count} timer/mode checks passed using a simulated clock.`);

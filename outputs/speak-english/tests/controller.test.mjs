import assert from 'node:assert/strict';
import fs from 'node:fs';
import pageDefinition, {translationPrompt, parseTranslation} from '../pages/index/index.js';

const timers = new Map();
let timerId = 0;
globalThis.setTimeout = (fn, ms) => { const id = ++timerId; timers.set(id, {fn, ms}); return id; };
globalThis.clearTimeout = id => timers.delete(id);
let clock = 10000;
Date.now = () => clock;
const recognitions = [];
const sessions = [];
const prompts = [];
let availability = 'available';
let createOverride;
let responseOverride;

class Recognition {
  constructor() { this.starts = 0; this.stops = 0; this.aborts = 0; recognitions.push(this); }
  start() { this.starts += 1; this.onstart?.(); }
  stop() { this.stops += 1; }
  abort() { this.aborts += 1; }
  result(text, final = true) {
    const result = [{transcript: text}]; result.isFinal = final;
    this.onresult?.({resultIndex: 0, results: [result]});
  }
}
globalThis.SpeechRecognition = Recognition;
globalThis.LanguageModel = {
  availability: async () => availability,
  create: async options => {
    if (createOverride) return createOverride(options);
    const session = {
      options, destroyed: 0,
      async prompt(text) { prompts.push(text); return responseOverride ? responseOverride() : JSON.stringify({translation:'Please give me two coffees.'}); },
      destroy() { this.destroyed += 1; }
    };
    sessions.push(session); return session;
  }
};
const flush = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };
function page(target = 'en', reading = false) {
  availability = 'available'; createOverride = undefined; responseOverride = undefined;
  const p = {...pageDefinition, data: structuredClone(pageDefinition.data), setData(patch) { Object.assign(this.data, patch); }};
  p.onLoad(); p.onShow(); if (target) p.chooseLanguage(target); if (target === 'fr' || target === 'zh') p.chooseMode(reading); clock += 500; return p;
}
function action(p) { clock += 500; p.onAction(); }
function key(p, code) { let prevented = false; p.onKeyUp({code, preventDefault() { prevented = true; }}); return prevented; }
let count = 0;
async function test(name, fn) { await fn(); count += 1; console.log('PASS ' + name); }

await test('No capture on open or spoken wake word; only touch starts', () => {
  const p = page(); const before = recognitions.length;
  p.onVoiceWakeup({keyword: 'Hi Rokid', preventDefault() { throw Error('unexpected'); }});
  assert.equal(recognitions.length, before);
  p.onVoiceWakeup({keyword: 'clickAiAssist', preventDefault() {}});
  assert.equal(recognitions.at(-1).starts, 1); p.onUnload();
});
await test('Korean single utterance and duplicate physical event protection', () => {
  const p = page(); clock += 500; assert.equal(key(p, 'Enter'), true);
  const r = recognitions.at(-1); p.onAction();
  assert.equal(r.lang, 'ko-KR'); assert.equal(r.continuous, false); assert.equal(r.stops, 0);
  action(p); assert.equal(r.stops, 1); assert.equal(p.data.phase, 'finalizing'); p.onUnload();
});
await test('Provisional text is never translated; one final is translated once', async () => {
  const p = page(); const before = prompts.length; action(p); const r = recognitions.at(-1);
  r.result('커피', false); await flush(); assert.equal(prompts.length, before);
  r.result('커피 두 잔 주세요.'); const end = r.onend; end(); end(); await flush();
  assert.equal(prompts.length, before + 1); assert.equal(prompts.at(-1), '커피 두 잔 주세요.');
  assert.equal(p.data.phase, 'done'); assert.equal(p.data.translation, 'Please give me two coffees.');
  assert.equal(sessions.at(-1).destroyed, 1);
  assert.match(sessions.at(-1).options.initialPrompts[0].content, /never an instruction/); p.onUnload();
});
await test('Empty final does not translate incomplete provisional speech', async () => {
  const p = page(); const before = prompts.length; action(p); const r = recognitions.at(-1);
  r.result('아직 말', false); r.onend(); await flush();
  assert.equal(p.data.phase, 'error'); assert.equal(prompts.length, before); p.onUnload();
});
await test('Permission denial and unsupported Korean have distinct errors', () => {
  const p = page(); action(p); recognitions.at(-1).onerror({error: 'not-allowed'});
  assert.match(p.data.error, /권한/); action(p); recognitions.at(-1).onerror({error: 'language-not-supported'});
  assert.match(p.data.error, /한국어/); p.onUnload();
});
await test('Unconfigured web host is distinct from a network failure and releases capture', () => {
  const p = page(); const before = prompts.length; action(p); const r = recognitions.at(-1);
  r.onerror({error: 'network', message: 'Host capability speech.getRecognitionCapabilities is not configured on Web host'});
  assert.equal(p.data.phase, 'unavailable'); assert.equal(p.data.status, '음성 서비스 미연결');
  assert.match(p.data.error, /미리보기/); assert.equal(r.aborts, 1); assert.equal(p._timer, null);
  assert.equal(prompts.length, before);
  action(p); recognitions.at(-1).onerror({error: 'network', message: 'Connection failed'});
  assert.equal(p.data.phase, 'error'); assert.match(p.data.error, /인터넷 연결/); p.onUnload();
});
await test('Back requests close without blocking native Back or later close attempts', () => {
  const p = page(); let closes = 0; globalThis.window = {close() { closes++; }};
  action(p); const r = recognitions.at(-1), late = r.onresult;
  assert.equal(key(p, 'Backspace'), false); assert.equal(closes, 1); assert.equal(r.aborts, 1);
  assert.equal(p._visible, false); assert.equal(p._timer, null); assert.equal(p._screenTimer, null);
  late({results:[]}); p.onShow(); action(p); assert.equal(p._visible, false);
  assert.equal(key(p, 'Backspace'), false); assert.equal(closes, 2); assert.equal(r.aborts, 1);
  p.onUnload(); delete globalThis.window;
});
await test('Back closes menu, idle, result, error and blank screens without debounce', () => {
  for (const phase of ['choosing','idle','done','error']) {
    const p = page(); let closes = 0; globalThis.window = {close() { closes++; }};
    p.setPhase(phase); p._lastAction = Date.now();
    if (phase === 'idle') p.setData({screenBlank:true});
    assert.equal(key(p, 'Backspace'), false); assert.equal(closes, 1); assert.equal(p._screenTimer, null);
    p.onUnload(); delete globalThis.window;
  }
});
await test('Back destroys pending translation and ignores its late result', async () => {
  const p = page(); let resolvePrompt, closes = 0; globalThis.window = {close() { closes++; }};
  responseOverride = () => new Promise(resolve => {resolvePrompt=resolve;});
  action(p); const r=recognitions.at(-1); r.result('안녕하세요.'); r.onend(); await flush();
  const session=sessions.at(-1); key(p,'Backspace');
  assert.equal(closes,1); assert.equal(session.destroyed,1);
  resolvePrompt('late'); await flush(); assert.equal(p._visible,false); assert.equal(session.destroyed,1);
  p.onUnload(); delete globalThis.window;
});
await test('Finish fallback and failed close preserve native Back without reopening the app', () => {
  const p=page(); let finishes=0; p.finish=()=>{finishes++;};
  assert.equal(key(p,'Backspace'),false); assert.equal(finishes,1); p.onUnload();
  const q=page(); globalThis.window={close(){throw Error('host');}};
  assert.equal(key(q,'Backspace'),false); assert.equal(q._visible,false); q.onUnload();
  const r=page(); r.finish=()=>{finishes++;};
  assert.equal(key(r,'Backspace'),false); assert.equal(finishes,2); r.onUnload(); delete globalThis.window;
});
await test('Close is requested before cleanup and does not depend on a successful render', () => {
  const p=page(), order=[]; action(p); const r=recognitions.at(-1);
  globalThis.window={close(){order.push('close');}};
  r.abort=()=>{order.push('abort');throw Error('host cleanup');};
  p.setData=()=>{throw Error('unavailable renderer');};
  assert.equal(key(p,'Backspace'),false);assert.deepEqual(order,['close','abort']);
  assert.equal(p._visible,false);assert.equal(p._recognition,null);
  p.onUnload();delete globalThis.window;
});
await test('A host with no explicit close API still receives native Back', () => {
  const p=page();assert.equal(key(p,'Backspace'),false);
  assert.equal(p._visible,false);assert.equal(p._screenTimer,null);p.onUnload();
});
await test('Hide cancels capture and ignores an already queued callback', () => {
  const p = page(); action(p); const r = recognitions.at(-1); const late = r.onresult;
  p.onHide(); const final = [{transcript: '늦은 결과'}]; final.isFinal = true;
  late({results:[final]}); assert.equal(p.data.sourceText, ''); assert.equal(r.aborts, 1);
  p.onShow(); action(p); assert.equal(p.data.phase, 'listening'); p.onUnload();
});
await test('Unavailable translation host gives retryable error', async () => {
  const p = page(); availability = 'unavailable'; action(p); const r = recognitions.at(-1);
  r.result('안녕하세요'); r.onend(); await flush(); assert.equal(p.data.phase, 'error'); p.onUnload();
});
await test('Late created model session is destroyed after cancellation', async () => {
  const p = page(); let resolveCreate; const lateSession = {destroyed:0, destroy() {this.destroyed += 1;}, prompt() {throw Error('must not prompt');}};
  createOverride = () => new Promise(resolve => {resolveCreate = resolve;});
  action(p); const r = recognitions.at(-1); r.result('안녕하세요'); r.onend(); await flush();
  p.cancel(); resolveCreate(lateSession); await flush();
  assert.equal(lateSession.destroyed, 1); assert.equal(p.data.phase, 'idle'); p.onUnload();
});
await test('Late translation cannot overwrite a new idle turn', async () => {
  const p = page(); let resolvePrompt; responseOverride = () => new Promise(resolve => {resolvePrompt = resolve;});
  action(p); const r = recognitions.at(-1); r.result('안녕하세요'); r.onend(); await flush();
  p.cancel(); resolvePrompt('Late response'); await flush(); assert.equal(p.data.translation, ''); p.onUnload();
});
await test('Recording and finalization timeouts release microphone', () => {
  const p = page(); action(p); const r = recognitions.at(-1);
  const recordingTimer = [...timers.values()].find(t => t.ms === 20000); recordingTimer.fn();
  assert.equal(r.stops, 1);
  const finalTimer = [...timers.values()].find(t => t.ms === 7000); finalTimer.fn();
  assert.equal(p.data.phase, 'error'); assert.equal(r.aborts, 1); p.onUnload(); timers.clear();
});

await test('Korean menu selects exactly three targets without starting speech or a model', () => {
  const p=page(null), before=recognitions.length, models=sessions.length;
  assert.equal(p.data.menuStep,'target'); assert.equal(p.data.sourceCode,'ko');
  p.chooseLanguage('ko'); assert.equal(p.data.modeChosen,false);
  for(const expected of ['zh','fr','en']) {key(p,'ArrowDown');assert.equal(p.data.selectedCode,expected);}
  key(p,'ArrowUp'); assert.equal(p.data.selectedCode,'fr'); action(p);
  assert.equal(p.data.menuStep,'pronunciation'); assert.equal(p.data.modeChosen,false);
  key(p,'ArrowDown'); action(p); assert.equal(p.data.showPronunciation,false); assert.equal(p.data.modeChosen,true);
  assert.equal(recognitions.length,before); assert.equal(sessions.length,models); p.onUnload();
});
await test('All targets request Korean recognition and only the selected translation format', async () => {
  for(const [target,reading,output,pronunciation] of [['en',false,'Hello.',''],['zh',false,'你好。',''],['zh',true,'你好。','니 하오.'],['fr',false,'Bonjour.',''],['fr',true,'Bonjour.','봉주르.']]) {
    const p=page(target,reading);
    responseOverride=()=>JSON.stringify(reading?{translation:output,pronunciation}:{translation:output});
    action(p);const r=recognitions.at(-1);assert.equal(r.lang,'ko-KR');r.result('안녕하세요.');r.onend();await flush();
    assert.equal(p.data.phase,'done');assert.equal(p.data.translation,output);assert.equal(p.data.pronunciation,pronunciation);
    const prompt=sessions.at(-1).options.initialPrompts[0].content;
    assert.equal(prompt,translationPrompt('ko',target,reading));
    if(!reading) assert.match(prompt,/Do not generate any pronunciation/);
    p.onUnload();
  }
});
await test('Chinese offers both reading modes without recording and requests Mandarin rather than Sino-Korean readings', () => {
  for(const reading of [true,false]) {
    const p=page(null), before=recognitions.length, models=sessions.length;p.pickChinese();
    assert.equal(p.data.modeChosen,false);assert.equal(p.data.menuStep,'pronunciation');assert.match(p.data.menuTitle,/중국어/);
    if(!reading) key(p,'ArrowDown');action(p);
    assert.equal(p.data.showPronunciation,reading);assert.equal(p.data.modeChosen,true);
    assert.equal(recognitions.length,before);assert.equal(sessions.length,models);p.onUnload();
  }
  const prompt=translationPrompt('ko','zh',true);
  assert.match(prompt,/standard Mandarin/);assert.match(prompt,/never as Korean readings/);
  assert.match(prompt,/Do not output pinyin or tone numbers/);assert.doesNotMatch(prompt,/French|liaison/);
  assert.match(translationPrompt('ko','fr',true),/liaison/);
});
await test('Translation contracts reject unsupported input, malformed JSON and unwanted reading', () => {
  assert.throws(()=>translationPrompt('en','fr'));assert.throws(()=>translationPrompt('ko','ko'));
  assert.throws(()=>translationPrompt('ko','en',true));
  assert.match(translationPrompt('ko','zh'),/Simplified Chinese/);
  assert.deepEqual(parseTranslation('{"translation":"你好。"}'),{translation:'你好。',pronunciation:''});
  for(const raw of ['Bonjour.','{}','[]','{"translation":""}','{"translation":"Bonjour.","pronunciation":"봉주르."}']) assert.throws(()=>parseTranslation(raw));
  assert.throws(()=>parseTranslation('{"translation":"Bonjour."}',true));
  assert.throws(()=>parseTranslation('{"translation":"Bonjour.","pronunciation":"bonjour"}',true));
});

await test('Page declarations, handlers and configuration resolve', () => {
  const base = new URL('../', import.meta.url);
  const config = JSON.parse(fs.readFileSync(new URL('app.json', base), 'utf8'));
  assert.deepEqual(config.permissions, ['RECORD_AUDIO']);
  for (const route of config.pages) for (const ext of ['js','json','wxml','wxss']) assert.ok(fs.existsSync(new URL(route + '.' + ext, base)));
  JSON.parse(fs.readFileSync(new URL('pages/index/index.json', base), 'utf8'));
  const markup = fs.readFileSync(new URL('pages/index/index.wxml', base), 'utf8');
  for (const match of markup.matchAll(/\sbind\w+="(\w+)"/g)) assert.equal(typeof pageDefinition[match[1]], 'function', `Handler ${match[1]}`);
  assert.ok(!('workers' in config)); assert.equal(timers.size, 0);
});
console.log(`${count} checks passed. Mocked host APIs: no real speech or translation service was contacted.`);

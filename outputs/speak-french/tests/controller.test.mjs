import assert from 'node:assert/strict';
import fs from 'node:fs';
import pageDefinition from '../pages/index/index.js';
import {parseTranslation, TRANSLATOR_ONLY} from '../lib/translation.js';

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
      async prompt(text) { prompts.push(text); return responseOverride ? responseOverride() : JSON.stringify({french: 'Deux cafés, s’il vous plaît.', pronunciation: '되 카페, 씰 부 플레.'}); },
      destroy() { this.destroyed += 1; }
    };
    sessions.push(session); return session;
  }
};
const flush = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };
function page(withPronunciation = true) {
  availability = 'available'; createOverride = undefined; responseOverride = undefined;
  const p = {...pageDefinition, data: structuredClone(pageDefinition.data), setData(patch) { Object.assign(this.data, patch); }};
  p.onLoad(); p.onShow(); p.chooseMode(withPronunciation); clock += 500; return p;
}
function action(p) { clock += 500; p.onAction(); }
function key(p, code) { let prevented = false; p.onKeyUp({code, preventDefault() { prevented = true; }}); return prevented; }
let count = 0;
async function test(name, fn) { await fn(); count += 1; console.log('PASS ' + name); }

await test('French accents, apostrophes and Hangul survive bare and fenced JSON', () => {
  const expected = {french: 'Deux cafés, s’il vous plaît.', pronunciation: '되 카페, 씰 부 플레.'};
  assert.deepEqual(parseTranslation(JSON.stringify(expected)), expected);
  assert.deepEqual(parseTranslation('```json\n' + JSON.stringify(expected) + '\n```'), expected);
});
await test('Incomplete, malformed, oversized and non-Hangul readings are rejected', () => {
  for (const raw of [null, '', 'Bonjour.', 'null', '[]', '{}',
    '{"french":"Bonjour."}', '{"french":"Bonjour.","pronunciation":42}',
    '{"french":"Bonjour.","pronunciation":""}', '{"french":"Bonjour.","pronunciation":"bonjour"}',
    '{"french":"Bonjour.","pronunciation":"봉주르.","extra":"ignore"}',
    'Here is the translation: {"french":"Bonjour.","pronunciation":"봉주르."}',
    JSON.stringify({french: 'a'.repeat(6001), pronunciation: '봉주르.'})]) {
    assert.throws(() => parseTranslation(raw), error => error.code === 'INVALID_TRANSLATION');
  }
});
await test('Malformed model output is not displayed as French or pronunciation', async () => {
  const p = page(); responseOverride = () => '{"french":"Bonjour."}';
  action(p); const r = recognitions.at(-1); r.result('안녕하세요'); r.onend(); await flush();
  assert.equal(p.data.phase, 'error'); assert.match(p.data.error, /번역과 발음/);
  assert.equal(p.data.french, ''); assert.equal(p.data.pronunciation, '');
  assert.equal(sessions.at(-1).destroyed, 1); p.onUnload();
});
await test('New recording clears previous French and pronunciation together', async () => {
  const p = page(); action(p); const r = recognitions.at(-1); r.result('커피 두 잔 주세요.'); r.onend(); await flush();
  assert.equal(p.data.phase, 'done'); assert.ok(p.data.pronunciation);
  action(p); assert.equal(p.data.phase, 'listening'); assert.equal(p.data.french, ''); assert.equal(p.data.pronunciation, ''); p.onUnload();
});

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
  assert.equal(p.data.phase, 'done'); assert.equal(p.data.french, 'Deux cafés, s’il vous plaît.'); assert.equal(p.data.pronunciation, '되 카페, 씰 부 플레.');
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
await test('Back cancels active recording, then permits normal exit', () => {
  const p = page(); action(p); const r = recognitions.at(-1);
  assert.equal(key(p, 'Backspace'), true); assert.equal(r.aborts, 1);
  assert.equal(key(p, 'Backspace'), false); p.onUnload();
});
await test('Hide cancels capture and ignores an already queued callback', () => {
  const p = page(); action(p); const r = recognitions.at(-1); const late = r.onresult;
  p.onHide(); const final = [{transcript: '늦은 결과'}]; final.isFinal = true;
  late({results:[final]}); assert.equal(p.data.korean, ''); assert.equal(r.aborts, 1);
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
  p.cancel(); resolvePrompt('Late response'); await flush(); assert.equal(p.data.french, ''); assert.equal(p.data.pronunciation, ''); p.onUnload();
});
await test('Recording and finalization timeouts release microphone', () => {
  const p = page(); action(p); const r = recognitions.at(-1);
  const recordingTimer = [...timers.values()].find(t => t.ms === 20000); recordingTimer.fn();
  assert.equal(r.stops, 1);
  const finalTimer = [...timers.values()].find(t => t.ms === 7000); finalTimer.fn();
  assert.equal(p.data.phase, 'error'); assert.equal(r.aborts, 1); p.onUnload(); timers.clear();
});
await test('Translation-only mode requests and accepts French without generating a reading', async () => {
  const p = page(false);
  responseOverride = () => JSON.stringify({french: 'Bonjour.'});
  action(p); const r = recognitions.at(-1); r.result('안녕하세요.'); r.onend(); await flush();
  assert.equal(sessions.at(-1).options.initialPrompts[0].content, TRANSLATOR_ONLY);
  assert.match(TRANSLATOR_ONLY, /one string field/);
  assert.match(TRANSLATOR_ONLY, /Do not generate a pronunciation guide/);
  assert.equal(p.data.phase, 'done'); assert.equal(p.data.french, 'Bonjour.'); assert.equal(p.data.pronunciation, '');
  assert.equal(p.data.showPronunciation, false); assert.equal(sessions.at(-1).destroyed, 1); p.onUnload();
});
await test('Both French response formats are enforced separately', () => {
  assert.deepEqual(parseTranslation('{"french":"Bonjour."}', false), {french:'Bonjour.', pronunciation:''});
  assert.throws(() => parseTranslation('{"french":"Bonjour."}', true));
  assert.throws(() => parseTranslation('{"french":"Bonjour.","pronunciation":"봉주르."}', false));
});
await test('Translation-only malformed output has a translation-only error', async () => {
  const p = page(false); responseOverride = () => '{}';
  action(p); const r = recognitions.at(-1); r.result('안녕하세요.'); r.onend(); await flush();
  assert.equal(p.data.phase, 'error'); assert.match(p.data.error, /번역 결과/); assert.doesNotMatch(p.data.error, /발음/); p.onUnload();
});
await test('Page declarations, handlers and configuration resolve', () => {
  const base = new URL('../', import.meta.url);
  const config = JSON.parse(fs.readFileSync(new URL('app.json', base), 'utf8'));
  assert.equal(config.agentName, 'Speak French');
  assert.deepEqual(config.permissions, ['RECORD_AUDIO']);
  for (const route of config.pages) for (const ext of ['js','json','wxml','wxss']) assert.ok(fs.existsSync(new URL(route + '.' + ext, base)));
  JSON.parse(fs.readFileSync(new URL('pages/index/index.json', base), 'utf8'));
  const markup = fs.readFileSync(new URL('pages/index/index.wxml', base), 'utf8');
  for (const match of markup.matchAll(/\sbind\w+="(\w+)"/g)) assert.equal(typeof pageDefinition[match[1]], 'function', `Handler ${match[1]}`);
  assert.ok(!('workers' in config)); assert.equal(timers.size, 0);
});
console.log(`${count} checks passed. Mocked host APIs: no real speech or translation service was contacted.`);

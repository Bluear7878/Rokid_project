import assert from 'node:assert/strict';
import pageDefinition, { partialTranslation } from '../pages/index/index.js';

let now = 1000, nextTimer = 0;
const timers = new Map();
globalThis.setTimeout = (fn, ms) => { const id = ++nextTimer; timers.set(id, {fn, ms}); return id; };
globalThis.clearTimeout = id => timers.delete(id);
Date.now = () => now;
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
async function poll() {
  const entry = [...timers].find(([, timer]) => timer.ms <= 25);
  if (!entry) return false;
  timers.delete(entry[0]); now += entry[1].ms; entry[1].fn(); await flush(); return true;
}
async function drain() { await flush(); for (let i = 0; i < 100 && await poll(); i++); }
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise, resolve, reject}; };
let events, sessions, requests, recognition, createImpl, availableImpl, streamImpl;
function buffered(chunks) {
  let index = 0;
  return { cancelled:0, reads:0,
    async read() { this.reads++; return index < chunks.length ? {done:false, value:chunks[index++]} : {done:true}; },
    cancel() { this.cancelled++; }
  };
}
function session(options) {
  const value = {options, destroyed:0, stream:null,
    promptStreaming(text) { requests.push(text); this.stream=streamImpl(); return this.stream; },
    prompt() { throw Error('A failed stream must not trigger a second request'); },
    destroy() { this.destroyed++; }
  };
  sessions.push(value); return value;
}
function setup(target = 'en', reading = false) {
  assert.equal(timers.size, 0);
  events=[]; sessions=[]; requests=[];
  streamImpl=()=>buffered(['{"translation":"Hello."}']);
  availableImpl=async ()=>'available'; createImpl=async options=>session(options);
  globalThis.SpeechRecognition=class {
    constructor() { recognition=this; this.aborts=0; }
    start() { events.push('microphone'); this.onstart?.(); }
    stop() {}
    abort() { this.aborts++; }
    final(text='안녕하세요.') { const r=[{transcript:text}]; r.isFinal=true; this.onresult?.({results:[r]}); }
    end() { this.onend?.(); }
  };
  globalThis.LanguageModel={
    availability() { events.push('availability'); return availableImpl(); },
    create(options) { events.push('create'); return createImpl(options); }
  };
  const p={...pageDefinition, data:structuredClone(pageDefinition.data),setData(v){Object.assign(this.data,v);}};
  p.onLoad();p.onShow();
  if(target) p.chooseLanguage(target);
  if(target==='fr'||target==='zh') p.chooseMode(reading);
  return p;
}
function start(p) { now+=500;p.onAction(); }
function end() { recognition.final();recognition.end(); }
let count=0;
async function test(name, fn) { await fn();await flush();assert.equal(timers.size,0);count++;console.log('PASS '+name); }

await test('No preparation in menus; microphone starts synchronously before model preparation',async()=>{
  const p=setup(null);assert.deepEqual(events,[]);p.pickEnglish();assert.deepEqual(events,[]);
  start(p);assert.deepEqual(events,['microphone','availability']);await flush();
  assert.equal(sessions.length,1);assert.deepEqual(requests,[]);assert.equal(p.data.phase,'listening');
  end();await drain();assert.equal(events.filter(x=>x==='create').length,1);
  assert.equal(p.data.translation,'Hello.');assert.equal(p.data.phase,'done');
  assert.equal(sessions[0].destroyed,1);p.onUnload();
});
await test('Translation arrives before completion; French reading waits for validation',async()=>{
  const p=setup('fr',true);
  streamImpl=()=>buffered(['{"translation":"Bon','jour.","pronunciation":"봉','주르."}']);
  start(p);end();await flush();
  assert.equal(p.data.translation,'Bon');assert.equal(p.data.pronunciation,'');assert.equal(p.data.phase,'translating');
  assert.equal(p._screenTimer,null);await poll();
  assert.equal(p.data.translation,'Bonjour.');assert.equal(p.data.pronunciation,'');
  await drain();assert.equal(p.data.phase,'done');assert.equal(p.data.pronunciation,'봉주르.');
  assert.equal(timers.get(p._screenTimer).ms,60000);p.onUnload();
});
await test('Chinese translation streams first and Hangul reading appears only after full validation',async()=>{
  const p=setup('zh',true);
  streamImpl=()=>buffered(['{"translation":"你','好。","pronunciation":"니 ','하오."}']);
  start(p);end();await flush();assert.equal(p.data.translation,'你');assert.equal(p.data.pronunciation,'');
  await poll();assert.equal(p.data.translation,'你好。');assert.equal(p.data.pronunciation,'');
  await drain();assert.equal(p.data.phase,'done');assert.equal(p.data.pronunciation,'니 하오.');p.onUnload();
});
await test('Partial JSON handles fences, quotes, backslashes, split unicode and surrogate pairs',()=>{
  const raw=JSON.stringify({translation:'你好 "café" \\ 😀',pronunciation:'봉주르.'});
  for(let i=0;i<=raw.length;i++) {
    const text=partialTranslation(raw.slice(0,i));
    assert.ok('你好 "café" \\ 😀'.startsWith(text));assert.doesNotMatch(text,/[\uD800-\uDBFF]$/);
  }
  assert.equal(partialTranslation('```json\n{"translation":"Bon'),'Bon');
  assert.equal(partialTranslation('{"translation":"A\\u4f'),'A');
  assert.equal(partialTranslation('{"translation":"\\u4f60\\u597d"'),'你好');
  assert.equal(partialTranslation('{"translation":"\\ud83d'),'');
  assert.equal(partialTranslation('{"translation":"\\ud83d\\ude00'),'😀');
  for(const bad of ['{"translation":"bad\\q','{"other":"Hello"}','prefix {"translation":"Hello"}','{"translation":"bad\nline']) assert.equal(partialTranslation(bad),'');
});
await test('An empty polling read yields to the event loop; Back cancels its wait',async()=>{
  const p=setup();streamImpl=()=>buffered([undefined,undefined,'{"translation":"Hello."}']);
  start(p);end();await flush();const s=sessions[0], stream=s.stream;
  assert.equal(stream.reads,1);assert.equal(timers.get(p._pollTimer).ms,25);
  await flush();assert.equal(stream.reads,1);await poll();assert.equal(stream.reads,2);
  let closes=0;globalThis.window={close(){closes++;}};
  p.onKeyUp({code:'Backspace',preventDefault(){throw Error('Native Back must remain available');}});await flush();
  assert.equal(closes,1);assert.equal(stream.cancelled,1);assert.equal(s.destroyed,1);
  assert.equal(timers.size,0);assert.equal(stream.reads,2);p.onUnload();delete globalThis.window;
});
await test('Back during an unresolved stream read reaches the host before cleanup, ignores late chunks and never redraws',async()=>{
  const p=setup(), waiting=deferred(), order=[];
  streamImpl=()=>({read(){return waiting.promise;},cancel(){order.push('cancel');throw Error('cancel failed');}});
  start(p);end();await flush();const s=sessions[0];
  s.destroy=()=>{s.destroyed++;order.push('destroy');};
  globalThis.window={close(){order.push('close');}};
  p.setData=()=>{throw Error('Exit must not need a render');};
  p.onKeyUp({code:'Backspace',preventDefault(){throw Error('Native Back blocked');}});
  assert.deepEqual(order,['close','cancel','destroy']);assert.equal(timers.size,0);
  waiting.resolve({done:true,value:'{"translation":"Too late"}'});await flush();
  assert.equal(p.data.translation,'');assert.equal(s.destroyed,1);
  p.onKeyUp({code:'Backspace',preventDefault(){throw Error('Repeated Back blocked');}});
  assert.deepEqual(order,['close','cancel','destroy','close']);p.onUnload();delete globalThis.window;
});
await test('Back during model preparation leaves native exit available and destroys a late session without prompting',async()=>{
  const p=setup(), ready=deferred();createImpl=()=>ready.promise;
  start(p);end();await flush();assert.equal(p.data.phase,'translating');
  let closes=0;globalThis.window={close(){closes++;}};
  p.onKeyUp({code:'Backspace',preventDefault(){throw Error('Native Back blocked');}});
  assert.equal(closes,1);assert.equal(timers.size,0);
  const late=session({});ready.resolve(late);await flush();
  assert.equal(late.destroyed,1);assert.deepEqual(requests,[]);assert.equal(p._visible,false);
  p.onUnload();delete globalThis.window;
});
await test('Late prepared session after cancel is destroyed without replacing the next turn',async()=>{
  const p=setup(), ready=deferred();createImpl=()=>ready.promise;
  start(p);await flush();p.cancel();createImpl=async options=>session(options);
  start(p);await flush();const current=sessions[0];
  const old={destroyed:0,destroy(){this.destroyed++;}};ready.resolve(old);await flush();
  assert.equal(old.destroyed,1);assert.equal(p._session,current);assert.deepEqual(requests,[]);
  p.onUnload();assert.equal(current.destroyed,1);
});
await test('Recognition error cleans a ready session and sends no provisional text',async()=>{
  const p=setup();start(p);await flush();const s=sessions[0];
  recognition.onerror({error:'no-speech'});await flush();
  assert.equal(s.destroyed,1);assert.deepEqual(requests,[]);assert.equal(p.data.phase,'error');p.onUnload();
});
await test('Rejected preparation is handled; a new turn retries with a fresh session',async()=>{
  const p=setup();createImpl=async()=>{throw Error('unavailable');};start(p);await flush();
  assert.equal(p.data.phase,'listening');end();await flush();assert.equal(p.data.phase,'error');
  createImpl=async options=>session(options);start(p);end();await drain();
  assert.equal(p.data.phase,'done');assert.equal(sessions.length,1);p.onUnload();
});
await test('Cancellation during a pending stream read ignores its late text',async()=>{
  const p=setup(), waiting=deferred();let cancelled=0;
  streamImpl=()=>({read(){return waiting.promise;},cancel(){cancelled++;}});
  start(p);end();await flush();const s=sessions[0];p.cancel();
  waiting.resolve({done:false,value:'{"translation":"Late"}'});await flush();
  assert.equal(p.data.translation,'');assert.equal(p.data.phase,'idle');assert.equal(cancelled,1);assert.equal(s.destroyed,1);p.onUnload();
});
await test('Stream failure clears partial output and never retries a duplicate request',async()=>{
  const p=setup();streamImpl=()=>{let first=true;return {async read(){if(first){first=false;return {done:false,value:'{"translation":"Hello'};}throw Error('offline');},cancel(){}};};
  start(p);end();await flush();assert.equal(p.data.translation,'Hello');await drain();
  assert.equal(p.data.phase,'error');assert.equal(p.data.translation,'');assert.equal(requests.length,1);assert.equal(sessions[0].destroyed,1);p.onUnload();
});
await test('Translation timeout cancels polling and clears incomplete output',async()=>{
  const p=setup();streamImpl=()=>({async read(){return {done:false};},cancel(){}});
  start(p);end();await flush();const deadline=timers.get(p._timer);timers.delete(p._timer);deadline.fn();await flush();
  assert.equal(p.data.phase,'error');assert.equal(p._pollTimer,null);assert.equal(sessions[0].destroyed,1);p.onUnload();
});
await test('Preparation that resolves after translation timeout cannot leak a session',async()=>{
  const p=setup(), pending=deferred();createImpl=()=>pending.promise;
  start(p);end();await flush();const deadline=timers.get(p._timer);timers.delete(p._timer);deadline.fn();
  const late={destroyed:0,destroy(){this.destroyed++;}};pending.resolve(late);await flush();
  assert.equal(late.destroyed,1);assert.equal(p.data.phase,'error');assert.deepEqual(requests,[]);p.onUnload();
});
await test('Malformed, oversized or unwanted pronunciation responses never become final results',async()=>{
  for(const chunks of [['{"translation":"Hello"'],['{"translation":"Hello","extra":true}'],['{"translation":"Hello","pronunciation":"헬로"}'],['x'.repeat(24001)],[42]]) {
    const p=setup();streamImpl=()=>buffered(chunks);start(p);end();await drain();
    assert.equal(p.data.phase,'error');assert.equal(p.data.translation,'');assert.equal(sessions[0].destroyed,1);p.onUnload();await flush();
  }
});
await test('Hosts without streaming use one final prompt on the prepared session',async()=>{
  const p=setup();createImpl=async options=>{const s=session(options);delete s.promptStreaming;s.prompt=async text=>{requests.push(text);return '{"translation":"Hello."}';};return s;};
  start(p);await flush();end();await flush();assert.equal(p.data.phase,'done');
  assert.equal(requests.length,1);assert.equal(sessions.length,1);assert.equal(sessions[0].destroyed,1);p.onUnload();
});
console.log(`${count} preparation/streaming checks passed using mocked host APIs.`);

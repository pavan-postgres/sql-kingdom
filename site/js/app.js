(function(){
'use strict';
var SK = window.SK;

/* ---------- tiny DOM helpers (no innerHTML anywhere) ---------- */
function mkE(tag, cls, text){ var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = text; return e; }
function clearEl(n){ while (n.firstChild) n.removeChild(n.firstChild); }
function add(p){ for (var i = 1; i < arguments.length; i++){ if (arguments[i]) p.appendChild(arguments[i]); } return p; }
function $(id){ return document.getElementById(id); }
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
var toastTimer = null;
function toast(msg){ var t = $('toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(toastTimer); toastTimer = setTimeout(function(){ t.style.display = 'none'; }, 3200); }

/* ---------- persistent progress (light per-viewer convenience) ---------- */
var KEY = 'sqlkingdom.v1';
var S = { days: {}, flip: {} };
var defaultStorage = {
  load: function(){ try { var r = localStorage.getItem(KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; } },
  save: function(o){ try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
};
function store(){ return SK.storage || defaultStorage; }   /* Phase B swaps in an API-backed adapter */
function loadS(){ var o = store().load(); if (o && o.days) S = o; }
function saveS(){ store().save(S); }
function dayId(n){ return 'day' + (n < 10 ? '0' : '') + n; }
function b64e(str){ var b = new TextEncoder().encode(str), s = ''; b.forEach(function(x){ s += String.fromCharCode(x); }); return btoa(s); }
function b64d(c){ var s = atob(c.replace(/\s+/g, '')), b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return new TextDecoder().decode(b); }
function progressCode(){ return b64e(JSON.stringify({ v: 1, t: Date.now(), name: S.name || '', days: S.days })); }
function dstate(n){ if (!S.days[n]) S.days[n] = { story: false, tasks: {}, quiz: null, celebrated: false }; return S.days[n]; }

var DAYS = SK.DAYS, STAGES = SK.STAGES, DB = SK.DB, TOTAL = SK.TOTAL, PHASES = SK.PHASES, ROAD = SK.ROAD, runSql = SK.runSql, phaseOf = SK.phaseOf;
/* =====================================================================
   ENGINE: renderer, camera, controller, UI
   ===================================================================== */
var DAY = 1;                    /* day being studied */
var C = { cur: 0, st: 0, playing: false, speedIdx: 0, fx: true, clock: 0, typed: 0, visited: {}, logs: [] };
var SPEEDS = [1, 0.6, 1.5];
var R = { on: false, ar: '1:1', phase: 'intro', t: 0, speedBefore: 0 };
var G = { ok: false, renderer: null, scene: null, camera: null, stage: null, W: 1, H: 1, t: 0 };
var cam = { cx: 0, cy: 0, cz: 0, th: 0, e: 0.3, r: 12, w: 10 };
var off = { th: 0, e: 0, zoom: 1, drag: false, x: 0, y: 0 };
var UI = {};
var curTab = 'learn';
var reduced = false;
try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}


/* ---- narration (pre-recorded clips shipped with the day; no AI, no internet voice service) ---- */
var V = { el: null, muted: false, scene: -1, done: true, playing: false, failed: false };
function voiceInfo(){ var a = SK.AUDIO && SK.AUDIO[DAY]; return (a && !R.on) ? a : null; }
function voiceWanted(){ return !!voiceInfo() && !V.muted; }
function voiceRate(){ return SPEEDS[C.speedIdx]; }
function duck(on){ if (SK.music) SK.music.duck(on); }
function voiceEnded(){ V.done = true; V.playing = false; duck(false); }
function voiceFailed(){ V.failed = true; voiceEnded(); }
function voiceStop(){ if (V.el){ try { V.el.pause(); } catch (e) {} } V.playing = false; V.scene = -1; V.done = !voiceWanted(); duck(false); }
function voicePause(){ if (V.el && V.playing){ try { V.el.pause(); } catch (e) {} V.playing = false; duck(false); } }
/* The narration plays through the SAME Web Audio engine as the music. That is the route that works on iPhone/iPad and inside in-app viewers,
   where a plain <audio> element is usually blocked. WebVoice behaves like a tiny <audio> element (src, play, pause, currentTime, playbackRate, 'ended'). */
function WebVoice(ctx){
  var src = null, cache = {}, node = null, off = 0, t0 = 0, rate = 1, on = false, token = 0, H = {};
  function emit(n){ (H[n] || []).forEach(function(f){ try { f(); } catch (e) {} }); }
  function buf(u){
    if (cache[u]) return cache[u];
    cache[u] = new Promise(function(ok, no){
      try {
        var b64 = u.slice(u.indexOf(',') + 1), bin = atob(b64), n = bin.length, ab = new ArrayBuffer(n), v = new Uint8Array(ab);
        for (var k = 0; k < n; k++) v[k] = bin.charCodeAt(k);
        ctx.decodeAudioData(ab, ok, no);
      } catch (e) { no(e); }
    });
    return cache[u];
  }
  function now(){ return on ? off + (ctx.currentTime - t0) * rate : off; }
  function halt(){ if (node){ node.onended = null; try { node.stop(); } catch (e) {} try { node.disconnect(); } catch (e) {} node = null; } }
  var w = {
    preload: 'auto',
    addEventListener: function(n, f){ (H[n] = H[n] || []).push(f); },
    get src(){ return src || ''; },
    set src(u){ token++; halt(); on = false; off = 0; src = u; if (u && u.indexOf('data:') === 0) buf(u).catch(function(){}); },
    get currentTime(){ return now(); },
    set currentTime(v){ var was = on; token++; halt(); on = false; off = v; if (was) w.play(); },
    get playbackRate(){ return rate; },
    set playbackRate(v){ if (v === rate) return; off = now(); t0 = ctx.currentTime; rate = v; if (node) { try { node.playbackRate.value = v; } catch (e) {} } },
    play: function(){
      var my = ++token, u = src;
      try { if (ctx.state !== 'running') ctx.resume(); } catch (e) {}
      return buf(u).then(function(b){
        if (my !== token) return;
        halt(); var n = ctx.createBufferSource(); n.buffer = b; n.playbackRate.value = rate; n.connect(ctx.destination);
        n.onended = function(){ if (node === n && on){ on = false; node = null; off = b.duration; emit('ended'); } };
        node = n; t0 = ctx.currentTime; on = true; n.start(0, Math.min(off, Math.max(0, b.duration - 0.02)));
      }, function(e){ emit('error'); throw e; });
    },
    pause: function(){ if (!on && !node) return; off = now(); token++; halt(); on = false; },
    warm: function(clips){ clips.forEach(function(c){ if (c.u) buf(c.u).catch(function(){}); }); }
  };
  return w;
}
function voiceEl(){
  if (!V.el){
    var ctx = (SK.music && SK.music.context) ? SK.music.context() : null;
    if (ctx && ctx.decodeAudioData){ V.el = WebVoice(ctx); V.web = true; } else { V.el = new Audio(); V.el.preload = 'auto'; }
    V.el.addEventListener('ended', voiceEnded);
    V.el.addEventListener('error', voiceFailed);      /* a missing clip must never stall the story */
  }
  return V.el;
}
/* First tap: wake the audio engine (iOS needs this inside a tap), and start decoding every clip so scenes start instantly. */
var SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
var voiceUnlocked = false;
function voiceUnlock(){
  if (voiceUnlocked) return; voiceUnlocked = true;
  try {
    var el = voiceEl(), a = voiceInfo();
    if (V.web){
      var ctx = SK.music.context(); try { ctx.resume(); } catch (e) {}
      var sb = ctx.createBuffer(1, 1, 22050), sn = ctx.createBufferSource(); sn.buffer = sb; sn.connect(ctx.destination); sn.start(0);   /* silent blip: marks the engine as user-started */
      if (a) el.warm(a.clips);
    } else if (!V.playing){
      el.muted = true; el.src = SILENT;
      var p = el.play(), undo = function(){ try { el.pause(); } catch (e) {} el.muted = false; if (!V.playing) V.scene = -1; };
      if (p && p.then) p.then(undo, function(){ el.muted = false; voiceUnlocked = false; }); else undo();
    }
  } catch (e) { voiceUnlocked = false; }
}
['touchend', 'click', 'keydown'].forEach(function(ev){ document.addEventListener(ev, voiceUnlock, true); });
function voiceStart(i){
  var a = voiceInfo(); if (!a || V.muted || !a.clips[i]){ V.done = true; return; }
  voiceEl();
  if (V.scene !== i){ V.scene = i; V.done = false; V.failed = false; V.el.src = a.clips[i].u || ('days/' + dayId(DAY) + '/audio/' + a.clips[i].f); V.el.currentTime = 0; }
  V.el.playbackRate = voiceRate();
  var p = V.el.play(); if (p && p.catch) p.catch(function(){ voiceFailed(); voiceUnlocked = false; });   /* blocked by the browser: carry on silently; the next tap unlocks it and the next scene speaks */
  V.playing = true; duck(true);
}
function voiceTick(active){
  var want = active && C.playing && voiceWanted();
  if (want){ if (V.scene !== C.cur || (!V.playing && !V.done)) voiceStart(C.cur); }
  else if (V.playing) voicePause();
}
function toggleVoice(){
  V.muted = !V.muted;
  try { localStorage.setItem('sk.voice', V.muted ? 'off' : 'on'); } catch (e) {}
  if (V.muted) voiceStop(); else { V.scene = -1; V.done = false; }
  updateTransport();
}

function dayData(){ return DAYS[DAY]; }
function scenes(){ return DAYS[DAY].scenes; }
function speedNow(){ return R.on ? ((R.rates && R.rates[C.cur]) || 1.6) : SPEEDS[C.speedIdx]; }
function sceneLen(i){ return (R.on && R.durs && R.durs[i]) ? R.durs[i] : scenes()[i].dur; }   /* a narrated reel can stretch scenes to fit the voice */

/* ---- progress maths ---- */
var REQ_TASKS = 4;
function taskCount(n){ var d = dstate(n), c = 0; DAYS[n].tasks.forEach(function(t, i){ if (!t.bonus && d.tasks[i]) c++; }); return c; }
function dayFrac(n){
  if (!DAYS[n]) return 0; var d = dstate(n);
  return ((d.story ? 1 : 0) + Math.min(1, taskCount(n) / REQ_TASKS) + ((d.quiz && d.quiz.done) ? 1 : 0)) / 3;
}
function overall(){ var s = 0; Object.keys(DAYS).forEach(function(k){ s += dayFrac(+k); }); return s / TOTAL; }
function daysDone(){ var c = 0; Object.keys(DAYS).forEach(function(k){ if (dayFrac(+k) >= 0.999) c++; }); return c; }
function wordsKnown(){ var w = []; Object.keys(DAYS).forEach(function(k){ if (dstate(+k).story) DAYS[k].words.forEach(function(x){ w.push({ day: +k, w: x }); }); }); return w; }

function renderHeader(){
  var rw = $('ringwrap'); clearEl(rw);
  var pct = Math.round(overall() * 1000) / 10;
  var NS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(NS, 'svg'); svg.setAttribute('width', '44'); svg.setAttribute('height', '44'); svg.setAttribute('viewBox', '0 0 44 44');
  var c1 = document.createElementNS(NS, 'circle'); c1.setAttribute('cx', '22'); c1.setAttribute('cy', '22'); c1.setAttribute('r', '18'); c1.setAttribute('fill', 'none'); c1.setAttribute('stroke', '#efe8da'); c1.setAttribute('stroke-width', '6');
  var c2 = document.createElementNS(NS, 'circle'); c2.setAttribute('cx', '22'); c2.setAttribute('cy', '22'); c2.setAttribute('r', '18'); c2.setAttribute('fill', 'none'); c2.setAttribute('stroke', '#6c5ce7'); c2.setAttribute('stroke-width', '6'); c2.setAttribute('stroke-linecap', 'round');
  var circ = 2 * Math.PI * 18; c2.setAttribute('stroke-dasharray', String(circ)); c2.setAttribute('stroke-dashoffset', String(circ * (1 - overall()))); c2.setAttribute('transform', 'rotate(-90 22 22)');
  svg.appendChild(c1); svg.appendChild(c2);
  var tx = mkE('div', 'ringtxt', 'Journey ' + pct + '%'); tx.appendChild(mkE('span', null, daysDone() + ' of ' + TOTAL + ' days complete'));
  add(rw, tx, svg);
}
var TABS = [['learn', '📖 Today'], ['road', '🗺️ Roadmap'], ['recap', '🧠 Recap']];
function renderTabs(){
  var tb = $('tabs'); clearEl(tb);
  TABS.forEach(function(t){
    var b = mkE('button', 'tab' + (curTab === t[0] ? ' on' : ''), t[1]); b.type = 'button';
    b.addEventListener('click', function(){ showTab(t[0]); });
    tb.appendChild(b);
  });
}
function showTab(t){
  if (R.on) exitReel();
  curTab = t;
  ['learn', 'road', 'recap'].forEach(function(x){ $('v-' + x).classList.toggle('on', x === t); });
  renderTabs();
  if (t === 'road') renderRoad();
  if (t === 'recap') renderRecap();
  if (t !== 'learn') C.playing = false;
  updateTransport();
  try { history.replaceState(null, '', '#' + (t === 'road' ? 'roadmap' : t)); } catch (e) {}
  window.scrollTo(0, 0);
}

/* ---- three.js engine ---- */
function initGL(){
  if (typeof THREE === 'undefined') return false;
  try {
    var r = new THREE.WebGLRenderer({ antialias: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    G.renderer = r;
  } catch (e) { return false; }
  G.scene = new THREE.Scene(); G.scene.background = new THREE.Color(0xdff0ff); G.scene.fog = new THREE.Fog(0xdff0ff, 34, 70);
  G.camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 120);
  var hemi = new THREE.HemisphereLight(0xffffff, 0xffd9a8, 0.95); G.scene.add(hemi);
  var dir = new THREE.DirectionalLight(0xffffff, 0.75); dir.position.set(6, 12, 9); G.scene.add(dir);
  G.ok = true; return true;
}
function loadStage(day){
  if (!G.ok) return;
  if (G.stage) G.stage.dispose();
  G.stage = STAGES[day] ? STAGES[day](THREE, G.scene) : null;
  if (G.stage){ var p = G.stage.cams[0]; cam.cx = p.c[0]; cam.cy = p.c[1]; cam.cz = p.c[2]; cam.th = p.th; cam.e = p.e; cam.r = p.r; cam.w = p.w; }
}
function resizeGL(){
  if (!G.ok || !UI.stage) return;
  var w = UI.stage.clientWidth || 640, h = UI.stage.clientHeight || 360;
  G.W = w; G.H = h; G.renderer.setSize(w, h, false); G.camera.aspect = w / h; G.camera.updateProjectionMatrix();
}
function camUpdate(dt, t){
  if (!G.stage) return;
  var P = G.stage.cams[C.cur], k = 1 - Math.exp(-dt * 2.2);
  cam.cx += (P.c[0] - cam.cx) * k; cam.cy += (P.c[1] - cam.cy) * k; cam.cz += (P.c[2] - cam.cz) * k;
  cam.th += (P.th - cam.th) * k; cam.e += (P.e - cam.e) * k; cam.r += (P.r - cam.r) * k; cam.w += (P.w - cam.w) * k;
  if (!off.drag){ var d = Math.exp(-dt * 0.45); off.th *= d; off.e *= d; }
  var fov = 42 * Math.PI / 180, aspect = G.W / G.H;
  var rFit = cam.w / (2 * Math.tan(fov / 2) * aspect);
  var r = Math.max(cam.r, rFit) * off.zoom;
  var th = cam.th + off.th + (C.cur === 7 ? Math.sin(t * 0.3) * 0.25 : 0);
  var e = clamp(cam.e + off.e, -0.05, 1.2);
  G.camera.position.set(cam.cx + r * Math.sin(th) * Math.cos(e), cam.cy + r * Math.sin(e), cam.cz + r * Math.cos(th) * Math.cos(e));
  G.camera.lookAt(cam.cx, cam.cy, cam.cz);
}

/* ---- controller ---- */
function fmtT(s){ var m = Math.floor(s / 60), x = Math.floor(s % 60); return 'T+' + (m < 10 ? '0' : '') + m + ':' + (x < 10 ? '0' : '') + x; }
function goTo(i, fromUser){
  var n = scenes().length; i = clamp(i, 0, n - 1);
  C.cur = i; C.st = 0; C.typed = 0; C.visited[i] = true;
  if (V.el){ try { V.el.pause(); } catch (e) {} } V.playing = false; V.scene = -1; V.done = !voiceWanted(); duck(false);
  C.logs.push(fmtT(C.clock) + '  ' + scenes()[i].log); if (C.logs.length > 6) C.logs.shift();
  var d = dstate(DAY);
  if (!d.story && Object.keys(C.visited).length >= n){ d.story = true; saveS(); renderHeader(); renderChecklist(); checkComplete(); toast('Story watched ✔  Now try the practice below!'); }
  if (SK.music) SK.music.chime(i);
  updateStageUI();
}
function updateTransport(){
  if (!UI.play) return;
  UI.play.textContent = C.playing ? '⏸ Pause' : '▶ Play';
  UI.speed.textContent = '⏱ ' + SPEEDS[C.speedIdx] + 'x';
  UI.fxb.textContent = C.fx ? '✨ FX on' : '✨ FX off';
  if (UI.voi) UI.voi.textContent = V.muted ? '🔇 Voice off' : '🗣️ Voice on';
  if (UI.mus) UI.mus.textContent = (SK.music && SK.music.muted) ? '🔇 Music off' : '🎵 Music on';
}
function toggleMusic(){
  if (!SK.music) return; SK.music.muted = !SK.music.muted;
  try { localStorage.setItem('sk.music', SK.music.muted ? 'off' : 'on'); } catch (e) {}
  if (SK.music.muted) SK.music.sync(false);
  updateTransport();
}
function sqlTokens(sql){
  var box = mkE('span'); var parts = sql.split(/(\s+|,|;)/);
  parts.forEach(function(p){
    if (!p) return; var u = p.toUpperCase(), cls = null;
    if (['SELECT', 'FROM', 'WHERE'].indexOf(u) >= 0) cls = 'k1'; else if (p === '*') cls = 'k2';
    else if (DB[p.toLowerCase()]) cls = 'k3'; else if (/^[A-Za-z_]+$/.test(p)) cls = 'k2';
    var s = mkE('span', cls, p); box.appendChild(s);
  });
  return box;
}
function updateStageUI(){
  var sc = scenes()[C.cur], total = scenes().length;
  UI.chip.textContent = 'Scene ' + (C.cur + 1) + '/' + total + ' · ' + sc.title;
  UI.term.textContent = sc.term || '';
  UI.slider.value = String(C.cur);
  UI.slider.max = String(total - 1);
  /* scroll bubble with the SQL sentence and Pico's answer */
  clearEl(UI.scroll);
  if (sc.sql){
    UI.scroll.classList.add('on');
    add(UI.scroll, mkE('div', 'who', sc.who));
    var q = mkE('div', 'sq'); q.appendChild(sqlTokens(sc.sql)); UI.scroll.appendChild(q);
    var res = null; try { res = runSql(sc.sql); } catch (e) {}
    if (res){
      var rd = mkE('div', 'res'); rd.appendChild(mkE('span', null, '🤖 Pico hands back:'));
      if (res.cols.length === 1){ res.rows.forEach(function(r){ rd.appendChild(mkE('i', null, String(r[0]))); }); }
      else rd.appendChild(mkE('i', null, res.rows.length + ' rows × ' + res.cols.length + ' columns'));
      UI.scroll.appendChild(rd);
    }
  } else UI.scroll.classList.remove('on');
  /* real-life card + notebook */
  clearEl(UI.real); UI.real.appendChild(mkE('span', null, '🧠 In real life: ')); appendRich(UI.real, sc.real);
  clearEl(UI.note); C.logs.forEach(function(l){ UI.note.appendChild(mkE('div', null, l)); });
  if (UI.rows) UI.rows.forEach(function(tr, i){ tr.classList.toggle('cur', i === C.cur); });
  if (R.on){ UI.main.textContent = sc.short; UI.rbar.style.width = (((C.cur) / total) * 100) + '%'; }
  if (!G.ok){ UI.fbEm.textContent = sc.emoji; UI.fbTx.textContent = sc.story; }
  updateTransport();
}
function appendRich(parent, html){          /* tiny safe parser: only <b>…</b> */
  var parts = html.split(/(<b>|<\/b>)/), bold = false;
  parts.forEach(function(p){ if (p === '<b>') bold = true; else if (p === '</b>') bold = false; else if (p){ parent.appendChild(bold ? mkE('b', null, p) : document.createTextNode(p)); } });
}

var lastTs = 0;
function frame(ts){
  requestAnimationFrame(frame);
  var now = ts / 1000, dt = clamp(now - lastTs, 0, 0.05); lastTs = now; G.t += dt;
  var sc = scenes()[C.cur], sp = speedNow();
  if (R.on){
    if (R.phase === 'intro'){ R.t += dt; if (R.t > (R.introLen || 2.6)){ R.phase = 'play'; setCard(null); goTo(0); C.playing = true; } }
    else if (R.phase === 'end'){ R.t += dt; if (R.t > (R.endLen || 5)){ R.phase = 'intro'; R.t = 0; C.cur = 0; C.st = 0; setCard('intro'); } }
  }
  var active = curTab === 'learn' || R.on;
  voiceTick(active && !document.hidden);
  if (SK.music){ var wantMusic = active && C.playing && !(R.on && R.phase !== 'play') && !document.hidden; if (wantMusic !== SK.music.on) SK.music.sync(wantMusic); }
  if (active && C.playing && !(R.on && R.phase !== 'play')){
    var cs = voiceWanted() ? voiceInfo().clips[C.cur] : null;
    if (cs && V.scene === C.cur && !V.failed && V.el){   /* the narration is the clock: animation follows the voice, even on a slow computer */
      if (V.playing) C.st = clamp(V.el.currentTime / cs.s, 0, 1) * scenes()[C.cur].dur;
      else if (V.done) C.st = Math.max(C.st, scenes()[C.cur].dur);
    } else C.st += dt * sp;
    C.clock += dt * sp;
    if (C.st >= sceneLen(C.cur) && (V.done || !voiceWanted())){
      if (C.cur < scenes().length - 1) goTo(C.cur + 1);
      else { C.playing = false; if (R.on){ R.phase = 'end'; R.t = 0; setCard('end'); UI.rbar.style.width = '100%'; } updateTransport(); }
    }
  }
  /* caption */
  if (active){
    if (R.on){ /* reel caption set in updateStageUI */ }
    else {
      var full = sc.story, spd = reduced ? 9999 : 30 * Math.max(0.6, sp);
      if (voiceWanted() && !reduced){ var vc = voiceInfo().clips[C.cur]; if (vc) spd = full.length / Math.max(2, (vc.s / voiceRate()) * 0.5); }
      if (C.typed < full.length){ C.typed = Math.min(full.length, C.typed + dt * spd); UI.main.textContent = full.slice(0, Math.floor(C.typed)); }
      else if (UI.main.textContent !== full) UI.main.textContent = full;
    }
    if (G.ok && G.stage && (R.on || isVisible(UI.stage))){
      G.stage.update(C.cur, C.st, dt, G.t, C.fx);
      camUpdate(dt, G.t);
      G.renderer.render(G.scene, G.camera);
    }
  }
}
function isVisible(el){ var r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < (window.innerHeight || 800); }

/* ---- stage + reel mode ---- */
function setCard(kind){
  clearEl(UI.card);
  if (!kind){ UI.card.classList.remove('on'); return; }
  UI.card.classList.add('on');
  var d = dayData();
  if (kind === 'intro'){
    add(UI.card, mkE('div', 'a', 'SQL Kingdom · SQL for everyone'), mkE('div', 'b', 'Day ' + DAY + ' of ' + TOTAL), mkE('div', 'c', d.title), mkE('div', 'a', '🧸 A one-minute story – even a 5-year-old can follow'));
    UI.rbar.style.width = '0%';
  } else {
    var wl = mkE('div', 'wl'); d.words.forEach(function(w){ wl.appendChild(mkE('span', null, w.w)); });
    add(UI.card, mkE('div', 'a', 'Day ' + DAY + ' ✔ you now know'), wl, mkE('div', 'c', 'Tomorrow: ' + d.next), mkE('div', 'a', '60 days · 1 hour a day · zero to hero'));
  }
}
function layoutReel(){
  if (!R.on) return;
  var ar = R.ar === '9:16' ? 9 / 16 : (R.ar === '16:9' ? 16 / 9 : 1);
  var aw = window.innerWidth * 0.94, ah = window.innerHeight - 90, w, h;
  if (aw / ah > ar){ h = ah; w = h * ar; } else { w = aw; h = w / ar; }
  UI.rframe.style.width = Math.floor(w) + 'px'; UI.rframe.style.height = Math.floor(h) + 'px';
  setTimeout(resizeGL, 30);
}
function startReel(){
  if (R.on) return;
  R.on = true; R.speedBefore = C.speedIdx;
  UI.stage.classList.add('reelmode'); UI.stage.classList.remove('fake');
  UI.rframe.appendChild(UI.stage); $('reel').classList.add('on'); document.body.style.overflow = 'hidden';
  C.fx = true; R.phase = 'intro'; R.t = 0; C.playing = false; C.cur = 0; C.st = 0; C.visited = C.visited;
  setCard('intro'); updateStageUI(); layoutReel();
  try { history.replaceState(null, '', '#reel'); } catch (e) {}
}
function exitReel(){
  if (!R.on) return;
  R.on = false; C.playing = false; setCard(null);
  UI.stage.classList.remove('reelmode'); UI.stageHost.appendChild(UI.stage);
  $('reel').classList.remove('on'); document.body.style.overflow = '';
  clearEl(UI.scroll); UI.scroll.classList.remove('on');
  C.typed = 0; updateStageUI(); setTimeout(resizeGL, 30); updateTransport();
  try { history.replaceState(null, '', '#learn'); } catch (e) {}
}
function buildReelChrome(){
  var rc = $('reel'); clearEl(rc);
  UI.rframe = mkE('div', 'rframe'); rc.appendChild(UI.rframe);
  var ctl = mkE('div', 'rctl');
  ['1:1', '9:16', '16:9'].forEach(function(a){
    var b = mkE('button', 'btn sm', a === '1:1' ? '◼ Square' : (a === '9:16' ? '📱 Vertical' : '🖥 Wide')); b.type = 'button';
    b.addEventListener('click', function(){ R.ar = a; layoutReel(); }); ctl.appendChild(b);
  });
  var pb = mkE('button', 'btn sm', '⏸ Pause'); pb.type = 'button';
  pb.addEventListener('click', function(){ if (R.phase === 'play'){ C.playing = !C.playing; pb.textContent = C.playing ? '⏸ Pause' : '▶ Resume'; } });
  var rs = mkE('button', 'btn sm', '↺ Restart'); rs.type = 'button';
  rs.addEventListener('click', function(){ R.phase = 'intro'; R.t = 0; C.playing = false; C.cur = 0; C.st = 0; setCard('intro'); updateStageUI(); pb.textContent = '⏸ Pause'; });
  var mu = mkE('button', 'btn sm', '🎵 Music'); mu.type = 'button'; mu.addEventListener('click', function(){ toggleMusic(); mu.textContent = SK.music.muted ? '🔇 Music' : '🎵 Music'; });
  var ex = mkE('button', 'btn sm fill', '✕ Close'); ex.type = 'button'; ex.addEventListener('click', exitReel);
  add(ctl, pb, rs, mu, ex); rc.appendChild(ctl);
}

function buildStage(){
  var st = mkE('div', 'stage'); UI.stage = st;
  var cv = null;
  if (G.ok){ cv = G.renderer.domElement; st.appendChild(cv); }
  var fb = mkE('div', 'fallback'); UI.fbEm = mkE('div', 'em'); UI.fbTx = mkE('p', 'big'); add(fb, UI.fbEm, UI.fbTx);
  if (!G.ok) fb.style.display = 'flex';
  st.appendChild(fb);
  UI.chip = mkE('div', 'chip2'); UI.scroll = mkE('div', 'scroll');
  var cap = mkE('div', 'cap'); UI.term = mkE('div', 'term'); UI.main = mkE('div', 'main'); add(cap, UI.term, UI.main);
  UI.rbrand = mkE('div', 'rBrand'); add(UI.rbrand, mkE('span', null, '🧸 SQL Kingdom'), mkE('span', null, 'Day ' + DAY + ' / ' + TOTAL));
  UI.rbar = mkE('div', 'rBar'); UI.card = mkE('div', 'fscard');
  var fs = mkE('button', 'fsb', '⛶'); fs.type = 'button'; fs.title = 'Full screen'; fs.setAttribute('aria-label', 'Full screen');
  fs.addEventListener('click', function(){
    var el = UI.stage;
    if (document.fullscreenElement){ try { document.exitFullscreen(); } catch (e) {} return; }
    if (el.classList.contains('fake')){ el.classList.remove('fake'); setTimeout(resizeGL, 30); return; }
    var p = null; try { p = el.requestFullscreen ? el.requestFullscreen() : null; } catch (e) { p = null; }
    if (p && p.catch) p.catch(function(){ el.classList.add('fake'); setTimeout(resizeGL, 30); });
    else if (!p) { el.classList.add('fake'); setTimeout(resizeGL, 30); }
  });
  add(st, UI.chip, fs, UI.scroll, cap, UI.rbrand, UI.rbar, UI.card);
  /* drag to orbit, wheel to zoom */
  if (cv){
    cv.addEventListener('pointerdown', function(e){ off.drag = true; off.x = e.clientX; off.y = e.clientY; try { cv.setPointerCapture(e.pointerId); } catch (x) {} });
    cv.addEventListener('pointermove', function(e){ if (!off.drag) return; off.th -= (e.clientX - off.x) * 0.006; off.e += (e.clientY - off.y) * 0.004; off.th = clamp(off.th, -1.2, 1.2); off.e = clamp(off.e, -0.2, 0.8); off.x = e.clientX; off.y = e.clientY; });
    var up = function(){ off.drag = false; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', function(e){ if (e.ctrlKey || Math.abs(e.deltaY) > 0){ off.zoom = clamp(off.zoom * (e.deltaY > 0 ? 1.06 : 0.94), 0.6, 1.5); e.preventDefault(); } }, { passive: false });
  }
  if (window.ResizeObserver){ new ResizeObserver(function(){ resizeGL(); }).observe(st); }
  document.addEventListener('fullscreenchange', function(){ setTimeout(resizeGL, 40); });
  return st;
}

/* ---- LEARN view ---- */
function buildLearn(){
  var v = $('v-learn'); clearEl(v);
  var d = dayData(), ph = phaseOf(DAY);
  var rel = Object.keys(DAYS).map(Number).sort(function(a, b){ return a - b; });
  if (rel.length > 1){
    var pick = mkE('div', 'ctl');
    rel.forEach(function(n){ var b = mkE('button', 'btn sm' + (n === DAY ? ' fill' : ''), 'Day ' + n); b.type = 'button'; b.addEventListener('click', function(){ openDay(n); }); pick.appendChild(b); });
    v.appendChild(pick);
  }
  /* hero */
  var hero = mkE('div', 'hero');
  add(hero, mkE('span', 'pill', 'Day ' + DAY + ' of ' + TOTAL + ' · Phase ' + (PHASES.indexOf(ph) + 1) + ': ' + ph.name), mkE('h1', null, d.title), mkE('p', null, d.promise));
  var gl = mkE('ul', 'goals'); d.goals.forEach(function(g){ gl.appendChild(mkE('li', null, g)); });
  hero.appendChild(mkE('p', null, 'By the end you will be able to:')); hero.appendChild(gl);
  var chips = mkE('div', 'chips'); d.cast.forEach(function(c){ chips.appendChild(mkE('span', 'chip', c[0] + ' ' + c[1])); }); hero.appendChild(chips);
  v.appendChild(hero);
  var plan = mkE('div', 'plan');
  [['⏱ 30 min · Learn', 'Watch the story, say the new words'], ['⏱ 30 min · Try it', 'Practice in the sandbox, then the quiz'], ['🧠 2 min · Recap', 'See what you know and what is next']].forEach(function(p){
    var x = mkE('div'); add(x, mkE('b', null, p[0]), document.createTextNode(p[1])); plan.appendChild(x);
  });
  v.appendChild(plan);
  var rc = mkE('div', 'card recapcard'); add(rc, mkE('b', null, '⏪ Last time on SQL Kingdom: '), document.createTextNode(DAY === 1 ? d.recap : recapFor(DAY - 1))); v.appendChild(rc);

  /* story */
  var s1 = mkE('div', 'sec'); add(s1, mkE('h2', null, '📖 Part A · The story (30 min)'), mkE('p', 'sub', 'Press play and watch. Drag the picture to look around. Use the slider to replay any scene.'));
  UI.stageHost = mkE('div'); UI.stageHost.appendChild(buildStage()); s1.appendChild(UI.stageHost);
  var ctl = mkE('div', 'ctl');
  var prev = mkE('button', 'btn', '⏮'); prev.type = 'button'; prev.setAttribute('aria-label', 'Previous scene'); prev.addEventListener('click', function(){ goTo(C.cur - 1, true); });
  UI.play = mkE('button', 'btn fill', '▶ Play'); UI.play.type = 'button';
  UI.play.addEventListener('click', function(){
    if (!C.playing && C.cur === scenes().length - 1 && C.st >= scenes()[C.cur].dur - 0.1) goTo(0);
    C.playing = !C.playing; updateTransport();
  });
  var next = mkE('button', 'btn', '⏭'); next.type = 'button'; next.setAttribute('aria-label', 'Next scene'); next.addEventListener('click', function(){ goTo(C.cur + 1, true); });
  UI.slider = mkE('input'); UI.slider.type = 'range'; UI.slider.min = '0'; UI.slider.max = String(scenes().length - 1); UI.slider.value = '0'; UI.slider.setAttribute('aria-label', 'Scene');
  UI.slider.addEventListener('input', function(){ goTo(+UI.slider.value, true); });
  UI.speed = mkE('button', 'btn', '⏱ 1x'); UI.speed.type = 'button'; UI.speed.addEventListener('click', function(){ C.speedIdx = (C.speedIdx + 1) % SPEEDS.length; updateTransport(); });
  UI.fxb = mkE('button', 'btn', '✨ FX on'); UI.fxb.type = 'button'; UI.fxb.addEventListener('click', function(){ C.fx = !C.fx; updateTransport(); });
  UI.mus = mkE('button', 'btn', '🎵 Music on'); UI.mus.type = 'button'; UI.mus.addEventListener('click', function(){ toggleMusic(); });
  if (!SK.music || !SK.music.supported()) UI.mus.style.display = 'none';
  UI.voi = mkE('button', 'btn', '🗣️ Voice on'); UI.voi.type = 'button'; UI.voi.addEventListener('click', toggleVoice);
  if (!(SK.AUDIO && SK.AUDIO[DAY])) UI.voi.style.display = 'none';
  var rv = mkE('button', 'btn', '🎯 Reset view'); rv.type = 'button'; rv.addEventListener('click', function(){ off.th = 0; off.e = 0; off.zoom = 1; });
  add(ctl, prev, UI.play, next, UI.slider, UI.speed, UI.fxb, UI.voi, UI.mus, rv); s1.appendChild(ctl);
  UI.real = mkE('div', 'real'); UI.note = mkE('div', 'note'); add(s1, UI.real, UI.note);
  v.appendChild(s1);

  /* story vs real */
  var s2 = mkE('div', 'sec'); add(s2, mkE('h2', null, '🔁 Story vs real life'), mkE('p', 'sub', 'Click a row to jump to that scene.'));
  var tb = mkE('table', 'tb'); var th = mkE('tr'); ['#', 'In the story', 'In real SQL'].forEach(function(h){ th.appendChild(mkE('th', null, h)); }); tb.appendChild(th);
  UI.rows = scenes().map(function(sc, i){
    var tr = mkE('tr', 'row'); add(tr, mkE('td', null, String(i + 1)), mkE('td', null, sc.title));
    var td = mkE('td'); appendRich(td, sc.real); tr.appendChild(td);
    tr.addEventListener('click', function(){ goTo(i, true); UI.stage.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    tb.appendChild(tr); return tr;
  });
  s2.appendChild(tb); v.appendChild(s2);

  /* words */
  var s3 = mkE('div', 'sec'); add(s3, mkE('h2', null, '🔤 Today’s words'), mkE('p', 'sub', 'Say each one out loud, with its little sentence.'));
  var wc = mkE('div', 'cards');
  d.words.forEach(function(w){
    var c = mkE('div', 'wcard'); add(c, mkE('div', 'w', w.em + ' ' + w.w), mkE('div', 's', '🧸 ' + w.story), mkE('div', 'r', '🧠 ' + w.real), mkE('div', 'say', '🗣 “' + w.say + '”'));
    wc.appendChild(c);
  });
  s3.appendChild(wc); v.appendChild(s3);

  /* practice */
  var s4 = mkE('div', 'sec'); add(s4, mkE('h2', null, '🛠 Part B · Your turn (30 min)'), mkE('p', 'sub', 'Talk to Pico for real. Type a SQL sentence, press Run (or Ctrl+Enter). Mistakes are free – Pico explains them kindly.'));
  buildPractice(s4); v.appendChild(s4);

  /* quiz */
  var s5 = mkE('div', 'sec'); add(s5, mkE('h2', null, '❓ Quick quiz'), mkE('p', 'sub', 'Four questions. Wrong answers are how brains grow.'));
  UI.quizBox = mkE('div'); s5.appendChild(UI.quizBox); buildQuiz(); v.appendChild(s5);

  /* take-home files */
  if (d.downloads && d.downloads.length){
    var sd = mkE('div', 'sec'); add(sd, mkE('h2', null, '📥 Take-home files'), mkE('p', 'sub', 'Keep these. Run the SQL on your own computer.'));
    var dl = mkE('div', 'cards');
    d.downloads.forEach(function(f){
      var a = mkE('a', 'wcard'); a.href = f.data ? 'data:text/plain;charset=utf-8,' + encodeURIComponent(f.data) : 'days/' + dayId(DAY) + '/' + f.file; a.setAttribute('download', f.file); a.style.textDecoration = 'none'; a.style.color = 'inherit';
      add(a, mkE('div', 'w', '📄 ' + f.file), mkE('div', 'r', f.label)); dl.appendChild(a);
    });
    sd.appendChild(dl); v.appendChild(sd);
  }
  /* progress */
  var s6 = mkE('div', 'sec'); add(s6, mkE('h2', null, '✅ Today’s progress'));
  var pc = mkE('div', 'card'); UI.check = mkE('div', 'check'); UI.dayBar = mkE('div', 'bar'); UI.dayBar.appendChild(mkE('i'));
  add(pc, UI.check, mkE('div', null, ''), UI.dayBar); s6.appendChild(pc);
  UI.banner = mkE('div', 'banner'); s6.appendChild(UI.banner); v.appendChild(s6);
  renderChecklist();
}
function openDay(n){
  DAY = n; C.cur = 0; C.st = 0; C.typed = 0; C.visited = {}; C.logs = []; C.playing = false; C.clock = 0;
  if (SK.music) SK.music.setDay(n);
  voiceStop();
  buildLearn(); loadStage(n); resizeGL();
  C.visited[0] = true; C.logs.push(fmtT(0) + '  ' + scenes()[0].log);
  updateStageUI(); renderHeader(); window.scrollTo(0, 0);
}
function pickDay(){
  var rel = Object.keys(DAYS).map(Number).sort(function(a, b){ return a - b; });
  for (var i = 0; i < rel.length; i++){ if (dayFrac(rel[i]) < 0.999) return rel[i]; }
  return rel[rel.length - 1] || 1;
}
function recapFor(n){
  var d = DAYS[n]; if (!d) return 'Welcome back!';
  return 'Day ' + n + ' – ' + d.title + '. You learned: ' + d.words.map(function(w){ return w.w; }).join(', ') + '.';
}
function renderChecklist(){
  if (!UI.check) return;
  var d = dstate(DAY), dd = dayData();
  clearEl(UI.check);
  var items = [
    [d.story, 'Watched the whole story (' + Object.keys(C.visited).length + '/' + scenes().length + ' scenes this visit)'],
    [taskCount(DAY) >= REQ_TASKS, 'Practice: ' + Math.min(REQ_TASKS, taskCount(DAY)) + ' of ' + REQ_TASKS + ' tasks done (bonus is optional)'],
    [d.quiz && d.quiz.done, 'Quiz finished' + (d.quiz && d.quiz.done ? ' · score ' + d.quiz.score + '/' + dd.quiz.length : '')]
  ];
  items.forEach(function(it){ var r = mkE('div'); add(r, mkE('span', 'ic' + (it[0] ? ' ok' : ''), it[0] ? '✓' : '·'), mkE('span', null, it[1])); UI.check.appendChild(r); });
  UI.dayBar.firstChild.style.width = Math.round(dayFrac(DAY) * 100) + '%';
  checkComplete(true);
}
function checkComplete(silent){
  var d = dstate(DAY);
  if (dayFrac(DAY) >= 0.999){
    clearEl(UI.banner); UI.banner.classList.add('on');
    UI.banner.appendChild(document.createTextNode('🎉 Day ' + DAY + ' complete! Tomorrow: ' + dayData().next + '. Check the Recap tab to see your words.'));
    if (!d.celebrated){ d.celebrated = true; saveS(); renderHeader(); if (!silent) toast('🎉 Day ' + DAY + ' complete!'); else toast('🎉 Day ' + DAY + ' complete!'); }
  } else UI.banner.classList.remove('on');
}

/* practice sandbox */
function buildPractice(parent){
  var d = dayData(), ds = dstate(DAY), sel = 0;
  var sch = mkE('div', 'schema');
  Object.keys(DB).forEach(function(k){ var s = mkE('span'); add(s, mkE('b', null, k), document.createTextNode(' (' + DB[k].cols.join(', ') + ')')); sch.appendChild(s); });
  parent.appendChild(mkE('div', 'meta', 'Cupboards you can open:')); parent.appendChild(sch);
  var wrap = mkE('div', 'prac'); var list = mkE('div', 'tasks'); var right = mkE('div');
  var ed = mkE('textarea', 'sql'); ed.spellcheck = false; ed.value = 'SELECT '; ed.setAttribute('aria-label', 'SQL editor');
  var out = mkE('div', 'out'); var task = mkE('div', 'card'); var btns = mkE('div', 'ctl');
  var btnEls = [];
  function paintList(){
    btnEls.forEach(function(b, i){ var done = i > 0 && ds.tasks[i - 1]; b.className = 'task' + (i === sel ? ' on' : '') + (done ? ' done' : ''); b.firstChild.textContent = i === 0 ? '✎' : (done ? '✓' : String(i)); });
  }
  function selectTask(i){
    sel = i; clearEl(task);
    if (i === 0){
      add(task, mkE('b', null, 'Free play: '), document.createTextNode('type anything. Sneak peek of tomorrow:'));
      var pk = mkE('button', 'btn sm', "SELECT name FROM toys WHERE color = 'red';"); pk.type = 'button'; pk.style.marginLeft = '8px';
      pk.addEventListener('click', function(){ ed.value = "SELECT name FROM toys WHERE color = 'red';"; }); task.appendChild(pk);
    } else {
      var t = d.tasks[i - 1];
      add(task, mkE('b', null, (t.bonus ? 'Bonus task: ' : 'Task ' + i + ': ')), document.createTextNode(t.text));
    }
    clearEl(out); paintList();
  }
  function showResult(res, msgCls, msg){
    clearEl(out);
    if (res){
      var tb = mkE('table'); var hr = mkE('tr'); res.cols.forEach(function(c){ hr.appendChild(mkE('th', null, c)); }); tb.appendChild(hr);
      res.rows.forEach(function(r){ var tr = mkE('tr'); r.forEach(function(x){ tr.appendChild(mkE('td', null, String(x))); }); tb.appendChild(tr); });
      out.appendChild(tb);
      out.appendChild(mkE('div', 'meta', '🤖 Pico opened ' + res.scanned + ' shelves in “' + res.table + '” and handed you ' + res.rows.length + ' row' + (res.rows.length === 1 ? '' : 's') + '.'));
    }
    if (msg) out.appendChild(mkE('div', 'msg ' + msgCls, msg));
  }
  function same(a, b){ return JSON.stringify(a.cols) === JSON.stringify(b.cols) && JSON.stringify(a.rows) === JSON.stringify(b.rows); }
  function run(){
    var res;
    try { res = runSql(ed.value); } catch (e) { showResult(null, 'err', '😕 ' + (e.message || 'Something went wrong.')); return; }
    if (sel === 0){
      showResult(res, res.rows.length ? 'info' : 'info', res.rows.length ? 'Nice! Pico understood you.' : 'No rows matched. Words must match exactly, including capital letters.');
      return;
    }
    var t = d.tasks[sel - 1], want = runSql(t.sol);
    if (same(res, want)){
      var first = !ds.tasks[sel - 1]; ds.tasks[sel - 1] = true; saveS();
      showResult(res, 'good', '🎉 Yes! That is exactly right.' + (first ? ' Task complete.' : ''));
      paintList(); renderChecklist(); renderHeader();
    } else {
      var why = res.cols.join(',') !== want.cols.join(',') ? 'Pico answered, but with different labels than the task asks for.' : 'Right labels, but different rows than expected.';
      showResult(res, 'info', '🤔 ' + why + ' Try again, or press Hint.');
    }
  }
  var runB = mkE('button', 'btn fill', '▶ Run'); runB.type = 'button'; runB.addEventListener('click', run);
  var hintB = mkE('button', 'btn', '💡 Hint'); hintB.type = 'button';
  hintB.addEventListener('click', function(){ if (sel === 0){ toast('Try: SELECT * FROM kids;'); return; } showResult(null, 'info', '💡 ' + d.tasks[sel - 1].hint); });
  var ansB = mkE('button', 'btn', '👀 Peek at answer'); ansB.type = 'button';
  ansB.addEventListener('click', function(){ if (sel === 0) return; showResult(null, 'info', 'One way to say it: ' + d.tasks[sel - 1].sol + '  (Typing it yourself still counts!)'); });
  var clrB = mkE('button', 'btn', '↺ Clear'); clrB.type = 'button'; clrB.addEventListener('click', function(){ ed.value = 'SELECT '; clearEl(out); ed.focus(); });
  add(btns, runB, hintB, ansB, clrB);
  ed.addEventListener('keydown', function(e){ if ((e.ctrlKey || e.metaKey) && e.key === 'Enter'){ e.preventDefault(); run(); } });
  var names = ['Free play'].concat(d.tasks.map(function(t, i){ return (t.bonus ? 'Bonus: ' : '') + t.text; }));
  names.forEach(function(nm, i){
    var b = mkE('button', 'task'); b.type = 'button'; b.appendChild(mkE('span', 'n', '')); b.appendChild(document.createTextNode(nm));
    b.addEventListener('click', function(){ selectTask(i); }); list.appendChild(b); btnEls.push(b);
  });
  add(right, task, mkE('div', null, ''), ed, btns, out);
  task.style.marginBottom = '8px';
  add(wrap, list, right); parent.appendChild(wrap);
  /* 30-minute practice timer */
  var tm = mkE('div', 'ctl'); var left = 1800, iv = null; var tl = mkE('span', 'meta', '⏱ Practice timer: 30:00');
  var tb2 = mkE('button', 'btn sm', 'Start 30-min timer'); tb2.type = 'button';
  tb2.addEventListener('click', function(){
    if (iv){ clearInterval(iv); iv = null; tb2.textContent = 'Resume timer'; return; }
    tb2.textContent = 'Pause timer';
    iv = setInterval(function(){ left--; var m = Math.floor(left / 60), s = left % 60; tl.textContent = '⏱ Practice timer: ' + m + ':' + (s < 10 ? '0' : '') + s; if (left <= 0){ clearInterval(iv); iv = null; toast('Time’s up – great work today! 🎉'); } }, 1000);
  });
  add(tm, tb2, tl); parent.appendChild(tm);
  selectTask(1);
}

/* quiz */

/* ---- scorecard ---- */
function dayStars(n){
  var ds = dstate(n), d = DAYS[n], tot = d.quiz.length, done = !!(ds.quiz && ds.quiz.done), q = done ? ds.quiz.score : 0;
  var bonusDone = false; d.tasks.forEach(function(t, i){ if (t.bonus && ds.tasks[i]) bonusDone = true; });
  var o = { story: !!ds.story, tasks: taskCount(n) >= REQ_TASKS, quiz: done && q >= Math.ceil(tot * 0.75), q: q, tot: tot, t: taskCount(n), bonus: bonusDone, best: Math.max(ds.best || 0, q), tries: ds.tries || 0, done: done };
  o.stars = (o.story ? 1 : 0) + (o.tasks ? 1 : 0) + (o.quiz ? 1 : 0);
  o.gold = o.stars === 3 && o.q === tot && o.bonus;
  return o;
}
function starStr(k){ return '★★★'.slice(0, k) + '☆☆☆'.slice(0, 3 - k); }
function scoreText(n){
  var s = dayStars(n), d = DAYS[n];
  return 'SQL Kingdom · Day ' + n + ' – ' + d.title + '\n' + (S.name ? S.name + '\n' : '') + starStr(s.stars) + (s.gold ? ' GOLD' : '') + '\nQuiz: ' + s.q + '/' + s.tot + ' (best ' + s.best + '/' + s.tot + ', attempts ' + s.tries + ')\nPractice: ' + s.t + '/' + REQ_TASKS + (s.bonus ? ' + bonus' : '') + '\nStory watched: ' + (s.story ? 'yes' : 'not yet');
}
function drawScorecard(n){
  var s = dayStars(n), d = DAYS[n], W = 900, H = 520, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  var g = cv.getContext('2d'), F = 'Fredoka, Nunito, system-ui, sans-serif';
  var gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#fff3d6'); gr.addColorStop(1, '#e8e2ff'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.fillStyle = '#6c5ce7'; g.fillRect(0, 0, W, 86);
  g.fillStyle = '#fff'; g.font = 'bold 34px ' + F; g.textBaseline = 'middle'; g.fillText('SQL Kingdom · Day ' + n + ' Scorecard', 32, 44);
  g.fillStyle = '#2b2350'; g.font = 'bold 30px ' + F; g.fillText(d.title, 32, 130);
  g.font = '22px ' + F; g.fillStyle = '#5d5680'; g.fillText((S.name ? S.name + '  ·  ' : '') + new Date().toLocaleDateString(), 32, 168);
  g.font = 'bold 96px ' + F; g.fillStyle = s.gold ? '#f5a623' : '#ffb400'; g.fillText(starStr(s.stars), 32, 262);
  if (s.gold){ g.font = 'bold 30px ' + F; g.fillStyle = '#c47f00'; g.fillText('GOLD · perfect quiz + bonus task', 360, 262); }
  var rows = [['Story watched', s.story ? 'Yes ✓' : 'Not yet'], ['Practice tasks', s.t + ' / ' + REQ_TASKS + (s.bonus ? '  + bonus ✓' : '')], ['Quiz score', s.q + ' / ' + s.tot + '   (best ' + s.best + ' / ' + s.tot + ')'], ['Quiz attempts', String(s.tries)]];
  rows.forEach(function(r, i){ var y = 330 + i * 40; g.font = '24px ' + F; g.fillStyle = '#5d5680'; g.fillText(r[0], 40, y); g.font = 'bold 24px ' + F; g.fillStyle = '#2b2350'; g.fillText(r[1], 330, y); });
  g.font = '20px ' + F; g.fillStyle = '#8a84a8'; g.fillText('60 days · 1 hour a day · zero to hero', 32, H - 24);
  return cv;
}
function scoreCard(n){
  var s = dayStars(n), box = mkE('div', 'card scorecard');
  add(box, mkE('b', null, '🏅 Day ' + n + ' scorecard  ' + starStr(s.stars) + (s.gold ? '  GOLD' : '')),
    mkE('div', 'sub', 'Story ' + (s.story ? '✔' : '–') + '  ·  Practice ' + s.t + '/' + REQ_TASKS + (s.bonus ? ' + bonus' : '') + '  ·  Quiz ' + s.q + '/' + s.tot + ' (best ' + s.best + '/' + s.tot + ')'));
  var dl = mkE('button', 'btn fill', '⬇ Download scorecard (PNG)'); dl.type = 'button';
  dl.addEventListener('click', function(){
    var cv = drawScorecard(n); cv.toBlob(function(b){ if (!b) return; var u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = 'sql-kingdom-day' + n + '-scorecard.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(u); }, 2000); toast('Scorecard saved – send it to your teacher'); }, 'image/png');
  });
  var cp = mkE('button', 'btn', '📋 Copy summary'); cp.type = 'button';
  cp.addEventListener('click', function(){ var t = scoreText(n); try { navigator.clipboard.writeText(t).then(function(){ toast('Copied ✔'); }, function(){ toast('Copy not allowed here'); }); } catch (e) { toast('Copy not allowed here'); } });
  box.style.marginTop = '12px'; add(box, mkE('div'), dl, cp);
  return box;
}

function buildQuiz(){
  var d = dayData(), ds = dstate(DAY);
  clearEl(UI.quizBox);
  if (!ds.quiz) ds.quiz = { ans: {}, done: false, score: 0 };
  var qz = ds.quiz;
  d.quiz.forEach(function(q, qi){
    var box = mkE('div', 'q'); box.appendChild(mkE('h3', null, (qi + 1) + '. ' + q.q));
    var why = mkE('div', 'why'); var btns = [];
    q.o.forEach(function(o, oi){
      var b = mkE('button', 'opt', o); b.type = 'button'; btns.push(b);
      b.addEventListener('click', function(){
        if (qz.ans[qi] !== undefined) return;
        qz.ans[qi] = oi;
        finishQ();
      });
      box.appendChild(b);
    });
    function paintQ(){
      if (qz.ans[qi] === undefined) return;
      btns.forEach(function(b, oi){ if (oi === q.a) b.classList.add('right'); else if (oi === qz.ans[qi]) b.classList.add('wrong'); });
      why.textContent = (qz.ans[qi] === q.a ? '✅ ' : '💡 ') + q.why;
    }
    function finishQ(){
      paintQ();
      var answered = Object.keys(qz.ans).length;
      if (answered === d.quiz.length){
        var sc = 0; d.quiz.forEach(function(qq, i){ if (qz.ans[i] === qq.a) sc++; });
        qz.score = sc; qz.done = true; ds.tries = (ds.tries || 0) + 1; ds.best = Math.max(ds.best || 0, sc); ds.when = Date.now(); saveS(); renderChecklist(); renderHeader(); setTimeout(buildQuiz, 0);
        toast('Quiz done: ' + sc + '/' + d.quiz.length + (sc === d.quiz.length ? ' – perfect! 🌟' : ' – good effort!'));
      } else saveS();
    }
    box.appendChild(why); UI.quizBox.appendChild(box); paintQ();
  });
  var rb = mkE('button', 'btn', '↺ Retake quiz'); rb.type = 'button';
  rb.addEventListener('click', function(){ ds.quiz = { ans: {}, done: false, score: 0 }; saveS(); buildQuiz(); renderChecklist(); renderHeader(); });
  UI.quizBox.appendChild(rb);
  if (qz.done) UI.quizBox.appendChild(scoreCard(DAY));
}

/* ---- ROADMAP view ---- */
function renderRoad(){
  var v = $('v-road'); clearEl(v);
  var hero = mkE('div', 'hero');
  add(hero, mkE('span', 'pill', 'The whole journey'), mkE('h1', null, '60 days from “what is a table?” to “I can explain a Hash Join”'),
    mkE('p', null, 'Every day is one hour: 30 minutes of story, 30 minutes of hands-on practice. New days are released one at a time – the first lessons are the gentlest, the last ones go all the way inside the engine.'));
  v.appendChild(hero);
  var bar = mkE('div', 'bar'); var bi = mkE('i'); bi.style.width = Math.round(overall() * 100) + '%'; bar.appendChild(bi);
  var inf = mkE('div', 'card'); inf.style.marginTop = '14px';
  add(inf, mkE('b', null, 'Your journey: ' + (Math.round(overall() * 1000) / 10) + '% · ' + daysDone() + ' of ' + TOTAL + ' days complete · ' + Object.keys(DAYS).length + ' day(s) released so far'), mkE('div', null, ''), bar);
  v.appendChild(inf);
  PHASES.forEach(function(ph, pi){
    var box = mkE('div', 'phase'); box.style.marginTop = '18px';
    var h = mkE('h3'); var tg = mkE('span', 'tag', 'Days ' + ph.from + '–' + ph.to); tg.style.background = ph.color;
    add(h, document.createTextNode('Phase ' + (pi + 1) + ': ' + ph.name), tg, mkE('span', 'meta', ph.sub)); box.appendChild(h);
    var grid = mkE('div', 'days');
    for (var n = ph.from; n <= ph.to; n++){
      (function(n){
        var parts = ROAD[n - 1].split('|'), built = !!DAYS[n], fin = built && dayFrac(n) >= 0.999;
        var b = mkE('button', 'day ' + (fin ? 'fin' : (built ? 'ready' : 'soon'))); b.type = 'button';
        var t = mkE('div'); add(t, mkE('div', 't', (built ? DAYS[n].title : parts[0])), mkE('div', 'h', parts[1] + (built ? (fin ? ' · ✔ done' : ' · ▶ ready') : ' · coming')));
        add(b, mkE('div', 'no', fin ? '✓' : String(n)), t);
        b.addEventListener('click', function(){
          if (built){ openDay(n); showTab('learn'); }
          else toast('Day ' + n + ' is not released yet. Check back soon!');
        });
        grid.appendChild(b);
      })(n);
    }
    box.appendChild(grid); v.appendChild(box);
  });
}

/* ---- RECAP view ---- */
function renderRecap(){
  var v = $('v-recap'); clearEl(v);
  var words = wordsKnown(), nd = daysDone();
  var hero = mkE('div', 'hero'); add(hero, mkE('span', 'pill', 'Recap'), mkE('h1', null, 'What you know – and what is still ahead'), mkE('p', null, 'Flip each card and try to say the answer out loud before you peek. That is how it sticks.'));
  v.appendChild(hero);
  var stats = mkE('div', 'stats'); stats.style.marginTop = '14px';
  [[String(nd), 'days complete'], [String(words.length), 'words learned'], [String(TOTAL - nd), 'days still ahead'], [(Math.round(overall() * 1000) / 10) + '%', 'of the journey']].forEach(function(s){ var x = mkE('div', 'stat'); add(x, mkE('b', null, s[0]), document.createTextNode(s[1])); stats.appendChild(x); });
  v.appendChild(stats);
  var pc = mkE('div', 'card'); pc.style.marginBottom = '14px';
  add(pc, mkE('b', null, '📤 Share your progress with your teacher'), mkE('p', 'sub', 'Your progress lives in this browser. Copy your progress code and send it, or paste a code below to restore it on another device.'));
  var nm = mkE('input'); nm.type = 'text'; nm.placeholder = 'Your name (optional)'; nm.value = S.name || ''; nm.setAttribute('aria-label', 'Your name'); nm.style.cssText = 'padding:6px 10px;border:2px solid var(--line);border-radius:10px;font:inherit;margin-right:8px';
  var code = mkE('textarea', 'sql'); code.readOnly = true; code.style.minHeight = '60px';
  function fill(){ S.name = nm.value; saveS(); code.value = progressCode(); }
  nm.addEventListener('input', fill); fill();
  var cp = mkE('button', 'btn fill', '📋 Copy my progress code'); cp.type = 'button';
  cp.addEventListener('click', function(){ fill(); try { navigator.clipboard.writeText(code.value).then(function(){ toast('Copied ✔ – send it to your teacher'); }, function(){ code.select(); toast('Press Ctrl+C to copy'); }); } catch (e) { code.select(); toast('Press Ctrl+C to copy'); } });
  var imp = mkE('textarea', 'sql'); imp.placeholder = 'Paste a progress code here to restore it'; imp.style.minHeight = '50px'; imp.style.marginTop = '10px';
  var ib = mkE('button', 'btn', '↩ Restore from code'); ib.type = 'button'; ib.style.marginTop = '6px';
  ib.addEventListener('click', function(){
    try { var o = JSON.parse(b64d(imp.value)); if (!o || !o.days) throw new Error('x'); S.days = o.days; if (o.name) S.name = o.name; saveS(); renderHeader(); buildLearn(); loadStage(DAY); resizeGL(); updateStageUI(); renderRecap(); toast('Progress restored ✔'); }
    catch (e) { toast('That code did not look right. Please copy it again.'); }
  });
  add(pc, nm, cp, code, imp, ib); v.appendChild(pc);
  var sc0 = mkE('div', 'sec'); sc0.style.marginTop = '8px'; add(sc0, mkE('h2', null, '🏅 Your scorecards'));
  var anyDay = Object.keys(DAYS).map(Number).sort(function(x, y){ return x - y; });
  var stb = mkE('table', 'tb'), sth = mkE('tr'); ['Day', 'Stars', 'Practice', 'Quiz (best)', 'Tries'].forEach(function(h){ sth.appendChild(mkE('th', null, h)); }); stb.appendChild(sth);
  anyDay.forEach(function(n){ var s = dayStars(n), tr = mkE('tr'); add(tr, mkE('td', null, n + ' · ' + DAYS[n].title), mkE('td', null, starStr(s.stars) + (s.gold ? ' GOLD' : '')), mkE('td', null, s.t + '/' + REQ_TASKS + (s.bonus ? '+' : '')), mkE('td', null, s.done ? (s.q + '/' + s.tot + ' (' + s.best + ')') : '–'), mkE('td', null, String(s.tries))); stb.appendChild(tr); });
  sc0.appendChild(stb); v.appendChild(sc0);
  var s1 = mkE('div', 'sec'); s1.style.marginTop = '8px'; add(s1, mkE('h2', null, '🃏 Your word cards'));
  if (!words.length) s1.appendChild(mkE('div', 'card', 'Finish watching Day 1’s story to unlock your first cards.'));
  else {
    var g = mkE('div', 'cards');
    words.forEach(function(x){
      var id = x.day + ':' + x.w.w, b = mkE('button', 'flip' + (S.flip[id] ? ' on' : '')); b.type = 'button';
      var inn = mkE('div', 'in'), f = mkE('div', 'f'), bk = mkE('div', 'b');
      add(f, mkE('div', 'em', x.w.em), document.createTextNode(x.w.w)); add(bk, mkE('div', null, '🧸 ' + x.w.story), mkE('div', null, '🧠 ' + x.w.real));
      add(inn, f, bk); b.appendChild(inn);
      b.addEventListener('click', function(){ b.classList.toggle('on'); S.flip[id] = b.classList.contains('on'); });
      g.appendChild(b);
    });
    s1.appendChild(g);
  }
  v.appendChild(s1);
  var s2 = mkE('div', 'sec'); add(s2, mkE('h2', null, '🗺️ Still ahead'));
  PHASES.forEach(function(ph){
    var tot = ph.to - ph.from + 1, dn = 0; for (var n = ph.from; n <= ph.to; n++){ if (DAYS[n]) dn += dayFrac(n); }
    var row = mkE('div'); row.style.margin = '8px 0';
    row.appendChild(mkE('div', null, ph.name + ' – ' + ph.sub + '  (' + Math.round(dn * 10) / 10 + ' / ' + tot + ' days)'));
    var b = mkE('div', 'bar'); var i = mkE('i'); i.style.width = Math.round(dn / tot * 100) + '%'; i.style.background = ph.color; b.appendChild(i); row.appendChild(b); s2.appendChild(row);
  });
  var nx = 0; for (var q = 1; q <= TOTAL; q++){ if (!DAYS[q] || dayFrac(q) < 0.999){ nx = q; break; } }
  s2.appendChild(mkE('div', 'card', nx ? ('Next up: Day ' + nx + ' – ' + (DAYS[nx] ? DAYS[nx].title : ROAD[nx - 1].split('|')[0]) + '. ' + (DAYS[nx] ? 'Open the Today tab.' : 'It is coming soon.')) : 'You finished everything. Hero! 🏆'));
  v.appendChild(s2);
}

/* ---- boot ---- */
function boot(){
  loadS();
  try { if (SK.music && localStorage.getItem('sk.music') === 'off') SK.music.muted = true; if (localStorage.getItem('sk.voice') === 'off') V.muted = true; } catch (e) {}
  DAY = pickDay();
  initGL();
  buildReelChrome();
  buildLearn();
  loadStage(DAY);
  Object.keys(DAYS).length;
  renderHeader(); renderTabs();
  resizeGL();
  C.visited[0] = true; C.logs.push(fmtT(0) + '  ' + scenes()[0].log);
  updateStageUI();
  window.addEventListener('resize', function(){ layoutReel(); resizeGL(); });
  window.addEventListener('keydown', function(e){ if (e.key === 'Escape' && R.on) exitReel(); });
  var h = (location.hash || '').replace('#', '');
  showTab(h === 'roadmap' ? 'road' : h === 'recap' ? h : 'learn');
  if (h === 'reel') startReel();
  window.__course = { V: V, music: SK.music, C: C, R: R, goTo: goTo, startReel: startReel, layout: layoutReel, openDay: openDay, runSql: runSql, progressCode: progressCode, S: function(){ return S; } };
  requestAnimationFrame(frame);
}
boot();
})();

/* SQL Kingdom music: a calm, generated ambient bed (soft pads, a slow bass note, gentle kalimba-like plucks, a little reverb).
   Everything is synthesised in code (no audio files, no licences) and is deterministic, so the same notes are produced
   live in the browser and when the teacher renders audio for a reel (SK.music.renderWav). */
(function(){
'use strict';
var SK = window.SK;
var BPM = 54, BEAT = 60 / BPM, BAR = BEAT * 4, CH = BAR * 2;        /* one chord = 2 bars (about 8.9 s) */
var KEYS = [0, 2, -3, 5, -1, 3];                                    /* one key per phase, so each phase sounds a little different */
var CHORDS = [[0, 4, 7, 11], [-3, 0, 4, 7], [-7, -3, 0, 4], [-5, -1, 2, 4]];   /* Cmaj7, Am7, Fmaj7, G6 (as semitone offsets) */
var ORDERS = [[0, 1, 2, 3], [0, 2, 1, 3], [2, 3, 0, 1]];

function rng(seed){ return function(){ seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function mtof(m){ return 440 * Math.pow(2, (m - 69) / 12); }
function phaseIdx(day){ var p = SK.phaseOf ? SK.phaseOf(day) : null; var i = p && SK.PHASES ? SK.PHASES.indexOf(p) : 0; return i < 0 ? 0 : i; }
function cfgFor(day){ var pi = phaseIdx(day); return { day: day, key: KEYS[pi % KEYS.length], order: ORDERS[day % ORDERS.length], seed: day * 7919 + 13 }; }
function chordAt(cfg, c){ return CHORDS[cfg.order[((c % 4) + 4) % 4]]; }

/* ---- the sound bus: dry + reverb into a gentle compressor ---- */
function makeIR(ctx){
  var len = Math.floor(ctx.sampleRate * 2.6), buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (var ch = 0; ch < 2; ch++){ var d = buf.getChannelData(ch), r = rng(991 + ch * 31); for (var i = 0; i < len; i++){ d[i] = (r() * 2 - 1) * Math.pow(1 - i / len, 2.6); } }
  return buf;
}
function makeBus(ctx, dest, level){
  var inp = ctx.createGain(), master = ctx.createGain(), comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.02; comp.release.value = 0.4;
  var dry = ctx.createGain(); dry.gain.value = 0.8;
  var rev = ctx.createConvolver(); rev.buffer = makeIR(ctx); var wet = ctx.createGain(); wet.gain.value = 0.42;
  inp.connect(dry); dry.connect(master); inp.connect(rev); rev.connect(wet); wet.connect(master);
  master.connect(comp); comp.connect(dest); master.gain.value = level;
  return { inp: inp, master: master, comp: comp };
}

/* ---- voices ---- */
function pad(ctx, bus, when, dur, midi, vol){
  var g = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1300; lp.Q.value = 0.3;
  var atk = 2.4, rel = 2.8, end = when + dur;
  g.gain.setValueAtTime(0.0001, when); g.gain.linearRampToValueAtTime(vol, when + atk); g.gain.setValueAtTime(vol, Math.max(when + atk, end - rel)); g.gain.linearRampToValueAtTime(0.0001, end + 0.4);
  [['sine', -4], ['triangle', 5]].forEach(function(o){
    var os = ctx.createOscillator(); os.type = o[0]; os.frequency.value = mtof(midi); os.detune.value = o[1];
    var gg = ctx.createGain(); gg.gain.value = o[0] === 'sine' ? 1 : 0.35; os.connect(gg); gg.connect(lp); os.start(when); os.stop(end + 0.5);
  });
  lp.connect(g); g.connect(bus.inp);
}
function bass(ctx, bus, when, dur, midi, vol){
  var o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = mtof(midi);
  g.gain.setValueAtTime(0.0001, when); g.gain.linearRampToValueAtTime(vol, when + 1.2); g.gain.setValueAtTime(vol, when + dur - 1.6); g.gain.linearRampToValueAtTime(0.0001, when + dur + 0.3);
  o.connect(g); g.connect(bus.inp); o.start(when); o.stop(when + dur + 0.5);
}
function pluck(ctx, bus, when, midi, vol, pan){
  var g = ctx.createGain(), p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  g.gain.setValueAtTime(0.0001, when); g.gain.linearRampToValueAtTime(vol, when + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, when + 1.9);
  [[1, 1], [2, 0.16], [3, 0.05]].forEach(function(h){ var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(midi) * h[0]; var gg = ctx.createGain(); gg.gain.value = h[1]; o.connect(gg); gg.connect(g); o.start(when); o.stop(when + 2.0); });
  if (p){ p.pan.value = pan; g.connect(p); p.connect(bus.inp); } else g.connect(bus.inp);
}
function bell(ctx, bus, when, midi, vol){
  var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, when); g.gain.linearRampToValueAtTime(vol, when + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, when + 2.6);
  [[1, 1], [2.76, 0.35], [5.4, 0.12]].forEach(function(h){ var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(midi) * h[0]; var gg = ctx.createGain(); gg.gain.value = h[1]; o.connect(gg); gg.connect(g); o.start(when); o.stop(when + 2.7); });
  g.connect(bus.inp);
}

/* ---- the score: pure function of time, so live and offline are identical ---- */
function plan(ctx, bus, t0, cfg, from, to, floorTime){
  var base = 60 + cfg.key, c, t;
  for (c = Math.floor(from / CH); c * CH < to; c++){
    t = c * CH; var ch = chordAt(cfg, c);
    if (t >= from){   /* each chord is scheduled once, in the window where it starts (resume snaps back to a chord start) */
      var w = Math.max(t0 + t, floorTime), dur = (t0 + t + CH + 1.2) - w;
      if (dur > 3){
        ch.forEach(function(n){ pad(ctx, bus, w, dur, base + n, 0.04); });
        bass(ctx, bus, w, dur, base - 24 + ch[0], 0.1);
      }
    }
  }
  /* a slow music-box lullaby: gentle rising and falling arpeggio over the chord, with small rests so it can breathe */
  var STEP = BEAT / 2, PAT = [0, 1, 2, 3, 2, 1, 2, 1];
  var i0 = Math.ceil(from / STEP);
  for (var i = i0; i * STEP < to; i++){
    var r = rng(cfg.seed * 131 + i * 977), p = r(), tt = i * STEP;
    var cc = Math.floor(tt / CH), tones = chordAt(cfg, cc);
    var posInBar = i % 8;
    if (posInBar !== 0 && p > 0.82) continue;                       /* occasional rest, never on the bar's first note */
    var n = tones[PAT[i % PAT.length]] + 12 + (posInBar === 0 ? 12 : 0);
    var when = t0 + tt;
    if (when >= floorTime) pluck(ctx, bus, when, base + n, (posInBar === 0 ? 0.075 : 0.05) + r() * 0.015, (r() - 0.5) * 0.9);
  }
}
var CHIME_DEG = [0, 2, 4, 7, 9, 12, 14, 16];
function chimeAt(ctx, bus, when, cfg, sceneIdx){ bell(ctx, bus, when, 72 + cfg.key + CHIME_DEG[sceneIdx % CHIME_DEG.length], 0.035); }

/* ---- live playback ---- */
var L = { ctx: null, bus: null, t0: 0, cursor: 0, timer: null, on: false, cfg: cfgFor(1), level: 0.5, ducked: false };
function targetLevel(){ return L.ducked ? L.level * 0.3 : L.level; }
function ensureCtx(){
  if (L.ctx) return true;
  var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
  try { L.ctx = new AC(); } catch (e) { return false; }
  return true;
}
function tick(){
  if (!L.on) return;
  var now = L.ctx.currentTime, mt = now - L.t0, to = mt + 6;
  plan(L.ctx, L.bus, L.t0, L.cfg, L.cursor, to, now + 0.02);
  L.cursor = to;
}
function start(){
  if (L.on || !ensureCtx()) return;
  try { if (L.ctx.state === 'suspended') L.ctx.resume(); } catch (e) {}
  var now = L.ctx.currentTime;
  L.bus = makeBus(L.ctx, L.ctx.destination, 0.0001);
  L.bus.master.gain.setValueAtTime(0.0001, now); L.bus.master.gain.linearRampToValueAtTime(targetLevel(), now + 1.6);
  var snap = Math.floor(L.cursor / CH) * CH; L.cursor = snap; L.t0 = now - snap; L.on = true;   /* restart at the chord start so the pad is present at once */
  tick(); L.timer = setInterval(tick, 1000);
}
function stop(){
  if (!L.on) return;
  L.on = false; clearInterval(L.timer);
  var b = L.bus, now = L.ctx.currentTime;
  try { b.master.gain.cancelScheduledValues(now); b.master.gain.setValueAtTime(b.master.gain.value, now); b.master.gain.linearRampToValueAtTime(0.0001, now + 0.7); } catch (e) {}
  setTimeout(function(){ try { b.master.disconnect(); } catch (e) {} }, 1200);
  L.cursor = (L.ctx.currentTime - L.t0);
}
var MU = {
  muted: false,
  get on(){ return L.on; },
  setDay: function(n){ L.cfg = cfgFor(n); L.cursor = 0; },
  sync: function(want){ if (want && !MU.muted) start(); else stop(); },
  chime: function(i){ if (!L.on) return; chimeAt(L.ctx, L.bus, L.ctx.currentTime + 0.05, L.cfg, i); },
  setLevel: function(v){ L.level = v; },
  duck: function(on){ L.ducked = !!on; if (!L.on || !L.bus) return; var g = L.bus.master.gain, now = L.ctx.currentTime; try { g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(targetLevel(), now + 0.5); } catch (e) {} },
  context: function(){ return ensureCtx() ? L.ctx : null; },   /* the shared Web Audio engine (the narration plays through it too) */
  supported: function(){ return !!(window.AudioContext || window.webkitAudioContext); },

  /* ---- offline render for reels (teacher tool): returns a base64 16-bit stereo WAV ---- */
  renderWav: function(seconds, opts){
    opts = opts || {}; var sr = 44100, N = Math.ceil(seconds * sr);
    var Off = window.OfflineAudioContext || window.webkitOfflineAudioContext, ctx = new Off(2, N, sr), cfg = cfgFor(opts.day || 1);
    var bus = makeBus(ctx, ctx.destination, 1);
    bus.master.gain.setValueAtTime(0.0001, 0); bus.master.gain.linearRampToValueAtTime(0.55, 2.0);
    bus.master.gain.setValueAtTime(0.55, Math.max(2.0, seconds - 3.2)); bus.master.gain.linearRampToValueAtTime(0.0001, seconds);
    plan(ctx, bus, 0, cfg, 0, seconds, 0);
    (opts.chimes || []).forEach(function(c, k){ if (c < seconds - 1) chimeAt(ctx, bus, c, cfg, k); });
    return ctx.startRendering().then(function(buf){
      var l = buf.getChannelData(0), r = buf.getChannelData(1), peak = 0.0001, i;
      for (i = 0; i < N; i++){ peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i])); }
      var gain = Math.min(4, 0.5 / peak);
      var bytes = new Uint8Array(44 + N * 4), dv = new DataView(bytes.buffer);
      function ws(o, s){ for (var k = 0; k < s.length; k++) dv.setUint8(o + k, s.charCodeAt(k)); }
      ws(0, 'RIFF'); dv.setUint32(4, 36 + N * 4, true); ws(8, 'WAVE'); ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
      dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, N * 4, true);
      for (i = 0; i < N; i++){ dv.setInt16(44 + i * 4, Math.max(-1, Math.min(1, l[i] * gain)) * 32767, true); dv.setInt16(46 + i * 4, Math.max(-1, Math.min(1, r[i] * gain)) * 32767, true); }
      var s = '', CHUNK = 0x8000; for (i = 0; i < bytes.length; i += CHUNK){ s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK)); }
      return btoa(s);
    });
  }
};
SK.music = MU;
})();

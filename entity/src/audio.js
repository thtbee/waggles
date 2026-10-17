// Procedural soundscape: metallic drone for the unbound form, tanpura + singing bowls for padmasana.
export function createAudio() {
  let ctx = null, master, verb, stormBus, zenBus, enabled = false, nextBowl = 0, nextChime = 0;

  function impulse(sec) {
    const len = ctx.sampleRate * sec, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    return buf;
  }
  function noiseBuf() {
    const b = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0; for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    return b;
  }
  function osc(type, f, gain, dest, detune = 0) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
    const g = ctx.createGain(); g.gain.value = gain; o.connect(g).connect(dest); o.start(); return { o, g };
  }

  function init() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0;
    verb = ctx.createConvolver(); verb.buffer = impulse(5.5);
    const verbGain = ctx.createGain(); verbGain.gain.value = 0.55;
    verb.connect(verbGain).connect(master);
    master.connect(ctx.destination);
    stormBus = ctx.createGain(); stormBus.gain.value = 1;
    zenBus = ctx.createGain(); zenBus.gain.value = 0;
    for (const b of [stormBus, zenBus]) { b.connect(master); b.connect(verb); }

    // storm drone
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 3;
    const dg = ctx.createGain(); dg.gain.value = 0.16; lp.connect(dg).connect(stormBus);
    osc('sawtooth', 55, 0.3, lp, -6); osc('sawtooth', 55, 0.3, lp, 7); osc('sawtooth', 82.41, 0.18, lp, 3); osc('sine', 27.5, 0.7, dg);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = ctx.createGain(); lg.gain.value = 140; lfo.connect(lg).connect(lp.frequency); lfo.start();
    const wind = ctx.createBufferSource(); wind.buffer = noiseBuf(); wind.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.8;
    const wg = ctx.createGain(); wg.gain.value = 0.08; wind.connect(bp).connect(wg).connect(stormBus); wind.start();
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.05; const lg2 = ctx.createGain(); lg2.gain.value = 300; lfo2.connect(lg2).connect(bp.frequency); lfo2.start();

    // zen tanpura-like drone (Sa - Pa - Sa')
    const zg = ctx.createGain(); zg.gain.value = 0.06; zg.connect(zenBus);
    [[130.81, 0.5], [196.0, 0.32], [261.63, 0.22], [130.81 * 0.5, 0.45]].forEach(([f, g], i) => {
      const v = osc(i % 2 ? 'triangle' : 'sine', f, g, zg, (i - 1.5) * 3);
      const sw = ctx.createOscillator(); sw.frequency.value = 0.09 + i * 0.031; const sg = ctx.createGain(); sg.gain.value = g * 0.5;
      sw.connect(sg).connect(v.g.gain); sw.start();
    });
    const zw = ctx.createBufferSource(); zw.buffer = noiseBuf(); zw.loop = true;
    const zlp = ctx.createBiquadFilter(); zlp.type = 'lowpass'; zlp.frequency.value = 900;
    const zwg = ctx.createGain(); zwg.gain.value = 0.03; zw.connect(zlp).connect(zwg).connect(zenBus); zw.start();
  }

  function bell(f, amp, dest, decay = 9) {
    const t = ctx.currentTime;
    [[1, 1], [2.71, 0.45], [5.15, 0.25], [8.6, 0.1]].forEach(([m, a]) => {
      for (const det of [-1.5, 1.5]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * m; o.detune.value = det;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp * a * 0.5, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + decay / Math.sqrt(m));
        o.connect(g).connect(dest); o.start(t); o.stop(t + decay + 0.1);
      }
    });
  }
  function chime() {
    const t = ctx.currentTime, f = [1318, 1567, 1975, 2349, 2637][Math.floor(Math.random() * 5)];
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.025, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
    o.connect(g).connect(verb); o.start(t); o.stop(t + 2.6);
  }

  return {
    get enabled() { return enabled; },
    toggle() {
      if (!ctx) init();
      enabled = !enabled;
      if (enabled) ctx.resume();
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(enabled ? 0.9 : 0, ctx.currentTime, 0.6);
      return enabled;
    },
    update(t, zen) {
      if (!ctx || !enabled) return;
      stormBus.gain.setTargetAtTime(1 - zen, ctx.currentTime, 0.3);
      zenBus.gain.setTargetAtTime(zen, ctx.currentTime, 0.3);
      if (zen > 0.9 && t > nextBowl) { bell(Math.random() < 0.5 ? 196 : 261.63, 0.18, verb, 12); nextBowl = t + 9 + Math.random() * 7; }
      if (zen < 0.1 && t > nextChime) { chime(); nextChime = t + 1.5 + Math.random() * 5; }
    },
    awaken(reverse) {
      if (!ctx || !enabled) return;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource(); src.buffer = noiseBuf();
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
      f.frequency.setValueAtTime(reverse ? 3000 : 200, t); f.frequency.exponentialRampToValueAtTime(reverse ? 150 : 4000, t + 3);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t + 2.6); g.gain.exponentialRampToValueAtTime(0.001, t + 4.5);
      src.connect(f).connect(g); g.connect(master); g.connect(verb); src.start(t); src.stop(t + 5);
      setTimeout(() => { if (enabled) bell(reverse ? 110 : 130.81, 0.5, verb, 16); }, 2800);
    },
    drop(x) {
      if (!ctx || !enabled) return;
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(900 + x * 300, t); o.frequency.exponentialRampToValueAtTime(260, t + 0.18);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g); g.connect(master); g.connect(verb); o.start(t); o.stop(t + 0.5);
    },
  };
}

import * as THREE from 'three';

const TAU = Math.PI * 2;
const GAYATRI = 'ॐ भूर्भुवः स्वः तत्सवितुर्वरेण्यं भर्गो देवस्य धीमहि धियो यो नः प्रचोदयात् ॥';
const FONT = '"Tiro Devanagari Sanskrit", "Nirmala UI", "Mangal", serif';

// ------------------------------------------------------------------ textures
function glyphHaloTexture() {
  const S = 2048, c = S / 2;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d', { alpha: false });
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.translate(c, c);
  g.strokeStyle = '#fff'; g.fillStyle = '#fff';

  const circle = (r, w, alpha = 1, dash = null) => {
    g.save(); g.globalAlpha = alpha; g.lineWidth = w; if (dash) g.setLineDash(dash);
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); g.restore();
  };
  // main glyph band
  circle(1000, 5); circle(988, 1.5, 0.6); circle(918, 4); circle(906, 1.2, 0.5);
  // glyphs: word by word around the band (two passes of the mantra)
  g.font = `64px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const words = (GAYATRI + ' ' + GAYATRI).split(' ');
  const widths = words.map(w => g.measureText(w).width);
  const gap = 34;
  const total = widths.reduce((a, b) => a + b + gap, 0);
  const R = 953;
  const scale = (TAU * R) / total;
  let acc = 0;
  g.save();
  words.forEach((w, i) => {
    const span = widths[i] * scale;
    const ang = (acc + span / 2) / R;
    acc += span + gap * scale;
    g.save(); g.rotate(ang); g.translate(0, -R); g.scale(scale, 1);
    g.fillText(w, 0, 6);
    g.restore();
  });
  g.restore();

  // inner faint rings and ticks
  circle(820, 2, 0.55); circle(760, 1.2, 0.3, [18, 22]); circle(640, 1.5, 0.35); circle(560, 1, 0.22, [4, 10]);
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * TAU;
    const long = i % 15 === 0;
    g.save(); g.rotate(a); g.globalAlpha = long ? 0.8 : 0.35;
    g.lineWidth = long ? 3 : 1.5;
    g.beginPath(); g.moveTo(0, -828); g.lineTo(0, long ? -872 : -846); g.stroke(); g.restore();
  }
  // outer sparks
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * TAU;
    const r0 = 1010 + Math.random() * 10, r1 = r0 + 10 + Math.random() * 30;
    g.save(); g.rotate(a); g.globalAlpha = 0.3 + Math.random() * 0.6; g.lineWidth = 1 + Math.random() * 2;
    g.beginPath(); g.moveTo(0, -r0); g.lineTo(0, -r1); g.stroke(); g.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

function lotusMandalaTexture() {
  const S = 2048, c = S / 2;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d', { alpha: false });
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.translate(c, c);
  g.strokeStyle = '#fff'; g.fillStyle = '#fff';
  const petals = (n, r0, r1, wid, lw, alpha, rot = 0) => {
    g.save(); g.globalAlpha = alpha; g.lineWidth = lw;
    for (let i = 0; i < n; i++) {
      g.save(); g.rotate(rot + (i / n) * TAU);
      g.beginPath();
      g.moveTo(0, -r0);
      g.bezierCurveTo(wid, -r0 - (r1 - r0) * 0.35, wid * 0.7, -r1 + (r1 - r0) * 0.15, 0, -r1);
      g.bezierCurveTo(-wid * 0.7, -r1 + (r1 - r0) * 0.15, -wid, -r0 - (r1 - r0) * 0.35, 0, -r0);
      g.stroke();
      // centre vein
      g.globalAlpha = alpha * 0.45; g.beginPath(); g.moveTo(0, -r0 - 20); g.lineTo(0, -r1 + 30); g.stroke(); g.globalAlpha = alpha;
      g.restore();
    }
    g.restore();
  };
  const circle = (r, w, a = 1, dash = null) => { g.save(); g.globalAlpha = a; g.lineWidth = w; if (dash) g.setLineDash(dash); g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); g.restore(); };
  circle(1000, 2.5, 0.8); circle(985, 1, 0.4);
  petals(32, 760, 975, 70, 2.5, 0.75);
  petals(16, 600, 900, 150, 3, 0.9, TAU / 32);
  circle(600, 3, 0.9); circle(585, 1, 0.4, [6, 12]);
  petals(8, 470, 600, 120, 2, 0.5);
  circle(470, 1.5, 0.5);
  for (let i = 0; i < 64; i++) {
    g.save(); g.rotate((i / 64) * TAU); g.globalAlpha = 0.7;
    g.beginPath(); g.arc(0, -1012, 4, 0, TAU); g.fill(); g.restore();
  }
  // tiny bija syllables between the outer petals
  g.font = `44px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const bija = ['लं', 'वं', 'रं', 'यं', 'हं', 'ॐ', 'ह्रीं', 'श्रीं'];
  for (let i = 0; i < 16; i++) {
    g.save(); g.rotate((i / 16) * TAU + TAU / 32); g.globalAlpha = 0.55;
    g.fillText(bija[i % bija.length], 0, -690); g.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

// ------------------------------------------------------------------ halo
const haloVert = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const haloFrag = /* glsl */`
uniform sampler2D tA, tB;
uniform float uTime, uZen, uIntensity, uFlare;
uniform vec3 uColA, uColB;
varying vec2 vUv;
vec2 rot(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
float hash(float n){ return fract(sin(n) * 43758.5453); }
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.08) discard;
  float a = atan(p.y, p.x);
  vec2 ua = rot(p, uTime * 0.035) * 0.5 + 0.5;
  vec2 ub = rot(p, -uTime * 0.02) * 0.5 + 0.5;
  float A = texture2D(tA, ua).r;
  float B = texture2D(tB, ub).r;
  // shimmering travelling light along the glyph band
  float sweep = 0.5 + 0.5 * sin(a * 3.0 - uTime * 0.9);
  float glyphBand = smoothstep(0.86, 0.9, r) * smoothstep(1.0, 0.96, r);
  A *= 0.7 + 0.6 * sweep * glyphBand + 0.3 * (1.0 - glyphBand);
  // procedural inner orbit lines
  float inner = 0.0;
  for (int i = 0; i < 4; i++){
    float fi = float(i);
    float rr = 0.22 + fi * 0.09;
    float ang = a + uTime * (0.15 + 0.1 * fi) * (mod(fi, 2.0) < 1.0 ? 1.0 : -1.0);
    float arc = smoothstep(0.2, 0.9, sin(ang * (1.0 + fi) + fi * 2.0));
    inner += smoothstep(0.004, 0.0, abs(r - rr)) * arc * (0.35 - fi * 0.05);
  }
  float soft = exp(-pow((r - 0.95) * 9.0, 2.0)) * 0.06;
  float edge = smoothstep(1.06, 0.98, r);
  vec3 colA = uColA * (A + inner * (1.0 - uZen) + soft);
  vec3 colB = uColB * (B * (0.55 + 0.45 * smoothstep(0.45, 0.95, r)) * (0.8 + 0.2 * sin(a * 2.0 + uTime * 0.3)) + soft * 0.25);
  vec3 col = mix(colA, colB, uZen) * uIntensity * (1.0 + uFlare * 3.0) * edge;
  gl_FragColor = vec4(col, 1.0);
}`;

// ------------------------------------------------------------------ orbit rings
const ringVert = /* glsl */`
varying vec2 vP;
void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const ringFrag = /* glsl */`
uniform float uRot, uTime, uSpeed, uInner, uOuter, uSeed, uIntensity, uPhase, uZen, uFlare;
uniform vec3 uColA, uColB;
varying vec2 vP;
float hash(float n){ return fract(sin(n) * 43758.5453); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
#define TAU 6.2831853
void main(){
  float r = length(vP);
  float rn = (r - uInner) / (uOuter - uInner);
  if (rn < 0.0 || rn > 1.0) discard;
  float a = atan(vP.y, vP.x);
  float N = 44.0;
  float band = rn * N, id = floor(band), f = fract(band);
  float h = hash(id * 7.13 + uSeed);
  float w = mix(0.05, 0.22, hash(id * 3.1 + uSeed));
  float line = smoothstep(w, 0.0, abs(f - 0.5));
  float rot = a + uRot * (0.55 + 0.9 * h);
  float fr = 1.2 + h * 4.0;
  float dash = smoothstep(0.42, 0.72, noise(vec2(cos(rot), sin(rot)) * fr + id * 3.7));
  float on = mix(0.18, 1.0, step(0.3, h));
  float env = smoothstep(0.0, 0.18, rn) * smoothstep(1.0, 0.75, rn);
  float glow = line * dash * on * env;
  // comet arc
  float head = uRot + uPhase;
  float ca = mod(head - a, TAU);
  float tail = exp(-ca * 2.2) * smoothstep(0.32, 0.0, abs(rn - 0.55));
  float tail2 = exp(-mod(head + 3.1 - a, TAU) * 3.0) * smoothstep(0.2, 0.0, abs(rn - 0.3));
  // calm breathing pulse (zen)
  float zenWave = 0.5 + 0.5 * sin(rn * 9.0 - uTime * 0.8);
  vec3 col = mix(uColA, uColB, h * 0.6) * (glow * (1.0 + 0.6 * sin(uTime * 3.0 + id))) ;
  col += uColA * (tail * 2.2 + tail2 * 1.2) * (1.0 - uZen * 0.7);
  col += uColB * line * env * zenWave * uZen * 0.25;
  col *= uIntensity * (1.0 + uFlare * 4.0);
  gl_FragColor = vec4(col, 1.0);
}`;

const sparkVert = /* glsl */`
attribute vec4 aSeed;
uniform float uRot, uTime, uSpeed, uInner, uOuter, uPx, uZen, uFlare;
varying float vA;
void main(){
  float a = aSeed.x + uRot * (0.6 + aSeed.z);
  float r = mix(uInner, uOuter, aSeed.y) + sin(uTime * 0.7 + aSeed.x * 5.0) * 0.015 + uFlare * aSeed.y * 0.6;
  vec3 p = vec3(cos(a) * r, sin(a) * r, sin(uTime * 1.3 + aSeed.x * 11.0) * 0.012 * (1.0 + aSeed.w * 3.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.5 + 0.5 * sin(uTime * (3.0 + aSeed.w * 6.0) + aSeed.x * 20.0);
  vA = tw * (0.4 + aSeed.w);
  gl_PointSize = uPx * (0.6 + aSeed.w * 1.8) / -mv.z;
}`;
const sparkFrag = /* glsl */`
uniform vec3 uColA;
uniform float uIntensity;
varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float s = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(uColA * s * s * vA * 2.2 * uIntensity, 1.0);
}`;

const STORM_RINGS = [
  { y: 0.13, inner: 0.40, outer: 0.70, tx: 0.07, tz: -0.03, speed: 0.28, seed: 1.3 },
  { y: -0.36, inner: 0.52, outer: 0.98, tx: -0.05, tz: 0.06, speed: -0.2, seed: 7.7 },
  { y: -0.70, inner: 0.30, outer: 0.64, tx: 0.1, tz: 0.04, speed: 0.34, seed: 3.9 },
];
const ZEN_RINGS = [
  { y: -0.64, inner: 0.50, outer: 0.66, tx: 0, tz: 0, speed: 0.05 },
  { y: -0.66, inner: 0.72, outer: 0.9, tx: 0, tz: 0, speed: -0.04 },
  { y: -0.68, inner: 0.98, outer: 1.12, tx: 0, tz: 0, speed: 0.03 },
];

export async function createRings() {
  try { await document.fonts.load(`64px "Tiro Devanagari Sanskrit"`, 'ॐ भ'); } catch (e) { /* system fallback */ }
  const group = new THREE.Group();
  const gold = new THREE.Color(1.0, 0.6, 0.2);
  const goldHi = new THREE.Color(1.0, 0.82, 0.5);
  const zenA = new THREE.Color(1.0, 0.9, 0.72);
  const zenB = new THREE.Color(0.75, 0.92, 1.0);

  // halo
  const haloU = {
    tA: { value: glyphHaloTexture() }, tB: { value: lotusMandalaTexture() },
    uTime: { value: 0 }, uZen: { value: 0 }, uIntensity: { value: 2.6 }, uFlare: { value: 0 },
    uColA: { value: new THREE.Color(1.0, 0.62, 0.24) }, uColB: { value: new THREE.Color(1.0, 0.86, 0.62) },
  };
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: haloU, vertexShader: haloVert, fragmentShader: haloFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  group.add(halo);

  // orbit rings
  const rings = STORM_RINGS.map((cfg, i) => {
    const u = {
      uRot: { value: 0 }, uTime: { value: 0 }, uSpeed: { value: cfg.speed }, uInner: { value: cfg.inner }, uOuter: { value: cfg.outer },
      uSeed: { value: cfg.seed }, uIntensity: { value: 1.6 }, uPhase: { value: i * 2.1 }, uZen: { value: 0 }, uFlare: { value: 0 },
      uColA: { value: gold.clone() }, uColB: { value: goldHi.clone() }, uPx: { value: 30 },
    };
    const geo = new THREE.RingGeometry(0.2, 1.6, 256, 1);
    const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: u, vertexShader: ringVert, fragmentShader: ringFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    const holder = new THREE.Group();
    mesh.rotation.x = -Math.PI / 2;
    holder.add(mesh);

    const n = 420;
    const seeds = new Float32Array(n * 4);
    for (let k = 0; k < n; k++) { seeds[k * 4] = Math.random() * TAU; seeds[k * 4 + 1] = Math.random(); seeds[k * 4 + 2] = Math.random(); seeds[k * 4 + 3] = Math.pow(Math.random(), 3); }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    sg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    const sparks = new THREE.Points(sg, new THREE.ShaderMaterial({
      uniforms: u, vertexShader: sparkVert, fragmentShader: sparkFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    sparks.frustumCulled = false;
    mesh.add(sparks);
    group.add(holder);
    return { cfg, u, holder, mesh };
  });

  const lightPos = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const lerp = (a, b, t) => a + (b - a) * t;

  return {
    group, halo, haloU, rings, lightPos,
    update(t, dt, zen, flare, burst, headY, pxScale) {
      haloU.uTime.value = t; haloU.uZen.value = zen; haloU.uFlare.value = flare;
      haloU.uIntensity.value = lerp(2.6, 0.62, zen);
      const hr = lerp(0.86, 0.98, zen) * (1 + burst * 0.25);
      halo.scale.setScalar(hr);
      halo.position.set(0, lerp(headY - 0.2, headY - 0.1, zen), lerp(-0.24, -0.34, zen));
      halo.rotation.set(lerp(-0.06, 0, zen), lerp(0.14, 0, zen), 0);

      rings.forEach((r, i) => {
        const s = r.cfg, z = ZEN_RINGS[i];
        const u = r.u;
        u.uTime.value = t; u.uZen.value = zen; u.uFlare.value = flare; u.uPx.value = 14 * pxScale;
        u.uInner.value = lerp(s.inner, z.inner, zen) * (1 + burst * (0.6 + i * 0.3));
        u.uOuter.value = lerp(s.outer, z.outer, zen) * (1 + burst * (0.6 + i * 0.3));
        u.uSpeed.value = lerp(s.speed, z.speed, zen) * (1 + burst * 4);
        u.uIntensity.value = lerp(2.4, 0.9, zen) * (1 - burst * 0.3);
        u.uColA.value.copy(gold).lerp(zenA, zen);
        u.uColB.value.copy(goldHi).lerp(zenB, zen);
        r.holder.position.y = lerp(s.y, z.y, zen) + Math.sin(t * 0.5 + i * 2) * 0.015 * (1 - zen);
        r.holder.rotation.x = lerp(s.tx, z.tx, zen) + Math.sin(t * 0.3 + i) * 0.02 * (1 - zen);
        r.holder.rotation.z = lerp(s.tz, z.tz, zen) + Math.cos(t * 0.27 + i) * 0.02 * (1 - zen);
        // comet head position for the figure's lighting (group-local)
        u.uRot.value += dt * u.uSpeed.value;
        const a = u.uRot.value + u.uPhase.value;
        const rm = lerp(u.uInner.value, u.uOuter.value, 0.55);
        // ring mesh is rotated -90deg about x: local (cos a, sin a) -> (x, -z)
        lightPos[i].set(Math.cos(a) * rm, 0, -Math.sin(a) * rm).applyEuler(r.holder.rotation);
        lightPos[i].y += r.holder.position.y;
      });
    },
  };
}

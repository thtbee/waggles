import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createFigure } from './figure.js';
import { createWater, MAX_LAMPS } from './water.js';
import { createRings } from './rings.js';
import { createShards, createMotes, createPetals, createDiyas } from './particles.js';
import { createSky, createEnvMaps } from './sky.js';
import { createPost } from './post.js';
import { createAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const lerp = THREE.MathUtils.lerp;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
const MAX_PR = Math.min(window.devicePixelRatio || 1, 1.5);
let pixelRatio = Math.min(MAX_PR, 1.25);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.05, 200);
camera.position.set(0.0, 1.55, 5.8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.22, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.045;
controls.enablePan = false;
controls.rotateSpeed = 0.45;
controls.zoomSpeed = 0.6;
controls.minDistance = 2.0;
controls.maxDistance = 10;
controls.minPolarAngle = 0.62;
controls.maxPolarAngle = 1.66;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.12;

// ------------------------------------------------------------------ world
const env = createEnvMaps(renderer);
const sky = createSky();
scene.add(sky.group);

const water = createWater(renderer);
scene.add(water.mesh);

const entity = new THREE.Group();
entity.position.set(0, 1.42, 0);
scene.add(entity);

const figure = createFigure();
figure.setMainCamera(camera);
entity.add(figure.mesh);

const rings = await createRings();
entity.add(rings.group);

const shards = createShards(env.storm);
entity.add(shards.group);

const motes = createMotes();
scene.add(motes.points);

const petals = createPetals(env.zen);
scene.add(petals.mesh);

const diyas = createDiyas(env.zen, MAX_LAMPS);
scene.add(diyas.group);

const post = createPost(renderer, scene, camera);
post.resize(window.innerWidth, window.innerHeight, pixelRatio);
const audio = createAudio();

// ------------------------------------------------------------------ interaction
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2(0, 0);
const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const mouse = { active: false, x: 0, y: 0, downX: 0, downY: 0, down: false, onFigure: false, holdStart: 0, light: 0 };
const mouseWorld = new THREE.Vector3();
const localRay = new THREE.Ray();
const invEntity = new THREE.Matrix4();
let lastInteract = -10;

function updateRay(e) {
  mouse.x = e.clientX; mouse.y = e.clientY;
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}

// rough proxy of the body for hit tests (entity-local)
function hitsFigure() {
  invEntity.copy(entity.matrixWorld).invert();
  localRay.copy(raycaster.ray).applyMatrix4(invEntity);
  const m = state.morph;
  const box = new THREE.Box3(
    new THREE.Vector3(lerp(-0.42, -0.5, m), lerp(-1.1, -0.62, m), -0.35),
    new THREE.Vector3(lerp(0.42, 0.5, m), lerp(0.86, 0.55, m), 0.4)
  );
  return localRay.intersectsBox(box);
}

const holdRing = $('holdring'), holdArc = $('holdarc');
renderer.domElement.addEventListener('pointermove', (e) => {
  updateRay(e);
  mouse.active = true;
  if (mouse.down && Math.hypot(e.clientX - mouse.downX, e.clientY - mouse.downY) > 8) cancelHold();
  holdRing.style.left = e.clientX + 'px'; holdRing.style.top = e.clientY + 'px';
});
renderer.domElement.addEventListener('pointerleave', () => { mouse.active = false; cancelHold(); });
renderer.domElement.addEventListener('pointerdown', (e) => {
  updateRay(e);
  lastInteract = clock.elapsedTime;
  mouse.down = true; mouse.downX = e.clientX; mouse.downY = e.clientY;
  mouse.onFigure = hitsFigure();
  if (mouse.onFigure && !state.busy) { mouse.holdStart = performance.now(); holdRing.classList.add('on'); }
});
renderer.domElement.addEventListener('pointerup', (e) => {
  updateRay(e);
  const moved = Math.hypot(e.clientX - mouse.downX, e.clientY - mouse.downY);
  const held = mouse.holdStart ? performance.now() - mouse.holdStart : 0;
  if (moved < 6 && held < 350) {
    if (mouse.onFigure) pulse();
    else {
      const hit = raycaster.ray.intersectPlane(waterPlane, new THREE.Vector3());
      if (hit) { water.ripple(hit.x, hit.z, clock.elapsedTime, 1.0); audio.drop(Math.random()); }
    }
  }
  mouse.down = false;
  cancelHold();
});
function cancelHold() { mouse.holdStart = 0; holdRing.classList.remove('on'); holdArc.style.strokeDashoffset = 163.4; }
controls.addEventListener('start', () => { lastInteract = clock.elapsedTime; });

let pulseT = -10;
function pulse() {
  pulseT = clock.elapsedTime;
  const p = entity.position;
  water.ripple(p.x, p.z, clock.elapsedTime, 0.7);
  audio.drop(0.2);
}

// ------------------------------------------------------------------ transition state
const state = { p: 0, target: 0, morph: 0, zen: 0, busy: false };
const TRANSITION_SECONDS = 7.5;
function toggleState() {
  if (state.busy) return;
  state.target = state.target > 0.5 ? 0 : 1;
  state.busy = true;
  audio.awaken(state.target === 0);
  $('awaken').disabled = true;
  cancelHold();
}

// ------------------------------------------------------------------ ui
const ui = $('ui');
$('awaken').addEventListener('click', toggleState);
$('btnFull').addEventListener('click', toggleFullscreen);
$('btnSound').addEventListener('click', toggleSound);
function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  else document.exitFullscreen?.();
}
function toggleSound() { const on = audio.toggle(); $('btnSound').style.color = on ? '' : 'rgba(255,236,200,.35)'; }
$('btnSound').style.color = 'rgba(255,236,200,.35)';
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); toggleState(); }
  else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  else if (e.key === 'h' || e.key === 'H') ui.classList.toggle('hidden');
  else if (e.key === 'm' || e.key === 'M') toggleSound();
});

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.fov = w / h < 0.8 ? 46 : 32;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  post.resize(w, h, pixelRatio);
  water.resize();
}
window.addEventListener('resize', onResize);
onResize();

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
const look = new THREE.Vector3(0, 0, 1);
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), headW = new THREE.Vector3();
const shakeOff = new THREE.Vector3();
let frameAcc = 0, frameN = 0, lastStormRipple = 0, lastZenRipple = 0;
const camDir = new THREE.Vector3();

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // adaptive resolution
  frameAcc += dt; frameN++;
  if (frameAcc > 2.0) {
    const avg = frameAcc / frameN;
    if (avg > 0.024 && pixelRatio > 0.6) { pixelRatio = Math.max(0.6, pixelRatio - 0.15); applyPR(); }
    else if (avg < 0.0135 && pixelRatio < MAX_PR) { pixelRatio = Math.min(MAX_PR, pixelRatio + 0.1); applyPR(); }
    frameAcc = 0; frameN = 0;
  }

  // transition progress
  if (state.busy) {
    const dir = Math.sign(state.target - state.p);
    state.p = clamp01(state.p + dir * dt / TRANSITION_SECONDS);
    if (state.p === state.target) {
      state.busy = false;
      $('awaken').disabled = false;
      $('awaken').textContent = state.target ? 'Return' : 'Awaken';
    }
  }
  const p = state.p;
  const crack = sstep(0.04, 0.3, p) * (1 - sstep(0.42, 0.52, p));
  const glow = sstep(0.24, 0.47, p) * (1 - sstep(0.56, 0.86, p));
  const morph = sstep(0.36, 0.74, p);
  const zen = sstep(0.45, 0.55, p);
  const flash = sstep(0.36, 0.5, p) * (1 - sstep(0.5, 0.68, p));
  const burst = sstep(0.08, 0.46, p) * (1 - sstep(0.5, 0.56, p));
  const shardFade = 1 - sstep(0.42, 0.5, p);
  const pulseK = Math.exp(-(t - pulseT) * 2.5);
  const flare = Math.max(crack * 0.8, pulseK * 0.6);
  state.morph = morph; state.zen = zen;

  document.body.classList.toggle('zen', zen > 0.5);
  const sn = zen > 0.5 ? 'padmasana · tapas' : 'the unbound';
  if ($('stateName').textContent !== sn) {
    $('stateName').textContent = sn;
    $('title').querySelector('b').textContent = zen > 0.5 ? 'ॐ शान्तिः शान्तिः' : 'अहं ब्रह्मास्मि';
  }

  // hold-to-awaken
  if (mouse.holdStart) {
    const k = (performance.now() - mouse.holdStart) / 1400;
    holdArc.style.strokeDashoffset = 163.4 * (1 - Math.min(k, 1));
    if (k >= 1) toggleState();
  }

  // entity float
  entity.position.y = lerp(1.42, 1.5, morph) + Math.sin(t * 0.55) * lerp(0.045, 0.025, zen);
  entity.rotation.y = Math.sin(t * 0.12) * 0.08 * (1 - zen);
  entity.updateMatrixWorld();

  // camera idle drift, shake on awakening
  if (t - lastInteract > 8) controls.autoRotate = true; else controls.autoRotate = false;
  controls.autoRotateSpeed = lerp(0.12, 0.06, zen) * Math.sin(t * 0.05 + 1.0) * 2.0;
  camera.position.sub(shakeOff);
  controls.update();
  const shake = glow * 0.012 + crack * 0.006;
  shakeOff.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0);
  camera.position.add(shakeOff);

  // cursor: gaze + touch light
  invEntity.copy(entity.matrixWorld).invert();
  camera.getWorldDirection(camDir);
  if (mouse.active) {
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir.clone().negate(), entity.position);
    if (raycaster.ray.intersectPlane(plane, mouseWorld)) {
      mouseWorld.addScaledVector(camDir, -0.35);
    }
  }
  const near = mouse.active ? Math.exp(-Math.max(0, mouseWorld.distanceTo(entity.position) - 0.6) * 1.5) : 0;
  mouse.light = lerp(mouse.light, near * lerp(1.6, 0.9, zen), 0.08);
  tmp.copy(mouseWorld).applyMatrix4(invEntity);
  figure.uniforms.uMouse.value.set(tmp.x, tmp.y, tmp.z, mouse.light);
  headW.set(0, 0.7, 0.05);
  if (mouse.active) look.copy(tmp).sub(headW).normalize();
  else look.copy(camera.position).applyMatrix4(invEntity).sub(headW).normalize();

  // figure
  const breath = figure.update(t, morph, look);
  const fu = figure.uniforms;
  fu.uZen.value = zen;
  fu.uGlow.value = glow;
  fu.uCrack.value = crack + pulseK * 0.25;
  fu.uAura.value = 1.0 + pulseK * 2.0;
  fu.uInvModel.value.copy(invEntity);
  fu.uModel.value.copy(entity.matrixWorld);

  // rings & halo
  const headY = fu.uJ.value[3].y;
  rings.update(t, dt, zen, flare, burst, headY, pixelRatio * window.innerHeight / 900);
  for (let i = 0; i < 3; i++) {
    fu.uRingL.value[i].copy(rings.lightPos[i]);
    const ru = rings.rings[i].u;
    fu.uRingC.value[i].set(rings.rings[i].holder.position.y, (ru.uInner.value + ru.uOuter.value) * 0.5, ru.uIntensity.value * (1 - zen * 0.7), 0);
  }
  fu.uGold.value.setRGB(1.0, 0.62, 0.22).multiplyScalar(1 + flare * 2);

  // shards
  localRay.copy(raycaster.ray).applyMatrix4(invEntity);
  shards.update(t, dt, burst, shardFade, glow + crack * 0.15, localRay, mouse.active);
  shards.materials.forEach(m => { m.envMap = zen > 0.5 ? env.zen : env.storm; });

  // motes
  const mu = motes.uniforms;
  mu.uTime.value = t; mu.uZen.value = zen; mu.uBurst.value = burst;
  mu.uPx.value = 26 * pixelRatio * window.innerHeight / 900;
  mu.uCenter.value.copy(entity.position);
  mu.uMouseOn.value = mouse.active ? 1 : 0;
  mu.uRayO.value.copy(raycaster.ray.origin); mu.uRayD.value.copy(raycaster.ray.direction);

  // zen props
  const zenVis = sstep(0.5, 0.9, p);
  petals.update(t, dt, zenVis, (x, z, s) => water.ripple(x, z, t, s));
  diyas.update(t, dt, zenVis, entity.position.x, entity.position.z, pixelRatio * window.innerHeight / 900);

  // water
  const wu = water.uniforms;
  wu.uTime.value = t; wu.uZen.value = zen;
  wu.uCenter.value.copy(entity.position);
  wu.uGold.value.setRGB(1.0, 0.6, 0.2);
  wu.uPulse.value = pulseK + glow;
  wu.uLampOn.value = zenVis;
  diyas.lamps.forEach((l, i) => wu.uLamps.value[i].copy(l.pos));
  // ambient disturbance: sparks dripping (unbound) / breath ripples (padmasana)
  if (zen < 0.5 && t - lastStormRipple > 1.3) {
    lastStormRipple = t + Math.random();
    const a = Math.random() * Math.PI * 2, r = 0.4 + Math.random() * 1.2;
    water.ripple(entity.position.x + Math.cos(a) * r, entity.position.z + Math.sin(a) * r, t, 0.25);
  }
  if (zen > 0.5 && breath > 0.98 && t - lastZenRipple > 3) {
    lastZenRipple = t;
    water.ripple(entity.position.x, entity.position.z, t, 0.35);
  }

  // sky
  sky.update(t, zen, entity.position.x, entity.position.z);

  // post
  post.bloom.strength = lerp(0.6, 0.55, zen) + glow * 1.2 + flare * 0.25;
  post.bloom.threshold = lerp(1.5, 1.15, zen) * (1 - glow * 0.5);
  post.bloom.radius = lerp(0.42, 0.5, zen);
  post.final.uniforms.uTime.value = t;
  post.final.uniforms.uFlash.value = flash;
  post.final.uniforms.uZen.value = zen;
  renderer.toneMappingExposure = lerp(1.0, 0.95, zen);

  audio.update(t, zen);
  post.composer.render();
  requestAnimationFrame(frame);
}

function applyPR() {
  renderer.setPixelRatio(pixelRatio);
  post.resize(window.innerWidth, window.innerHeight, pixelRatio);
  water.resize();
}

// compile everything before revealing
try { await renderer.compileAsync(scene, camera); } catch (e) { console.warn(e); }
requestAnimationFrame(frame);
setTimeout(() => $('veil').classList.add('gone'), 400);
// expose for debugging
window.__entity = { state, camera, controls, figure, toggleState, post, rings, shards, motes, sky, water, scene, entity };

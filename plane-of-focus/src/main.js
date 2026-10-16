import * as THREE from 'three';
import {
  OPTICAL_AXIS_Y,
  LENS_FRONT_X,
  SUBJECTS,
  APERTURE_PRESETS,
  clamp,
  lerp,
  distToSlider,
  sliderToDist,
  formatDistCm,
  formatAperture,
  computeDofBounds,
  buildExplanationHtml,
} from './optics.js';
import { buildStudioEnvironment } from './materials.js';
import { buildStudioEnvironmentMesh } from './scene/studio.js';
import { buildOpticalBenchConsole, FILMSTRIP_DISTANCES } from './scene/console.js';
import { buildCutawayLens } from './scene/lens.js';
import { buildMiniatureValley } from './scene/valley.js';
import { buildImagePlaneScreen } from './scene/imagePlane.js';
import { buildOpticalRays } from './scene/rays.js';
import { createPostProcessingPipeline } from './scene/postprocessing.js';
import { createFloatingLabelsManager } from './ui/labels.js';

// --- DOM Elements ---
const worldEl = document.querySelector('#world');
const loadingEl = document.querySelector('#loading');
const appEl = document.querySelector('#app');
const labelsLayerEl = document.querySelector('#labels-layer');
const statFocusEl = document.querySelector('#s-focus');
const statApEl = document.querySelector('#s-ap');
const statDofEl = document.querySelector('#s-dof');
const whyEl = document.querySelector('#why');

const segFocusBtns = document.querySelectorAll('#seg-focus button');
const segApBtns = document.querySelectorAll('#seg-ap button');
const segExBtns = document.querySelectorAll('#seg-ex button');

const slideEl = document.querySelector('#slide');
const slideValEl = document.querySelector('#slide-v');
const slideFlEl = document.querySelector('#slide-fl');
const slideDzEl = document.querySelector('#slide-dz');
const slideKnEl = document.querySelector('#slide-kn');
const tickEls = [
  document.querySelector('#tk-0'),
  document.querySelector('#tk-1'),
  document.querySelector('#tk-2'),
];

const cineBtn = document.querySelector('#cine');
const howBtn = document.querySelector('#how');
const infoDialog = document.querySelector('#info');
const closeDialogBtn = document.querySelector('#close');
const shareResetBtn = document.querySelector('#share');
const uiHintEl = document.querySelector('#ui-hint');
const tipEl = document.querySelector('#tip');

// Position subject ticks on the top-right Distance slider
SUBJECTS.forEach((subj, i) => {
  if (tickEls[i]) {
    tickEls[i].style.left = `${(distToSlider(subj.d) * 100).toFixed(1)}%`;
  }
});

// --- Application State ---
const state = {
  targetFocusD: SUBJECTS[1].d, // Start focused on Middle Cabin (54 cm -> D = 2.35)
  focusD: SUBJECTS[1].d,
  targetApertureN: 2.0, // Start at f/2
  apertureN: 2.0,
  isExploded: true, // Start in Exploded cutaway mode
  activeCamPreset: 0, // 0: Overview, 1: Lens Cutaway, 2: Valley, 3: Ground Glass, -1: Free orbit
  focusGroupX: -1.14,
  frontElementX: 0.45,
};

// --- Cinematic Camera Presets (matching the 4 shots in the reference video) ---
const CAMERA_PRESETS = [
  {
    name: 'Optical Bench Overview',
    pos: new THREE.Vector3(-0.65, 5.25, 14.55),
    target: new THREE.Vector3(0.22, 2.96, 0.0),
    fov: 30,
    dofDist: 14.6,
  },
  {
    name: 'Lens Cutaway & Iris',
    pos: new THREE.Vector3(-1.42, 3.88, 6.55),
    target: new THREE.Vector3(-0.78, 3.62, 0.0),
    fov: 30,
    dofDist: 6.6,
  },
  {
    name: 'Plane of Focus in the Valley',
    pos: new THREE.Vector3(0.45, 4.65, 5.45),
    target: new THREE.Vector3(2.68, 3.44, -0.15),
    fov: 30,
    dofDist: 5.4,
  },
  {
    name: 'Ground Glass Image Plane',
    pos: new THREE.Vector3(-7.65, 3.86, 2.85),
    target: new THREE.Vector3(-3.95, 3.48, 0.04),
    fov: 30,
    dofDist: 3.7,
  },
];

// --- Three.js Scene, Camera & Renderer Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color('#10151f');
scene.fog = new THREE.FogExp2('#161d2b', 0.0065);

const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.08, 300);

const maxPixels = 2500000;
function computePixelRatio() {
  const w = window.innerWidth || 1280;
  const h = window.innerHeight || 720;
  return clamp(Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(maxPixels / (w * h))), 1, 1.5);
}

const pixelRatio = computePixelRatio();
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
  stencil: false,
});
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

if (loadingEl) loadingEl.remove();
worldEl.appendChild(renderer.domElement);

// Build Studio HDR Environment Map
buildStudioEnvironment(renderer, scene);

// Studio Lighting
const hemiLight = new THREE.HemisphereLight(0x8fa8ff, 0x3a3026, 0.58);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xfffcf0, 2.15);
sunLight.position.set(18.5, 18.5, 14.5);
sunLight.target.position.set(0, 2.2, 0);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
Object.assign(sunLight.shadow.camera, {
  left: -10,
  right: 10,
  top: 8,
  bottom: -6,
  near: 1,
  far: 55,
});
sunLight.shadow.bias = -0.0004;
sunLight.shadow.normalBias = 0.025;
scene.add(sunLight, sunLight.target);

const backRimLight = new THREE.DirectionalLight(0x8fd8ff, 0.95);
backRimLight.position.set(-6, 9, -14);
scene.add(backRimLight);

const fillLight = new THREE.DirectionalLight(0xffeedd, 0.55);
fillLight.position.set(-8, 12, 10);
scene.add(fillLight);

// --- Build 3D Subsystems ---
buildStudioEnvironmentMesh(scene);
const consoleBench = buildOpticalBenchConsole(scene);
const cutawayLens = buildCutawayLens(scene);
const miniatureValley = buildMiniatureValley(scene);
const imagePlane = buildImagePlaneScreen(scene);
const opticalRays = buildOpticalRays(scene);

// Collect all raycastable 3D interactive meshes
const allInteractiveMeshes = [
  ...consoleBench.interactiveMeshes,
  ...cutawayLens.interactiveMeshes,
  ...miniatureValley.interactiveMeshes,
  ...imagePlane.interactiveMeshes,
];

// Post-Processing Pipeline
const postFX = createPostProcessingPipeline(renderer, scene, camera, pixelRatio);

// Floating 3D Pill Labels
const labelsManager = createFloatingLabelsManager(labelsLayerEl, {
  onSelectCamera: (presetIdx) => selectCameraPreset(presetIdx),
  onCycleAperture: () => cycleAperture(),
});

// --- Camera Orbit / Transition Controller ---
const camState = {
  pos: CAMERA_PRESETS[0].pos.clone(),
  target: CAMERA_PRESETS[0].target.clone(),
  desiredPos: CAMERA_PRESETS[0].pos.clone(),
  desiredTarget: CAMERA_PRESETS[0].target.clone(),
  dofDist: CAMERA_PRESETS[0].dofDist,
  spherical: new THREE.Spherical(),
};

function syncSphericalFromDesired() {
  const offset = camState.desiredPos.clone().sub(camState.desiredTarget);
  camState.spherical.setFromVector3(offset);
}
syncSphericalFromDesired();

function selectCameraPreset(presetIdx) {
  const idx = ((presetIdx % CAMERA_PRESETS.length) + CAMERA_PRESETS.length) % CAMERA_PRESETS.length;
  state.activeCamPreset = idx;
  const preset = CAMERA_PRESETS[idx];
  camState.desiredPos.copy(preset.pos);
  camState.desiredTarget.copy(preset.target);
  camState.dofDist = preset.dofDist;
  syncSphericalFromDesired();
  cineBtn.classList.toggle('on', idx !== 0);
  showTransientHint(`Camera: ${preset.name}`);
}

let hintTimeout = null;
function showTransientHint(text) {
  if (!uiHintEl) return;
  uiHintEl.textContent = text;
  uiHintEl.classList.add('on');
  clearTimeout(hintTimeout);
  hintTimeout = setTimeout(() => {
    uiHintEl.classList.remove('on');
  }, 1900);
}

// --- UI State Synchronization ---
function setFocusDistance(newD) {
  state.targetFocusD = clamp(newD, 1.08, 7.0);
}

function setFocusPresetIndex(idx) {
  const subj = SUBJECTS[idx];
  if (!subj) return;
  setFocusDistance(subj.d);
}

function setAperture(newN) {
  state.targetApertureN = newN;
  segApBtns.forEach((btn) => {
    btn.classList.toggle('on', Math.abs(parseFloat(btn.dataset.n) - newN) < 0.1);
  });
}

function cycleAperture() {
  const curIdx = APERTURE_PRESETS.findIndex((n) => Math.abs(n - state.targetApertureN) < 0.2);
  const nextIdx = (curIdx + 1) % APERTURE_PRESETS.length;
  setAperture(APERTURE_PRESETS[nextIdx]);
}

function setExploded(exploded) {
  state.isExploded = Boolean(exploded);
  segExBtns.forEach((btn) => {
    btn.classList.toggle('on', (btn.dataset.e === '1') === state.isExploded);
  });
}

let lastExplanationKey = '';
function updateUIReadouts() {
  const focusD = state.focusD;
  const apertureN = state.apertureN;
  const [nearD, farD] = computeDofBounds(focusD, apertureN);
  const focusStr = formatDistCm(focusD);
  const apStr = formatAperture(apertureN);
  const dofStr = formatDistCm(farD - nearD, true);

  statFocusEl.textContent = focusStr;
  statApEl.textContent = apStr;
  statDofEl.textContent = dofStr;
  slideValEl.textContent = focusStr;

  // Update Distance Slider knob, fill, and Sharp Zone (DoF) band
  const sliderT = distToSlider(focusD);
  const nearT = distToSlider(nearD);
  const farT = distToSlider(farD);
  const pct = (sliderT * 100).toFixed(2) + '%';

  slideFlEl.style.width = pct;
  slideKnEl.style.left = pct;
  slideDzEl.style.left = `${(nearT * 100).toFixed(2)}%`;
  slideDzEl.style.width = `${Math.max(2, (farT - nearT) * 100).toFixed(2)}%`;
  slideEl.setAttribute('aria-valuenow', String(Math.round(focusD * 23)));

  // Highlight Foreground / Middle / Background preset button if focusD is close to one
  segFocusBtns.forEach((btn, i) => {
    const subj = SUBJECTS[i];
    const isNearSubj = Math.abs(focusD - subj.d) < 0.085;
    btn.classList.toggle('on', isNearSubj);
  });

  // Update dynamic explanation paragraph
  const expKey = `${Math.round(focusD * 100)}_${Math.round(apertureN * 10)}`;
  if (expKey !== lastExplanationKey) {
    lastExplanationKey = expKey;
    whyEl.innerHTML = buildExplanationHtml(focusD, apertureN);
  }
}

// --- Bind Top-Right UI Controls ---
segFocusBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    setFocusPresetIndex(parseInt(btn.dataset.f, 10));
  });
});

segApBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    setAperture(parseFloat(btn.dataset.n));
  });
});

segExBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    setExploded(btn.dataset.e === '1');
  });
});

cineBtn.addEventListener('click', () => {
  const nextCam = state.activeCamPreset === -1 ? 0 : (state.activeCamPreset + 1) % CAMERA_PRESETS.length;
  selectCameraPreset(nextCam);
});

howBtn.addEventListener('click', () => {
  infoDialog.showModal();
});

closeDialogBtn.addEventListener('click', () => {
  infoDialog.close();
});

infoDialog.addEventListener('click', (e) => {
  if (e.target === infoDialog) infoDialog.close();
});

shareResetBtn.addEventListener('click', () => {
  selectCameraPreset(0);
});

// Top-Right Distance Slider Pointer Interaction
let isDraggingUISlider = false;
function updateSliderFromPointer(clientX) {
  const rect = slideEl.getBoundingClientRect();
  const t = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
  setFocusDistance(sliderToDist(t));
}

slideEl.addEventListener('pointerdown', (e) => {
  isDraggingUISlider = true;
  slideEl.setPointerCapture(e.pointerId);
  updateSliderFromPointer(e.clientX);
});

slideEl.addEventListener('pointermove', (e) => {
  if (!isDraggingUISlider) return;
  updateSliderFromPointer(e.clientX);
});

slideEl.addEventListener('pointerup', () => {
  isDraggingUISlider = false;
});

// --- 3D Raycasting & Direct Manipulation (Focus Ring, Plane of Focus, Console Slider, Dials, Orbit) ---
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
let activeDragMode = null; // 'focus-ring' | 'focus-plane' | 'console-slider' | 'orbit' | 'pan' | null
let dragStartClient = { x: 0, y: 0 };
let dragStartSliderT = 0.5;
let pointerDownMesh = null;

function updatePointerNDC(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}

renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

renderer.domElement.addEventListener('pointerdown', (e) => {
  updatePointerNDC(e);
  dragStartClient = { x: e.clientX, y: e.clientY };
  dragStartSliderT = distToSlider(state.targetFocusD);

  // Right-click, Middle-click, or Shift+Left-click pans freely in 3D space
  if (e.button === 2 || e.button === 1 || e.shiftKey) {
    activeDragMode = 'pan';
    renderer.domElement.setPointerCapture(e.pointerId);
    return;
  }

  // Alt+Left-click always orbits the camera even when hovering over interactive parts
  if (e.altKey) {
    activeDragMode = 'orbit';
    renderer.domElement.setPointerCapture(e.pointerId);
    return;
  }

  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObjects(allInteractiveMeshes, false);

  if (hits.length > 0) {
    const hit = hits[0];
    const uData = hit.object.userData;
    pointerDownMesh = hit.object;

    if (uData.interactiveType === 'focus-ring') {
      activeDragMode = 'focus-ring';
      renderer.domElement.setPointerCapture(e.pointerId);
      return;
    }

    if (uData.interactiveType === 'focus-plane') {
      activeDragMode = 'focus-plane';
      renderer.domElement.setPointerCapture(e.pointerId);
      return;
    }

    if (uData.interactiveType === 'console-slider') {
      activeDragMode = 'console-slider';
      renderer.domElement.setPointerCapture(e.pointerId);
      const localPt = hit.object.parent.worldToLocal(hit.point.clone());
      const t = clamp(
        (localPt.x - uData.sliderMinX) / (uData.sliderMaxX - uData.sliderMinX),
        0,
        1
      );
      setFocusDistance(sliderToDist(t));
      return;
    }
  }

  // Otherwise start smooth 360-degree camera orbit
  activeDragMode = 'orbit';
  renderer.domElement.setPointerCapture(e.pointerId);
});

// Double-click any 3D part (lens element, gear, valley object, ground glass) to focus camera target on it,
// or double-click empty background to reset to Overview!
renderer.domElement.addEventListener('dblclick', (e) => {
  updatePointerNDC(e);
  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObjects(scene.children, true).filter(
    (h) => h.object.isMesh && h.object.visible && h.distance < 40
  );

  if (hits.length > 0) {
    const hitPt = hits[0].point;
    state.activeCamPreset = -1;
    cineBtn.classList.remove('on');
    camState.desiredTarget.copy(hitPt);
    camState.spherical.radius = clamp(camState.spherical.radius * 0.62, 1.35, 7.5);
    const newOffset = new THREE.Vector3().setFromSpherical(camState.spherical);
    camState.desiredPos.copy(camState.desiredTarget).add(newOffset);
    camState.dofDist = camState.spherical.radius;
    showTransientHint('Camera focused on point · Double-click background or press R to reset');
  } else {
    selectCameraPreset(0);
  }
});

renderer.domElement.addEventListener('pointermove', (e) => {
  updatePointerNDC(e);

  if (!activeDragMode) {
    // Hover cursor feedback
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(allInteractiveMeshes, false);
    const canvas = renderer.domElement;
    canvas.classList.remove('hover-interactive', 'hover-drag-ns', 'hover-drag-ew');
    tipEl.classList.remove('on');

    if (hits.length > 0) {
      const uData = hits[0].object.userData;
      if (uData.interactiveType === 'focus-ring') {
        canvas.classList.add('hover-drag-ns');
      } else if (
        uData.interactiveType === 'focus-plane' ||
        uData.interactiveType === 'console-slider'
      ) {
        canvas.classList.add('hover-drag-ew');
      } else {
        canvas.classList.add('hover-interactive');
      }
    }
    return;
  }

  const dx = e.clientX - dragStartClient.x;
  const dy = e.clientY - dragStartClient.y;

  if (activeDragMode === 'focus-ring') {
    // Dragging the focus ring vertically or horizontally smoothly rotates the ring & shifts focus
    const deltaT = (-dy + dx * 0.65) / 240;
    setFocusDistance(sliderToDist(clamp(dragStartSliderT + deltaT, 0, 1)));
    return;
  }

  if (activeDragMode === 'focus-plane') {
    const deltaT = dx / 280;
    setFocusDistance(sliderToDist(clamp(dragStartSliderT + deltaT, 0, 1)));
    return;
  }

  if (activeDragMode === 'console-slider') {
    const deltaT = dx / 310;
    setFocusDistance(sliderToDist(clamp(dragStartSliderT + deltaT, 0, 1)));
    return;
  }

  if (activeDragMode === 'orbit') {
    if (Math.hypot(dx, dy) > 3) {
      state.activeCamPreset = -1;
      cineBtn.classList.remove('on');
    }
    const moveX = e.movementX || 0;
    const moveY = e.movementY || 0;
    camState.spherical.theta -= moveX * 0.0055;
    // Unrestricted vertical polar angle from overhead (0.04) to low-angle underneath (PI - 0.08)
    camState.spherical.phi = clamp(camState.spherical.phi - moveY * 0.0055, 0.04, Math.PI - 0.08);
    const newOffset = new THREE.Vector3().setFromSpherical(camState.spherical);
    camState.desiredPos.copy(camState.desiredTarget).add(newOffset);
    return;
  }

  if (activeDragMode === 'pan') {
    state.activeCamPreset = -1;
    cineBtn.classList.remove('on');
    const moveX = e.movementX || 0;
    const moveY = e.movementY || 0;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const panScale = Math.max(camState.spherical.radius, 1.5) * 0.0018;
    const panVec = right.multiplyScalar(-moveX * panScale).add(up.multiplyScalar(moveY * panScale));
    camState.desiredPos.add(panVec);
    camState.desiredTarget.add(panVec);
  }
});

renderer.domElement.addEventListener('pointerup', (e) => {
  const clickDist = Math.hypot(e.clientX - dragStartClient.x, e.clientY - dragStartClient.y);

  if (clickDist < 5 && pointerDownMesh) {
    const uData = pointerDownMesh.userData;
    if (uData.interactiveType === 'filmstrip-thumb') {
      setFocusDistance(uData.focusD);
    } else if (uData.interactiveType === 'aperture-dial') {
      setAperture(uData.apertureN);
    } else if (uData.interactiveType === 'lens-iris') {
      cycleAperture();
    } else if (uData.interactiveType === 'console-step') {
      const curT = distToSlider(state.targetFocusD);
      setFocusDistance(sliderToDist(clamp(curT + uData.stepDir * 0.08, 0, 1)));
    } else if (uData.interactiveType === 'image-plane') {
      selectCameraPreset(state.activeCamPreset === 3 ? 0 : 3);
    }
  }

  activeDragMode = null;
  pointerDownMesh = null;
});

renderer.domElement.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    updatePointerNDC(e);
    state.activeCamPreset = -1;
    cineBtn.classList.remove('on');

    const zoomFactor = 1 + clamp(e.deltaY, -180, 180) * 0.0012;
    const oldRadius = camState.spherical.radius;
    // Allow macro close-up inspection (down to 0.55 units) and wide studio views (up to 42 units)
    const newRadius = clamp(oldRadius * zoomFactor, 0.55, 42.0);
    camState.spherical.radius = newRadius;

    // Subtle cursor-directed dolly when zooming in so scrolling over a lens element zooms toward it
    if (e.deltaY < 0 && newRadius < 12.0) {
      raycaster.setFromCamera(pointerNDC, camera);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        camera.getWorldDirection(new THREE.Vector3()).negate(),
        camState.desiredTarget
      );
      const cursorWorld = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, cursorWorld)) {
        camState.desiredTarget.lerp(cursorWorld, 0.08);
      }
    }

    const newOffset = new THREE.Vector3().setFromSpherical(camState.spherical);
    camState.desiredPos.copy(camState.desiredTarget).add(newOffset);
    camState.dofDist = camState.spherical.radius;
  },
  { passive: false }
);

// --- Keyboard Shortcuts & Full 3D WASD / Arrow / Space / QE Free-Fly ---
const keysPressed = new Set();

window.addEventListener('keydown', (e) => {
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;

  const key = e.key;
  const lower = key.toLowerCase();
  keysPressed.add(lower);

  if (key === '1') {
    setFocusPresetIndex(0);
  } else if (key === '2') {
    setFocusPresetIndex(1);
  } else if (key === '3') {
    setFocusPresetIndex(2);
  } else if (key === '[') {
    const t = distToSlider(state.targetFocusD);
    setFocusDistance(sliderToDist(clamp(t - 0.04, 0, 1)));
  } else if (key === ']') {
    const t = distToSlider(state.targetFocusD);
    setFocusDistance(sliderToDist(clamp(t + 0.04, 0, 1)));
  } else if (lower === 'f') {
    cycleAperture();
  } else if (lower === 'x') {
    setExploded(!state.isExploded);
  } else if (lower === 'c') {
    const nextCam =
      state.activeCamPreset === -1 ? 0 : (state.activeCamPreset + 1) % CAMERA_PRESETS.length;
    selectCameraPreset(nextCam);
  } else if (lower === 'r') {
    selectCameraPreset(0);
  } else if (key === '/') {
    e.preventDefault();
    const isOff = appEl.classList.toggle('ui-off');
    showTransientHint(isOff ? 'Press / to show interface' : 'Interface visible');
  }
});

window.addEventListener('keyup', (e) => {
  keysPressed.delete(e.key.toLowerCase());
});

// --- Resize Handler ---
function onWindowResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  postFX.composer.setSize(w, h);
}
window.addEventListener('resize', onWindowResize);
onWindowResize();

// --- Main Animation & Physics Loop ---
let lastTime = performance.now();

function animate(now) {
  requestAnimationFrame(animate);

  const dt = Math.min((now - lastTime) * 0.001, 0.05);
  lastTime = now;

  // Full 3D WASD + Arrow Keys + Q/E/Space Free-Fly Camera Movement
  if (
    keysPressed.has('w') ||
    keysPressed.has('a') ||
    keysPressed.has('s') ||
    keysPressed.has('d') ||
    keysPressed.has('q') ||
    keysPressed.has('e') ||
    keysPressed.has(' ') ||
    keysPressed.has('arrowup') ||
    keysPressed.has('arrowdown') ||
    keysPressed.has('arrowleft') ||
    keysPressed.has('arrowright')
  ) {
    state.activeCamPreset = -1;
    cineBtn.classList.remove('on');
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const upVec = new THREE.Vector3(0, 1, 0);
    const speed = Math.max(2.5, camState.spherical.radius * 0.55) * dt;

    if (keysPressed.has('w') || keysPressed.has('arrowup')) {
      camState.desiredPos.addScaledVector(forward, speed);
      camState.desiredTarget.addScaledVector(forward, speed);
    }
    if (keysPressed.has('s') || keysPressed.has('arrowdown')) {
      camState.desiredPos.addScaledVector(forward, -speed);
      camState.desiredTarget.addScaledVector(forward, -speed);
    }
    if (keysPressed.has('a') || keysPressed.has('arrowleft')) {
      camState.desiredPos.addScaledVector(right, -speed);
      camState.desiredTarget.addScaledVector(right, -speed);
    }
    if (keysPressed.has('d') || keysPressed.has('arrowright')) {
      camState.desiredPos.addScaledVector(right, speed);
      camState.desiredTarget.addScaledVector(right, speed);
    }
    if (keysPressed.has('e') || keysPressed.has(' ')) {
      camState.desiredPos.addScaledVector(upVec, speed * 0.75);
      camState.desiredTarget.addScaledVector(upVec, speed * 0.75);
    }
    if (keysPressed.has('q')) {
      camState.desiredPos.addScaledVector(upVec, -speed * 0.75);
      camState.desiredTarget.addScaledVector(upVec, -speed * 0.75);
    }
    syncSphericalFromDesired();
  }

  // Smoothly interpolate Focus Distance & Aperture
  state.focusD = lerp(state.focusD, state.targetFocusD, 1 - Math.exp(-16 * dt));
  state.apertureN = lerp(state.apertureN, state.targetApertureN, 1 - Math.exp(-14 * dt));

  // Smoothly interpolate Camera Position & Target
  const camDamp = 1 - Math.exp(-10.0 * dt);
  camState.pos.lerp(camState.desiredPos, camDamp);
  camState.target.lerp(camState.desiredTarget, camDamp);
  camera.position.copy(camState.pos);
  camera.lookAt(camState.target);
  camera.updateMatrixWorld();

  // Update 3D Subsystems
  cutawayLens.update(state.focusD, state.apertureN, state.isExploded, dt);
  state.focusGroupX = cutawayLens.getFocusGroupX();
  state.frontElementX = cutawayLens.getFrontElementX();

  miniatureValley.update(state.focusD, state.apertureN);
  imagePlane.update(state.focusD, state.apertureN);
  opticalRays.update(state.focusD, state.apertureN, state.focusGroupX, state.frontElementX);
  consoleBench.update(state.focusD, state.apertureN);

  // Update Post-Processing Optical DoF
  const camTargetDist = camera.position.distanceTo(camState.target);
  postFX.updateOpticalParams(state.focusD, state.apertureN, camTargetDist);

  // Update UI & Floating 3D Pill Labels
  updateUIReadouts();
  labelsManager.update(camera, window.innerWidth, window.innerHeight, state);

  // Render via Post-Processing Composer
  postFX.composer.render();
}

updateUIReadouts();
requestAnimationFrame(animate);

import * as THREE from 'three';
import {
  OPTICAL_AXIS_Y,
  IMAGE_PLANE_X,
  LENS_FRONT_X,
  VALLEY_HALF_Z,
  formatDistCm,
  formatAperture,
  computeDofBounds,
} from '../optics.js';

export function createFloatingLabelsManager(containerEl, handlers = {}) {
  const pillDefinitions = [
    {
      id: 'image-plane',
      title: 'Image plane',
      sub: 'upside down',
      getWorldPos: () => new THREE.Vector3(IMAGE_PLANE_X, OPTICAL_AXIS_Y + 0.92, -0.25),
      visibleInCams: [0, 3], // Overview & Ground Glass cam
      onClick: () => handlers.onSelectCamera?.(3),
    },
    {
      id: 'focus-ring',
      title: 'Focus ring',
      sub: 'drag ↕',
      getWorldPos: () => new THREE.Vector3(-0.32, OPTICAL_AXIS_Y + 1.26, 0.1),
      visibleInCams: [0, 1], // Overview & Lens Close-up
      onClick: () => handlers.onSelectCamera?.(1),
    },
    {
      id: 'plane-of-focus',
      title: 'Plane of focus',
      sub: '54 cm',
      getWorldPos: (state) => new THREE.Vector3(LENS_FRONT_X + state.focusD, 4.88, -0.1),
      visibleInCams: [0, 2], // Overview & Valley Close-up
      onClick: () => handlers.onSelectCamera?.(2),
    },
    {
      id: 'sharp-zone',
      title: 'Sharp zone',
      sub: '1.5 cm',
      getWorldPos: (state) => new THREE.Vector3(LENS_FRONT_X + state.focusD, 2.75, VALLEY_HALF_Z + 0.08),
      visibleInCams: [0, 2], // Overview & Valley Close-up
      onClick: () => handlers.onSelectCamera?.(2),
    },
    {
      id: 'helicoid',
      title: 'Helicoid',
      sub: '',
      getWorldPos: () => new THREE.Vector3(-0.86, OPTICAL_AXIS_Y + 1.66, 0),
      visibleInCams: [1], // Lens Close-up
      onClick: () => handlers.onSelectCamera?.(1),
    },
    {
      id: 'focus-group',
      title: 'Focus group',
      sub: '',
      getWorldPos: (state) => new THREE.Vector3(state.focusGroupX - 0.08, OPTICAL_AXIS_Y + 0.95, 0.45),
      visibleInCams: [1], // Lens Close-up
      onClick: () => handlers.onSelectCamera?.(1),
    },
    {
      id: 'rear-group',
      title: 'Rear group',
      sub: '',
      getWorldPos: () => new THREE.Vector3(-2.45, OPTICAL_AXIS_Y - 1.12, 0.65),
      visibleInCams: [1, 3], // Lens Close-up & Ground Glass
      onClick: () => handlers.onSelectCamera?.(1),
    },
    {
      id: 'iris',
      title: 'Iris',
      sub: 'f/2',
      getWorldPos: () => new THREE.Vector3(-1.58, OPTICAL_AXIS_Y - 1.12, 0.58),
      visibleInCams: [1, 3], // Lens Close-up & Ground Glass
      onClick: () => handlers.onCycleAperture?.(),
    },
    {
      id: 'front-element',
      title: 'Front element',
      sub: '',
      getWorldPos: (state) => {
        const fx = state.frontElementX ?? 0.45;
        return state.activeCamPreset === 2
          ? new THREE.Vector3(fx + 0.09, OPTICAL_AXIS_Y + 0.36, 0.0)
          : new THREE.Vector3(fx + 0.01, OPTICAL_AXIS_Y + 0.92, -0.45);
      },
      visibleInCams: [1, 2], // Lens Close-up & Valley
      onClick: () => handlers.onSelectCamera?.(2),
    },
  ];

  const pillItems = pillDefinitions.map((def) => {
    const el = document.createElement('div');
    el.className = 'pill-3d';
    el.dataset.pillId = def.id;

    const dot = document.createElement('span');
    dot.className = 'dot';

    const titleEl = document.createElement('b');
    titleEl.textContent = def.title;

    const subEl = document.createElement('em');
    subEl.textContent = def.sub;
    if (!def.sub) subEl.style.display = 'none';

    el.append(dot, titleEl, subEl);
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      def.onClick?.();
    });

    containerEl.appendChild(el);
    return {
      ...def,
      el,
      titleEl,
      subEl,
    };
  });

  const projVec = new THREE.Vector3();

  function update(camera, width, height, state) {
    const { focusD, apertureN, activeCamPreset } = state;
    const [nearD, farD] = computeDofBounds(focusD, apertureN);
    const focusStr = formatDistCm(focusD);
    const dofStr = formatDistCm(farD - nearD, true);
    const apStr = formatAperture(apertureN);

    for (const item of pillItems) {
      // Update dynamic text
      if (item.id === 'plane-of-focus') {
        item.subEl.textContent = focusStr;
      } else if (item.id === 'sharp-zone') {
        item.subEl.textContent = dofStr;
      } else if (item.id === 'iris') {
        item.subEl.textContent = apStr;
      }

      // Check if visible in current camera preset (or if user is free-orbiting, show based on camera distance)
      let shouldShow = item.visibleInCams.includes(activeCamPreset);
      if (activeCamPreset === -1) {
        const distToLens = camera.position.distanceTo(new THREE.Vector3(-0.9, OPTICAL_AXIS_Y, 0));
        if (distToLens < 6.5) {
          shouldShow = true;
        } else {
          shouldShow = item.visibleInCams.includes(0);
        }
      }

      if (!shouldShow) {
        item.el.style.opacity = '0';
        item.el.style.pointerEvents = 'none';
        continue;
      }

      const wp = item.getWorldPos(state);
      projVec.copy(wp).project(camera);

      // Behind camera check
      if (projVec.z > 1.0 || projVec.z < -1.0) {
        item.el.style.opacity = '0';
        item.el.style.pointerEvents = 'none';
        continue;
      }

      const sx = (projVec.x * 0.5 + 0.5) * width;
      const sy = (-projVec.y * 0.5 + 0.5) * height;

      // Keep inside viewport bounds smoothly
      if (sx < 20 || sx > width - 20 || sy < 20 || sy > height - 20) {
        item.el.style.opacity = '0';
        item.el.style.pointerEvents = 'none';
        continue;
      }

      item.el.style.transform = `translate(-50%, -50%) translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
      item.el.style.opacity = '1';
      item.el.style.pointerEvents = 'auto';
    }
  }

  return {
    update,
  };
}

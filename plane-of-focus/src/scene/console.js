import * as THREE from 'three';
import {
  MATS,
  makeCanvasTexture,
  makeRoundedBox,
  createGearGeometry,
  createIrisMaterial,
} from '../materials.js';
import {
  SUBJECTS,
  APERTURE_PRESETS,
  distToSlider,
  sliderToDist,
  computeCoc,
} from '../optics.js';

// The 5 focal distances (in world D units) represented by the 5 filmstrip screens on the console
export const FILMSTRIP_DISTANCES = [
  1.32, // ~30 cm (Near foreground)
  1.61, // 37 cm (Foreground Pine)
  2.35, // 54 cm (Middle Cabin)
  3.15, // ~72 cm (Mid-background)
  3.65, // 84 cm (Background Peak)
];

export function buildOpticalBenchConsole(scene) {
  const consoleGroup = new THREE.Group();
  consoleGroup.name = 'OpticalBenchConsole';
  scene.add(consoleGroup);

  const interactiveMeshes = [];

  // 1. Heavy Beveled Console Base
  // Main lower cabinet body
  const baseCabinet = new THREE.Mesh(
    makeRoundedBox(11.4, 2.05, 4.1, 0.08),
    MATS.consoleSlate
  );
  baseCabinet.position.set(0, 1.025, -0.1);
  baseCabinet.castShadow = true;
  baseCabinet.receiveShadow = true;
  consoleGroup.add(baseCabinet);

  // Sloped front control deck (tilted slightly upward toward the viewer)
  const frontDeckGroup = new THREE.Group();
  frontDeckGroup.position.set(0, 1.05, 1.96);
  frontDeckGroup.rotation.x = -0.11; // ~6.3 deg tilt toward camera
  consoleGroup.add(frontDeckGroup);

  const frontBezel = new THREE.Mesh(
    makeRoundedBox(11.2, 1.88, 0.16, 0.05),
    MATS.consoleSlate
  );
  frontBezel.receiveShadow = true;
  frontDeckGroup.add(frontBezel);

  // Top flat table deck
  const topDeck = new THREE.Mesh(
    makeRoundedBox(11.35, 0.16, 4.05, 0.04),
    MATS.consoleSlate
  );
  topDeck.position.set(0, 2.1, -0.08);
  topDeck.receiveShadow = true;
  consoleGroup.add(topDeck);

  // 2. Optical Rail Assembly along the Top Deck (y ≈ 2.18 .. 2.32)
  const railGroup = new THREE.Group();
  railGroup.position.set(0, 2.18, 0);
  consoleGroup.add(railGroup);

  // Main black rail bed
  const railBed = new THREE.Mesh(
    makeRoundedBox(10.3, 0.12, 0.78, 0.02),
    MATS.anodizedBlack
  );
  railBed.position.set(0, 0.05, 0);
  railBed.castShadow = true;
  railBed.receiveShadow = true;
  railGroup.add(railBed);

  // Twin steel guide rods
  for (const rz of [-0.24, 0.24]) {
    const rod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 10.1, 16),
      MATS.gunmetal
    );
    rod.rotation.z = Math.PI / 2;
    rod.position.set(0, 0.12, rz);
    railGroup.add(rod);
  }

  // Metric Ruler Strip along front edge of the optical rail
  const rulerTex = makeCanvasTexture(2048, 128, (ctx, w, h) => {
    ctx.fillStyle = '#12151c';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#d8e2f2';
    ctx.fillStyle = '#cfd8ea';
    ctx.font = '500 26px "DM Mono", monospace';
    ctx.textAlign = 'center';

    const numCm = 18;
    for (let i = 0; i <= numCm * 10; i++) {
      const x = (i / (numCm * 10)) * (w - 80) + 40;
      const isMajor = i % 10 === 0;
      const isHalf = i % 5 === 0 && !isMajor;
      const tickH = isMajor ? 44 : isHalf ? 28 : 16;
      ctx.lineWidth = isMajor ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, tickH);
      ctx.stroke();

      if (isMajor && i > 0 && i < numCm * 10) {
        ctx.fillText(String(i / 10), x, 78);
      }
    }
  });

  const rulerPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(10.1, 0.16),
    new THREE.MeshBasicMaterial({ map: rulerTex })
  );
  rulerPlane.rotation.x = -Math.PI / 3;
  rulerPlane.position.set(0, 0.08, 0.42);
  railGroup.add(rulerPlane);

  // Warm LED accent strip under the optical rail
  const railLed = new THREE.Mesh(
    new THREE.PlaneGeometry(9.6, 0.08),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffba66').multiplyScalar(1.8),
      transparent: true,
      opacity: 0.85,
    })
  );
  railLed.rotation.x = -Math.PI / 2;
  railLed.position.set(0, 0.005, 0.46);
  railGroup.add(railLed);

  // Brass Rail Focus Thumbwheel Pinion on front of rail (x = -1.62)
  // Oriented around X axis (no rotateY(PI/2)!) so its teeth face toward the viewer and rotate forward/backward (↕) in sync with the focus ring!
  const railKnobGroup = new THREE.Group();
  railKnobGroup.position.set(-1.62, 0.22, 0.56);
  railGroup.add(railKnobGroup);

  const railKnobGeo = createGearGeometry(0.045, 0.18, 0.036, 20, 0.14);
  const railKnob = new THREE.Mesh(railKnobGeo, MATS.brushedBrass);
  railKnob.castShadow = true;
  railKnob.userData.interactiveType = 'focus-ring';
  railKnobGroup.add(railKnob);
  interactiveMeshes.push(railKnob);

  // Horizontal brushed-steel axle shaft for the rail thumbwheel
  const railKnobAxle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.034, 0.034, 0.36, 20),
    MATS.brushedSteel
  );
  railKnobAxle.rotation.z = Math.PI / 2;
  railKnobGroup.add(railKnobAxle);

  // Twin anodized pillow-block bearing supports holding the axle to the rail
  for (const sideX of [-0.13, 0.13]) {
    const bearingBlock = new THREE.Mesh(
      makeRoundedBox(0.05, 0.22, 0.14, 0.012),
      MATS.anodizedBlack
    );
    bearingBlock.position.set(sideX, -0.09, -0.02);
    railKnobGroup.add(bearingBlock);
  }

  // Brass guide strip along the rail base
  const brassRack = new THREE.Mesh(
    makeRoundedBox(1.15, 0.045, 0.07, 0.01),
    MATS.brushedBrass
  );
  brassRack.position.set(-1.62, 0.05, 0.44);
  railGroup.add(brassRack);

  // 3. Left Console Bay: Large Live 7-Blade Iris Gauge
  const leftBay = new THREE.Mesh(
    makeRoundedBox(2.05, 1.48, 0.08, 0.02),
    MATS.consoleDark
  );
  leftBay.position.set(-4.25, 0, 0.04);
  frontDeckGroup.add(leftBay);

  // Outer warm champagne metallic ring
  const gaugeRing = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.62, 48),
    new THREE.MeshBasicMaterial({
      color: '#c8bc9e',
    })
  );
  gaugeRing.position.set(-4.25, 0, 0.09);
  frontDeckGroup.add(gaugeRing);

  // Dark recess behind iris
  const gaugeBack = new THREE.Mesh(
    new THREE.CircleGeometry(0.43, 48),
    new THREE.MeshBasicMaterial({ color: '#1b1916' })
  );
  gaugeBack.position.set(-4.25, 0, 0.085);
  frontDeckGroup.add(gaugeBack);

  // Live 7-blade iris inside the left gauge
  const consoleIrisMat = createIrisMaterial('#9e9278');
  const consoleIrisMesh = new THREE.Mesh(
    new THREE.CircleGeometry(0.43, 48),
    consoleIrisMat
  );
  consoleIrisMesh.position.set(-4.25, 0, 0.092);
  frontDeckGroup.add(consoleIrisMesh);

  // 4. Center Console Bay: 5 Filmstrip Thumbnails + Console Focus Slider
  const centerBay = new THREE.Mesh(
    makeRoundedBox(5.75, 1.54, 0.08, 0.03),
    MATS.anodizedBlack
  );
  centerBay.position.set(-0.2, 0, 0.04);
  frontDeckGroup.add(centerBay);

  // Generate the 5 Filmstrip Thumbnail Canvases (updated when aperture changes)
  const thumbItems = [];
  const thumbSpacing = 1.04;
  const thumbStartX = -0.2 - thumbSpacing * 2;

  for (let i = 0; i < 5; i++) {
    const tx = thumbStartX + i * thumbSpacing;
    const ty = 0.24;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 176;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;

    const thumbPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.65),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    thumbPlane.position.set(tx, ty, 0.095);
    thumbPlane.userData = {
      interactiveType: 'filmstrip-thumb',
      thumbIndex: i,
      focusD: FILMSTRIP_DISTANCES[i],
    };
    frontDeckGroup.add(thumbPlane);
    interactiveMeshes.push(thumbPlane);

    thumbItems.push({
      index: i,
      focusD: FILMSTRIP_DISTANCES[i],
      mesh: thumbPlane,
      canvas,
      ctx,
      tex,
    });
  }

  // Glowing Cyan Active Frame around the selected/closest filmstrip thumbnail
  const activeFrameGroup = new THREE.Group();
  activeFrameGroup.position.set(thumbStartX + 2 * thumbSpacing, 0.24, 0.11);
  frontDeckGroup.add(activeFrameGroup);

  const frameGlowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#dceef5'),
  });
  const fw = 1.04;
  const fh = 0.73;
  const ft = 0.024;
  const topBar = new THREE.Mesh(new THREE.PlaneGeometry(fw, ft), frameGlowMat);
  topBar.position.y = fh / 2;
  const botBar = new THREE.Mesh(new THREE.PlaneGeometry(fw, ft), frameGlowMat);
  botBar.position.y = -fh / 2;
  const leftBar = new THREE.Mesh(new THREE.PlaneGeometry(ft, fh), frameGlowMat);
  leftBar.position.x = -fw / 2;
  const rightBar = new THREE.Mesh(new THREE.PlaneGeometry(ft, fh), frameGlowMat);
  rightBar.position.x = fw / 2;
  activeFrameGroup.add(topBar, botBar, leftBar, rightBar);

  // Console Focus Slider below the 5 thumbnails
  const sliderY = -0.44;
  const sliderMinX = -2.18;
  const sliderMaxX = 1.78;
  const sliderWidth = sliderMaxX - sliderMinX;
  const sliderCenterX = (sliderMinX + sliderMaxX) * 0.5;

  // Invisible hit plane for dragging/clicking the console slider directly in 3D
  const sliderHitPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(sliderWidth + 0.3, 0.36),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  sliderHitPlane.position.set(sliderCenterX, sliderY, 0.12);
  sliderHitPlane.userData = {
    interactiveType: 'console-slider',
    sliderMinX,
    sliderMaxX,
  };
  frontDeckGroup.add(sliderHitPlane);
  interactiveMeshes.push(sliderHitPlane);

  // Tick marks along the console slider
  const numSliderTicks = 29;
  for (let i = 0; i < numSliderTicks; i++) {
    const u = i / (numSliderTicks - 1);
    const tkX = sliderMinX + u * sliderWidth;
    const isMajor = i % 7 === 0;
    const tkMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.015, isMajor ? 0.12 : 0.08),
      new THREE.MeshBasicMaterial({
        color: isMajor ? '#9aa0ac' : '#525864',
      })
    );
    tkMesh.position.set(tkX, sliderY + 0.04, 0.09);
    frontDeckGroup.add(tkMesh);
  }

  // Dark background track line
  const trackBg = new THREE.Mesh(
    new THREE.PlaneGeometry(sliderWidth, 0.026),
    new THREE.MeshBasicMaterial({ color: '#262930' })
  );
  trackBg.position.set(sliderCenterX, sliderY - 0.03, 0.092);
  frontDeckGroup.add(trackBg);

  // Clean silver-ice active fill bar on the console slider (no sloppy neon bloom)
  const sliderFillMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 0.032),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#d2e4ec'),
    })
  );
  sliderFillMesh.position.set(sliderMinX, sliderY - 0.03, 0.096);
  frontDeckGroup.add(sliderFillMesh);

  // 3D Metallic Slider Handle + downward cyan pointer
  const sliderHandleGroup = new THREE.Group();
  sliderHandleGroup.position.set(sliderCenterX, sliderY - 0.03, 0.12);
  frontDeckGroup.add(sliderHandleGroup);

  const handleKnob = new THREE.Mesh(
    makeRoundedBox(0.18, 0.32, 0.1, 0.03),
    MATS.brushedSteel
  );
  handleKnob.userData = {
    interactiveType: 'console-slider',
    sliderMinX,
    sliderMaxX,
  };
  sliderHandleGroup.add(handleKnob);
  interactiveMeshes.push(handleKnob);

  // Grip groove on handle
  const handleGroove = new THREE.Mesh(
    new THREE.BoxGeometry(0.19, 0.04, 0.11),
    MATS.anodizedBlack
  );
  sliderHandleGroup.add(handleGroove);

  // Glowing cyan triangle pointer below the handle
  const triShape = new THREE.Shape();
  triShape.moveTo(-0.045, 0);
  triShape.lineTo(0.045, 0);
  triShape.lineTo(0, -0.065);
  triShape.closePath();
  const triPointer = new THREE.Mesh(
    new THREE.ShapeGeometry(triShape),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#8be8ff').multiplyScalar(1.8) })
  );
  triPointer.position.set(0, -0.2, 0.01);
  sliderHandleGroup.add(triPointer);

  // Left '<' and Right '>' Chevron Step Buttons
  const makeChevronButton = (xPos, dir) => {
    const chevTex = makeCanvasTexture(128, 128, (ctx, w, h) => {
      ctx.strokeStyle = '#9beeff';
      ctx.shadowColor = '#7fe3ff';
      ctx.shadowBlur = 14;
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      if (dir < 0) {
        ctx.moveTo(w * 0.65, h * 0.22);
        ctx.lineTo(w * 0.35, h * 0.5);
        ctx.lineTo(w * 0.65, h * 0.78);
      } else {
        ctx.moveTo(w * 0.35, h * 0.22);
        ctx.lineTo(w * 0.65, h * 0.5);
        ctx.lineTo(w * 0.35, h * 0.78);
      }
      ctx.stroke();
    });

    const btn = new THREE.Mesh(
      new THREE.PlaneGeometry(0.32, 0.32),
      new THREE.MeshBasicMaterial({ map: chevTex, transparent: true })
    );
    btn.position.set(xPos, sliderY, 0.1);
    btn.userData = {
      interactiveType: 'console-step',
      stepDir: dir,
    };
    frontDeckGroup.add(btn);
    interactiveMeshes.push(btn);
  };

  makeChevronButton(sliderMinX - 0.28, -1);
  makeChevronButton(sliderMaxX + 0.28, 1);

  // Subtle engraved label under the slider
  const brandTex = makeCanvasTexture(512, 64, (ctx, w, h) => {
    ctx.fillStyle = '#535d70';
    ctx.font = '600 22px "DM Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('50MM F/2 OPTICAL BENCH', w / 2, 42);
  });
  const brandMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 0.16),
    new THREE.MeshBasicMaterial({ map: brandTex, transparent: true })
  );
  brandMesh.position.set(-0.2, -0.78, 0.09);
  frontDeckGroup.add(brandMesh);

  // 5. Right Console Bay: 3 Physical Aperture Dials (f/2, f/5.6, f/16) + Amber Active Bar
  const rightBay = new THREE.Mesh(
    makeRoundedBox(2.55, 1.48, 0.08, 0.02),
    MATS.consoleDark
  );
  rightBay.position.set(4.12, 0, 0.04);
  frontDeckGroup.add(rightBay);

  const dialXs = [3.38, 4.12, 4.86];
  const dialApValues = [2, 5.6, 16];
  const dialOpenRadii = [0.64, 0.28, 0.11]; // Relative opening of each dial

  dialXs.forEach((dx, idx) => {
    const dialTex = makeCanvasTexture(256, 256, (ctx, w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      const outerR = w * 0.44;
      const openR = outerR * dialOpenRadii[idx];

      // Brushed champagne-silver ring
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#e2dfd7');
      grad.addColorStop(0.5, '#c8c4ba');
      grad.addColorStop(1, '#a6a298');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
      ctx.fill();

      // Dark outer rim
      ctx.strokeStyle = '#252932';
      ctx.lineWidth = 8;
      ctx.stroke();

      // 7-blade iris seam lines
      ctx.strokeStyle = 'rgba(30, 32, 38, 0.55)';
      ctx.lineWidth = 2.5;
      const blades = 7;
      for (let b = 0; b < blades; b++) {
        const a1 = (b / blades) * Math.PI * 2;
        const a2 = a1 + 0.65;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a1) * openR, cy + Math.sin(a1) * openR);
        ctx.lineTo(cx + Math.cos(a2) * outerR, cy + Math.sin(a2) * outerR);
        ctx.stroke();
      }

      // Dark 7-gon aperture opening in the center
      ctx.fillStyle = '#181a20';
      ctx.beginPath();
      for (let b = 0; b <= blades; b++) {
        const a = (b / blades) * Math.PI * 2;
        const px = cx + Math.cos(a) * openR;
        const py = cy + Math.sin(a) * openR;
        if (b === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    });

    const dialMesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.33, 36),
      new THREE.MeshBasicMaterial({
        map: dialTex,
      })
    );
    dialMesh.position.set(dx, 0.02, 0.095);
    dialMesh.userData = {
      interactiveType: 'aperture-dial',
      apertureN: dialApValues[idx],
    };
    frontDeckGroup.add(dialMesh);
    interactiveMeshes.push(dialMesh);
  });

  // Glowing Amber LED bar under the active aperture dial
  const amberIndicator = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.045),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffb454').multiplyScalar(2.2),
    })
  );
  amberIndicator.position.set(dialXs[0], -0.58, 0.095);
  frontDeckGroup.add(amberIndicator);

  // Helper to paint an upright (camera-flipped) miniature valley view onto a filmstrip thumbnail canvas
  function renderFilmstripThumb(item, apertureN) {
    const { ctx, canvas, tex, focusD } = item;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // 1. Sky backdrop (blur proportional to distance from sky at D=4.4)
    const skyCoc = computeCoc(4.4, focusD, apertureN);
    const skyBlurPx = Math.min(skyCoc * 55, 14);
    ctx.save();
    ctx.filter = `blur(${skyBlurPx.toFixed(1)}px)`;
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.75);
    skyGrad.addColorStop(0, '#72b4f0');
    skyGrad.addColorStop(0.55, '#a6d5f7');
    skyGrad.addColorStop(1, '#d7ecfc');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(-20, -20, w + 40, h + 40);

    // Soft white clouds
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.ellipse(w * 0.25, h * 0.22, 34, 12, 0, 0, Math.PI * 2);
    ctx.ellipse(w * 0.72, h * 0.18, 42, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Background Layer: Snow-capped Mountains (D = 3.65 / 84 cm)
    const peakCoc = computeCoc(3.65, focusD, apertureN);
    const peakBlurPx = Math.min(peakCoc * 62, 16);
    ctx.save();
    ctx.filter = `blur(${peakBlurPx.toFixed(1)}px)`;
    // Meadow base
    ctx.fillStyle = '#5c9c46';
    ctx.fillRect(-10, h * 0.62, w + 20, h * 0.45);

    // Mountains
    const drawMountain = (mx, baseW, mh, colDark, colLight) => {
      ctx.fillStyle = colDark;
      ctx.beginPath();
      ctx.moveTo(mx, h * 0.68 - mh);
      ctx.lineTo(mx - baseW * 0.5, h * 0.68);
      ctx.lineTo(mx, h * 0.68);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = colLight;
      ctx.beginPath();
      ctx.moveTo(mx, h * 0.68 - mh);
      ctx.lineTo(mx + baseW * 0.5, h * 0.68);
      ctx.lineTo(mx, h * 0.68);
      ctx.closePath();
      ctx.fill();

      // Snow cap
      ctx.fillStyle = '#edf4fc';
      ctx.beginPath();
      ctx.moveTo(mx, h * 0.68 - mh);
      ctx.lineTo(mx - baseW * 0.18, h * 0.68 - mh * 0.62);
      ctx.lineTo(mx + baseW * 0.18, h * 0.68 - mh * 0.62);
      ctx.closePath();
      ctx.fill();
    };
    drawMountain(w * 0.34, 120, 96, '#7a8299', '#9da6bd');
    drawMountain(w * 0.68, 135, 108, '#707890', '#969fb8');
    ctx.restore();

    // 3. Middle Layer: Cozy Wooden Cabin & Midground Trees (D = 2.35 / 54 cm)
    const cabinCoc = computeCoc(2.35, focusD, apertureN);
    const cabinBlurPx = Math.min(cabinCoc * 64, 16);
    ctx.save();
    ctx.filter = `blur(${cabinBlurPx.toFixed(1)}px)`;

    // Midground foliage
    ctx.fillStyle = '#3d8232';
    ctx.beginPath();
    ctx.arc(w * 0.22, h * 0.62, 26, 0, Math.PI * 2);
    ctx.arc(w * 0.64, h * 0.58, 28, 0, Math.PI * 2);
    ctx.fill();

    // Cabin body
    const cx = w * 0.44;
    const cy = h * 0.68;
    ctx.fillStyle = '#9e6b43';
    ctx.fillRect(cx - 28, cy - 34, 56, 36);

    // Cabin roof
    ctx.fillStyle = '#4a3528';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 58);
    ctx.lineTo(cx - 35, cy - 32);
    ctx.lineTo(cx + 35, cy - 32);
    ctx.closePath();
    ctx.fill();

    // Glowing warm cabin windows & lantern bokeh
    ctx.fillStyle = '#ffdf85';
    ctx.shadowColor = '#ffae42';
    ctx.shadowBlur = 10 + cabinBlurPx * 1.5;
    ctx.fillRect(cx - 18, cy - 22, 11, 11);
    ctx.fillRect(cx + 7, cy - 22, 11, 11);
    ctx.beginPath();
    ctx.arc(cx - 22, cy - 6, 4 + cabinBlurPx * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 4. Foreground Layer: Tall Pine Trees on left & right (D = 1.61 / 37 cm)
    const pineCoc = computeCoc(1.61, focusD, apertureN);
    const pineBlurPx = Math.min(pineCoc * 64, 17);
    ctx.save();
    ctx.filter = `blur(${pineBlurPx.toFixed(1)}px)`;

    const drawPine = (px, py, scale, col) => {
      ctx.fillStyle = col;
      const tiers = [
        [0, 36 * scale, 42 * scale],
        [-24 * scale, 28 * scale, 38 * scale],
        [-48 * scale, 20 * scale, 34 * scale],
      ];
      for (const [yo, hw, th] of tiers) {
        ctx.beginPath();
        ctx.moveTo(px, py + yo - th);
        ctx.lineTo(px - hw, py + yo);
        ctx.lineTo(px + hw, py + yo);
        ctx.closePath();
        ctx.fill();
      }
    };

    drawPine(w * 0.14, h * 0.88, 1.05, '#266927');
    drawPine(w * 0.82, h * 0.86, 1.18, '#2d782b');
    drawPine(w * 0.94, h * 0.92, 0.9, '#205921');
    ctx.restore();

    // Subtle vignette inside thumbnail
    const vig = ctx.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.65);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(6, 10, 18, 0.38)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    tex.needsUpdate = true;
  }

  let lastRenderedAperture = -1;

  function update(focusD, apertureN) {
    // 1. Rotate brass rail thumbwheel
    const sliderT = distToSlider(focusD);
    railKnob.rotation.x = sliderT * Math.PI * 6;

    // 2. Update console slider handle & glowing fill bar
    const handleX = sliderMinX + sliderT * sliderWidth;
    sliderHandleGroup.position.x = handleX;
    const fillW = Math.max(0.02, handleX - sliderMinX);
    sliderFillMesh.scale.x = fillW;
    sliderFillMesh.position.x = sliderMinX + fillW * 0.5;

    // 3. Move glowing cyan active frame to the closest filmstrip thumbnail
    let closestIdx = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < FILMSTRIP_DISTANCES.length; i++) {
      const diff = Math.abs(focusD - FILMSTRIP_DISTANCES[i]);
      if (diff < bestDiff) {
        bestDiff = diff;
        closestIdx = i;
      }
    }
    const targetFrameX = thumbStartX + closestIdx * thumbSpacing;
    activeFrameGroup.position.x += (targetFrameX - activeFrameGroup.position.x) * 0.28;

    // 4. Update left console iris gauge
    const apNorm = Math.pow(2 / apertureN, 0.82); // 1.0 at f/2, smaller at f/16
    const irisRadius = 0.12 + apNorm * 0.56;
    consoleIrisMat.userData.uniforms.uAp.value = irisRadius;
    consoleIrisMat.userData.uniforms.uRot.value = (1 - apNorm) * 0.55;

    // 5. Move right amber indicator under active aperture dial
    let dialIdx = 0;
    if (apertureN >= 11) dialIdx = 2;
    else if (apertureN >= 3.5) dialIdx = 1;
    const targetAmberX = dialXs[dialIdx];
    amberIndicator.position.x += (targetAmberX - amberIndicator.position.x) * 0.25;

    // 6. Re-render filmstrip thumbnails when aperture changes significantly
    if (Math.abs(apertureN - lastRenderedAperture) > 0.08) {
      lastRenderedAperture = apertureN;
      for (const item of thumbItems) {
        renderFilmstripThumb(item, apertureN);
      }
    }
  }

  // Initial thumbnail render
  update(2.35, 2);

  return {
    group: consoleGroup,
    interactiveMeshes,
    update,
  };
}

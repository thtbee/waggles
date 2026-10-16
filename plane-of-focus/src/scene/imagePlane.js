import * as THREE from 'three';
import {
  MATS,
  makeRoundedBox,
  createGearGeometry,
} from '../materials.js';
import {
  IMAGE_PLANE_X,
  OPTICAL_AXIS_Y,
  SUBJECTS,
  computeCoc,
  clamp,
} from '../optics.js';

// Normalized [u, v] coordinates on the Ground Glass for the 3 subjects' inverted image points
// u in [-1..1] maps to Z in [-glassW/2 .. +glassW/2]
// v in [-1..1] maps to Y in [OPTICAL_AXIS_Y - glassH/2 .. OPTICAL_AXIS_Y + glassH/2]
export const GLASS_W = 2.24;
export const GLASS_H = 1.54;

export const SUBJECT_GLASS_COORDS = [
  // 0: Foreground Pine (37 cm) -> lands on the left foreground pine tip (-Z is left when looking +X)
  { id: 'pine', zOff: -0.68, yOff: -0.04 },
  // 1: Middle Cabin (54 cm) -> lands right on the inverted cabin's glowing window (matches frame_25!)
  { id: 'cabin', zOff: -0.04, yOff: 0.15 },
  // 2: Background Mountain Peak (84 cm) -> lands right on the inverted central snow-capped peak tip (matches frame_22!)
  { id: 'peak', zOff: 0.04, yOff: -0.34 },
];

export function buildImagePlaneScreen(scene) {
  const screenGroup = new THREE.Group();
  screenGroup.name = 'ImagePlaneScreen';
  screenGroup.position.set(IMAGE_PLANE_X, 0, 0);
  scene.add(screenGroup);

  const interactiveMeshes = [];

  // 1. Rail Carriage Base & Twin Vertical Pillars
  const railCarriage = new THREE.Mesh(
    makeRoundedBox(0.56, 0.16, 1.15, 0.03),
    MATS.anodizedBlack
  );
  railCarriage.position.set(0, 2.28, 0);
  railCarriage.castShadow = true;
  screenGroup.add(railCarriage);

  const crossBase = new THREE.Mesh(
    makeRoundedBox(0.32, 0.14, GLASS_W + 0.36, 0.03),
    MATS.anodizedBlack
  );
  crossBase.position.set(0, 2.48, 0);
  crossBase.castShadow = true;
  screenGroup.add(crossBase);

  // Left (-Z) and Right (+Z) vertical posts
  for (const signZ of [-1, 1]) {
    const zPos = signZ * (GLASS_W * 0.5 + 0.09);
    const pillar = new THREE.Mesh(
      makeRoundedBox(0.22, GLASS_H + 0.32, 0.18, 0.03),
      MATS.anodizedBlack
    );
    pillar.position.set(0, OPTICAL_AXIS_Y, zPos);
    pillar.castShadow = true;
    screenGroup.add(pillar);

    // Top and bottom corner clamps
    for (const signY of [-1, 1]) {
      const clampBlock = new THREE.Mesh(
        makeRoundedBox(0.28, 0.24, 0.28, 0.04),
        MATS.consoleDark
      );
      clampBlock.position.set(
        0,
        OPTICAL_AXIS_Y + signY * (GLASS_H * 0.5 + 0.04),
        zPos - signZ * 0.04
      );
      clampBlock.castShadow = true;
      screenGroup.add(clampBlock);
    }
  }

  // Knurled adjustment knob on the outer (-Z) left pillar
  const sideKnobGeo = createGearGeometry(0.02, 0.14, 0.024, 20, 0.13);
  sideKnobGeo.rotateY(Math.PI / 2);
  const sideKnob = new THREE.Mesh(sideKnobGeo, MATS.anodizedBlack);
  sideKnob.position.set(0, OPTICAL_AXIS_Y - 0.18, -GLASS_W * 0.5 - 0.22);
  screenGroup.add(sideKnob);

  // 2. Glowing Seafoam-Cyan Frosted Glass Edges (top, bottom, left, right)
  const glassEdgeMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#6ef5db').multiplyScalar(1.35),
    transparent: true,
    opacity: 0.88,
  });

  const topEdge = new THREE.Mesh(
    new THREE.BoxGeometry(0.055, 0.028, GLASS_W),
    glassEdgeMat
  );
  topEdge.position.set(0, OPTICAL_AXIS_Y + GLASS_H * 0.5, 0);
  screenGroup.add(topEdge);

  const botEdge = new THREE.Mesh(
    new THREE.BoxGeometry(0.055, 0.028, GLASS_W),
    glassEdgeMat
  );
  botEdge.position.set(0, OPTICAL_AXIS_Y - GLASS_H * 0.5, 0);
  screenGroup.add(botEdge);

  const frontEdge = new THREE.Mesh(
    new THREE.BoxGeometry(0.055, GLASS_H, 0.028),
    glassEdgeMat
  );
  frontEdge.position.set(0, OPTICAL_AXIS_Y, GLASS_W * 0.5);
  screenGroup.add(frontEdge);

  const backEdge = new THREE.Mesh(
    new THREE.BoxGeometry(0.055, GLASS_H, 0.028),
    glassEdgeMat
  );
  backEdge.position.set(0, OPTICAL_AXIS_Y, -GLASS_W * 0.5);
  screenGroup.add(backEdge);

  // 3. Dynamic Upside-Down Ground Glass Projection Canvas
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 528;
  const ctx = canvas.getContext('2d');
  const screenTex = new THREE.CanvasTexture(canvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.anisotropy = 8;

  const glassMat = new THREE.MeshBasicMaterial({
    map: screenTex,
    side: THREE.DoubleSide,
  });

  // Single DoubleSide glass plane oriented at rotation.y = -Math.PI / 2
  const glassPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(GLASS_W, GLASS_H),
    glassMat
  );
  glassPlane.rotation.y = -Math.PI / 2;
  glassPlane.position.set(0, OPTICAL_AXIS_Y, 0);
  glassPlane.userData = { interactiveType: 'image-plane' };
  screenGroup.add(glassPlane);
  interactiveMeshes.push(glassPlane);

  // Render the upside-down 3D-shaded optical projection + bokeh discs onto the ground glass canvas
  function renderGroundGlass(focusD, apertureN) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Draw inverted scene by flipping canvas vertically & horizontally around center
    // Note: with rotation.y = -Math.PI/2, canvas x=0 is +Z (Right on screen) and x=w is -Z (Left on screen).
    // With scale(-1, -1), world x_canvas = w * (0.5 - zOff / GLASS_W), y_canvas = h * (0.5 + yOff / GLASS_H).
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(-1, -1);
    ctx.translate(-w / 2, -h / 2);

    // Layer 1: Sky & Clouds (at the bottom when inverted!)
    const skyCoc = computeCoc(4.2, focusD, apertureN);
    const skyBlur = Math.min(skyCoc * 125, 28);
    ctx.save();
    ctx.filter = `blur(${skyBlur.toFixed(1)}px)`;
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    skyGrad.addColorStop(0, '#98ccf2');
    skyGrad.addColorStop(0.56, '#c7e5fa');
    skyGrad.addColorStop(0.64, '#5fa342');
    skyGrad.addColorStop(1, '#4c8c34');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(-40, -40, w + 80, h + 80);

    // Soft volumetric clouds
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.beginPath();
    ctx.ellipse(w * 0.25, h * 0.20, 95, 28, 0, 0, Math.PI * 2);
    ctx.ellipse(w * 0.52, h * 0.16, 110, 32, 0, 0, Math.PI * 2);
    ctx.ellipse(w * 0.78, h * 0.22, 90, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Layer 2: Background Mountain Peaks (D = 3.65 / 84 cm)
    // Peak target is at zOff = +0.04, yOff = -0.34 -> in unflipped coords: mx = w * (0.5 - 0.04/2.24) = w * 0.482, tipY = h * (0.5 - 0.34/1.54) = h * 0.279
    const peakCoc = computeCoc(3.65, focusD, apertureN);
    const peakBlur = Math.min(peakCoc * 140, 32);
    ctx.save();
    ctx.filter = `blur(${peakBlur.toFixed(1)}px)`;

    // Valley grass terrain contour
    ctx.fillStyle = '#5ca140';
    ctx.fillRect(-30, h * 0.62, w + 60, h * 0.45);

    const drawFacetedPeak = (mx, baseY, baseW, tipY) => {
      // Left shaded rock face
      ctx.fillStyle = '#6e7994';
      ctx.beginPath();
      ctx.moveTo(mx, tipY);
      ctx.lineTo(mx - baseW * 0.52, baseY);
      ctx.lineTo(mx - baseW * 0.04, baseY);
      ctx.closePath();
      ctx.fill();

      // Center ridge facet
      ctx.fillStyle = '#8490ad';
      ctx.beginPath();
      ctx.moveTo(mx, tipY);
      ctx.lineTo(mx - baseW * 0.04, baseY);
      ctx.lineTo(mx + baseW * 0.18, baseY);
      ctx.closePath();
      ctx.fill();

      // Right sunlit rock face
      ctx.fillStyle = '#9aa6c2';
      ctx.beginPath();
      ctx.moveTo(mx, tipY);
      ctx.lineTo(mx + baseW * 0.18, baseY);
      ctx.lineTo(mx + baseW * 0.52, baseY);
      ctx.closePath();
      ctx.fill();

      // Low-poly snow cap (left & right facets)
      const snowH = (baseY - tipY) * 0.46;
      ctx.fillStyle = '#dce6f7';
      ctx.beginPath();
      ctx.moveTo(mx, tipY);
      ctx.lineTo(mx - baseW * 0.24, tipY + snowH);
      ctx.lineTo(mx - baseW * 0.02, tipY + snowH * 0.86);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#f4f8ff';
      ctx.beginPath();
      ctx.moveTo(mx, tipY);
      ctx.lineTo(mx - baseW * 0.02, tipY + snowH * 0.86);
      ctx.lineTo(mx + baseW * 0.24, tipY + snowH);
      ctx.closePath();
      ctx.fill();
    };

    // Side peaks + central peak whose tip is at (w * 0.482, h * 0.279)
    drawFacetedPeak(w * 0.25, h * 0.67, 230, h * 0.33);
    drawFacetedPeak(w * 0.74, h * 0.67, 250, h * 0.30);
    drawFacetedPeak(w * 0.482, h * 0.68, 270, h * 0.279);
    ctx.restore();

    // Layer 3: Middle Cabin, Lantern & Deciduous Trees (D = 2.35 / 54 cm)
    // Cabin window target is at zOff = -0.04, yOff = +0.15 -> in unflipped coords: wx = w * 0.518, wy = h * 0.597
    const cabinCoc = computeCoc(2.35, focusD, apertureN);
    const cabinBlur = Math.min(cabinCoc * 150, 36);
    ctx.save();
    ctx.filter = `blur(${cabinBlur.toFixed(1)}px)`;

    // Low-poly deciduous tree next to cabin (on the right side of the inverted glass -> x ~ w * 0.36)
    const tx = w * 0.36;
    const ty = h * 0.58;
    // Tree trunk
    ctx.fillStyle = '#4d3627';
    ctx.fillRect(tx - 9, ty, 18, 72);
    // Faceted foliage crown
    ctx.fillStyle = '#4c9432';
    ctx.beginPath();
    ctx.arc(tx, ty - 14, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#66b346';
    ctx.beginPath();
    ctx.arc(tx - 14, ty - 26, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#78c456';
    ctx.beginPath();
    ctx.arc(tx + 12, ty - 8, 38, 0, Math.PI * 2);
    ctx.fill();

    // 3D-shaded Cabin (front wall + side wall + pitched roof + chimney)
    const cx = w * 0.545;
    const cy = h * 0.69;
    // Side wall (3D perspective depth)
    ctx.fillStyle = '#8a5c38';
    ctx.fillRect(cx - 88, cy - 102, 30, 102);
    // Main front wall
    ctx.fillStyle = '#b88254';
    ctx.fillRect(cx - 58, cy - 102, 124, 102);

    // Chimney
    ctx.fillStyle = '#59453a';
    ctx.fillRect(cx - 46, cy - 154, 26, 52);

    // Pitched Roof (Gable)
    ctx.fillStyle = '#473328';
    ctx.beginPath();
    ctx.moveTo(cx + 4, cy - 166);
    ctx.lineTo(cx - 82, cy - 96);
    ctx.lineTo(cx + 84, cy - 96);
    ctx.closePath();
    ctx.fill();

    // Glowing Cabin Windows (left window centered at w*0.518, h*0.597 so the cabin ray bundle lands right on it!)
    ctx.fillStyle = '#fff0a6';
    ctx.shadowColor = '#ffb84d';
    ctx.shadowBlur = 22;
    ctx.fillRect(w * 0.518 - 16, h * 0.597 - 16, 32, 32); // Target window!
    ctx.fillRect(cx + 18, h * 0.597 - 16, 32, 32);
    // Attic window near gable peak
    ctx.fillRect(cx - 8, cy - 134, 24, 24);

    // Warm Porch Lantern glow dot (visible in frame_25!)
    ctx.fillStyle = '#fff9d2';
    ctx.beginPath();
    ctx.arc(cx + 38, cy + 12, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Creamy Bokeh Discs when Cabin / Lights are out of focus (matches frame_22 & frame_25!)
    const bokehSpots = [
      [w * 0.518, h * 0.597, '#ffe28a', 1.0],
      [cx + 34, h * 0.597, '#ffd670', 0.9],
      [cx + 4, cy - 122, '#ffe89e', 0.85],
      [cx + 38, cy + 18, '#fff0b8', 1.1],
      [w * 0.62, h * 0.82, '#e8f5a2', 0.75],
      [w * 0.38, h * 0.84, '#d8f298', 0.7],
    ];
    for (const [bx, by, bcol, scaleR] of bokehSpots) {
      const bBlur = Math.max(cabinBlur, 6);
      const bokehAlpha = cabinBlur > 2.5 ? clamp((cabinBlur - 2) / 20, 0.12, 0.58) : 0.16;
      const bokehRadius = (10 + bBlur * 1.45) * scaleR;
      ctx.save();
      ctx.globalAlpha = bokehAlpha;
      ctx.fillStyle = bcol;
      ctx.beginPath();
      ctx.arc(bx, by, bokehRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 250, 215, 0.75)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();
    }

    // Layer 4: Foreground Pine Trees on Left & Right (D = 1.61 / 37 cm)
    // Pine target is at zOff = -0.68, yOff = -0.04 -> in unflipped coords: px = w * (0.5 + 0.68/2.24) = w * 0.8036, pyTip = h * (0.5 - 0.04/1.54) = h * 0.474
    const pineCoc = computeCoc(1.61, focusD, apertureN);
    const pineBlur = Math.min(pineCoc * 150, 36);
    ctx.save();
    ctx.filter = `blur(${pineBlur.toFixed(1)}px)`;

    const drawFgPine = (px, tipY, sc, colDark, colLight) => {
      // 3 tiered low-poly pine cones from top tipY downward
      const tiers = [
        [0, 52 * sc, 86 * sc],
        [54 * sc, 68 * sc, 96 * sc],
        [114 * sc, 84 * sc, 108 * sc],
      ];
      for (const [yo, hw, th] of tiers) {
        // Left half
        ctx.fillStyle = colDark;
        ctx.beginPath();
        ctx.moveTo(px, tipY + yo);
        ctx.lineTo(px - hw, tipY + yo + th);
        ctx.lineTo(px, tipY + yo + th);
        ctx.closePath();
        ctx.fill();
        // Right half
        ctx.fillStyle = colLight;
        ctx.beginPath();
        ctx.moveTo(px, tipY + yo);
        ctx.lineTo(px, tipY + yo + th);
        ctx.lineTo(px + hw, tipY + yo + th);
        ctx.closePath();
        ctx.fill();
      }
    };

    // Main foreground pine on the left of the Ground Glass (unflipped x = w * 0.8036, tip at h * 0.474)
    drawFgPine(w * 0.804, h * 0.474, 1.15, '#2d7528', '#42993b');
    drawFgPine(w * 0.92, h * 0.54, 0.95, '#246120', '#35822f');
    // Secondary foreground pine on the right of the Ground Glass (unflipped x = w * 0.15)
    drawFgPine(w * 0.15, h * 0.48, 1.12, '#307a2b', '#469e3f');
    ctx.restore();

    ctx.restore(); // End inverted scene transform

    // 5. Frosted cyan-tinted ground glass vignette & subtle optical screen grain
    const edgeGrad = ctx.createRadialGradient(w / 2, h / 2, w * 0.28, w / 2, h / 2, w * 0.62);
    edgeGrad.addColorStop(0, 'rgba(120, 240, 220, 0.02)');
    edgeGrad.addColorStop(1, 'rgba(95, 235, 210, 0.18)');
    ctx.fillStyle = edgeGrad;
    ctx.fillRect(0, 0, w, h);

    screenTex.needsUpdate = true;
  }

  let lastFocus = -1;
  let lastAp = -1;

  function update(focusD, apertureN) {
    if (Math.abs(focusD - lastFocus) > 0.002 || Math.abs(apertureN - lastAp) > 0.01) {
      lastFocus = focusD;
      lastAp = apertureN;
      renderGroundGlass(focusD, apertureN);
    }
  }

  // Initial render
  update(2.35, 2);

  return {
    group: screenGroup,
    interactiveMeshes,
    getSubjectGlassWorldPos: (idx) => {
      const c = SUBJECT_GLASS_COORDS[idx];
      return new THREE.Vector3(
        IMAGE_PLANE_X,
        OPTICAL_AXIS_Y + c.yOff,
        c.zOff
      );
    },
    getSubjectGlassDiscRadiusWorld: (idx, focusD, apertureN) => {
      const subj = SUBJECTS[idx];
      const cocVal = computeCoc(subj.d, focusD, apertureN);
      return clamp(cocVal * 0.95, 0.008, 0.17);
    },
    update,
  };
}

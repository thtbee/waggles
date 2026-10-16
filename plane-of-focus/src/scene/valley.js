import * as THREE from 'three';
import {
  MATS,
  makeCanvasTexture,
  makeRoundedBox,
} from '../materials.js';
import {
  LENS_FRONT_X,
  VALLEY_MIN_X,
  VALLEY_MAX_X,
  VALLEY_HALF_Z,
  VALLEY_BASE_Y,
  computeDofBounds,
  clamp,
} from '../optics.js';

export function buildMiniatureValley(scene) {
  const valleyGroup = new THREE.Group();
  valleyGroup.name = 'MiniatureValley';
  scene.add(valleyGroup);

  const interactiveMeshes = [];
  const sliceableMeshes = []; // Meshes whose triangles are sliced in real time by the Plane of Focus

  const centerX = (VALLEY_MIN_X + VALLEY_MAX_X) * 0.5; // 3.36
  const lengthX = VALLEY_MAX_X - VALLEY_MIN_X; // 3.48
  const widthZ = VALLEY_HALF_Z * 2; // 3.50

  // 1. Support Table Platform & 4 Legs on the Optical Bench
  const platformSubframe = new THREE.Mesh(
    makeRoundedBox(lengthX + 0.16, 0.1, widthZ + 0.16, 0.02),
    MATS.anodizedBlack
  );
  platformSubframe.position.set(centerX, 2.78, 0);
  platformSubframe.castShadow = true;
  platformSubframe.receiveShadow = true;
  valleyGroup.add(platformSubframe);

  const legOffsets = [
    [VALLEY_MIN_X + 0.18, 1.55],
    [VALLEY_MAX_X - 0.18, 1.55],
    [VALLEY_MIN_X + 0.18, -1.55],
    [VALLEY_MAX_X - 0.18, -1.55],
  ];
  for (const [lx, lz] of legOffsets) {
    const leg = new THREE.Mesh(
      makeRoundedBox(0.12, 0.65, 0.12, 0.02),
      MATS.anodizedBlack
    );
    leg.position.set(lx, 2.45, lz);
    leg.castShadow = true;
    valleyGroup.add(leg);
  }

  // 2. Wooden Diorama Tray Border (with vertical plank lines like the video)
  const woodTex = makeCanvasTexture(1024, 256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#a87b51');
    grad.addColorStop(0.5, '#8f633d');
    grad.addColorStop(1, '#6e492a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle wood grain & vertical plank joints
    ctx.strokeStyle = 'rgba(42, 24, 10, 0.45)';
    ctx.lineWidth = 3;
    const planks = 14;
    for (let i = 1; i < planks; i++) {
      const px = (i / planks) * w;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
    }
    // Top & bottom trim lines
    ctx.fillStyle = 'rgba(255, 225, 185, 0.18)';
    ctx.fillRect(0, 12, w, 6);
    ctx.fillRect(0, h - 22, w, 6);
  });

  const woodMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    roughness: 0.62,
    metalness: 0.05,
  });

  const woodTray = new THREE.Mesh(
    makeRoundedBox(lengthX + 0.08, 0.24, widthZ + 0.08, 0.03),
    woodMat
  );
  woodTray.position.set(centerX, 2.94, 0);
  woodTray.castShadow = true;
  woodTray.receiveShadow = true;
  valleyGroup.add(woodTray);

  // 3. Contoured Low-Poly Valley Terrain Mesh
  const segX = 44;
  const segZ = 44;
  const terrainGeo = new THREE.PlaneGeometry(lengthX, widthZ, segX, segZ);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position;
  const colors = [];
  const cGrassLight = new THREE.Color('#6db349');
  const cGrassMid = new THREE.Color('#4f9438');
  const cGrassDark = new THREE.Color('#3b752b');
  const cDirt = new THREE.Color('#6b4c35');
  const tempCol = new THREE.Color();

  function getTerrainHeight(wx, wz) {
    const u = (wx - VALLEY_MIN_X) / lengthX; // 0 (front) .. 1 (back)
    const v = wz / VALLEY_HALF_Z; // -1 .. +1

    // Valley bowl: higher along z edges and rising toward mountains in back
    const sideRidge = Math.pow(Math.abs(v), 1.6) * 0.22;
    const frontMound = Math.exp(-Math.pow((u - 0.16) * 4.5, 2) - Math.pow((v - 0.35) * 2.2, 2)) * 0.18;
    const backSlope = Math.pow(clamp((u - 0.55) / 0.45, 0, 1), 1.5) * 0.32;
    // Flat clearing around cabin (wx ≈ 2.85, wz ≈ -0.18)
    const cabinDist2 = Math.pow(wx - 2.85, 2) + Math.pow(wz + 0.18, 2);
    const cabinFlat = Math.exp(-cabinDist2 * 3.5);

    const h = (sideRidge + frontMound + backSlope) * (1 - cabinFlat * 0.65);
    return VALLEY_BASE_Y + 0.02 + h;
  }

  for (let i = 0; i < posAttr.count; i++) {
    const lx = posAttr.getX(i);
    const lz = posAttr.getZ(i);
    const wx = centerX + lx;
    const wz = lz;
    const wy = getTerrainHeight(wx, wz);
    posAttr.setXYZ(i, wx, wy, wz);

    // Color blending: dirt clearing around cabin & path, lush green grass elsewhere
    const cabinDist = Math.hypot(wx - 2.85, wz + 0.12);
    const pathDist = Math.abs(wz + 0.15 - Math.sin((wx - 2.0) * 1.8) * 0.22);
    const dirtFactor = clamp(
      Math.max(
        1 - smoothstep(0.32, 0.72, cabinDist),
        (1 - smoothstep(0.12, 0.34, pathDist)) * (wx < 3.4 ? 0.85 : 0)
      ),
      0,
      1
    );

    const grassMix = clamp((wy - VALLEY_BASE_Y) * 2.6, 0, 1);
    tempCol.copy(cGrassLight).lerp(cGrassMid, grassMix);
    if (wx > 3.8) tempCol.lerp(cGrassDark, clamp((wx - 3.8) * 0.6, 0, 0.6));
    tempCol.lerp(cDirt, dirtFactor);
    colors.push(tempCol.r, tempCol.g, tempCol.b);
  }

  function smoothstep(a, b, x) {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const nonIndexedTerrain = terrainGeo.toNonIndexed();
  nonIndexedTerrain.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
    metalness: 0.04,
    flatShading: true,
  });
  const terrainMesh = new THREE.Mesh(nonIndexedTerrain, terrainMat);
  terrainMesh.receiveShadow = true;
  valleyGroup.add(terrainMesh);
  sliceableMeshes.push(terrainMesh);

  // 4. Cozy Wooden Cabin at Middle Focus Plane (x = 2.85 -> 54 cm, z = -0.18)
  const cabinX = LENS_FRONT_X + 2.35; // 2.85
  const cabinZ = -0.18;
  const cabinBaseY = getTerrainHeight(cabinX, cabinZ) - 0.02;

  const cabinGroup = new THREE.Group();
  cabinGroup.position.set(cabinX, cabinBaseY, cabinZ);
  cabinGroup.rotation.y = 0.18; // Slight picturesque angle toward lens
  valleyGroup.add(cabinGroup);

  const cabinW = 0.62; // along local X
  const cabinD = 0.72; // along local Z
  const wallH = 0.44;
  const roofH = 0.34;

  const timberMat = new THREE.MeshStandardMaterial({
    color: '#8e5b36',
    roughness: 0.72,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: '#3e2d23',
    roughness: 0.65,
    flatShading: true,
  });
  const windowGlowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffdf88').multiplyScalar(2.8),
  });

  // Cabin walls
  const cabinWalls = new THREE.Mesh(
    new THREE.BoxGeometry(cabinW, wallH, cabinD),
    timberMat
  );
  cabinWalls.position.y = wallH * 0.5;
  cabinWalls.castShadow = true;
  cabinWalls.receiveShadow = true;
  cabinGroup.add(cabinWalls);
  sliceableMeshes.push(cabinWalls);

  // Pitched Gable Roof (custom prism geometry so the Plane of Focus slices the exact pitched roof!)
  const rw = cabinW * 0.6;
  const rd = cabinD * 0.6;
  const ry0 = wallH - 0.02;
  const ry1 = wallH + roofH;

  const roofVertices = new Float32Array([
    // Left slope (-Z side)
    -rw, ry0, -rd,   rw, ry0, -rd,   rw, ry1, 0,
    -rw, ry0, -rd,   rw, ry1, 0,    -rw, ry1, 0,
    // Right slope (+Z side)
    -rw, ry1, 0,     rw, ry1, 0,     rw, ry0, rd,
    -rw, ry1, 0,     rw, ry0, rd,   -rw, ry0, rd,
    // Front gable (-X)
    -rw, ry0, -rd,  -rw, ry1, 0,    -rw, ry0, rd,
    // Back gable (+X)
     rw, ry0, rd,    rw, ry1, 0,     rw, ry0, -rd,
  ]);
  const roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute('position', new THREE.BufferAttribute(roofVertices, 3));
  roofGeo.computeVertexNormals();
  const cabinRoof = new THREE.Mesh(roofGeo, roofMat);
  cabinRoof.castShadow = true;
  cabinGroup.add(cabinRoof);
  sliceableMeshes.push(cabinRoof);

  // Chimney on cabin roof
  const chimney = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.28, 0.11),
    new THREE.MeshStandardMaterial({ color: '#5c4b43', roughness: 0.8 })
  );
  chimney.position.set(0.12, wallH + roofH * 0.65, -0.14);
  cabinGroup.add(chimney);
  sliceableMeshes.push(chimney);

  // Glowing Warm Cabin Windows (Front -X wall and Side +Z wall facing the viewer!)
  // Side (+Z) windows facing camera
  for (const wxOff of [-0.14, 0.14]) {
    const winSide = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.14), windowGlowMat);
    winSide.position.set(wxOff, wallH * 0.52, cabinD * 0.5 + 0.006);
    cabinGroup.add(winSide);
  }
  // Front (-X) windows facing the lens
  const winFront1 = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.14), windowGlowMat);
  winFront1.rotation.y = -Math.PI / 2;
  winFront1.position.set(-cabinW * 0.5 - 0.006, wallH * 0.52, 0.14);
  cabinGroup.add(winFront1);

  const winGable = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.11), windowGlowMat);
  winGable.rotation.y = -Math.PI / 2;
  winGable.position.set(-rw - 0.006, wallH + roofH * 0.35, 0);
  cabinGroup.add(winGable);

  // Glowing warm porch lantern dot
  const lanternBulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.032, 12, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffdf88').multiplyScalar(3.5) })
  );
  lanternBulb.position.set(-cabinW * 0.5 - 0.06, 0.14, -0.18);
  cabinGroup.add(lanternBulb);

  // Warm point light inside/around cabin for cozy illumination on nearby trees and ground
  const cabinLight = new THREE.PointLight('#ffb85c', 1.4, 2.2, 1.5);
  cabinLight.position.set(-0.2, 0.38, 0.35);
  cabinGroup.add(cabinLight);

  // 5. Pine Trees & Faceted Deciduous Trees across Foreground, Midground, and Background
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#593c28', roughness: 0.85 });
  const pineMats = [
    new THREE.MeshStandardMaterial({ color: '#2b732c', roughness: 0.72, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: '#388a34', roughness: 0.7, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: '#235e24', roughness: 0.75, flatShading: true }),
  ];

  function addPineTree(wx, wz, scale = 1.0, matIdx = 0) {
    const ty = getTerrainHeight(wx, wz) - 0.02;
    const treeGrp = new THREE.Group();
    treeGrp.position.set(wx, ty, wz);
    valleyGroup.add(treeGrp);

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035 * scale, 0.055 * scale, 0.22 * scale, 7),
      trunkMat
    );
    trunk.position.y = 0.11 * scale;
    trunk.castShadow = true;
    treeGrp.add(trunk);

    const tierConfigs = [
      [0.16 * scale, 0.26 * scale, 0.42 * scale],
      [0.42 * scale, 0.21 * scale, 0.38 * scale],
      [0.66 * scale, 0.15 * scale, 0.34 * scale],
    ];
    const pMat = pineMats[matIdx % pineMats.length];

    for (const [yStart, radius, height] of tierConfigs) {
      const coneGeo = new THREE.ConeGeometry(radius, height, 7);
      coneGeo.translate(0, height * 0.5, 0);
      const cone = new THREE.Mesh(coneGeo, pMat);
      cone.position.y = yStart;
      cone.rotation.y = (wx * 3.7 + wz * 2.1) % Math.PI;
      cone.castShadow = true;
      cone.receiveShadow = true;
      treeGrp.add(cone);
      sliceableMeshes.push(cone);
    }
  }

  // Hero Foreground Pine at D = 1.61 (37 cm -> x = 2.11, z = 0.72) + surrounding foreground cluster
  addPineTree(LENS_FRONT_X + 1.61, 0.72, 0.96, 1); // Hero Pine at 37 cm!
  addPineTree(LENS_FRONT_X + 1.38, 1.18, 0.74, 0);
  addPineTree(LENS_FRONT_X + 1.52, 1.38, 0.65, 2);
  addPineTree(LENS_FRONT_X + 1.85, 1.12, 0.82, 0);
  addPineTree(LENS_FRONT_X + 1.48, -0.92, 0.92, 1);
  addPineTree(LENS_FRONT_X + 1.72, -1.25, 1.05, 0);
  addPineTree(LENS_FRONT_X + 2.02, -0.98, 1.12, 2);

  // Midground & Background pines
  addPineTree(LENS_FRONT_X + 2.65, -1.18, 1.15, 1);
  addPineTree(LENS_FRONT_X + 2.95, 0.95, 1.08, 0);
  addPineTree(LENS_FRONT_X + 3.18, 1.28, 0.95, 2);
  addPineTree(LENS_FRONT_X + 3.32, 0.58, 0.86, 1);
  addPineTree(LENS_FRONT_X + 3.45, -0.85, 1.02, 0);

  // Faceted Deciduous Trees (icosahedral foliage crowns near the cabin)
  const bushMat1 = new THREE.MeshStandardMaterial({
    color: '#62ab37',
    roughness: 0.72,
    flatShading: true,
  });
  const bushMat2 = new THREE.MeshStandardMaterial({
    color: '#4e962d',
    roughness: 0.74,
    flatShading: true,
  });

  function addDeciduousTree(wx, wz, radius, heightOffset, mat) {
    const ty = getTerrainHeight(wx, wz) - 0.02;
    if (heightOffset > 0.15) {
      const trk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.045, heightOffset, 6),
        trunkMat
      );
      trk.position.set(wx, ty + heightOffset * 0.5, wz);
      valleyGroup.add(trk);
    }
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 1), mat);
    crown.position.set(wx, ty + heightOffset + radius * 0.65, wz);
    crown.castShadow = true;
    crown.receiveShadow = true;
    valleyGroup.add(crown);
    sliceableMeshes.push(crown);
  }

  addDeciduousTree(LENS_FRONT_X + 2.15, -0.45, 0.24, 0.16, bushMat1);
  addDeciduousTree(LENS_FRONT_X + 2.75, -0.68, 0.28, 0.22, bushMat1);
  addDeciduousTree(LENS_FRONT_X + 3.08, 0.18, 0.22, 0.08, bushMat2);
  addDeciduousTree(LENS_FRONT_X + 2.52, 0.42, 0.16, 0.04, bushMat1);

  // 6. Background Snow-Capped Mountain Peaks (around D = 3.65 -> 84 cm, x = 4.15)
  function addMountainPeak(wx, wz, baseRadius, height) {
    const baseY = VALLEY_BASE_Y + 0.05;
    const sides = 6;
    const coneGeo = new THREE.ConeGeometry(baseRadius, height, sides, 3);
    coneGeo.translate(0, height * 0.5, 0);

    // Perturb vertices slightly for organic faceted alpine crags & color snow caps
    const pos = coneGeo.attributes.position;
    const mColors = [];
    const cRock = new THREE.Color('#7c8296');
    const cSnow = new THREE.Color('#eef4fc');

    for (let i = 0; i < pos.count; i++) {
      const py = pos.getY(i);
      const fracY = py / height;
      if (fracY > 0.05 && fracY < 0.95) {
        const px = pos.getX(i);
        const pz = pos.getZ(i);
        const wobble = 1 + Math.sin(px * 7 + pz * 5) * 0.1;
        pos.setX(i, px * wobble);
        pos.setZ(i, pz * wobble);
      }
      const isSnow = fracY > 0.52 + Math.sin(pos.getZ(i) * 4) * 0.06;
      const col = isSnow ? cSnow : cRock;
      mColors.push(col.r, col.g, col.b);
    }

    coneGeo.setAttribute('color', new THREE.Float32BufferAttribute(mColors, 3));
    const nonIdx = coneGeo.toNonIndexed();
    nonIdx.computeVertexNormals();

    const mesh = new THREE.Mesh(
      nonIdx,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.68,
        metalness: 0.05,
        flatShading: true,
      })
    );
    mesh.position.set(wx, baseY, wz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    valleyGroup.add(mesh);
    sliceableMeshes.push(mesh);
  }

  // Hero Mountain Peak at D = 3.65 (84 cm -> x = 4.15, z = -0.42) + companion peaks
  addMountainPeak(LENS_FRONT_X + 3.65, -0.55, 0.95, 1.85);
  addMountainPeak(LENS_FRONT_X + 3.92, 0.35, 0.92, 1.65);
  addMountainPeak(LENS_FRONT_X + 4.18, 1.12, 0.72, 1.25);
  addMountainPeak(LENS_FRONT_X + 4.12, -1.15, 0.75, 1.42);

  // 7. Painted Sky Backdrop Screen at the Right End of the Diorama (x = 5.06)
  const skyTex = makeCanvasTexture(1024, 768, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#62a8eb');
    grad.addColorStop(0.5, '#98ccf5');
    grad.addColorStop(0.85, '#cde6fa');
    grad.addColorStop(1, '#e4f2fc');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Soft clouds
    const drawCloud = (cx, cy, cw, ch) => {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.86)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, cw, ch, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - cw * 0.45, cy + ch * 0.15, cw * 0.65, ch * 0.75, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + cw * 0.45, cy + ch * 0.12, cw * 0.7, ch * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    drawCloud(w * 0.25, h * 0.22, 120, 38);
    drawCloud(w * 0.72, h * 0.18, 145, 44);
    drawCloud(w * 0.52, h * 0.42, 110, 32);
    drawCloud(w * 0.84, h * 0.48, 95, 28);
  });

  const skyFrame = new THREE.Mesh(
    makeRoundedBox(0.09, 2.85, widthZ + 0.06, 0.02),
    MATS.anodizedBlack
  );
  skyFrame.position.set(VALLEY_MAX_X + 0.02, 4.35, 0);
  skyFrame.castShadow = true;
  valleyGroup.add(skyFrame);

  const skyScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(widthZ - 0.04, 2.75),
    new THREE.MeshBasicMaterial({ map: skyTex })
  );
  skyScreen.rotation.y = -Math.PI / 2;
  skyScreen.position.set(VALLEY_MAX_X - 0.028, 4.35, 0);
  valleyGroup.add(skyScreen);

  // 8. The Glowing Plane of Focus Sheet (sweeps along X through the valley!)
  const focusPlaneGroup = new THREE.Group();
  focusPlaneGroup.position.set(LENS_FRONT_X + 2.35, 3.92, 0);
  valleyGroup.add(focusPlaneGroup);

  const sheetW = widthZ + 0.08; // along Z
  const sheetH = 1.72; // along Y

  const gridTex = makeCanvasTexture(1024, 700, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(127, 227, 255, 0.06)';
    ctx.fillRect(0, 0, w, h);

    // Interior grid lines
    const cols = 10;
    const rows = 7;
    ctx.strokeStyle = 'rgba(170, 238, 255, 0.34)';
    ctx.lineWidth = 2;
    for (let c = 1; c < cols; c++) {
      const gx = (c / cols) * w;
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
    }
    for (let r = 1; r < rows; r++) {
      const gy = (r / rows) * h;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
    }

    // Bright glowing border
    ctx.strokeStyle = 'rgba(215, 248, 255, 0.95)';
    ctx.shadowColor = '#7fe3ff';
    ctx.shadowBlur = 14;
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, w - 6, h - 6);
  });

  const focusSheetMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(sheetW, sheetH),
    new THREE.MeshBasicMaterial({
      map: gridTex,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  focusSheetMesh.rotation.y = Math.PI / 2;
  focusSheetMesh.userData = { interactiveType: 'focus-plane' };
  focusPlaneGroup.add(focusSheetMesh);
  interactiveMeshes.push(focusSheetMesh);

  // 9. Real-Time 3D Cross-Section Intersection Contour Line (where the Plane of Focus cuts the valley!)
  // Extract world-space triangles from all sliceable meshes once after matrix updates
  valleyGroup.updateMatrixWorld(true);
  const worldTriangles = [];
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();

  for (const mesh of sliceableMeshes) {
    mesh.updateMatrixWorld(true);
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const idx = geo.index;
    const count = idx ? idx.count : pos.count;

    for (let i = 0; i < count; i += 3) {
      const i0 = idx ? idx.getX(i) : i;
      const i1 = idx ? idx.getX(i + 1) : i + 1;
      const i2 = idx ? idx.getX(i + 2) : i + 2;

      vA.fromBufferAttribute(pos, i0).applyMatrix4(mesh.matrixWorld);
      vB.fromBufferAttribute(pos, i1).applyMatrix4(mesh.matrixWorld);
      vC.fromBufferAttribute(pos, i2).applyMatrix4(mesh.matrixWorld);

      const minX = Math.min(vA.x, vB.x, vC.x);
      const maxX = Math.max(vA.x, vB.x, vC.x);
      worldTriangles.push({
        ax: vA.x, ay: vA.y, az: vA.z,
        bx: vB.x, by: vB.y, bz: vB.z,
        cx: vC.x, cy: vC.y, cz: vC.z,
        minX,
        maxX,
      });
    }
  }

  // Pre-allocate dynamic BufferGeometry for the glowing intersection contour segments
  const maxSegments = 1600;
  const contourPositions = new Float32Array(maxSegments * 6);
  const contourGeo = new THREE.BufferGeometry();
  contourGeo.setAttribute('position', new THREE.BufferAttribute(contourPositions, 3));

  // Core white-cyan laser line + slightly offset glow lines for thick luminous appearance
  const contourGroup = new THREE.Group();
  valleyGroup.add(contourGroup);

  const offsets = [
    [0, 0, 0, '#ffffff', 2.5, 1.0],
    [0.008, 0.008, 0, '#8ceeff', 2.0, 0.85],
    [-0.008, 0.014, 0, '#7fe3ff', 1.8, 0.75],
    [0, -0.008, 0.008, '#7fe3ff', 1.6, 0.7],
  ];
  for (const [ox, oy, oz, col, mult, op] of offsets) {
    const lines = new THREE.LineSegments(
      contourGeo,
      new THREE.LineBasicMaterial({
        color: new THREE.Color(col).multiplyScalar(mult),
        transparent: true,
        opacity: op,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    lines.position.set(ox, oy, oz);
    contourGroup.add(lines);
  }

  function updateIntersectionContour(planeX) {
    let segCount = 0;
    const pts = [];

    for (let i = 0; i < worldTriangles.length; i++) {
      const tri = worldTriangles[i];
      if (planeX < tri.minX || planeX > tri.maxX) continue;

      pts.length = 0;
      // Check 3 edges against X = planeX
      const edges = [
        [tri.ax, tri.ay, tri.az, tri.bx, tri.by, tri.bz],
        [tri.bx, tri.by, tri.bz, tri.cx, tri.cy, tri.cz],
        [tri.cx, tri.cy, tri.cz, tri.ax, tri.ay, tri.az],
      ];

      for (let e = 0; e < 3; e++) {
        const [x1, y1, z1, x2, y2, z2] = edges[e];
        if ((x1 <= planeX && x2 >= planeX) || (x2 <= planeX && x1 >= planeX)) {
          const dx = x2 - x1;
          if (Math.abs(dx) > 1e-6) {
            const t = (planeX - x1) / dx;
            if (t >= 0 && t <= 1) {
              pts.push(y1 + (y2 - y1) * t, z1 + (z2 - z1) * t);
            }
          }
        }
      }

      if (pts.length >= 4 && segCount < maxSegments) {
        const base = segCount * 6;
        contourPositions[base] = planeX;
        contourPositions[base + 1] = pts[0];
        contourPositions[base + 2] = pts[1];
        contourPositions[base + 3] = planeX;
        contourPositions[base + 4] = pts[2];
        contourPositions[base + 5] = pts[3];
        segCount++;
      }
    }

    contourGeo.setDrawRange(0, segCount * 2);
    contourGeo.attributes.position.needsUpdate = true;
  }

  // 10. Sharp Zone (Depth of Field) Glowing Slab & Front Bracket
  const sharpZoneGroup = new THREE.Group();
  valleyGroup.add(sharpZoneGroup);

  // Translucent cyan floor slab along the front edge of the wooden base
  const sharpSlabMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#7fe3ff').multiplyScalar(1.4),
    transparent: true,
    opacity: 0.26,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const sharpSlabMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.28, widthZ + 0.14),
    sharpSlabMat
  );
  sharpSlabMesh.position.set(centerX, 2.94, 0);
  sharpZoneGroup.add(sharpSlabMesh);

  // Bright vertical end-ticks on the front face of the wooden tray showing near & far DoF bounds
  const boundTickMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#b8f4ff').multiplyScalar(2.0),
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
  });
  const nearTick = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.34, 0.04), boundTickMat);
  const farTick = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.34, 0.04), boundTickMat);
  const spanBar = new THREE.Mesh(new THREE.BoxGeometry(1, 0.028, 0.04), boundTickMat);
  nearTick.position.set(centerX, 2.92, VALLEY_HALF_Z + 0.08);
  farTick.position.set(centerX, 2.92, VALLEY_HALF_Z + 0.08);
  spanBar.position.set(centerX, 2.78, VALLEY_HALF_Z + 0.08);
  sharpZoneGroup.add(nearTick, farTick, spanBar);

  // Center bright vertical line on front of wooden tray at exact Plane of Focus
  const centerFocusLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.032, 0.56, 0.05),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffffff').multiplyScalar(2.4),
    })
  );
  centerFocusLine.position.set(centerX, 2.86, VALLEY_HALF_Z + 0.085);
  valleyGroup.add(centerFocusLine);

  function update(focusD, apertureN) {
    const planeX = LENS_FRONT_X + focusD;
    const clampedPlaneX = clamp(planeX, VALLEY_MIN_X - 0.15, VALLEY_MAX_X + 0.05);

    // 1. Move the glowing Plane of Focus sheet
    focusPlaneGroup.position.x = clampedPlaneX;
    centerFocusLine.position.x = clampedPlaneX;

    // 2. Update the real-time 3D cross-section intersection contour line
    updateIntersectionContour(clampedPlaneX);

    // 3. Update the Sharp Zone (DoF) slab & front bracket
    const [nearD, farD] = computeDofBounds(focusD, apertureN);
    const nearX = clamp(LENS_FRONT_X + nearD, VALLEY_MIN_X - 0.15, VALLEY_MAX_X + 0.05);
    const farX = clamp(LENS_FRONT_X + farD, VALLEY_MIN_X - 0.15, VALLEY_MAX_X + 0.05);
    const zoneW = Math.max(0.03, farX - nearX);
    const zoneCenterX = (nearX + farX) * 0.5;

    sharpSlabMesh.scale.x = zoneW;
    sharpSlabMesh.position.x = zoneCenterX;

    nearTick.position.x = nearX;
    farTick.position.x = farX;
    spanBar.scale.x = zoneW;
    spanBar.position.x = zoneCenterX;
  }

  // Initial update
  update(2.35, 2);

  return {
    group: valleyGroup,
    focusPlaneGroup,
    interactiveMeshes,
    getPlaneX: (focusD) => clamp(LENS_FRONT_X + focusD, VALLEY_MIN_X - 0.15, VALLEY_MAX_X + 0.05),
    update,
  };
}

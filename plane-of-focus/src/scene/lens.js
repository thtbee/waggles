import * as THREE from 'three';
import {
  MATS,
  makeCanvasTexture,
  makeRoundedBox,
  makeOpticalLathe,
  createLensElementGeometry,
  createGearGeometry,
  createRibbedBarrelGeometry,
  createOpticalGlassMaterial,
  createGlassRimGlowMaterial,
  createIrisMaterial,
} from '../materials.js';
import {
  OPTICAL_AXIS_Y,
  distToSlider,
} from '../optics.js';

export function buildCutawayLens(scene) {
  const lensRoot = new THREE.Group();
  lensRoot.name = 'CutawayLens';
  lensRoot.position.set(0, OPTICAL_AXIS_Y, 0);
  scene.add(lensRoot);

  const interactiveMeshes = [];

  // Multi-coated optical glass materials (crystal-clear centers + distinct AR coating shifts)
  const glassRearBiconvex = createOpticalGlassMaterial('#9be8ff', 1.05, 0.75, 0.15);
  const glassRearMeniscus = createOpticalGlassMaterial('#8ee4ff', 1.15, 0.77, 0.55);
  const glassFocusLarge = createOpticalGlassMaterial('#80e5ff', 1.22, 0.78, 0.25);
  const glassFocusDoublet = createOpticalGlassMaterial('#9ef0ff', 1.28, 0.64, 0.75);
  const glassFrontCollector = createOpticalGlassMaterial('#8ae6ff', 1.25, 0.815, 0.35);

  const rimGlowCyan = createGlassRimGlowMaterial('#88e8ff', 1.05);
  const rimGlowBright = createGlassRimGlowMaterial('#aef4ff', 1.25);
  const rimGlowSoft = createGlassRimGlowMaterial('#9be8ff', 0.85);

  // Helper to add a realistic frosted ground-glass cylindrical outer edge band around a lens element
  function addGlassRim(parent, xStart, xEnd, radius, mat = rimGlowCyan) {
    const width = Math.max(0.01, xEnd - xStart);
    const cylGeo = new THREE.CylinderGeometry(radius, radius, width, 96, 1, true);
    cylGeo.rotateZ(Math.PI / 2);
    const cyl = new THREE.Mesh(cylGeo, mat);
    cyl.position.x = (xStart + xEnd) * 0.5;
    parent.add(cyl);
    return cyl;
  }

  // Helper to add a razor-sharp glowing optical chamfer ring at the perimeter of a glass face
  function addOpticalBevelRing(parent, xPos, radius, tubeR = 0.0085, color = '#e4faff', opacity = 0.82) {
    const torusGeo = new THREE.TorusGeometry(radius, tubeR, 12, 96);
    torusGeo.rotateY(Math.PI / 2);
    const torusMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(torusGeo, torusMat);
    ring.position.x = xPos;
    parent.add(ring);
    return ring;
  }

  // Helper to create a CNC-machined cylindrical ring / barrel segment along X axis with crisp chamfered normals
  // (Prevents Gouraud normal averaging from turning flat cylinders into puffy donuts!)
  function makeRingTube(xStart, xEnd, innerR, outerR, mat, phiStart = 0, phiLength = Math.PI * 2) {
    const radialSegments = 72;
    const ch = Math.min(0.01, (xEnd - xStart) * 0.16, (outerR - innerR) * 0.22);
    const invSqrt2 = 0.70710678;

    // Each segment is [x1, r1, x2, r2, nx, nr] with hard vertex breaks between faces
    const faces = [
      // Left vertical wall
      [xStart, innerR, xStart, outerR - ch, -1, 0],
      // Left outer 45-deg chamfer
      [xStart, outerR - ch, xStart + ch, outerR, -invSqrt2, invSqrt2],
      // Outer cylindrical wall (pure radial normal!)
      [xStart + ch, outerR, xEnd - ch, outerR, 0, 1],
      // Right outer 45-deg chamfer
      [xEnd - ch, outerR, xEnd, outerR - ch, invSqrt2, invSqrt2],
      // Right vertical wall
      [xEnd, outerR - ch, xEnd, innerR, 1, 0],
      // Inner cylindrical bore (pure inward radial normal!)
      [xEnd, innerR, xStart, innerR, 0, -1],
    ];

    const positions = [];
    const normals = [];
    const indices = [];

    for (const [x1, r1, x2, r2, nx, nr] of faces) {
      const base = positions.length / 3;
      for (let row = 0; row < 2; row++) {
        const x = row === 0 ? x1 : x2;
        const r = row === 0 ? r1 : r2;
        for (let s = 0; s <= radialSegments; s++) {
          const phi = phiStart + (s / radialSegments) * phiLength;
          const sinP = Math.sin(phi);
          const cosP = Math.cos(phi);
          positions.push(x, -sinP * r, cosP * r);
          normals.push(nx, -sinP * nr, cosP * nr);
        }
      }
      const stride = radialSegments + 1;
      for (let s = 0; s < radialSegments; s++) {
        const a = base + s;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setIndex(indices);
    return new THREE.Mesh(geo, mat);
  }

  // 1. Mounting Pedestals on the Optical Rail (extending down from optical axis y=3.55 to rail y=2.25)
  const pedestalsGroup = new THREE.Group();
  lensRoot.add(pedestalsGroup);

  // Rear Pedestal (x = -2.12) with Brushed Brass Nameplate Plaque
  const rearPedestal = new THREE.Mesh(
    makeRoundedBox(0.56, 0.42, 0.56, 0.03),
    MATS.anodizedBlack
  );
  rearPedestal.position.set(-2.12, -1.08, 0);
  rearPedestal.castShadow = true;
  pedestalsGroup.add(rearPedestal);

  const rearFoot = new THREE.Mesh(
    makeRoundedBox(0.68, 0.1, 0.68, 0.02),
    MATS.consoleDark
  );
  rearFoot.position.set(-2.12, -1.28, 0);
  pedestalsGroup.add(rearFoot);

  // Brushed Brass Nameplate Plaque on front of rear pedestal
  const plaqueTex = makeCanvasTexture(512, 192, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#e0ac58');
    grad.addColorStop(0.5, '#c7903d');
    grad.addColorStop(1, '#9e6e26');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#6b4714';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, w - 16, h - 16);

    ctx.fillStyle = '#241706';
    ctx.font = '800 50px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('OPTICAL LAB', w / 2, 86);

    ctx.font = '500 34px "DM Mono", monospace';
    ctx.fillText('F = 50MM · 1:2', w / 2, 144);
  });

  const plaqueMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.48, 0.18),
    new THREE.MeshStandardMaterial({
      map: plaqueTex,
      metalness: 0.85,
      roughness: 0.28,
    })
  );
  plaqueMesh.position.set(-2.12, -1.1, 0.285);
  pedestalsGroup.add(plaqueMesh);

  // Front Pedestal (x = -0.92) under the main gear housing
  const frontPedestal = new THREE.Mesh(
    makeRoundedBox(0.46, 0.36, 0.56, 0.03),
    MATS.anodizedBlack
  );
  frontPedestal.position.set(-0.92, -1.12, 0);
  frontPedestal.castShadow = true;
  pedestalsGroup.add(frontPedestal);

  const frontFoot = new THREE.Mesh(
    makeRoundedBox(0.58, 0.1, 0.68, 0.02),
    MATS.consoleDark
  );
  frontFoot.position.set(-0.92, -1.28, 0);
  pedestalsGroup.add(frontFoot);

  // 2. Rear Mount & Rear Brass Spur Gear (x = -2.75 .. -2.42)
  const rearBayonet = makeRingTube(-2.76, -2.56, 0.58, 0.74, MATS.anodizedBlack);
  lensRoot.add(rearBayonet);

  const rearBrassGear = new THREE.Mesh(
    createGearGeometry(0.86, 1.0, 0.038, 56, 0.1),
    MATS.brushedBrass
  );
  rearBrassGear.position.x = -2.52;
  rearBrassGear.castShadow = true;
  lensRoot.add(rearBrassGear);

  const rearFlange = makeRingTube(-2.5, -2.38, 0.76, 0.96, MATS.anodizedBlack);
  lensRoot.add(rearFlange);

  // 3. Cutaway Structural Housing (Back Half-Cylinder + Top/Bottom Rails + Brass End Caps)
  // Note: in makeOpticalLathe, newY = -r*sin(phi), newZ = r*cos(phi).
  // phi = 0 is Front (+Z), phi = PI is Back (-Z), phi = PI/2 is Bottom (-Y), phi = 3*PI/2 is Top (+Y).
  // So the back wall (-Z) spans phi from PI*0.62 to PI*1.38!
  const backCutawayWall = makeRingTube(
    -2.42,
    -0.96,
    0.88,
    0.95,
    MATS.anodizedBlack,
    Math.PI * 0.62,
    Math.PI * 0.76
  );
  lensRoot.add(backCutawayWall);

  // Top and bottom longitudinal bridge rails + 4 Brushed Brass End-Caps (store caps for clamping animation)
  const brassEndCaps = [];
  for (const signY of [1, -1]) {
    const railBar = new THREE.Mesh(
      makeRoundedBox(1.52, 0.1, 0.24, 0.02),
      MATS.anodizedBlack
    );
    railBar.position.set(-1.68, signY * 0.92, 0);
    lensRoot.add(railBar);

    // Rear Brass End-Cap (x = -2.32)
    const rearCap = new THREE.Mesh(
      makeRoundedBox(0.28, 0.16, 0.3, 0.03),
      MATS.brushedBrass
    );
    rearCap.position.set(-2.32, signY * 0.95, 0);
    rearCap.castShadow = true;
    lensRoot.add(rearCap);
    brassEndCaps.push({ mesh: rearCap, baseY: signY * 0.95, signY });

    // Front Brass End-Cap (x = -1.04)
    const frontCap = new THREE.Mesh(
      makeRoundedBox(0.28, 0.18, 0.32, 0.03),
      MATS.brushedBrass
    );
    frontCap.position.set(-1.04, signY * 0.96, 0);
    frontCap.castShadow = true;
    lensRoot.add(frontCap);
    brassEndCaps.push({ mesh: frontCap, baseY: signY * 0.96, signY });
  }

  // Animated Multi-Stage Outer Barrel Mechanism for "Assembled" vs "Exploded" toggle
  // Stage 1: Upper & Lower curved anodized clamshell doors with brushed-brass mating lips swing shut around X axis
  const upperDoorGroup = new THREE.Group();
  lensRoot.add(upperDoorGroup);

  // Upper door spans from top rail (phi = PI*1.38) down to front horizontal midline (phi = PI*2.0)
  const upperDoorShell = makeRingTube(
    -2.42,
    -0.94,
    0.89,
    0.965,
    MATS.anodizedBlack,
    Math.PI * 1.36,
    Math.PI * 0.64
  );
  upperDoorShell.castShadow = true;
  upperDoorGroup.add(upperDoorShell);

  // Brushed brass mating lip along the front horizontal edge of the upper door (phi near 2*PI)
  const upperDoorBrassLip = makeRingTube(
    -2.40,
    -0.95,
    0.892,
    0.972,
    MATS.brushedBrass,
    Math.PI * 1.975,
    Math.PI * 0.025
  );
  upperDoorGroup.add(upperDoorBrassLip);

  const lowerDoorGroup = new THREE.Group();
  lensRoot.add(lowerDoorGroup);

  // Lower door spans from front horizontal midline (phi = 0) down to bottom rail (phi = PI*0.64)
  const lowerDoorShell = makeRingTube(
    -2.42,
    -0.94,
    0.89,
    0.965,
    MATS.anodizedBlack,
    0,
    Math.PI * 0.64
  );
  lowerDoorShell.castShadow = true;
  lowerDoorGroup.add(lowerDoorShell);

  // Brushed brass mating lip along the front horizontal edge of the lower door (phi near 0)
  const lowerDoorBrassLip = makeRingTube(
    -2.40,
    -0.95,
    0.892,
    0.972,
    MATS.brushedBrass,
    0,
    Math.PI * 0.025
  );
  lowerDoorGroup.add(lowerDoorBrassLip);

  // Stage 2: Axial Sliding Locking Collar with engraved DOF / Distance Scale window
  const lockingSleeveGroup = new THREE.Group();
  lensRoot.add(lockingSleeveGroup);

  const lockingCollarRing = makeRingTube(
    -1.74,
    -0.94,
    0.962,
    1.005,
    MATS.anodizedBlack,
    -Math.PI * 0.56,
    Math.PI * 1.12
  );
  lockingCollarRing.castShadow = true;
  lockingSleeveGroup.add(lockingCollarRing);

  const lockingBrassTrim = makeRingTube(
    -1.75,
    -1.71,
    0.964,
    1.012,
    MATS.brushedBrass,
    -Math.PI * 0.56,
    Math.PI * 1.12
  );
  lockingSleeveGroup.add(lockingBrassTrim);

  // Engraved distance / DOF scale plate on the front face of the locking sleeve
  const scalePlateTex = makeCanvasTexture(512, 160, (ctx, w, h) => {
    ctx.fillStyle = '#14161a';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, w - 8, h - 8);

    ctx.fillStyle = '#9aa0ac';
    ctx.font = '500 22px "DM Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('16   8   4  |  4   8   16', w / 2, 42);

    ctx.strokeStyle = '#d49b4b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(40, 62);
    ctx.lineTo(w - 40, 62);
    ctx.stroke();

    ctx.fillStyle = '#f0f3f8';
    ctx.font = '600 26px "DM Mono", monospace';
    ctx.fillText('0.35   0.5   0.8   1.5   3   ∞', w / 2, 106);

    ctx.fillStyle = '#d49b4b';
    ctx.font = '500 19px "DM Mono", monospace';
    ctx.fillText('M · DOF SCALE · 50MM', w / 2, 140);
  });

  const scalePlateMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.66, 0.22),
    new THREE.MeshStandardMaterial({
      map: scalePlateTex,
      roughness: 0.35,
      metalness: 0.4,
    })
  );
  scalePlateMesh.position.set(-1.34, 0.0, 1.012);
  lockingSleeveGroup.add(scalePlateMesh);

  // 4. Rear Optical Glass Group
  const rearGroup = new THREE.Group();
  lensRoot.add(rearGroup);

  // Element 1: Rear Biconvex Collector seated inside dark anodized barrel cell on the left
  // Rim [-2.36, -2.20] is tucked inside el1Holder [-2.40, -2.20]; convex right dome (R2 = 1.65) bulges smoothly right!
  const el1Geo = createLensElementGeometry(0.75, 0.16, 2.8, 1.65);
  const el1Mesh = new THREE.Mesh(el1Geo, glassRearBiconvex);
  el1Mesh.position.x = -2.28;
  rearGroup.add(el1Mesh);

  // Full 360-deg dark anodized cell wrapping the rim of Element 1 (innerR = 0.755 > 0.75 -> zero Z-fighting!)
  const el1Holder = makeRingTube(-2.40, -2.20, 0.755, 0.865, MATS.anodizedBlack);
  rearGroup.add(el1Holder);

  // Element 2: Rear Positive Meniscus Element with exposed frosted ice-cyan ground rim on the right
  // Rim spans [-1.96, -1.78]: left half [-1.96, -1.88] sits inside el2Holder, right half [-1.88, -1.78] is exposed glass!
  const el2Geo = createLensElementGeometry(0.77, 0.18, 2.15, 3.2);
  const el2Mesh = new THREE.Mesh(el2Geo, glassRearMeniscus);
  el2Mesh.position.x = -1.87;
  rearGroup.add(el2Mesh);

  // Dark anodized support ring on the left half of Element 2 (innerR = 0.775 > 0.77)
  const el2Holder = makeRingTube(-1.97, -1.88, 0.775, 0.87, MATS.anodizedBlack);
  rearGroup.add(el2Holder);

  // 5. Central Brass Iris Ring & 7-Blade Polygon Aperture (x = -1.58)
  const irisX = -1.58;
  const irisGroup = new THREE.Group();
  irisGroup.position.x = irisX;
  lensRoot.add(irisGroup);

  // Golden brass housing ring for the iris
  const irisBrassRing = makeRingTube(-0.055, 0.055, 0.78, 0.875, MATS.brushedBrass);
  irisGroup.add(irisBrassRing);

  // 7-blade aperture disc inside the brass ring
  const lensIrisMat = createIrisMaterial('#1e222a');
  const lensIrisMesh = new THREE.Mesh(new THREE.CircleGeometry(0.79, 64), lensIrisMat);
  lensIrisMesh.rotation.y = Math.PI / 2;
  lensIrisMesh.userData = {
    interactiveType: 'lens-iris',
  };
  irisGroup.add(lensIrisMesh);
  interactiveMeshes.push(lensIrisMesh);

  // 6. Movable Internal Focus Group (slides along X as focus changes!)
  const focusGroup = new THREE.Group();
  focusGroup.position.x = -1.14;
  lensRoot.add(focusGroup);

  // Element 3: Large positive element whose rim [-0.19, -0.02] sits inside el3Cell [-0.20, -0.01]
  // while its strongly convex left face (R1 = 1.48) bulges smoothly out toward the brass iris!
  const el3Geo = createLensElementGeometry(0.78, 0.17, 1.48, -2.8);
  const el3Mesh = new THREE.Mesh(el3Geo, glassFocusLarge);
  el3Mesh.position.x = -0.105;
  focusGroup.add(el3Mesh);

  // Dark anodized carrier barrel around Element 3 (innerR = 0.785 > 0.78)
  const el3Cell = makeRingTube(-0.20, -0.01, 0.785, 0.875, MATS.anodizedBlack);
  focusGroup.add(el3Cell);

  // Element 4: Stepped smaller-diameter cemented optical doublet ahead of Element 3 (matches frame_10 & frame_12!)
  // Rim spans [-0.01, +0.15] at stepped radius 0.64, with convex front dome (R2 = 1.65)
  const el4Geo = createLensElementGeometry(0.64, 0.16, 2.8, 1.65);
  const el4Mesh = new THREE.Mesh(el4Geo, glassFocusDoublet);
  el4Mesh.position.x = 0.07;
  focusGroup.add(el4Mesh);

  // Small top & bottom machined gunmetal retaining lugs on Element 4 (visible in frame_10 & frame_12)
  for (const signY of [1, -1]) {
    const lug = new THREE.Mesh(
      makeRoundedBox(0.075, 0.055, 0.055, 0.014),
      MATS.gunmetal
    );
    lug.position.set(0.12, signY * 0.655, 0);
    focusGroup.add(lug);
  }

  // Top helicoid follower lug on Focus Group
  const followerLug = new THREE.Mesh(
    makeRoundedBox(0.14, 0.12, 0.12, 0.02),
    MATS.gunmetal
  );
  followerLug.position.set(-0.1, 0.88, 0);
  focusGroup.add(followerLug);

  // 7. Main Brass Spur Gear Ring & Upper Helicoid Pinion Gear (x = -0.82)
  const mainGearX = -0.82;
  const mainBrassGear = new THREE.Mesh(
    createGearGeometry(0.87, 1.01, 0.052, 60, 0.18),
    MATS.brushedBrass
  );
  mainBrassGear.position.x = mainGearX;
  mainBrassGear.castShadow = true;
  mainBrassGear.userData = { interactiveType: 'focus-ring' };
  lensRoot.add(mainBrassGear);
  interactiveMeshes.push(mainBrassGear);

  // Solid brass chamfered shoulder collar on the main gear
  const mainGearCollar = makeRingTube(mainGearX - 0.11, mainGearX + 0.1, 0.87, 0.99, MATS.brushedBrass);
  lensRoot.add(mainGearCollar);

  // Upper Helicoid Pinion Gear assembly above the main brass gear (matches frame_10 & frame_12!)
  const helicoidGroup = new THREE.Group();
  helicoidGroup.position.set(mainGearX - 0.04, 1.26, 0);
  lensRoot.add(helicoidGroup);

  const pinionGear = new THREE.Mesh(
    createGearGeometry(0.045, 0.185, 0.052, 14, 0.24),
    MATS.brushedBrass
  );
  pinionGear.castShadow = true;
  pinionGear.userData = { interactiveType: 'focus-ring' };
  helicoidGroup.add(pinionGear);
  interactiveMeshes.push(pinionGear);

  // Pinion horizontal brushed-steel axle shaft protruding cleanly on both sides
  const pinionShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.036, 0.036, 0.48, 24),
    MATS.brushedSteel
  );
  pinionShaft.rotation.z = Math.PI / 2;
  helicoidGroup.add(pinionShaft);

  // Angled brushed-brass mounting bracket on the left (-X) side of the helicoid axle (matches frame_10!)
  const pinionBracket = new THREE.Mesh(
    makeRoundedBox(0.065, 0.24, 0.09, 0.018),
    MATS.brushedBrass
  );
  pinionBracket.position.set(-0.17, 0.02, 0.04);
  pinionBracket.rotation.z = 0.22;
  helicoidGroup.add(pinionBracket);

  // 8. Wide Black Ribbed / Knurled Focus Ring Barrel (x = -0.72 .. 0.04)
  const focusRingGroup = new THREE.Group();
  lensRoot.add(focusRingGroup);

  const focusRingBarrel = new THREE.Mesh(
    createRibbedBarrelGeometry(-0.72, 0.04, 0.88, 1.04, 58, 0.052),
    MATS.matteRubber
  );
  focusRingBarrel.castShadow = true;
  focusRingBarrel.receiveShadow = true;
  focusRingBarrel.userData = { interactiveType: 'focus-ring' };
  focusRingGroup.add(focusRingBarrel);
  interactiveMeshes.push(focusRingBarrel);

  // Invisible slightly larger cylinder around focus ring for effortless dragging
  const focusRingHitMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(1.12, 1.12, 0.92, 24),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  focusRingHitMesh.rotation.z = Math.PI / 2;
  focusRingHitMesh.position.x = -0.34;
  focusRingHitMesh.userData = { interactiveType: 'focus-ring' };
  lensRoot.add(focusRingHitMesh);
  interactiveMeshes.push(focusRingHitMesh);

  // 9. Telescoping Front Barrel Nose & Front Collector Glass Element (slides forward/backward with focus!)
  const frontBarrelGroup = new THREE.Group();
  lensRoot.add(frontBarrelGroup);

  // Inner telescoping sleeve that slides inside the ribbed focus ring barrel so there is never a gap
  const innerTelescopingTube = makeRingTube(-0.22, 0.05, 0.78, 0.875, MATS.anodizedBlack);
  frontBarrelGroup.add(innerTelescopingTube);

  // Step 1: Chamfered anodized shoulder ring (x = 0.04 .. 0.17) with flat CNC walls
  const frontShoulder = makeRingTube(0.04, 0.17, 0.78, 0.935, MATS.anodizedBlack);
  frontShoulder.castShadow = true;
  frontBarrelGroup.add(frontShoulder);

  // Glowing white focus index line on the front shoulder bevel (matches frame_10!)
  const indexMark = new THREE.Mesh(
    makeRoundedBox(0.032, 0.105, 0.02, 0.006),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(1.65) })
  );
  indexMark.position.set(0.115, -0.05, 0.938);
  frontBarrelGroup.add(indexMark);

  // Step 2: Sleek straight cylindrical front nose barrel (x = 0.17 .. 0.37)
  const frontNoseBarrel = makeRingTube(0.17, 0.37, 0.76, 0.855, MATS.anodizedBlack);
  frontNoseBarrel.castShadow = true;
  frontBarrelGroup.add(frontNoseBarrel);

  // Dark inner lens seating ring inside the front collector element (x = 0.36 .. 0.47, r = 0.70 .. 0.765)
  // Visible through the crystal-clear curved front glass element just like in frame_10 & frame_12!
  const frontInnerSeat = makeRingTube(0.36, 0.47, 0.70, 0.765, MATS.anodizedBlack);
  frontBarrelGroup.add(frontInnerSeat);

  // Large curved Front Collector Glass Element (centered at x = 0.41 inside frontBarrelGroup):
  // Rim [0.365, 0.455] at radius 0.815 wraps cleanly over frontInnerSeat (0.765) and meets frontNoseBarrel,
  // while its convex front dome (R2 = 1.35) bulges smoothly forward!
  const frontGlassGeo = createLensElementGeometry(0.815, 0.09, 2.8, 1.35);
  const frontGlassMesh = new THREE.Mesh(frontGlassGeo, glassFrontCollector);
  frontGlassMesh.position.x = 0.41;
  frontBarrelGroup.add(frontGlassMesh);

  // Animation state
  let currentExploded = 1.0; // 1 = Exploded (open cutaway), 0 = Assembled (closed barrel)
  let irisGlowPulse = 0;
  let prevAperture = 2;

  function update(focusD, apertureN, isExploded, dt = 0.016) {
    const sliderT = distToSlider(focusD);

    // 1. Slide both the internal Focus Group AND the Front Barrel Nose forward for close focus, backward for far focus!
    // Closer subjects require greater lens extension; far subjects retract the helicoid groups inward.
    const targetFocusGroupX = -0.92 - sliderT * 0.40;
    focusGroup.position.x += (targetFocusGroupX - focusGroup.position.x) * 0.28;

    const targetFrontBarrelX = (0.5 - sliderT) * 0.22; // +0.11 at Near (37cm), 0.0 at Mid (54cm), -0.11 at Far (84cm)
    frontBarrelGroup.position.x += (targetFrontBarrelX - frontBarrelGroup.position.x) * 0.28;

    // 2. Rotate the Ribbed Focus Ring, Main Brass Gear, Rear Gear, and Upper Helicoid Pinion
    const ringAngle = (sliderT - 0.5) * Math.PI * 1.45;
    focusRingGroup.rotation.x = ringAngle;
    mainBrassGear.rotation.x = ringAngle;
    rearBrassGear.rotation.x = ringAngle * 0.6;
    pinionGear.rotation.x = -ringAngle * (64 / 16);

    // 3. Update 7-blade Iris opening & warm golden glow pulse
    if (Math.abs(apertureN - prevAperture) > 0.01) {
      irisGlowPulse = 1.0;
      prevAperture = apertureN;
    }
    irisGlowPulse = Math.max(0, irisGlowPulse - dt * 2.2);

    const apNorm = Math.pow(2 / apertureN, 0.82); // 1 at f/2, ~0.18 at f/16
    const openRadius = 0.13 + apNorm * 0.64;
    lensIrisMat.userData.uniforms.uAp.value = openRadius;
    lensIrisMat.userData.uniforms.uRot.value = (1 - apNorm) * 0.62;
    lensIrisMat.userData.uniforms.uGlow.value = irisGlowPulse;

    // 4. Animate Multi-Stage Mechanical Closing Sequence (Assembled = 0, Exploded = 1)
    const targetExploded = isExploded ? 1.0 : 0.0;
    const step = Math.min(1, dt * 8.5);
    currentExploded += (targetExploded - currentExploded) * step;

    // Stage A: Twin upper & lower anodized clamshell doors swing from back wall to meet at horizontal seam
    const doorOpenT = Math.min(1, currentExploded * 1.22);
    const doorEase = doorOpenT * doorOpenT * (3 - 2 * doorOpenT);
    upperDoorGroup.rotation.x = -doorEase * Math.PI * 0.74;
    lowerDoorGroup.rotation.x = doorEase * Math.PI * 0.74;
    upperDoorGroup.visible = currentExploded < 0.985;
    lowerDoorGroup.visible = currentExploded < 0.985;

    // Stage B: Axial distance-scale locking collar slides out from focus barrel to lock over the closed seam
    const sleeveT = Math.max(0, Math.min(1, (currentExploded - 0.08) / 0.78));
    const sleeveEase = sleeveT * sleeveT * (3 - 2 * sleeveT);
    lockingSleeveGroup.position.x = sleeveEase * 0.56;
    const radialTuck = 1.0 - sleeveEase * 0.08;
    lockingSleeveGroup.scale.set(1, radialTuck, radialTuck);
    lockingSleeveGroup.visible = currentExploded < 0.94;

    // Stage C: Helicoid pinion assembly & 4 brass end-caps cinch inward when Assembled
    helicoidGroup.position.y = 1.13 + currentExploded * 0.13;
    const clampOffset = (1.0 - currentExploded) * 0.032;
    for (const cap of brassEndCaps) {
      cap.mesh.position.y = cap.baseY - cap.signY * clampOffset;
    }
  }

  return {
    group: lensRoot,
    focusGroup,
    frontBarrelGroup,
    irisGroup,
    helicoidGroup,
    focusRingGroup,
    interactiveMeshes,
    getFocusGroupX: () => focusGroup.position.x,
    getFrontElementX: () => 0.45 + frontBarrelGroup.position.x,
    getIrisRadiusWorld: (apertureN) => {
      const apNorm = Math.pow(2 / apertureN, 0.82);
      return (0.13 + apNorm * 0.64) * 0.79;
    },
    update,
  };
}

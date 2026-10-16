import * as THREE from 'three';
import { createSeededRandom, makeCanvasTexture, makeRoundedBox, MATS } from '../materials.js';

export function buildStudioEnvironmentMesh(scene) {
  const studioGroup = new THREE.Group();
  studioGroup.name = 'StudioEnvironment';
  scene.add(studioGroup);

  const wallZ = -7.6;
  const wallHeight = 12.0;

  // 1. Tiled Studio Floor
  const floorTex = makeCanvasTexture(1024, 1024, (ctx, w, h) => {
    const tile = w / 4;
    const rand = createSeededRandom(3);
    for (let gx = 0; gx < 4; gx++) {
      for (let gy = 0; gy < 4; gy++) {
        const r = rand();
        ctx.fillStyle = `hsl(${34 + r * 6}, ${9 + r * 4}%, ${58 + r * 7}%)`;
        ctx.fillRect(gx * tile, gy * tile, tile, tile);
        for (let s = 0; s < 65; s++) {
          ctx.fillStyle = `rgba(${rand() > 0.5 ? 255 : 70}, ${rand() > 0.5 ? 250 : 60}, 240, ${0.025 + rand() * 0.03})`;
          ctx.beginPath();
          ctx.ellipse(
            gx * tile + rand() * tile,
            gy * tile + rand() * tile,
            4 + rand() * 38,
            2 + rand() * 12,
            rand() * 3,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }
    }
    ctx.strokeStyle = '#5e564c';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * tile, 0);
      ctx.lineTo(i * tile, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * tile);
      ctx.lineTo(w, i * tile);
      ctx.stroke();
    }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(9, 6);

  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex,
    roughness: 0.24,
    metalness: 0.08,
    envMapIntensity: 0.65,
  });
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(72, 48), floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(0, 0, 4);
  floorMesh.receiveShadow = true;
  studioGroup.add(floorMesh);

  // 2. Dark Architectural Studio Back Wall & Trim
  const wallMat = new THREE.MeshStandardMaterial({
    color: '#252e3c',
    roughness: 0.64,
    envMapIntensity: 0.55,
  });
  const darkTrimMat = new THREE.MeshStandardMaterial({
    color: '#1b222d',
    roughness: 0.7,
  });
  const frameMetalMat = new THREE.MeshPhysicalMaterial({
    color: '#3a414c',
    metalness: 0.8,
    roughness: 0.4,
  });

  const mainWall = new THREE.Mesh(new THREE.BoxGeometry(36, wallHeight, 0.4), wallMat);
  mainWall.position.set(0, wallHeight / 2, wallZ - 0.2);
  studioGroup.add(mainWall);

  // Vertical architectural wall panel seams
  for (let x = -10.4; x <= 11; x += 2.6) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.05, wallHeight, 0.05), darkTrimMat);
    seam.position.set(x, wallHeight / 2, wallZ + 0.01);
    studioGroup.add(seam);
  }

  // Baseboard & warm LED accent strips
  const baseboard = new THREE.Mesh(new THREE.BoxGeometry(32, 0.24, 0.14), frameMetalMat);
  baseboard.position.set(0, 0.12, wallZ + 0.08);
  studioGroup.add(baseboard);

  const topLed = new THREE.Mesh(
    new THREE.BoxGeometry(30, 0.06, 0.06),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb86b').multiplyScalar(2.6) })
  );
  topLed.position.set(-2, wallHeight - 0.35, wallZ + 0.3);
  studioGroup.add(topLed);

  const bottomLed = new THREE.Mesh(
    new THREE.BoxGeometry(22, 0.04, 0.04),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffae5c').multiplyScalar(1.5) })
  );
  bottomLed.position.set(1.5, 0.27, wallZ + 0.16);
  studioGroup.add(bottomLed);

  // 3. Three Glowing Cyan Blueprint Frames on the Back Wall
  // Frame 0: Rays converge in front of sensor (blurry tree)
  // Frame 1: Rays converge exactly on sensor (sharp tree)
  // Frame 2: Rays converge behind sensor (blurry tree)
  const blueprintXs = [-3.25, -0.25, 2.75];
  const blueprintY = 6.45;

  blueprintXs.forEach((bx, idx) => {
    // Metallic outer frame
    const frameOuter = new THREE.Mesh(new THREE.BoxGeometry(2.55, 1.82, 0.12), frameMetalMat);
    frameOuter.position.set(bx, blueprintY, wallZ + 0.06);
    studioGroup.add(frameOuter);

    const bpTex = makeCanvasTexture(512, 360, (ctx, w, h) => {
      // Deep blueprint navy background
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0d1526');
      grad.addColorStop(1, '#090e1a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Subtle grid
      ctx.strokeStyle = 'rgba(127, 227, 255, 0.07)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx < w; gx += 24) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, h);
        ctx.stroke();
      }
      for (let gy = 0; gy < h; gy += 24) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      }

      // Glowing inner border
      ctx.save();
      ctx.strokeStyle = 'rgba(135, 215, 255, 0.65)';
      ctx.shadowColor = '#7fe3ff';
      ctx.shadowBlur = 14;
      ctx.lineWidth = 4;
      ctx.strokeRect(14, 14, w - 28, h - 28);
      ctx.restore();

      // Left side: Pine tree silhouette (blurry in 0 and 2, sharp in 1)
      ctx.save();
      const treeX = 118;
      const treeBaseY = h * 0.78;
      if (idx === 0) {
        ctx.filter = 'blur(14px)';
      } else if (idx === 1) {
        ctx.filter = 'blur(3px)';
      } else {
        ctx.filter = 'blur(1.5px)';
      }
      ctx.fillStyle = '#d8ecff';
      // Trunk
      ctx.fillRect(treeX - 10, treeBaseY - 22, 20, 26);
      // 3 stacked pine tiers
      const tiers = [
        [treeBaseY - 18, 64, 70],
        [treeBaseY - 62, 52, 65],
        [treeBaseY - 105, 38, 60],
      ];
      for (const [by, halfW, th] of tiers) {
        ctx.beginPath();
        ctx.moveTo(treeX, by - th);
        ctx.lineTo(treeX - halfW, by);
        ctx.lineTo(treeX + halfW, by);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // Right side: Ray cone diagram + sensor plane
      const srcX = 230;
      const srcY = h * 0.5;
      const sensorX = 435;
      const convergeX = idx === 0 ? 392 : idx === 1 ? sensorX : 472;

      ctx.save();
      ctx.strokeStyle = 'rgba(165, 225, 255, 0.55)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      const rayAngles = [-0.55, -0.28, 0, 0.28, 0.55];
      for (const a of rayAngles) {
        const yAtSensor = srcY + a * 95 * ((sensorX - srcX) / (convergeX - srcX) - 1);
        const startY = srcY - a * 82;
        ctx.beginPath();
        ctx.moveTo(srcX, startY);
        ctx.lineTo(sensorX, srcY + (startY - srcY) * (1 - (sensorX - srcX) / (convergeX - srcX)));
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Sensor bar on the right
      ctx.strokeStyle = 'rgba(180, 230, 255, 0.85)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(sensorX, h * 0.22);
      ctx.lineTo(sensorX, h * 0.78);
      ctx.stroke();

      // Focal convergence point / blur disc on sensor
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#7fe3ff';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(convergeX, srcY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    const bpPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.42, 1.7),
      new THREE.MeshBasicMaterial({ map: bpTex })
    );
    bpPlane.position.set(bx, blueprintY, wallZ + 0.13);
    studioGroup.add(bpPlane);
  });

  // 4. Right-Side Studio Display Board (3 Glowing Lens Rings + Vintage Camera + White Pedestal)
  const cabinetGroup = new THREE.Group();
  cabinetGroup.position.set(7.45, 0, -5.4);
  studioGroup.add(cabinetGroup);

  // Dark cabinet base
  const cabBase = new THREE.Mesh(
    new THREE.BoxGeometry(4.6, 2.8, 1.8),
    new THREE.MeshStandardMaterial({ color: '#141820', roughness: 0.65 })
  );
  cabBase.position.set(0, 1.4, 0);
  cabinetGroup.add(cabBase);

  // Backboard with 3 glowing cyan optical element rings
  const ringBoardTex = makeCanvasTexture(768, 420, (ctx, w, h) => {
    ctx.fillStyle = '#1b2029';
    ctx.fillRect(0, 0, w, h);

    const ringXs = [155, 345, 535];
    const ringRadii = [68, 78, 62];
    ringXs.forEach((rx, i) => {
      const ry = h * 0.54;
      const r = ringRadii[i];
      ctx.save();
      ctx.strokeStyle = 'rgba(140, 235, 255, 0.75)';
      ctx.shadowColor = '#7fe3ff';
      ctx.shadowBlur = 18;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(rx, ry, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(140, 235, 255, 0.28)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(rx, ry, r * 0.84, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
  });

  const ringBoard = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 2.5, 0.16),
    new THREE.MeshStandardMaterial({
      map: ringBoardTex,
      roughness: 0.5,
      emissive: new THREE.Color('#224858'),
      emissiveMap: ringBoardTex,
      emissiveIntensity: 0.55,
    })
  );
  ringBoard.position.set(0, 4.05, -0.5);
  cabinetGroup.add(ringBoard);

  // Warm gold light bar above the ring board
  const cabLight = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 0.06, 0.1),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffcc88').multiplyScalar(2.0) })
  );
  cabLight.position.set(0, 5.32, -0.4);
  cabinetGroup.add(cabLight);

  // Vintage Camera Model sitting on the right end of the cabinet
  const camBody = new THREE.Mesh(makeRoundedBox(0.75, 0.48, 0.36, 0.04), MATS.anodizedBlack);
  camBody.position.set(1.45, 3.05, -0.1);
  cabinetGroup.add(camBody);

  const camTop = new THREE.Mesh(makeRoundedBox(0.72, 0.12, 0.34, 0.02), MATS.gunmetal);
  camTop.position.set(1.45, 3.32, -0.1);
  cabinetGroup.add(camTop);

  const camLens = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.32, 24), MATS.anodizedBlack);
  camLens.rotation.x = Math.PI / 2;
  camLens.position.set(1.45, 3.04, 0.18);
  cabinetGroup.add(camLens);

  // White gallery pedestal on the far right foreground
  const whitePedestal = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 2.75, 1.6),
    new THREE.MeshStandardMaterial({ color: '#d7dde8', roughness: 0.45 })
  );
  whitePedestal.position.set(6.55, 1.375, -1.35);
  whitePedestal.receiveShadow = true;
  studioGroup.add(whitePedestal);

  // 5. Left-Side Potted Plant in Background (adds warm depth in the left periphery)
  const plantGroup = new THREE.Group();
  plantGroup.position.set(-6.8, 0, -4.8);
  studioGroup.add(plantGroup);

  const potMat = new THREE.MeshStandardMaterial({ color: '#9c623e', roughness: 0.75 });
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.38, 0.95, 20), potMat);
  pot.position.y = 1.65;
  plantGroup.add(pot);

  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, 1.2, 16), MATS.consoleDark);
  stand.position.y = 0.6;
  plantGroup.add(stand);

  const leafMat = new THREE.MeshStandardMaterial({ color: '#3b6e38', roughness: 0.65 });
  const leafPositions = [
    [0, 2.55, 0, 0.55],
    [-0.42, 2.85, 0.15, 0.48],
    [0.38, 2.95, -0.1, 0.52],
    [-0.15, 3.35, 0.05, 0.45],
    [0.25, 2.45, 0.25, 0.42],
  ];
  for (const [lx, ly, lz, lr] of leafPositions) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(lr, 12, 10), leafMat);
    leaf.scale.set(1.1, 0.85, 0.9);
    leaf.position.set(lx, ly, lz);
    plantGroup.add(leaf);
  }

  return studioGroup;
}

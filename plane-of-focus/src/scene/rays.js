import * as THREE from 'three';
import {
  OPTICAL_AXIS_Y,
  IMAGE_PLANE_X,
  LENS_FRONT_X,
  SUBJECTS,
  computeCoc,
  clamp,
} from '../optics.js';
import { SUBJECT_GLASS_COORDS } from './imagePlane.js';

export function buildOpticalRays(scene) {
  const raysRoot = new THREE.Group();
  raysRoot.name = 'OpticalRays';
  scene.add(raysRoot);

  const numRaysPerBundle = 12; // 12 rays around the aperture cone for each of the 3 subjects
  const bundles = [];

  SUBJECTS.forEach((subj, idx) => {
    // Main ray segments (6 segments per ray: valley->front, front->focusGrp, focusGrp->iris, iris->rear1, rear1->rear2, rear2->glass)
    const maxVerts = numRaysPerBundle * 12;
    const positions = new Float32Array(maxVerts * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.LineBasicMaterial({
      color: new THREE.Color('#e2f7ff'),
      transparent: true,
      opacity: 0.58,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const lineSegments = new THREE.LineSegments(geo, mat);
    raysRoot.add(lineSegments);

    // Incoming landing cone segment right behind the Ground Glass (visible through the frosted glass in Camera #4!)
    const landVerts = numRaysPerBundle * 2;
    const landPositions = new Float32Array(landVerts * 3);
    const landGeo = new THREE.BufferGeometry();
    landGeo.setAttribute('position', new THREE.BufferAttribute(landPositions, 3));
    const landMat = new THREE.LineBasicMaterial({
      color: new THREE.Color('#ffffff'),
      transparent: true,
      opacity: 0.48,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    const landSegments = new THREE.LineSegments(landGeo, landMat);
    landSegments.renderOrder = 10;
    raysRoot.add(landSegments);

    // 3D Circle of Confusion ring + translucent disc fill on the Ground Glass
    const ringPts = 56;
    const ringPos = new Float32Array(ringPts * 3);
    const ringGeo = new THREE.BufferGeometry();
    ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
    const ringMat = new THREE.LineBasicMaterial({
      color: new THREE.Color('#ffffff'),
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    const ringLoop = new THREE.LineLoop(ringGeo, ringMat);
    ringLoop.renderOrder = 12;
    raysRoot.add(ringLoop);

    const discFillGeo = new THREE.CircleGeometry(1, 48);
    const discFillMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#d8f8f2'),
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    const discFillMesh = new THREE.Mesh(discFillGeo, discFillMat);
    discFillMesh.rotation.y = -Math.PI / 2;
    discFillMesh.renderOrder = 11;
    raysRoot.add(discFillMesh);

    // Origin glowing dot in the valley
    const originDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 12, 12),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#ffffff'),
      })
    );
    originDot.position.set(...subj.rayOrigin);
    raysRoot.add(originDot);

    // True 3D Conjugate Focal Waist dot (shows where the bundle's rays physically cross to a point!)
    const waistDotMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#8eeeff'),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const waistDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 12, 12),
      waistDotMat
    );
    waistDot.renderOrder = 13;
    raysRoot.add(waistDot);

    bundles.push({
      subj,
      idx,
      positions,
      geo,
      mat,
      landPositions,
      landGeo,
      landMat,
      ringPos,
      ringGeo,
      ringMat,
      discFillMesh,
      discFillMat,
      originDot,
      waistDot,
      waistDotMat,
    });
  });

  function update(focusD, apertureN, focusGroupX = -1.14, frontElementX = 0.45) {
    // Normalized aperture radius inside the lens (wide at f/2, narrow pencil beam at f/16)
    const apNorm = Math.pow(2 / apertureN, 0.88); // 1.0 at f/2, ~0.16 at f/16
    const maxLensR = 0.46;
    const beamR = 0.045 + apNorm * (maxLensR - 0.045);

    const xFront = frontElementX;       // Movable Telescoping Front Collector Element
    const xFocusGrp = focusGroupX;      // Movable Focus Doublet (-0.92 .. -1.32)
    const xIris = -1.58;                // 7-Blade Aperture Stop
    const xRear1 = -1.89;               // Rear Meniscus Element
    const xRear2 = -2.22;               // Rear Biconvex Element
    const xGlass = IMAGE_PLANE_X;       // -4.35 (Ground Glass)

    const focusVergence = 1 / focusD;   // 1.053 D at 0.95m .. 0.125 D at 8.0m

    bundles.forEach((b) => {
      const {
        subj,
        idx,
        positions,
        geo,
        mat,
        landPositions,
        landGeo,
        landMat,
        ringPos,
        ringGeo,
        ringMat,
        discFillMesh,
        discFillMat,
        waistDot,
        waistDotMat,
      } = b;
      const [ox, oy, oz] = subj.rayOrigin;
      const glassCoord = SUBJECT_GLASS_COORDS[idx];
      const gx = xGlass;
      const gy = OPTICAL_AXIS_Y + glassCoord.yOff;
      const gz = glassCoord.zOff;

      // Signed optical defocus (in diopters, m^-1):
      // > 0 means subject is closer than focusD -> rays are under-converged & meet BEHIND glass (x < xGlass)
      // < 0 means subject is farther than focusD -> rays are over-converged & cross IN FRONT OF glass (x > xGlass)!
      const objVergence = 1 / subj.d;
      const invDiff = objVergence - focusVergence;
      const cocUnsigned = computeCoc(subj.d, focusD, apertureN);
      const isFocused = cocUnsigned < 0.015;

      // Highlight the in-focus ray bundle more strongly
      mat.opacity = isFocused ? 0.72 : 0.33;
      mat.color.set(isFocused ? '#eefbff' : '#bfe8f8');
      landMat.opacity = isFocused ? 0.68 : 0.42;
      ringMat.opacity = isFocused ? 0.98 : 0.84;

      // Radius of Circle of Confusion disc on the Ground Glass in 3D world units
      const signedDiscR = clamp(invDiff * (1 / apertureN) * 0.94, -0.175, 0.175);
      const absDiscR = Math.max(Math.abs(signedDiscR), 0.012);

      // Update 3D translucent CoC disc mesh
      discFillMesh.position.set(gx - 0.004, gy, gz);
      discFillMesh.scale.set(absDiscR, absDiscR, 1);
      discFillMat.opacity = isFocused ? 0.92 : 0.22;
      discFillMat.color.set(isFocused ? '#ffffff' : '#d2f6ee');

      // Update 3D Circle of Confusion ring on the Ground Glass
      const ringPts = 56;
      for (let p = 0; p < ringPts; p++) {
        const ang = (p / ringPts) * Math.PI * 2;
        const pBase = p * 3;
        ringPos[pBase] = gx - 0.005;
        ringPos[pBase + 1] = gy + Math.sin(ang) * absDiscR;
        ringPos[pBase + 2] = gz + Math.cos(ang) * absDiscR;
      }
      ringGeo.attributes.position.needsUpdate = true;

      // Physics-proof Chief Ray path through the optical system:
      // Enters off-axis from the valley subject, refracts toward the center of the Aperture Stop (Iris at xIris),
      // crosses the optical axis at the Iris, and proceeds to the inverted image point (gy, gz) on the Ground Glass.
      const dyObj = oy - OPTICAL_AXIS_Y;
      const dzObj = oz;
      const chiefFrontY = OPTICAL_AXIS_Y + dyObj * 0.075;
      const chiefFrontZ = dzObj * 0.075;

      // As focusGroupX slides axially between xFront and xIris, chief ray height interpolates along its slope
      const fgFrac = clamp((xFocusGrp - xIris) / (xFront - xIris), 0.1, 0.9);
      const chiefFgY = OPTICAL_AXIS_Y + dyObj * 0.075 * fgFrac * 0.72;
      const chiefFgZ = dzObj * 0.075 * fgFrac * 0.72;

      // Chief ray crosses the center of the Iris (Aperture Stop)
      const chiefIrisY = OPTICAL_AXIS_Y + (idx - 1) * 0.006;
      const chiefIrisZ = (idx - 1) * 0.006;

      // After the Iris, the chief ray diverges toward its inverted image point (gy, gz) on the Ground Glass
      const rear1Frac = (xIris - xRear1) / (xIris - xGlass);
      const chiefRear1Y = chiefIrisY + (gy - chiefIrisY) * rear1Frac * 0.65;
      const chiefRear1Z = chiefIrisZ + (gz - chiefIrisZ) * rear1Frac * 0.65;

      const rear2Frac = (xIris - xRear2) / (xIris - xGlass);
      const chiefRear2Y = chiefIrisY + (gy - chiefIrisY) * rear2Frac * 0.82;
      const chiefRear2Z = chiefIrisZ + (gz - chiefIrisZ) * rear2Frac * 0.82;

      // Physics-proof Marginal Bundle Radii at each optical element:
      // focusT: 0.0 when Focus Group is forward (Near focus), 1.0 when retracted (Far focus)
      const focusT = clamp((-0.92 - xFocusGrp) / 0.42, 0.0, 1.0);

      // 1. Front Element (positive collector) catches a wide cone from the valley
      const frontR = beamR * clamp(
        1.04 + (objVergence - 0.45) * 0.12,
        0.84,
        1.14
      );

      // 2. Movable Focus Group (xFocusGrp):
      // - At Close Focus (focusT=0, forward at -0.92): intercepts the wide cone early (1.08*beamR) and refracts it steeply inward
      // - At Far Focus (focusT=1, retracted at -1.34): intercepts the converging cone deeper in the barrel (0.62*beamR) and re-expands/collimates it into the rear group
      const fgR = beamR * clamp(
        1.08 - focusT * 0.46 + (objVergence - 0.45) * 0.10,
        0.52,
        1.15
      );

      // 3. Iris (Aperture Stop) constrains the refracted bundle
      const irisR = beamR * clamp(
        0.70 + focusT * 0.20 + invDiff * 0.16,
        0.50,
        0.98
      );

      // 4. Rear Meniscus (xRear1) & Rear Biconvex (xRear2):
      // Convergence slope inside the rear group shifts unmistakably with both focusT and per-subject defocus (invDiff)
      const rear1R = beamR * clamp(
        0.56 + focusT * 0.38 + invDiff * 0.24,
        0.40,
        1.08
      );
      const rear2R = beamR * clamp(
        0.44 + focusT * 0.50 + invDiff * 0.34,
        0.32,
        1.14
      );

      // Compute true 3D Conjugate Focal Waist position (where rays cross radius = 0)
      const tWaist = rear2R / Math.max(0.001, rear2R - signedDiscR);
      if (tWaist <= 1.02) {
        // Rays cross at or in front of the Ground Glass
        const tClamped = Math.min(1.0, tWaist);
        const xWaist = xRear2 + tClamped * (xGlass - xRear2);
        const yWaist = chiefRear2Y + tClamped * (gy - chiefRear2Y);
        const zWaist = chiefRear2Z + tClamped * (gz - chiefRear2Z);
        waistDot.position.set(xWaist, yWaist, zWaist);
        waistDot.visible = true;
        waistDot.scale.setScalar(isFocused ? 1.25 : 0.85);
        waistDotMat.color.set(isFocused ? '#ffffff' : '#7fe3ff');
        waistDotMat.opacity = isFocused ? 0.95 : 0.65;
      } else {
        // Rays converge toward a virtual apex behind the Ground Glass
        waistDot.visible = false;
      }

      let vPtr = 0;
      let lPtr = 0;
      const pushSeg = (x1, y1, z1, x2, y2, z2) => {
        positions[vPtr++] = x1;
        positions[vPtr++] = y1;
        positions[vPtr++] = z1;
        positions[vPtr++] = x2;
        positions[vPtr++] = y2;
        positions[vPtr++] = z2;
      };

      for (let r = 0; r < numRaysPerBundle; r++) {
        const angle = (r / numRaysPerBundle) * Math.PI * 2 + 0.15;
        const sinA = Math.sin(angle);
        const cosA = Math.cos(angle);

        // 1. Point on Front Element (xFront)
        const yFront = chiefFrontY + sinA * frontR;
        const zFront = chiefFrontZ + cosA * frontR;

        // 2. Point at Movable Focus Group (xFocusGrp)
        const yFg = chiefFgY + sinA * fgR;
        const zFg = chiefFgZ + cosA * fgR;

        // 3. Point at Iris / Aperture Stop (xIris)
        const yIris = chiefIrisY + sinA * irisR;
        const zIris = chiefIrisZ + cosA * irisR;

        // 4. Point at Rear Meniscus Element (xRear1)
        const yRear1 = chiefRear1Y + sinA * rear1R;
        const zRear1 = chiefRear1Z + cosA * rear1R;

        // 5. Point at Rear Biconvex Element (xRear2)
        const yRear2 = chiefRear2Y + sinA * rear2R;
        const zRear2 = chiefRear2Z + cosA * rear2R;

        // 6. Point on Ground Glass (xGlass)
        // Note: when signedDiscR < 0 (subject farther than focusD), the ray from (yRear2, zRear2) to (yGlassHit, zGlassHit)
        // naturally crosses the chief ray at waistDot in front of the Ground Glass before hitting the CoC ring!
        const yGlassHit = gy + sinA * signedDiscR;
        const zGlassHit = gz + cosA * signedDiscR;

        // Emit the 6 connected segments from valley to Ground Glass
        pushSeg(ox, oy, oz, xFront, yFront, zFront);
        pushSeg(xFront, yFront, zFront, xFocusGrp, yFg, zFg);
        pushSeg(xFocusGrp, yFg, zFg, xIris, yIris, zIris);
        pushSeg(xIris, yIris, zIris, xRear1, yRear1, zRear1);
        pushSeg(xRear1, yRear1, zRear1, xRear2, yRear2, zRear2);
        pushSeg(xRear2, yRear2, zRear2, xGlass, yGlassHit, zGlassHit);

        // Emit the short incoming landing cone segment (from xGlass + 0.36 to xGlass) visible through the Ground Glass
        const frac = 0.18;
        const xLandStart = xGlass + (xRear2 - xGlass) * frac;
        const yLandStart = yGlassHit + (yRear2 - yGlassHit) * frac;
        const zLandStart = zGlassHit + (zRear2 - zGlassHit) * frac;
        landPositions[lPtr++] = xLandStart;
        landPositions[lPtr++] = yLandStart;
        landPositions[lPtr++] = zLandStart;
        landPositions[lPtr++] = xGlass;
        landPositions[lPtr++] = yGlassHit;
        landPositions[lPtr++] = zGlassHit;
      }

      geo.attributes.position.needsUpdate = true;
      landGeo.attributes.position.needsUpdate = true;
    });
  }

  update(2.35, 2, -1.16);

  return {
    group: raysRoot,
    update,
  };
}

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Deterministic seeded PRNG for procedural textures and placement
export function createSeededRandom(seed = 7) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Create a CanvasTexture using a 2D drawing callback
export function makeCanvasTexture(width, height, drawFn, isSRGB = true) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  if (isSRGB) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Build procedural studio HDR-like environment map for realistic brass & glass reflections
export function buildStudioEnvironment(renderer, scene) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();

  // Gradient dome sky
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      void main() {
        vec3 col = mix(vec3(0.10, 0.085, 0.07), vec3(0.16, 0.19, 0.26), smoothstep(-0.4, 0.1, vDir.y));
        col = mix(col, vec3(0.06, 0.08, 0.13), smoothstep(0.2, 0.9, vDir.y));
        col += vec3(1.4, 0.8, 0.42) * smoothstep(0.55, 0.95, vDir.x) * smoothstep(-0.1, 0.25, vDir.y) * (1.0 - smoothstep(0.3, 0.7, vDir.y));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), domeMat));

  // Studio softbox strips around the scene for crisp specular reflections on glass & brass
  const softboxColors = [
    [5.5, 4.2, 3.0],
    [1.8, 3.6, 5.2],
    [4.6, 3.0, 1.5],
    [2.6, 2.9, 3.4],
    [1.5, 4.2, 5.5],
    [3.4, 3.4, 3.4],
  ];

  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + 0.4;
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(12, 2.4, 0.4),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(...softboxColors[i]) })
    );
    panel.position.set(Math.sin(angle) * 28, 12 + (i % 2) * 9, Math.cos(angle) * 28);
    panel.lookAt(0, 0, 0);
    envScene.add(panel);
  }

  // Warm rim strip
  const warmBar = new THREE.Mesh(
    new THREE.BoxGeometry(40, 1.2, 1.2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(6.0, 3.4, 1.2) })
  );
  warmBar.position.set(0, -6, -30);
  envScene.add(warmBar);

  scene.environment = pmrem.fromScene(envScene, 0.03).texture;
  scene.environmentIntensity = 0.78;
  pmrem.dispose();
}

// Material palette
export const MATS = {
  consoleSlate: new THREE.MeshPhysicalMaterial({
    color: '#3f4652',
    metalness: 0.82,
    roughness: 0.36,
    envMapIntensity: 1.2,
    clearcoat: 0.3,
    clearcoatRoughness: 0.3,
  }),
  consoleDark: new THREE.MeshPhysicalMaterial({
    color: '#22262e',
    metalness: 0.72,
    roughness: 0.42,
    envMapIntensity: 1.1,
    clearcoat: 0.25,
  }),
  anodizedBlack: new THREE.MeshPhysicalMaterial({
    color: '#15171c',
    metalness: 0.58,
    roughness: 0.44,
    envMapIntensity: 1.15,
    clearcoat: 0.3,
    clearcoatRoughness: 0.3,
  }),
  matteRubber: new THREE.MeshStandardMaterial({
    color: '#121317',
    roughness: 0.74,
    metalness: 0.15,
    envMapIntensity: 0.45,
  }),
  brushedBrass: new THREE.MeshPhysicalMaterial({
    color: '#c48d3f',
    metalness: 1.0,
    roughness: 0.28,
    envMapIntensity: 1.35,
    clearcoat: 0.5,
    clearcoatRoughness: 0.22,
  }),
  brushedSteel: new THREE.MeshPhysicalMaterial({
    color: '#b8c0cc',
    metalness: 0.95,
    roughness: 0.22,
    envMapIntensity: 1.3,
  }),
  gunmetal: new THREE.MeshPhysicalMaterial({
    color: '#8e96a3',
    metalness: 0.9,
    roughness: 0.3,
    envMapIntensity: 1.2,
  }),
};

// Create ultra-realistic multi-coated optical glass material matching the reference studio look:
// - Crystal-clear dark/transparent center so rays and mechanical parts behind the glass are seen clearly
// - Luminous ice-cyan / sapphire grazing crescents at the top and bottom poles of each curved element
// - Curved vertical studio softbox specular reflection arc across the spherical faces
// - Crisp machined 45-degree bevel rim highlight without opaque white blobbing
export function createOpticalGlassMaterial(
  tint = '#8ce6ff',
  rimStrength = 1.0,
  glassRadius = 0.78,
  coatingShift = 0.0
) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#0c2230'),
    emissive: new THREE.Color('#020a10'),
    emissiveIntensity: 0.04,
    metalness: 0.0,
    roughness: 0.04,
    ior: 1.52,
    reflectivity: 0.5,
    clearcoat: 0.4,
    clearcoatRoughness: 0.04,
    envMapIntensity: 0.45,
    transparent: true,
    opacity: 0.02,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const tintCol = new THREE.Color(tint);

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimStrength = { value: rimStrength };
    shader.uniforms.uGlassRadius = { value: glassRadius };
    shader.uniforms.uTintColor = { value: tintCol };
    shader.uniforms.uCoatingShift = { value: coatingShift };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vGlassPos;
         varying vec3 vGlassLocalNormal;
         varying vec3 vGlassWorldPos;
         varying vec3 vGlassWorldNormal;
         varying vec3 vGlassRadialWorld;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vGlassPos = position;
         vGlassLocalNormal = normal;
         vec4 wp = modelMatrix * vec4(position, 1.0);
         vGlassWorldPos = wp.xyz;
         vGlassWorldNormal = normalize(mat3(modelMatrix) * normal);
         vGlassRadialWorld = mat3(modelMatrix) * vec3(0.0, position.y, position.z);`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uRimStrength;
         uniform float uGlassRadius;
         uniform vec3 uTintColor;
         uniform float uCoatingShift;
         varying vec3 vGlassPos;
         varying vec3 vGlassLocalNormal;
         varying vec3 vGlassWorldPos;
         varying vec3 vGlassWorldNormal;
         varying vec3 vGlassRadialWorld;`
      )
      .replace(
        '#include <dithering_fragment>',
        `{
           vec3 V = normalize(cameraPosition - vGlassWorldPos);
           vec3 N = normalize(vGlassWorldNormal);
           if (!gl_FrontFacing) N = -N;

           // Radial outward vector in the Y-Z aperture plane
           float rLen = length(vGlassPos.yz);
           float rNorm = clamp(rLen / max(uGlassRadius, 0.1), 0.0, 1.0);
           vec3 radialWorld = length(vGlassRadialWorld) > 1e-4
             ? normalize(vGlassRadialWorld)
             : vec3(0.0, 1.0, 0.0);

           // True 3D radial silhouette grazing:
           // Zero in the middle ray corridor facing the camera (|dot(radialWorld, V)| ~ 1),
           // Maximum at the top/bottom silhouette poles (|dot(radialWorld, V)| ~ 0)!
           float radialViewDot = abs(dot(radialWorld, V));
           float silhouette = pow(clamp(1.0 - radialViewDot, 0.0, 1.0), 2.2) * smoothstep(0.38, 0.99, rNorm);
           float tightPolarTip = pow(clamp(1.0 - radialViewDot, 0.0, 1.0), 4.0) * smoothstep(0.75, 0.995, rNorm);

           // When orbiting into a 3/4 or axial view (|V.x| > 0.18), bring in 360-deg circular rim & dome reflections
           float axialView = smoothstep(0.18, 0.72, abs(V.x));
           float circularRim = smoothstep(0.68, 0.99, rNorm) * pow(rNorm, 1.8) * axialView;

           // Distinguish spherical optical faces (|nx| > 0.35) from ground cylindrical edge / 45-deg bevels
           float isFace = smoothstep(0.25, 0.58, abs(vGlassLocalNormal.x));
           float isGroundRim = 1.0 - isFace;
           float isRightFace = step(0.0, vGlassLocalNormal.x);

           // Camera-facing coordinate across the aperture
           float zFront = clamp(vGlassPos.z / max(uGlassRadius, 0.1), -1.0, 1.0);
           float frontHemi = smoothstep(-0.12, 0.22, zFront);

           // 1. Curved Vertical Studio Specular Reflection Arcs across the spherical faces
           float primaryArc = exp(-pow((zFront - 0.26) * 3.8, 2.0)) * frontHemi * isFace;
           float meridianArc = exp(-pow((zFront - 0.02) * 5.8, 2.0)) * isFace * (0.45 + 0.55 * isRightFace);

           // 3D view-dependent studio softbox specular reflection across the spherical dome when orbiting
           vec3 R = reflect(-V, N);
           float studioSpec1 = pow(max(0.0, dot(R, normalize(vec3(0.35, 0.78, 0.52)))), 14.0) * isFace;
           float studioSpec2 = pow(max(0.0, dot(R, normalize(vec3(-0.45, 0.62, 0.64)))), 18.0) * isFace;
           float orbitDomeSheen = (studioSpec1 * 0.55 + studioSpec2 * 0.42) * (0.25 + 0.75 * axialView);

           // 2. Warm golden internal reflection from adjacent brass iris / gears
           float warmBrass = exp(-pow((zFront - 0.16) * 3.2, 2.0)) * frontHemi * (1.0 - silhouette * 0.7) * 0.24 * isFace;

           // 3. Machined 45-degree perimeter bevel ring (bright at top/bottom crescents and in 3/4 orbit views)
           float bevelRing = smoothstep(0.925, 0.995, rNorm) * (silhouette * 0.85 + frontHemi * 0.22 + axialView * 0.65);

           // Multi-coating tint (ice-cyan to sapphire-sky)
           vec3 coatCol = mix(uTintColor, vec3(0.56, 0.92, 1.0), 0.35 + 0.3 * uCoatingShift);

           vec3 glassCol = coatCol * (
             silhouette * 0.76 +
             circularRim * 0.52 +
             isGroundRim * (0.16 * frontHemi + 0.72 * silhouette + 0.45 * axialView) +
             meridianArc * 0.32 +
             axialView * 0.14 * isFace
           ) * uRimStrength;

           glassCol += vec3(0.92, 0.98, 1.0) * (
             primaryArc * 0.42 +
             orbitDomeSheen +
             tightPolarTip * 0.78 * uRimStrength +
             bevelRing * 0.58 * uRimStrength
           );
           glassCol += vec3(0.96, 0.68, 0.30) * warmBrass;

           // Clamp below bloom threshold so only the polar tips softly gleam, never turning milky
           gl_FragColor.rgb = min(glassCol, vec3(0.96));

           // Crystal-clear center in side view (alpha ~ 0.02), rich 3D reflections when orbiting
           float alpha = 0.02
             + primaryArc * 0.16
             + meridianArc * 0.11
             + orbitDomeSheen * 0.42
             + warmBrass * 0.11
             + silhouette * 0.48 * uRimStrength
             + circularRim * 0.34 * uRimStrength
             + tightPolarTip * 0.34 * uRimStrength
             + bevelRing * 0.32 * uRimStrength
             + axialView * 0.08 * isFace
             + isGroundRim * (0.05 * frontHemi + 0.44 * silhouette + 0.28 * axialView);
           gl_FragColor.a = clamp(alpha, 0.02, 0.80);
         }
         #include <dithering_fragment>`
      );
  };
  return mat;
}

// Create precision frosted ground-glass cylindrical edge material with crisp specular rim lines
export function createGlassRimGlowMaterial(color = '#7fe3ff', intensity = 1.0) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    emissive: new THREE.Color(color).multiplyScalar(0.14 * intensity),
    roughness: 0.22,
    metalness: 0.08,
    envMapIntensity: 1.35,
    transparent: true,
    opacity: 0.32,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec2 vRimUv;`
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
         vRimUv = uv;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec2 vRimUv;`
      )
      .replace(
        '#include <dithering_fragment>',
        `{
           // Crisp glowing bevel lines at the front (vRimUv.y -> 0) and rear (vRimUv.y -> 1) edges of the ground cylinder
           float edgeLine = smoothstep(0.14, 0.0, vRimUv.y) + smoothstep(0.86, 1.0, vRimUv.y);
           gl_FragColor.rgb = min(gl_FragColor.rgb + vec3(0.75, 0.95, 1.0) * edgeLine * 0.55, vec3(0.95));
           gl_FragColor.a = clamp(0.22 + edgeLine * 0.48, 0.20, 0.72);
         }
         #include <dithering_fragment>`
      );
  };
  return mat;
}

// 7-blade Iris / Aperture Shader Material
export function createIrisMaterial(baseColor = '#1c1e24') {
  const uniforms = {
    uAp: { value: 0.62 },
    uRot: { value: 0.0 },
    uGlow: { value: 0.0 },
  };

  const mat = new THREE.MeshPhysicalMaterial({
    color: baseColor,
    metalness: 0.72,
    roughness: 0.38,
    side: THREE.DoubleSide,
    envMapIntensity: 1.1,
    clearcoat: 0.4,
    alphaTest: 0.5,
  });

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec2 vIr;`
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
         vIr = uv * 2.0 - 1.0;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec2 vIr;
         uniform float uAp;
         uniform float uRot;
         uniform float uGlow;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         {
           float rho = length(vIr);
           float th = atan(vIr.y, vIr.x) + uRot;
           const float n = 7.0;
           const float seg = 6.2831853 / n;
           float w = mod(th, seg) - seg * 0.5;
           float rp = uAp * cos(seg * 0.5) / cos(w) * (1.0 + 0.04 * (1.0 - abs(w) / (seg * 0.5)));
           if (rho < rp || rho > 1.0) discard;
           float sp = fract((th + (rho - uAp) * 1.9) / seg);
           float seam = smoothstep(0.0, 0.035, sp) * smoothstep(1.0, 0.965, sp);
           diffuseColor.rgb *= mix(0.32, 1.0, seam) * (0.8 + 0.2 * smoothstep(uAp, 1.0, rho));
           diffuseColor.rgb += vec3(0.95, 0.58, 0.22) * uGlow * smoothstep(0.92, 1.0, rho);
           diffuseColor.rgb += vec3(0.55, 0.85, 1.0) * 0.28 * smoothstep(rp + 0.04, rp, rho);
         }`
      );
  };

  mat.userData.uniforms = uniforms;
  return mat;
}

// Helper to create a RoundedBoxGeometry safely
export function makeRoundedBox(w, h, d, radius = 0.05, segments = 2) {
  const r = Math.min(radius, Math.min(w, h, d) / 2.05);
  return new RoundedBoxGeometry(w, h, d, segments, r);
}

// Lathe geometry oriented along the X optical axis
export function makeOpticalLathe(points2D, radialSegments = 72, phiStart = 0, phiLength = Math.PI * 2) {
  const vecs = points2D.map(([x, r]) => new THREE.Vector2(Math.max(r, 0), x));
  const geo = new THREE.LatheGeometry(vecs, radialSegments, phiStart, phiLength);
  geo.rotateZ(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

// True spherical optical lens element geometry (oriented along X axis) anchored by its outer rim [xRim1, xRim2]
// so convex domes bulge smoothly outward from their metal holders and the two faces NEVER cross or invert!
export function createLensElementGeometry(radius, rimThickness, r1, r2, radialSegments = 96) {
  const steps = 28;
  const chamfer = Math.min(0.011, rimThickness * 0.18);
  const faceRadius = Math.max(0.05, radius - chamfer);

  function computeSag(R, y) {
    if (!R || R === 0) return 0;
    const absR = Math.abs(R);
    const clampedY = Math.min(y, absR * 0.96);
    return Math.sign(R) * (absR - Math.sqrt(Math.max(absR * absR - clampedY * clampedY, 0)));
  }

  // Anchor outer rim at [-rimThickness/2, +rimThickness/2]
  const xRim1 = -rimThickness * 0.5;
  const xRim2 = rimThickness * 0.5;
  const xEdge1 = xRim1 + chamfer;
  const xEdge2 = xRim2 - chamfer;

  const rimSag1 = computeSag(r1, faceRadius);
  const rimSag2 = computeSag(r2, faceRadius);

  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  // Helper to append a lathe ring segment from profile points with explicit analytical 2D normals (nx, nr)
  function addLatheSurface(ringPts) {
    const baseVertex = positions.length / 3;
    const numRings = ringPts.length;
    for (let i = 0; i < numRings; i++) {
      const [x, r, nx, nr] = ringPts[i];
      const vCoord = i / Math.max(1, numRings - 1);
      for (let s = 0; s <= radialSegments; s++) {
        const uCoord = s / radialSegments;
        const phi = uCoord * Math.PI * 2;
        const sinP = Math.sin(phi);
        const cosP = Math.cos(phi);

        positions.push(x, -sinP * r, cosP * r);
        normals.push(nx, -sinP * nr, cosP * nr);
        uvs.push(uCoord, vCoord);
      }
    }

    const stride = radialSegments + 1;
    for (let i = 0; i < numRings - 1; i++) {
      for (let s = 0; s < radialSegments; s++) {
        const a = baseVertex + i * stride + s;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }
  }

  // 1. Left / Rear-facing optical surface (anchored at xEdge1 at y = faceRadius; bulges left for r1 > 0)
  const face1Pts = [];
  for (let i = 0; i <= steps; i++) {
    const y = (faceRadius * i) / steps;
    const sag = computeSag(r1, y);
    const x = xEdge1 - (rimSag1 - sag);
    let nx = -1;
    let nr = 0;
    if (r1 !== 0) {
      const absR = Math.abs(r1);
      const clampedY = Math.min(y, absR * 0.96);
      const root = Math.sqrt(Math.max(absR * absR - clampedY * clampedY, 1e-5));
      const slope = (Math.sign(r1) * clampedY) / root;
      const len = Math.hypot(1, slope);
      nx = -1 / len;
      nr = slope / len;
    }
    face1Pts.push([x, y, nx, nr]);
  }
  addLatheSurface(face1Pts);

  // 2. Right / Front-facing optical surface (anchored at xEdge2 at y = faceRadius; bulges right for r2 > 0)
  const face2Pts = [];
  for (let i = steps; i >= 0; i--) {
    const y = (faceRadius * i) / steps;
    const sag = computeSag(r2, y);
    const x = xEdge2 + (rimSag2 - sag);
    let nx = 1;
    let nr = 0;
    if (r2 !== 0) {
      const absR = Math.abs(r2);
      const clampedY = Math.min(y, absR * 0.96);
      const root = Math.sqrt(Math.max(absR * absR - clampedY * clampedY, 1e-5));
      const slope = (Math.sign(r2) * clampedY) / root;
      const len = Math.hypot(1, slope);
      nx = 1 / len;
      nr = slope / len;
    }
    face2Pts.push([x, y, nx, nr]);
  }
  addLatheSurface(face2Pts);

  // 3. Precision 45-degree Chamfer Bevels & Ground Cylindrical Outer Rim (with hard normal breaks!)
  const invSqrt2 = 0.70710678;

  // Left 45° bevel chamfer
  addLatheSurface([
    [xEdge1, faceRadius, -invSqrt2, invSqrt2],
    [xRim1, radius, -invSqrt2, invSqrt2],
  ]);

  // Cylindrical ground-glass outer edge
  addLatheSurface([
    [xRim1, radius, 0, 1],
    [xRim2, radius, 0, 1],
  ]);

  // Right 45° bevel chamfer
  addLatheSurface([
    [xRim2, radius, invSqrt2, invSqrt2],
    [xEdge2, faceRadius, invSqrt2, invSqrt2],
  ]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

// Crisp machined involute spur gear geometry (oriented around X axis)
export function createGearGeometry(innerRadius, outerRadius, toothHeight, numTeeth, thickness) {
  const shape = new THREE.Shape();
  const pitch = (Math.PI * 2) / numTeeth;
  const rRoot = outerRadius;
  const rTip = outerRadius + toothHeight;

  for (let t = 0; t < numTeeth; t++) {
    const a0 = t * pitch;
    const a1 = a0 + pitch * 0.14;
    const a2 = a0 + pitch * 0.24;
    const a3 = a0 + pitch * 0.54;
    const a4 = a0 + pitch * 0.64;

    const p0x = Math.cos(a0) * rRoot;
    const p0y = Math.sin(a0) * rRoot;
    if (t === 0) shape.moveTo(p0x, p0y);
    else shape.lineTo(p0x, p0y);

    shape.lineTo(Math.cos(a1) * rRoot, Math.sin(a1) * rRoot);
    shape.lineTo(Math.cos(a2) * rTip, Math.sin(a2) * rTip);
    shape.lineTo(Math.cos(a3) * rTip, Math.sin(a3) * rTip);
    shape.lineTo(Math.cos(a4) * rRoot, Math.sin(a4) * rRoot);
  }
  shape.closePath();

  if (innerRadius > 0.001) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }

  const bevel = Math.min(0.009, thickness * 0.08, toothHeight * 0.18);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 48,
  });
  geo.translate(0, 0, -thickness / 2);
  geo.rotateY(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

// Ribbed / knurled cylindrical focus ring grip barrel along X axis
export function createRibbedBarrelGeometry(xStart, xEnd, innerR, outerR, numRibs = 60, ribDepth = 0.055) {
  const positions = [];
  const indices = [];
  const radialSteps = numRibs * 6;
  const bevel = 0.035;

  const rings = [
    [xStart, innerR],
    [xStart, outerR - ribDepth],
    [xStart + bevel, outerR],
    [xEnd - bevel, outerR],
    [xEnd, outerR - ribDepth],
    [xEnd, innerR],
  ];

  for (let rIdx = 0; rIdx < rings.length; rIdx++) {
    for (let u = 0; u <= radialSteps; u++) {
      const angle = (u / radialSteps) * Math.PI * 2;
      const frac = (u % 6) / 6;
      const isRaised = frac >= 0.17 && frac < 0.67;
      const rad =
        rIdx === 2 || rIdx === 3
          ? isRaised
            ? outerR
            : outerR - ribDepth
          : rings[rIdx][1];
      positions.push(rings[rIdx][0], -Math.sin(angle) * rad, Math.cos(angle) * rad);
    }
  }

  for (let rIdx = 0; rIdx < rings.length - 1; rIdx++) {
    for (let u = 0; u < radialSteps; u++) {
      const a = rIdx * (radialSteps + 1) + u;
      const b = a + 1;
      const c = a + radialSteps + 1;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  const nonIndexed = geo.toNonIndexed();
  nonIndexed.computeVertexNormals();
  return nonIndexed;
}

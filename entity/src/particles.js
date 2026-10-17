import * as THREE from 'three';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);

// ------------------------------------------------------------------ shards
export function createShards(envStorm) {
  const N = 150;
  const geo = new THREE.IcosahedronGeometry(1, 0);
  geo.scale(1, 0.07, 0.62);
  const porcelain = new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.32, metalness: 0, flatShading: true, envMap: envStorm, envMapIntensity: 1.2, emissive: 0xffeedd, emissiveIntensity: 0 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xb8b8bc, roughness: 0.12, metalness: 1, flatShading: true, envMap: envStorm, envMapIntensity: 1.6, emissive: 0xffeedd, emissiveIntensity: 0 });
  const meshes = [new THREE.InstancedMesh(geo, porcelain, N), new THREE.InstancedMesh(geo, chrome, N)];
  const group = new THREE.Group();
  const shards = [];
  meshes.forEach((m, mi) => {
    m.frustumCulled = false;
    group.add(m);
    for (let i = 0; i < N; i++) {
      const band = Math.random();
      const y = band < 0.45 ? rand(-0.85, -0.2) : band < 0.75 ? rand(-0.1, 0.35) : rand(-1.1, 1.0);
      shards.push({
        m, i,
        R: rand(0.55, 1.45), y, a: rand(0, TAU), w: rand(0.04, 0.2) * (Math.random() < 0.85 ? 1 : -1),
        bob: rand(0, TAU), axis: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(),
        spin: rand(0.2, 1.5), s: Math.pow(Math.random(), 2.2) * 0.045 + 0.008,
        off: new THREE.Vector3(), vel: new THREE.Vector3(), burstDir: new THREE.Vector3(rand(-1, 1), rand(-0.4, 1), rand(-1, 1)).normalize(),
      });
    }
  });

  const dummy = new THREE.Object3D();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3(), cp = new THREE.Vector3(), push = new THREE.Vector3();

  return {
    group, materials: [porcelain, chrome],
    // mouseRay is in group-local space
    update(t, dt, burst, fade, glow, mouseRay, mouseActive) {
      for (const s of shards) {
        s.a += s.w * dt * (1 + burst * 6);
        const R = Math.min(s.R * (1 + burst * burst * 3), 3.2);
        p.set(Math.cos(s.a) * R, s.y + Math.sin(t * 0.6 + s.bob) * 0.04 + burst * burst * s.burstDir.y * 2, Math.sin(s.a) * R);
        // cursor repulsion
        if (mouseActive) {
          mouseRay.closestPointToPoint(p, cp);
          const d = cp.distanceTo(p);
          if (d < 0.32) {
            push.subVectors(p, cp).normalize().multiplyScalar((0.32 - d) * 9 * dt * 2);
            s.vel.add(push);
          }
        }
        s.vel.addScaledVector(s.off, -6 * dt);
        s.vel.multiplyScalar(Math.exp(-3.2 * dt));
        s.off.addScaledVector(s.vel, dt);
        p.add(s.off);
        q.setFromAxisAngle(s.axis, t * s.spin * (1 + burst * 4) + s.bob);
        dummy.position.copy(p);
        dummy.quaternion.copy(q);
        dummy.scale.setScalar(s.s * fade * (1 - burst * 0.5));
        dummy.updateMatrix();
        s.m.setMatrixAt(s.i, dummy.matrix);
      }
      meshes.forEach(m => { m.instanceMatrix.needsUpdate = true; m.visible = fade > 0.001; });
      porcelain.emissiveIntensity = glow * 2.5;
      chrome.emissiveIntensity = glow * 2.5;
    },
  };
}

// ------------------------------------------------------------------ motes (dust, embers, fireflies)
const moteVert = /* glsl */`
attribute vec4 aSeed;
attribute vec4 aSeed2;
uniform float uTime, uZen, uPx, uBurst;
uniform vec3 uCenter, uRayO, uRayD;
uniform float uMouseOn;
varying vec3 vCol;
varying float vA;
#define TAU 6.2831853
vec3 drift(vec3 s, float t){
  return vec3(sin(t * 0.13 + s.x * 40.0) + sin(t * 0.31 + s.y * 23.0) * 0.5,
              sin(t * 0.17 + s.z * 31.0) * 0.6,
              cos(t * 0.11 + s.y * 37.0) + cos(t * 0.27 + s.x * 19.0) * 0.5);
}
void main(){
  float kind = aSeed2.x; // <0.55 dust, else ember
  vec3 pS, pZ; vec3 cS, cZ; float aS, aZ;
  // ---- unbound: dust in the beam + embers rising from the rings
  if (kind < 0.55){
    float r = sqrt(aSeed.x) * 2.4;
    float a = aSeed.y * TAU;
    pS = uCenter + vec3(cos(a) * r, aSeed.z * 3.6 - 1.2, sin(a) * r) + drift(aSeed.xyz, uTime) * 0.15;
    float cone = smoothstep(1.3, 0.2, length(pS.xz - uCenter.xz) - (3.4 - pS.y) * 0.12);
    cS = vec3(0.85, 0.86, 0.9);
    aS = (0.03 + 0.97 * cone * cone) * pow(aSeed2.y, 2.0) * 0.5;
  } else {
    float life = fract(uTime * (0.05 + aSeed.w * 0.08) + aSeed.x);
    float a = aSeed.y * TAU + uTime * 0.25 * (0.5 + aSeed.z) + life * 2.0;
    float r = mix(0.4, 1.0, aSeed.z) * (1.0 + life * 0.6);
    pS = uCenter + vec3(cos(a) * r, -0.8 + aSeed.w * 1.0 + life * 2.4, sin(a) * r) + drift(aSeed.xyz, uTime) * 0.08;
    cS = mix(vec3(1.0, 0.45, 0.12), vec3(1.0, 0.78, 0.4), aSeed2.y) * 2.5;
    aS = sin(life * 3.14159) * (0.5 + 0.5 * sin(uTime * 9.0 + aSeed.x * 50.0));
  }
  // burst outward during the awakening
  pS += normalize(pS - uCenter + vec3(0.0, 0.3, 0.0)) * uBurst * uBurst * (2.0 + aSeed.w * 3.0);

  // ---- padmasana: fireflies wandering over the water, prana rising from the figure
  if (aSeed2.z < 0.78){
    float r = 1.0 + sqrt(aSeed.x) * 6.0;
    float a = aSeed.y * TAU + uTime * 0.02 * (aSeed.z - 0.5);
    pZ = uCenter + vec3(cos(a) * r, 0.15 + aSeed.z * 2.6 - uCenter.y, sin(a) * r) + drift(aSeed.zxy, uTime * 0.6) * 0.45;
    float blink = smoothstep(0.55, 1.0, sin(uTime * (0.6 + aSeed.w) + aSeed.x * 40.0));
    cZ = mix(vec3(1.0, 0.82, 0.45), vec3(0.6, 0.95, 0.85), aSeed2.y) * 1.8;
    aZ = blink * pow(aSeed2.w, 1.5) * step(0.45, aSeed2.x);
  } else {
    float life = fract(uTime * (0.025 + aSeed.w * 0.03) + aSeed.x);
    float a = aSeed.y * TAU;
    float r = (0.15 + aSeed.z * 0.45) * (1.0 + life * 0.8);
    pZ = uCenter + vec3(cos(a) * r, -0.5 + life * 3.2, sin(a) * r) + drift(aSeed.xyz, uTime * 0.5) * 0.06 * life;
    cZ = vec3(1.0, 0.9, 0.75) * 1.6;
    aZ = sin(life * 3.14159) * 0.8;
  }
  vec3 p = mix(pS, pZ, uZen);
  // gentle repulsion from the cursor ray
  if (uMouseOn > 0.5){
    vec3 w = p - uRayO;
    vec3 c = uRayO + uRayD * max(dot(w, uRayD), 0.0);
    vec3 dv = p - c; float d = length(dv);
    p += dv / max(d, 1e-4) * smoothstep(0.45, 0.0, d) * 0.25;
  }
  vCol = mix(cS, cZ, uZen);
  vA = mix(aS, aZ, uZen);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = mix(mix(0.5, 1.3, aSeed2.y), mix(0.8, 2.2, aSeed2.w), uZen);
  if (kind >= 0.55) size *= mix(0.9, 1.0, uZen);
  gl_PointSize = min(uPx * size / -mv.z, 28.0);
  vA *= smoothstep(0.6, 1.8, -mv.z);
}`;
const moteFrag = /* glsl */`
varying vec3 vCol;
varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float s = smoothstep(0.5, 0.0, d);
  s = s * s + smoothstep(0.12, 0.0, d) * 0.6;
  gl_FragColor = vec4(vCol * s * vA, 1.0);
}`;

export function createMotes() {
  const N = 2400;
  const g = new THREE.BufferGeometry();
  const s1 = new Float32Array(N * 4), s2 = new Float32Array(N * 4);
  for (let i = 0; i < N * 4; i++) { s1[i] = Math.random(); s2[i] = Math.random(); }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(s1, 4));
  g.setAttribute('aSeed2', new THREE.BufferAttribute(s2, 4));
  const u = {
    uTime: { value: 0 }, uZen: { value: 0 }, uPx: { value: 6 }, uBurst: { value: 0 },
    uCenter: { value: new THREE.Vector3() }, uRayO: { value: new THREE.Vector3() }, uRayD: { value: new THREE.Vector3(0, 0, -1) }, uMouseOn: { value: 0 },
  };
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: u, vertexShader: moteVert, fragmentShader: moteFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  pts.frustumCulled = false;
  return { points: pts, uniforms: u };
}

// ------------------------------------------------------------------ petals
export function createPetals(env) {
  const N = 50;
  const geo = new THREE.PlaneGeometry(1, 1, 4, 4);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const w = 0.5 * Math.sin(Math.PI * (y + 0.5)) ** 0.7; // petal outline
    pos.setX(i, x * w * 1.6);
    pos.setZ(i, (x * x) * 0.5 - y * y * 0.15);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xfbe6ea, roughness: 0.5, metalness: 0, side: THREE.DoubleSide, envMap: env, envMapIntensity: 1.2, emissive: 0xc88f9a, emissiveIntensity: 0.25 });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.frustumCulled = false;
  const petals = Array.from({ length: N }, () => spawn({}, true));
  function spawn(p, initial) {
    p.x = rand(-4, 4); p.z = rand(-4, 2.5);
    p.y = initial ? rand(0, 5) : rand(4.5, 6);
    p.vy = rand(0.12, 0.22); p.ph = rand(0, TAU); p.spin = rand(0.4, 1.4);
    p.landed = 0; p.s = rand(0.05, 0.085); p.life = 0;
    p.axis = new THREE.Vector3(rand(-1, 1), rand(-0.3, 0.3), rand(-1, 1)).normalize();
    return p;
  }
  const d = new THREE.Object3D();
  return {
    mesh, material: mat,
    petals,
    update(t, dt, vis, ripple) {
      mesh.visible = vis > 0.001;
      for (let i = 0; i < N; i++) {
        const p = petals[i];
        if (!p.landed) {
          p.y -= p.vy * dt;
          p.x += Math.sin(t * 0.9 + p.ph) * 0.12 * dt;
          p.z += Math.cos(t * 0.7 + p.ph) * 0.08 * dt;
          d.position.set(p.x, p.y, p.z);
          d.rotation.set(Math.sin(t * p.spin + p.ph) * 0.9, t * 0.3 * p.spin + p.ph, Math.cos(t * p.spin * 0.8 + p.ph) * 0.7);
          if (p.y <= 0.012) { p.landed = 1; p.y = 0.012; p.ry = d.rotation.y; if (vis > 0.5 && ripple && Math.random() < 0.6) ripple(p.x, p.z, 0.25); }
        } else {
          p.life += dt;
          p.x += Math.sin(t * 0.2 + p.ph) * 0.02 * dt;
          p.z += Math.cos(t * 0.17 + p.ph) * 0.02 * dt;
          d.position.set(p.x, 0.012 + Math.sin(t * 0.8 + p.ph) * 0.003, p.z);
          d.rotation.set(-Math.PI / 2 + 0.25, 0, p.ry + p.life * 0.05);
          if (p.life > 30) spawn(p, false);
        }
        const fadeLand = p.landed ? Math.min(1, (30 - p.life) / 4) : 1;
        d.scale.setScalar(p.s * vis * Math.max(fadeLand, 0));
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ------------------------------------------------------------------ diyas (floating lamps)
const flameVert = /* glsl */`
attribute float aSeed;
uniform float uTime, uPx, uVis;
varying float vF;
void main(){
  vF = 0.82 + 0.18 * sin(uTime * 13.0 + aSeed * 30.0) * sin(uTime * 7.3 + aSeed * 11.0);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPx * uVis / -mv.z;
}`;
const flameFrag = /* glsl */`
varying float vF;
void main(){
  vec2 p = gl_PointCoord - 0.5; p.y = -p.y;
  // teardrop flame: narrow at top
  float w = mix(0.16, 0.04, clamp(p.y * 2.0 + 0.5, 0.0, 1.0));
  float core = smoothstep(w, 0.0, abs(p.x)) * smoothstep(0.42, 0.05, abs(p.y + 0.05));
  float halo = exp(-dot(p, p) * 24.0) * 0.35;
  vec3 c = vec3(1.0, 0.62, 0.22) * core * 4.0 * vF + vec3(1.0, 0.85, 0.6) * core * core * 6.0 + vec3(1.0, 0.45, 0.12) * halo;
  gl_FragColor = vec4(c, 1.0);
}`;

export function createDiyas(env, count) {
  const group = new THREE.Group();
  const prof = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; prof.push(new THREE.Vector2(0.01 + Math.sin(t * Math.PI * 0.5) * 0.05, -0.012 + t * t * 0.026)); }
  const bowlGeo = new THREE.LatheGeometry(prof, 24);
  const bowlMat = new THREE.MeshStandardMaterial({ color: 0x7a3a1e, roughness: 0.75, metalness: 0, envMap: env, envMapIntensity: 0.6, emissive: 0x401505, emissiveIntensity: 0.6, side: THREE.DoubleSide });
  const lamps = [];
  const fg = new THREE.BufferGeometry();
  const fpos = new Float32Array(count * 3), fseed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(bowlGeo, bowlMat);
    group.add(m);
    const r = rand(1.6, 4.6), a = (i / count) * TAU + rand(-0.3, 0.3);
    lamps.push({ m, r, a, w: rand(0.008, 0.02) * (Math.random() < 0.5 ? -1 : 1), ph: rand(0, TAU), pos: new THREE.Vector3() });
    fseed[i] = Math.random();
  }
  fg.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
  fg.setAttribute('aSeed', new THREE.BufferAttribute(fseed, 1));
  const fu = { uTime: { value: 0 }, uPx: { value: 60 }, uVis: { value: 0 } };
  const flames = new THREE.Points(fg, new THREE.ShaderMaterial({ uniforms: fu, vertexShader: flameVert, fragmentShader: flameFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  flames.frustumCulled = false;
  group.add(flames);
  return {
    group, lamps, uniforms: fu,
    update(t, dt, vis, cx, cz, pxScale) {
      fu.uTime.value = t; fu.uVis.value = vis; fu.uPx.value = 60 * pxScale;
      lamps.forEach((l, i) => {
        l.a += l.w * dt;
        const x = cx + Math.cos(l.a) * l.r, z = cz + Math.sin(l.a) * l.r;
        const y = 0.01 + Math.sin(t * 0.9 + l.ph) * 0.004;
        l.m.position.set(x, y, z);
        l.m.rotation.set(Math.sin(t * 0.7 + l.ph) * 0.05, l.a, Math.cos(t * 0.6 + l.ph) * 0.05);
        l.m.scale.setScalar(Math.max(vis, 0.0001));
        l.m.visible = vis > 0.001;
        l.pos.set(x, vis, z);
        fpos[i * 3] = x; fpos[i * 3 + 1] = y + 0.035 * vis; fpos[i * 3 + 2] = z;
      });
      fg.attributes.position.needsUpdate = true;
    },
  };
}

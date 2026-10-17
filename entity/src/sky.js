import * as THREE from 'three';

export const MOON_DIR = new THREE.Vector3(0.32, 0.26, -1).normalize();

const domeVert = /* glsl */`
varying vec3 vDir;
void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const domeFrag = /* glsl */`
uniform float uZen, uTime, uFlash;
uniform vec3 uMoon;
varying vec3 vDir;
float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main(){
  vec3 d = normalize(vDir);
  // unbound: charcoal studio void with a soft lit wall behind
  vec3 s = mix(vec3(0.010, 0.010, 0.011), vec3(0.05, 0.051, 0.055), smoothstep(-0.05, 0.7, d.y) * 0.7);
  s += vec3(0.06, 0.061, 0.064) * pow(max(dot(d, normalize(vec3(0.35, 0.42, -1.0))), 0.0), 7.0);
  s *= 0.75 + 0.25 * smoothstep(0.9, 0.2, abs(d.x));
  s += vec3(0.03, 0.022, 0.012) * exp(-abs(d.y - 0.02) * 14.0);
  // padmasana: indigo night, teal haze, moon and stars
  vec3 z = mix(vec3(0.016, 0.04, 0.052), vec3(0.006, 0.012, 0.035), smoothstep(0.0, 0.6, d.y));
  z += vec3(0.05, 0.1, 0.115) * exp(-abs(d.y) * 10.0) * 0.6;
  float m = max(dot(d, uMoon), 0.0);
  z += vec3(0.95, 0.97, 1.0) * smoothstep(0.99965, 0.9998, m) * 1.0;
  z += vec3(0.55, 0.7, 0.85) * (pow(m, 1500.0) * 0.3 + pow(m, 90.0) * 0.06 + pow(m, 10.0) * 0.025);
  vec3 sd = d * 380.0; vec3 cell = floor(sd);
  float h = hash(cell);
  float star = step(0.9965, h) * smoothstep(0.42, 0.0, length(fract(sd) - 0.5));
  star *= 0.5 + 0.5 * sin(uTime * (1.0 + h * 3.0) + h * 80.0);
  z += vec3(0.85, 0.9, 1.0) * star * 1.4 * smoothstep(0.02, 0.25, d.y);
  vec3 col = mix(s, z, uZen);
  gl_FragColor = vec4(col, 1.0);
}`;

const beamVert = /* glsl */`
varying vec3 vN; varying vec3 vW; varying float vY;
void main(){ vY = uv.y; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const beamFrag = /* glsl */`
uniform float uI, uTime;
uniform vec3 uCol;
varying vec3 vN; varying vec3 vW; varying float vY;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
void main(){
  vec3 v = normalize(cameraPosition - vW);
  float facing = pow(abs(dot(normalize(vN), v)), 3.0) * 0.5;
  float fall = smoothstep(0.0, 0.35, vY) * smoothstep(1.0, 0.55, vY);
  float a = atan(vW.z, vW.x);
  float streak = 0.65 + 0.35 * noise(vec2(a * 6.0, vW.y * 0.6 - uTime * 0.05));
  gl_FragColor = vec4(uCol * facing * fall * streak * uI, 1.0);
}`;

const mistVert = /* glsl */`
varying vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const mistFrag = /* glsl */`
uniform float uTime, uI, uSeed;
uniform vec3 uCol, uCenter;
varying vec3 vW;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * noise(p); p = p * 2.02 + 13.7; a *= 0.5; } return s; }
void main(){
  vec2 p = vW.xz * 0.28 + uSeed;
  float n = fbm(p + vec2(uTime * 0.02, uTime * 0.012) + fbm(p * 0.7 - uTime * 0.01));
  float d = length(vW.xz - uCenter.xz);
  float fade = smoothstep(26.0, 6.0, d) * smoothstep(0.4, 2.0, length(cameraPosition.xz - vW.xz) + abs(cameraPosition.y - vW.y) * 2.0);
  float a = smoothstep(0.35, 0.85, n) * fade * uI;
  gl_FragColor = vec4(uCol * a, a);
}`;

export function createSky() {
  const group = new THREE.Group();
  const domeU = { uZen: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 }, uMoon: { value: MOON_DIR.clone() } };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(90, 64, 32), new THREE.ShaderMaterial({
    uniforms: domeU, vertexShader: domeVert, fragmentShader: domeFrag, side: THREE.BackSide, depthWrite: false,
  }));
  dome.renderOrder = -3;
  dome.frustumCulled = false;
  group.add(dome);

  const beamU = { uI: { value: 0.05 }, uTime: { value: 0 }, uCol: { value: new THREE.Color(1, 0.96, 0.9) } };
  const beamGeo = new THREE.CylinderGeometry(0.25, 1.6, 6.5, 64, 1, true);
  beamGeo.translate(0, 3.25, 0);
  const beam = new THREE.Mesh(beamGeo, new THREE.ShaderMaterial({
    uniforms: beamU, vertexShader: beamVert, fragmentShader: beamFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  group.add(beam);

  const mists = [0.06, 0.22, 0.45].map((y, i) => {
    const u = { uTime: { value: 0 }, uI: { value: 0 }, uSeed: { value: i * 7.3 }, uCol: { value: new THREE.Color() }, uCenter: { value: new THREE.Vector3() } };
    const m = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShaderMaterial({
      uniforms: u, vertexShader: mistVert, fragmentShader: mistFrag,
      transparent: true, depthWrite: false, blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, side: THREE.DoubleSide,
    }));
    m.rotation.x = -Math.PI / 2; m.position.y = y;
    group.add(m);
    return { m, u, y };
  });

  const stormMist = new THREE.Color(0.05, 0.048, 0.045);
  const zenMist = new THREE.Color(0.07, 0.12, 0.14);
  return {
    group, dome, domeU, beam, beamU, mists,
    update(t, zen, cx, cz, beamTopY) {
      domeU.uZen.value = zen; domeU.uTime.value = t;
      beamU.uTime.value = t;
      beamU.uI.value = THREE.MathUtils.lerp(0.022, 0.012, zen);
      beamU.uCol.value.setRGB(1, 0.96, 0.9).lerp(new THREE.Color(0.7, 0.85, 1.0), zen);
      beam.position.set(cx, 0, cz);
      mists.forEach((m, i) => {
        m.u.uTime.value = t * (1 + i * 0.3);
        m.u.uI.value = THREE.MathUtils.lerp(0.35, 0.55 - i * 0.12, zen);
        m.u.uCol.value.copy(stormMist).lerp(zenMist, zen);
        m.u.uCenter.value.set(cx, 0, cz);
      });
    },
  };
}

// small studio scenes baked to PMREM for the standard-material props
export function createEnvMaps(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const build = (zen) => {
    const s = new THREE.Scene();
    const bg = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ color: zen ? 0x0d1d26 : 0x0b0b0c, side: THREE.BackSide }));
    s.add(bg);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(zen ? 0.6 : 3, zen ? 0.75 : 2.9, zen ? 0.95 : 2.7) }));
    top.position.y = 7; top.rotation.x = Math.PI / 2; s.add(top);
    const side = new THREE.Mesh(new THREE.PlaneGeometry(5, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.25, 0.27) }));
    side.position.set(6, 2, -5); side.lookAt(0, 0, 0); s.add(side);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6, 0.15, 8, 64), new THREE.MeshBasicMaterial({ color: zen ? new THREE.Color(1.2, 0.9, 0.6) : new THREE.Color(2.5, 1.4, 0.45) }));
    ring.rotation.x = Math.PI / 2; s.add(ring);
    if (zen) {
      const moon = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3.2, 3.5) }));
      moon.position.copy(MOON_DIR).multiplyScalar(9); s.add(moon);
    }
    const rt = pmrem.fromScene(s, 0.02);
    return rt.texture;
  };
  const storm = build(false), zen = build(true);
  pmrem.dispose();
  return { storm, zen };
}

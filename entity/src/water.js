import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

export const MAX_RIPPLES = 16;
export const MAX_LAMPS = 9;

const WaterShader = {
  name: 'EntityWater',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    uTime: { value: 0 },
    uZen: { value: 0 },
    uRipples: { value: [] },
    uCenter: { value: new THREE.Vector3() },
    uGold: { value: new THREE.Color() },
    uLamps: { value: [] },
    uLampOn: { value: 0 },
    uPulse: { value: 0 },
    uFlash: { value: 0 },
  },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    void main(){
      vUv = textureMatrix * vec4(position, 1.0);
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uZen, uLampOn, uPulse, uFlash;
    uniform vec4 uRipples[${MAX_RIPPLES}];
    uniform vec3 uLamps[${MAX_LAMPS}];
    uniform vec3 uCenter, uGold;
    varying vec4 vUv;
    varying vec3 vWorld;

    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
    }
    float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }

    // height field: slow swell + ring waves
    float height(vec2 p){
      float h = (fbm(p * 0.9 + vec2(uTime * 0.05, uTime * 0.03)) - 0.5) * 0.012;
      h += (noise(p * 6.0 - uTime * 0.25) - 0.5) * 0.0025 * (1.0 - uZen * 0.6);
      // standing concentric rings beneath the figure
      float rc = length(p - uCenter.xz);
      float spd = mix(0.45, 0.22, uZen);
      float wl = mix(16.0, 10.0, uZen);
      h += sin(rc * wl - uTime * spd * wl) * 0.006 * exp(-rc * 0.38) * smoothstep(0.0, 0.4, rc) * (1.0 + uPulse * 2.0);
      // touch ripples
      for (int i = 0; i < ${MAX_RIPPLES}; i++){
        vec4 r = uRipples[i];
        float age = uTime - r.z;
        if (r.w <= 0.0 || age < 0.0 || age > 9.0) continue;
        float d = length(p - r.xy);
        float front = age * 0.85;
        float x = d - front;
        float env = exp(-x * x * 3.0) * exp(-age * 0.45) / (1.0 + d * 1.2);
        h += sin(x * 26.0) * 0.02 * env * r.w * smoothstep(0.0, 0.25, front);
      }
      return h;
    }

    void main(){
      vec2 p = vWorld.xz;
      float dist = length(cameraPosition - vWorld);
      float e = 0.006 + dist * 0.0008;
      float h0 = height(p);
      vec3 n = normalize(vec3(-(height(p + vec2(e, 0.0)) - h0) / e, 1.0, -(height(p + vec2(0.0, e)) - h0) / e));
      vec3 v = normalize(cameraPosition - vWorld);

      vec2 duv = n.xz * mix(0.35, 0.25, uZen);
      vec4 uv = vUv; uv.xy += duv * uv.w;
      vec3 refl = texture2DProj(tDiffuse, uv).rgb;

      float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
      fres = mix(mix(0.55, 0.3, uZen), 1.0, fres);

      // deep body colour
      vec3 deep = mix(vec3(0.006, 0.006, 0.007), vec3(0.004, 0.018, 0.024), uZen);
      vec3 col = deep + refl * fres * mix(0.85, 0.9, uZen);

      // sheen from the overhead light / moon
      vec3 L = normalize(mix(vec3(-0.15, 1.0, -0.6), vec3(-0.3, 0.75, -0.6), uZen));
      vec3 H = normalize(L + v);
      float spec = pow(max(dot(n, H), 0.0), 220.0);
      col += mix(vec3(0.9, 0.88, 0.85), vec3(0.6, 0.75, 0.9), uZen) * spec * mix(1.4, 0.6, uZen);

      // pooled glow beneath the figure
      float rc = length(p - uCenter.xz);
      col += mix(uGold * 0.06, vec3(1.0, 0.85, 0.6) * 0.07, uZen) * exp(-rc * rc * 0.6) * (1.0 + uPulse);

      // lamps' warm pools
      for (int i = 0; i < ${MAX_LAMPS}; i++){
        float dl = length(p - uLamps[i].xz);
        col += vec3(1.0, 0.55, 0.2) * uLampOn * 0.05 * exp(-dl * dl * 9.0) * uLamps[i].y;
      }

      // fade into the void
      float fog = smoothstep(5.0, 40.0, length(p - uCenter.xz));
      vec3 horizon = mix(vec3(0.03, 0.029, 0.03), vec3(0.035, 0.075, 0.09), uZen);
      col = mix(col, horizon, fog);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createWater(renderer) {
  const geo = new THREE.PlaneGeometry(220, 220);
  const scale = 0.5;
  const w = Math.max(256, Math.floor(window.innerWidth * renderer.getPixelRatio() * scale));
  const h = Math.max(256, Math.floor(window.innerHeight * renderer.getPixelRatio() * scale));
  const water = new Reflector(geo, {
    shader: WaterShader,
    textureWidth: w,
    textureHeight: h,
    clipBias: 0.002,
    multisample: 0,
  });
  water.rotation.x = -Math.PI / 2;
  water.renderOrder = -2;
  const u = water.material.uniforms;
  u.uRipples.value = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0));
  u.uLamps.value = Array.from({ length: MAX_LAMPS }, () => new THREE.Vector3(0, 0, 1000));
  u.uCenter.value = new THREE.Vector3();

  let next = 0;
  return {
    mesh: water,
    uniforms: u,
    ripple(x, z, t, strength = 1) {
      u.uRipples.value[next].set(x, z, t, strength);
      next = (next + 1) % MAX_RIPPLES;
    },
    resize() {
      const pr = renderer.getPixelRatio();
      water.getRenderTarget().setSize(Math.floor(window.innerWidth * pr * scale), Math.floor(window.innerHeight * pr * scale));
    },
  };
}

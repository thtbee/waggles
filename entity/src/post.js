import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uFlash: { value: 0 },
    uZen: { value: 0 },
    uCA: { value: 1 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uFlash, uZen, uCA;
    uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * r2 * 0.004 * uCA * (1.0 + uFlash * 4.0);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + off).b;
      // grade: warm highlights / neutral shadows -> cool moonlit shadows
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 stormGrade = mix(vec3(0.97, 0.985, 1.02), vec3(1.04, 1.0, 0.95), smoothstep(0.1, 0.7, l));
      vec3 zenGrade = mix(vec3(0.94, 1.02, 1.06), vec3(1.03, 1.0, 0.97), smoothstep(0.2, 0.8, l));
      col *= mix(stormGrade, zenGrade, uZen);
      // vignette
      float vig = smoothstep(0.95, 0.25, length(c * vec2(1.0, 0.85)));
      col *= mix(0.55, 1.0, vig);
      // film grain
      float g = hash(vUv * uRes + fract(uTime * 7.31) * 100.0) - 0.5;
      col += g * 0.028 * (1.0 - l * 0.6);
      // awakening flash
      col = mix(col, vec3(1.0, 0.99, 0.97), uFlash);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createPost(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.85, 0.55, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const final = new ShaderPass(FinalShader);
  composer.addPass(final);
  return {
    composer, bloom, final,
    resize(w, h, pr) {
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
      final.uniforms.uRes.value.set(w * pr, h * pr);
    },
  };
}

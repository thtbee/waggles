import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  LENS_FRONT_X,
  VALLEY_MIN_X,
  VALLEY_MAX_X,
  VALLEY_HALF_Z,
  VALLEY_BASE_Y,
} from '../optics.js';

const FULLSCREEN_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Custom Scene Render Pass that renders both color and depth textures
class SceneDepthRenderPass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = true;

    const depthTexture = new THREE.DepthTexture(1, 1);
    depthTexture.type = THREE.UnsignedIntType;
    depthTexture.format = THREE.DepthFormat;

    this.renderTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthTexture,
      depthBuffer: true,
    });

    this.copyQuad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: { tDiffuse: { value: this.renderTarget.texture } },
        vertexShader: FULLSCREEN_VERT,
        fragmentShader: `
          uniform sampler2D tDiffuse;
          varying vec2 vUv;
          void main() {
            gl_FragColor = texture2D(tDiffuse, vUv);
          }
        `,
        depthTest: false,
        depthWrite: false,
      })
    );
  }

  getDepthTexture() {
    return this.renderTarget.depthTexture;
  }

  setSize(width, height) {
    this.renderTarget.setSize(width, height);
  }

  render(renderer, writeBuffer) {
    renderer.setRenderTarget(this.renderTarget);
    renderer.clear();
    renderer.render(this.scene, this.camera);

    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.copyQuad.render(renderer);
  }
}

// Custom Optical Depth-of-Field Pass:
// - Applies real-time thin-lens CoC blur inside the 3D miniature valley box based on Plane of Focus & Aperture
// - Applies subtle background camera DoF to the distant studio wall & plant
class OpticalDofPass extends Pass {
  constructor(camera, depthTexture) {
    super();
    this.camera = camera;

    const rtParams = { type: THREE.HalfFloatType };
    this.halfRT = new THREE.WebGLRenderTarget(1, 1, rtParams);
    this.blurRT = new THREE.WebGLRenderTarget(1, 1, rtParams);

    this.uniforms = {
      tColor: { value: null },
      tDepth: { value: depthTexture },
      tHalf: { value: this.halfRT.texture },
      tBlur: { value: this.blurRT.texture },
      near: { value: camera.near },
      far: { value: camera.far },
      camFocusDist: { value: 11.5 },
      camFocusRange: { value: 4.2 },
      maxCoc: { value: 6.8 },
      texel: { value: new THREE.Vector2(1 / 640, 1 / 360) },
      fullTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
      uInvProj: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      uBoxMin: {
        value: new THREE.Vector3(
          VALLEY_MIN_X - 0.06,
          VALLEY_BASE_Y + 0.02,
          -VALLEY_HALF_Z - 0.04
        ),
      },
      uBoxMax: {
        value: new THREE.Vector3(
          VALLEY_MAX_X + 0.04,
          VALLEY_BASE_Y + 1.92,
          VALLEY_HALF_Z + 0.04
        ),
      },
      // x: 1/focusD, y: cocScale (from aperture), z: enabled (1), w: LENS_FRONT_X
      uLens: { value: new THREE.Vector4(1 / 2.35, 28.0, 1.0, LENS_FRONT_X) },
    };

    const cocCalcGLSL = `
      uniform sampler2D tDepth;
      uniform float near;
      uniform float far;
      uniform float camFocusDist;
      uniform float camFocusRange;
      uniform float maxCoc;
      uniform mat4 uInvProj;
      uniform mat4 uCamWorld;
      uniform vec3 uBoxMin;
      uniform vec3 uBoxMax;
      uniform vec4 uLens;

      float computePixelCoc(vec2 uv) {
        float d = texture2D(tDepth, uv).x;
        float viewZ = near * far / ((far - near) * d - far) * -1.0;
        float c = 0.0;

        if (d < 0.9999) {
          vec4 clipPos = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          vec3 worldPos = (uCamWorld * vec4(clipPos.xyz / clipPos.w, 1.0)).xyz;

          // Subtle studio background DoF only on the distant studio wall & plant behind the bench
          float bgMask = smoothstep(-2.4, -4.2, worldPos.z);
          float camDiff = max(viewZ - camFocusDist - camFocusRange * 1.1, 0.0) * 0.35;
          c = min(camDiff, maxCoc * 0.65) * bgMask;

          // Physical thin-lens Circle of Confusion inside the 3D miniature valley diorama
          if (uLens.z > 0.0) {
            vec3 edgeDist = min(worldPos - uBoxMin, uBoxMax - worldPos);
            float inValley = smoothstep(0.0, 0.14, min(min(edgeDist.x, edgeDist.y), edgeDist.z));
            if (inValley > 0.0) {
              float subjD = max(worldPos.x - uLens.w, 0.12);
              float lensCoc = uLens.y * (1.0 / subjD - uLens.x) * uLens.z;
              c = mix(c, -sign(lensCoc) * min(abs(lensCoc), maxCoc), inValley);
            }
          }
        }
        return c;
      }
    `;

    // Pass 1: Downsample + compute signed Circle of Confusion in alpha channel
    this.preQuad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: FULLSCREEN_VERT,
        fragmentShader: `
          uniform sampler2D tColor;
          uniform vec2 fullTexel;
          varying vec2 vUv;
          ${cocCalcGLSL}
          void main() {
            vec2 o = fullTexel * 0.5;
            vec3 c = (
              texture2D(tColor, vUv + vec2(-o.x, -o.y)).rgb +
              texture2D(tColor, vUv + vec2( o.x, -o.y)).rgb +
              texture2D(tColor, vUv + vec2(-o.x,  o.y)).rgb +
              texture2D(tColor, vUv + vec2( o.x,  o.y)).rgb
            ) * 0.25;
            gl_FragColor = vec4(min(c, vec3(20.0)), computePixelCoc(vUv));
          }
        `,
        depthTest: false,
        depthWrite: false,
      })
    );

    // Pass 2: Golden-angle spiral disc gather bokeh blur
    this.blurQuad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: FULLSCREEN_VERT,
        fragmentShader: `
          uniform sampler2D tHalf;
          uniform vec2 texel;
          uniform float maxCoc;
          varying vec2 vUv;
          void main() {
            vec4 c0 = texture2D(tHalf, vUv);
            float cc = abs(c0.a);
            vec3 col = c0.rgb;
            float tot = 1.0;
            float nearBleed = 0.0;
            float r = 1.5;
            float ang = 0.0;
            for (int i = 0; i < 64; i++) {
              if (r >= maxCoc) break;
              vec2 tc = vUv + vec2(cos(ang), sin(ang)) * texel * r;
              vec4 s = texture2D(tHalf, tc);
              float sc = abs(s.a);
              if (s.a > c0.a) sc = min(sc, cc * 1.65);
              float m = smoothstep(r - 0.65, r + 0.65, sc);
              col += mix(col / tot, s.rgb, m);
              tot += 1.0;
              if (s.a < -0.5 && cc > 0.15) nearBleed = max(nearBleed, m * sc * 0.65);
              ang += 2.3999632;
              r += 1.85 / r;
            }
            gl_FragColor = vec4(col / tot, max(cc, nearBleed));
          }
        `,
        depthTest: false,
        depthWrite: false,
      })
    );

    // Pass 3: Composite blurred disc layer with crisp sharp in-focus pixels
    this.compQuad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: FULLSCREEN_VERT,
        fragmentShader: `
          uniform sampler2D tColor;
          uniform sampler2D tBlur;
          varying vec2 vUv;
          void main() {
            vec3 sharpCol = texture2D(tColor, vUv).rgb;
            vec4 blurSample = texture2D(tBlur, vUv);
            float blend = smoothstep(0.45, 1.65, blurSample.a);
            gl_FragColor = vec4(mix(sharpCol, blurSample.rgb, blend), 1.0);
          }
        `,
        depthTest: false,
        depthWrite: false,
      })
    );
  }

  setSize(width, height) {
    const hw = Math.max(1, Math.ceil(width / 2));
    const hh = Math.max(1, Math.ceil(height / 2));
    this.halfRT.setSize(hw, hh);
    this.blurRT.setSize(hw, hh);
    this.uniforms.texel.value.set(1 / hw, 1 / hh);
    this.uniforms.fullTexel.value.set(1 / width, 1 / height);
  }

  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tColor.value = readBuffer.texture;
    this.uniforms.near.value = this.camera.near;
    this.uniforms.far.value = this.camera.far;
    this.uniforms.uInvProj.value.copy(this.camera.projectionMatrixInverse);
    this.uniforms.uCamWorld.value.copy(this.camera.matrixWorld);

    renderer.setRenderTarget(this.halfRT);
    this.preQuad.render(renderer);

    renderer.setRenderTarget(this.blurRT);
    this.blurQuad.render(renderer);

    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.compQuad.render(renderer);
  }
}

export function createPostProcessingPipeline(renderer, scene, camera, pixelRatio) {
  const composer = new EffectComposer(
    renderer,
    new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
    })
  );
  composer.setPixelRatio(pixelRatio);

  const sceneDepthPass = new SceneDepthRenderPass(scene, camera);
  composer.addPass(sceneDepthPass);

  const bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.34, 0.48, 1.12);
  composer.addPass(bloomPass);

  const dofPass = new OpticalDofPass(camera, sceneDepthPass.getDepthTexture());
  composer.addPass(dofPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  function updateOpticalParams(focusD, apertureN, cameraTargetDist = 11.5) {
    // Scale valley optical blur inversely with f-number (f/2 -> strong blur, f/16 -> crisp deep DoF)
    const cocStrength = (2 / apertureN) * 32.0;
    dofPass.uniforms.uLens.value.set(1 / Math.max(focusD, 0.08), cocStrength, 1.0, LENS_FRONT_X);
    dofPass.uniforms.camFocusDist.value = cameraTargetDist;
  }

  return {
    composer,
    dofPass,
    bloomPass,
    updateOpticalParams,
  };
}

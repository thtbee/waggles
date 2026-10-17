import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Skeleton. Object space, figure faces +z, figure-left is +x.
// Two poses: "unbound" (levitating, arms open low) and "padmasana" (full lotus,
// each foot on the opposite thigh soles-up, spine erect, hands in jnana mudra).
// ---------------------------------------------------------------------------
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const STAND = [
  V(0, -0.06, 0),          // 0 pelvis
  V(0, 0.33, 0.01),        // 1 chest
  V(0, 0.565, 0.012),      // 2 neck (base of skull)
  V(0, 0.685, 0.03),       // 3 head
  V(0.158, 0.448, -0.012),  // 4 shoulder L
  V(0.29, 0.2, 0.035),     // 5 elbow L
  V(0.405, -0.05, 0.11),   // 6 wrist L
  V(0.47, -0.21, 0.17),    // 7 hand dir L
  V(-0.158, 0.448, -0.012), // 8 shoulder R
  V(-0.29, 0.205, 0.045),  // 9 elbow R
  V(-0.415, -0.04, 0.12),  // 10 wrist R
  V(-0.49, -0.2, 0.18),    // 11 hand dir R
  V(0.083, -0.13, 0),      // 12 hip L
  V(0.072, -0.57, 0.045),  // 13 knee L
  V(0.062, -1.0, -0.025),  // 14 ankle L
  V(0.066, -1.2, 0.025),   // 15 toe L
  V(-0.083, -0.13, 0),     // 16 hip R
  V(-0.058, -0.56, 0.08),  // 17 knee R
  V(-0.052, -0.985, 0.0),  // 18 ankle R
  V(-0.05, -1.185, 0.05),  // 19 toe R
  V(0.0, -0.2, 1),         // 20 head forward
  V(0.07, 1, 0.18),        // 21 head up
  V(0.3, -0.45, 1),        // 22 palm normal L
  V(-0.3, -0.45, 1),       // 23 palm normal R
  V(0, 0.05, 1),           // 24 foot dorsal L
  V(0, 0.05, 1),           // 25 foot dorsal R
];

const LOTUS = [
  V(0, -0.36, 0),
  V(0, 0.02, 0.0),
  V(0, 0.255, 0.005),
  V(0, 0.375, 0.03),
  V(0.156, 0.148, -0.022),
  V(0.245, -0.11, 0.1),
  V(0.35, -0.365, 0.245),
  V(0.395, -0.41, 0.41),
  V(-0.156, 0.148, -0.022),
  V(-0.245, -0.11, 0.1),
  V(-0.35, -0.365, 0.245),
  V(-0.395, -0.41, 0.41),
  V(0.09, -0.43, 0.0),
  V(0.38, -0.5, 0.27),
  V(-0.06, -0.355, 0.13),   // left ankle rests on the right thigh, by the groin
  V(-0.245, -0.335, 0.2),
  V(-0.09, -0.43, 0.0),
  V(-0.38, -0.5, 0.27),
  V(0.06, -0.3, 0.18),      // right ankle over the left shin, on the left thigh
  V(0.245, -0.28, 0.25),
  V(0, -0.14, 1),
  V(0, 1, 0.14),
  V(0.06, 1, -0.12),        // palms up
  V(-0.06, 1, -0.12),
  V(0, -1, 0.0),            // soles up -> dorsum faces down
  V(0, -1, 0.0),
];

export const BOX_MIN = new THREE.Vector3(-0.9, -1.3, -0.72);
export const BOX_MAX = new THREE.Vector3(0.9, 0.9, 0.82);

const vert = /* glsl */`
varying vec3 vWorld;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const frag = /* glsl */`
precision highp float;
varying vec3 vWorld;
uniform vec3 uJ[26];
uniform mat4 uInvModel, uModel, uProj;
uniform vec3 uBoxMin, uBoxMax;
uniform float uTime, uMorph, uZen, uGlow, uCrack, uLowQ, uBreath, uAura;
uniform vec4 uSkirt;   // yTop, yBot, rTop, rBot
uniform vec2 uSkirt2;  // fold amplitude, hem swing
uniform vec4 uFingL, uFingR; // curl: index, middle, ring, pinky
uniform vec2 uMudra;
uniform vec3 uRingL[3];
uniform vec4 uRingC[3]; // y, radius, intensity
uniform vec3 uGold;
uniform vec4 uMouse;

#define PI 3.14159265
#define ZERO min(int(uTime), 0)
#define FLAKE 36.0
#define GRAIN 105.0

float smin(float a, float b, float k){ float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float smax(float a, float b, float k){ return -smin(-a, -b, k); }
float sdCap(vec3 p, vec3 a, vec3 b, float r){ vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
float sdTaper(vec3 p, vec3 a, vec3 b, float r1, float r2){ vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - mix(r1, r2, h); }
float sdEll(vec3 p, vec3 r){ float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / max(k1, 1e-5); }
float hash1(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
vec3 hash3(vec3 p){
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}

// voronoi: x = F1, y = F2-F1 (edge), z = cell hash; toC = direction from feature point to p
vec3 voronoi(vec3 x, out vec3 cellId, out vec3 toC){
  vec3 n = floor(x), f = fract(x);
  float f1 = 8.0, f2 = 8.0; vec3 id = vec3(0.0); vec3 best = vec3(0.0);
  for (int k = ZERO - 1; k <= 1; k++) for (int j = ZERO - 1; j <= 1; j++) for (int i = ZERO - 1; i <= 1; i++){
    vec3 g = vec3(float(i), float(j), float(k));
    vec3 o = hash3(n + g) * 0.85 + 0.075;
    vec3 rr = g + o - f;
    float d = dot(rr, rr);
    if (d < f1){ f2 = f1; f1 = d; id = n + g; best = rr; } else if (d < f2) f2 = d;
  }
  cellId = id; toC = -best;
  return vec3(sqrt(f1), sqrt(f2) - sqrt(f1), hash1(id));
}

// ---------------- hands ----------------
float finger(vec3 p, vec3 b, vec3 dir, vec3 pn, vec3 L, float c, float r, out vec3 tip){
  pn = normalize(pn - dir * dot(pn, dir));
  vec3 d1 = normalize(dir * cos(c * 0.55) + pn * sin(c * 0.55));
  vec3 m1 = b + d1 * L.x;
  vec3 d2 = normalize(dir * cos(c * 1.55) + pn * sin(c * 1.55));
  vec3 m2 = m1 + d2 * L.y;
  vec3 d3 = normalize(dir * cos(c * 2.35) + pn * sin(c * 2.35));
  tip = m2 + d3 * L.z;
  float d = sdTaper(p, b, m1, r, r * 0.9);
  d = smin(d, sdTaper(p, m1, m2, r * 0.88, r * 0.8), 0.004);
  d = smin(d, sdTaper(p, m2, tip, r * 0.78, r * 0.66), 0.003);
  return d;
}
float sdHand(vec3 p, vec3 w, vec3 hd, vec3 pn, vec4 cu, float mudra, float ts){
  vec3 ax = normalize(hd - w);
  pn = normalize(pn - ax * dot(pn, ax));
  vec3 sd = cross(ax, pn) * ts;           // toward the thumb side
  float bd = length(p - (w + ax * 0.085)) - 0.14;
  if (bd > 0.03) return bd;
  // palm: slightly cupped plate
  vec3 q = p - (w + ax * 0.048);
  vec3 ql = vec3(dot(q, sd), dot(q, ax), dot(q, pn));
  ql.z += ql.x * ql.x * 2.2;
  float d = sdEll(ql, vec3(0.037, 0.05, 0.0135));
  d = smin(d, sdEll(q + ax * 0.03, vec3(0.026, 0.024, 0.018)), 0.02);     // wrist heel
  vec3 kb = w + ax * 0.092;
  vec3 tI, tM, tR, tP, tT;
  float f = finger(p, kb + sd * 0.024 - ax * 0.002, normalize(ax + sd * 0.1), pn, vec3(0.034, 0.021, 0.018), cu.x, 0.0082, tI);
  f = min(f, finger(p, kb + sd * 0.008 + ax * 0.003, normalize(ax + sd * 0.02), pn, vec3(0.038, 0.024, 0.019), cu.y, 0.0085, tM));
  f = min(f, finger(p, kb - sd * 0.009, normalize(ax - sd * 0.07), pn, vec3(0.035, 0.022, 0.018), cu.z, 0.0081, tR));
  f = min(f, finger(p, kb - sd * 0.025 - ax * 0.008, normalize(ax - sd * 0.17), pn, vec3(0.028, 0.017, 0.016), cu.w, 0.0072, tP));
  // thumb: relaxed, or reaching the index tip (jnana mudra)
  vec3 tb = w + ax * 0.018 + sd * 0.026 + pn * 0.01;
  vec3 relaxed = normalize(ax * 0.55 + sd * 0.7 + pn * 0.42);
  vec3 tgt = tI - pn * 0.004;
  vec3 d0 = normalize(mix(relaxed, normalize(tgt - tb), mudra * 0.65));
  vec3 m1 = tb + d0 * 0.036;
  vec3 dr = normalize(mix(normalize(ax * 0.75 + sd * 0.35 + pn * 0.45), normalize(tgt - m1), mudra));
  float l2 = mix(0.05, min(length(tgt - m1), 0.06), mudra);
  vec3 tt = m1 + dr * l2;
  float th = smin(sdTaper(p, tb, m1, 0.0115, 0.0098), sdTaper(p, m1, tt, 0.0095, 0.0075), 0.005);
  f = min(f, th);
  return smin(d, f, 0.009);
}

// ---------------- feet ----------------
float sdFoot(vec3 p, vec3 an, vec3 toe, vec3 dors){
  vec3 fx = normalize(toe - an);
  vec3 up = normalize(dors - fx * dot(dors, fx));
  vec3 sd = cross(fx, up);
  vec3 q = p - an;
  q = vec3(dot(q, sd), dot(q, up), dot(q, fx));
  float bd = length(q - vec3(0.0, 0.0, 0.08)) - 0.15;
  if (bd > 0.03) return bd;
  float d = sdEll(q - vec3(0.0, -0.012, -0.012), vec3(0.03, 0.034, 0.036));          // heel / ankle
  d = smin(d, sdEll(q - vec3(0.0, -0.006, 0.07), vec3(0.036, 0.024, 0.075)), 0.03);  // instep
  d = smin(d, sdEll(q - vec3(0.004, -0.01, 0.15), vec3(0.04, 0.015, 0.035)), 0.025);  // ball & toes
  d = smax(d, -(q.y + 0.034), 0.02);                                                   // flat-ish sole
  // five toes, graded
  for (int i = ZERO; i < 5; i++){
    float fi = float(i);
    vec3 tp = vec3(-0.028 + fi * 0.0135, -0.016, 0.182 - fi * fi * 0.0016 - fi * 0.004);
    d = smin(d, sdEll(q - tp, vec3(0.0072, 0.0075, 0.012) * (fi < 0.5 ? 1.35 : 1.0 - fi * 0.04)), 0.008);
  }
  return d;
}

// ---------------- head: featureless, calm, mask-like ----------------
float sdHead(vec3 p){
  vec3 hc = uJ[3];
  vec3 hf = normalize(uJ[20]);
  vec3 hu = normalize(uJ[21] - hf * dot(uJ[21], hf));
  vec3 hr = cross(hu, hf);
  vec3 q = vec3(dot(p - hc, hr), dot(p - hc, hu), dot(p - hc, hf));
  float bd = length(q) - 0.15;
  if (bd > 0.04) return bd;
  q /= 0.92;
  float d = sdEll(q - vec3(0.0, 0.022, -0.012), vec3(0.087, 0.094, 0.1));            // cranium
  d = smin(d, sdEll(q - vec3(0.0, -0.036, 0.02), vec3(0.066, 0.07, 0.076)), 0.06);   // face & jaw, one soft mass
  d = smin(d, sdEll(q - vec3(0.0, -0.082, 0.032), vec3(0.032, 0.026, 0.032)), 0.04); // chin
  d = smax(d, q.z - 0.1 + q.y * 0.04, 0.07);                                         // calm frontal plane
  float jm = uMorph;
  if (jm > 0.01) {
    // hair swept back from a soft hairline, gathered into a jata knot, locks falling behind
    float hair = sdEll(q - vec3(0.0, 0.032, -0.026), vec3(0.092, 0.098, 0.1));
    hair = smax(hair, q.z - 0.012 + q.y * 0.75, 0.025);
    hair = smin(hair, sdEll(q - vec3(0.0, -0.06, -0.088), vec3(0.058, 0.1, 0.032)), 0.035);
    vec3 bq = q - vec3(0.0, 0.112, -0.03);
    float jata = sdEll(bq, vec3(0.052, 0.045, 0.05));
    jata = smin(jata, sdEll(bq - vec3(0.0, 0.03, 0.0), vec3(0.03, 0.03, 0.03)), 0.02);
    hair = smin(hair, jata, 0.025);
    float strands = sin(atan(q.x, -q.z) * 34.0 + q.y * 30.0) * 0.0018 + sin(atan(bq.z, bq.x) * 9.0 + bq.y * 90.0) * 0.002 * smoothstep(0.08, 0.04, length(bq));
    hair -= strands;
    hair = mix(d + 0.02, hair, jm);
    d = smin(d, hair, 0.012);
  }
  d *= 0.92;
  return d;
}

// ---------------- beaded collar: strands stacked around the neck, resting on it ----------------
float sdBeads(vec3 p){
  vec3 nb = uJ[1] + vec3(0.0, 0.1, -0.016);
  vec3 ax = normalize(uJ[2] - nb);
  float bd = length(p - nb - ax * 0.07) - 0.12;
  if (bd > 0.02) return bd;
  vec3 sx = normalize(cross(ax, vec3(0.0, 0.0, 1.0)));
  vec3 sz = cross(sx, ax);
  vec3 q0 = p - nb;
  q0 = vec3(dot(q0, sx), dot(q0, ax), dot(q0, sz));
  float d = 1e5;
  for (int k = ZERO; k < 7; k++){
    float fk = float(k);
    float rb = 0.0084 - 0.0003 * fk;
    // lower strands spread onto the trapezius, upper ones hug the throat
    float h = 0.028 + 0.0138 * fk;
    float neckR = mix(0.044, 0.039, h / 0.135);
    float R = neckR + rb + 0.006 + 0.034 * exp(-fk * 0.8);
    float tilt = 0.34 * exp(-fk * 0.3);
    vec3 q = q0 - vec3(0.0, h, 0.0);
    float cs = cos(tilt), sn = sin(tilt);
    q = vec3(q.x, cs * q.y + sn * q.z, -sn * q.y + cs * q.z);
    float n = floor(2.0 * PI * R / (rb * 2.05));
    float sector = 2.0 * PI / n;
    float a = atan(q.z, q.x) + fk * 0.37;
    float ac = (floor(a / sector) + 0.5) * sector - fk * 0.37;
    vec3 c = vec3(cos(ac), 0.0, sin(ac)) * R;
    d = min(d, length(q - c) - rb);
  }
  return d;
}

// ---------------- full figure ----------------
// returns distance, material: 0 dark crystal, 1 porcelain, 2 beads
vec2 map(vec3 p){
  vec3 pel = uJ[0], ch = uJ[1], nk = uJ[2];
  float morph = uMorph;

  // torso
  float t = sdEll(p - ch, vec3(0.132, 0.12, 0.088));
  t = smin(t, sdEll(p - mix(pel, ch, 0.47), vec3(0.106, 0.13, 0.08)), 0.08);
  t = smin(t, sdEll(p - pel, vec3(0.128, 0.1, 0.094)), 0.07);
  vec3 nb = ch + vec3(0.0, 0.1, -0.016);
  vec3 trap = mix(nb, nk, 0.35);
  t = smin(t, sdTaper(p, nb, nk, 0.044, 0.039), 0.04);                           // neck
  // sloping trapezius into a soft shoulder cap (no ball joints)
  t = smin(t, sdTaper(p, trap, uJ[4] + vec3(-0.012, 0.004, -0.006), 0.04, 0.034), 0.06);
  t = smin(t, sdTaper(p, trap, uJ[8] + vec3(0.012, 0.004, -0.006), 0.04, 0.034), 0.06);
  // robe over the left shoulder, under the right arm, with diagonal drape folds
  vec2 rel = p.xy - ch.xy - vec2(0.19, 0.17);
  vec2 bn = normalize(vec2(-0.34, 0.312));
  float s = dot(rel, bn);
  float clothM = 1.0 - smoothstep(-0.012, 0.0, s);
  float drape = sin(dot(p.xy - ch.xy, bn) * 70.0 + p.z * 12.0) * 0.0035 + sin(dot(p.xy - ch.xy, bn) * 31.0) * 0.004;
  t -= clothM * (0.007 + drape * smoothstep(-0.02, -0.12, s)) + 0.006 * exp(-pow((s + 0.008) / 0.009, 2.0));
  vec2 r = vec2(t, s < 0.0 ? 1.0 : 0.0);

  // head
  float h = sdHead(p);
  if (h < r.x + 0.05) { float nd = smin(r.x, h, 0.035); if (h < r.x) r.y = 0.0; r.x = nd; }

  // arms
  float aL = smin(sdTaper(p, uJ[4] + vec3(-0.01, -0.012, 0.0), uJ[5], 0.044, 0.035), sdTaper(p, uJ[5], mix(uJ[5], uJ[6], 0.45), 0.037, 0.033), 0.025);
  aL = smin(aL, sdTaper(p, mix(uJ[5], uJ[6], 0.45), uJ[6], 0.033, 0.025), 0.02);
  float aR = smin(sdTaper(p, uJ[8] + vec3(0.01, -0.012, 0.0), uJ[9], 0.044, 0.035), sdTaper(p, uJ[9], mix(uJ[9], uJ[10], 0.45), 0.037, 0.033), 0.025);
  aR = smin(aR, sdTaper(p, mix(uJ[9], uJ[10], 0.45), uJ[10], 0.033, 0.025), 0.02);
  aL = smin(aL, sdHand(p, uJ[6], uJ[7], uJ[22], uFingL, uMudra.x, -1.0), 0.016);
  aR = smin(aR, sdHand(p, uJ[10], uJ[11], uJ[23], uFingR, uMudra.y, 1.0), 0.016);
  { float nd = smin(r.x, aR, 0.05); if (aR < r.x) r.y = 0.0; r.x = nd; }
  { float nd = smin(r.x, aL, 0.05); if (aL < r.x) r.y = 0.0; r.x = nd; }

  // left bell sleeve: hangs with gravity below the forearm, open cuff
  {
    vec3 axF = normalize(uJ[6] - uJ[5]);
    vec3 cuff = uJ[6] - axF * 0.01 + vec3(0.0, -0.1, 0.0) * (1.0 - morph * 0.5);
    vec3 mid = mix(uJ[5], cuff, 0.5) + vec3(0.0, -0.02, 0.0);
    float sl = sdTaper(p, uJ[4] + vec3(-0.02, -0.004, 0.0), uJ[5], 0.05, 0.058);
    vec3 sa = normalize(cuff - mid);
    vec3 ra = p - mid;
    float ang = atan(dot(ra, cross(sa, vec3(0.0, 1.0, 0.0))), ra.y);
    float sf = (sin(ang * 6.0 + dot(ra, sa) * 14.0) * 0.6 + sin(ang * 11.0 - dot(ra, sa) * 25.0) * 0.4) * 0.008 * smoothstep(-0.06, 0.1, dot(ra, sa));
    float bell = smin(sdTaper(p, uJ[5], mid, 0.064, 0.085), sdTaper(p, mid, cuff, 0.085, 0.12 - 0.03 * morph), 0.03) - sf;
    bell = max(abs(bell) - 0.009, dot(p - cuff, sa));
    sl = smin(sl, bell, 0.025);
    if (sl < r.x + 0.03) { float nd = smin(r.x, sl, 0.02); if (sl < r.x) r.y = 1.0; r.x = nd; }
  }

  // legs: bare crystal (unbound) -> robe-covered (lotus)
  float cl = morph;
  float lL = smin(sdTaper(p, uJ[12], uJ[13], 0.068 + 0.022 * cl, 0.046 + 0.022 * cl), sdTaper(p, uJ[13], uJ[14], 0.043 + 0.018 * cl, 0.028 + 0.006 * cl), 0.03);
  float lR = smin(sdTaper(p, uJ[16], uJ[17], 0.068 + 0.022 * cl, 0.046 + 0.022 * cl), sdTaper(p, uJ[17], uJ[18], 0.043 + 0.018 * cl, 0.028 + 0.006 * cl), 0.03);
  float legs = smin(lL, lR, 0.02 + 0.03 * cl);
  if (cl > 0.01) {
    // the robe drapes from knee to knee and settles into a seat
    vec3 lp = p - pel - vec3(0.0, -0.135, 0.11);
    float seat = sdEll(lp, vec3(0.37, 0.035, 0.23) * cl + 0.001);
    seat -= 0.004 * sin(atan(lp.z, lp.x) * 11.0 + length(lp.xz) * 25.0) * smoothstep(0.12, 0.35, length(lp.xz));
    legs = smin(legs, seat, 0.05);
    legs -= 0.003 * sin(p.x * 60.0 + p.z * 25.0) * cl;
  }
  { float nd = smin(r.x, legs, 0.05); if (legs < r.x) r.y = cl > 0.5 ? 1.0 : 0.0; r.x = nd; }

  // feet
  float ft = min(sdFoot(p, uJ[14], uJ[15], uJ[24]), sdFoot(p, uJ[18], uJ[19], uJ[25]));
  { float nd = smin(r.x, ft, 0.03); if (ft < r.x) r.y = 0.0; r.x = nd; }

  // skirt: cloth falling from the hips in deep folds, flaring and swirling into an uneven hem
  {
    float yT = uSkirt.x, yB = uSkirt.y;
    vec3 sp = p - vec3(pel.x, 0.0, pel.z);
    float th = atan(sp.z, sp.x);
    float tt = clamp((yT - p.y) / max(yT - yB, 1e-3), 0.0, 1.0);
    float swirl = tt * tt * (0.5 * sin(uTime * 0.31) + 0.25);
    float x = th + swirl;
    // folds: rounded ridges, deep pinched valleys, more of them toward the hem
    float f1 = 1.0 - 2.0 * pow(abs(sin(x * 4.0 + 0.6)), 0.65);
    float f2 = 1.0 - 2.0 * pow(abs(sin(x * 7.0 + tt * 1.8 - uTime * 0.17)), 0.8);
    float f3 = sin(x * 15.0 + tt * 6.0 + uTime * 0.4);
    float fold = 0.55 * f1 + 0.35 * f2 * smoothstep(0.1, 0.6, tt) + 0.1 * f3 * tt;
    float bellP = pow(tt, 1.5);
    float flare = 1.0 + 0.18 * tt * tt * sin(th * 2.0 + uTime * 0.25 + 1.0);
    float bellR = mix(uSkirt.z * 0.7, uSkirt.w, bellP) * flare + uSkirt2.x * pow(tt, 1.1) * fold;
    float hugR = uSkirt.z * mix(0.97, 1.1, smoothstep(0.0, 0.3, tt));
    float rad = smax(hugR, bellR, 0.035);
    float q = length(vec2(sp.x, sp.z / 0.84)) - rad;
    float shell = abs(q * 0.84) - 0.011 * smoothstep(0.0, 0.05, tt) - 0.001;
    float hem = yB + uSkirt2.y * (0.075 * sin(th * 2.0 + 2.4 + uTime * 0.2) + 0.035 * sin(th * 5.0 + uTime * 0.55) + 0.018 * f2);
    float sk = max(shell, max(p.y - yT, hem - p.y)) * 0.65;
    if (sk < r.x + 0.03) { float nd = smin(r.x, sk, 0.05); if (sk < r.x) r.y = 1.0; r.x = nd; }
  }

  // waist sash: a rolled, twisted cloth band where bodice meets skirt
  if (morph < 0.99) {
    vec3 wp = p - vec3(pel.x, pel.y + 0.1, pel.z);
    float wa = atan(wp.z, wp.x);
    float wr = length(vec2(wp.x, wp.z / 0.8)) - 0.128;
    float twist = 0.004 * sin(wa * 14.0 + wp.y * 80.0);
    float sash = length(vec2(wr * 0.8, wp.y + 0.006 * sin(wa * 3.0))) - (0.015 + twist) * (1.0 - morph);
    // knot with falling tail at the left hip
    vec3 kp = p - vec3(pel.x + 0.11, pel.y + 0.09, pel.z + 0.06);
    sash = smin(sash, sdEll(kp, vec3(0.024, 0.02, 0.018) * (1.0 - morph) + 0.001), 0.01);
    sash = smin(sash, sdTaper(p, kp + vec3(pel.x + 0.11, pel.y + 0.09, pel.z + 0.06) - kp + vec3(0.0, -0.01, 0.005), vec3(pel.x + 0.14, pel.y - 0.16, pel.z + 0.09), 0.012, 0.018) + 0.03 * morph, 0.01);
    if (sash < r.x + 0.02) { float nd = smin(r.x, sash, 0.012); if (sash < r.x) r.y = 1.0; r.x = nd; }
  }

  // beads
  float b = sdBeads(p);
  if (b < r.x) r = vec2(b, 2.0);

  // porcelain flakes: lifted plates, crack gaps, a few missing shards (real geometry)
  if (r.y > 0.5 && r.y < 1.5 && r.x < 0.012 && uLowQ < 0.5) {
    vec3 cid, tc;
    vec3 vo = voronoi(p * FLAKE, cid, tc);
    float lift = (0.0012 + 0.0022 * vo.z) * (1.0 - 0.7 * uZen);
    float gap = 1.0 - smoothstep(0.0, 0.07, vo.y);
    float miss = step(vo.z, 0.018) * (1.0 - uZen);
    r.x += -lift * (1.0 - gap) + 0.0016 * gap * (1.0 - uZen) + miss * 0.006;
  }
  return r;
}

vec3 envStorm(vec3 d){
  vec3 c = vec3(0.006, 0.006, 0.007);
  c += vec3(0.04, 0.04, 0.043) * smoothstep(-0.3, 1.0, d.y);
  c += vec3(1.0, 0.96, 0.9) * 3.0 * smoothstep(0.9, 0.985, d.y);                          // overhead softbox
  c += vec3(0.12, 0.12, 0.13) * pow(max(dot(d, normalize(vec3(0.7, 0.45, -0.5))), 0.0), 6.0);
  c += vec3(0.05, 0.05, 0.055) * pow(max(dot(d, normalize(vec3(-0.8, 0.2, 0.6))), 0.0), 4.0);
  c += uGold * 0.22 * exp(-abs(d.y + 0.05) * 12.0);
  c *= mix(0.3, 1.0, smoothstep(-0.25, 0.02, d.y));
  return c;
}
vec3 envZen(vec3 d){
  vec3 c = mix(vec3(0.012, 0.03, 0.04), vec3(0.01, 0.022, 0.05), smoothstep(-0.1, 1.0, d.y));
  c += vec3(0.75, 0.86, 1.0) * 2.6 * smoothstep(0.975, 0.997, dot(d, normalize(vec3(0.32, 0.26, -1.0))));
  c += vec3(0.4, 0.5, 0.65) * 0.25 * smoothstep(0.75, 1.0, d.y);
  c += vec3(0.06, 0.12, 0.13) * 0.4 * exp(-abs(d.y) * 7.0);
  c += vec3(1.0, 0.7, 0.4) * 0.05 * exp(-abs(d.y + 0.02) * 30.0);   // distant lamps on the water
  c *= mix(0.4, 1.0, smoothstep(-0.25, 0.02, d.y));
  return c;
}
vec3 env(vec3 d){ return mix(envStorm(d), envZen(d), uZen); }

float D_GGX(float nh, float a){ float a2 = a * a; float d = nh * nh * (a2 - 1.0) + 1.0; return a2 / (PI * d * d); }
vec3 fresnel(vec3 f0, float c){ return f0 + (1.0 - f0) * pow(1.0 - c, 5.0); }
vec3 specL(vec3 n, vec3 v, vec3 l, float rough, vec3 f0){
  float nl = dot(n, l);
  if (nl <= 0.0) return vec3(0.0);
  vec3 h = normalize(v + l);
  float nh = max(dot(n, h), 0.0), nv = max(dot(n, v), 1e-3);
  float a = max(rough * rough, 0.002);
  float k = a * 0.5;
  float G = (nv / (nv * (1.0 - k) + k)) * (nl / (nl * (1.0 - k) + k));
  return D_GGX(nh, a) * G / (4.0 * nv) * fresnel(f0, max(dot(h, v), 0.0));
}

struct Mat { vec3 alb; vec3 f0; float rough; float coat; float wrap; };

vec3 light(vec3 n, vec3 v, vec3 l, vec3 col, Mat m){
  float nl = dot(n, l);
  vec3 c = m.alb * col * max((nl + m.wrap) / (1.0 + m.wrap), 0.0) / PI * 3.0;
  c += col * specL(n, v, l, m.rough, m.f0);
  c += col * specL(n, v, l, 0.07, vec3(0.04)) * m.coat;
  return c;
}

vec3 shade(vec3 p, vec3 n0, vec3 rd, float mat, float ao, float sh){
  vec3 v = -rd;
  bool por = mat > 0.5 && mat < 1.5;
  bool bead = mat > 1.5;
  vec3 cid, tc;
  vec3 vo = voronoi(p * (por ? FLAKE : GRAIN), cid, tc);
  float cr = vo.z;
  vec3 tilt = hash3(cid + 3.1) - 0.5;
  float zen = uZen;

  vec3 n = n0;
  float crack = 0.0, miss = 0.0;
  if (por) {
    crack = 1.0 - smoothstep(0.01, 0.04, vo.y);
    miss = step(cr, 0.018) * (1.0 - zen);
    // chamfered plate edges + slight per-plate rotation
    float edge = 1.0 - smoothstep(0.0, 0.2, vo.y);
    vec3 tcn = tc - n0 * dot(tc, n0);
    n = normalize(n0 + normalize(tcn + 1e-5) * edge * 0.45 * (1.0 - 0.5 * zen) + tilt * 0.14 * (1.0 - 0.6 * zen));
  } else if (!bead) {
    // dark crystal: micro-facets glint individually
    n = normalize(n0 + tilt * mix(0.24, 0.08, zen));
  }

  Mat m;
  if (por && miss < 0.5) {
    m.alb = mix(vec3(0.8, 0.79, 0.765), vec3(0.74, 0.72, 0.69), zen) * (0.82 + 0.22 * cr);
    m.f0 = vec3(0.04); m.rough = 0.42; m.coat = mix(0.9, 0.7, zen); m.wrap = 0.2;
  } else if (bead) {
    m.alb = mix(vec3(0.0), vec3(0.16, 0.07, 0.035), zen);
    m.f0 = mix(vec3(0.3, 0.3, 0.31), vec3(0.04), zen); m.rough = mix(0.28, 0.45, zen); m.coat = 0.0; m.wrap = 0.0;
  } else {
    // obsidian-chrome; in the sentient form it becomes pearl
    m.alb = mix(vec3(0.0), vec3(0.7, 0.68, 0.655), zen);
    m.f0 = mix(vec3(0.3, 0.3, 0.32) * (0.45 + 0.9 * cr), vec3(0.04), zen);
    m.rough = mix(0.2 + 0.16 * cr, 0.45, zen); m.coat = zen * 0.35; m.wrap = 0.12 * zen;
  }

  // ---- lights (object space ~ world space)
  vec3 kDir = normalize(mix(vec3(-0.18, 1.0, 0.32), vec3(-0.5, 0.85, 0.45), zen));
  vec3 kCol = mix(vec3(1.0, 0.95, 0.88) * 2.4, vec3(0.66, 0.77, 0.98) * 1.25, zen);
  // top light falls off down the body, like a single overhead source
  float kAtt = mix(mix(0.22, 1.0, smoothstep(-1.15, 0.75, p.y)), mix(0.55, 1.0, smoothstep(-0.6, 0.4, p.y)), zen);
  vec3 rDir = normalize(mix(vec3(0.55, 0.4, -1.0), vec3(0.32, 0.3, -1.0), zen));
  vec3 rCol = mix(vec3(0.5, 0.55, 0.65) * 0.7, vec3(0.7, 0.82, 1.0) * 2.0, zen);
  vec3 fDir = normalize(mix(vec3(0.6, 0.05, 0.9), vec3(0.1, -0.15, 1.0), zen));
  vec3 fCol = mix(vec3(0.05, 0.05, 0.055), vec3(1.0, 0.68, 0.4) * 0.22, zen);

  vec3 col = vec3(0.0);
  col += light(n, v, kDir, kCol * sh * kAtt, m);
  col += light(n, v, rDir, rCol, m);
  col += light(n, v, fDir, fCol, m);
  // the orbit rings as golden area lights
  for (int i = 0; i < 3; i++){
    vec4 rc = uRingC[i];
    vec2 rq = vec2(length(p.xz) - rc.y, p.y - rc.x);
    vec3 rp = vec3(normalize(p.xz + 1e-4).x * rc.y, rc.x, normalize(p.xz + 1e-4).y * rc.y);
    vec3 lv = rp - p;
    vec3 lc = uGold * rc.z * 0.16 / (1.0 + dot(rq, rq) * 45.0);
    col += light(n, v, normalize(lv), lc, m);
    vec3 cv = uRingL[i] - p; float dl = length(cv);
    col += light(n, v, cv / dl, uGold * rc.z * 0.12 / (1.0 + dl * dl * 10.0), m);
  }
  {
    vec3 lv = uMouse.xyz - p; float dl = length(lv);
    col += light(n, v, lv / dl, mix(uGold, vec3(0.8, 0.9, 1.0), zen) * uMouse.w * 0.5 / (1.0 + dl * dl * 30.0), m);
  }

  // image-based light
  vec3 R = reflect(rd, n);
  float nv = max(dot(n, v), 0.0);
  float specOcc = clamp(pow(nv + ao, 2.0) - 1.0 + ao, 0.0, 1.0);
  vec3 Fs = fresnel(m.f0, nv);
  vec3 envBlur = mix(env(R), env(normalize(mix(R, n, m.rough))), clamp(m.rough * 2.0, 0.0, 1.0));
  col += m.alb * (env(n) * mix(0.35, 0.22, zen) + mix(uGold * 0.03, vec3(0.03, 0.06, 0.07), zen) * max(-n.y, 0.0)) * ao;
  col += envBlur * Fs * specOcc;
  col += env(R) * fresnel(vec3(0.04), nv) * m.coat * specOcc;

  // missing shards expose the dark layer, and crack seams
  if (por) {
    if (miss > 0.5) col *= 0.55;
    vec3 seam = env(R) * 0.08 * ao + uGold * 0.015;
    col = mix(col, seam, crack * (1.0 - zen) * 0.92);
    // kintsugi: gold-mended seams
    vec3 gold = vec3(1.0, 0.7, 0.32);
    vec3 cK = gold * (envBlur * 0.6 + kCol * specL(n0, v, kDir, 0.25, vec3(1.0)) * 0.3 + rCol * specL(n0, v, rDir, 0.25, vec3(1.0)) * 0.3) + gold * 0.22 * (0.7 + 0.3 * uBreath);
    col = mix(col, cK, crack * zen);
  }

  // subtle translucency of the porcelain body against the moon
  if (por || zen > 0.0) {
    float tr = pow(clamp(dot(v, -rDir), 0.0, 1.0), 4.0) * (1.0 - nv);
    col += m.alb * rCol * tr * 0.12 * (por ? 1.0 : zen);
  }

  // ember light inside cracks during awakening
  col += uGold * crack * uCrack * 8.0;
  if (!por && !bead) col += uGold * uCrack * 2.5 * (1.0 - smoothstep(0.02, 0.07, vo.y));

  col *= mix(1.0, 0.9 + 0.1 * ao, 1.0);
  col = col / (1.0 + max(max(col.r, col.g), col.b) / 20.0);
  col = mix(col, vec3(1.0, 0.97, 0.92) * 5.0, uGlow);
  return col;
}

void main(){
  vec3 ro = (uInvModel * vec4(cameraPosition, 1.0)).xyz;
  vec3 rd = normalize((uInvModel * vec4(vWorld, 1.0)).xyz - ro);
  vec3 inv = 1.0 / rd;
  vec3 t0 = (uBoxMin - ro) * inv, t1 = (uBoxMax - ro) * inv;
  vec3 tmin = min(t0, t1), tmax = max(t0, t1);
  float tn = max(max(max(tmin.x, tmin.y), tmin.z), 0.0);
  float tf = min(min(tmax.x, tmax.y), tmax.z);
  if (tn >= tf) discard;

  vec3 kDir = normalize(mix(vec3(-0.18, 1.0, 0.32), vec3(-0.5, 0.85, 0.45), uZen));
  bool lowQ = uLowQ > 0.5;
  int maxSteps = lowQ ? 70 : 130;
  // one loop, one map() call site: march -> normal -> AO -> soft shadow
  float t = tn, minD = 1e5;
  bool hit = false;
  int phase = 0, k = 0, steps = 0;
  vec3 hp = vec3(0.0), nrm = vec3(0.0);
  float matId = 0.0, occ = 0.0, sca = 1.0, sres = 1.0, ts = 0.02;
  for (int i = ZERO; i < 185; i++){
    vec3 e = 0.5773 * (2.0 * vec3(float(((k + 3) >> 1) & 1), float((k >> 1) & 1), float(k & 1)) - 1.0);
    float hr = 0.01 + 0.045 * float(k);
    vec3 p = phase == 0 ? ro + rd * t : phase == 1 ? hp + 0.0007 * e : phase == 2 ? hp + nrm * hr : hp + nrm * 0.008 + kDir * ts;
    vec2 h = map(p);
    if (phase == 0){
      minD = min(minD, h.x);
      if (h.x < 0.0004 * (1.0 + t)) { hit = true; hp = p; matId = h.y; phase = 1; k = 0; continue; }
      t += h.x < 0.015 ? h.x * 0.6 : h.x * 0.85; steps++;
      if (t > tf || steps >= maxSteps) break;
    } else if (phase == 1){
      nrm += e * h.x; k++;
      if (k == 4){ nrm = normalize(nrm); phase = 2; k = 0; if (lowQ) break; }
    } else if (phase == 2){
      occ += (hr - h.x) * sca; sca *= 0.8; k++;
      if (k == 5){ phase = 3; k = 0; }
    } else {
      sres = min(sres, 7.0 * h.x / ts);
      ts += clamp(h.x, 0.012, 0.12); k++;
      if (sres < 0.005 || ts > 2.2 || k >= 32) break;
    }
  }

  float md = max(minD, 0.0);
  vec3 auraCol = mix(uGold * 0.4, vec3(0.85, 0.92, 1.0), uZen);
  vec3 aura = auraCol * (uZen * 0.035 * (0.7 + 0.3 * uBreath) * uAura + uGlow * 1.2) * exp(-md * 9.0) * smoothstep(0.35, 0.03, md);

  if (!hit) {
    gl_FragDepth = 1.0;
    gl_FragColor = vec4(aura, 0.0);
    return;
  }
  vec3 p = hp;
  if (phase == 1) nrm = vec3(0.0, 0.0, 1.0);
  float ao = lowQ ? 0.8 : clamp(1.0 - 3.0 * occ, 0.0, 1.0);
  float sh = lowQ ? 1.0 : clamp(sres, 0.0, 1.0);
  vec3 col = shade(p, nrm, rd, matId, ao, sh);

  vec4 clip = uProj * viewMatrix * (uModel * vec4(p, 1.0));
  gl_FragDepth = clamp((clip.z / clip.w) * 0.5 + 0.5, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}`;

export function createFigure() {
  const size = new THREE.Vector3().subVectors(BOX_MAX, BOX_MIN);
  const center = new THREE.Vector3().addVectors(BOX_MAX, BOX_MIN).multiplyScalar(0.5);
  const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
  geo.translate(center.x, center.y, center.z);

  const joints = STAND.map(v => v.clone());
  const uniforms = {
    uJ: { value: joints },
    uInvModel: { value: new THREE.Matrix4() },
    uModel: { value: new THREE.Matrix4() },
    uProj: { value: new THREE.Matrix4() },
    uBoxMin: { value: BOX_MIN.clone() },
    uBoxMax: { value: BOX_MAX.clone() },
    uTime: { value: 0 }, uMorph: { value: 0 }, uZen: { value: 0 }, uGlow: { value: 0 },
    uCrack: { value: 0 }, uLowQ: { value: 0 }, uBreath: { value: 0 }, uAura: { value: 1 },
    uSkirt: { value: new THREE.Vector4() },
    uSkirt2: { value: new THREE.Vector2(0.06, 1) },
    uFingL: { value: new THREE.Vector4() },
    uFingR: { value: new THREE.Vector4() },
    uMudra: { value: new THREE.Vector2() },
    uRingL: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
    uRingC: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uGold: { value: new THREE.Color(1.0, 0.62, 0.22) },
    uMouse: { value: new THREE.Vector4(0, 0, 2, 0) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: vert, fragmentShader: frag,
    side: THREE.BackSide,
    depthFunc: THREE.AlwaysDepth,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;

  let mainCamera = null;
  mesh.onBeforeRender = (renderer, scene, camera) => {
    uniforms.uProj.value.copy(camera.projectionMatrix);
    uniforms.uLowQ.value = camera === mainCamera ? 0 : 1;
    mat.uniformsNeedUpdate = true;
  };

  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  const lookTarget = new THREE.Vector3(0, 0, 1);
  const FING_STAND_L = new THREE.Vector4(0.12, 0.2, 0.3, 0.38);
  const FING_STAND_R = new THREE.Vector4(0.16, 0.26, 0.34, 0.42);
  const FING_MUDRA = new THREE.Vector4(0.82, 0.1, 0.16, 0.24);

  return {
    mesh, uniforms,
    setMainCamera(c) { mainCamera = c; },
    // m: pose morph 0..1, look: object-space gaze direction (unbound pose only)
    update(t, m, look) {
      const e = m * m * (3 - 2 * m);
      const breath = Math.sin(t * 2 * Math.PI / mix(4.6, 7.0, e));
      for (let i = 0; i < joints.length; i++) joints[i].lerpVectors(STAND[i], LOTUS[i], e);

      // breathing, buoyant arms, drifting legs
      const free = 1 - e;
      joints[1].y += breath * 0.005; joints[1].z += breath * 0.003;
      joints[4].y += breath * 0.004; joints[8].y += breath * 0.004;
      joints[2].y += breath * 0.003; joints[3].y += breath * 0.003;
      const sw = (i, ph, a) => { joints[i].x += Math.sin(t * 0.55 + ph) * a * free; joints[i].y += Math.sin(t * 0.7 + ph * 1.3) * a * free; joints[i].z += Math.cos(t * 0.45 + ph) * a * 0.6 * free; };
      sw(5, 0.0, 0.01); sw(6, 0.5, 0.022); sw(7, 0.9, 0.03);
      sw(9, 2.0, 0.01); sw(10, 2.5, 0.022); sw(11, 2.9, 0.03);
      sw(13, 1.4, 0.006); sw(14, 1.9, 0.012); sw(15, 2.3, 0.016);
      sw(17, 4.1, 0.006); sw(18, 4.6, 0.012); sw(19, 5.0, 0.016);

      // gaze (only while unbound; in meditation the head is still)
      lookTarget.lerp(look, 0.03);
      tmpA.copy(lookTarget).normalize();
      tmpB.copy(joints[20]).normalize().lerp(tmpA, 0.25 * free).normalize();
      joints[20].copy(tmpB);

      const u = uniforms;
      u.uTime.value = t;
      u.uMorph.value = e;
      u.uBreath.value = breath * 0.5 + 0.5;
      const pel = joints[0].y;
      u.uSkirt.value.set(
        pel + mix(0.1, 0.04, e),
        mix(-0.9, pel + 0.0, e),
        mix(0.128, 0.05, e),
        mix(0.46, 0.05, e)
      );
      u.uSkirt2.value.set(mix(0.09, 0.0, e), 1 - e);
      u.uFingL.value.lerpVectors(FING_STAND_L, FING_MUDRA, e);
      u.uFingR.value.lerpVectors(FING_STAND_R, FING_MUDRA, e);
      u.uMudra.value.set(e, e);
      return breath;
    },
  };
}

function mix(a, b, t) { return a + (b - a) * t; }

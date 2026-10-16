// Optical bench constants and thin-lens / Depth-of-Field physics calculations

export const OPTICAL_AXIS_Y = 3.55;
export const OPTICAL_AXIS_Z = 0;

// X positions along the optical bench
export const IMAGE_PLANE_X = -4.35;
export const LENS_REAR_X = -2.65;
export const LENS_IRIS_X = -1.32;
export const LENS_FRONT_X = 0.50;

// Diorama valley bounds in world space
export const VALLEY_MIN_X = 1.62;
export const VALLEY_MAX_X = 5.10;
export const VALLEY_HALF_Z = 1.75;
export const VALLEY_BASE_Y = 3.04;

// Distance conversion: world units in front of LENS_FRONT_X -> centimeters
export const CM_PER_UNIT = 23;
export const MIN_FOCUS_D = 1.08; // ~25 cm
export const MAX_FOCUS_D = 7.00; // ~161 cm

// Key subjects in the miniature valley
export const SUBJECTS = [
  {
    id: 'pine',
    name: 'the pine',
    shortName: 'Foreground',
    index: 0,
    d: 1.61, // 37 cm
    worldPos: [LENS_FRONT_X + 1.61, 3.62, 0.72],
    rayOrigin: [LENS_FRONT_X + 1.61, 3.82, 0.72],
    color: '#98f5b8',
  },
  {
    id: 'cabin',
    name: 'the cabin',
    shortName: 'Middle',
    index: 1,
    d: 2.35, // 54 cm
    worldPos: [LENS_FRONT_X + 2.35, 3.45, -0.18],
    rayOrigin: [LENS_FRONT_X + 2.35, 3.48, -0.05],
    color: '#ffd089',
  },
  {
    id: 'peak',
    name: 'the peak',
    shortName: 'Background',
    index: 2,
    d: 3.65, // 84 cm
    worldPos: [LENS_FRONT_X + 3.65, 4.35, -0.42],
    rayOrigin: [LENS_FRONT_X + 3.65, 4.35, -0.42],
    color: '#9ee6ff',
  },
];

export const APERTURE_PRESETS = [2, 5.6, 16];

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Logarithmic slider [0..1] <-> Focus Distance D (in world units from LENS_FRONT_X)
export function distToSlider(d) {
  return clamp(Math.log(d / MIN_FOCUS_D) / Math.log(MAX_FOCUS_D / MIN_FOCUS_D), 0, 1);
}

export function sliderToDist(t) {
  return MIN_FOCUS_D * Math.pow(MAX_FOCUS_D / MIN_FOCUS_D, clamp(t, 0, 1));
}

// Format world distance D into human-readable cm / m string
export function formatDistCm(d, forceDecimal = false) {
  const cm = d * CM_PER_UNIT;
  if (!isFinite(cm)) return '∞';
  if (forceDecimal) return cm.toFixed(1) + ' cm';
  if (cm >= 100) return (cm / 100).toFixed(2) + ' m';
  if (cm >= 20) return Math.round(cm) + ' cm';
  return cm.toFixed(1) + ' cm';
}

// Compute near and far Sharp Zone (Depth of Field) distances in world units
export function computeDofBounds(focusD, apertureN) {
  const cocFactor = 0.00293 * apertureN;
  const invFocus = 1 / Math.max(focusD, 0.05);
  const nearD = 1 / (invFocus + cocFactor);
  const farD = invFocus - cocFactor > 1e-4 ? 1 / (invFocus - cocFactor) : Infinity;
  return [nearD, farD];
}

// Compute Circle of Confusion (CoC) radius (unsigned, normalized) for object at distance objD
export function computeCoc(objD, focusD, apertureN) {
  return (1 / apertureN) * Math.abs(1 / focusD - 1 / Math.max(objD, 0.05));
}

// Signed CoC (> 0 means object is closer than focus plane, so rays converge behind the image plane)
export function computeSignedCoc(objD, focusD, apertureN) {
  return (1 / apertureN) * (1 / Math.max(objD, 0.05) - 1 / focusD);
}

// Format aperture number nicely
export function formatAperture(n) {
  const rounded = Math.round(n * 10) / 10;
  if (Math.abs(rounded - Math.round(rounded)) < 0.08) {
    return 'f/' + Math.round(rounded);
  }
  return 'f/' + rounded.toFixed(1);
}

// Build dynamic educational explanation HTML for #why card
export function buildExplanationHtml(focusD, apertureN) {
  const [nearD, farD] = computeDofBounds(focusD, apertureN);
  const dofWidthStr = formatDistCm(farD - nearD, true);

  // Check which subjects fall inside the sharp zone (with small tolerance for subject thickness)
  const sharpSubjects = [];
  const blurrySubjects = [];

  for (const subj of SUBJECTS) {
    const tol = 0.055;
    if (subj.d >= nearD - tol && subj.d <= farD + tol) {
      sharpSubjects.push(subj);
    } else {
      blurrySubjects.push(subj);
    }
  }

  if (sharpSubjects.length === 0) {
    const focusStr = formatDistCm(focusD);
    return `Focused on <b>${focusStr}</b> of empty air. Nothing in the valley sits on the plane, so everything lands on the glass as a disc: <b>all soft</b>.`;
  }

  if (sharpSubjects.length === 1) {
    const s = sharpSubjects[0];
    const bNames =
      blurrySubjects.length === 2
        ? `${capitalizeFirst(blurrySubjects[0].name)} and ${blurrySubjects[1].name}`
        : capitalizeFirst(blurrySubjects[0].name);
    const verb = blurrySubjects.length === 1 ? 'lands as a <span class="a">disc</span>, so it blurs' : 'land as <span class="a">discs</span>, so they blur';
    return `Only <span class="c">${s.name}</span> sits on the plane: its rays meet in <b>one point</b> on the glass. ${bNames} ${verb}. Sharp zone: <b>${dofWidthStr}</b>.`;
  }

  if (sharpSubjects.length === 2) {
    const sNames = `<span class="c">${capitalizeFirst(sharpSubjects[0].name)}</span> and <span class="c">${sharpSubjects[1].name}</span>`;
    const b = blurrySubjects[0];
    return `${sNames} sit inside the sharp zone (${dofWidthStr}). ${capitalizeFirst(b.name)} lands as a <span class="a">disc</span>, so it blurs. Sharp zone: <b>${dofWidthStr}</b>.`;
  }

  return `Stopped down to <b>${formatAperture(apertureN)}</b>, the sharp zone spans <b>${dofWidthStr}</b>—nearly the entire miniature valley lands crisp on the glass.`;
}

function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

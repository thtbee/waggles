# The Plane of Focus

An interactive 3D lens lab that explains camera focus, built with Three.js.

**[Launch the demo](https://thtbee.github.io/waggles/plane-of-focus/)**

Recreation of [@RyanSael](https://x.com/RyanSael)'s lens demo.

---

### What it shows

A 50 mm ƒ/2 lens on an optical bench, modelled as a thin lens. Focus distance (about 25–160 cm) and aperture drive the light rays, the plane of focus, the depth of field and the image on the sensor, with live readouts.

### Controls

| | |
| --- | --- |
| Drag the focus ring or slider | Focus distance |
| `1` `2` `3` | Focus on foreground, middle, background |
| `[` `]` | Fine focus |
| `F` | Cycle aperture: ƒ/2, ƒ/5.6, ƒ/16 |
| `X` | Assembled / exploded lens |
| `C` | Next camera shot |
| `R` | Back to overview |
| `W` `A` `S` `D` · `Q` `E` · arrows | Fly the camera |
| `/` | Hide the interface |

### Run locally

From the repo root, with Python 3:

```bash
python tools/serve.py
```

Then open [localhost:8000/plane-of-focus](http://localhost:8000/plane-of-focus/).

---

© 2026 [thtbee_](https://x.com/thtbee_) · [CC BY-NC 4.0](../LICENSE)

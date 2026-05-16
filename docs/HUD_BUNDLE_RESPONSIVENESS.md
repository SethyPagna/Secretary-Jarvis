# HUD Bundle Responsiveness

Phase 31 moves heavy HUD dependencies out of the first renderer chunk so the centered orb shell can appear quickly in background/desktop mode.

## Current Chunk Layout

After `npm.cmd run build -w @jarvis/hud`, the renderer emits:

| Chunk | Approx size | Purpose |
| --- | ---: | --- |
| `index-*.js` | 39 KB | Initial HUD app, status wiring, shell, fallback orb |
| `Orb-*.js` | 3 KB | Lazy 3D orb component wrapper |
| `WorkflowConsole-*.js` | 6 KB | Lazy workflow panel |
| `react-vendor-*.js` | 193 KB | React and React DOM |
| `motion-vendor-*.js` | 126 KB | Framer Motion and animation helpers |
| `r3f-vendor-*.js` | 149 KB | React Three Fiber |
| `three-vendor-*.js` | 719 KB | Three.js core, loaded with the lazy orb path |
| `icon-vendor-*.js` | 7 KB | Lucide icon package |
| `vendor-*.js` | 7 KB | Remaining small shared vendor code |

## Behavior

- The default UI still presents the centered orb immediately.
- A CSS fallback orb renders while the 3D Three.js orb chunk loads.
- The 3D orb keeps the cinematic look once its lazy chunk is ready.
- The workflow console remains lazy-loaded.

## Remaining Notes

The Three.js chunk is intentionally large because the orb uses real WebGL/React Three Fiber. It no longer blocks the main renderer chunk. If laptop startup ever feels heavy, the next optimization is a settings-controlled "CSS orb only" mode for battery saver or low-power startup.

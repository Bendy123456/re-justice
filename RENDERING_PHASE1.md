# RE-Justice visual rendering Phase 1

This is a render-only integration checkpoint, not the complete seven-phase high-fidelity character project.

## Architecture

The 2D simulation remains the sole owner of gameplay x/y/facing/attack data. `visual3d.js` reads the immutable snapshot and poses a Three.js scene with an orthographic side camera. The WebGL canvas is composited into the existing 2D game canvas before HUD and debug overlays are drawn. If Three.js/WebGL is unavailable or a real sprite sheet exists, the earlier procedural/sprite rendering remains in use.

## Dependency

Three.js 0.152.2 UMD is loaded from jsDelivr. A network connection is required for 3D visuals; the local file build remains playable offline in 2D.

## Checkpoint testing

1. Open `render-lab.html` in a modern Chrome/Brave browser and verify an original teal-and-copper character is visible standing on the lane.
2. Switch Idle / Walk / Block / Light attack / Hit reaction. Toggle Pause: animation poses must stop.
3. Enable the green hurtbox / red attack hitbox overlay and verify the drawing does not move when you toggle it.
4. Open `index.html`; start vs CPU with the first character (gameplay ID flash). Verify the 3D figure visually follows the actor without changing hit registration.
5. Disconnect network and reload. The 2D procedural fallback should show without a broken game.
6. Run `tests.html`; no gameplay test should regress.

## Not included yet

Four fully skinned original 3D hero models, all animation clips, portrait re-rendering, glTF overrides, damage wear system, and roster-batch conversion. These are later phases.

# RE-Justice — 3D Training Grounds (Preview)

The CPU mode now uses an **original enclosed 3D fighting arena** created
in Blender: a large circular dirt/stone training ground, one ancient tree
in the center, and high solid stone walls around the full perimeter.

## Starting a match

Open the normal RE-Justice website, choose **1V1 VS BOT**, select one of
the characters marked READY, then press Enter/Start. When all 3D assets
are loaded, the fight launches in the new third-person arena.

The old side-view mode remains a fallback if WebGL or the optional 3D
resources cannot load. Online networking is not implemented.

## Keyboard and standard Xbox / DualSense controls

| Action | Keyboard | Controller (standard mapping) |
|---|---|---|
| Move around target | W/A/S/D | Left stick / D-pad |
| Jump | Space or H | A / Cross |
| Dash | Left Shift or P | RB / R1 |
| Light / Medium / Heavy | J / K / L | X/Y/B (Xbox), Square/Triangle/Circle (PS) |
| Block | I | LT / L2 |
| Super (4 meter bars) | O | RT / R2 |
| Throw | U | LB / L1 |
| Pause | Esc | Start / Options |
| Leave paused match | Q | Keyboard Q |

Custom rebinding for the existing named inputs (jump/power and dash/burn)
continues to work from Settings. The extra Space and Shift keys are
convenient default alternatives.

## Architecture and collision

- Blender source: `blender/build_training_arena.py`
- Edit in Blender: `assets/arena/training-ground.blend`
- Rendering asset: `assets/arena/training-ground.glb`
- Simulation and renderer: `arena3d.js`
- QA: `arena-browser-qa.mjs` and GitHub Actions workflows
- Visual-only arena model. Simple analytic floor, center-tree and radial
  wall/character colliders run at exactly 60 simulation ticks per second.
- The original 2D engine and roster frame data are kept. Existing normals
  use their original startup, active, recovery, damage and hitstun values
  adapted to 3D contact range.
- CPU, round timer, 2-round wins, block/chip damage, combo scaling and
  meter are implemented in this 3D mode. GLB bones/meshes are not involved
  in hit detection.

## Current limitations

This is the initial 3D arena-fighter prototype, not a complete Shinobi
Striker recreation. The following still need dedicated tuning:
- 3D-specific move animations, advanced air combos and true special moves
- camera behavior in unusual edge/crowding situations and mobile controls
- custom character costumes and additional animation polish
- responsive performance on older laptop GPUs; use updated Chrome/Edge
- online matchmaking/network rollback (not implemented)
- only the four roster characters with existing playable move data can fight

Collision and browser smoke tests passing does not guarantee all devices
are free of bugs. Leave the separate 2D fallback in place while testing.

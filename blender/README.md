# Batman Blender project — modeling study

This folder builds a **new editable Batman-inspired fan-art model inside Blender 4.0+**, separate from RE-Justice combat code.

## Files generated automatically

After a successful `Build editable Batman model` GitHub Actions run, the branch contains:

- `generated/batman/REJustice_Batman_Study.blend` — actual editable Blender project (rig, materials, studio cameras, lights, rendered scene).
- `generated/batman/REJustice_Batman_Study.glb` — GLB skeleton and mesh export for web preview work.
- `generated/batman/batman_fullbody.png` and `batman_armor_closeup.png` — visual inspection images.
- `generated/batman/QA.txt` — object, bone, and vertex counts.
- `generated/batman/build-log.txt` — Blender execution trace.

## Run in Blender

Open `REJustice_Batman_Study.blend` in Blender. The Outliner collection `BATMAN • game-ready art` holds the rig and individual modeled pieces. Switch the view to **Material Preview**, select the armature, and enter Pose mode. Frames 1–36 contain a short idle keyframe test. The separate studio cameras are named `Beauty 3/4` and `Face/armor detail`.

To regenerate all assets with Blender installed:

```bash
blender --background --factory-startup --python-exit-code 1 --python blender/build_batman.py
```

## Honest production status

This is an editable **Blender geometry and costume modeling study**, not a professionally sculpted Injustice-quality production mesh. Although it contains an armature and deform vertex groups, most pieces use rigid weights and need weight painting and animation refinement before they are fighting-game-ready. It is not an original extracted game asset.

The 2D fighting game, including hitboxes, attacks, and frame data, remains completely unchanged. Nothing is auto-merged into the production site.

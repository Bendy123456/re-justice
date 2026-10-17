# RE-Justice — Faithful Injustice (2013) Character Production Spec

**Status: reference direction approved; procedural costume study REJECTED at visual QA.**

## Production goal
Recreate the recognizable silhouettes, costumes, materials, and presentation of the **2013 Injustice: Gods Among Us** default character designs for a personal fan project. Do not substitute the game's current simple capsules and spheres for an actual sculpted mesh. This is a fidelity target, not a statement that original game assets or rights have been obtained.

## First four fighter slots (render mapping only)
| Gameplay slot (unchanged) | Visual identity | Recognizable features to sculpt |
| --- | --- | --- |
| `flash` | The Flash | Red segmented armored bodysuit, gold lightning ear bolts, streamlined cowl, lightning chest insignia, athletic sprinter body |
| `batman` | Batman | Dark armored cowl and pointed ears, exposed lower face, gray-black chest and abdominal armor, bat emblem, gold utility belt, substantial cape and gauntlet fins |
| `superman` | Superman | Tall muscular proportions, dark blue paneled suit, red cape, raised red-and-gold shield insignia, strong facial structure and short black hair |
| `wonder-woman` | Wonder Woman | Athletic proportions, sculpted gold/red breastplate, distinct tiara, dark hair, decorated metallic bracers, armor boots and lasso detailing |

References: [Injustice 2013 art gallery](https://www.creativeuncut.com/art_injustice-gods-among-us_a.html), [additional costume concepts](https://www.creativeuncut.com/art_injustice-gods-among-us_b.html), [costume sheet studies](https://www.creativeuncut.com/art_injustice-gods-among-us_c.html).

## Mesh and texture delivery standard
- One rigged `.glb` per hero. Mesh topology must support visible shoulders, elbows, knees, neck, fingers and face—no floating ball joints.
- Fully sculpted face and hands; 7–8 head-tall heroic proportions, realistic jaw/nose/eye sockets and shaped knuckles.
- Mesh LOD0 target 20k–40k triangles with shared materials and at most 20 draw calls, LOD1 8k–15k tris. Use these as performance targets rather than rigid limits.
- PBR base-color, normal, ORM (occlusion/roughness/metalness), and optional emissive textures. 2K masters, 1K runtime variant initially.
- Separate fabric, leather, plated metal, skin and cloth materials; avoid toy-like glossy plastics.
- Boots and capes must touch/move relative to the correct bones without exposed gaps.

## Export convention
- Visual-only model paths: `assets/models/<slot>.glb`
- Y up, forward +X for the 2D fighting plane, positive Z toward the camera; root origin at the feet on ground.
- Nominal character height 2.4 game visual units. The renderer controls apparent size; 2D hitboxes remain entirely unchanged.
- Skeleton root `Hips`; consistent names for `Spine, Chest, Neck, Head, LeftUpperArm, LeftLowerArm, LeftHand, RightUpperArm, RightLowerArm, RightHand, LeftUpperLeg, LeftLowerLeg, LeftFoot, RightUpperLeg, RightLowerLeg, RightFoot` plus fingers and cape bones.
- Animation clips: idle, walk_forward, walk_backward, jump, fall, crouch, stand_block, crouch_block, hit_light, hit_heavy, knockdown, wakeup, victory, defeat; attack clips for standing/crouching/air light/medium/heavy.
- Animation is sampled at **simulation frame / 60**, using the existing move frame data. Never introduce collision logic, hidden offsets, or variable-timestep damage calculations.

## Quality gates BEFORE preview release
1. View a full-body front, side and back render at **native game fighting scale**, not just a magnified Blender viewport.
2. Inspect clean silhouette at 180–240 px of body height. Helmet/face, emblem, glove silhouette, boot shape, and costume identity must remain legible.
3. Validate no intersecting chest badges, missing faces, disconnected shoulders, or hovering boots.
4. Confirm neutral stance with bent knees, raised guard, and hip/torso counter-rotation; never a default T pose while idle.
5. Sample attack animation using **existing** startup, active and recovery frames. Overlay the unchanged 2D hitboxes to check visual reach.
6. Test two identical fighters simultaneously. Verify different model instances and animation states.
7. Measure stable 60 FPS with two characters, HUD, stage and effects on a representative midrange laptop.
8. Confirm 2D fallback continues working when WebGL/model files fail.

## Current status and next action
A more detailed purely procedural mesh preview has been rendered in GitHub Actions, and its screenshots were manually inspected. It still looks like assembled glossy primitives rather than Injustice-quality character art; **do not merge it to main**. Next deliverable should be **one genuinely sculpted, textured, rigged character (Batman as first quality gate)**, then reuse its approved asset pipeline for the other three.

Only use extracted/commercial character meshes if the user has appropriate permission to publish them; the fan project status alone does not provide such permission.

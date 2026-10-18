# Changelog

## Complete natural-tree sculpt and leaf geometry replacement — 2026-10-17

- Rebuilt the **center tree** in Blender rather than stacking additional decorative geometric primitives onto the old version. The previous icosphere canopy, matching radial branches and blocky bark poles are replaced.
- `blender/tree_artist.py`: gently curved and flared bark trunk; swept and tapered asymmetrical main boughs with secondary forks; stable buttress roots; subtler thin carved bark creases; individual double-sided curved leaf blades organized into natural layered sprays.
- Leaves are actual Blender geometry arranged in multiple tones and asymmetrical branching clusters, not spherical blob meshes. All parts are exported into the existing consolidated stage GLB.
- Kept the 34m arena dimensions, the same tree-center analytic collision radius, walls, floor, control scheme, lock-on facing, attacks, round/meter systems and original game logic.
- Updated `assets/arena/training-ground.glb` and the editable `training-ground.blend`. Added `training-tree-detail.png` and `training-tree-trunk.png` plus normal overview for art inspection.
- Added automated in-browser assertions that the GLB contains new `Leaf blades` materials and natural bark geometry, rather than the legacy `Leaf cluster` primitives. Previous 3D movement, collision and combat tests still run.
- Versioned arena GLB and JS loading URLs to avoid stale cached models. The new tree GLB is larger than the old one because it uses genuine leaf geometry; detailed runtime FPS testing across older GPUs remains a follow-up.

## Anime training grounds visual overhaul + lock-on facing fix (2026-10-17)

- Resculpted the existing original **Blender** training arena without changing its gameplay colliders or radius: multi-course carved stone perimeter, decorative pilasters, engraved bands, nuanced packed-earth floor, concentric training rings, weathered patches and leaf/moss detailing.
- Refined the giant central tree with extra bark flutes, asymmetric spreading roots, winding branches, and layered foliage sprays for a fuller anime training-ground silhouette.
- Rebaked the editable `assets/arena/training-ground.blend`, updated `training-ground.glb`, and inspected the Blender overview and actual browser fight screenshots.
- Corrected the 3D character mesh's 180° facing mismatch: the imported Quaternius rig looks along local **+Z**, not **-Z**. `arena3d.js` now uses opponent-directed yaw, preserving lock-on orientation during forward movement, backward walking and strafing.
- Reversed walk-cycle stride direction when backpedaling, without changing the actual game input layer or movement speeds.
- Added regression assertions to `arena-browser-qa.mjs` for signed opponent-facing forward vector, backwards movement displacement, strafing, and forward movement.
- Tuned in-game exposure, daylight, fill and fog so the revised wall and floor materials remain visible instead of washing out. Versioned the arena GLB and arena module URLs to avoid stale browser caches.
- The arena retains the same 34m radius, 12.5m walls, solid central-tree collider, all existing four-fighter data, gamepad support, camera controls, CPU attacks and original game fallback.
- Remaining art tasks: stylized grass/leaf motion, bespoke moves and more advanced third-person animation; full multiplayer remains unimplemented.

## Full 3D arena-fighter training grounds prototype — 2026-10-17

- Created a new original daytime anime training ground in **Blender**: a 34m-radius circular fighting floor, a large sculpted central tree and 12.5m continuous enclosing stone walls. Exported editable `assets/arena/training-ground.blend`, game-ready `.glb` and QA render.
- Added `arena3d.js`: a **new optional 3D combat mode** for 1v1 CPU fights, using existing male, female and armored Batman skinned GLBs.
- Camera follows player from behind and locks toward CPU opponent; supports full X/Z running/strafe, 60Hz jump gravity, dash, basic attacks, throw, block/chip, combo damage scaling, four-bar super, KO, 99-second rounds and best-of-three wins.
- Gameplay collision uses deterministic radial wall and trunk constraints plus fighter capsule/circle approximations. Blender geometry is presentation-only, never substituted for collision data.
- Added contact shadows, target lock-on marker, camera wall/tree avoidance, impact HUD sparks and gamepad controls through the existing input manager.
- Existing RE-Justice title/settings/character select are kept, with stage label updated to "Training Grounds" when ready; old 2D match remains a fallback if WebGL/assets fail.
- Added startup readiness check so selecting a match before loading asks to wait rather than unintentionally entering the 2D match.
- Added automated Blender build and Chromium browser QA. Passed actual GLB loading, independent character skeletons, tree/wall collisions, run/jump/land/dash, block chip, single-hit detection, paused timer, CPU stepping and exit-to-menu tests. Existing 36/36 2D engine tests and 30-character asset mapping tests also passed.
- This is the **first 3D gameplay phase**, not fully feature-complete. Remaining work: bespoke character animation clips/specials and air combos, performance improvements for low-end GPUs, refined environmental art and more camera edge-case QA. Online mode remains unimplemented.

## Native female anatomical model replaces male-derived placeholder (2026-10-17)

- Replaced the previously modified male mesh with the actual **Quaternius Superhero Female** model from the CC0 Universal Base Characters Standard pack, keeping the same humanoid 65-bone rig.
- New native female torso and face geometry have distinct shoulder taper, hips, waist, jaw and bust without trying to warp the male anatomy.
- Preserved the bald, hair-free, armor-free visual direction and the same matte blue-gray material as all existing unarmored male roster models.
- Added a small non-destructive medium bust sculpt on the true female mesh; all other dimensions retain native female topology.
- Regenerated `assets/models/female-unarmored.glb` and editable `female-unarmored.blend` with full-body, front, profile and face renders from Blender.
- All eight female roster slots still use this one shared model. Male models, Batman armor, character controls, hitboxes, frame data and combat remain unchanged.
- Blender 65-bone compatibility probe, build, GLB export, all roster tests, combat smoke and Chromium character selection, Batman matchup and female mirror match checks passed.
- Source and license details: `blender/FEMALE_BASE_SOURCE.md`. Character-specific hairstyles, armor and facial details remain later art tasks.

## Shared female base — medium chest refinement (2026-10-17)

- Increased medium bust contour settings in `blender/build_game_female_base.py` (volume 0.032 → 0.052, width 0.083 → 0.094, height 0.068 → 0.078, position adjusted slightly).
- Rebuilt `assets/models/female-unarmored.glb`, its editable `.blend`, and the full-body and facial inspection renders in Blender.
- All eight female roster slots automatically use this same newly generated mesh; model mapping and the rest of the roster are unchanged.
- Preserved the same bald blue-gray matte material, rig/skin data, no armor or hair, and unchanged 2D gameplay mechanics.
- Blender build and model/engine smoke tests passed; browser review checks cover selection, Batman matchup, female mirror match, and attack pose.
- Custom outfits, armor, and character-specific face styling remain for later passes.

## Shared female Blender base for all eight women (2026-10-17)

- Added an original proportion-adjusted, bald, armor-free female body built in Blender from the approved CC0 humanoid, preserving the imported 65-bone skeleton and original mesh deformation.
- Added non-destructive editable female anatomy sculpt controls for face, shoulders, bust, waist, hips, legs, and neck, with the **same exact** matte blue-gray material as the male base. No hair, cape, costume, or mask on the shared body.
- Generated `assets/models/female-unarmored.blend` and `female-unarmored.glb`, with full-body and face renders.
- All eight female slots now use the same shared `female-unarmored.glb` in select-screen previews, portrait tiles, and fights. Armor for each fighter will be a future art pass.
- Batman and the other 21 men retain their earlier 3D visual assets. No change to gameplay, move data, hitboxes, health, timer, or input controls.
- Blender build, 30-roster model tests, existing gameplay smoke tests, Chromium WebGL selection render, Wonder Woman vs Batman, Wonder Woman mirror match and 3D heavy attack animation checks all passed.
- Known limitations: shared placeholders are intentionally not individual costumes. The sculpt is still a mid-poly base and will require character-specific hair and clothing work; real GLB characters still require the optional Three.js CDN to load, with original drawings as fallback if unavailable.

## Real Blender GLB Models Integrated — Male Roster (2026-10-17)

- Added a shared anatomically rigged blue-gray bald male GLB base for 21 unarmored male roster slots, preserving 65 imported humanoid bones. Batman uses the separately finished armored model.
- All 22 male character-select previews, portrait tiles, and playable male match models use the new real GLB rendering layer. Eight female slots retain the existing 2D models.
- New `model-assets.js` holds visual mapping per slot, `glb-visuals.js` draws real skinned Blender models through Three.js without changing the fixed-step 2D simulation.
- Read-only 3D representation consumes original fighter x/y, facing, action state, attack frame and pause state. Existing health, hitboxes, collision, attacks, controls and round timing are untouched.
- Visual fallback remains enabled if WebGL or optional GLB assets fail. Character selection and match HUD are preserved.
- Added `blender/build_game_male_base.py` and `blender/bald_head_sculpt.py` for regenerating the model; assets are at `assets/models/`.
- Automated Node roster/assets tests passed; actual Chromium WebGL checks passed for Batman, male base, female fallback, fighting two models and independent Batman mirror-model rigs. A heavy-attack pose displaced the rigged hand while fighter health remained unchanged.
- Male roster entries still have placeholder visuals by design and are **not** made playable when move data does not yet exist. Rendering refinements and bespoke armor will be added per character later.

## 0.2.0 — Starter Fighter Rig and Model Viewer (2026-10-17)

### Added
- `fighter-rig.js`: original data-driven 2D skeletal renderer and FK posing for Flash, Batman, Superman and Wonder Woman. It defines body builds, costume palettes and procedural hair, cape, masks, armor and emblems.
- Hand-keyframed visual-only animation system with idle, walk/back, jumping/falling, landing, crouch/high and low block, hit reactions, knockdown/get-up, throw/victim, victory, defeat, power, super and nine distinct normal-attack animations per starter character.
- Bézier-contoured segmented anatomy, 2–3 shade illustrated fills, dark outlines, highlight stripes, second-motion cape and idle breathing, damage-scuff and flash treatment, and a bounded offscreen render cache.
- Existing sprite-sheet assets remain top priority; the procedural rig is a fallback. Incomplete-roster portraits retain the original placeholder art.
- `model-viewer.html` / `model-viewer.js`: open the viewer, pick any of the four starter characters and any 30 animations, scrub simulation frames, flip the facing, switch palette, and inspect visual bones and frame-data-derived hitbox overlays.
- The oblique portrait-bank buttons on character select are now mouse clickable (click once to select; click the selected playable fighter again to lock; hold Shift when clicking for P2). Click hit-tests invert the existing portrait affine transform.
- Tests expanded to 36 passing checks. GitHub CI validates syntax and automated combat/input/menu/rig invariants.

### Kept unchanged
- All actual combat rules, damage, hit detection, move startup/active/recovery frame values, CPU decisions, stage definitions, and gameplay controls.
- The existing title, versus setup layout, and fight HUD arrangement.

### Known limitations / reproduction
1. Unfinished roster members still render existing placeholder portraits and cannot enter fights. Try selecting Aquaman (preview-only).
2. Some animations are debug-viewer previews for mechanics not yet implemented in gameplay (throws, supers, launches and get-up). Select one in Model Viewer.
3. Sprite sheets override procedural art when defined in `assets.js`; replacing the art is allowed without modifying fighting logic.
4. Mouse roster selection is per click, not hover. Click a portrait twice to lock; confirm the fight with Enter / Start once P1 is joined.
5. Rig performance depends on browser/GPU resolution. The cache is capped at 64 image entries; test longer matches and report stutter if observed.

## 0.1.5 — Retina sharpness + full menu redesign (2026-10-17)

### Included
- Render Canvas at the actual display's physical pixel resolution (devicePixelRatio-aware, capped for performance), while preserving 1280×720 logical fighter coordinates and pointer mapping.
- Replaced the washed-out grey home tiles with two polished, clearly differentiated mode cards: **1v1 Online** (coming soon) and **1v1 Vs Bot** (play now).
- Rebuilt navigation sidebar and header: RE-Justice branding, real early-access status, high-contrast graphite panels, blue/gold accents, clean font and spacing. Removed mock XP/time gauges.
- Redesigned Settings into a **two-column, eight-row controls grid** with larger labels and clickable binding fields.
- Maintained mouse and controller navigation, return-to-Fight tab, selectable player / input device, rumble, and restore defaults.
- Added HiDPI and updated click-hitbox regression checks in tests.js; added stylesheet and script cache busting to aid updated browser deployments.

### Known limitations / how to reproduce
1. **Online is not implemented:** select 1v1 Online. A status notice appears; actual network multiplayer is still future work.
2. **Other roster fighters remain previews:** the character select has 30 portraits, but only Flash, Batman, Superman, and Wonder Woman currently have playable move data.
3. **Advanced attacks not implemented:** throws, supers and character powers remain placeholders in this Phase 1 build even though they can be assigned in the controls menu.
4. **Web fonts vary by operating system:** the new native system-font stack is sharp without external font downloads, but letter shapes can differ slightly on macOS/Linux versus Windows.
5. **HiDPI costs more fill rate:** on weaker GPUs, the physical-pixel raster may increase rendering load. It is capped to 3× logical resolution.

## 0.1.4 — Settings mouse navigation fix (2026-10-17)

- Fixed the left **FIGHT** tab so it returns from Settings to the main menu when clicked.
- Added mouse selection for player 1 / player 2, keyboard / controller, all action binding rows, rumble, and reset-to-defaults controls.
- Mouse click coordinates are converted to canvas coordinates, so the controls work when the game is letterboxed or resized.
- Added a regression test for navigating out of Settings during a pending rebind.
- **30/30 automated tests** passed using the local logic-test harness; direct click checks also passed.

## 0.1.2 — Dashboard main menu + rebindable settings (2026-10-17)

### Included
- Replaced the old title screen with a dashboard-style home screen inspired by the supplied mobile fighting-game menu: top status bar, left vertical tab rail, large grey content tiles with diagonal guide lines, and a dedicated Settings entry.
- Simplified the available front-end game modes to **1v1 Online** and **1v1 Vs Bot** on the main menu. The online tile is visual/UI-only for now and clearly reports that networking is not implemented in this build.
- Added a full **Settings** screen that lets you switch between **P1 / P2** and **Keyboard / Controller**, then rebind every action already supported by `InputManager` (movement, attacks, block, pause, etc.).
- Added in-menu control utilities: rumble on/off toggle, reset-to-defaults option, confirmation/cancel prompts, and toast feedback when a bind is changed.
- Preserved the cinematic roster screen, versus flow, fighting engine, pause menu and all previous automated coverage.

### Browser / automated verification
- JavaScript syntax checked for `engine.js` and `ui.js`.
- Verified via Node harness that **29/29 automated checks** still pass after the menu/settings refactor.

### Known limitations / reproduction
1. **1v1 Online is not networked yet:** select the online tile and confirm; the menu reports that the UI exists but online play is coming later.
2. **Controller rebinding uses button numbers:** in Settings, switch to Controller and confirm a binding; the menu captures the physical button and shows the logical glyph plus raw button index.
3. **Only the front-end changed:** once you choose **1v1 Vs Bot**, the current character-select and fight systems behave the same as v0.1.1.
4. **No mouse UI yet:** the dashboard and settings screens are designed for keyboard/gamepad navigation only.

## 0.1.1 — Cinematic character-select update (2026-10-17)

### Included
- Replaced the old two-box versus setup with an interactive 30-portrait gallery: two slanted five-row banks, metallic thumbnail frames, charcoal fog, center character showcase, selection effects, red P1 / blue P2 borders, vertical character-name labels and footer prompts.
- Added original, character-specific palette and headgear art data for all 30 roster entries **without** marking the 26 unfinished fighters playable.
- Added selection navigation for both players: WASD / arrow keys / D-pad or snapped analog stick, plus legacy Z/X and comma/period cycling.
- Press Light / Power to lock a playable fighter; preview-only characters show a clear warning and cannot be taken into a match. Start / Enter begins the fight, T/Tab cycles stages, Esc / Heavy returns to the title.
- Added external portrait image support via `assets.js` (`portraits.<id>.path`) with a reliable generated fallback. Retained the existing fighting simulation, keyboard/pad logic and original title/fight scenes.
- Browser-checked match entry, selection movement, stage switching, Esc return, pause/resume; **29/29 automated checks** passed in Chromium.

### Known limitations / reproduction
1. **Not official renders:** the central showcase and gallery use original stylized placeholder illustrations. The 2013 reference screenshot's photographic characters are not included. Supply custom portrait paths via `assets.js` to swap art.
2. **Most roster entries are preview-only:** select Aquaman or another unfinished fighter, then press Enter; the selector correctly refuses to start and asks for one of the four ready fighters.
3. **Dedicated stage selection screen still pending:** press T / Tab in character select to cycle stages. Stage thumbnail navigation comes in Phase 4.
4. **Controller menus are basic:** D-pad and stick, light/power for picking and Start for fighting work; the full visual rebinding/options interface is a later phase.

## 0.1.0 — Phase 1: Core engine + input layer (2026-10-17)

### Included
- 60 Hz fixed simulation; 1280×720 internal canvas with responsive 16:9 CSS letterboxing.
- Single data-driven `Fighter` class, nine prototype normals per playable character (standing/crouching/air × light/medium/heavy).
- Four playable vector placeholders: The Flash, Batman, Superman, Wonder Woman.
- Complete 30-character index: original game's 24 launch fighters + six DLC fighters, correctly classified. Other 26 fighters await character design in Phases 3 and 6.
- Movement, jump, crouch, auto-facing, forward/back walking, standing and low block, guard chip, hitstun, blockstun, hitstop, basic pushing, no-through collision and arena walls.
- Best of three rounds, 99-second clock, percentage-health timeouts, same-round draw replay, KO and match winner logic.
- Standard gamepad input (Xbox/PS5): button mapping, stick snapping, SOCD neutral, keyboard mixing, hot-plug toasts, automatic mid-match disconnect pause, pad joining, pad debug (F4).
- Original procedural arena art with eight palettes, two menu-based modes, a simple CPU, vector character poses, hit sparks, shake, synthesized audio, optional sprite-sheet playback, rumble with safe fallback.
- Hitbox and input debug F3; configurable keyboard and pad bindings via InputManager API; test page.

### Automated coverage
- 26 in-browser checks for normal data, AABBs, damage, guarding, chip, hitstun, attack frames, rounds, timer, controller mapping, SOCD, deadzone, joining, disconnect, rebinding, input edges, deterministic CPU.

### Known issues / how to reproduce
1. **Advanced mechanics deliberately absent:** press throw/power/super/meter-burn buttons during a match; they do nothing. Phase 2 will implement them.
2. **Character select is a setup screen:** cycle the four starter fighters with Z/X or ,/.; polished character grid, separate stage select, controls/rebind/options UI come in Phase 4.
3. **CPU is deliberately basic:** stand a short distance away; it approaches and attacks but does not perform advanced punish/combo decisions. Phase 5 adds three difficulty levels and richer AI.
4. **Controller rumble depends on browser/OS support:** F4 can confirm gamepad mapping, but unsupported vibration APIs silently skip feedback. The Options rumble toggle is pending.
5. **Placeholder art still limited:** the engine can already display configured sprite-sheet rows and frames, but no replacement assets are bundled. Without external assets you see the vector fighters.
6. **No fighting-game cancel/buffer windows yet:** mash an attack during another attack's recovery; the next attack may not come out. Input buffering and cancels are a Phase 2 mechanic.
7. **No frame-rate-independent rendering interpolation:** game logic is fixed at 60 Hz, but high-refresh monitors may display repeated positions between simulation frames. Visual interpolation may be added during polish.

### Next planned phase
Phase 2: combo strings and scaling, cancel windows, throw/throw tech, launcher and knockdown, special input parser, meter, clash, meter burn, supers and unique power state support.

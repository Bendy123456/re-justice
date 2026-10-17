# Changelog

## Batman Blender refinement — belt, chest, face (2026-10-17)

- Retrieved the prior editable art from the existing `batman-blender-asset` GitHub branch; no user re-upload required.
- Rebuilt the former hovering torus belt into a close-fitting mesh sampled around the source humanoid's actual waist circumference, with small rounded utility modules and a low-profile buckle.
- Replaced separated/chunky chest and rib armor with a continuous surface-wrapped ballistic cuirass, subtle inset lines, and a flush bat insignia; adjusted plate roughness and slate material shading.
- Reworked brow ridges, narrow cowl lenses, cheek guards, bridge and ear proportions while retaining the original anatomical human jaw mesh.
- Preserved the imported anatomical body and rig, unchanged gameplay code, and all existing combat/hitbox data.
- Blender CI generated the updated editable `.blend`, rigged `.glb`, full-body render, and chest/face close-up render. Final build/export passed.
- Remaining art tasks: manual high-poly sculpt refinement, realistic material textures, painted deformation weights for the armor, and detailed animation tests before game integration.

## Batman Blender Torso Armor — Sculpted Chest Pass (2026-10-17)

- Kept the anatomically shaped 65-bone CC0 humanoid, head, cape, limbs, and gameplay systems unchanged.
- Replaced the old floating rectangular chest and abdominal plates with curvature-fitted pectoral shells, inset bat emblem, oblique rib guards, thin contour seams, central abdominal scales, and clavicle transitions.
- New `blender/torso_armor.py` samples the rest-state torso mesh using BVH raycasting, subdivides the plate contours, wraps every vertex onto the skin with defined clearance, then adds realistic thickness and rounded manufactured edges.
- Rejected erroneous ray hits on the back of the model/arms at the lateral ribs to prevent floating, flared armor.
- The `batman-blender-asset` preview branch generates updated `.blend`, `.glb` and two review renders via Blender CI; this pass is not deployed into the public game.
- Known issue: this remains an early costume study. Cloth/armor weight painting and full Injustice-grade sculpt detail need additional work.

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

# Changelog

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

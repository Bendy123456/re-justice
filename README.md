# Shattered Accord — Phase 1 + Character Select + Dashboard Menu (v0.1.2)

## Model Viewer — visual-only starter-rig milestone

Open **[Model Viewer](model-viewer.html)** locally or on Render at **https://re-justice.onrender.com/model-viewer.html**.

The Flash, Batman, Superman, and Wonder Woman now render with distinct, data-driven 2D skeletal rigs, animated poses and illustrated costumes. The debug viewer lets you select all available poses (including nine normal attacks), scrub exact animation frames, preview alternate colors, turn on skeleton guides and overlay the existing frame-data hitboxes. The viewer does not simulate combat.

To select a character with your mouse on the in-game selection screen, click any portrait. Click your already-selected playable portrait again to lock it; hold **Shift** while clicking to control P2. **Enter** or **Start** begins the match after a playable character is selected.

The new rig is a procedural fallback: external sprite sheets specified in `assets.js` still take precedence. All combat logic, health, hitboxes, move frame data and stages remain unchanged.


A local, original placeholder-art, browser fighting game **inspired by** classic 2D superhero fighters. It does not bundle game art, audio, sprite sheets, or source code from Injustice.

## Launch

1. Extract the entire ZIP into one folder.
2. Open **index.html** in Chrome, Edge, or Firefox. No installation, server, account, or build step is required.
3. On the new dashboard-style **Main Menu**, choose **1V1 VS BOT** to open character select, or choose **SETTINGS** to edit controls. The **1V1 ONLINE** tile is currently a visual placeholder that clearly reports online play is not implemented yet.
4. In **Settings**, use Up/Down to move, Left/Right to switch **P1/P2** or **Keyboard/Controller**, and Enter / A to rebind the highlighted action. You can also toggle rumble and reset all bindings to defaults.
5. The character-select menu displays all 30 roster portraits in angled banks, with a selected fighter in the middle. Only **Flash, Batman, Superman and Wonder Woman** are currently playable; choosing anyone else lets you preview them but blocks starting a match until their move data is implemented.
6. Choose with P1 **WASD** / D-pad/stick or legacy **Z/X** (horizontal). P2 uses **arrow keys** / their D-pad/stick or **comma/period** (horizontal). Press **J / pad Light** to toggle the character's lock, **T** or **Tab** to cycle stages, **Enter / Start** to fight, **Esc / B-Circle** to go back. The centre fighter updates when either player's selection moves. First keyboard action reserves the keyboard player slot; the first gamepad pressed is assigned to the first available slot.
7. To run tests, open **tests.html** and check that all 29 checks are green. 


## Keyboard (defaults)

| Action | P1 | P2 |
| --- | --- | --- |
| Move/jump/crouch | W A S D | Arrow keys |
| Light / Medium / Heavy | J / K / L | Numpad 1 / 2 / 3 |
| Block alternative | I | Numpad 5 |
| Title navigation | W/S or Up/Down | Arrow keys |
| Title confirm, start round | Enter | Enter |
| Select P1 fighter | WASD directions or Z / X horizontally | — |
| Select P2 fighter | — | Arrow directions or , / . horizontally |
| Change stage in setup | T or Tab | — |
| Lock selected fighter | J or pad X/Square | Numpad 1 or pad X/Square |
| Pause | Esc | Enter / pad Start |
| Quit paused match | Q | — |
| Hitbox debug | F3 | — |
| Gamepad diagnostics | F4 | — |

**Important:** Hitstun, blocking, air attacks and movement work. Throws, specials, powers, supers, meter burn, clash and other Phase 2+ features are **not yet implemented**. Unused buttons are mapped in `input.js` for the next phases.

## Xbox & PS5

Uses the standardized Gamepad API in supported desktop browsers. Press a physical controller button after connecting it. On the versus setup screen, the first free player slot is assigned automatically: first gamepad normally becomes P1, second becomes P2. To play **P1 keyboard / P2 controller**, press a P1 key to reserve P1 **before** pressing the pad's first button on the versus screen.

- Left stick or D-pad: move/jump/crouch. Diagonal inputs snap to eight directions; the analog deadzone is 0.35.
- Xbox X / PS Square: Light; Xbox Y / PS Triangle: Medium; Xbox B / PS Circle: Heavy.
- Xbox A / PS Cross: confirm menu; Start/Options: pause or start.
- LT/L2: block. All advanced-action bindings are already registered but only Phase 1 actions are functional.
- F4 displays connected pad indices, raw button values and axes. Hit/block rumble is enabled by default where supported; the settings API can disable it until the Options toggle arrives.

## Adding assets

All replacement artwork and audio paths live in `assets.js`. In addition to `characters` sprite sheets, the `portraits` asset map accepts per-character image paths (e.g. `portraits.flash.path: "assets/flash_portrait.png"`) for the selection gallery. These images are drawn proportionally to fill their cards, and the fallback illustrations are always available.  The defaults are empty, which means the vector fighters, procedural stages and Web Audio tones always render. A missing or failed optional resource falls back to a generated placeholder. You can edit the paths to use local PNG sprite sheets or WAV/MP3 files. PNG sprite-sheet playback is supported now when you supply `path`, `frameWidth`, `frameHeight`, `rows`, and optional `frames` in the character asset config. Missing sheets still use vector-art fallback.

## Source architecture

- `index.html` — the fixed-resolution, responsive 16:9 canvas and script loader
- `engine.js` — deterministic 60 Hz simulation, state changes, hit detection and round rules
- `characters.js` — 30-character base+DLC index and four playable normal-move data templates
- `stages.js` — eight stage data definitions
- `ui.js` — cinematic, animated roster selector, original portrait illustrations, fighter showcase, 3D-style gallery framing and fight HUD
- `ai.js` — simple deterministic seeded CPU
- `audio.js` — generated synthesized audio and optional custom clips
- `input.js` — one unified keyboard + standardized gamepad action layer
- `assets.js` — all external image and audio paths
- `tests.html`, `tests.js` — in-browser automated checks
- `CHANGELOG.md` — milestone log and reproducible known issues

## Scope

Phase 1 is a complete, working playable milestone, **not the finished seven-phase game**. Later phases will extend the exact same project, not replace the core with per-character engines.

## Visual fidelity and known limitations (v0.1.2)

The **layout and mood** of the selection screen follow the supplied 2013 fighting-game screenshot: tilted portrait banks on both sides, a large central character showcase, red P1 / pale-blue P2 selection borders, smoky backdrop, and vertical character names. The bundled portraits and characters are **new vector placeholder illustrations**, not extracted 3D models or official promotional renders. To match the screenshot's photo-real character assets, supply your own images using `assets.js`.

- All 30 character portraits appear; only four fighters can actually fight at this development stage.
- The gallery is an original playable recreation, not a pixel-perfect reproduction of copyrighted UI art.
- Stage selection is still on **T/Tab** inside the character select screen; its own thumbnail screen is planned for the later UI phase.
- The full controller rebinding/options screens, advanced combat and other modes are not yet complete. Refer to `CHANGELOG.md` for the ongoing phase status.

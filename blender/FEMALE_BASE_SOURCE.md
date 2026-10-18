# Female base model — source and pipeline

RE-Justice's shared `female-unarmored.glb` is built from the **genuine female
superhero base** in Quaternius's **Universal Base Characters [Standard]** pack.

- Original author: Quaternius
- Official download: https://quaternius.itch.io/universal-base-characters
- License: CC0 1.0 Universal (public domain)
- Original pack path: `Base Characters/Godot - UE/Superhero_Female_FullBody.gltf`
- Converted copy fetched in CI: https://raw.githubusercontent.com/glanderness/BeefTV/main/web/public/canvas/models/quaternius-standard-female.glb
- Converted copy provenance: https://github.com/glanderness/BeefTV/blob/main/web/public/canvas/models/quaternius-standard-female.LICENSE.md

The converted GLB retains the skinned topology and 65-joint skeleton. The
original pack's optional source textures were removed in the conversion.
RE-Justice's Blender build applies the same matte blue-gray material as the
unarmored male model.

Run with Blender installed and the input copy saved as
`blender/resources/cc0_female.glb`:

```bash
blender -b --python-exit-code 1 --python blender/build_game_female_base.py
```

Outputs are the editable Blender source `assets/models/female-unarmored.blend`,
the browser model `assets/models/female-unarmored.glb`, and 4 QA views.

The female base is intentionally bald and unarmored. A small chest shaping
key is retained, but all other anatomy remains native to the female mesh.

This only changes art. Hitboxes, combat, AI and game controls stay in their
original 2D code. The original Quaternius license applies to the base mesh.

"""Build a shared female base model for RE-Justice's eight female roster slots.

Inputs:
  CC0 humanoid base mesh and 65-bone rig from Quaternius-derived GLB
Outputs:
  assets/models/female-unarmored.glb
  assets/models/female-unarmored-preview.png
  assets/models/female-face-preview.png

Original, unarmored, hair-free, masked-free silhouette. Exactly the same
blue-gray matte body material as the existing male base. Mesh deforms through
the existing game-compatible named rig (no runtime physics or gameplay changes).
"""
import bpy
import math
import os
import sys
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
from bald_head_sculpt import apply_bald_head

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SOURCE = os.path.join(ROOT, "blender", "resources", "cc0_humanoid.glb")
DEST = os.path.join(ROOT, "assets", "models")
os.makedirs(DEST, exist_ok=True)

# Named, editable anatomical proportion controls.
FEMALE_PROPORTIONS = {
    "shoulder_reduction": .080,
    "upper_waist_reduction": .075,
    "waist_reduction": .118,
    "hip_increase": .100,
    "upper_thigh_increase": .032,
    "neck_reduction": .075,
    "lower_face_reduction": .073,
    "temple_reduction": .036,
    "cheek_contour": .026,
    # Medium, natural chest increase — shared across all eight female slots.
    "bust_volume": .052,
    "bust_width": .094,
    "bust_height": .078,
    "bust_position_x": .118,
    "bust_position_z": 1.412,
    "bust_blend_center_y": -.110,
    "glute_contour": .015,
}

SUIT_COLOR = (.065, .079, .095)
EYE_COLOR = (.095, .115, .139)
PREVIEW_SAMPLES = 14

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=SOURCE)

objects = list(bpy.context.scene.objects)
rig = next(o for o in objects if o.type == "ARMATURE")
body = next(o for o in objects if o.type == "MESH" and o.name.startswith("SuperHero_Male"))
eyes = next((o for o in objects if o.type == "MESH" and o.name.startswith("Eyes")), None)
brows = next((o for o in objects if o.type == "MESH" and o.name.startswith("Eyebrows")), None)

for ob in objects:
    if ob.type == "MESH" and ob not in (body, eyes, brows):
        bpy.data.objects.remove(ob, do_unlink=True)

def matte(name, color, roughness):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.diffuse_color = (*color, 1.0)
    shader = m.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = .015
    return m

suit = matte("RE-Justice blue gray • shared male/female cloth",
             SUIT_COLOR, .91)
eye = matte("Neutral non-glowing eyes", EYE_COLOR, .92)
bald_key = apply_bald_head(body, eyes, brows, suit, suit, eye)

# Shape keys leave the CC0 underlying mesh, weights, and 65-bone skeleton
# unchanged. Every body change is adjustable or can be disabled in Blender.
sculpt = body.shape_key_add(name="Female anatomy • natural proportions", from_mix=True)
# Existing bald-face morph is baked into female key; do not apply twice.
bald_key.value = 0.0

def gauss(value, center, radius):
    return math.exp(-((value - center) / radius) ** 2)

def smoothstep(edge0, edge1, value):
    t = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)

def smooth_band(z, low, top, feather):
    return smoothstep(low, low + feather, z) * (1 - smoothstep(top - feather, top, z))

changed = 0
for v, key in zip(body.data.vertices, sculpt.data):
    x, y, z = v.co
    dx = dy = dz = 0.0
    absx = abs(x)

    # The Quaternius model's arms extend outward along X in rest pose.
    # Limit lateral anatomical corrections to near the torso or pelvis,
    # preserving arm bone pivots and finger deformation.
    center_torso = 1 - smoothstep(.205, .410, absx)
    center_legs = 1 - smoothstep(.190, .345, absx)

    # Athletic feminine proportions — shoulder, waist and hip profile.
    shoulder = gauss(z, 1.540, .138) * center_torso
    upper_waist = gauss(z, 1.280, .102) * center_torso
    waist = gauss(z, 1.137, .095) * center_torso
    hips = gauss(z, .957, .130) * center_legs
    thigh = gauss(z, .740, .150) * center_legs
    scale_x = 1 \
        - FEMALE_PROPORTIONS["shoulder_reduction"] * shoulder \
        - FEMALE_PROPORTIONS["upper_waist_reduction"] * upper_waist \
        - FEMALE_PROPORTIONS["waist_reduction"] * waist \
        + FEMALE_PROPORTIONS["hip_increase"] * hips \
        + FEMALE_PROPORTIONS["upper_thigh_increase"] * thigh
    dx += x * (scale_x - 1.0)

    # Subtle natural chest silhouette inside the same seamless cloth base.
    # Blend into both sides of the sternum with no separate spheres, seam,
    # breast armor, or cleavage geometry.
    breast_z = gauss(z, FEMALE_PROPORTIONS["bust_position_z"],
                     FEMALE_PROPORTIONS["bust_height"])
    breast_x = (
        gauss(x, -FEMALE_PROPORTIONS["bust_position_x"],
              FEMALE_PROPORTIONS["bust_width"]) +
        gauss(x, FEMALE_PROPORTIONS["bust_position_x"],
              FEMALE_PROPORTIONS["bust_width"])
    )
    chest_front = (1 - smoothstep(-.115, .018, y))
    dy -= FEMALE_PROPORTIONS["bust_volume"] * breast_x * breast_z * chest_front

    # Small posterior hip silhouette, but no explicit anatomy details.
    dy += FEMALE_PROPORTIONS["glute_contour"] * hips * smoothstep(.005, .145, y)

    # Natural uncovered, feminine human face: narrower jaw/temples and
    # smooth cheek taper, still one contiguous head/neck skin mesh.
    head = smoothstep(1.570, 1.625, z)
    head *= 1 - smoothstep(1.810, 1.860, z)
    lower_face = gauss(z, 1.625, .077) * head
    temples = gauss(z, 1.710, .050) * head
    cheek = gauss(z, 1.673, .048) * head
    dx -= x * (FEMALE_PROPORTIONS["lower_face_reduction"] * lower_face +
               FEMALE_PROPORTIONS["temple_reduction"] * temples +
               FEMALE_PROPORTIONS["cheek_contour"] * cheek)

    # Slimmer neck transition without a disconnected new head.
    neck = gauss(z, 1.565, .060) * (1 - smoothstep(.075, .19, absx))
    dx -= x * FEMALE_PROPORTIONS["neck_reduction"] * neck

    key.co = (x + dx, y + dy, z + dz)
    if abs(dx) + abs(dy) + abs(dz) > 0.00001:
        changed += 1

sculpt.value = 1.0
body.name = "REJustice_Female_Unarmored"
rig.name = "REJustice_65Bone_FemaleRig"
# Eyes/brows remain matte. Their original skin/rig positions are intact.
# Ensure no armor or hair objects were accidentally exported.
assert len(rig.data.bones) >= 60
assert all(o in (body, eyes, brows) for o in bpy.context.scene.objects
           if o.type == "MESH"), "Only body, eyes and brows belong in the base GLB"

# Export actual skinned mesh with shape keys and existing joint weights.
bpy.ops.object.select_all(action="DESELECT")
rig.select_set(True)
for obj in (body, eyes, brows):
    if obj:
        obj.select_set(True)
bpy.context.view_layer.objects.active = rig
path = os.path.join(DEST, "female-unarmored.glb")
bpy.ops.export_scene.gltf(filepath=path, export_format="GLB",
                           use_selection=True, export_animations=True,
                           export_morph=True)
assert os.path.getsize(path) > 100000

# Save editable Blender artist project (not loaded by the game).
project = os.path.join(DEST, "female-unarmored.blend")

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = PREVIEW_SAMPLES
scene.cycles.use_denoising = False
bpy.context.view_layer.cycles.use_denoising = False
scene.render.resolution_x = 700
scene.render.resolution_y = 880
scene.render.resolution_percentage = 100
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (.035, .050, .080, 1)
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .65

def area_light(name, pos, energy, color, size):
    d = bpy.data.lights.new(name, "AREA")
    d.energy = energy
    d.color = color
    d.size = size
    o = bpy.data.objects.new(name, d)
    scene.collection.objects.link(o)
    o.location = pos
    o.rotation_euler = (Vector((0,0, .95)) - o.location).to_track_quat("-Z", "Y").to_euler()

area_light("Soft key", (-3,-4,3), 500, (.9,.94,1), 4)
area_light("Cool rim", (2,3,3), 600, (.74,.83,1), 3)

def camera(name, pos, target, scale):
    d = bpy.data.cameras.new(name)
    o = bpy.data.objects.new(name,d)
    scene.collection.objects.link(o)
    o.location=pos
    o.rotation_euler=(Vector(target)-o.location).to_track_quat("-Z","Y").to_euler()
    d.type = "ORTHO"
    d.ortho_scale = scale
    return o

full = camera("Female unarmored • full body", (2.8,-5.6,2.5),(0,0,.88),2.5)
face = camera("Female unarmored • face", (1.6,-2.75,1.94),(0,0,1.61),.7)
scene.camera=full
scene.render.filepath=os.path.join(DEST, "female-unarmored-preview.png")
bpy.ops.render.render(write_still=True)
scene.camera=face
scene.render.filepath=os.path.join(DEST, "female-face-preview.png")
bpy.ops.render.render(write_still=True)
scene.camera=full
bpy.ops.wm.save_as_mainfile(filepath=project)
print("FEMALE_BASE_SUCCESS",len(rig.data.bones),len(body.data.vertices),
      "sculpted_verts",changed,"glb_bytes",os.path.getsize(path))

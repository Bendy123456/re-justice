"""RE-Justice: anatomically female base, not a modified male model.
Source: Quaternius Universal Base Characters / Superhero Female FullBody (CC0).
Distributed source mesh: glanderness/BeefTV, quaternius-standard-female.glb
Keeps the 65-bone humanoid rig and supports the unchanged 2D gameplay engine.
"""
import bpy
import math
import os
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SOURCE = os.path.join(ROOT, "blender", "resources", "cc0_female.glb")
DEST = os.path.join(ROOT, "assets", "models")
os.makedirs(DEST, exist_ok=True)

FEMALE_SCULPT = {
    "extra_bust_projection": .019,
    "bust_center_x": .105,
    "bust_center_z": 1.358,
    "bust_width": .095,
    "bust_height": .072,
}
SUIT_COLOR = (.065, .079, .095)
EYE_COLOR = (.095, .115, .139)
PREVIEW_SAMPLES = 18

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=SOURCE)

original=list(bpy.context.scene.objects)
rig=next(x for x in original if x.type=="ARMATURE")
body=next(x for x in original if x.type=="MESH" and x.name.startswith("Superhero_Female"))
eyes=next((x for x in original if x.type=="MESH" and x.name.startswith("Eyes")),None)
brows=next((x for x in original if x.type=="MESH" and x.name.startswith("Eyebrows")),None)

for obj in original:
    if obj.type=="MESH" and obj not in (body,eyes,brows):
        bpy.data.objects.remove(obj,do_unlink=True)

def matte(name, rgb, rough):
    mat=bpy.data.materials.new(name)
    mat.use_nodes=True
    mat.diffuse_color=(*rgb,1)
    principled=mat.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value=(*rgb,1)
    principled.inputs["Roughness"].default_value=rough
    principled.inputs["Metallic"].default_value=.015
    return mat

suit=matte("RE-Justice blue gray • same as male base", SUIT_COLOR, .91)
eye=matte("Unmasked natural dark eye", EYE_COLOR, .92)
body.data.materials.clear()
body.data.materials.append(suit)
for face in body.data.polygons: face.material_index=0
for obj,mat in ((eyes,eye),(brows,suit)):
    if obj:
        obj.data.materials.clear()
        obj.data.materials.append(mat)
        obj.hide_render=False

# Keep the actual female shoulders, jaw, rib cage, pelvis and limbs.
# This original female topology already includes an anatomically feminine
# bust and face. Apply only a modest chest shaping pass on the existing mesh,
# retaining the previously requested "medium" contour.
body.shape_key_add(name="Native female superhero base",from_mix=False)
shape=body.shape_key_add(name="RE-Justice medium bust polish",from_mix=False)
def gauss(v,center,radius):
    return math.exp(-((v-center)/radius)**2)
def smoothstep(lo,hi,v):
    t=max(0,min(1,(v-lo)/(hi-lo)))
    return t*t*(3-2*t)
changed=0
for vertex,sk in zip(body.data.vertices,shape.data):
    x,y,z=vertex.co
    chest_x=(gauss(x,-FEMALE_SCULPT["bust_center_x"],FEMALE_SCULPT["bust_width"])
              +gauss(x,FEMALE_SCULPT["bust_center_x"],FEMALE_SCULPT["bust_width"]))
    chest_z=gauss(z,FEMALE_SCULPT["bust_center_z"],FEMALE_SCULPT["bust_height"])
    in_front=1-smoothstep(-.105,.015,y)
    push=-FEMALE_SCULPT["extra_bust_projection"]*chest_x*chest_z*in_front
    sk.co=(x,y+push,z)
    changed+=abs(push)>1e-5
shape.value=1.0

# No extra armor mesh, cape, goggles or hairstyle: pure native female base.
assert len(rig.data.bones)==65
assert all(o in (body,eyes,brows) for o in bpy.context.scene.objects if o.type=="MESH")
body.name="REJustice_Female_Unarmored"
rig.name="REJustice_65Bone_FemaleRig"
bpy.ops.object.select_all(action="DESELECT")
rig.select_set(True)
for obj in (body,eyes,brows):
    if obj:obj.select_set(True)
bpy.context.view_layer.objects.active=rig
outglb=os.path.join(DEST,"female-unarmored.glb")
bpy.ops.export_scene.gltf(filepath=outglb,export_format="GLB",
                          use_selection=True,export_animations=True,export_morph=True)
assert os.path.getsize(outglb)>100_000

scene=bpy.context.scene
scene.render.engine="CYCLES"
scene.cycles.samples=PREVIEW_SAMPLES
scene.cycles.use_denoising=False
bpy.context.view_layer.cycles.use_denoising=False
scene.render.resolution_x=700
scene.render.resolution_y=880
scene.render.resolution_percentage=100
scene.world.use_nodes=True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value=(.035,.05,.08,1)
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value=.65
def area(name,pos,energy,color,size):
    datablock=bpy.data.lights.new(name,"AREA")
    datablock.energy=energy
    datablock.color=color
    datablock.size=size
    obj=bpy.data.objects.new(name,datablock)
    scene.collection.objects.link(obj)
    obj.location=pos
    obj.rotation_euler=(Vector((0,0,.92))-obj.location).to_track_quat("-Z","Y").to_euler()

area("Soft white key",(-3,-4,3),500,(.9,.94,1),4)
area("Cool edge rim",(2,3,3),600,(.74,.83,1),3)
def camera(name,pos,target,scale):
    datablock=bpy.data.cameras.new(name)
    obj=bpy.data.objects.new(name,datablock)
    scene.collection.objects.link(obj)
    obj.location=pos
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat("-Z","Y").to_euler()
    datablock.type="ORTHO"
    datablock.ortho_scale=scale
    return obj

views=[
    ("female-unarmored-preview.png","Female 3/4 full body",
        (2.8,-5.6,2.5),(0,0,.88),2.5),
    ("female-face-preview.png","Female 3/4 natural face",
        (1.6,-2.75,1.91),(0,0,1.57),.70),
    ("female-front-preview.png","Female frontal anatomy",
        (0,-5.4,2.15),(0,0,.86),2.43),
    ("female-profile-preview.png","Female profile anatomy",
        (5.5,0,2.15),(0,0,.86),2.43)
]
for filename,name,pos,target,scale in views:
    scene.camera=camera(name,pos,target,scale)
    scene.render.filepath=os.path.join(DEST,filename)
    bpy.ops.render.render(write_still=True)
scene.camera=bpy.data.objects["Female 3/4 full body"]
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(DEST,"female-unarmored.blend"))
print("REAL_FEMALE_BASE_SUCCESS",len(rig.data.bones),len(body.data.vertices),
      "bust_vertices",changed,"glb_bytes",os.path.getsize(outglb))

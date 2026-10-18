"""Build the approved unarmored, bald male body for the RE-Justice roster.
Source: Quaternius CC0 humanoid (original 65-bone armature). No armor meshes.
Output: assets/models/male-unarmored.glb, neutral bust review image.
This file changes ONLY artwork and never imports or modifies gameplay code.
"""
import bpy, os, sys
from mathutils import Vector
sys.path.insert(0,os.path.dirname(__file__))
from bald_head_sculpt import apply_bald_head
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
MODEL=os.path.join(ROOT,'blender','resources','cc0_humanoid.glb')
DEST=os.path.join(ROOT,'assets','models')
os.makedirs(DEST,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=MODEL)
all_objs=list(bpy.context.scene.objects)
rig=next(o for o in all_objs if o.type=='ARMATURE')
body=next(o for o in all_objs if o.type=='MESH' and o.name.startswith('SuperHero_Male'))
eyes=next((o for o in all_objs if o.type=='MESH' and o.name.startswith('Eyes')),None)
brows=next((o for o in all_objs if o.type=='MESH' and o.name.startswith('Eyebrows')),None)
for o in all_objs:
    if o.type=='MESH' and o not in (body,eyes,brows):
        bpy.data.objects.remove(o,do_unlink=True)
def matte(name,color,roughness):
    m=bpy.data.materials.new(name)
    m.use_nodes=True
    m.diffuse_color=(*color,1)
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=.015
    p.inputs['Roughness'].default_value=roughness
    return m
suit=matte('RE-Justice • matte blue-gray same as Batman body',(.065,.079,.095),.91)
eye=matte('Natural eye dark-gray non-glowing',(.095,.115,.139),.92)
apply_bald_head(body,eyes,brows,suit,suit,eye)
# Keep original Quaternius bone weights and armature.
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
for o in (body,eyes,brows):
    if o:
        o.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(
    filepath=os.path.join(DEST,'male-unarmored.glb'),
    export_format='GLB',use_selection=True,export_animations=True
)
assert len(rig.data.bones)>=60
# Render preview using the actual glTF source geometry and approved material.
c=bpy.context.scene
c.render.engine='BLENDER_EEVEE_NEXT' if bpy.app.version[0]>=4 and bpy.app.version[1]>=2 else 'BLENDER_EEVEE'
c.render.resolution_x=700;c.render.resolution_y=880;c.render.resolution_percentage=100
c.world.use_nodes=True
c.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.035,.05,.08,1)
c.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65
def area(name,location,energy,color,size):
    d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.color=color;d.size=size
    ob=bpy.data.objects.new(name,d);c.collection.objects.link(ob);ob.location=location
    ob.rotation_euler=(Vector((0,0,.95))-ob.location).to_track_quat('-Z','Y').to_euler()
area('Key',(-3,-4,3),480,(.90,.94,1.0),4)
area('Rim',(2,3,3),670,(.74,.84,1.0),3)
d=bpy.data.cameras.new('Male anatomical preview')
camera=bpy.data.objects.new('Male anatomical preview',d);c.collection.objects.link(camera)
camera.location=(2.8,-5.6,2.5)
camera.rotation_euler=(Vector((0,0,.88))-camera.location).to_track_quat('-Z','Y').to_euler()
d.type='ORTHO';d.ortho_scale=2.50;c.camera=camera
c.render.filepath=os.path.join(DEST,'male-unarmored-preview.png')
bpy.ops.render.render(write_still=True)
print('MALE_BASE_SUCCESS',len(rig.data.bones),len(body.data.vertices),os.path.getsize(os.path.join(DEST,'male-unarmored.glb')))

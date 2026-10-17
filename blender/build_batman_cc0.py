"""Blender Batman character study built over the CC0 Quaternius superhero humanoid.
The input source is a public-domain Quaternius-derived mesh, not extracted DC game geometry.
Outputs are a Blender scene, GLB, and two inspection renders.
"""
import bpy, math, os
from math import sin,cos,pi
from mathutils import Vector
BASE=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
OUT=os.path.join(BASE,'generated','batman_cc0')
os.makedirs(OUT,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=os.path.join(BASE,'blender','resources','cc0_humanoid.glb'))
rig=next(x for x in bpy.context.scene.objects if x.type=='ARMATURE')
for o in list(bpy.context.scene.objects):
    if o.name in ('Cube','Icosphere'):
        bpy.data.objects.remove(o,do_unlink=True)
body=next(o for o in bpy.context.scene.objects if o.type=='MESH' and 'SuperHero' in o.name)
bpy.context.scene.render.engine='CYCLES'
bpy.context.scene.cycles.samples=24
bpy.context.view_layer.cycles.use_denoising=False
bpy.context.scene.cycles.use_denoising=False
bpy.context.scene.render.resolution_x=950
bpy.context.scene.render.resolution_y=950
bpy.context.scene.render.resolution_percentage=100
C=bpy.context.scene
C.view_settings.view_transform='Standard';C.view_settings.look='Medium High Contrast'
def material(name,color,metal=0,rough=.72,noise=False):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    if noise:
        t=m.node_tree.nodes.new('ShaderNodeTexNoise');t.inputs['Scale'].default_value=172
        bump=m.node_tree.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.1
        bump.inputs['Distance'].default_value=.0018
        m.node_tree.links.new(t.outputs['Fac'],bump.inputs['Height'])
        m.node_tree.links.new(bump.outputs['Normal'],p.inputs['Normal'])
    return m
FABRIC=material('Kevlar fitted underlayer',(0.065,.079,.095),rough=.91,noise=True)
METAL=material('Gunmetal protective armor',(0.11,.13,.16),metal=.17,rough=.73)
EDGE=material('Beveled metal highlights',(0.18,.20,.23),metal=.22,rough=.63)
CHEST_ARMOR=material('Molded matte ballistic chest composite',(0.082,.102,.126),metal=.12,rough=.74,noise=True)
CHEST_LIP=material('Low gloss chest tooling',(0.114,.133,.154),metal=.25,rough=.60)
COWL=material('Cowl matte carbon',(0.025,.033,.044),rough=.72,noise=True)
SKIN=material('Exposed face',(0.46,.30,.22),rough=.83)
BELT=material('Old-gold utility pouches',(0.33,.25,.11),metal=.35,rough=.70)
CAPE=material('Heavy black cape',(0.018,.024,.033),rough=.98,noise=True)
EYES=material('Cowl white slit lenses',(.76,.84,.88),rough=.24)
body.data.materials.clear();body.data.materials.append(FABRIC)
body.data.materials.append(SKIN)
# Paint the actual imported anatomical face polygons, rather than placing a sphere on it.
for poly in body.data.polygons:
    p=body.matrix_world @ poly.center
    if 1.615 < p.z < 1.695 and abs(p.x) < .113 and p.y < -.065:
        poly.material_index=1
for o in bpy.context.scene.objects:
    if o.type=='MESH' and o!=body:
        o.data.materials.clear();o.data.materials.append(EYES)
extras=[]
def add(name,verts,faces,m,bone='spine_03',smooth=False,solid=0):
    d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update()
    obj=bpy.data.objects.new(name,d);C.collection.objects.link(obj)
    d.materials.append(m)
    for f in d.polygons:f.use_smooth=smooth
    if solid:
        mod=obj.modifiers.new('Surface thickness','SOLIDIFY');mod.thickness=solid
    extras.append((obj,bone));return obj
def panel(name,poly,y,m,bone='spine_03',th=.012):
    verts=[(x,y,z) for x,z in poly]
    return add(name,verts,[tuple(range(len(verts)))],m,bone,False,th)
def ellipse(name,loc,radii,m,bone):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,location=loc)
    o=bpy.context.object;o.name=name;o.scale=radii
    o.data.materials.clear();o.data.materials.append(m);extras.append((o,bone));return o
def lathe(name,rings,m,bone,N=32):
    verts=[];faces=[]
    for z,rx,ry,cy in rings:
        for j in range(N):
            a=j*pi*2/N;verts.append((rx*cos(a),cy+ry*sin(a),z))
    for r in range(len(rings)-1):
        for j in range(N):
            a=r*N+j;b=r*N+(j+1)%N;faces.append((a,b,b+N,a+N))
    faces.append(tuple(range(N-1,-1,-1)))
    faces.append(tuple((len(rings)-1)*N+j for j in range(N)))
    o=add(name,verts,faces,m,bone,True)
    sub=o.modifiers.new('Anatomic subdivision','SUBSURF');sub.levels=1;sub.render_levels=2
    return o
def rod(name,a,b,r,m,bone):
    d=Vector(b)-Vector(a)
    bpy.ops.mesh.primitive_cylinder_add(vertices=14,radius=r,depth=d.length,location=(Vector(a)+Vector(b))/2)
    o=bpy.context.object;o.name=name
    o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
    o.data.materials.clear();o.data.materials.append(m);extras.append((o,bone));return o
# Body proportions remain exactly those of the imported CC0 mesh.
# Armor comes from a dedicated body-surface-projected generator; no body edits.
import sys
sys.path.insert(0,os.path.dirname(__file__))
from torso_armor import build_torso_armor
TORso_qa=build_torso_armor(body,extras,{
    "matte":CHEST_ARMOR, "bright":CHEST_LIP, "dark":COWL,
    "soft":CHEST_ARMOR, "seam":COWL, "crest":COWL,
})
# Tailored belt and cowl use original CC0 topology, preserving existing body.
from belt_face_refine import build_fitted_belt, build_fitted_cowl
DARK_TRIM=material('Near-black tactical flex seals',(0.042,.049,.058),rough=.82,noise=True)
BELT_STRAP=material('Belt fitted graphite webbing',(0.098,.082,.062),rough=.88,noise=True)
BELT_MODULE=material('Muted machined utility module',(0.37,.275,.129),metal=.30,rough=.58)
BELT_REFINE=build_fitted_belt(body,extras,{
    "strap":BELT_STRAP,"trim":BELT,"pouch":BELT_MODULE,"dark":DARK_TRIM,
})
# True anatomical cowl: one sculpted angular crown/brow/temple shell.
# Replaces the spherical lathe, square eye plates and stuck-on triangles.
# This is a render-only mesh and inherits the existing Head bone.
from cowl_sculpt import build_sculpted_cowl
COWL_SEAM=material('Under-cowl optical shadow',(0.016,.022,.032),rough=.90)
COWL_QA=build_sculpted_cowl(extras,{
    "shell":COWL,"seam":COWL_SEAM,"lens":EYES
})
# A proper cloth cape surface with controlled folds and broad scalloped points
verts=[];faces=[];NX=43;NZ=36
for j in range(NZ):
    t=j/(NZ-1)
    width=.24+t*.48
    z=1.52-t*1.43
    for i in range(NX):
        u=i/(NX-1)*2-1
        x=u*width
        hem=.12*abs(sin(u*pi*3.5))*t**19
        y=.18+.10*t+.04*sin(u*pi*5)*(t+.2)
        verts.append((x,y,z+hem))
for j in range(NZ-1):
    for i in range(NX-1):
        a=j*NX+i;faces.append((a,a+1,a+NX+1,a+NX))
add('Scalloped black fabric cape',verts,faces,CAPE,'spine_03',True,.005)
# Skin new objects to the existing 65-bone Quaternius armature.
for ob,bone in extras:
    if ob.type!='MESH' or bone not in rig.data.bones:continue
    ob.parent=rig
    grp=ob.vertex_groups.new(name=bone)
    grp.add(list(range(len(ob.data.vertices))),1.0,'REPLACE')
    am=ob.modifiers.new('Reuse CC0 skeleton','ARMATURE');am.object=rig
# Material: body uses same subtle Kevlar shader, hand / face silhouette retains Quaternius topology.
# For model study arms stay in source A/T pose for checking anatomical mesh and rig.
C.world.use_nodes=True
C.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.04,.05,.067,1)
C.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.42
def area(name,loc,power,col,size):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=col;d.shape='DISK';d.size=size
    o=bpy.data.objects.new(name,d);C.collection.objects.link(o);o.location=loc
    v=Vector((0,0,1))-o.location;o.rotation_euler=v.to_track_quat('-Z','Y').to_euler()
area('Large cool key',(-2,-3,4),420,(.84,.91,1),4)
area('Warm rim',(3,3,2.6),640,(1,.80,.65),3.5)
area('Face fill',(2,-3,2),180,(.85,.91,1),3)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.011))
floor=bpy.context.object;floor.name='STUDIO GROUND (render only)';floor.data.materials.append(material('Studio floor',(.047,.06,.078)))
def cam(name,pos,at,scale):
    d=bpy.data.cameras.new(name);o=bpy.data.objects.new(name,d);C.collection.objects.link(o)
    o.location=pos;o.rotation_euler=(Vector(at)-o.location).to_track_quat('-Z','Y').to_euler()
    d.type='ORTHO';d.ortho_scale=scale;return o
full=cam('CC0 Batman full body',(3,-6.2,2.5),(0,0,.94),2.7)
face=cam('CC0 Batman armor closer',(1.8,-3.8,1.9),(0,0,1.4),1.40)
C.camera=full;C.render.filepath=os.path.join(OUT,'batman_cc0_fullbody.png')
bpy.ops.render.render(write_still=True)
C.camera=face;C.render.filepath=os.path.join(OUT,'batman_cc0_closeup.png')
bpy.ops.render.render(write_still=True)
# Studio closeups expressly for quality-checking skull profile, ear roots,
# forehead integration and exposed lower face (not in the exported character).
front_head=cam('Cowl inspection — true front',(0,-3.3,1.71),(0,0,1.74),.57)
side_head=cam('Cowl inspection — profile',(3.3,-.45,1.71),(0,0,1.74),.57)
C.camera=front_head
C.render.filepath=os.path.join(OUT,'batman_cowl_front.png')
bpy.ops.render.render(write_still=True)
C.camera=side_head
C.render.filepath=os.path.join(OUT,'batman_cowl_profile.png')
bpy.ops.render.render(write_still=True)
C.camera=full
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'REJustice_Batman_CC0_Base.blend'))
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
for ob in (body,*[x for x,b in extras]):ob.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'REJustice_Batman_CC0_Base.glb'),
    export_format='GLB',use_selection=True,export_animations=True)
with open(os.path.join(OUT,'README.txt'),'w') as q:
    q.write('Quaternius Universal Base Characters: CC0 1.0 public domain\n')
    q.write('Derived base from https://github.com/programasweights/avatar\n')
    q.write('Original RE-Justice Batman-themed art added with Blender.\n')
    q.write('Refined fitted torso, belt and cowl: editable work in progress, not approved for game.\n')
print('CC0_BATMAN_GENERATION_SUCCESS',OUT)

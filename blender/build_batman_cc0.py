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
COWL=material('Cowl matte carbon',(0.025,.033,.044),rough=.72,noise=True)
SKIN=material('Exposed face',(0.46,.30,.22),rough=.83)
BELT=material('Old-gold utility pouches',(0.33,.25,.11),metal=.35,rough=.70)
CAPE=material('Heavy black cape',(0.018,.024,.033),rough=.98,noise=True)
EYES=material('Cowl white slit lenses',(.76,.84,.88),rough=.24)
body.data.materials.clear();body.data.materials.append(FABRIC)
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
# Body proportions are from the imported 65-bone CC0 original (1.82 meters).
# Semi-fitted armor lives at chest / waist; sculpted base remains anatomically continuous.
for s,side in [(1,'L'),(-1,'R')]:
    panel('Pectoral armor '+side,[
        (s*.02,1.435),(s*.11,1.476),(s*.28,1.448),(s*.297,1.386),
        (s*.19,1.345),(s*.025,1.355)
    ],-.140,EDGE,'spine_03',.014)
    panel('Oblique protector '+side,[
        (s*.032,1.334),(s*.209,1.324),(s*.193,1.277),(s*.032,1.277)
    ],-.132,METAL,'spine_02',.011)
    for k in range(2):
        panel('Abdominal armor '+side+str(k),[
           (s*.04,1.253-k*.043),(s*.162,1.252-k*.043),
           (s*.153,1.226-k*.043),(s*.04,1.227-k*.043)
        ],-.142,METAL,'spine_02',.010)
# Chest bat silhouette—large across the torso rather than a circular badge.
shape=[(-.30,1.40),(-.22,1.43),(-.155,1.44),(-.112,1.463),(-.06,1.434),
       (-.028,1.458),(0,1.44),(.028,1.458),(.06,1.434),(.112,1.463),
       (.155,1.44),(.22,1.43),(.30,1.40),(.22,1.365),(.155,1.362),
       (.10,1.377),(.047,1.348),(0,1.315),(-.047,1.348),
       (-.10,1.377),(-.155,1.362),(-.22,1.365)]
panel('Injustice-era black bat symbol',shape,-.155,COWL,'spine_03',.008)
# Belt with pouches and heavy buckle.
bpy.ops.mesh.primitive_torus_add(major_segments=64,minor_segments=14,
    location=(0,0,1.008),major_radius=.202,minor_radius=.014)
o=bpy.context.object;o.name='Continuous brass tactical belt';o.data.materials.append(BELT);extras.append((o,'pelvis'))
for j in range(-3,4):
    if j==0:continue
    x=j*.063
    y=-.199+abs(x)*.13
    bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,1.014))
    o=bpy.context.object;o.name='Rectangular util pouch '+str(j)
    o.dimensions=(.046,.029,.063)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(BELT)
    bevel=o.modifiers.new('Soft pouch corners','BEVEL');bevel.width=.008;bevel.segments=2
    extras.append((o,'pelvis'))
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,-.212,1.012))
o=bpy.context.object;o.name='Bat clasp';o.dimensions=(.093,.030,.057)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
o.data.materials.append(BELT);extras.append((o,'pelvis'))
# Proper human-head cowl, open mouth and jaw; nose comes from anatomical base face mesh.
lathe('Top cowl dome',[
   (1.662,.10,.09,0),(1.681,.118,.107,.014),(1.693,.125,.114,.010),
   (1.748,.113,.107,.008),(1.785,.078,.075,.006),(1.795,.015,.025,.007)
],COWL,'Head')
# mouth skin patch covers only lower central cowl so a face is visible
ellipse('Sculpted lower-face jaw contour',(0,-.062,1.629),(.089,.082,.077),SKIN,'Head')
for s,side in [(1,'L'),(-1,'R')]:
    # Ear wedge, narrow with believable cowl profile
    verts=[(s*.065,-.03,1.764),(s*.128,-.03,1.764),
           (s*.112,.05,1.76),(s*.065,.05,1.76),(s*.096,0,1.899)]
    add('Cowl tapered ear '+side,verts,[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(0,3,2,1)],COWL,'Head')
    panel('Slanted eye mask border '+side,[(s*.026,1.70),(s*.107,1.709),
          (s*.109,1.676),(s*.029,1.678)],-.126,COWL,'Head',.007)
    panel('Thin inset lens '+side,[(s*.044,1.691),(s*.095,1.695),
          (s*.09,1.686),(s*.044,1.684)],-.138,EYES,'Head',.004)
    # Curved greaves on knees without ball caps
    panel('Armored kneecap '+side,[(s*.069,.530),(s*.131,.545),(s*.159,.512),
         (s*.151,.474),(s*.07,.472)],-.093,METAL,'calf_'+side.lower(),.020)
    # Fin fitting is deferred until forearm skin-weight review; detached spikes removed.
    # Preserve the underlying anatomically rigged forearm for reliable posing.
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
    q.write('Modeling study: costume skin weights and face require manual refinement. No game rip.\n')
print('CC0_BATMAN_GENERATION_SUCCESS',OUT)

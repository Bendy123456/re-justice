"""RE-Justice Batman / Injustice-era modeling study.
Run with Blender: blender -b --python blender/build_batman.py
Creates editable .blend, rigged .glb, and preview renders.
All geometry here is authored procedurally in Blender, not ripped from the game.
"""
import bpy, math, os, random
from mathutils import Vector
from math import sin,cos,pi
random.seed(13)
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),".."))
OUT=os.path.join(ROOT,"generated","batman")
os.makedirs(OUT,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
C=bpy.context.scene
C.render.engine='CYCLES'
C.cycles.samples=24
C.render.resolution_x=1000
C.render.resolution_y=1000
C.render.resolution_percentage=100
C.render.image_settings.file_format='PNG'
C.world.color=(.035,.045,.062)
C.view_settings.view_transform='Standard'
C.view_settings.look='Medium High Contrast'
# Existing game stays separate: this is an art asset, no gameplay scripts imported.

def mat(name,color,metal=0,rough=.7,texture=False):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal
    p.inputs['Roughness'].default_value=rough
    if texture:
        nodes=m.node_tree.nodes;links=m.node_tree.links
        tex=nodes.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=185
        tex.inputs['Detail'].default_value=2.1
        bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.16
        bump.inputs['Distance'].default_value=.0025
        links.new(tex.outputs['Fac'],bump.inputs['Height'])
        links.new(bump.outputs['Normal'],p.inputs['Normal'])
    return m

SUIT=mat('Suit • graphite woven kevlar',(0.048,.067,.088),rough=.84,texture=True)
ARMOR=mat('Armored ceramic • gunmetal',(0.165,.183,.210),metal=.38,rough=.45,texture=True)
EDGE=mat('Plate edge • cold steel',(0.255,.276,.305),metal=.56,rough=.38)
DARK=mat('Cowl / gloves • matte carbon',(0.025,.032,.043),metal=.14,rough=.57,texture=True)
RIB=mat('Flexible joint • ribbed textile',(0.066,.080,.10),rough=.8,texture=True)
CAPE=mat('Cape • charcoal technical cloth',(0.016,.020,.031),rough=.96,texture=True)
CAPE_IN=mat('Cape inner • blue-black',(0.037,.049,.073),rough=.9,texture=True)
BELT=mat('Utility belt • worn brass',(0.48,.335,.115),metal=.66,rough=.41)
BELT_HI=mat('Buckle • gold alloy',(0.64,.50,.205),metal=.76,rough=.27)
FACE=mat('Exposed face • warm skin',(.48,.305,.229),rough=.72,texture=True)
LIP=mat('Mouth / shadow',(0.18,.116,.106),rough=.85)
EYES=mat('Cowl lenses • pearl',(.69,.82,.86),metal=.04,rough=.28)

ASSET_COLLECTION=bpy.data.collections.new('BATMAN • game-ready art')
C.collection.children.link(ASSET_COLLECTION)
RIG_PARTS=[]

def register(o,mt,name,edge=.0,smooth=True,bone=None):
    o.name=name
    o.data.materials.append(mt)
    for old in list(o.users_collection):old.objects.unlink(o)
    ASSET_COLLECTION.objects.link(o)
    if o.type=='MESH':
        for p in o.data.polygons:p.use_smooth=smooth
        if edge:
            b=o.modifiers.new('Soft manufactured edges','BEVEL')
            b.width=edge;b.segments=3
            no=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
            no.keep_sharp=True
    if bone:RIG_PARTS.append((o,bone))
    return o

def mesh(name,verts,faces,mt,bone='spine',solid=0,bevel=0):
    dat=bpy.data.meshes.new(name);dat.from_pydata(verts,[],faces);dat.update()
    obj=bpy.data.objects.new(name,dat);ASSET_COLLECTION.objects.link(obj)
    obj.data.materials.append(mt)
    for p in dat.polygons:p.use_smooth=True
    if solid:
        mod=obj.modifiers.new('Armor thickness','SOLIDIFY');mod.thickness=solid
    if bevel:
        mod=obj.modifiers.new('Machined edge bevel','BEVEL');mod.width=bevel;mod.segments=2
        obj.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    if bone:RIG_PARTS.append((obj,bone))
    return obj

def loft(name,rings,mt,bone='spine',segments=36):
    # rings: (height, width along x, depth along y, center_x, center_y)
    verts=[];faces=[]
    for z,rx,ry,cx,cy in rings:
        for i in range(segments):
            a=2*pi*i/segments
            verts.append((cx+rx*cos(a),cy+ry*sin(a),z))
    for j in range(len(rings)-1):
        for i in range(segments):
            a=j*segments+i;b=j*segments+(i+1)%segments
            faces.append((a,b,b+segments,a+segments))
    faces.append(tuple(reversed(range(segments))))
    faces.append(tuple((len(rings)-1)*segments+i for i in range(segments)))
    ob=mesh(name,verts,faces,mt,bone)
    sub=ob.modifiers.new('Smooth anatomy / surface','SUBSURF');sub.levels=1;sub.render_levels=2
    return ob

def tapered_limb(name,a,b,radii,mt,bone,segments=22):
    va=Vector(a);vb=Vector(b);direction=(vb-va).normalized()
    basis=direction.cross(Vector((0,1,0))).normalized()
    if basis.length<.1:basis=Vector((1,0,0))
    depth=direction.cross(basis).normalized()
    coords=[];faces=[]
    count=len(radii)
    for j,r in enumerate(radii):
        center=va.lerp(vb,j/(count-1))
        for i in range(segments):
            ang=2*pi*i/segments
            v=center+basis*cos(ang)*r+depth*sin(ang)*r*.87
            coords.append(tuple(v))
    for j in range(count-1):
        for i in range(segments):
            k=j*segments+i,n=j*segments+(i+1)%segments
            faces.append((k,n,n+segments,k+segments))
    faces.append(tuple(reversed(range(segments))))
    faces.append(tuple((count-1)*segments+i for i in range(segments)))
    obj=mesh(name,coords,faces,mt,bone)
    sub=obj.modifiers.new('Organic contour','SUBSURF');sub.levels=1;sub.render_levels=2
    return obj

def cube(name,loc,sc,mt,bone,bevel=.02):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    o=bpy.context.object;o.dimensions=sc
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return register(o,mt,name,edge=bevel,bone=bone)

def uvball(name,loc,sc,mt,bone):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,location=loc)
    o=bpy.context.object;o.scale=sc
    return register(o,mt,name,bone=bone)

def plate(name,poly,mt,bone='chest',thickness=.024,bevel=.005):
    # polygon list in front-facing X,Z, optional Y offset supplied as third value
    outline=[(v[0],v[1]) for v in poly]
    vs=[(x, (v[2] if len(v)>2 else -.178),z) for (x,z),v in zip(outline,poly)]
    ob=mesh(name,vs,[tuple(range(len(vs)))],mt,bone,thickness,bevel)
    return ob

def wire(name,points,rad,mt,bone='spine'):
    cr=bpy.data.curves.new(name,'CURVE');cr.dimensions='3D';cr.resolution_u=18
    cr.bevel_depth=rad;cr.bevel_resolution=3
    spl=cr.splines.new('POLY');spl.points.add(len(points)-1)
    for p,xyz in zip(spl.points,points):p.co=(*xyz,1)
    ob=bpy.data.objects.new(name,cr);ASSET_COLLECTION.objects.link(ob);ob.data.materials.append(mt)
    # convert curve to real mesh for exporting to glTF
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True);bpy.context.view_layer.objects.active=ob
    bpy.ops.object.convert(target='MESH');ob=bpy.context.object
    RIG_PARTS.append((ob,bone));return ob

# Anatomical underlayer — built as continuous smooth surfaces, not detached ball joints.
loft('Pelvis • armored undersuit',[
 (.78,.08,.095,0,0),(.88,.215,.137,0,0),(.98,.25,.163,0,0),
 (1.10,.245,.153,0,0),(1.20,.22,.15,0,0)
],SUIT,'spine')
loft('Torso • athletic Kevlar foundation',[
 (1.14,.217,.14,0,0),(1.22,.247,.15,0,0),(1.30,.264,.168,0,0),
 (1.40,.335,.203,0,0),(1.49,.405,.222,0,0),(1.57,.425,.226,0,0),
 (1.66,.30,.18,0,0),(1.71,.16,.13,0,0)
],SUIT,'chest')
# Sculpt-like segmented plating: left-right forms follow real pectoral / oblique areas.
for s,side in [(1,'L'),(-1,'R')]:
    plate('Upper pectoral shell '+side,[
      (s*.032,1.604,-.206),(s*.145,1.623,-.227),(s*.332,1.585,-.175),
      (s*.365,1.494,-.181),(s*.262,1.457,-.229),(s*.055,1.476,-.220)
    ],ARMOR,'chest',.033,.010)
    plate('Floating rib guard '+side,[
      (s*.045,1.449,-.21),(s*.277,1.433,-.210),(s*.236,1.349,-.197),
      (s*.065,1.359,-.198)
    ],ARMOR,'chest',.028,.007)
    plate('Lower abdominal plate '+side,[
      (s*.020,1.345,-.167),(s*.201,1.335,-.167),
      (s*.198,1.277,-.160),(s*.027,1.281,-.163)
    ],EDGE,'chest',.019,.006)
    # shoulder armor shell, swept backward over deltoid
    uvball('Shoulder plate core '+side,(s*.395,-.012,1.550),(.178,.17,.135),ARMOR,'upper_arm.'+side)
    plate('Acromion contour '+side,[
      (s*.334,1.668,-.07),(s*.455,1.645,-.10),(s*.515,1.555,-.10),
      (s*.451,1.512,-.10),(s*.335,1.562,-.12)
    ],EDGE,'upper_arm.'+side,.025,.007)
    for k in range(3):
        wire('Kevlar rib seam '+side+str(k),[
          (s*.11,-.202,1.33-k*.054),(s*.212,-.188,1.329-k*.053)
        ],.0034,DARK,'chest')

# Armature rest layout (actual bones and vertex weights, not a decorative fake skeleton).
bones=[
 ('root',(0,0,0),(0,0,.90),None),
 ('spine',(0,0,.90),(0,0,1.28),'root'),
 ('chest',(0,0,1.28),(0,0,1.69),'spine'),
 ('neck',(0,0,1.67),(0,0,1.79),'chest'),
 ('head',(0,0,1.77),(0,0,2.09),'neck')
]
for s,side in [(1,'L'),(-1,'R')]:
    bones+= [
      ('upper_arm.'+side,(s*.39,0,1.57),(s*.535,0,1.22),'chest'),
      ('forearm.'+side,(s*.535,0,1.22),(s*.62,0,.92),'upper_arm.'+side),
      ('hand.'+side,(s*.62,0,.92),(s*.66,0,.82),'forearm.'+side),
      ('thigh.'+side,(s*.145,0,.96),(s*.17,0,.54),'root'),
      ('shin.'+side,(s*.17,0,.54),(s*.18,0,.135),'thigh.'+side),
      ('foot.'+side,(s*.18,0,.14),(s*.18,-.16,.07),'shin.'+side)
    ]
bpy.ops.object.armature_add(enter_editmode=False)
rig=bpy.context.object;rig.name='RIG_Batman';rig.data.name='Batman Deform Bones'
for old in list(rig.users_collection):old.objects.unlink(rig)
ASSET_COLLECTION.objects.link(rig)
bpy.ops.object.mode_set(mode='EDIT')
rig.data.edit_bones.remove(rig.data.edit_bones[0])
for name,head,tail,parent in bones:
    b=rig.data.edit_bones.new(name);b.head=head;b.tail=tail
    if parent:b.parent=rig.data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
rig.show_in_front=True
rig.data.display_type='STICK'

for s,side in [(1,'L'),(-1,'R')]:
    a=(s*.405,0,1.562); elbow=(s*.54,0,1.22); wrist=(s*.635,0,.92)
    tapered_limb('Biceps foundation '+side,a,elbow,[.093,.13,.144,.13,.108,.08],SUIT,'upper_arm.'+side)
    tapered_limb('Forearm Kevlar '+side,elbow,wrist,[.101,.112,.125,.122,.096,.070],SUIT,'forearm.'+side)
    # forearm armor plates sweep lengthwise with anatomical taper
    tapered_limb('Gauntlet + layered bracer '+side,
        (s*.57,-.009,1.115),(s*.635,-.012,.925),[.089,.102,.106,.106,.086],DARK,'forearm.'+side)
    for k in range(3):
        plate('Gauntlet blade '+side+str(k),[
          (s*(.635+k*.006),1.114-k*.059,-.128),
          (s*(.755+k*.011),1.062-k*.059,-.13),
          (s*(.630+k*.007),1.032-k*.059,-.13)
        ],ARMOR,'forearm.'+side,.014,.002)
    uvball('Knuckle assembly '+side,(s*.66,-.017,.83),(.085,.06,.095),DARK,'hand.'+side)
    for n in range(4):
        uvball('Armored glove finger '+side+str(n),(s*(.631+n*.017),-.055,.788),(.017,.027,.051),DARK,'hand.'+side)
    # Legs: tapered quads, reinforced knee and high boots
    tapered_limb('Thigh • continuous suit '+side,(s*.15,0,.95),(s*.17,0,.54),
      [.132,.18,.191,.168,.134,.113],SUIT,'thigh.'+side)
    plate('Outer thigh plate '+side,[
        (s*.11,.89,-.142),(s*.258,.862,-.096),
        (s*.244,.675,-.13),(s*.155,.645,-.142)
    ],ARMOR,'thigh.'+side,.024,.008)
    uvball('Patella housing '+side,(s*.17,-.128,.545),(.113,.056,.103),ARMOR,'shin.'+side)
    tapered_limb('Calf + shin core '+side,(s*.17,0,.54),(s*.18,0,.13),
      [.098,.117,.120,.101,.089,.077],DARK,'shin.'+side)
    plate('Greave frontal shell '+side,[
      (s*.118,.468,-.127),(s*.244,.459,-.126),
      (s*.245,.187,-.105),(s*.130,.175,-.11)
    ],ARMOR,'shin.'+side,.026,.008)
    # visibly shaped armored toe, not a block
    uvball('Boot heel '+side,(s*.18,0,.091),(.113,.134,.08),DARK,'foot.'+side)
    uvball('Boot tapered toe '+side,(s*.18,-.134,.080),(.113,.175,.072),DARK,'foot.'+side)
    wire('Boot front piping '+side,[(s*.13,-.233,.096),(s*.18,-.244,.100),(s*.23,-.233,.096)],.004,EDGE,'foot.'+side)

# Belt: continuous wrap with pouches across front, including brass buckle.
bpy.ops.mesh.primitive_torus_add(major_segments=64,minor_segments=12,location=(0,0,1.06),
  major_radius=.255,minor_radius=.036)
register(bpy.context.object,BELT,'Continuous utility belt strap',bone='spine')
for i in range(-3,4):
    x=i*.079
    front_y=-.235+abs(x)*.29
    if i==0:continue
    cube('Individual brass utility pouch '+str(i),(x,front_y,1.07),(.071,.052,.084),BELT,'spine',.012)
    cube('Pouch clasp '+str(i),(x,front_y-.029,1.075),(.035,.008,.015),BELT_HI,'spine',.003)
cube('Bat buckle backing',(0,-.285,1.063),(.115,.054,.087),BELT_HI,'spine',.014)

# Tall, proportional neck & cowl with sculpted shape in one seamless outline.
loft('Neck • tactical ribbed collar',[
 (1.652,.105,.11,0,0),(1.727,.112,.115,0,0),(1.795,.095,.092,0,0)
],DARK,'neck')
# Angular human head loft, jaw narrower than brow.
loft('Underlying face and jaw',[
 (1.735,.058,.069,0,-.013),(1.750,.080,.088,0,-.017),
 (1.786,.097,.103,0,-.008),(1.834,.122,.121,0,-.003),
 (1.902,.137,.133,0,0),(1.98,.125,.126,0,0),
 (2.027,.090,.097,0,0)
],FACE,'head')
# Cowl over the upper head. Mouth / chin remains visibly exposed.
loft('Cowl crown and temple silhouette',[
 (1.859,.140,.135,0,.004),(1.900,.154,.146,0,.01),
 (1.951,.155,.145,0,.012),(2.011,.138,.131,0,.014),
 (2.062,.101,.10,0,.013),(2.079,.042,.048,0,.014)
],DARK,'head')
# cheek jaw guards, but leave center mouth/chin skin exposed
for s,side in [(1,'L'),(-1,'R')]:
    plate('Cowl cheek shield '+side,[
      (s*.075,1.912,-.138),(s*.156,1.900,-.091),(s*.133,1.785,-.094),
      (s*.065,1.776,-.114)
    ],DARK,'head',.032,.006)
    plate('Angled brow and eye socket '+side,[
      (s*.018,1.958,-.151),(s*.129,1.964,-.111),
      (s*.125,1.906,-.134),(s*.032,1.919,-.146)
    ],DARK,'head',.014,.003)
    plate('Slim pale optical lens '+side,[
      (s*.036,1.942,-.162),(s*.117,1.949,-.138),
      (s*.109,1.934,-.146),(s*.044,1.929,-.172)
    ],EYES,'head',.004,.001)
    # pointed ears sculpted as quadrilateral wedge with a defined edge instead of plain cones
    sideX=s*.097
    mesh('Tall cowl ear '+side,[
      (sideX-.053,.018,2.014),(sideX+.053,.018,2.014),
      (sideX+.030,-.075,2.015),(sideX-.030,-.075,2.015),
      (sideX+s*.009,-.013,2.245)
    ],[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(3,2,1,0)],
      DARK,'head')
# Nose ridge is black near eyes; warm nose and subtle mouth line below mask
plate('Cowl nose bridge',[
 (-.030,1.926,-.147),(.030,1.926,-.147),(.038,1.852,-.153),(0,1.833,-.172),(-.038,1.852,-.153)
],DARK,'head',.014,.003)
uvball('Exposed nose tip',(0,-.138,1.817),(.025,.029,.024),FACE,'head')
wire('Subtle mouth seam',[(-.042,-.115,1.774),(0,-.124,1.772),(.042,-.115,1.774)],.0027,LIP,'head')

# Emblem follows broad pectoral plate; not a floating sphere/circle.
emblem=[
 (-.296,1.552),(-.233,1.577),(-.174,1.585),(-.129,1.609),
 (-.074,1.579),(-.029,1.603),(0,1.586),(.029,1.603),(.074,1.579),
 (.129,1.609),(.174,1.585),(.233,1.577),(.296,1.552),
 (.221,1.506),(.153,1.500),(.104,1.527),(.049,1.504),
 (0,1.468),(-.049,1.504),(-.104,1.527),(-.153,1.500),(-.221,1.506)
]
plate('Bat chest emblem • broad black silhouette',[(x,z,-.265) for x,z in emblem],DARK,'chest',.011,.002)
# Back cape, 45x32 geometry with realistic radial folds and pointed scalloped lower hem.
v=[];faces=[];NX=45;NZ=32
for j in range(NZ):
    t=j/(NZ-1)
    z=1.70-t*1.58
    width=.34+(.77-.34)*t**.58
    for i in range(NX):
        u=2*i/(NX-1)-1
        x=u*width
        scallop=.09*(sin((u+1)*pi*3.5)**2)*(t**18)
        zp=z+scallop
        y=.17+.17*t+.085*(1-u*u)*(t**2)+.042*sin(u*pi*5)*t
        v.append((x,y,zp))
for j in range(NZ-1):
    for i in range(NX-1):
        a=j*NX+i
        faces.append((a,a+1,a+NX+1,a+NX))
cape=mesh('Cape • rippled 45-strip cloth with scalloped hem',v,faces,CAPE,'chest',.007)
cape.data.materials.append(CAPE_IN)
cape.data.update()
# Shoulder/cape neck attachments
for s in [-1,1]:
    uvball('Cape collar anchor '+str(s),(s*.30,.11,1.62),(.115,.084,.064),DARK,'chest')

# Fully animated armature with rigid-bone vertex assignments (foundation for skin paint polish).
for obj,bone in RIG_PARTS:
    if obj.type!='MESH':continue
    group=obj.vertex_groups.new(name=bone);group.add(list(range(len(obj.data.vertices))),1.0,'REPLACE')
    arm=obj.modifiers.new('RE-Justice deform skeleton','ARMATURE')
    arm.object=rig
    obj.parent=rig
# Shared bone keyframes, scrub in Blender. No gameplay changes.
bpy.context.view_layer.objects.active=rig
rig.select_set(True)
def keypose(frame,sway=0,guard=0):
    for pb in rig.pose.bones:pb.rotation_mode='XYZ';pb.rotation_euler=(0,0,0)
    rig.pose.bones['chest'].rotation_euler[1]=sway
    for s,side in [(1,'L'),(-1,'R')]:
        rig.pose.bones['upper_arm.'+side].rotation_euler[1]=s*(-.13-guard*.25)
        rig.pose.bones['forearm.'+side].rotation_euler[1]=s*(.12+guard*.32)
        rig.pose.bones['thigh.'+side].rotation_euler[1]=s*.045
        for b in ['upper_arm','forearm','thigh']:
            rig.pose.bones[b+'.'+side].keyframe_insert(data_path='rotation_euler',frame=frame,group='Idle')
    rig.pose.bones['chest'].keyframe_insert(data_path='rotation_euler',frame=frame,group='Idle')
keypose(1,0,0)
keypose(18,.018,.12)
keypose(36,0,0)
C.frame_start=1;C.frame_end=36;C.frame_set(1)
# Stage for beauty render is NOT part of exported character model.
world=C.world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.052,.065,.088,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.4
def studio(name,loc,power,color,size):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size
    o=bpy.data.objects.new(name,d);C.collection.objects.link(o);o.location=loc
    v=Vector((0,0,1.12))-o.location;o.rotation_euler=v.to_track_quat('-Z','Y').to_euler()
studio('Key • large cool softbox',(-3,-4,5),600,(.78,.87,1),4)
studio('Warm rim / costume separation',(2,3,3.1),930,(1,.81,.62),3)
studio('Face / suit fill',(2,-5,2.2),240,(.86,.91,1),3)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.004))
floor=bpy.context.object;floor.name='RENDER_ONLY studio floor'
floor.data.materials.append(mat('Studio ground',(.055,.068,.088),rough=.95))
def camera(name,loc,at,ortho):
    d=bpy.data.cameras.new(name);o=bpy.data.objects.new(name,d);C.collection.objects.link(o)
    o.location=loc;v=Vector(at)-o.location;o.rotation_euler=v.to_track_quat('-Z','Y').to_euler()
    d.type='ORTHO';d.ortho_scale=ortho;return o
front=camera('Beauty 3/4', (3.45,-7.8,2.45),(0,0,1.1),3.06)
close=camera('Face/armor detail',(1.8,-3.3,2.1),(0,0,1.65),1.35)
C.camera=front
C.render.filepath=os.path.join(OUT,'batman_fullbody.png')
bpy.ops.render.render(write_still=True)
C.camera=close
C.render.filepath=os.path.join(OUT,'batman_armor_closeup.png')
bpy.ops.render.render(write_still=True)
C.camera=front
# Save artist-editable scene, with original materials, meshes, rig, cameras, lights.
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'REJustice_Batman_Study.blend'))
# Export game-ready armature and weighted meshes; no studio lighting or stage.
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
for ob,b in RIG_PARTS:ob.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'REJustice_Batman_Study.glb'),
    export_format='GLB',use_selection=True,export_animations=True)
# QA manifest: assets report physically present and mesh statistics.
meshes=[ob for ob,b in RIG_PARTS if ob.type=='MESH']
with open(os.path.join(OUT,'QA.txt'),'w') as q:
    q.write('Blender Batman editable modeling study, NOT an official NetherRealm model\n')
    q.write('Meshes: %d\n'%(len(meshes)))
    q.write('Raw mesh vertices: %d\n'%(sum(len(o.data.vertices) for o in meshes)))
    q.write('Bones: %d\n'%(len(rig.data.bones)))
    q.write('Armature: %s\n'%(rig.name))
    q.write('Height target: 2.25 Blender units; +Z up, face toward -Y\n')
    q.write('Preview and GLB exported; 36-frame animated idle loop\n')
print('BATMAN_GENERATION_SUCCESS',OUT)

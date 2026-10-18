"""RE-Justice: original anime training-ground arena, Blender 3.x/4.x.
Large circular ground, high enclosing stone walls and one ancient central tree.
No imported IP assets, no props, no physical dependencies.
Exports real, reusable GLB (visuals only; gameplay has simple analytic colliders).
Blender coordinate system Z-up -> glTF and Three.js Y-up automatically.
"""
import bpy, math, os, random, sys
from mathutils import Vector
from math import sin,cos,pi
SEED=20261017
RADIUS=34.0
WALL_HEIGHT=12.5
WALL_THICKNESS=2.6
TREE_TRUNK_RADIUS=1.68
GROUND_RINGS=9
WALL_SECTIONS=64
BRANCH_COUNT=11
FOLIAGE_COUNT=105
OUTPUT=os.path.abspath(os.path.join(os.path.dirname(__file__),"..","assets","arena"))
os.makedirs(OUTPUT,exist_ok=True)
random.seed(SEED)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

def mat(name,rgb,rough=.8):
    m=bpy.data.materials.new(name);m.use_nodes=True
    bsdf=m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value=(*rgb,1)
    bsdf.inputs["Roughness"].default_value=rough
    m.diffuse_color=(*rgb,1)
    return m
ground=mat("Training clay | sunlit ochre",(.51,.405,.292))
earth=mat("Earth edge | deeper cinnamon",(.31,.238,.155))
stone=[mat("Wall sandstone "+str(i),col) for i,col in enumerate([
 (.35,.39,.37),(.36,.40,.38),(.35,.40,.37),(.37,.41,.38)])]
wall_trim=mat("Wall top | pale stone",(.69,.69,.59))
bark=mat("Tree bark | warm walnut",(.245,.138,.079))
bark_light=mat("Tree bark roots | copper",(.36,.212,.116))
leaves=[mat("Leaf cluster "+str(i),col) for i,col in enumerate([
 (.21,.41,.22),(.27,.49,.25),(.38,.56,.24),(.48,.62,.29),(.22,.46,.29)])]
grass=mat("Earth rim moss",(.28,.40,.24))

def mesh(name,vs,fs,m):
    dat=bpy.data.meshes.new(name+" mesh");dat.from_pydata(vs,[],fs);dat.update()
    obj=bpy.data.objects.new(name,dat);bpy.context.scene.collection.objects.link(obj)
    dat.materials.append(m)
    for f in dat.polygons:f.use_smooth=True
    return obj

# Ground is a single concentric mesh, slightly displaced for visible natural
# variation without causing uneven walk/jump physics.
vs=[(0,0,-.07)];fs=[]
n=96
for ring in range(1,GROUND_RINGS+1):
    rad=RADIUS*ring/GROUND_RINGS
    for j in range(n):
        a=2*pi*j/n
        # Flat traversable middle. Edge texture is geom only, not collider.
        z=-.095 if ring<8 else -.12-.025*math.sin(a*11)
        vs.append((rad*cos(a),rad*sin(a),z))
for j in range(n):fs.append((0,1+(j+1)%n,1+j))
for ring in range(1,GROUND_RINGS):
    base=1+(ring-1)*n
    nxt=base+n
    for j in range(n):
        k=(j+1)%n
        fs.append((base+j,base+k,nxt+k,nxt+j))
ground_obj=mesh("ARENA | single circular flat training ground",vs,fs,ground)

# A deliberate ring path at the walls lends structure without clutter.
def torus(name,major,minor,z,material,major_segments=96,minor_segments=8):
    verts=[];faces=[]
    for j in range(major_segments):
        a=2*pi*j/major_segments
        for k in range(minor_segments):
            b=2*pi*k/minor_segments
            r=major+minor*cos(b)
            verts.append((r*cos(a),r*sin(a),z+minor*sin(b)))
    for j in range(major_segments):
        for k in range(minor_segments):
            a=j*minor_segments+k
            b=((j+1)%major_segments)*minor_segments+k
            faces.append((a,b,((j+1)%major_segments)*minor_segments+(k+1)%minor_segments,
                          j*minor_segments+(k+1)%minor_segments))
    return mesh(name,verts,faces,material)
torus("Ground perimeter | raised earth edge",RADIUS-1.35,.23,-.02,earth)

# Circular wall comprised of adjoining 64 wedge sections. No gaps and tall
# enough to fully enclose the playfield. There are NO passable gates.
for i in range(WALL_SECTIONS):
    a=i*2*pi/WALL_SECTIONS
    b=(i+1)*2*pi/WALL_SECTIONS
    inner=RADIUS
    outer=RADIUS+WALL_THICKNESS
    for part,z0,z1,r0,r1,ma in [
        (0,-.1,WALL_HEIGHT,inner,outer,stone[i%len(stone)]),
        (1,WALL_HEIGHT-.16,WALL_HEIGHT+.50,inner-.36,outer+.32,wall_trim),
        (2,-.10,.54,inner-.42,outer+.24,earth),
    ]:
        vertices=[]
        for z in (z0,z1):
            for r,theta in ((r0,a),(r0,b),(r1,b),(r1,a)):
                vertices.append((r*cos(theta),r*sin(theta),z))
        faces=[(0,1,2,3),(4,7,6,5),(0,4,5,1),
               (1,5,6,2),(2,6,7,3),(3,7,4,0)]
        mesh("WALL | segment %02d | trim %d"%(i,part),vertices,faces,ma)

# Art-directed botanical mesh replaces old ico-sphere / blocky tree.
# Retain the current stage's 2D radial collision boundary unchanged.
sys.path.insert(0,os.path.dirname(__file__))
from tree_artist import build_tree
from arena_polish import ground_details,wall_details
build_tree()
ground_details(RADIUS)
wall_details(RADIUS,WALL_HEIGHT)

scene=bpy.context.scene
scene.render.engine="CYCLES"
scene.cycles.samples=18
scene.cycles.use_denoising=False
bpy.context.view_layer.cycles.use_denoising=False
scene.render.resolution_x=960;scene.render.resolution_y=540
scene.render.resolution_percentage=100
scene.world.use_nodes=True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value=(.63,.77,.91,1)
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value=.82
sun=bpy.data.lights.new("Sunny anime afternoon","AREA")
sun.energy=3600;sun.size=28
obj=bpy.data.objects.new("Sunny anime afternoon",sun)
scene.collection.objects.link(obj)
obj.location=(-24,-32,46);obj.rotation_euler=(Vector((0,0,0))-obj.location).to_track_quat("-Z","Y").to_euler()
camd=bpy.data.cameras.new("Review camera")
cam=bpy.data.objects.new("Review camera",camd);scene.collection.objects.link(cam)
cam.location=(62,-74,52);cam.rotation_euler=(Vector((0,0,5))-cam.location).to_track_quat("-Z","Y").to_euler()
camd.type="ORTHO";camd.ortho_scale=91;scene.camera=cam
scene.render.filepath=os.path.join(OUTPUT,"training-ground-preview.png")
bpy.ops.render.render(write_still=True)
# Explicit tree-focused art QA renders to judge the shapes in perspective,
# not just an overhead arena shot where poor branch silhouette is easy to miss.
cam.location=(17,-20,17.5)
cam.rotation_euler=(Vector((0,0,9.0))-cam.location).to_track_quat("-Z","Y").to_euler()
camd.ortho_scale=39
scene.render.filepath=os.path.join(OUTPUT,"training-tree-detail.png")
bpy.ops.render.render(write_still=True)
cam.location=(10,-13,5.9)
cam.rotation_euler=(Vector((0,0,4.5))-cam.location).to_track_quat("-Z","Y").to_euler()
camd.ortho_scale=18
scene.render.filepath=os.path.join(OUTPUT,"training-tree-trunk.png")
bpy.ops.render.render(write_still=True)
# Export just 3D arena meshes (exclude preview lights and cameras).
bpy.ops.object.select_all(action="DESELECT")
objs=[o for o in bpy.context.scene.objects if o.type=="MESH"]
for o in objs:o.select_set(True)
bpy.context.view_layer.objects.active=ground_obj
# Merge the dozens of wall/tree pieces into one shared object; Blender keeps
# their face materials, but Three.js avoids hundreds of separate scene nodes.
bpy.ops.object.join()
ground_obj.name="RE-Justice | Complete Training Arena"
glb=os.path.join(OUTPUT,"training-ground.glb")
bpy.ops.export_scene.gltf(filepath=glb,export_format="GLB",
                          use_selection=True,export_apply=True)
assert os.path.getsize(glb)>50000
bpy.ops.object.select_all(action="DESELECT")
bpy.context.view_layer.objects.active=ground_obj
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUTPUT,"training-ground.blend"))
print("TRAINING_GROUND_SUCCESS",len(objs),"meshes",os.path.getsize(glb),"bytes",
      "radius",RADIUS,"wall_height",WALL_HEIGHT)

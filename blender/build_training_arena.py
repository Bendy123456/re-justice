"""RE-Justice: original anime training-ground arena, Blender 3.x/4.x.
Large circular ground, high enclosing stone walls and one ancient central tree.
No imported IP assets, no props, no physical dependencies.
Exports real, reusable GLB (visuals only; gameplay has simple analytic colliders).
Blender coordinate system Z-up -> glTF and Three.js Y-up automatically.
"""
import bpy, math, os, random
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
FOLIAGE_COUNT=84
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
ground=mat("Training clay | sunlit ochre",(.50,.385,.245))
earth=mat("Earth edge | deeper cinnamon",(.31,.238,.155))
stone=[mat("Wall sandstone "+str(i),col) for i,col in enumerate([
 (.48,.51,.48),(.53,.55,.51),(.45,.49,.46),(.57,.55,.48)])]
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

# Stylized hand-shaped tree: a tapered continuous trunk and thick roots.
def tubular(name,positions,radii,m,radials=10):
    verts=[];faces=[]
    for j,(p,r) in enumerate(zip(positions,radii)):
        prev=Vector(positions[max(0,j-1)])
        nex=Vector(positions[min(len(positions)-1,j+1)])
        tangent=(nex-prev).normalized()
        guide=Vector((0,1,0))
        if abs(tangent.dot(guide))>.92: guide=Vector((1,0,0))
        u=tangent.cross(guide).normalized()
        v=tangent.cross(u).normalized()
        for k in range(radials):
            a=k*2*pi/radials
            perturb=1+.08*sin(a*5+j*1.3)
            pos=Vector(p)+r*perturb*(u*cos(a)+v*sin(a))
            verts.append(tuple(pos))
    for j in range(len(positions)-1):
        for k in range(radials):
            n=j*radials+k
            kk=(k+1)%radials
            faces.append((n,j*radials+kk,(j+1)*radials+kk,(j+1)*radials+k))
    faces += [tuple(reversed(tuple(range(radials)))),
              tuple((len(positions)-1)*radials+k for k in range(radials))]
    return mesh(name,verts,faces,m)

tubular("TREE | old bark sculpted trunk",
        [(0,0,-.10),(.01,0,.8),(.06,-.05,2),(.12,.03,4),
         (.30,.08,6),(.35,.23,8),(.15,.18,10.5)],
        [2.23,1.88,1.59,1.42,1.27,.84,.27],bark,14)
for i in range(8):
    a=2*pi*i/8
    u=Vector((cos(a),sin(a),0))
    tubular("TREE | rooted buttress "+str(i),[
        tuple(u*3.1+Vector((0,0,.03))),tuple(u*2.3+Vector((0,0,.38))),
        tuple(u*1.55+Vector((0,0,1.12))),(.04,.02,2.35)
    ],[.13,.26,.48,.52],bark_light,8)

# Branches intentionally merge visually into the canopy: separate meshes
# but a continuous wood material and no hard rectangular limbs.
for i in range(BRANCH_COUNT):
    a=2*pi*i/BRANCH_COUNT+.18
    r=8.0 + random.random()*3
    z=10.2+random.random()*2
    base=(.17,.18,7.5)
    p1=(2.4*cos(a),2.4*sin(a),8.5)
    p2=(r*.60*cos(a),r*.60*sin(a),z-.35)
    p3=(r*cos(a),r*sin(a),z+.5)
    tubular("TREE | winding branch %02d"%i,[base,p1,p2,p3],
            [.49,.32,.17,.047],bark,8)

def leaf_ball(name,x,y,z,rx,ry,rz,ma):
    # Icosahedron leaves read as layered stylized anime foliage.
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=(x,y,z))
    o=bpy.context.object;o.name=name;o.scale=(rx,ry,rz)
    o.data.materials.append(ma)
    return o

# Thick canopy above ~8.5m to keep fighter sight lines beneath foliage.
for i in range(FOLIAGE_COUNT):
    a=random.random()*2*pi
    r=math.sqrt(random.random())*12.2
    x=r*cos(a)+.10
    y=r*sin(a)+.08
    z=11.8+2.3*(1-r/14.0)+random.uniform(-1.6,1.8)
    size=random.uniform(1.65,3.2)
    leaf_ball("CANOPY | faceted green foliage %02d"%i,x,y,z,
              size*1.4,size*1.15,size*.82,leaves[i%len(leaves)])

# Sparse fitted ground radial detail is painted into the disc shader rather
# than building extra obstacles that can catch the player.
scene=bpy.context.scene
scene.render.engine="CYCLES"
scene.cycles.samples=12
scene.cycles.use_denoising=False
bpy.context.view_layer.cycles.use_denoising=False
scene.render.resolution_x=960;scene.render.resolution_y=540
scene.render.resolution_percentage=100
scene.world.use_nodes=True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value=(.56,.74,.98,1)
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

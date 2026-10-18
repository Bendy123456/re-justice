"""RE-Justice Blender arena: giant medium-gray slab walls, grass and tree.

Visual meshes only: arena3d.js retains the existing analytical collisions.
"""
import bpy
import math
import random
from mathutils import Vector

SEED = 11703
GROUND_SECTORS = 120
GROUND_BANDS = 13
WALL_BRICKS_PER_RING = 20
WALL_COURSES = 3
COLUMN_COUNT = 16
BARK_RIDGES = 13
ROOT_FINGERS = 10
CANOPY_SPRAYS = 120
PI = math.pi

def paint(name,color,rough=.87):
    m=bpy.data.materials.new(name)
    m.diffuse_color=(*color,1)
    m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=rough
    return m

def new_mesh(name,vertices,faces,material,smooth=False):
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(vertices,[],faces)
    mesh.update()
    obj=bpy.data.objects.new(name,mesh)
    bpy.context.scene.collection.objects.link(obj)
    mesh.materials.append(material)
    for f in mesh.polygons:f.use_smooth=smooth
    return obj

class Painter:
    def __init__(self):
        self.layers={}
    def quad(self,material,p0,p1,p2,p3):
        x=self.layers.setdefault(material.name,{'material':material,'v':[],'f':[]})
        n=len(x['v']);x['v'] += [tuple(p) for p in (p0,p1,p2,p3)]
        x['f'].append((n,n+1,n+2,n+3))
    def triangle(self,material,p0,p1,p2):
        x=self.layers.setdefault(material.name,{'material':material,'v':[],'f':[]})
        n=len(x['v']);x['v'] += [tuple(p) for p in (p0,p1,p2)]
        x['f'].append((n,n+1,n+2))
    def finish(self,prefix):
        outputs=[]
        for key,v in self.layers.items():
            outputs.append(new_mesh(prefix+' | '+key,v['v'],v['f'],v['material']))
        return outputs

def ring_quad(p,mat,r0,r1,a0,a1,z):
    p.quad(mat,
        (r0*math.cos(a0),r0*math.sin(a0),z),
        (r1*math.cos(a0),r1*math.sin(a0),z),
        (r1*math.cos(a1),r1*math.sin(a1),z),
        (r0*math.cos(a1),r0*math.sin(a1),z))

def cylinder_ribbon(p,mat,r0,r1,a0,a1,z0,z1):
    # Radial and vertical surfaces. r0 is inside face of thick stone block.
    p.quad(mat,
       (r0*math.cos(a0),r0*math.sin(a0),z0),
       (r0*math.cos(a1),r0*math.sin(a1),z0),
       (r0*math.cos(a1),r0*math.sin(a1),z1),
       (r0*math.cos(a0),r0*math.sin(a0),z1))
    p.quad(mat,
       (r0*math.cos(a0),r0*math.sin(a0),z1),
       (r0*math.cos(a1),r0*math.sin(a1),z1),
       (r1*math.cos(a1),r1*math.sin(a1),z1),
       (r1*math.cos(a0),r1*math.sin(a0),z1))
    p.quad(mat,
       (r0*math.cos(a0),r0*math.sin(a0),z0),
       (r1*math.cos(a0),r1*math.sin(a0),z0),
       (r1*math.cos(a0),r1*math.sin(a0),z1),
       (r0*math.cos(a0),r0*math.sin(a0),z1))

def ground_details(radius=34.0):
    """Little REAL grass tufts over a seamless textured lawn.

    This has no raised ground collider. Every tuft is a small Blender triangle,
    not a repeated billboard particle, so the exported GLB needs no extensions.
    The main seamless grass PNG is applied to the flat radial floor in
    build_training_arena.py. Absolutely no checkerboard or brown dirt tiles.
    """
    rng=random.Random(SEED+333)
    dark=paint('GRASS | soft forest undersides',(.14,.31,.12),.99)
    mids=[
        paint('GRASS | blade spring 01',(.22,.41,.17),.99),
        paint('GRASS | blade spring 02',(.27,.47,.19),.99),
        paint('GRASS | blade meadow 03',(.31,.49,.22),.99),
        paint('GRASS | blade shaded 04',(.17,.35,.16),.99),
    ]
    clover=paint('GRASS | low field clover',(.24,.43,.19),.99)
    p=Painter()
    # Very subtle patches of close-spaced ground cover, especially near
    # camera height; grass is short enough for feet to stay on level terrain.
    tufts=14500
    for k in range(tufts):
        a=rng.uniform(0,2*PI)
        r=math.sqrt(rng.random())*(radius-1.65)
        # Don't bury important tree roots in grass near its central trunk.
        if r<3.7:continue
        x,y=r*math.cos(a),r*math.sin(a)
        base_z=-.086
        h=rng.uniform(.045,.12)
        width=rng.uniform(.018,.052)
        heading=rng.uniform(0,2*PI)
        m=mids[(k+rng.randrange(4))%len(mids)]
        for b in range(3):
            t=heading+b*2*PI/3
            dx,dy=math.cos(t),math.sin(t)
            tipx=x+dx*h*.29
            tipy=y+dy*h*.29
            left=(x-dy*width/2,y+dx*width/2,base_z)
            right=(x+dy*width/2,y-dx*width/2,base_z)
            tip=(tipx,tipy,base_z+h*(.8+.13*b))
            p.triangle(m if b<2 else dark,left,right,tip)
        if k%26==0:
            # Tiny low clover leaves for uneven meadow ground detail.
            size=rng.uniform(.035,.082)
            for j in range(3):
                t=heading+j*2*PI/3
                p.triangle(clover,(x,y,base_z+.015),
                    (x+math.cos(t-.37)*size,y+math.sin(t-.37)*size,base_z+.014),
                    (x+math.cos(t+.37)*size,y+math.sin(t+.37)*size,base_z+.014))
    out=p.finish('GRASS short natural turf')
    print('GRASS_QA',tufts,'tufts',sum(len(o.data.polygons) for o in out),
          'triangles',len(out),'materials')

def wall_details(radius=34.0,height=12.5):
    """Clean superhero training arena: three courses of enormous gray slabs.

    Exactly 20 slabs around a ring, three tall courses, and almost no tonal
    variation. Face slabs are modelled on the INNER and OUTER wall; the
    unbroken structural wall from build_training_arena.py closes the joints.
    No tiny-brick tiling, warm sandstone, ornamental columns or checkerboard.
    """
    # Medium gray only: maximum RGB variation between faces is just .019.
    # Rough surface for a stone impression, but not medieval weathering.
    mortar=paint('WALL SLAB | medium-gray recessed seams',(.245,.255,.265),.97)
    slab=[
        paint('WALL SLAB | medium gray stone 01',(.395,.404,.415),.92),
        paint('WALL SLAB | medium gray stone 02',(.403,.412,.423),.92),
        paint('WALL SLAB | medium gray stone 03',(.387,.397,.408),.92),
        paint('WALL SLAB | medium gray stone 04',(.399,.408,.419),.92)
    ]
    bevel=paint('WALL SLAB | soft edge bevel',(.423,.430,.440),.89)
    shade=paint('WALL SLAB | lower edge shade',(.347,.356,.367),.97)
    cap=paint('WALL SLAB | medium gray capstones',(.400,.409,.420),.93)
    capEdge=paint('WALL SLAB | capstone edge',(.421,.430,.440),.91)
    p=Painter()
    n=20
    courses=3
    inside=radius-.23
    outside=radius+2.68
    gap=.0053 # angular gap ~1.8cm at wall face per side
    course_h=(height-.25)/courses
    # Recessed mortar behind the entire set of genuinely separate slabs.
    for k in range(n):
        a0=2*PI*k/n
        a1=2*PI*(k+1)/n
        cylinder_ribbon(p,mortar,radius-.125,radius-.075,a0,a1,.04,height+.20)
        # Mortar line on the outside, behind every raised exterior slab.
        p.quad(mortar,
            (outside-.045)*Vector((math.cos(a1),math.sin(a1),0))+Vector((0,0,.04)),
            (outside-.045)*Vector((math.cos(a0),math.sin(a0),0))+Vector((0,0,.04)),
            (outside-.045)*Vector((math.cos(a0),math.sin(a0),0))+Vector((0,0,height+.20)),
            (outside-.045)*Vector((math.cos(a1),math.sin(a1),0))+Vector((0,0,height+.20)))
    for row in range(courses):
        z_lo=.085+row*course_h+.055
        z_hi=.085+(row+1)*course_h-.06
        # Half-slab stagger, huge monolithic ashlar panels.
        for k in range(n):
            offset=.5 if row%2 else 0
            a0=2*PI*(k+offset)/n+gap
            a1=2*PI*(k+offset+1)/n-gap
            mat=slab[(k+row*3)%len(slab)]
            # Interior 3D slab face; depth forms real chiseled seam reveals.
            cylinder_ribbon(p,mat,inside,radius+.03,a0,a1,z_lo,z_hi)
            # Exterior 3D slab, outward-facing with reversed winding.
            r=outside
            p.quad(mat,
               (r*math.cos(a1),r*math.sin(a1),z_lo),
               (r*math.cos(a0),r*math.sin(a0),z_lo),
               (r*math.cos(a0),r*math.sin(a0),z_hi),
               (r*math.cos(a1),r*math.sin(a1),z_hi))
            # A narrow bevel across the top of each huge panel.
            cylinder_ribbon(p,bevel,inside-.005,inside+.005,
                a0+.002,a1-.002,z_hi-.058,z_hi-.013)
            # Tiny undercut; not a heavy decorative brick course.
            cylinder_ribbon(p,shade,inside-.002,inside+.006,
                a0+.002,a1-.002,z_lo+.015,z_lo+.045)
    # Individual wide cap slabs with subtle separation marks.
    for k in range(n):
        a0=2*PI*(k+gap/2)/n
        a1=2*PI*(k+1-gap/2)/n
        cylinder_ribbon(p,cap,inside-.20,outside+.16,
            a0,a1,height-.03,height+.33)
        cylinder_ribbon(p,capEdge,inside-.23,outside+.19,
            a0+.002,a1-.002,height+.27,height+.36)
    meshes=p.finish('WALL clean medium-gray giant stone slabs')
    print('STONE_SLAB_WALL_QA',n,'slabs per course',courses,'courses',
          sum(len(o.data.polygons) for o in meshes),'faces',len(meshes),'materials')

def tree_details(tubular,leaf_ball,canopy_center=(.12,.18)):
    rng=random.Random(SEED+43)
    bark_high=paint('Tree bark highlight | cedar',(0.42,.26,.15))
    bark_dark=paint('Tree bark fissure | graphite brown',(0.16,.11,.07))
    bark_mid=paint('Tree root sapwood',(0.32,.20,.13))
    leaf_colors=[
      paint('Anime canopy jade',(0.25,.49,.25)),
      paint('Anime canopy spring',(0.37,.61,.29)),
      paint('Anime canopy shaded green',(0.18,.36,.23)),
      paint('Anime canopy golden light',(0.48,.66,.33)),
      paint('Anime canopy meadow',(0.30,.53,.29)),
    ]
    # Twisted bark flutes make the trunk look sculpted instead of a cone.
    for i in range(BARK_RIDGES):
        angle=2*PI*i/BARK_RIDGES
        pts=[]
        radii=[]
        for j in range(10):
            z=.33+j*.78
            trunk_r=1.84*(1-z/12)**.35+.015
            a=angle + .05*math.sin(z*.72+i) + .04*z
            pts.append((trunk_r*math.cos(a)+.06,
                        trunk_r*math.sin(a)+.01,z))
            radii.append(max(.025,.075*(1-z/11)))
        tubular('TREE | raised hand-carved bark '+str(i),pts,radii,
                bark_high if i%2 else bark_dark,5)
    # Interwoven asymmetrical roots within the original 3.15m tree collider;
    # the roots carry no collision of their own.
    for i in range(ROOT_FINGERS):
        angle=2*PI*i/ROOT_FINGERS+rng.uniform(-.22,.22)
        d=Vector((math.cos(angle),math.sin(angle),0))
        p0=Vector((.02,.02,2.2))
        p1=d*1.34+Vector((0,0,1.12))
        p2=d*(2.15+rng.random()*.23)+Vector((0,0,.42))
        p3=d*(2.85+rng.random()*.20)+Vector((0,0,.06))
        tubular('TREE | low spreading root '+str(i),[tuple(x) for x in (p0,p1,p2,p3)],
                [.27,.22,.13,.047],bark_mid if i%2 else bark_dark,7)
    # Layered outer sprays create a more natural overhanging crown, with small
    # bright and dark lobes rather than repeating a handful of big balloons.
    for i in range(CANOPY_SPRAYS):
        a=2*PI*rng.random()
        spread=rng.uniform(4.2,12.7)
        z=11.4+3.4*(1-spread/15)+rng.uniform(-1.0,1.1)
        x=canopy_center[0]+spread*math.cos(a)
        y=canopy_center[1]+spread*math.sin(a)
        size=rng.uniform(.70,1.80)
        leaf_ball('TREE | layered leaf spray %03d'%i,x,y,z,
            size*1.48,size*1.18,size*.86,
            leaf_colors[i%len(leaf_colors)])
    # A few sturdy smaller limbs should be visible below the canopy edge.
    for i in range(8):
        a=2*PI*i/8+.10
        u=Vector((math.cos(a),math.sin(a),0))
        branch=[
            (.15,.11,7.10),
            tuple(u*2.55+Vector((.17,.04,8.15))),
            tuple(u*5.7+Vector((.17,.04,9.2))),
            tuple(u*8.2+Vector((.15,.08,10.45))),
        ]
        tubular('TREE | additional curved branch %d'%i,branch,
                [.32,.18,.11,.025],bark_mid,7)

def apply(mesh_func,tubular_func,leaf_ball_func,radius,height):
    ground_details(radius)
    wall_details(radius,height)
    tree_details(tubular_func,leaf_ball_func)
    print('ARENA_POLISH_FINISHED',GROUND_SECTORS,GROUND_BANDS,
          WALL_BRICKS_PER_RING,WALL_COURSES,CANOPY_SPRAYS)

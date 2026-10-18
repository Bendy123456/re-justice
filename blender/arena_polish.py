"""RE-Justice arena visual polish. Fully Blender-generated, no collision meshes.

Adds flush sculpted ground paint geometry, layered masonry, ornamental stone,
a tree with bark flutes and full leaf clusters. All additions are visually
decorative: the analytical collision radii in arena3d.js remain authoritative.
"""
import bpy
import math
import random
from mathutils import Vector

SEED = 11703
GROUND_SECTORS = 120
GROUND_BANDS = 13
WALL_BRICKS_PER_RING = 128
WALL_COURSES = 11
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
    rng=random.Random(SEED)
    sands=[
        paint('Packed earth ochre 01',(0.47,.36,.24)),
        paint('Packed earth ochre 02',(0.53,.41,.28)),
        paint('Packed earth warm sand',(0.58,.47,.34)),
        paint('Packed earth cool clay',(0.44,.39,.32)),
        paint('Packed earth pale straw',(0.61,.51,.37)),
        paint('Packed earth moss undertone',(0.43,.44,.32)),
        paint('Packed earth compact midtone',(0.50,.42,.31)),
    ]
    accent=paint('Engraved training ring • sandstone',(0.37,.34,.25))
    dust=paint('Scattered worn earth grains',(0.39,.33,.25))
    moss=paint('Ground-edge moss wash',(0.31,.39,.26))
    p=Painter()
    # One perfectly flush navigable ground plane rendered as tessellated earth
    # bands, with variations too shallow to alter foot placement.
    for k in range(GROUND_BANDS):
        r0=1.05+(radius-1.95)*k/GROUND_BANDS
        r1=1.05+(radius-1.95)*(k+1)/GROUND_BANDS
        for i in range(GROUND_SECTORS):
            a0=2*PI*i/GROUND_SECTORS
            a1=2*PI*(i+1)/GROUND_SECTORS
            v=math.sin(i*.63+k*3.79)+.7*math.sin(i*.17-k*.93)
            variant=int(abs(v)*2.1+rng.randint(0,2))%len(sands)
            ring_quad(p,sands[variant],r0,r1,a0,a1,-.057)
    # Smooth center also visually detailed under the single tree.
    ring_quad(p,sands[1],0,1.07,0,2*PI,-.057)
    # Ancient rings mark a training court with no obstacle or raised step.
    for radius_line in (4.1,6.1,11.9,22.2,29.4):
        for i in range(160):
            a=2*PI*i/160
            b=2*PI*(i+1)/160
            ring_quad(p,accent,radius_line-.06,radius_line+.06,a,b,-.047)
    # Partial narrow cracks and worn scratch streaks break up the radial tiles.
    for i in range(235):
        r=rng.uniform(5.0,31)
        a=rng.uniform(0,2*PI)
        leng=rng.uniform(.25,1.7)
        a1=a+leng/max(r,4)
        ring_quad(p,dust,r,r+rng.uniform(.016,.044),a,a1,-.045)
    # Moss stays near the outer boundary (flush geometric decal only).
    for i in range(100):
        a=rng.uniform(0,2*PI)
        width=rng.uniform(.012,.072)
        r=rng.uniform(30,31.9)
        ring_quad(p,moss,r,r+rng.uniform(.06,.35),a,a+width,-.044)
    out=p.finish('FLOOR polished anime terrain')
    print('FLOOR_QA',sum(len(o.data.polygons) for o in out),'faces',len(out),'materials')

def wall_details(radius=34.0,height=12.5):
    rng=random.Random(SEED+8)
    mortar=paint('Deep masonry joints • slate taupe',(0.34,.38,.36))
    brick=[
      paint('Aged limestone face 01',(0.56,.55,.48)),
      paint('Aged limestone face 02',(0.61,.59,.51)),
      paint('Aged limestone face 03',(0.48,.51,.48)),
      paint('Aged limestone face 04',(0.51,.52,.48)),
      paint('Aged limestone face 05',(0.60,.61,.56)),
      paint('Aged limestone face 06',(0.44,.49,.46)),
    ]
    bevel=paint('Stone cut top highlights',(0.71,.70,.61))
    dark=paint('Stone chiseled shadow',(0.36,.39,.37))
    pillar=paint('Pillar sandstone face',(0.60,.61,.56))
    p=Painter()
    # Each brick course is offset one half brick; all raised relief is OUTSIDE
    # physical fighters' collision radius (inside wall face r >= 33.84).
    for level in range(WALL_COURSES):
        z0=.60 + (height-.86)*level/WALL_COURSES
        z1=.60 + (height-.86)*(level+1)/WALL_COURSES
        for i in range(WALL_BRICKS_PER_RING):
            off=.5 if level%2 else 0
            a0=2*PI*(i+off+.014)/WALL_BRICKS_PER_RING
            a1=2*PI*(i+1+off-.014)/WALL_BRICKS_PER_RING
            if a1>2*PI: a1-=2*PI  # trig periodic, seam remains watertight
            inset=radius-(.066+rng.random()*.048)
            c=brick[(i*7+level*13+rng.randrange(3))%len(brick)]
            cylinder_ribbon(p,c,inset,radius+.035,a0,a1,z0+.035,z1-.035)
            cylinder_ribbon(p,bevel,inset-.012,inset,a0+.003,a1-.003,z1-.10,z1-.034)
    # Faint cut-stone lines break the original 12-meter-high flat vertical wall.
    for z in (3.68,6.90,10.12):
        for i in range(128):
            a0=2*PI*i/128
            a1=2*PI*(i+1)/128
            cylinder_ribbon(p,dark,radius-.13,radius,a0,a1,z-.065,z+.035)
            cylinder_ribbon(p,bevel,radius-.16,radius,a0,a1,z+.045,z+.11)
    # Massive structural buttresses tie masonry courses together, spaced
    # regularly like a dojo perimeter. They are just wall decoration, not props.
    for i in range(COLUMN_COUNT):
        center=2*PI*i/COLUMN_COUNT
        half=.022
        a0=center-half;a1=center+half
        cylinder_ribbon(p,pillar,radius-.39,radius+.4,a0,a1,.12,height+.30)
        cylinder_ribbon(p,bevel,radius-.49,radius+.46,a0-.006,a1+.006,3.2,3.55)
        cylinder_ribbon(p,bevel,radius-.49,radius+.46,a0-.006,a1+.006,8.80,9.12)
        cylinder_ribbon(p,dark,radius-.42,radius+.46,a0-.003,a1+.003,.45,.60)
        # Pseudo-engraved vertical inset on each column centerline.
        cylinder_ribbon(p,dark,radius-.415,radius-.385,center-.004,center+.004,4,8.3)
    outputs=p.finish('WALL carved multi-course blocks')
    print('WALL_QA',sum(len(o.data.polygons) for o in outputs),'faces',len(outputs),'materials')

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

"""RE-Justice Blender arena: full-height pale-gray vertical slabs, grass and tree.

Visual meshes only: arena3d.js retains the existing analytical collisions.
"""
import bpy
import math
import random
import os
from mathutils import Vector

SEED = 11703
GROUND_SECTORS = 120
GROUND_BANDS = 13
WALL_BRICKS_PER_RING = 34
WALL_COURSES = 1
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
            obj=new_mesh(prefix+' | '+key,v['v'],v['f'],v['material'])
            # Long vertical stone slabs get real, repeatable UVs from their
            # curved horizontal position and height. Without these, a PNG
            # stone texture would never show up in the in-game GLB.
            if prefix.startswith('WALL '):
                uv=obj.data.uv_layers.new(name='Stone surface UV')
                for polygon in obj.data.polygons:
                    indices=list(polygon.loop_indices)
                    angles=[]
                    for li in indices:
                        p=obj.data.vertices[obj.data.loops[li].vertex_index].co
                        angles.append(math.atan2(p.y,p.x))
                    center=angles[0]
                    angles=[a+2*PI*round((center-a)/(2*PI)) for a in angles]
                    for li,theta in zip(indices,angles):
                        vtx=obj.data.vertices[obj.data.loops[li].vertex_index].co
                        uv.data[li].uv=(theta*34/2.7,vtx.z/2.7)
            outputs.append(obj)
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
    """Denser, articulated short grass with no walkable-floor changes.

    Different blade shapes catch light in the foreground. Heights stay below
    14 cm, so there is no tall-field look or extra physics/collision cost.
    The principal 768px turf texture carries detail farther from the camera.
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
    pale=paint('GRASS | bright sunlit blades',(.34,.52,.23),.99)
    p=Painter()
    tufts=22500
    for k in range(tufts):
        a=rng.uniform(0,2*PI)
        r=math.sqrt(rng.random())*(radius-1.65)
        if r<3.7:continue
        x,y=r*math.cos(a),r*math.sin(a)
        base_z=-.085
        h=rng.uniform(.042,.132)
        width=rng.uniform(.013,.038)
        heading=rng.uniform(0,2*PI)
        tint=mids[(k+rng.randrange(4))%len(mids)]
        # Four gently bent blade ribbons per tuft, split into two triangles
        # each: more natural tip and base shading than straight standing fins.
        for b in range(4):
            t=heading+b*PI/2+rng.uniform(-.17,.17)
            dx,dy=math.cos(t),math.sin(t)
            bend=h*(.15+rng.random()*.23)
            left=(x-dy*width/2,y+dx*width/2,base_z)
            right=(x+dy*width/2,y-dx*width/2,base_z)
            mid=(x+dx*bend*.44,y+dy*bend*.44,base_z+h*.56)
            tip=(x+dx*bend,y+dy*bend,base_z+h*(.88+.09*rng.random()))
            p.triangle(tint if b<3 else dark,left,right,mid)
            p.triangle(pale if k%11==0 and b==0 else tint,left,mid,tip)
        if k%21==0:
            size=rng.uniform(.026,.067)
            for j in range(3):
                t=heading+j*2*PI/3
                p.triangle(clover,(x,y,base_z+.012),
                    (x+math.cos(t-.38)*size,y+math.sin(t-.38)*size,base_z+.011),
                    (x+math.cos(t+.38)*size,y+math.sin(t+.38)*size,base_z+.011))
    output=p.finish('GRASS short natural turf')
    print('GRASS_QA',tufts,'tufts',sum(len(o.data.polygons) for o in output),
          'triangles',len(output),'materials')
    print('HIGH_DETAIL_GRASS_QA','blade_ribbons',4,'tufts',tufts)

def solid_stone_slab(p,material,inner,outer,a0,a1,z0,z1):
    """Six real faces with correct outward normals for both sides of arena.

    Three.js renders front faces: inner stone faces must face the arena and
    outer faces away from it. Wrong winding gives dark checker-shaped spots.
    """
    def at(r,a,z):return (r*math.cos(a),r*math.sin(a),z)
    i0b=at(inner,a0,z0);i1b=at(inner,a1,z0)
    i0t=at(inner,a0,z1);i1t=at(inner,a1,z1)
    o0b=at(outer,a0,z0);o1b=at(outer,a1,z0)
    o0t=at(outer,a0,z1);o1t=at(outer,a1,z1)
    p.quad(material,i0b,i0t,i1t,i1b) # inside faces the center
    p.quad(material,o0b,o1b,o1t,o0t) # outside faces away
    p.quad(material,i0t,o0t,o1t,i1t) # top upwards
    p.quad(material,i0b,i1b,o1b,o0b) # base downwards
    p.quad(material,i0b,o0b,o0t,i0t) # left cut edge
    p.quad(material,i1b,i1t,o1t,o1b) # right cut edge

def make_stone_grain():
    """One reusable embedded PNG with stone pores, pale mineral flecks,
    shallow natural vertical grain and tiny creases (not brick-like rows).
    """
    size=768
    root=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','assets','arena'))
    os.makedirs(root,exist_ok=True)
    out=os.path.join(root,'stone-grain.png')
    rng=random.Random(SEED+502)
    pixels=[0.0]*(size*size*4)
    for y in range(size):
        v=2*PI*y/size
        for x in range(size):
            u=2*PI*x/size
            broad=.42*math.sin(2*u+1.5*math.sin(v*3))+.21*math.sin(4*v-3*u)
            grain=.15*math.sin(20*u+6*v)+.10*math.sin(51*v-16*u)
            fine=rng.uniform(-.036,.036)
            pits=-.075 if rng.random()<.0035 else 0
            mineral=.075 if rng.random()<.0021 else 0
            var=broad*.034+grain*.036+fine+pits+mineral
            idx=4*(y*size+x)
            pixels[idx]=max(.45,min(.78,.659+var))
            pixels[idx+1]=max(.46,min(.79,.669+var))
            pixels[idx+2]=max(.48,min(.81,.679+var))
            pixels[idx+3]=1.0
    img=bpy.data.images.new('Subtle porous light-gray stone surface',size,size,alpha=True)
    img.pixels.foreach_set(pixels)
    img.filepath_raw=out;img.file_format='PNG';img.save()
    tex=bpy.data.images.load(out,check_existing=False)
    tex.colorspace_settings.name='sRGB'
    print('HIGH_DETAIL_STONE_QA',size,'texture','small mineral pores')
    return tex

def apply_stone_texture(material,texture):
    bsdf=material.node_tree.nodes.get('Principled BSDF')
    img=material.node_tree.nodes.new('ShaderNodeTexImage')
    img.image=texture;img.extension='REPEAT'
    img.interpolation='Linear'
    material.node_tree.links.new(img.outputs['Color'],bsdf.inputs['Base Color'])

def wall_details(radius=34.0,height=12.5):
    """Tall, pale-gray monolithic slabs from grass to the upper cap.

    Each slab is a SINGLE full-height stone panel. Nothing is stacked in
    horizontal courses. Each is roughly 6.3m wide by 12.4m tall, gently
    offset in depth with thin vertical seams and a bevel only at the edges.
    These are genuine watertight Blender mesh prisms on both wall faces.
    Keep the existing analytic wall collider and grass/tree untouched.
    """
    rng=random.Random(SEED+681)
    # Restrained cool, LIGHT gray. No brown, dark charcoal or random bricks.
    pale=[
      paint('WALL VERTICAL | light limestone 01',(.642,.653,.666),.91),
      paint('WALL VERTICAL | light limestone 02',(.630,.641,.655),.91),
      paint('WALL VERTICAL | light limestone 03',(.652,.661,.672),.91),
      paint('WALL VERTICAL | light limestone 04',(.638,.648,.660),.91),
    ]
    seam=paint('WALL VERTICAL | fine recessed seam gray',(.485,.500,.516),.96)
    bevel=paint('WALL VERTICAL | soft chiseled edge',(.674,.684,.696),.89)
    crack=paint('WALL VERTICAL | faint hairline fissures',(.558,.571,.586),.96)
    cap=paint('WALL VERTICAL | continuous light-gray cap',(.650,.663,.676),.92)
    tooling=paint('WALL VERTICAL | subtle vertical tooling',(.603,.617,.635),.95)
    stone_image=make_stone_grain()
    for finish in pale+[cap]:
        apply_stone_texture(finish,stone_image)
    p=Painter()
    n=34
    angular_seam=.00075  # <6 cm total gap, never large dark gaps
    inner_face=radius-.27
    outer_face=radius+2.69
    # Thin recessed continuous wall behind the vertical gaps.
    for k in range(n):
        a0=2*PI*k/n
        a1=2*PI*(k+1)/n
        solid_stone_slab(p,seam,radius-.125,radius-.083,
                         a0,a1,-.14,height+.04)
        solid_stone_slab(p,seam,outer_face-.12,outer_face-.085,
                         a0,a1,-.14,height+.04)
    for k in range(n):
        a0=2*PI*k/n+angular_seam
        a1=2*PI*(k+1)/n-angular_seam
        # Almost straight with modest individual slab variation.
        offset=rng.uniform(-.023,.023)
        z0=-.145+rng.uniform(-.014,.014)
        z1=height-.10+rng.uniform(-.065,.045)
        material=pale[k%len(pale)]
        # Inner face points into the arena, outer face points outward.
        solid_stone_slab(p,material,inner_face+offset,radius+.045,
                         a0,a1,z0,z1)
        solid_stone_slab(p,material,outer_face-.18,outer_face+offset+.025,
                         a0,a1,z0,z1)
        # Thin side chamfers follow the full vertical height, rather than
        # creating distracting horizontal brick patterns.
        edge_width=.0031
        for theta_a,theta_b in ((a0,a0+edge_width),
                                (a1-edge_width,a1)):
            solid_stone_slab(p,bevel,inner_face+offset-.008,
                             inner_face+offset+.015,
                             theta_a,theta_b,z0+.08,z1-.07)
            solid_stone_slab(p,bevel,outer_face+offset+.018,
                             outer_face+offset+.027,
                             theta_a,theta_b,z0+.08,z1-.07)
        # Occasional near-invisible vertical natural fissure; no brick grid.
        if k%11==4:
            theta=a0+(a1-a0)*.62
            thin=.00048
            solid_stone_slab(p,crack,inner_face+offset-.011,
                inner_face+offset-.005,theta,theta+thin,
                z0+2.0,z0+4.1)
        # Deliberately sparse worn marks at varied heights, following each
        # monolithic stone instead of dividing it into little brick courses.
        for scratch in range(4):
            zlow=rng.uniform(.9,height-3.0)
            line_length=rng.uniform(.25,1.4)
            theta=a0+(a1-a0)*rng.uniform(.12,.86)
            width=rng.uniform(.00025,.00055)
            solid_stone_slab(p,tooling,inner_face+offset-.013,
                inner_face+offset-.008,theta,theta+width,
                zlow,zlow+line_length)
        # A simple individual matching-gray top stone, one per vertical
        # panel, rather than the previous 64-piece structural trim.
        solid_stone_slab(p,cap,inner_face-.13,outer_face+.13,
            a0+.0003,a1-.0003,height-.06,height+.26)
    outputs=p.finish('WALL full-height vertical light gray slabs')
    print('VERTICAL_WALL_QA',n,'full-height panels',
        'courses',1,'min-height',round(height-.30,2),
        'light-gray','surface','slim seams','meshes',len(outputs))
    print('STONE_SLAB_WALL_QA',n,'slabs per course',1,'courses',
          sum(len(o.data.polygons) for o in outputs),'faces',len(outputs),'materials')

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

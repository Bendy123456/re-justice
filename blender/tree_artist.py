"""RE-Justice / original hero tree — Blender procedural sculpture.

A designed tree, not intersecting primitive spheres:
* organically bent, ribbed trunk with a consistent stem silhouette
* tapered trunk-root buttresses and asymmetrical curving limbs
* articulated secondary forks and terminal twig networks
* compact sculpted leaf sprays made from individual curved lanceolate leaves
* dappled color/underside foliage; no ico-sphere canopy primitives

The arena radius / colliders never change. Everything generated here is
decorative Blender mesh and is combined with the existing stage GLB.
"""
import bpy
import math
import random
import os
from mathutils import Vector

TREE_SEED = 142981
WOOD_RINGS = 38
WOOD_SIDES = 28
MAJOR_BRANCHES = 12
ROOT_COUNT = 9
LEAF_GROUPS = 13
LEAVES_PER_GROUP = 385
LEAF_WIDTH_MIN = .16
LEAF_WIDTH_MAX = .38
LEAF_LENGTH_MIN = .52
LEAF_LENGTH_MAX = 1.04
BARK_STRANDS = 44
CANOPY_BASE = 7.05
CANOPY_TOP = 17.7
BRANCH_REACH = 10.8
PI = math.pi
TAU = PI * 2
_rng = random.Random(TREE_SEED)

def V(x):return x if isinstance(x,Vector) else Vector(x)
def mix(a,b,t):return a*(1-t)+b*t
def norm(v,fallback=(1,0,0)):
    u=V(v)
    return u.normalized() if u.length>1e-8 else V(fallback)

def material(name,color,rough=.92):
    m=bpy.data.materials.new(name)
    m.use_nodes=True
    m.diffuse_color=(*color,1)
    bsdf=m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value=(*color,1)
    bsdf.inputs["Roughness"].default_value=rough
    bsdf.inputs["Metallic"].default_value=0
    m.use_backface_culling=False
    return m

def commit(name,verts,faces,mat,smooth=False):
    dat=bpy.data.meshes.new(name)
    dat.from_pydata(verts,[],faces);dat.update()
    obj=bpy.data.objects.new(name,dat)
    bpy.context.collection.objects.link(obj)
    dat.materials.append(mat)
    for f in dat.polygons:f.use_smooth=smooth
    if name.startswith('OLD TREE |') and (
        'trunk' in name or 'branches and forks' in name or 'root buttresses' in name
    ):
        # Cylindrical/triplanar-like continuous projection for baked bark.
        uv=dat.uv_layers.new(name='Organic bark UV')
        for face in dat.polygons:
            loops=list(face.loop_indices)
            angles=[]
            for li in loops:
                vertex=dat.vertices[dat.loops[li].vertex_index].co
                angles.append(math.atan2(vertex.y,vertex.x))
            center=angles[0]
            for li,angle in zip(loops,angles):
                vertex=dat.vertices[dat.loops[li].vertex_index].co
                angle+=2*PI*round((center-angle)/(2*PI))
                uv.data[li].uv=(angle/(2*PI)*2,vertex.z/3.1)
    return obj

class Batch:
    def __init__(self):self.v=[];self.f=[]
    def patch(self,vertices,faces):
        start=len(self.v)
        self.v.extend(tuple(v) for v in vertices)
        self.f.extend(tuple(start+i for i in f) for f in faces)
    def finish(self,name,mat,smooth=False):
        return commit(name,self.v,self.f,mat,smooth)

def centerline(z):
    """S-shaped but upright silhouette so the trunk feels rooted, not tilted."""
    return Vector((.06+.20*math.sin(z*.33)+.012*z,
                  -.045+.17*math.sin(z*.26+.3),z))

def trunk_radius(z):
    # Wide, stable base and slow taper followed by crown fork.
    return 1.61-.087*z+.37*math.exp(-(z/.94)**2)

def tube_path(batch,points,radii,segments=10,seed=0,grooves=.055):
    """Swept mesh with stable parallel transport and soft (non-hard-edged) taper."""
    p=[V(x) for x in points]
    if len(p)<2:return
    frame=norm(p[1]-p[0],(0,0,1))
    guide=Vector((0,1,0)) if abs(frame.y)<.90 else Vector((1,0,0))
    u=norm(frame.cross(guide),(1,0,0));v=norm(frame.cross(u),(0,1,0))
    vertices=[]
    for i,pos in enumerate(p):
        tangent=norm(p[min(i+1,len(p)-1)]-p[max(i-1,0)],(0,0,1))
        # Reconstruct the cross-section orthogonal to tangent, avoiding
        # a sudden twisted frame if the branch bends substantially.
        u=norm(u-tangent*(u.dot(tangent)),(1,0,0))
        v=norm(tangent.cross(u),(0,1,0))
        for j in range(segments):
            a=TAU*j/segments
            uneven=1+grooves*math.sin(a*7.0+.5*i+seed*1.31)
            uneven+=.026*math.sin(a*13.0+seed*2.7-i*.3)
            vertices.append(pos+radii[i]*uneven*(u*math.cos(a)+v*math.sin(a)))
    faces=[]
    for i in range(len(p)-1):
        for j in range(segments):
            a=i*segments+j;b=i*segments+(j+1)%segments
            faces.append((a,b,b+segments,a+segments))
    faces.append(tuple(reversed(list(range(segments)))))
    faces.append(tuple((len(p)-1)*segments+j for j in range(segments)))
    batch.patch(vertices,faces)

def hermite_points(a,b,c,d,steps):
    """Bezier centerline sampling, a curve not 4 straight cylinder parts."""
    result=[]
    a,b,c,d=map(V,(a,b,c,d))
    for i in range(steps):
        t=i/(steps-1)
        p=(1-t)**3*a+3*t*(1-t)**2*b+3*t*t*(1-t)*c+t**3*d
        result.append(p)
    return result

def make_bark_texture():
    """Small embedded vertical-fissure bark image for close-up trunk detail."""
    width,height=512,768
    out=os.path.abspath(os.path.join(os.path.dirname(__file__),'..',
                                     'assets','arena','tree-bark-grain.png'))
    os.makedirs(os.path.dirname(out),exist_ok=True)
    rng=random.Random(TREE_SEED+212)
    pixels=[0.0]*(width*height*4)
    for y in range(height):
        v=y*TAU/height
        for x in range(width):
            u=x*TAU/width
            # Skinny almost-vertical crevices, irregular wood grain,
            # and a few pale ridges; no horizontal "ring" stripes.
            groove=abs(math.sin(15*u+.21*math.sin(2*v)+.11*math.sin(7*v)))
            ridge=.09*math.sin(32*u+1.4*math.sin(5*v))
            grunge=rng.uniform(-.025,.025)
            dark=-.088 if groove>.975 else 0
            d=ridge*.5+grunge+dark
            i=(y*width+x)*4
            pixels[i]=max(.10,min(.46,.292+d))
            pixels[i+1]=max(.06,min(.34,.188+d*.73))
            pixels[i+2]=max(.035,min(.22,.111+d*.48))
            pixels[i+3]=1.0
    image=bpy.data.images.new('Fine ribbed brown tree bark',width,height,alpha=True)
    image.pixels.foreach_set(pixels)
    image.filepath_raw=out;image.file_format='PNG';image.save()
    tex=bpy.data.images.load(out,check_existing=False)
    tex.colorspace_settings.name='sRGB'
    print('HIGH_DETAIL_BARK_QA',width,height)
    return tex

def apply_wood_texture(material,texture):
    p=material.node_tree.nodes.get('Principled BSDF')
    image=material.node_tree.nodes.new('ShaderNodeTexImage')
    image.image=texture;image.extension='REPEAT';image.interpolation='Linear'
    material.node_tree.links.new(image.outputs['Color'],p.inputs['Base Color'])

def make_wood():
    trunk=Batch();branches=Batch();roots=Batch()
    # Trunk axis is slightly twisted; rings have bark ridge noise in actual
    # geometry so it reads at both overview distance and in-game up close.
    zlist=[-.15+9.9*i/(WOOD_RINGS-1) for i in range(WOOD_RINGS)]
    trunk_pts=[centerline(z) for z in zlist]
    trunk_r=[max(.27,trunk_radius(z)) for z in zlist]
    tube_path(trunk,trunk_pts,trunk_r,WOOD_SIDES,7,.12)

    # Main forks are irregularly pitched in different planes and heights.
    # No equally spaced radial "spoke wheel" of identical branches.
    tip_points=[]
    for i in range(MAJOR_BRANCHES):
        angle=TAU*(i+.17*_rng.random())/MAJOR_BRANCHES
        reach=BRANCH_REACH*(.69+.33*_rng.random())
        height=6.3+.36*(i%7)+_rng.uniform(-.75,.75)
        axis=Vector((math.cos(angle),math.sin(angle),0))
        a=centerline(height)
        b=a+axis*(reach*.23)+Vector((0,0,2.55))
        c=a+axis*(reach*.69)+Vector((0,0,3.65+_rng.uniform(-1.0,1.5)))
        d=a+axis*reach+Vector((0,0,4.45+_rng.uniform(-1.7,2.1)))
        pts=hermite_points(a,b,c,d,12)
        radii=[mix(.52,.045,(t/(len(pts)-1))**.77) for t in range(len(pts))]
        tube_path(branches,pts,radii,9,i,.095)
        tip_points.append((d,axis,angle))

        # Each large bough splits into smaller asymmetrical finger branches.
        for j in range(4):
            t=.43+j*.14+_rng.uniform(-.033,.037)
            start=pts[max(1,min(10,round(t*11)))]
            rotate=angle+((-1)**j)*(_rng.uniform(.32,.78))
            spread=Vector((math.cos(rotate),math.sin(rotate),0))
            off=2.0+_rng.random()*2.35
            fork=hermite_points(
                start,start+spread*.72+Vector((0,0,.72)),
                start+spread*(off*.78)+Vector((0,0,1.45)),
                start+spread*off+Vector((0,0,1.85+_rng.random()*1.5)),7)
            tube_path(branches,fork,[mix(.20,.022,k/6) for k in range(7)],7,
                      i*4+j,.04)
            tip_points.append((fork[-1],spread,rotate))
            # Thin tertiary twigs support the leaves and add fine silhouette.
            for twig in range(2):
                az=rotate+(1 if twig else -1)*_rng.uniform(.24,.56)
                twigDir=Vector((math.cos(az),math.sin(az),.23))
                origin=fork[-2] if twig else fork[-1]
                end=origin+twigDir*_rng.uniform(.6,1.10)
                tpts=hermite_points(origin,origin+twigDir*.21+
                  Vector((0,0,.07)),end-twigDir*.12,end,5)
                tube_path(branches,tpts,[.033,.027,.019,.012,.005],
                          5,i*60+j*2+twig,.045)

    # Root buttresses flare smoothly from the real trunk and stay completely
    # within the established non-walkable tree collision radius (3.15 m).
    for i in range(ROOT_COUNT):
        angle=TAU*i/ROOT_COUNT+_rng.uniform(-.2,.2)
        direction=Vector((math.cos(angle),math.sin(angle),0))
        root=hermite_points(
            centerline(1.7),
            centerline(.8)+direction*.83,
            direction*2.30+Vector((0,0,.33)),
            direction*(2.72+_rng.random()*.16)+Vector((0,0,.015)),9)
        tube_path(roots,root,[.38,.39,.36,.29,.24,.17,.12,.07,.026],10,i,.11)
    wood_material=material("Centuries-old warm chestnut bark",(.265,.167,.096))
    root_material=material("Sculpted root bark ochre",(.327,.218,.136))
    bark_texture=make_bark_texture()
    apply_wood_texture(wood_material,bark_texture)
    apply_wood_texture(root_material,bark_texture)
    trunk.finish("OLD TREE | continuous ridged trunk",wood_material,True)
    branches.finish("OLD TREE | tapered curved branches and forks",wood_material,True)
    roots.finish("OLD TREE | flowing flared root buttresses",root_material,True)
    return tip_points

def make_bark_ribbons():
    # Fine long irregular creases following the curvature of the trunk,
    # not disconnected vertical tubes stuck to an inflated cone.
    strips=Batch()
    for strand in range(BARK_STRANDS):
        angle=TAU*strand/BARK_STRANDS
        pts=[]
        for step in range(39):
            z=.24+7.8*step/38
            theta=angle+.13*math.sin(z*.42+strand*.65)+z*.032
            r=trunk_radius(z)*1.035
            center=centerline(z)
            p=center+Vector((r*math.cos(theta),r*math.sin(theta),0))
            pts.append(p)
        # Subtle broad ribbons lie against the trunk; tonal bark grooves.
        for k in range(len(pts)-1):
            p=pts[k];q=pts[k+1]
            off=Vector((math.cos(angle),math.sin(angle),0))*.026
            w=.020+.013*math.sin(k*.24+strand)
            t=Vector((-math.sin(angle),math.cos(angle),0))*w
            strips.patch([p+t+off,p-t+off,q-t+off,q+t+off],
                         [(0,1,2,3)])
    strips.finish("OLD TREE | flowing bark fissures",
                  material("Bark crevices dark brown",(.135,.086,.055)))

def add_leaf(batch,pos,direction,width,length,tilt,seed):
    """Curled pointed six-vertex leaf, 4-6 triangles; no faceted ico blobs."""
    d=norm(direction,(0,0,1))
    guide=Vector((0,0,1)) if abs(d.z)<.83 else Vector((1,0,0))
    side=norm(d.cross(guide),(0,1,0))
    normal=norm(d.cross(side),(0,0,1))
    base=V(pos)
    half=width/2
    # Main lanceolate blade: base -> wide midbody -> taper tip.
    mid=base+d*(length*.53)+normal*(tilt*.17)
    tip=base+d*length+normal*(tilt*.45)
    v=[
        base,
        mid+side*half,
        mid+normal*(width*.11),
        mid-side*half,
        tip,
        base+d*(length*.28)+side*(half*.46),
        base+d*(length*.28)-side*(half*.46)
    ]
    faces=[(0,5,2),(5,1,2),(0,2,6),(6,2,3),
           (1,4,2),(2,4,3)]
    # The foliage material already exports as double-sided in glTF.
    # Adding reversed duplicate polygons would waste ~half the leaf geometry
    # while providing no visible benefit in the browser.
    batch.patch(v,faces)

def make_leaves(wood_tips):
    # Multiple shades mixed at the leaf level. A leaf cluster is itself a
    # cloud of narrow blades instead of a single ellipsoid mesh.
    colors=[
      (.12,.27,.17),(.20,.39,.22),(.26,.47,.26),(.31,.53,.27),
      (.39,.56,.28),(.46,.61,.31),(.23,.43,.29),
      (.31,.48,.23),(.49,.60,.32),
    ]
    mats=[material("Leaf blades | natural shade %02d"%i,col,.92)
          for i,col in enumerate(colors)]
    batches=[Batch() for _ in colors]
    sprays=[]
    # Crown is asymmetrical, large low boughs with patchy tips and layered
    # undersides. Small voids separate independent sprays.
    for p,d,a in wood_tips:
        sprays.append((p+Vector((0,0,.4)),1.0+_rng.uniform(-.1,.5)))
    for i in range(34):
        angle=_rng.random()*TAU
        r=math.sqrt(_rng.random())*10.2
        center=Vector((r*math.cos(angle),r*math.sin(angle),
                       _rng.uniform(10.4,15.5)))
        sprays.append((center,1.20+_rng.random()*.60))

    # Blend many fine clusters; directional young shoots avoid "balls stacked
    # on branches" silhouette. No leaf clouds are opaque solid primitives.
    for n,(center,scale) in enumerate(sprays):
        layers=65 if n<len(wood_tips) else 85
        for k in range(layers):
            a=_rng.random()*TAU
            r=(.15+_rng.random()*.85)*(1.4+scale)
            local=Vector((math.cos(a)*r,
                          math.sin(a)*r,
                          _rng.uniform(-1.25,1.40)*scale))
            seedpos=center+local
            # Each bud fans 3-5 actual leaves; shades split among groups.
            buds=3+_rng.randint(0,2)
            outward=norm(local+Vector((0,0,.55)))
            for j in range(buds):
                jitter=Vector((_rng.uniform(-.9,.9),
                               _rng.uniform(-.9,.9),
                               _rng.uniform(-.6,.9)))
                direction=norm(outward*.55+jitter*.55)
                width=_rng.uniform(LEAF_WIDTH_MIN,LEAF_WIDTH_MAX)*scale
                length=_rng.uniform(LEAF_LENGTH_MIN,LEAF_LENGTH_MAX)*scale
                position=seedpos+jitter*.23
                idx=(_rng.randrange(9)+int(position.z))%len(batches)
                add_leaf(batches[idx],position,direction,width,length,
                         _rng.uniform(-1,1),n*1000+k*10+j)
    for i,batch in enumerate(batches):
        batch.finish("OLD TREE | thousands of leaf blades %02d"%i,mats[i],False)

def build_tree():
    tips=make_wood()
    make_bark_ribbons()
    make_leaves(tips)
    print("HIGH_DETAIL_TREE_QA",{"branch_tips":len(tips),
        "bark_strands":BARK_STRANDS,"wood_rings":WOOD_RINGS})
    print("ARTIST_TREE_BUILT",{"major_branches":MAJOR_BRANCHES,
        "tips":len(tips),"bark_strands":BARK_STRANDS,
        "foliage_meshes":9,"canopy_range":[CANOPY_BASE,CANOPY_TOP]})

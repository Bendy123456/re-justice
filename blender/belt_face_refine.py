"""Batman refinement: anatomically fitted tactical belt and human-face cowl.
Keeps the Quaternius CC0 body and 65-bone armature unchanged.
The two functions append independent meshes to the existing render-only art.
"""
import bpy
import math
from mathutils import Vector
from mathutils.bvhtree import BVHTree

BELT = {
    "z":1.008,"half_height":.027,"radial_gap":.008,
    "thickness":.008,"sections":96,"pouch_width":.044,
    "pouch_height":.052,"pouch_depth":.020,"edge_radius":.007,
    "pouch_angles":(-.78,-.54,-.30,.30,.54,.78),
}
COWL = {
    "brow_gap":.004,"lens_depth":-.143,"base_depth":-.125,
    "ear_height":1.862,"ear_tip_spacing":.098,
}

def _make_object(name, vertices, faces, material, extras, bone, smooth=True):
    geo=bpy.data.meshes.new(name+" mesh")
    geo.from_pydata(vertices,[],faces)
    geo.update()
    ob=bpy.data.objects.new(name,geo)
    bpy.context.scene.collection.objects.link(ob)
    geo.materials.append(material)
    for face in geo.polygons:face.use_smooth=smooth
    extras.append((ob,bone))
    return ob

def _cube(name, pos, scale, mat, extras, bone, rotz=0, bevel=.006):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos)
    ob=bpy.context.object
    ob.name=name
    ob.dimensions=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    ob.rotation_euler.z=rotz
    ob.data.materials.append(mat)
    if bevel:
        mod=ob.modifiers.new("Soft molded corners","BEVEL")
        mod.width=bevel
        mod.segments=3
        ob.modifiers.new("Weighted panel shading","WEIGHTED_NORMAL")
    extras.append((ob,bone))
    return ob

def _bevel_plate(name,coords,material,extras,bone,thickness=.01,rounding=.003):
    # The nose, visor and cheek plates are deliberately curved along the
    # head surface; they are not rectangular pieces stacked in space.
    vertices=[tuple(p) for p in coords]
    mesh=_make_object(name,vertices,[tuple(range(len(vertices)))],material,extras,bone,False)
    mod=mesh.modifiers.new("Sculpted plate depth","SOLIDIFY")
    mod.thickness=thickness
    if rounding:
        mod=mesh.modifiers.new("Contour softness","BEVEL")
        mod.width=rounding;mod.segments=3
    mesh.modifiers.new("Smooth panel normals","WEIGHTED_NORMAL")
    return mesh

def build_fitted_belt(body, extras, materials):
    M=BELT
    strap=materials["strap"]
    trim=materials["trim"]
    pouch_mat=materials["pouch"]
    dark=materials["dark"]
    deps=bpy.context.evaluated_depsgraph_get()
    tree=BVHTree.FromObject(body,deps)
    mat=body.matrix_world
    inv=mat.inverted_safe()
    def radius(angle,z):
        direction=Vector((math.sin(angle),-math.cos(angle),0))
        origin=direction*.76+Vector((0,0,z))
        start=inv@origin
        delta=inv.to_3x3()@(-direction)
        delta.normalize()
        loc,_,_,_=tree.ray_cast(start,delta,1.5)
        if loc is not None:
            point=mat@loc
            rr=(point.x*direction.x+point.y*direction.y)
            if .10<=rr<=.26:return rr
        # Interpolate a fitted ellipse only when the actual mesh ray misses.
        return 1.0/math.sqrt((direction.x/.190)**2+(direction.y/.135)**2)
    n=M["sections"]
    samples={}
    for z in (M["z"]-M["half_height"],M["z"],M["z"]+M["half_height"]):
        vals=[radius(i*math.tau/n,z) for i in range(n)]
        # Smooth noisy polygon skin data without changing the base mesh.
        filtered=[sum(vals[(j+k)%n]*w for k,w in [(-2,1),(-1,3),(0,5),(1,3),(2,1)])/13 for j in range(n)]
        samples[z]=filtered
    vertices=[];faces=[]
    zs=(M["z"]-M["half_height"],M["z"]+M["half_height"])
    for outside in (False,True):
        for z in zs:
            k=samples[z]
            for i in range(n):
                a=math.tau*i/n
                d=k[i]+M["radial_gap"]+(M["thickness"] if outside else 0)
                vertices.append((math.sin(a)*d,-math.cos(a)*d,z))
    # 4 rings: interior lower, interior upper, exterior lower, exterior upper
    for j,l in ((0,1),(2,3),(0,2),(1,3)):
        for i in range(n):
            u=i;v=(i+1)%n
            faces.append((j*n+u,j*n+v,l*n+v,l*n+u))
    obj=_make_object("Belt / anatomical continuous curved band",vertices,faces,strap,extras,"pelvis")
    mod=obj.modifiers.new("Fabric band normal smoothing","WEIGHTED_NORMAL")
    # Muted capsule-like pouches sit ON the fitted band, following the
    # tangent and angle of the user's actual torso mesh. No detached blocks.
    for k,a in enumerate(M["pouch_angles"]):
        idx=int((a%math.tau)/math.tau*n)%n
        r=samples[M["z"]][idx]+M["radial_gap"]+M["thickness"]
        norm=Vector((math.sin(a),-math.cos(a),0))
        p=norm*(r+M["pouch_depth"]*.50)
        _cube("Belt fitted utility module %02d"%k,
              (p.x,p.y,M["z"]), (M["pouch_width"],M["pouch_depth"],M["pouch_height"]),
              pouch_mat,extras,"pelvis",a,M["edge_radius"])
        # small graphite latch molded flush to each front pouch
        if abs(a)<.61:
            latch=norm*(r+M["pouch_depth"]+.002)
            _cube("Inset charcoal pouch clasp %02d"%k,
                  (latch.x,latch.y,M["z"]+.008),(.014,.005,.012),
                  dark,extras,"pelvis",a,.002)
    # Closely fitted front center buckle as a plated mechanism
    front_r=radius(0,M["z"])+M["radial_gap"]+M["thickness"]
    _cube("Compact central belt buckle",(0,-front_r-.010,M["z"]),(.092,.023,.052),
          trim,extras,"pelvis",0,.009)
    _cube("Buckle inset core",(0,-front_r-.024,M["z"]),(.050,.004,.028),
          dark,extras,"pelvis",0,.006)
    print("BELT_REFINEMENT_QA",{"front_radius":round(radius(0,M["z"]),4),
          "side_radius":round(radius(math.pi/2,M["z"]),4),
          "rear_radius":round(radius(math.pi,M["z"]),4),
          "pouch_count":len(M["pouch_angles"])})
    return obj

def build_fitted_cowl(extras, materials):
    """Better brow/visor/jaw-line silhouette over existing anatomical face."""
    mask=materials["mask"];raised=materials["raised"]
    eyes=materials["eyes"];crease=materials["crease"]
    # Curved cheek armatures, taper upward into the front temple.
    for s,side in ((-1,"R"),(1,"L")):
        cheek=[
            (s*.083,-.095,1.685),(s*.120,-.064,1.699),
            (s*.131,-.041,1.656),(s*.117,-.057,1.624),
            (s*.099,-.085,1.621),(s*.077,-.121,1.654)
        ]
        _bevel_plate("Cowl cheek sweep "+side,cheek,mask,extras,"Head",.008,.003)
        # Brow ridge follows a pitched five-point anatomical arc.
        brow=[
            (s*.021,-.129,1.716),(s*.055,-.144,1.723),
            (s*.103,-.123,1.719),(s*.113,-.109,1.699),
            (s*.068,-.139,1.700),(s*.026,-.135,1.705)
        ]
        _bevel_plate("Integrated angular brow "+side,brow,mask,extras,"Head",.009,.003)
        # Tapered eye sockets / lenses: not big square white goggles.
        socket=[
            (s*.038,-.147,1.696),(s*.101,-.128,1.705),
            (s*.092,-.134,1.690),(s*.044,-.151,1.688)
        ]
        _bevel_plate("Deep eye-socket trim "+side,socket,crease,extras,"Head",.003,.001)
        lens=[
            (s*.044,-.153,1.697),(s*.091,-.134,1.701),
            (s*.082,-.142,1.695),(s*.048,-.158,1.692)
        ]
        _bevel_plate("Narrow armored eye lens "+side,lens,eyes,extras,"Head",.003,.001)
        # Less toy-like, shorter sculpted bat-ear: tapered wedge with bevel
        # on its profile, integrated into the skull cap.
        base_x=s*.093
        z_base=1.769
        ear=[
            (base_x-s*.027,-.005,z_base),
            (base_x+s*.027,-.008,z_base),
            (base_x+s*.017,.042,z_base+.010),
            (base_x-s*.021,.044,z_base+.010),
            (s*.095,.015,COWL["ear_height"]),
            (s*.103,.028,1.820)
        ]
        polys=[(0,1,4),(1,2,5,4),(2,3,5),(3,0,4,5),(0,3,2,1)]
        ear_obj=_make_object("Cowl contoured ear "+side,ear,polys,mask,extras,"Head",False)
        bevel=ear_obj.modifiers.new("Soft sculpted ear edges","BEVEL")
        bevel.width=.0026;bevel.segments=2
    # Bridge from upper brow to nose; expose lower jaw as original human mesh.
    bridge=[(-.034,-.142,1.700),(.034,-.142,1.700),
            (.020,-.150,1.662),(0,-.161,1.646),
            (-.020,-.150,1.662)]
    _bevel_plate("Tapered center cowl nose bridge",bridge,mask,extras,"Head",.006,.002)
    # Side shadows framing mouth—do not paint a false circular face patch.
    for s,side in ((-1,"R"),(1,"L")):
        trim=[(s*.091,-.112,1.656),(s*.107,-.086,1.640),
              (s*.078,-.118,1.623)]
        _bevel_plate("Jaw cutout trim "+side,trim,raised,extras,"Head",.003,.001)
    return True

"""Fitted, sculpted torso armor surfaces for the RE-Justice Batman art study.
Only adds armor and trim meshes over the existing Quaternius humanoid surface;
does not edit the imported body geometry, rig, face, limbs, or gameplay data.
All sizes are meters in the Blender humanoid's +Z-up coordinate system.
"""
import bpy
import bmesh
import math
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ARMOR_SETTINGS = {
    "ray_start_y": -2.0,
    "ray_length": 3.5,
    "fabric_clearance": 0.008,
    "plate_clearance": 0.017,
    "edge_clearance": 0.028,
    "emblem_clearance": 0.041,
    "plate_depth": 0.009,
    "bevel_width": 0.005,
    "bevel_segments": 3,
    "surface_grid_cuts": 2,
    "curve_radius": 0.0022,
}

def _rounded_outline(corners, rounding=0.10):
    """Round polygon corners without flattening the sculpt or losing contour."""
    points = []
    for i, corner in enumerate(corners):
        before = corners[(i - 1) % len(corners)]
        after = corners[(i + 1) % len(corners)]
        points.extend((
            (corner[0] + (before[0] - corner[0]) * rounding,
             corner[1] + (before[1] - corner[1]) * rounding),
            (corner[0] + (after[0] - corner[0]) * rounding,
             corner[1] + (after[1] - corner[1]) * rounding),
        ))
    return points

def build_torso_armor(body, extras, materials):
    """Construct separate, individually named, bone-bound mesh pieces."""
    M = ARMOR_SETTINGS
    matte, bright, dark = materials["matte"], materials["bright"], materials["dark"]
    soft, seam, crest = materials["soft"], materials["seam"], materials["crest"]
    deps = bpy.context.evaluated_depsgraph_get()
    tree = BVHTree.FromObject(body, deps)
    matrix = body.matrix_world.copy()
    inverse = matrix.inverted_safe()
    front = Vector((0, 1, 0))
    probes = []

    def skin_front_y(x, z):
        origin = inverse @ Vector((x, M["ray_start_y"], z))
        direction = inverse.to_3x3() @ front
        direction.normalize()
        location, _, _, _ = tree.ray_cast(origin, direction, M["ray_length"])
        # At the outer ribs some rays hit the arm or the *back* of the
        # humanoid mesh (positive Y). Reject these false "front" surfaces:
        # they caused the old rib plates to flare dramatically off the body.
        anatomical_front = -0.109 + .34 * x*x + .022 * abs(z - 1.40)
        if location is not None:
            result = (matrix @ location).y
            if result < -0.050:
                return max(result, anatomical_front - .024)
        return anatomical_front

    for x,z in [(0,1.40),(.1,1.40),(.22,1.40),(.27,1.43),(.07,1.29)]:
        probes.append((x,z,round(skin_front_y(x,z),4)))
    print("TORSO_ARMOR_SURFACE_PROBES",probes)

    def armor_shell(name, contour, material, bone="spine_03",
                    clearance=None, depth=None, bevel=None, rounded=.11):
        # Mesh starts as triangulated 2D contour, is finely subdivided, then
        # EACH vertex is projected to the actual anatomical torso surface.
        points = _rounded_outline(contour, rounded) if rounded else contour
        bm = bmesh.new()
        vertices=[bm.verts.new((x, 0, z)) for x,z in points]
        bm.verts.ensure_lookup_table()
        try:
            f = bm.faces.new(vertices)
        except ValueError:
            bm.free()
            raise RuntimeError("Invalid armor perimeter: " + name)
        bmesh.ops.triangulate(bm, faces=[f])
        bmesh.ops.subdivide_edges(
            bm, edges=list(bm.edges), cuts=M["surface_grid_cuts"],
            use_grid_fill=True,
        )
        gap = clearance if clearance is not None else M["plate_clearance"]
        for v in bm.verts:
            v.co.y = skin_front_y(v.co.x, v.co.z) - gap
        mesh = bpy.data.meshes.new("Surface mesh • "+name)
        bm.to_mesh(mesh); bm.free(); mesh.update()
        ob = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(ob)
        ob.data.materials.append(material)
        for polygon in ob.data.polygons:
            polygon.use_smooth = True
        solid=ob.modifiers.new("Molded rigid plate", "SOLIDIFY")
        solid.thickness=depth if depth is not None else M["plate_depth"]
        solid.offset=0.0
        bevel_mod=ob.modifiers.new("Rounded armor tooling", "BEVEL")
        bevel_mod.width=bevel if bevel is not None else M["bevel_width"]
        bevel_mod.segments=M["bevel_segments"]
        bevel_mod.limit_method='ANGLE'
        bevel_mod.angle_limit=.5
        normal=ob.modifiers.new("Smooth weighted hardplate reflections", "WEIGHTED_NORMAL")
        normal.keep_sharp=True
        extras.append((ob,bone))
        return ob

    def contour_piping(name, coords, material, bone="spine_03", out=None, radius=None):
        cr=bpy.data.curves.new(name,"CURVE");cr.dimensions='3D'
        cr.resolution_u=20
        cr.bevel_depth=radius if radius is not None else M["curve_radius"]
        cr.bevel_resolution=3
        sp=cr.splines.new('POLY')
        sp.points.add(len(coords)-1)
        gap=out if out is not None else M["edge_clearance"]
        for point,(x,z) in zip(sp.points,coords):
            point.co=(x,skin_front_y(x,z)-gap,z,1)
        obj=bpy.data.objects.new(name,cr)
        bpy.context.scene.collection.objects.link(obj)
        obj.data.materials.append(material)
        # Convert curves to meshes for reliable deformation / GLB export.
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active=obj
        bpy.ops.object.convert(target='MESH')
        obj=bpy.context.object
        extras.append((obj,bone))
        return obj

    # One anatomically fitted, continuous front cuirass.
    # A regular *quad mesh* avoids the folds/raised "box" artifacts that
    # triangulated floating plates caused in earlier revision renders.
    sections=[
        (1.185,.105),(1.215,.145),(1.250,.169),
        (1.285,.189),(1.325,.208),(1.365,.223),
        (1.405,.243),(1.440,.241),(1.469,.189)
    ]
    NX=34
    verts=[]
    faces=[]
    for z,width in sections:
        for i in range(NX+1):
            t=(i/NX)*2-1
            x=t*width
            front_y=skin_front_y(x,z)
            # Shallow forged contours at the upper chest, not an overhanging
            # chest shelf. Side panels softly taper back into suit cloth.
            chest_dome=0.0038*math.exp(-((abs(t)-.46)/.32)**2)*math.exp(-((z-1.412)/.06)**2)
            surf_offset=.007+chest_dome
            verts.append((x,front_y-surf_offset,z))
    for row in range(len(sections)-1):
        for col in range(NX):
            a=row*(NX+1)+col
            faces.append((a,a+1,a+1+(NX+1),a+(NX+1)))
    mesh=bpy.data.meshes.new("Continuously fitted chest shell")
    mesh.from_pydata(verts,[],faces);mesh.update()
    cuirass=bpy.data.objects.new("Seamless ballistic torso armor / continuous chest and abs",mesh)
    bpy.context.scene.collection.objects.link(cuirass)
    mesh.materials.append(matte)
    for polygon in mesh.polygons: polygon.use_smooth=True
    skin=cuirass.modifiers.new("Thin composite armor laminate","SOLIDIFY")
    skin.thickness=.0035
    skin.offset=0
    smooth=cuirass.modifiers.new("Smooth armor bevel","BEVEL")
    smooth.width=.002; smooth.segments=2
    cuirass.modifiers.new("Continuous weighted surface normals","WEIGHTED_NORMAL")
    extras.append((cuirass,"spine_03"))

    # Subtle chest shape is communicated through *recessed* garment seams and
    # material transitions rather than separate stacks of exposed rib blocks.
    for sign,side in [(-1,"R"),(1,"L")]:
        def P(c):
            return [(sign*x,z) for x,z in c]
        contour_piping("Sculpted collarbone panel join • "+side,
            P([(.036,1.454),(.108,1.458),(.181,1.444)]),
            bright,"spine_03",.014,.0016)
        contour_piping("Anatomical pectoral sweep • "+side,
            P([(.051,1.389),(.102,1.381),(.176,1.384),(.204,1.398)]),
            seam,"spine_03",.013,.0021)
        contour_piping("Oblique flex seam • "+side,
            P([(.165,1.351),(.180,1.319),(.148,1.267)]),
            seam,"spine_02",.012,.0015)
        contour_piping("Waist reinforcement transition • "+side,
            P([(.077,1.246),(.130,1.241),(.158,1.250)]),
            seam,"spine_02",.011,.0013)
    contour_piping("Soft armored sternum seam",
        [(0,1.367),(0,1.318),(0,1.267),(0,1.225)],
        seam,"spine_02",.010,.0017)

    # Flush matte bat-mark, following exactly the same torso curvature.
    # Keep it broad enough to read at gameplay distance yet inset
    # below the top contour instead of projecting from the chest.
    bat=[
        (-.174,1.420),(-.123,1.435),(-.088,1.443),(-.060,1.449),
        (-.028,1.434),(-.014,1.444),(0,1.433),(.014,1.444),
        (.028,1.434),(.060,1.449),(.088,1.443),(.123,1.435),
        (.174,1.420),(.114,1.402),(.068,1.412),(.037,1.399),
        (0,1.379),(-.037,1.399),(-.068,1.412),(-.114,1.402)
    ]
    armor_shell("Flush matte bat insignia",bat,crest,
                "spine_03",.017,.002,.001,.03)

    return {"plate_count":len(extras),"surface_probes":probes}

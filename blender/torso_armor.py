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

    # A low-profile molded ceramic cuirass follows the natural pectoral curve
    # of the Quaternius body. Every plate and recess is a skinned surface, not
    # an outward-facing rectangle. Left/right pairs preserve breathing room at
    # the sternum and the elastomer ribs.
    for sign,side in [(-1,"R"),(1,"L")]:
        def P(coords):
            return [(sign*x,z) for x,z in coords]
        pectoral=[
            (.022,1.444),(.064,1.471),(.144,1.470),(.222,1.448),
            (.251,1.418),(.238,1.394),(.166,1.366),(.090,1.369),
            (.028,1.386)
        ]
        armor_shell("Molded anatomical pectoral plate • "+side,
            P(pectoral),matte,"spine_03",.014,.0075,.0028,.19)
        # A single understated titanium lip conveys deliberate armor tooling.
        contour_piping("Collar-to-pectoral titanium contour • "+side,
            P([(.072,1.454),(.149,1.450),(.212,1.426)]),
            bright,"spine_03",.020,.0016)
        contour_piping("Pectoral lower elastomer seam • "+side,
            P([(.046,1.371),(.127,1.356),(.203,1.370)]),
            seam,"spine_03",.014,.0025)

        # The rib section is ONE broad low-relief anatomical breastplate with
        # incised articulation lines, not four floating 'finger' blocks.
        contour=[
            (.058,1.350),(.140,1.350),(.210,1.362),(.210,1.329),
            (.188,1.276),(.130,1.233),(.060,1.244)
        ]
        armor_shell("Continuous contoured oblique armor • "+side,
            P(contour),soft,"spine_02",.008,.0045,.0025,.22)
        for segment,(ztop,zbottom) in enumerate([
            (1.333,1.314),(1.300,1.285),(1.270,1.258)
        ]):
            contour_piping("Recessed oblique flex seam • "+side+" "+str(segment+1),
                P([(.073,ztop),(.145,ztop-.005),(.188,zbottom)]),
                seam,"spine_02",.015,.0018)
        # Narrow side guard wraps into the waist without expanding shoulders.
        armor_shell("Tapered flank protector • "+side,
            P([(.200,1.347),(.237,1.354),(.220,1.286),(.174,1.235),
               (.168,1.252),(.193,1.310)]),
            matte,"spine_02",.010,.0035,.002,.23)

    # Soft centerline, no chunky bridge or raised abdominal 'vertebrae'.
    contour_piping("Centerline woven seam",
        [(0,1.351),(0,1.291),(0,1.232),(0,1.180)],
        seam,"spine_02",.011,.0018)
    for sign,side in [(-1,"R"),(1,"L")]:
        contour_piping("Clavicle line • "+side,
            [(sign*.052,1.486),(sign*.139,1.485),(sign*.214,1.468)],
            seam,"spine_03",.012,.0021)

    # Matte-black recessed emblem follows a shallow curved pectoral platform.
    # No large sheet floating outward over the rest of the armor.
    bat=[
        (-.168,1.422),(-.125,1.434),(-.097,1.441),(-.070,1.447),
        (-.044,1.431),(-.015,1.445),(0,1.438),(.015,1.445),
        (.044,1.431),(.070,1.447),(.097,1.441),(.125,1.434),
        (.168,1.422),(.107,1.408),(.070,1.412),(.039,1.398),
        (0,1.379),(-.039,1.398),(-.070,1.412),(-.107,1.408)
    ]
    armor_shell("Recessed, body-fitted bat emblem",bat,crest,
                "spine_03",.024,.0035,.0015,.025)

    return {"plate_count":len(extras),"surface_probes":probes}

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
        if location is not None:
            result = (matrix @ location).y
            return result
        # Smooth fallback outside the anatomical body silhouette. Keep off torso edges.
        return -0.125 + 0.26 * abs(x)**2 + .09 * (z - 1.33)**2

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

    # Anatomically contoured left/right pectoral chest shells. The interior
    # sternum channel stays flexible. Rounded outside corners follow the pec.
    # Front view has right on +X and up on +Z.
    for sign,side in [(-1,"R"),(1,"L")]:
        def P(points):
            return [(sign*x,z) for x,z in points]
        pec=[
            (.021,1.455),(.065,1.480),(.172,1.482),
            (.282,1.444),(.306,1.404),(.276,1.372),
            (.164,1.344),(.063,1.364),(.022,1.392)
        ]
        shell=armor_shell("Sculpted pectoral cuirass • "+side,P(pec),matte,
                          "spine_03",.023,.012,.006,.14)
        # Inner inset follows the chest dome and reads as a tailored contour.
        contour_piping("Raised pectoral accent • "+side,
            P([(.068,1.458),(.157,1.466),(.238,1.435),(.264,1.408)]),
            bright,"spine_03",.040,.0027)
        # A thin flexible seam under each pec rather than a pasted block row.
        contour_piping("Underside pec gasket • "+side,
            P([(.07,1.350),(.16,1.335),(.249,1.362)]),
            seam,"spine_03",.033,.0033)
        # Rib and oblique segments get narrower and tuck into waist.
        ribs=[
            ([(.054,1.341),(.169,1.329),(.236,1.349),(.223,1.314),(.153,1.298),(.060,1.308)],"Rib guard"),
            ([(.060,1.292),(.152,1.291),(.209,1.306),(.185,1.274),(.139,1.263),(.061,1.267)],"Lower rib"),
            ([(.070,1.253),(.134,1.259),(.180,1.273),(.165,1.239),(.120,1.221),(.069,1.228)],"Tapered oblique"),
        ]
        for i,(path,nm) in enumerate(ribs):
            armor_shell(nm+" • "+side,P(path),soft if i==2 else matte,
                        "spine_02",.012+(i*.001),.008,.004,.14)
        # Slim vertical flex seam at chest midline
        contour_piping("Sternum joint • "+side,
            P([(.018,1.447),(.017,1.405),(.019,1.358)]),
            seam,"spine_03",.026,.0022)

    # Clavicle/neck armor transition only; shoulder mass and arms untouched.
    armor_shell("Fitted sternum bridge",
        [(-.027,1.472),(.027,1.472),(.044,1.436),
         (.018,1.419),(-.018,1.419),(-.044,1.436)],
        bright,"spine_03",.031,.012,.004,.13)
    for sign,side in [(-1,"R"),(1,"L")]:
        contour_piping("Clavicle undercollar line • "+side,
            [(sign*.055,1.502),(sign*.154,1.502),(sign*.257,1.484)],
            seam,"spine_03",.012,.003)
    # Separate inset black crest and small gunmetal lip; both follow actual
    # armor curvature. Crest is integrated and does not cover the entire pec.
    # Polygon is deliberately tapered down the sternum like the game's insignia.
    bat=[
        (-.218,1.421),(-.160,1.440),(-.113,1.442),(-.080,1.453),
        (-.042,1.433),(-.014,1.449),(0,1.438),(.014,1.449),
        (.042,1.433),(.080,1.453),(.113,1.442),(.160,1.440),
        (.218,1.421),(.151,1.398),(.095,1.405),(.055,1.390),
        (0,1.367),(-.055,1.390),(-.095,1.405),(-.151,1.398)
    ]
    armor_shell("Recessed batsymbol silhouette",bat,crest,
                "spine_03",.048,.007,.002,.02)

    return {"plate_count":len(extras),"surface_probes":probes}

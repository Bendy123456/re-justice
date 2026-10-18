"""RE-Justice: seamless, bald anatomy-based hero head.

Uses the *existing humanoid head mesh* (not a generated helmet, sphere,
painted mask, or a new unrelated face). Applies the identical base-suit
material to all head/face polygons, keeps body rig and weights, and
adds a very small sculpt corrective as a non-destructive shape key.

Blender 3.6+ / 4.x, coordinates in the imported CC0 character space.
"""
import math
from mathutils import Vector

SCULPT = {
    "head_start_z": 1.565,
    "jaw_end_z": 1.735,
    "crown_start_z": 1.720,
    "crown_top_z": 1.820,
    "head_half_width": .150,
    "temple_taper": .028,
    "cheek_contour": .011,
    "crown_flatten": .004,
    "brow_projection": .0024,
}

def apply_bald_head(body, eyes, brows, suit, eyebrow_mat=None, eye_mat=None):
    """Use a full, unmasked anatomical face in exactly the body's fabric color."""
    # Same *material datablock* throughout, not merely a visually similar color.
    body.data.materials.clear()
    body.data.materials.append(suit)
    for face in body.data.polygons:
        face.material_index = 0

    # Original imported eye and brow anatomy is kept, but their colors are
    # subtle matte gray, not bright visor bars or glowing mask slits.
    for obj,material in ((eyes,eye_mat or suit),(brows,eyebrow_mat or suit)):
        if obj is None:
            continue
        obj.data.materials.clear()
        obj.data.materials.append(material)
        obj.hide_render = False

    mesh=body.data
    if mesh.shape_keys is None:
        body.shape_key_add(name="Base anatomy",from_mix=False)
    sculpture=body.shape_key_add(name="Bald natural head • jaw and crown",from_mix=False)
    count=0
    for vertex,sk in zip(mesh.vertices,sculpture.data):
        p=vertex.co
        x,y,z=p.x,p.y,p.z
        if z < SCULPT["head_start_z"] or abs(x)>SCULPT["head_half_width"]+.05:
            continue

        # The head deformation is spatially feathered into original neck.
        neckblend=max(0,min(1,(z-SCULPT["head_start_z"])/.085))
        headblend=min(1,neckblend)
        midjaw=math.exp(-((z-1.635)/.054)**2)
        crown=max(0,min(1,(z-SCULPT["crown_start_z"])/.09))
        temple=math.exp(-((z-1.694)/.050)**2)
        # Flatten an over-rounded silhouette very gently while retaining the
        # face and the important anatomical skull volume.
        dx=-math.copysign(
            abs(x)*(SCULPT["temple_taper"]*temple+SCULPT["cheek_contour"]*midjaw)*headblend,
            x
        )
        # More defined frontal brow from the REAL continuous base mesh.
        brow=math.exp(-((z-1.700)/.026)**2)*math.exp(-(x/.095)**2)
        dy=-(SCULPT["brow_projection"]*brow if y<0 else 0)
        dz=-SCULPT["crown_flatten"]*crown*crown
        sk.co=(x+dx,y+dy,z+dz)
        count+=1
    sculpture.value=1.0
    # Keeps all 65 rig bones and existing 2D game implementation unchanged.
    print("BALD_HEAD_QA",{
        "sculpted_verts":count,
        "shape_key":sculpture.name,
        "body_material":body.data.materials[0].name,
        "body_polygons":len(body.data.polygons),
        "mask_meshes_added":0,"hair_meshes_added":0
    })
    return sculpture

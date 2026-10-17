"""Sculpted angular Batman cowl on the anatomical CC0 head.

The original one-piece cowl replaces the old spherical lathe dome, detached
eye-bars and triangular ears. Body mesh, skeleton and gameplay stay untouched.
Dimensions are metres, +Z up and character front toward -Y.
"""
import bpy
import math
from math import pi, sin, cos, copysign, exp

COWL = {
    "ring_segments": 64,
    "shell_rows": 18,
    "top_z": 1.815,
    "ear_tip_z": 1.906,
    "ear_root_z": 1.752,
    "base_front_z": 1.703,
    "base_side_z": 1.616,
    "base_back_z": 1.530,
    "visor_gap": .004,
    "ear_segments": 16,
    "rim_width": .002,
}

def _mesh(name,verts,faces,mat,extras,bone="Head",smooth=True):
    data=bpy.data.meshes.new(name+" geom")
    data.from_pydata(verts,[],faces)
    data.update()
    obj=bpy.data.objects.new(name,data)
    bpy.context.scene.collection.objects.link(obj)
    data.materials.append(mat)
    for p in data.polygons:
        p.use_smooth=smooth
    extras.append((obj,bone))
    return obj

def _bend_plate(name,pts,mat,extras,thickness=.002):
    obj=_mesh(name,pts,[tuple(range(len(pts)))],mat,extras,smooth=False)
    thick=obj.modifiers.new("Inset visor thickness","SOLIDIFY")
    thick.thickness=thickness
    bevel=obj.modifiers.new("Visor edge softening","BEVEL")
    bevel.width=.0008;bevel.segments=2
    return obj

def build_sculpted_cowl(extras,materials):
    matte=materials["shell"]
    seam=materials["seam"]
    lens=materials["lens"]
    N=COWL["ring_segments"]
    V=COWL["shell_rows"]
    verts=[]
    faces=[]
    # Main shell: a *single fitted continuous surface*, not a sphere placed
    # above a mask. At the forehead, the shell's lower edge becomes the
    # angular brow; at temples it descends along cheekbones into the neck.
    # Superelliptic cross sections flatten the front and side skull planes.
    for i in range(V+1):
        t=i/V
        for j in range(N):
            angle=2*pi*j/N
            ax=sin(angle); ay=cos(angle)
            front=max(0,cos(angle))
            side=abs(sin(angle))
            rear=max(0,-cos(angle))
            # Lower edge of the *same mesh* smoothly cuts around the real jaw.
            # At front center the cowl meets the inset eye slit; on sides
            # it descends along temples; at back it runs down into the neck.
            bottom=(COWL["base_side_z"]
                  + (COWL["base_front_z"]-COWL["base_side_z"])*front**3
                  - (COWL["base_side_z"]-COWL["base_back_z"])*rear**2)
            # Shaped, subtly faceted cranium, flattening the bulbous cap:
            # a broader brow, narrow sides, low crown and gently drawn back.
            profile=t
            if t<.52:
                rx=.116 + .003*sin(pi*t/.52)
                ry=.123 + .001*sin(pi*t/.52)
            else:
                q=(t-.52)/.48
                rx=.117*(1-.53*q*q)
                ry=.124*(1-.54*q*q)
            if t>.90:
                q=(t-.90)/.10
                rx*=1-.70*q
                ry*=1-.70*q
            # Light superellipse for planar temples and less round profile.
            expn=.79 + .10*max(0,t-.63)
            x=rx*copysign(abs(ax)**expn,ax)
            y=.010 - ry*copysign(abs(ay)**expn,ay)
            # Forehead projects forward to integrate brow (not a detached bar);
            # cheekbone and temple planes are tucked rather than puffy.
            forehead=exp(-((t-.16)/.17)**2)*front**8
            y-=.0055*forehead
            x*=(1-.045*side**4*(1-t))
            # angular planar crown, side compression, subtle center ridge
            z=bottom+(COWL["top_z"]-bottom)*t
            z+=.002*front**3*(t>.7)
            verts.append((x,y,z))
    for i in range(V):
        for j in range(N):
            a=i*N+j;b=i*N+(j+1)%N
            faces.append((a,b,b+N,a+N))
    faces.append(tuple(reversed([V*N+j for j in range(N)])))
    shell=_mesh("COWL sculpt | angular forehead crown temples neck",verts,faces,matte,extras)
    shell.modifiers.new("Fine anti-faceting normals","WEIGHTED_NORMAL")
    # Ear roots begin *inside* the skull silhouette and grow out from the
    # same material. Tapered sculpted facets create a swept pointed silhouette
    # with no stick-on triangular ears.
    earverts=[];earfaces=[]
    K=COWL["ear_segments"]
    profile=[
        (1.738,.036,.020,.078,.013),
        (1.764,.036,.021,.080,.017),
        (1.795,.027,.017,.085,.025),
        (1.838,.017,.012,.091,.032),
        (1.882,.007,.006,.097,.041),
        (COWL["ear_tip_z"],.001,.001,.100,.045),
    ]
    for side in (-1,1):
        offset=len(earverts)
        for z,hw,hd,cx,cy in profile:
            for j in range(K):
                a=2*pi*j/K
                # Elliptical sections; flattened front-facing ear profile
                x=side*cx+hw*cos(a)
                y=cy+hd*sin(a)
                earverts.append((x,y,z))
        for row in range(len(profile)-1):
            for j in range(K):
                a=offset+row*K+j
                b=offset+row*K+(j+1)%K
                earfaces.append((a,b,b+K,a+K))
        earfaces.append(tuple(reversed(range(offset,offset+K))))
    ears=_mesh("COWL integral swept ear roots and fins",earverts,earfaces,matte,extras)
    bevel=ears.modifiers.new("Sculpted ear contour","BEVEL")
    bevel.width=.0018;bevel.segments=2
    # Eye slits follow the forehead cut, small enough to read as openings
    # into the cowl, with no projecting square sunglasses.
    for sign,side in ((-1,"R"),(1,"L")):
        # Dark recessed socket floats only 1-2 mm above the shell edge.
        eye=[
            (sign*.036,-.117,1.697),(sign*.083,-.107,1.704),
            (sign*.093,-.103,1.696),(sign*.079,-.111,1.685),
            (sign*.044,-.123,1.687)
        ]
        _bend_plate("COWL | narrow recessed eye socket "+side,eye,seam,extras,.002)
        lit=[
            (sign*.043,-.123,1.697),(sign*.080,-.109,1.700),
            (sign*.077,-.113,1.695),(sign*.049,-.126,1.690)
        ]
        _bend_plate("COWL | almond-shaped inset optic "+side,lit,lens,extras,.0015)
    # Small center nose crest *shares cowl color* and tapers into exposed nose.
    bridge=[
        (-.016,-.121,1.699),(.016,-.121,1.699),
        (.013,-.129,1.686),(0,-.138,1.675),
        (-.013,-.129,1.686)
    ]
    _bend_plate("COWL | sculpted nasal bridge",bridge,matte,extras,.002)
    print("COWL_GEOMETRY_QA",{
        "head_shell_vertices":len(verts),
        "head_ear_vertices":len(earverts),
        "crown_z":COWL["top_z"],
        "tip_z":COWL["ear_tip_z"],
        "integrated_brow":True
    })
    return {"shell":shell,"ears":ears}

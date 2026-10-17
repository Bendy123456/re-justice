import bpy,json,os,math
from mathutils import Vector
src='blender/resources/cc0_humanoid.glb'
bpy.ops.import_scene.gltf(filepath=src)
allobjs=list(bpy.context.scene.objects)
meshes=[o for o in allobjs if o.type=='MESH']
rigs=[o for o in allobjs if o.type=='ARMATURE']
mins=[min((o.matrix_world@Vector(c))[a] for o in meshes for c in o.bound_box) for a in range(3)]
maxs=[max((o.matrix_world@Vector(c))[a] for o in meshes for c in o.bound_box) for a in range(3)]
d={'meshes':[{'name':o.name,'verts':len(o.data.vertices),'dimensions':list(o.dimensions),'materials':[m.name for m in o.data.materials]} for o in meshes],
 'armatures':[{'name':o.name,'bones':[b.name for b in o.data.bones][:80]} for o in rigs],
 'min':mins,'max':maxs}
os.makedirs('generated/batman',exist_ok=True)
with open('generated/batman/CC0_BASE_INFO.json','w') as f:json.dump(d,f,indent=2)
print(json.dumps(d,indent=2)[:11000])

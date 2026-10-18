"""Inspect rig, geometry and shapes of the real female Quaternius CC0 base."""
import bpy, json, os
from mathutils import Vector
p=os.path.abspath("blender/resources/cc0_female.glb")
bpy.ops.import_scene.gltf(filepath=p)
obs=list(bpy.context.scene.objects)
meshes=[o for o in obs if o.type=="MESH"]
rigs=[o for o in obs if o.type=="ARMATURE"]
a={
 "meshes":[{
  "name":o.name,
  "vertices":len(o.data.vertices),
  "dimensions":[round(v,4) for v in o.dimensions],
  "modifiers":[m.type for m in o.modifiers],
  "parent":o.parent.name if o.parent else None,
  "keys":[k.name for k in o.data.shape_keys.key_blocks] if o.data.shape_keys else [],
  "materials":[m.name for m in o.data.materials],
  "bbox_min":[round(min((o.matrix_world@Vector(v)).xyz[i] for v in o.bound_box),4) for i in range(3)],
  "bbox_max":[round(max((o.matrix_world@Vector(v)).xyz[i] for v in o.bound_box),4) for i in range(3)],
  } for o in meshes],
 "rigs":[{"name":o.name,"bones":[b.name for b in o.data.bones]} for o in rigs]
}
os.makedirs("generated/female_v2",exist_ok=True)
with open("generated/female_v2/probe.json","w") as f:json.dump(a,f,indent=2)
print("REAL_FEMALE_PROBE",json.dumps(a)[:10000])

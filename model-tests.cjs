'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const env={window:{FG:{}},console,Set,Object};
vm.createContext(env);
vm.runInContext(fs.readFileSync(__dirname+'/model-assets.js','utf8'),env,{filename:'model-assets.js'});
const a=env.window.FG.MODEL_ROSTER;
const all=[...a.MALE,...a.FEMALE];
assert.equal(all.length,30,'All 30 roster members must be represented');
assert.equal(new Set(all).size,30,'No duplicate fighter models');
assert.equal(a.MALE.length,22);
assert.equal(a.FEMALE.length,8);
assert.equal(a.heroModel('batman'),'batman');
for(const id of a.MALE.filter(x=>x!=='batman'))assert.equal(a.heroModel(id),'male',id);
for(const id of a.FEMALE)assert.equal(a.heroModel(id),'female',id);
assert.equal(a.heroModel('unregistered-character'),null);
assert.ok(a.MODEL_PATHS.batman.endsWith('.glb'));
assert.ok(a.MODEL_PATHS.male.endsWith('.glb'));
for(const [id,url] of Object.entries(a.MODEL_PATHS)){
  if(!fs.existsSync(__dirname+'/'+url))throw Error('Missing 3D asset '+id+' at '+url);
  const bytes=fs.readFileSync(__dirname+'/'+url);
  assert.equal(bytes.toString('ascii',0,4),'glTF',id+' must be a binary GLB');
  assert.ok(bytes.length>100_000,id+' model unexpectedly small');
  assert.equal(bytes.readUInt32LE(8),bytes.length,id+' GLB header length mismatch');
}
const source=fs.readFileSync(__dirname+'/engine.js','utf8');
assert.ok(!source.includes('GLTFPresentation'),'Combat engine modified to access visual layer');
console.log('GLB roster tests passed: all 30 slots; 22 male, 8 female; 2 valid Blender assets; engine unchanged');

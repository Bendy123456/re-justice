/* RE-Justice: TRUE human motion rotation retargeter.
 * The previous "mocap" implementation converted hand and foot positions
 * into pole-constrained IK, bending elbows sideways (the chicken-wing bug).
 *
 * This uses CMU WORLD-SPACE rotation deltas relative to the capture T pose,
 * transplanted onto EACH imported avatar's own stored WORLD bind pose.
 * Parent inversion produces correct Three.js local bone quaternions even
 * though imported Blender rigs have unusual 90° local bone axes.
 *
 * Positional IK is permitted only for planted-foot correction; it never
 * aims the elbows, wrists or shoulders.
 */
import * as THREE from 'three';
import {MOTION_JOINTS,getCapturedRotations}
  from './arena-retarget-rotations.js?v=cmu-rot-quats-2';
import {sampleHumanMotion} from './arena-mocap-data.js?v=cmu-walk-run-1';

const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const smoother=n=>{n=clamp(n);return n*n*(3-2*n);};
const vec=()=>new THREE.Vector3();
const q=()=>new THREE.Quaternion();
const Qd=()=>new THREE.Quaternion();
const Y=new THREE.Vector3(0,1,0);
const sizes={};
function blendFootGround(view,sourceHeights,rootQ,actorYaw,strength,solveLimb){
 const footState=view.captureContacts||(view.captureContacts={l:null,r:null});
 const out={l:false,r:false};
 for(const side of ['l','r']){
   const isLeft=side==='l',value=sourceHeights[isLeft?25:26];
   const contact=Number.isFinite(value)&&value<.030&&strength>.68;
   const hip=view.bones.get('thigh_'+side),knee=view.bones.get('calf_'+side),
     ankle=view.bones.get('foot_'+side);
   if(!hip||!knee||!ankle){footState[side]=null;continue;}
   if(!contact){footState[side]=null;continue;}
   const current=ankle.getWorldPosition(vec());
   const soleY=view.footSoleHeights?.[side]??.084;
   if(!footState[side]){
     footState[side]={point:current.clone().setY(soleY+.004),heading:actorYaw};
   }
   const anchor=footState[side];
   const desired=anchor.point.clone();
   const hipWorld=hip.getWorldPosition(vec());
   const upper=hipWorld.distanceTo(knee.getWorldPosition(vec()));
   const lower=knee.getWorldPosition(vec()).distanceTo(current);
   const maxReach=Math.max(.2,upper+lower-.014);
   const horizontal=Math.hypot(desired.x-hipWorld.x,desired.z-hipWorld.z);
   const vertical=desired.y-hipWorld.y;
   const permitted=Math.sqrt(Math.max(.0001,maxReach*maxReach-vertical*vertical));
   if(horizontal>permitted&&horizontal>.001){
     const ratio=permitted/horizontal;
     desired.x=hipWorld.x+(desired.x-hipWorld.x)*ratio;
     desired.z=hipWorld.z+(desired.z-hipWorld.z)*ratio;
     anchor.point.x=desired.x;anchor.point.z=desired.z;
   }
   // Small position corrections only. If the source foot is moving too
   // far relative to the world, never force a wildly outstretched knee.
   const correction=desired.sub(current);
   const distance=correction.length();
   if(distance>.012&&solveLimb){
     const limited=current.clone().addScaledVector(
       correction,Math.min(1,.18/distance));
     limited.y=Math.max(soleY+.004,limited.y);
     const target=limited.sub(hipWorld)
       .applyQuaternion(rootQ.clone().invert()).toArray();
     const sign=view.legSides?.[side]??(isLeft?1:-1);
     const kneeWorld=knee.getWorldPosition(vec()).sub(hipWorld);
     const pole=kneeWorld.applyQuaternion(rootQ.clone().invert());
     // Preserve the captured knee bend direction (NOT a generic +Z pole).
     const poleValues=[pole.x+sign*.02,pole.y,pole.z+.03];
     solveLimb(view,'thigh_'+side,'calf_'+side,'foot_'+side,
       target,poleValues,rootQ);
   }
   // On contact, level the SHOE, not the whole leg. This only corrects
   // orientation drift in the skinned foot mesh.
   const rest=view.footRestWorldQuats?.[side];
   if(rest&&ankle.parent){
     const heading=q().setFromAxisAngle(Y,anchor.heading);
     const desiredWorld=heading.multiply(rest);
     const now=ankle.getWorldQuaternion(q());
     now.slerp(desiredWorld,.54*strength);
     const parent=ankle.parent.getWorldQuaternion(q());
     ankle.quaternion.copy(parent.invert().multiply(now)).normalize();
     ankle.updateWorldMatrix(false,true);
   }
   out[side]=true;
 }
 return out;
}

export function retargetCapturedHuman(view,{
  weight=0,phase=0,runMix=0,rootQ,actorYaw=0,solveLimb=null
}={}){
  const blend=smoother(weight);
  if(blend<.0001){
    view.captureContacts=null;
    return {active:false,weight:0,joints:0};
  }
  if(!view.restWorldQuats?.size){
    // No bind-pose cache: skip the retarget rather than invent rotations.
    return {active:false,weight:0,joints:0,error:'missing bind-world calibration'};
  }
  const captured=getCapturedRotations(phase,runMix);
  const src=sampleHumanMotion(phase,runMix);
  const pelvis=view.bones.get('pelvis')||view.bones.get('hips');
  if(pelvis){
    const original=view.restPositions.get(pelvis.name.toLowerCase());
    const desired=original?original.clone():pelvis.position.clone();
    // Low-frequency human hip rise/sink; never apply source root travel
    // or change gameplay move speed.
    desired.y-=.091+clamp(src[0]*.58,-.031,.031);
    pelvis.position.lerp(desired,blend);
  }
  view.root.updateWorldMatrix(true,true);
  let applied=0;
  // Ordered PARENT FIRST. Each world delta is re-expressed in actual
  // target bone local axes using its current, already-updated parent.
  for(let i=0;i<MOTION_JOINTS.length;i++){
    const name=MOTION_JOINTS[i],bone=view.bones.get(name),
      rest=view.restWorldQuats.get(name);
    if(!bone||!rest||!bone.parent)continue;
    const arr=captured[i];
    if(!arr||arr.some(v=>!Number.isFinite(v)))continue;
    const change=q().fromArray(arr);
    // Entire character is already oriented via rootQ; rotate source
    // world delta along with that root, then apply it to the exported
    // target rest-world quaternion.
    const desiredWorld=rootQ.clone().multiply(change).multiply(rest);
    const parentWorld=bone.parent.getWorldQuaternion(q());
    const desiredLocal=parentWorld.invert().multiply(desiredWorld).normalize();
    bone.quaternion.slerp(desiredLocal,blend).normalize();
    bone.updateWorldMatrix(false,true);
    applied++;
  }
  view.root.updateWorldMatrix(true,true);
  const ground=blendFootGround(view,src,rootQ,actorYaw,blend,solveLimb);
  return {
    active:true,weight:blend,joints:applied,
    capture:'CMU world delta -> avatar bind axes',
    plantedLeft:ground.l,plantedRight:ground.r
  };
}

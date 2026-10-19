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
import {MOTION_JOINTS,getHeroRunRotations}
  from './arena-retarget-rotations.js?v=expressive-sprint-5';
import {sampleHumanMotion} from './arena-mocap-data.js?v=heel-synced-2';
import {stepGroundDrive,resetGroundDrive}
  from './arena-ground-contact.js?v=push-off-2';
import {capturedArmDrive}
  from './arena-running-arms.js?v=forward-drive-1';

const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const smoother=n=>{n=clamp(n);return n*n*(3-2*n);};
const vec=()=>new THREE.Vector3();
const q=()=>new THREE.Quaternion();
const Y=new THREE.Vector3(0,1,0);
// Measured heading change adds tiny ribcage/neck follow-through during turns.
// Bones are rebuilt each frame, avoiding accumulated twist.
function turnFollowThrough(view,strength){
 const a=view.actor;
 if(view.turnFollowTick!==a.animClock){
   const delta=Math.atan2(Math.sin(a.visualYaw-a.prevVisualYaw),
     Math.cos(a.visualYaw-a.prevVisualYaw));
   const target=clamp(-delta*.70,-.125,.125);
   view.turnFollowValue=(view.turnFollowValue||0)*.78+target*.22;
   view.turnFollowTick=a.animClock;
 }
 const turn=(view.turnFollowValue||0)*strength;
 if(Math.abs(turn)<.0002)return 0;
 for(const [name,fraction] of [
   ['spine_02',.44],['spine_03',.62],['neck_01',-.22]
 ]){
   const bone=view.bones.get(name);
   if(!bone?.parent)continue;
   const delta=new THREE.Quaternion().setFromAxisAngle(Y,turn*fraction);
   const parent=bone.parent.getWorldQuaternion(new THREE.Quaternion());
   bone.quaternion.premultiply(
     parent.clone().invert().multiply(delta).multiply(parent)).normalize();
   bone.updateWorldMatrix(false,true);
 }
 return turn;
}
// Retarget every arm from mocap first. AFTER that, move the WHOLE
// upper-arm chain forward from its shoulder (never drag a wrist target
// and force a sideways elbow). The chest and shoulder blade contribute
// a small counter-motion so it reads as a run, not a robot arm.
function followCapturedArmDrive(view,samples,rootQ,runMix,strength){
 const motion=capturedArmDrive(samples,runMix,strength);
 if(motion.active<.0001)return motion;
 const xAxis=new THREE.Vector3(1,0,0).applyQuaternion(rootQ);
 const yAxis=new THREE.Vector3(0,1,0).applyQuaternion(rootQ);
 function applyWorldTurn(name,axis,angle){
   if(Math.abs(angle)<.00001)return;
   const bone=view.bones.get(name);
   if(!bone?.parent)return;
   const parentQ=bone.parent.getWorldQuaternion(q());
   const worldDelta=q().setFromAxisAngle(axis,angle);
   const localDelta=parentQ.clone().invert().multiply(worldDelta)
     .multiply(parentQ).normalize();
   bone.quaternion.premultiply(localDelta).normalize();
   bone.updateWorldMatrix(false,true);
 }
 // Gentle alternating ribcage rotation, neck/head remain stabilized.
 applyWorldTurn('spine_03',yAxis,motion.chestYaw);
 for(const side of ['l','r']){
   const arm=motion[side==='l'?'left':'right'];
   const collar=view.bones.get('clavicle_'+side);
   if(collar?.parent&&arm.shoulderReach>.00001){
     // Scapular glide is a LOCAL joint translation corresponding to the
     // avatar's root-forward direction; rotation and parent transforms
     // make it work consistently for male/female and facing any yaw.
     const parentWorld=collar.parent.getWorldQuaternion(q());
     const forward=new THREE.Vector3(0,0,1).applyQuaternion(rootQ)
       .multiplyScalar(arm.shoulderReach);
     collar.position.add(forward.applyQuaternion(parentWorld.invert()));
     collar.updateWorldMatrix(false,true);
   }
   applyWorldTurn('clavicle_'+side,xAxis,arm.collarAngle);
   applyWorldTurn('upperarm_'+side,xAxis,arm.shoulderAngle);
 }
 view.root.updateWorldMatrix(true,true);
 return motion;
}
function blendFootGround(view,drive,rootQ,actorYaw,strength,runMix,solveLimb){
 const footState=view.captureContacts||(view.captureContacts={l:null,r:null});
 const out={l:false,r:false};
 for(const side of ['l','r']){
   const isLeft=side==='l';
   // Same captured heel contact drives the body's weight AND foot locking.
   // Never let one part of the gait say "landed" while another says "flying".
   const ground=drive.feet[side],contact=ground.contact;
   const hip=view.bones.get('thigh_'+side),knee=view.bones.get('calf_'+side),
     ankle=view.bones.get('foot_'+side);
   if(!hip||!knee||!ankle){footState[side]=null;continue;}
   if(!contact){footState[side]=null;continue;}
   const current=ankle.getWorldPosition(vec());
   const soleY=view.footSoleHeights?.[side]??.084;
   if(!footState[side]){
     footState[side]={
       point:current.clone().setY(soleY+.004),
       heading:actorYaw,fade:0,lastTick:-1
     };
   }
   const anchor=footState[side];
   // Catch a planted foot quickly: with the actor moving 0.12m per
   // physics tick, a slow 4-frame anchor fade causes visible skating.
   if(anchor.lastTick!==view.actor.animClock){
     anchor.fade=Math.min(1,anchor.fade+.68);
     anchor.lastTick=view.actor.animClock;
   }
   const toePush=ground.toeOff*ground.push*strength;
   const desired=anchor.point.clone();
   // Roll up onto the ball of the planted foot just BEFORE it leaves
   // the ground. Slight heel rise, while the toes remain near the floor.
   desired.y+=toePush*.019;
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
       correction,Math.min(anchor.fade,.15/distance));
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
     // Sole is flat during landing/load; release toward the mocap ankle
     // rotation while rising onto the toes for push-off.
     now.slerp(desiredWorld,clamp((.73-.49*toePush)*strength,0,1));
     const parent=ankle.parent.getWorldQuaternion(q());
     ankle.quaternion.copy(parent.invert().multiply(now)).normalize();
     ankle.updateWorldMatrix(false,true);
   }
   // Forefoot bends as the heel releases. Do not aim wrists or disturb the
   // capture-driven leg; only the independent Blender ball/toe joint rolls.
   const ball=view.bones.get('ball_'+side);
   if(ball?.parent&&toePush>.004){
     const footAxis=new THREE.Vector3(1,0,0).applyQuaternion(rootQ);
     const delta=q().setFromAxisAngle(footAxis,
       toePush*(.15+.055*runMix));
     const parentQ=ball.parent.getWorldQuaternion(q());
     ball.quaternion.premultiply(
       parentQ.clone().invert().multiply(delta).multiply(parentQ)).normalize();
     ball.updateWorldMatrix(false,true);
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
    view.footDrive=resetGroundDrive(view.footDrive);
    view.turnFollowValue=0;
    return {active:false,weight:0,joints:0};
  }
  if(!view.restWorldQuats?.size){
    // No bind-pose cache: skip the retarget rather than invent rotations.
    return {active:false,weight:0,joints:0,error:'missing bind-world calibration'};
  }
  // Stronger RUN deltas are measured around the capture's average running
  // pose, maintaining bent elbows, balanced knees and natural shoulder arcs.
  const captured=getHeroRunRotations(phase,runMix);
  const src=sampleHumanMotion(phase,runMix);
  const drive=stepGroundDrive(view.footDrive,{
    l:src[25],r:src[26]
  },runMix,view.actor.animClock,blend);
  view.footDrive=drive.state;
  const pelvis=view.bones.get('pelvis')||view.bones.get('hips');
  if(pelvis){
    const original=view.restPositions.get(pelvis.name.toLowerCase());
    const desired=original?original.clone():pelvis.position.clone();
    // Low-frequency human hip rise/sink; never apply source root travel
    // or change gameplay move speed.
    desired.y-=.091+clamp(src[0]*.58,-.031,.031);
    desired.y+=drive.pelvisY;
    desired.x+=drive.pelvisX;
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
  const turnLag=turnFollowThrough(view,blend);
  const armDrive=followCapturedArmDrive(view,src,rootQ,runMix,blend);
  const ground=blendFootGround(view,drive,rootQ,actorYaw,blend,
    runMix,solveLimb);
  return {
    active:true,weight:blend,joints:applied,
    capture:'CMU hero sprint -> rig rotations',
    expressiveRun:runMix,
    plantedLeft:ground.l,plantedRight:ground.r,turnLag,
    groundCompression:drive.impact,groundPush:drive.propulsion,
    groundPelvisY:drive.pelvisY,groundPelvisX:drive.pelvisX,
    leftToeOff:drive.feet.l.toeOff,rightToeOff:drive.feet.r.toeOff,
    groundSupportFeet:drive.supportCount,
    leftArmFrontReach:armDrive.left?.forward||0,
    rightArmFrontReach:armDrive.right?.forward||0,
    leftArmExtraSwing:armDrive.left?.shoulderAngle||0,
    rightArmExtraSwing:armDrive.right?.shoulderAngle||0,
    leftScapularReach:armDrive.left?.shoulderReach||0,
    rightScapularReach:armDrive.right?.shoulderReach||0,
    armChestCounterYaw:armDrive.chestYaw||0
  };
}

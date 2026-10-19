/* RE-Justice · hand-authored boxer/low-guard neutral (reference stance).
 * An isolated visual pose, not layered on top of older idle experiments.
 * A neutral-to-stance crossfade interpolates the rig between its current
 * locomotion pose and one cohesive full-body animation, leaving gameplay,
 * inputs, attacks, collision and hit windows unchanged.
 *
 * Design: planted wide fighting base with both knees flexed, rear hip loaded,
 * front fist protecting the jaw, other CLOSED fist farther forward, chin down.
 * Guard targets and foot placements are sculpted independently in real rig space.
 * Calibrated to REAL GLB leg lengths and world-space floor contacts.
 */
import * as THREE from 'three';
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smoother=x=>{x=clamp(x);return x*x*(3-2*x);};
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const X=V(1,0,0),Y=V(0,1,0),Z=V(0,0,1);
const targetBones=[
  'pelvis','hips','spine_01','spine_02','spine_03',
  'neck_01','head','clavicle_l','clavicle_r',
  'upperarm_l','lowerarm_l','hand_l','upperarm_r','lowerarm_r','hand_r',
  'thigh_l','calf_l','foot_l','thigh_r','calf_r','foot_r'
];
function bone(view,name){return view.bones.get(name);}
function rotate(view,name,axis,angle,rootQ){
  const b=bone(view,name);
  if(!b||Math.abs(angle)<.00001)return;
  const worldAxis=axis.clone().applyQuaternion(rootQ);
  const change=new THREE.Quaternion().setFromAxisAngle(worldAxis,angle);
  const q=b.parent.getWorldQuaternion(new THREE.Quaternion());
  b.quaternion.premultiply(q.clone().invert().multiply(change).multiply(q)).normalize();
  b.updateWorldMatrix(false,true);
}
function aim(b,child,worldDirection){
  if(!b||!child||worldDirection.lengthSq()<1e-10)return;
  const start=b.getWorldPosition(V());
  const current=child.getWorldPosition(V()).sub(start);
  if(current.lengthSq()<1e-10)return;
  const rot=new THREE.Quaternion().setFromUnitVectors(
    current.normalize(),worldDirection.clone().normalize());
  const parent=b.parent.getWorldQuaternion(new THREE.Quaternion());
  b.quaternion.premultiply(parent.clone().invert().multiply(rot).multiply(parent)).normalize();
  b.updateWorldMatrix(false,true);
}
function solveTwoBone(view,upperName,lowerName,endName,goalWorld,poleWorld){
  const upper=bone(view,upperName),lower=bone(view,lowerName),end=bone(view,endName);
  if(!upper||!lower||!end)return false;
  const base=upper.getWorldPosition(V()),mid=lower.getWorldPosition(V());
  const endPos=end.getWorldPosition(V());
  const a=base.distanceTo(mid),b=mid.distanceTo(endPos);
  if(a<.001||b<.001)return false;
  const delta=goalWorld.clone().sub(base);
  const actualDist=delta.length();
  if(actualDist<.001)return false;
  const d=clamp(actualDist,Math.abs(a-b)+.002,a+b-.003);
  const axis=delta.multiplyScalar(1/actualDist);
  const along=(a*a-b*b+d*d)/(2*d);
  const triangle=Math.sqrt(Math.max(0,a*a-along*along));
  const bend=poleWorld.clone().addScaledVector(axis,-poleWorld.dot(axis));
  if(bend.lengthSq()<.00001){
    bend.copy(X).addScaledVector(axis,-axis.x);
    if(bend.lengthSq()<.00001)bend.copy(Z).addScaledVector(axis,-axis.z);
  }
  bend.normalize();
  const middleGoal=base.clone().addScaledVector(axis,along).addScaledVector(bend,triangle);
  aim(upper,lower,middleGoal.sub(base));
  aim(lower,end,goalWorld.clone().sub(lower.getWorldPosition(V())));
  return true;
}
function flatFoot(view,side,worldYaw){
  const foot=bone(view,'foot_'+side),rest=view.footRestWorldQuats?.[side];
  if(!foot||!rest||!foot.parent)return;
  const q=new THREE.Quaternion().setFromAxisAngle(Y,worldYaw).multiply(rest);
  const parent=foot.parent.getWorldQuaternion(new THREE.Quaternion());
  foot.quaternion.copy(parent.invert().multiply(q)).normalize();
  foot.updateWorldMatrix(false,true);
}
function worldAtRoot(root,rootQ,point){
  return V(...point).applyQuaternion(rootQ).add(root.position);
}
// Reference-based, hand-authored combat idle (front/rear asymmetry).
// Distances are proportioned to each loaded GLB's own leg length, while
// fist positions use the head joint so the guard scales with each fighter.
// Both ankles are solved to the real arena ground; no visual root translation.
const POSE=Object.freeze({
  // Crouched boxer's stance: hips genuinely DOWN so both knees articulate,
  // rather than stretching two nearly straight legs toward distant ankles.
  hipHeightAboveSole:.595,pelvisSide:.100,pelvisBack:.015,
  pelvisYaw:-.067,pelvisPitch:.018,pelvisRoll:-.010,
  chestCurl:[.056,.068,.021],
  chestYaw:[-.010,-.015,-.011],
  chestRoll:[-.006,.010,-.006],
  headCounterPitch:-.083,headCounterYaw:.095,
  // More than a meter of foot separation on an adult male GLB: width is
  // emphasized over depth to maintain solvability in a deep squat.
  leadX:.610,leadZ:.185,trailingX:.585,trailingZ:-.115,
  leadFootYaw:.075,rearFootYaw:-.165,
  // Cheek-high fist targets are REACHABLE from both shoulders. Previous
  // rearGuard forward=.488 made an entire arm lock out and point at ground.
  leadGuard:[.140,-.092,.195],
  rearGuard:[.160,-.108,.215],
  leadPole:[.57,-.86,.31],rearPole:[.62,-.85,.35]
});
export function applyShinobiIdle(view,{
  weight=0,rootQ,actorYaw=0,breath=0,groundY=0
}={}){
  const w=smoother(weight);
  if(w<.0001)return {active:false,weight:0};
  const root=view.root,ids=targetBones.filter(name=>view.bones.has(name));
  const prior=new Map(ids.map(name=>[name,view.bones.get(name).quaternion.clone()]));
  // The real Quaternius skeleton has a PELVIS child of the root bone;
  // 'hips' doesn't exist in several loaded GLBs. Both thighs and spine
  // inherit from pelvis, so this is the shared anatomical body control.
  const pelvis=bone(view,'pelvis')||bone(view,'hips');
  const priorPos=pelvis?.position.clone();
  // Construct a WHOLE pose from the exported bind rig, then blend with
  // the current walk/dash pose. No historical idle tweaks can accumulate.
  for(const name of ids){
    const b=bone(view,name);
    if(view.rests.has(name))b.quaternion.copy(view.rests.get(name));
    if(view.restPositions?.has(name))b.position.copy(view.restPositions.get(name));
  }
  root.updateWorldMatrix(true,true);
  const lThigh=bone(view,'thigh_l'),lKnee=bone(view,'calf_l'),lAnkle=bone(view,'foot_l');
  const rThigh=bone(view,'thigh_r'),rKnee=bone(view,'calf_r'),rAnkle=bone(view,'foot_r');
  const legLen= lThigh&&lKnee&&lAnkle?
    lThigh.getWorldPosition(V()).distanceTo(lKnee.getWorldPosition(V()))+
    lKnee.getWorldPosition(V()).distanceTo(lAnkle.getWorldPosition(V())):.86;
  // World Y of the ankle/sole comes from skinned-mesh calibration; the
  // centre of gravity settles toward the BENT trailing/right leg.
  const rightSign=view.legSides?.r??-1;
  if(pelvis){
    pelvis.position.x+=POSE.pelvisSide*legLen*rightSign;
    pelvis.position.z-=POSE.pelvisBack*legLen;
    root.updateWorldMatrix(true,true);
    // WORLD-HEIGHT calibration: the old incremental "drop" was not enough
    // because the rig pelvis starts unusually high above the foot bones.
    // Match a proportion of each model's measured leg length to achieve
    // genuine knee flexion on male, female and armored rigs alike.
    const leftHipY=lThigh?.getWorldPosition(V()).y;
    const rightHipY=rThigh?.getWorldPosition(V()).y;
    const hipWorldY=(Number.isFinite(leftHipY)&&Number.isFinite(rightHipY))?
      .5*(leftHipY+rightHipY):(leftHipY??rightHipY??0);
    const sole=Math.max(view.footSoleHeights?.l??.07,
      view.footSoleHeights?.r??.07);
    const desiredHipY=groundY+sole+
      (POSE.hipHeightAboveSole+.002*breath)*legLen;
    const worldShift=V(0,desiredHipY-hipWorldY,0);
    const parentQ=pelvis.parent.getWorldQuaternion(new THREE.Quaternion());
    pelvis.position.add(worldShift.applyQuaternion(parentQ.invert()));
    root.updateWorldMatrix(true,true);
    rotate(view,'pelvis',Y,POSE.pelvisYaw,rootQ);
    rotate(view,'pelvis',X,POSE.pelvisPitch,rootQ);
    rotate(view,'pelvis',Z,POSE.pelvisRoll,rootQ);
  }
  // Pelvis anchors the planted stance and the chest pitches slightly toward
  // the opponent. Neck/head counter-bend to keep the guard at eye level.
  for(let i=0;i<3;i++){
    const name='spine_0'+(i+1);
    rotate(view,name,X,POSE.chestCurl[i]+(i===1?.006*breath:0),rootQ);
    rotate(view,name,Y,POSE.chestYaw[i],rootQ);
    rotate(view,name,Z,POSE.chestRoll[i],rootQ);
  }
  rotate(view,'neck_01',X,-.032,rootQ);
  rotate(view,'head',X,POSE.headCounterPitch-.006*breath,rootQ);
  rotate(view,'head',Y,POSE.headCounterYaw,rootQ);
  // The shoulder girdle protracts, but hands are placed from the HEAD,
  // rather than blindly raising both fists beside the ears.
  // Shoulders roll forward/up into a visibly combative guard.
  rotate(view,'clavicle_l',X,-.052,rootQ);
  rotate(view,'clavicle_r',X,-.039,rootQ);
  rotate(view,'clavicle_l',Y,-.028,rootQ);
  rotate(view,'clavicle_r',Y,.031,rootQ);
  rotate(view,'clavicle_l',Z,-.035,rootQ);
  rotate(view,'clavicle_r',Z,.040,rootQ);
  root.updateWorldMatrix(true,true);
  const head=bone(view,'head');
  if(head){
    const h=head.getWorldPosition(V());
    for(const side of ['l','r']){
      const handSign=view.armSides?.[side]??(side==='l'?1:-1);
      const norm=side==='l'?POSE.leadGuard:POSE.rearGuard;
      const local=[handSign*(norm[0]+.003*breath),
        norm[1]+.006*breath,norm[2]+.007*breath];
      const goal=h.clone().add(V(...local).applyQuaternion(rootQ));
      const poleVec=side==='l'?POSE.leadPole:POSE.rearPole;
      const pole=V(handSign*poleVec[0],poleVec[1],poleVec[2])
        .applyQuaternion(rootQ);
      solveTwoBone(view,'upperarm_'+side,'lowerarm_'+side,'hand_'+side,goal,pole);
      // The fists have opposed wrist rolls, not dangling straight palms.
      // Their skinned fingers are closed separately by animateFingers().
      rotate(view,'hand_'+side,X,side==='l'?.092:.078,rootQ);
      rotate(view,'hand_'+side,Z,handSign*(side==='l'?.034:-.040),rootQ);
    }
  }
  root.updateWorldMatrix(true,true);
  // Floor contact is absolute WORLD-space, never hip-relative fake feet.
  // Make the silhouette broad without making the lead leg unreachable.
  const floorErrors={};
  for(const side of ['l','r']){
    const sign=view.legSides?.[side]??(side==='l'?1:-1);
    const x=(side==='l'?POSE.leadX:POSE.trailingX)*legLen*sign;
    const z=(side==='l'?POSE.leadZ:POSE.trailingZ)*legLen;
    const ankleGoal=worldAtRoot(root,rootQ,[x,0,z]);
    ankleGoal.y=groundY+(view.footSoleHeights?.[side]??.065)+.005;
    const hip=bone(view,'thigh_'+side),knee=bone(view,'calf_'+side),foot=bone(view,'foot_'+side);
    if(!hip||!knee||!foot)continue;
    // Keep the target physically reachable: lowering/widening beyond leg
    // length was the primary cause of previous visibly levitating shoes.
    const hipWorld=hip.getWorldPosition(V());
    const upper=hipWorld.distanceTo(knee.getWorldPosition(V()));
    const lower=knee.getWorldPosition(V()).distanceTo(foot.getWorldPosition(V()));
    const allowed=upper+lower-.007;
    const delta=ankleGoal.clone().sub(hipWorld);
    if(delta.length()>allowed){
      // Horizontal reach is shortened first; NEVER shift the sole upward.
      const vertical=ankleGoal.y-hipWorld.y;
      const horiz=Math.hypot(delta.x,delta.z);
      const maxHoriz=Math.sqrt(Math.max(.0001,allowed*allowed-vertical*vertical));
      if(horiz>maxHoriz&&horiz>.0001){
        ankleGoal.x=hipWorld.x+delta.x*maxHoriz/horiz;
        ankleGoal.z=hipWorld.z+delta.z*maxHoriz/horiz;
      }
    }
    // Higher forward knee-pole on the REAR side deepens its visible
    // compression without requiring the ankle to leave the arena floor.
    const pole=V(sign*(side==='l'?.19:.23),-.17,
      side==='l'?1.09:1.19).applyQuaternion(rootQ);
    solveTwoBone(view,'thigh_'+side,'calf_'+side,'foot_'+side,ankleGoal,pole);
    flatFoot(view,side,actorYaw+
      (side==='l'?POSE.leadFootYaw:POSE.rearFootYaw));
    floorErrors[side]=foot.getWorldPosition(V()).y-ankleGoal.y;
  }
  root.updateWorldMatrix(true,true);
  // Compose the final pose from an authentic authored target and the
  // preceding pose; transition uses Slerp so no elbow/knee snapping.
  for(const name of ids){
    const b=bone(view,name),base=prior.get(name);
    if(base){
      const authored=b.quaternion.clone();
      b.quaternion.copy(base).slerp(authored,w).normalize();
    }
  }
  if(pelvis&&priorPos){
    const authoredPosition=pelvis.position.clone();
    pelvis.position.copy(priorPos).lerp(authoredPosition,w);
  }
  root.updateWorldMatrix(true,true);
  // The slerp between two valid poses can itself arc a toe/ankle below
  // the surface. Keep an exact floor constraint throughout the 0.2-second
  // stop/start crossfade rather than checking contact only at weight=1.
  for(const side of ['l','r']){
    const foot=bone(view,'foot_'+side);
    if(!foot)continue;
    const footPos=foot.getWorldPosition(V());
    const floor=groundY+(view.footSoleHeights?.[side]??.065)+.005;
    if(footPos.y<floor-.0008){
      const sign=view.legSides?.[side]??(side==='l'?1:-1);
      const corrected=footPos.clone();
      corrected.y=floor;
      solveTwoBone(view,'thigh_'+side,'calf_'+side,'foot_'+side,
        corrected,V(sign*.16,-.12,1).applyQuaternion(rootQ));
    }
    // Blend toe yaw and keep the sole level while settling into stance.
    if(w>.15) {
      const qNow=foot.getWorldQuaternion(new THREE.Quaternion());
      const yaw=actorYaw+
        (side==='l'?POSE.leadFootYaw:POSE.rearFootYaw)*w;
      flatFoot(view,side,yaw);
      if(w<1){
        const flatLocal=foot.quaternion.clone();
        const parent=foot.parent.getWorldQuaternion(new THREE.Quaternion());
        const priorLocal=parent.clone().invert().multiply(qNow);
        foot.quaternion.copy(priorLocal).slerp(flatLocal,w).normalize();
      }
    }
  }
  root.updateWorldMatrix(true,true);
  return {active:true,weight:w,floorErrors,
    stance:'deep-reference-boxing-guard',closedGuard:true,
    leadExtension:'left',rearCompression:'right'};
}

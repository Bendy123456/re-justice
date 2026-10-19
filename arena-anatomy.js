/* RE-Justice anatomical secondary rig — Blender-authored joints.
 * This layer enhances existing SKINNED geometry: fingers, shoulder girdle,
 * forearm roll and the actual ball-of-foot/toe hinge. No fake limb sprites.
 * Runs after the key pose, only rotates existing joints and does not
 * affect collision, fighter speed, hits, or deterministic combat simulation.
 */
import * as THREE from 'three';

const X=new THREE.Vector3(1,0,0);
const Y=new THREE.Vector3(0,1,0);
const Z=new THREE.Vector3(0,0,1);
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
const FINGERS=[
  {name:'index',spread:.16,curl:.29,tip:.13},
  {name:'middle',spread:.048,curl:.24,tip:.12},
  {name:'ring',spread:-.083,curl:.34,tip:.17},
  {name:'pinky',spread:-.21,curl:.40,tip:.18}
];
function rotateWorld(bone,axis,angle){
  if(!bone||Math.abs(angle)<.00001)return;
  const worldDelta=new THREE.Quaternion().setFromAxisAngle(axis,angle);
  const parentWorld=bone.parent?.getWorldQuaternion(new THREE.Quaternion())||
    new THREE.Quaternion();
  const delta=parentWorld.clone().invert().multiply(worldDelta).multiply(parentWorld);
  bone.quaternion.premultiply(delta).normalize();
  bone.updateWorldMatrix(false,true);
}
// Axes are relative to the HAND frame (not to each finger's differently
// mirrored bone frame). That keeps every finger curling toward its own palm.
function handRotate(view,name,axis,angle,handQ){
  const bone=view.bones.get(name);
  if(!bone)return;
  rotateWorld(bone,axis.clone().applyQuaternion(handQ),angle);
}
// A clavicle is an independent bone between spine and upper arm. Real
// shoulder motion should lead the arm, with chest counter-rotation and
// elevation. All values are deliberately smaller than strike rotations.
export function animateShoulders(view,{rootQ,walkAmount=0,runMix=0,
    idlePose=0,strideClock=0,attack=null,blocked=false,airborne=false,
    dashing=false,breath=0}={}){
  let shoulderMotion=0;
  for(const side of ['l','r']){
    const s=side==='l'?-1:1,phase=(side==='l'?-1:1)*Math.sin(strideClock);
    const bone=view.bones.get('clavicle_'+side);
    if(!bone)continue;
    const attackUp=attack?(attack.wind*.075+attack.reach*.046):0;
    const walkLift=walkAmount*(.038+runMix*.030)*Math.max(0,phase);
    const guardLift=idlePose*(side==='l'?.055:.044);
    const lift=walkLift+guardLift+attackUp+(blocked?.08:0)+(airborne?.055:0);
    const backSwing=walkAmount*phase*(.060+runMix*.023);
    // Bilateral clavicle elevation + forward protraction.
    rotateWorld(bone,X.clone().applyQuaternion(rootQ),
      -.018*idlePose+lift*.72+backSwing*.38);
    rotateWorld(bone,Y.clone().applyQuaternion(rootQ),
      -s*(.025*idlePose+walkAmount*.020*phase+attackUp*.15));
    rotateWorld(bone,Z.clone().applyQuaternion(rootQ),
      s*(.035*idlePose+.68*lift)+.017*walkAmount*phase);
    shoulderMotion=Math.max(shoulderMotion,Math.abs(lift));
  }
  return shoulderMotion;
}
// FIVE independent fingers per hand. Blender models contain three deforming
// phalanges plus a weighted leaf tip for each finger; the original code only
// rotated everything minutely, leaving the silhouettes stuck together.
export function animateFingers(view,{idlePose=0,walkAmount=0,runMix=0,
    strideClock=0,breath=0,attack=null,blocked=false,hit=false,
    airborne=false,manualGrip=0}={}){
  // A real closed-fist resting guard uses each finger's skinned knuckles,
  // never a glove-shaped substitute. Attacks/block/jumps still take priority.
  const actionGrip=attack?clamp(attack.wind*.65+attack.reach*1.22+.30):
    blocked?.82:hit?.04:airborne?.27:0;
  const grip=clamp(Math.max(actionGrip,manualGrip));
  const walkGrip=walkAmount*(.12+runMix*.28);
  const relaxed=clamp(1-grip);
  let posed=0;
  for(const side of ['l','r']){
    const hand=view.bones.get('hand_'+side);
    if(!hand)continue;
    const handQ=hand.getWorldQuaternion(new THREE.Quaternion());
    const phase=Math.sin(strideClock+(side==='l'?0:Math.PI));
    for(const f of FINGERS){
      const id=f.name+'_',suffix='_'+side;
      // In idle, retract finger splay and fold all three knuckles into
      // a distinct closed fist; their individual curl differences remain.
      const spread=f.spread*(.45+.55*idlePose)*relaxed*.85;
      const bend=f.curl*(.55+.45*idlePose)+walkGrip+
        grip*(1.24-f.curl);
      const wave=.016*breath*(.25+idlePose)+.025*walkAmount*phase;
      handRotate(view,id+'01'+suffix,X,spread,handQ);
      handRotate(view,id+'01'+suffix,Z,bend*.60+wave,handQ);
      handRotate(view,id+'02'+suffix,Z,bend*.64,handQ);
      handRotate(view,id+'03'+suffix,Z,bend*.42+f.tip*.20,handQ);
      // The skin has vertices bound to the terminal leaf too.
      handRotate(view,id+'04_leaf'+suffix,Z,bend*.20,handQ);
      posed++;
    }
    // Thumb is opposed across the palm and flexes around its own base:
    // different from a finger directly beside the index finger.
    handRotate(view,'thumb_01_'+side,X,
      (side==='l'?-1:1)*(.16*idlePose+.24*grip),handQ);
    handRotate(view,'thumb_01_'+side,Y,
      (side==='l'?-1:1)*(.13+.08*idlePose),handQ);
    // Thumb folds ACROSS the index/middle fingers rather than extending
    // beside them, completing the fist silhouette.
    handRotate(view,'thumb_01_'+side,Z,.13+.39*grip,handQ);
    handRotate(view,'thumb_02_'+side,Z,.20+.49*grip,handQ);
    handRotate(view,'thumb_03_'+side,Z,.14+.34*grip,handQ);
    handRotate(view,'thumb_04_leaf_'+side,Z,.10*grip,handQ);
    posed++;
  }
  return {digitChains:posed,grip};
}
// Toe/forefoot joints are named ball_l / ball_r in the real GLB (with
// ball_leaf tips). They have independent skin weights and actually deform
// the toe/ball region, even though the feet do not have five separate toes.
export function animateFootBalls(view,{rootQ,leftStep,rightStep,
    idlePose=0,walkAmount=0,runMix=0,airborne=false,dashing=false,
    dash=0,land=0}={}){
  let toesAnimated=0;
  for(const side of ['l','r']){
    const ball=view.bones.get('ball_'+side),tip=view.bones.get('ball_leaf_'+side);
    if(!ball)continue;
    const foot=side==='l'?leftStep:rightStep;
    const toeOff=foot?.contact?clamp(-(foot.roll||0)*4):0;
    const swingLift=!foot?.contact?(foot?.lift||0):0;
    const toeFlex=airborne?-.18:
      idlePose*(side==='l'?.025:.058)+
      walkAmount*(toeOff*(.19+runMix*.10)-swingLift*.23)+
      dash*.085+land*.03;
    rotateWorld(ball,X.clone().applyQuaternion(rootQ),toeFlex);
    if(tip)rotateWorld(tip,X.clone().applyQuaternion(rootQ),toeFlex*.38);
    toesAnimated++;
  }
  return toesAnimated;
}

/* RE-Justice 3D full-body animation library.
 * Keyed actions drive the original Blender-authored, 65-bone humanoid rigs.
 * All movement/strikes are visual ONLY; the fixed-60Hz combat simulation,
 * collisions, hit windows, and character definitions are untouched.
 *
 * Coordinates: +Z forward, +Y up, +X right (glTF from Blender -Y forward).
 * Poses are expressed anatomically, then solved into each rig's bone space.
 */
import * as THREE from 'three';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const ease=t=>{t=clamp(t);return t*t*(3-2*t);};
const vec=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const Y=vec(0,1,0),X=vec(1,0,0),Z=vec(0,0,1);
const temp=new THREE.Vector3();
const abs=Math.abs, sin=Math.sin, cos=Math.cos;

// Three authored fighting styles, with distinct footwork, handedness and
// windup/impact curves. Fractions are of the existing move frame data, NOT
// replacements for gameplay startup, active, or recovery.
const STRIKES=Object.freeze({
  light: {hand:'l',chamber:.26,rotation:-.31,hip:-.17,lean:.12,step:.11,hook:0},
  medium:{hand:'r',chamber:.35,rotation:.46,hip:.31,lean:.20,step:.18,hook:.12},
  heavy: {hand:'r',chamber:.58,rotation:.78,hip:.52,lean:.30,step:.25,hook:.38},
  throw: {hand:'l',chamber:.48,rotation:-.42,hip:-.31,lean:.25,step:.19,hook:.22},
  super: {hand:'r',chamber:.68,rotation:.92,hip:.66,lean:.33,step:.30,hook:.45}
});

// Ease between hand-authored contact poses at frame-exact gameplay stages.
// This returns continuous values; no pose snapping at startup/active/recovery.
function strikePose(actor){
  if(!actor.attack)return null;
  const move=actor.attack;
  const p=STRIKES[move.button]||STRIKES.light;
  const startup=Math.max(1,move.startup);
  const active=Math.max(1,move.active);
  const recovery=Math.max(1,move.recovery);
  const tick=Math.max(0,actor.attackTick);
  let chamber=0,extend=0,recoil=0;
  if(tick<startup){
    const t=ease(tick/startup);
    chamber=t;extend=-.23*t;
  }else if(tick<startup+active){
    const t=ease((tick-startup+1)/active);
    chamber=1-t;
    extend=lerp(.78,1,t);
  }else{
    const t=ease((tick-startup-active)/recovery);
    extend=1-t;recoil=sin(t*Math.PI)*.16;
  }
  return {profile:p,wind:chamber,reach:extend,follow:recoil,
    twist:p.rotation*(extend*.94-chamber*.62),
    hip:p.hip*(extend*.8-chamber*.72),
    lean:p.lean*(extend*.75+chamber*.3),
    plant:clamp(chamber*.7+extend),
    crouch:chamber*.18+extend*.045,
    step:p.step*extend
  };
}
function aim(view,name,child,target,rootQ){
  const bone=view.bones.get(name),end=view.bones.get(child);
  if(!bone||!end)return;
  const start=bone.getWorldPosition(vec());
  const current=end.getWorldPosition(vec()).sub(start);
  if(current.lengthSq()<1e-10)return;
  const wanted=vec(...target);
  if(wanted.lengthSq()<1e-10)return;
  current.normalize();wanted.normalize().applyQuaternion(rootQ);
  const change=new THREE.Quaternion().setFromUnitVectors(current,wanted);
  const parent=bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.premultiply(parent.clone().invert().multiply(change).multiply(parent)).normalize();
  bone.updateWorldMatrix(false,true);
}
function rotate(view,name,localAxis,amount,rootQ){
  const bone=view.bones.get(name);
  if(!bone||Math.abs(amount)<.00001)return;
  const axis=localAxis.clone().applyQuaternion(rootQ);
  const delta=new THREE.Quaternion().setFromAxisAngle(axis,amount);
  const parent=bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.premultiply(parent.clone().invert().multiply(delta).multiply(parent)).normalize();
  bone.updateWorldMatrix(false,true);
}
const blendVec=(a,b,t)=>a.map((x,i)=>lerp(x,b[i],clamp(t)));

// Captures a neutral state once so the exported Blender rig stays intact.
// Each frame rebuilds from bind/rest; no accumulation or wrist drift.
export function poseFighter(view,alpha){
  const a=view.actor,root=view.root;
  alpha=clamp(alpha);
  const yaw=a.prevVisualYaw+
    Math.atan2(sin(a.visualYaw-a.prevVisualYaw),cos(a.visualYaw-a.prevVisualYaw))*alpha;
  const locomoting=a.state==='walk',dashing=a.state==='dash';
  const moving=locomoting||dashing;
  const attack=strikePose(a);
  const airborne=!a.grounded||a.state==='jump';
  const blocked=a.blocking||a.state==='block';
  const hit=a.state==='hitstun';
  const strideClock=Number.isFinite(a.gaitPhase)?
    lerp(a.prevGaitPhase??a.gaitPhase,a.gaitPhase,alpha):
    (a.animClock+alpha)*(dashing?.32:.225);
  const stride=sin(strideClock),step=cos(strideClock);
  // Smooth transition from movement to stillness and back in real frames.
  if(view.lastStateTick!==a.animClock){
    view.walkWeight=lerp(view.walkWeight||0,locomoting?1:0,.20);
    view.dashWeight=lerp(view.dashWeight||0,dashing?1:0,.42);
    view.lastStateTick=a.animClock;
  }
  // When manually driving the state in QA or pausing on a frame, never force
  // movement to zero based on elapsed real-world time.
  const walk=locomoting?Math.max(.17,view.walkWeight||0):view.walkWeight||0;
  const dash=dashing?Math.max(.55,view.dashWeight||0):0;
  const drive=clamp(walk+dash);
  const movingGait=drive*stride;
  const dashFrames=Math.max(0,Number(a.dashElapsed||0));
  const dashKick=dashing?sin(clamp(dashFrames/11)*Math.PI):0;
  const land=Math.max(0,Number(a.landingFrames||0))/7;
  const breath=sin((a.animClock+alpha)*.063);
  const bob=drive*(.026+abs(stride)*.041)-(attack?.crouch||0)*.11-land*.09;

  const lean=lerp(a.prevLean,a.lean,alpha)+dash*.22
    +(attack?.lean||0)-(hit?.21:0);
  const bank=lerp(a.prevBank,a.bank,alpha)+drive*step*.035;
  const pitch=lean+land*.07;
  root.position.set(lerp(a.prevX,a.x,alpha),
    lerp(a.prevY,a.y,alpha)+bob,lerp(a.prevZ,a.z,alpha));
  view.shadow.position.set(root.position.x,.018,root.position.z);
  view.shadow.material.opacity=.74/(1+a.y*.18);
  root.rotation.order='YXZ';
  root.rotation.set(pitch,yaw,bank);
  root.updateMatrixWorld(true);
  const rootQ=root.getWorldQuaternion(new THREE.Quaternion());

  for(const [name,bone] of view.bones){
    bone.quaternion.copy(view.rests.get(name));
    if(view.restPositions?.has(name))bone.position.copy(view.restPositions.get(name));
  }
  root.updateWorldMatrix(true,true);

  // Pelvis leads the stride, ribs/shoulders counter-rotate and head stabilizes.
  // Spine chain makes a strike originate at the feet, not from a disembodied arm.
  const hipTwist=drive*stride*.14+(attack?.hip||0);
  const torsoTwist=-drive*stride*.09+(attack?.twist||0);
  const torsoBend=drive*abs(step)*.038+(attack?.lean||0)*.19;
  rotate(view,'hips',Y,hipTwist,rootQ);
  rotate(view,'pelvis',Y,hipTwist,rootQ);
  rotate(view,'spine_01',Y,torsoTwist*.31,rootQ);
  rotate(view,'spine_02',Y,torsoTwist*.36,rootQ);
  rotate(view,'spine_03',Y,torsoTwist*.33,rootQ);
  rotate(view,'spine_01',X,torsoBend*.25,rootQ);
  rotate(view,'spine_02',X,torsoBend*.45+(hit?-.13:0),rootQ);
  rotate(view,'spine_03',X,torsoBend*.30+(hit?-.13:0),rootQ);
  rotate(view,'spine_03',Z,drive*stride*.032+(attack?.twist||0)*-.07,rootQ);
  rotate(view,'neck_01',X,-pitch*.21,rootQ);
  rotate(view,'head',Y,-torsoTwist*.16,rootQ);
  rotate(view,'head',X,-pitch*.14+breath*.018,rootQ);
  rotate(view,'clavicle_l',Z,-.025+drive*stride*.04,rootQ);
  rotate(view,'clavicle_r',Z,.025-drive*stride*.04,rootQ);

  // Running arms oppose their legs, dash uses compact sprinter arm drive.
  const pump=drive*stride;
  let leftUpper=[-.35,-.62,.49-pump*.34];
  let rightUpper=[.35,-.62,.49+pump*.34];
  let leftFore=[-.14,.62,.75+drive*.05];
  let rightFore=[.14,.62,.75+drive*.05];

  if(dashing){
    leftUpper=[-.32,-.58,.28-pump*.60-dashKick*.10];
    rightUpper=[.32,-.58,.30+pump*.60-dashKick*.10];
    leftFore=[-.1,.48,.85];rightFore=[.1,.48,.85];
  }else if(blocked){
    leftUpper=[-.25,-.35,.68];
    rightUpper=[.25,-.35,.68];
    leftFore=[.27,.76,.41];rightFore=[-.27,.76,.41];
  }else if(airborne){
    leftUpper=[-.44,-.35,.70];rightUpper=[.44,-.35,.70];
    leftFore=[-.14,.58,.75];rightFore=[.14,.58,.75];
  }else if(hit){
    leftUpper=[-.49,-.29,.23];rightUpper=[.49,-.29,.23];
    leftFore=[-.13,.62,.54];rightFore=[.13,.62,.54];
  }

  if(attack){
    const p=attack.profile;
    const attackingL=p.hand==='l';
    const chamber=attack.wind,reach=attack.reach,follow=attack.follow;
    // Guard hand stays close to chin while the attacking elbow is chambered.
    const windUpper=[attackingL?-.37:.37,-.37-chamber*.25,.37-chamber*.46];
    const contactUpper=[attackingL?-.16:.16,-.04+.05*p.hook,1.0-p.hook*.28];
    const contactFore=[attackingL?-.03:.03,-.02,1.0];
    if(attackingL){
      leftUpper=blendVec(windUpper,contactUpper,Math.max(0,reach));
      leftFore=blendVec([-.15,.70,.18],contactFore,Math.max(0,reach));
      rightUpper=[.25,-.36,.57];rightFore=[.15,.80,.45];
    }else{
      rightUpper=blendVec(windUpper,contactUpper,Math.max(0,reach));
      rightFore=blendVec([.15,.70,.18],contactFore,Math.max(0,reach));
      leftUpper=[-.25,-.36,.57];leftFore=[-.15,.80,.45];
    }
    // Heavy cross/hook swings over the opponent's guard, never beyond wrist.
    if(p.hook&&reach>.1){
      const offset=p.hook*reach;
      if(attackingL){leftUpper[0]-=offset*.28;leftFore[0]-=offset*.65;}
      else{rightUpper[0]+=offset*.28;rightFore[0]+=offset*.65;}
    }
    if(follow){
      if(attackingL)leftUpper[2]-=follow;
      else rightUpper[2]-=follow;
    }
  }
  aim(view,'upperarm_l','lowerarm_l',leftUpper,rootQ);
  aim(view,'upperarm_r','lowerarm_r',rightUpper,rootQ);
  aim(view,'lowerarm_l','hand_l',leftFore,rootQ);
  aim(view,'lowerarm_r','hand_r',rightFore,rootQ);

  // Long alternating stride, real knee lift on the recovering leg and heels
  // swinging under the hips. Reverse gait works because travel yaw reverses.
  const strideSize=walk*.57+dash*.77;
  const leftLeg=sin(strideClock)*strideSize,rightLeg=-leftLeg;
  const plant=attack?.plant||0;
  const strideDamp=1-plant*.96;
  const leftKnee=Math.max(0,-leftLeg)*.48;
  const rightKnee=Math.max(0,-rightLeg)*.48;
  const jumpCurl=airborne?.34:0;
  const brace=plant*.32+land*.28;
  aim(view,'thigh_l','calf_l',[-.10,-.98+leftKnee+brace*.32,
    .04+leftLeg*strideDamp+(attack?.step||0)*.4],rootQ);
  aim(view,'thigh_r','calf_r',[.10,-.98+rightKnee+brace*.32,
    .04+rightLeg*strideDamp-(attack?.step||0)*.4],rootQ);
  aim(view,'calf_l','foot_l',[-.015,-1+leftKnee*.55+brace*.35+jumpCurl,
    .11+leftKnee*.8+brace*.48],rootQ);
  aim(view,'calf_r','foot_r',[.015,-1+rightKnee*.55+brace*.35+jumpCurl,
    .11+rightKnee*.8+brace*.48],rootQ);
  rotate(view,'foot_l',X,-leftLeg*strideDamp*.32+land*.14,rootQ);
  rotate(view,'foot_r',X,-rightLeg*strideDamp*.32+land*.14,rootQ);

  // Exposed for browser QA & animation inspection, never consumed by combat.
  view.poseMetrics={
    state:a.state,hipTwist,torsoTwist,lean:pitch,walk:drive,
    dash,attackReach:attack?.reach||0,attackWind:attack?.wind||0,
    chest:vec().copy(view.bones.get('spine_03')?.getWorldPosition(temp)||root.position).toArray()
  };
}

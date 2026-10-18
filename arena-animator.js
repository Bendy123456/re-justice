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
// One complete authored idle profile, inspired by a crouched ninja-ready pose.
// Measurements in normalized limb lengths except for torso/pelvis shifts.
// Tweak these values together; combat timing and locomotion remain untouched.
// Hand-authored neutral stance: asymmetric torso, individually posed shoulders,
// fists, knees and feet. All arrays use character-root coordinates; the actual
// Blender bone transforms are reconstructed each frame from their bind poses.
// These targets affect VISUAL idle only, not gameplay movement or hitboxes.
const COMBAT_IDLE=Object.freeze({
  fadeIn:.19,fadeOut:.29,
  hipsOffset:[-.052,-.103,-.006],
  pelvisYaw:-.032,
  spine01:[.082,-.018,.014],
  spine02:[.124,-.036,.026],
  spine03:[.082,-.030,.020],
  neck:[-.028,.015,-.006],
  head:[-.035,.025,.008],
  clavicleL:[-.070,.034,-.055],
  clavicleR:[.032,-.028,.045],
  // Tight, uneven guard, both fists in front of the face.
  leadHand:[.14,.29,.58],
  trailHand:[.20,.20,.53],
  leadArmPole:[.90,-.43,.27],
  trailArmPole:[.84,-.27,.32],
  // Left/lead leg extended more; right/rear leg folds visibly lower.
  leadFoot:[.23,-.90,.31],
  trailFoot:[.36,-.74,-.09],
  leadKneePole:[.11,.12,1.02],
  trailKneePole:[.07,.11,1.42],
  leadFootYaw:-.04,
  trailFootYaw:.20
});
const STRIKES=Object.freeze({
  light: {hand:'l',chamber:.26,rotation:-.31,hip:-.17,lean:.12,step:.11,hook:0},
  medium:{hand:'r',chamber:.35,rotation:.46,hip:.31,lean:.20,step:.18,hook:.12},
  heavy: {hand:'r',chamber:.58,rotation:.99,hip:.64,lean:.33,step:.27,hook:.45},
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
  let chamber=0,extend=0,recoil=0,impact=0;
  if(tick<startup){
    const t=ease(tick/startup);
    chamber=t;extend=-.23*t;
  }else if(tick<startup+active){
    const t=ease((tick-startup+1)/active);
    chamber=1-t;
    extend=lerp(.79,1,t);
    impact=sin(Math.PI*t); // fast contact-frame shoulder recoil
  }else{
    const t=ease((tick-startup-active)/recovery);
    extend=1-t;recoil=sin(t*Math.PI)*.19;
  }
  return {profile:p,wind:chamber,reach:extend,follow:recoil,impact,
    shoulderPunch:impact*(p.hook>.3?.18:.11),
    twist:p.rotation*(extend*.94-chamber*.66),
    hip:p.hip*(extend*.86-chamber*.72),
    lean:p.lean*(extend*.78+chamber*.32)+impact*.05,
    plant:clamp(chamber*.7+extend),
    crouch:chamber*.20+extend*.055,
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

// Render-only locomotion controller, evaluated once per simulation tick.
// Speed and 2D direction are measured from ACTUAL displacement, not keys.
// It interpolates movement into a physically grounded pose without altering
// collision, combat, fixed timestep, damage or gameplay move speeds.
function locomotionState(view,a){
  if(view.motionTick===a.animClock)return view.motion;
  const m=view.motion||(view.motion={weight:0,forward:1,side:0,speed:0,turn:0});
  const dx=a.x-a.prevX,dz=a.z-a.prevZ,dist=Math.hypot(dx,dz);
  const walking=a.state==='walk'&&a.grounded&&!a.attack&&!a.blocking;
  const yaw=a.visualYaw;
  const f=dist>1e-5?(dx*Math.sin(yaw)+dz*Math.cos(yaw))/dist:m.forward;
  const side=dist>1e-5?(dx*Math.cos(yaw)-dz*Math.sin(yaw))/dist:m.side;
  const speed=walking?Math.min(12,dist*60):0;
  m.speed=lerp(m.speed,speed,walking?.30:.22);
  // Match the FIRST step's direction immediately; otherwise a fresh
  // backpedal briefly plays forward before the smoothing catches up.
  if(walking&&m.weight<.08){m.forward=f;m.side=side;}
  m.weight=lerp(m.weight,walking?clamp(speed/2.8):0,walking?.28:.19);
  m.forward=lerp(m.forward,walking?f:m.forward,walking?.28:.12);
  m.side=lerp(m.side,walking?side:m.side,walking?.28:.12);
  m.turn=lerp(m.turn,Math.atan2(sin(a.visualYaw-a.prevVisualYaw),
    cos(a.visualYaw-a.prevVisualYaw)),.30);
  if(!walking&&m.weight<.002){m.weight=0;m.speed=0;}
  view.motionTick=a.animClock;
  return m;
}
function unitMotion(m){
  const length=Math.hypot(m.forward,m.side);
  return length>.001?{forward:m.forward/length,side:m.side/length}:
    {forward:1,side:0};
}
// Foot-contact gait: 62% grounded stance, 38% eased swing with a
// separate heel strike, toe-off and recovery lift (not a pure sine wave).
function walkStep(phase,runMix=0){
  const u=((phase/(2*Math.PI))%1+1)%1;
  // Sprinting has a shorter grounded phase and longer airborne recovery;
  // ordinary steps retain stable walk contact. Full-speed movement is 7m/s,
  // which MUST animate as a run, never as a hyper-fast short-step walk.
  const stance=lerp(.62,.43,runMix);
  const reach=lerp(.50,.66,runMix);
  if(u<stance){
    const t=u/stance;
    return {contact:true,travel:reach*(1-2*t),lift:0,
      roll:.12*(1-ease(t/.18))-.20*ease((t-.78)/.22),
      support:sin(Math.PI*t)**2};
  }
  const t=(u-stance)/(1-stance);
  return {contact:false,travel:lerp(-reach,reach,ease(t)),
    lift:lerp(.175,.30,runMix)*Math.pow(Math.max(0,sin(Math.PI*t)),.8),
    // Match preceding toe-off (-0.20 rad) and next heel strike (+0.12)
    // exactly; no wrist/ankle snapping at the stance/swing boundaries.
    roll:-.20*(1-ease(t/.18))+.12*ease((t-.82)/.18),support:0};
}
// Solve an anatomical 2-bone chain from the actual GLB joint lengths.
// Unlike directing both segments toward fixed angles, the elbow/knee is
// placed geometrically between its shoulder/hip and the moving hand/foot.
// pole is in model-root coordinates and keeps elbows outside the ribs and
// knees facing forward even on rigs with reversed _l/_r bone naming.
function solveLimb(view,upperName,jointName,endName,target,pole,rootQ){
  const upper=view.bones.get(upperName),joint=view.bones.get(jointName),
    end=view.bones.get(endName);
  if(!upper||!joint||!end)return;
  const shoulder=upper.getWorldPosition(vec());
  const elbow=joint.getWorldPosition(vec());
  const wrist=end.getWorldPosition(vec());
  const a=elbow.distanceTo(shoulder),b=wrist.distanceTo(elbow);
  if(a<.001||b<.001)return;
  const endWorld=vec(...target).applyQuaternion(rootQ).add(shoulder);
  const line=endWorld.clone().sub(shoulder);
  const dist=Math.max(Math.abs(a-b)+.002,Math.min(a+b-.002,line.length()));
  const axis=line.normalize();
  const along=(a*a-b*b+dist*dist)/(2*dist);
  const height=Math.sqrt(Math.max(0,a*a-along*along));
  const poleWorld=vec(...pole).applyQuaternion(rootQ);
  poleWorld.addScaledVector(axis,-poleWorld.dot(axis));
  if(poleWorld.lengthSq()<1e-8)poleWorld.set(1,0,0).addScaledVector(axis,-axis.x);
  poleWorld.normalize();
  const jointTarget=shoulder.clone().addScaledVector(axis,along).
    addScaledVector(poleWorld,height);
  const inv=rootQ.clone().invert();
  const upperDir=jointTarget.clone().sub(shoulder).applyQuaternion(inv);
  aim(view,upperName,jointName,upperDir.toArray(),rootQ);
  const actualJoint=joint.getWorldPosition(vec());
  const lowerDir=endWorld.sub(actualJoint).applyQuaternion(inv);
  aim(view,jointName,endName,lowerDir.toArray(),rootQ);
}
function bendAngle(view,upperName,jointName,endName){
  const upper=view.bones.get(upperName),joint=view.bones.get(jointName),
    end=view.bones.get(endName);
  if(!upper||!joint||!end)return 0;
  const start=upper.getWorldPosition(vec()),mid=joint.getWorldPosition(vec()),
    tip=end.getWorldPosition(vec());
  return Math.acos(clamp(mid.sub(start).normalize().dot(tip.sub(joint.getWorldPosition(vec())).normalize()),-1,1));
}


// Captures a neutral state once so the exported Blender rig stays intact.
// Each frame rebuilds from bind/rest; no accumulation or wrist drift.
export function poseFighter(view,alpha){
  const a=view.actor,root=view.root;
  alpha=clamp(alpha);
  const yaw=a.prevVisualYaw+
    Math.atan2(sin(a.visualYaw-a.prevVisualYaw),cos(a.visualYaw-a.prevVisualYaw))*alpha;
  const locomoting=a.state==='walk',dashing=a.state==='dash';
  const naturalWalk=locomoting&&!a.attack&&!a.blocking&&a.grounded;
  const motion=locomotionState(view,a),direction=unitMotion(motion);
  const localForward=direction.forward,localSide=direction.side;
  const attack=strikePose(a);
  const airborne=!a.grounded||a.state==='jump';
  const blocked=a.blocking||a.state==='block';
  const hit=a.state==='hitstun';
  const strideClock=Number.isFinite(a.gaitPhase)?
    lerp(a.prevGaitPhase??a.gaitPhase,a.gaitPhase,alpha):
    (a.animClock+alpha)*(dashing?.32:.225);
  const stride=sin(strideClock),step=cos(strideClock);
  const relaxedIdle=a.state==='idle'&&a.grounded&&!attack&&!blocked&&!hit;
  // Interpolate the whole fighting stance together, once per physics tick.
  // Never use render-frame delta or snap hands/knees at movement transitions.
  if(view.lastStateTick!==a.animClock){
    view.dashWeight=lerp(view.dashWeight||0,dashing?1:0,.42);
    const before=view.combatIdleWeight??(relaxedIdle?1:0);
    const response=relaxedIdle?COMBAT_IDLE.fadeIn:COMBAT_IDLE.fadeOut;
    view.combatIdleWeight=lerp(before,relaxedIdle?1:0,response);
    if(!relaxedIdle&&view.combatIdleWeight<.001)view.combatIdleWeight=0;
    view.lastStateTick=a.animClock;
  }
  const idlePose=view.combatIdleWeight??0;
  const walk=motion.weight;
  const dash=dashing?Math.max(.55,view.dashWeight||0):0;
  const drive=(attack||blocked||hit)?0:clamp(walk+dash);
  const walkAmount=(!dashing&&!airborne&&!attack&&!blocked&&!hit)?
    clamp(walk):0;
  const walkingMotion=walkAmount>.0005;
  const walkFade=ease(walkAmount);
  const runMix=clamp((motion.speed-3.6)/2.7)*walkFade;
  const leftStep=walkStep(strideClock,runMix);
  const rightStep=walkStep(strideClock+Math.PI,runMix);
  const legL=view.legSides?.l??-1,legR=view.legSides?.r??1;
  const supportShift=walkAmount*.055*
    (leftStep.support*legL+rightStep.support*legR);
  if(!naturalWalk&&view.footPlants)view.footPlants={l:null,r:null};
  const dashFrames=Math.max(0,Number(a.dashElapsed||0));
  const dashIgnite=dashing?1-ease(dashFrames/3):0;
  const dashBurst=dashing?ease(dashFrames/3)*(1-ease((dashFrames-9)/3)):0;
  const dashKick=dashing?sin(clamp(dashFrames/11)*Math.PI):0;
  const dashBrake=clamp(Number(a.dashRecovery||0)/7);
  const land=clamp(Number(a.landingFrames||0)/7);
  const breath=sin((a.animClock+alpha)*.063);
  // Gravity-like weight absorption on contact, directional lean and
  // counter-balance rather than spinning a motionless torso on top of legs.
  const walkBob=walkAmount*(.010+.011*(1-cos(2*strideClock))*.5+
    runMix*.028*(.5-.5*cos(2*strideClock)));
  const bob=(walkingMotion?walkBob:drive*(.009+abs(stride)*.049))+
    dashBurst*.022-dashIgnite*.085-dashBrake*.038-
    (attack?.crouch||0)*.11-land*.09;
  const rawLean=lerp(a.prevLean,a.lean,alpha);
  const lean=(walkingMotion?rawLean*.22:rawLean)+
    (attack?.lean||0)-(hit?.21:0);
  const walkLean=walkAmount*((.058+runMix*.074)*localForward-
    .010*abs(localSide));
  const walkTurnBank=walkingMotion?
    clamp(-motion.turn*.31,-.075,.075)*walkAmount:0;
  const bank=lerp(a.prevBank,a.bank,alpha)*(!walkingMotion?1:.33)+
    (walkingMotion?-supportShift*.53:drive*step*.047)+
    walkTurnBank-walkAmount*localSide*.058+
    (attack?.impact||0)*.02;
  const pitch=lean+walkLean+
    dash*.23+dashBurst*.12-dashIgnite*.06-
    dashBrake*.12+land*.07;
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

  // Pelvis offset is hand authored, not a generic crouch multiplier.
  // The walking pelvis shift remains active and fades independently.
  {
    const hips=view.bones.get('hips')||view.bones.get('pelvis');
    if(hips){
      if(walkingMotion){
        hips.position.x+=supportShift;
        hips.position.y-=walkAmount*.009*(1-abs(step));
      }
      if(idlePose>.0001){
        const offset=COMBAT_IDLE.hipsOffset;
        hips.position.x+=idlePose*offset[0];
        hips.position.y+=idlePose*offset[1];
        hips.position.z+=idlePose*(offset[2]+.002*breath);
      }
      root.updateWorldMatrix(true,true);
    }
  }

  // Pelvis leads the stride, ribs/shoulders counter-rotate and head stabilizes.
  // Spine chain makes a strike originate at the feet, not from a disembodied arm.
  // Hips initiate the stride and strike; shoulders counter-rotate.
  const stepDrive=localForward+localSide*.26;
  const hipTwist=(walkingMotion?walkAmount*.135*stepDrive:drive*.19)*stride+
    (attack?.hip||0)+dashKick*.055;
  const torsoTwist=-(walkingMotion?walkAmount*.195*stepDrive:drive*.16)*stride+
    (attack?.twist||0)-dashKick*.075;
  // Chest pitch, counter-rotation and shoulder roll use distinct curves.
  const chestLead=walkingMotion?walkAmount*sin(strideClock-.48):0;
  const chestRoll=walkingMotion?
    (-supportShift*.42+walkAmount*.048*sin(strideClock-.48)-
      localSide*.023*walkAmount):0;
  const chestPitch=walkingMotion?
    walkAmount*(.019+.026*cos(2*strideClock+.35)):0;
  const torsoBend=(walkingMotion?walkAmount*(.045+.011*abs(step)):drive*.047)*abs(step)+
    (attack?.lean||0)*.20+dashBurst*.045;
  // Hand-authored three-segment spine and deliberately uneven shoulders.
  // Idle strength blends every joint together during stop/start transitions.
  const idleBreath=idlePose*(1-walkFade)*breath*.012;
  rotate(view,'hips',Y,hipTwist+idlePose*COMBAT_IDLE.pelvisYaw,rootQ);
  rotate(view,'pelvis',Y,hipTwist+idlePose*COMBAT_IDLE.pelvisYaw,rootQ);
  rotate(view,'spine_01',X,torsoBend*.25+chestPitch*.15+
    idlePose*COMBAT_IDLE.spine01[0]+idleBreath*.15,rootQ);
  rotate(view,'spine_01',Y,torsoTwist*.31+
    idlePose*COMBAT_IDLE.spine01[1],rootQ);
  rotate(view,'spine_01',Z,chestRoll*.20+
    idlePose*COMBAT_IDLE.spine01[2],rootQ);
  rotate(view,'spine_02',X,torsoBend*.45+chestPitch*.45+
    idlePose*COMBAT_IDLE.spine02[0]+idleBreath*.25+(hit?-.13:0),rootQ);
  rotate(view,'spine_02',Y,torsoTwist*.36+
    idlePose*COMBAT_IDLE.spine02[1],rootQ);
  rotate(view,'spine_02',Z,chestRoll*.49+
    idlePose*COMBAT_IDLE.spine02[2],rootQ);
  rotate(view,'spine_03',X,torsoBend*.30+chestPitch*.40+
    idlePose*COMBAT_IDLE.spine03[0]+idleBreath*.20+(hit?-.13:0),rootQ);
  rotate(view,'spine_03',Y,torsoTwist*.33+
    idlePose*COMBAT_IDLE.spine03[1],rootQ);
  rotate(view,'spine_03',Z,chestRoll*.31+
    (walkingMotion?chestLead*.033:drive*.046*stride)+
    (attack?.twist||0)*-.07+idlePose*COMBAT_IDLE.spine03[2],rootQ);
  rotate(view,'neck_01',X,-pitch*(walkingMotion?.37:.21)+
    idlePose*COMBAT_IDLE.neck[0],rootQ);
  rotate(view,'neck_01',Y,idlePose*COMBAT_IDLE.neck[1],rootQ);
  rotate(view,'neck_01',Z,idlePose*COMBAT_IDLE.neck[2],rootQ);
  rotate(view,'head',X,-pitch*(walkingMotion?.32:.25)+breath*.012+
    idlePose*COMBAT_IDLE.head[0],rootQ);
  rotate(view,'head',Y,-torsoTwist*.16+
    idlePose*COMBAT_IDLE.head[1],rootQ);
  rotate(view,'head',Z,idlePose*COMBAT_IDLE.head[2],rootQ);
  rotate(view,'clavicle_l',X,idlePose*COMBAT_IDLE.clavicleL[0],rootQ);
  rotate(view,'clavicle_l',Y,(walkingMotion?chestLead*.032:0)+
    idlePose*COMBAT_IDLE.clavicleL[1],rootQ);
  rotate(view,'clavicle_l',Z,-.025+
    (walkingMotion?walkAmount*.045:drive*.04)*stride+
    idlePose*COMBAT_IDLE.clavicleL[2],rootQ);
  rotate(view,'clavicle_r',X,idlePose*COMBAT_IDLE.clavicleR[0],rootQ);
  rotate(view,'clavicle_r',Y,(walkingMotion?-chestLead*.032:0)+
    idlePose*COMBAT_IDLE.clavicleR[1],rootQ);
  rotate(view,'clavicle_r',Z,.025-
    (walkingMotion?walkAmount*.045:drive*.04)*stride+
    idlePose*COMBAT_IDLE.clavicleR[2],rootQ);

  // Asymmetric loose guard at rest. Attack and block still get their own
  // authored arm positions; the guard is an idle-only procedural layer.
  const pump=drive*stride;
  const idleL=[-.34,-.36,.69],idleR=[.28,-.40,.61];
  const idleForeL=[-.14,.58,.61],idleForeR=[.13,.53,.56];
  const walkL=[-.56,-.84,.26-pump*.76];
  const walkR=[.56,-.84,.26+pump*.76];
  const walkForeL=[-.26,-.65,.38-pump*.20];
  const walkForeR=[.26,-.65,.38+pump*.20];
  const walkBlend=walkFade;
  let leftUpper=blendVec(idleL,walkL,walkBlend);
  let rightUpper=blendVec(idleR,walkR,walkBlend);
  let leftFore=blendVec(idleForeL,walkForeL,walkBlend);
  let rightFore=blendVec(idleForeR,walkForeR,walkBlend);

  if(dashing){
    // Athletic sprint stance: elbows out, hands beside the flanks, no
    // bent-up forearms running through the torso on diagonal dashes.
    // During acceleration both elbows stay wide and the hands sweep back.
    leftUpper=blendVec(leftUpper,[-.66,-.74,.15-pump*.34-
      dashBurst*.38+dashIgnite*.22],dash);
    rightUpper=blendVec(rightUpper,[.66,-.74,.15+pump*.34-
      dashBurst*.38+dashIgnite*.22],dash);
    leftFore=blendVec(leftFore,[-.29,-.71,.20-dashBurst*.29],dash);
    rightFore=blendVec(rightFore,[.29,-.71,.20-dashBurst*.29],dash);
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
    const windUpper=[attackingL?-.44:.44,-.37-chamber*.32,
      .39-chamber*.49];
    const contactUpper=[attackingL?-.20:.20,-.03+.07*p.hook,
      1.0-p.hook*.28+attack.shoulderPunch];
    const contactFore=[attackingL?-.10:.10,-.01,1.0];
    if(attackingL){
      leftUpper=blendVec(windUpper,contactUpper,Math.max(0,reach));
      leftFore=blendVec([-.15,.70,.18],contactFore,Math.max(0,reach));
      rightUpper=[.35,-.30,.63];rightFore=[.23,.68,.57];
    }else{
      rightUpper=blendVec(windUpper,contactUpper,Math.max(0,reach));
      rightFore=blendVec([.15,.70,.18],contactFore,Math.max(0,reach));
      leftUpper=[-.35,-.30,.63];leftFore=[-.23,.68,.57];
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
  // The imported rigs do not all agree on whether "_l" is -X or +X.
  // Apply the actual shoulder-outward sign AFTER authoring each pose so the
  // elbow always bends AWAY from the chest, not back through the skin.
  const armL=view.armSides?.l??-1,armR=view.armSides?.r??1;
  leftUpper[0]=armL*Math.abs(leftUpper[0]);
  rightUpper[0]=armR*Math.abs(rightUpper[0]);
  leftFore[0]=armL*Math.abs(leftFore[0]);
  rightFore[0]=armR*Math.abs(rightFore[0]);
  // Walking/dashing arms are now truly articulated at TWO joints. Fists
  // accelerate ahead of the chest while the elbow folds and swings out.
  // Attacks keep their separate authored windup/contact targets.
  if(!attack&&!blocked&&!hit&&!airborne){
    for(const [side,sgn,phase] of [
      ['l',armL,-pump],['r',armR,pump]]){
      const shoulder=view.bones.get('upperarm_'+side);
      const elbow=view.bones.get('lowerarm_'+side),hand=view.bones.get('hand_'+side);
      if(!shoulder||!elbow||!hand)continue;
      const reach=shoulder.getWorldPosition(vec()).distanceTo(elbow.getWorldPosition(vec()))+
        elbow.getWorldPosition(vec()).distanceTo(hand.getWorldPosition(vec()));
      const travel=clamp(phase,-1,1);
      let handX=.32,handY=-.68+travel*.16,handZ=.16+travel*.43;
      if(!dashing){
        // Arm swing opposes stepping leg; backpedals/strafe are distinct.
        const swing=side==='l'?-sin(strideClock):sin(strideClock);
        const stepSwing=swing*(localForward+localSide*.32);
        const front=Math.max(0,stepSwing),back=Math.max(0,-stepSwing);
        handX=lerp(.135,.22+.028*front+abs(localSide)*.025,walkFade);
        handY=lerp(-.975+breath*.001,
          lerp(-.87+.125*front-.045*back,-.75+.16*front-.03*back,runMix),walkFade);
        handZ=lerp(.02,.055+(.38+runMix*.12)*stepSwing,walkFade);
      }else{
        handX=.42;handY=-.57+travel*.09;
        handZ=.15+travel*.20-dashBurst*.53;
      }
      // Author the wrist and elbow targets independently per side, instead
      // of allowing the ordinary idle arm IK to pull the fists back down.
      const handPose=side==='l'?COMBAT_IDLE.leadHand:COMBAT_IDLE.trailHand;
      const polePose=side==='l'?COMBAT_IDLE.leadArmPole:COMBAT_IDLE.trailArmPole;
      handX=lerp(handX,handPose[0],idlePose);
      handY=lerp(handY,handPose[1]+.006*breath,idlePose);
      handZ=lerp(handZ,handPose[2]+.010*breath,idlePose);
      const elbowOut=dashing?.95:lerp(.055,.30,walkFade);
      const armPole=[
        sgn*lerp(elbowOut,polePose[0],idlePose),
        lerp(.05,polePose[1],idlePose),
        lerp(dashing?-.32:-.99,polePose[2],idlePose)
      ];
      solveLimb(view,'upperarm_'+side,'lowerarm_'+side,'hand_'+side,
        [sgn*reach*handX,reach*handY,reach*handZ],armPole,rootQ);
    }
  }else{
    aim(view,'upperarm_l','lowerarm_l',leftUpper,rootQ);
    aim(view,'upperarm_r','lowerarm_r',rightUpper,rootQ);
    aim(view,'lowerarm_l','hand_l',leftFore,rootQ);
    aim(view,'lowerarm_r','hand_r',rightFore,rootQ);
  }
  // Subtle wrist/hand articulation makes the arm more than a rigid stick.
  // Small separate adjustments preserve the two-bone elbow solve.
  for(const [side,sign,phase] of [['l',armL,-pump],['r',armR,pump]]){
    // Wrist rotation is a separate joint, slightly delayed behind the
    // upper-arm swing; fingers remain loose rather than locked in a guard.
    const wristSwing=walkingMotion?
      (side==='l'?-sin(strideClock-.27):sin(strideClock-.27)):phase;
    rotate(view,'hand_'+side,X,drive*wristSwing*(walkingMotion?.13:.17)+
      (attack?.impact||0)*-.06,rootQ);
    rotate(view,'hand_'+side,Y,sign*(.045+drive*.035),rootQ);
  }

  // Long alternating stride, real knee lift on the recovering leg and heels
  // swinging under the hips. Reverse gait works because travel yaw reverses.
  const strideSize=drive*(.70+dash*.22);
  const leftLeg=sin(strideClock)*strideSize,rightLeg=-leftLeg;
  const plant=attack?.plant||0;
  const strideDamp=1-plant*.96;
  const leftKnee=Math.max(0,-leftLeg)*.57;
  const rightKnee=Math.max(0,-rightLeg)*.57;
  const jumpCurl=airborne?.34:0;
  const brace=plant*.32+land*.28+dashIgnite*.34+dashBrake*.22;
  // Two-bone leg IK: the ankle moves on a contact/lift path and the
  // knee MUST fold in front of the thigh. Both male/female share this rig
  // hierarchy, but side signs come from the actual mesh skeleton.
  for(const [side,sign,swing] of [['l',legL,leftLeg],['r',legR,rightLeg]]){
    const hip=view.bones.get('thigh_'+side),knee=view.bones.get('calf_'+side),
      ankle=view.bones.get('foot_'+side);
    if(!hip||!knee||!ankle)continue;
    const length=hip.getWorldPosition(vec()).distanceTo(knee.getWorldPosition(vec()))+
      knee.getWorldPosition(vec()).distanceTo(ankle.getWorldPosition(vec()));
    const stepMotion=swing*strideDamp;
    const lift=Math.max(0,stepMotion);
    // Both feet follow a single IK solve, so the asymmetrical crouch is
    // anatomical rather than rotating disconnected thigh and shin bones.
    let target=relaxedIdle?
      [sign*length*.018,-length*.988,length*.012]:
      [sign*length*.12,
        -length*(.91-lift*.26-brace*.13-jumpCurl*.17),
        length*(.05+stepMotion*.46+(attack?.step||0)*(side==='l'?.18:-.18))];
    if(walkingMotion){
      const foot=side==='l'?leftStep:rightStep,blend=walkAmount;
      // Each heel travels along the character-local 2D ground direction.
      // Reversing/strafe reorients the stride without rotating combat facing.
      const lateral=sign*length*.065+foot.travel*localSide;
      const fore=length*.025+foot.travel*localForward;
      const reachSq=(lateral*lateral+fore*fore)/(length*length);
      const extensionY=Math.sqrt(Math.max(.57,.985*.985-reachSq));
      const walkTarget=[lateral,
        -length*extensionY+foot.lift-(foot.contact?walkBob:0),
        fore];
      target=blendVec(target,walkTarget,blend);
      if(!view.footPlants)view.footPlants={l:null,r:null};
      const movingRoot=Math.hypot(a.x-a.prevX,a.z-a.prevZ)>.0001;
      const worldHip=hip.getWorldPosition(vec());
      let planted=view.footPlants[side];
      // Discard a stale world anchor on teleport, jump, or large separation.
      if(planted&&(worldHip.distanceTo(planted.world)>length*1.22||
          Math.hypot(a.x-a.prevX,a.z-a.prevZ)>.65)){
        view.footPlants[side]=null;planted=null;
      }
      if(!foot.contact){
        view.footPlants[side]=null;
      }else if(naturalWalk&&(movingRoot||planted)){
        if(!planted){
          const worldFoot=vec(...walkTarget).applyQuaternion(rootQ).add(worldHip);
          planted={world:worldFoot};
          view.footPlants[side]=planted;
        }
        const locked=planted.world.clone().sub(worldHip).
          applyQuaternion(rootQ.clone().invert()).toArray();
        target=blendVec(target,locked,blend);
      }
    }else if(view.footPlants)view.footPlants[side]=null;
    // Individually placed ankle and knee-pole targets. Left is straighter,
    // right is deeply bent. Preserve ordinary ground-contact IK during travel.
    if(idlePose>.0001){
      const footPose=side==='l'?COMBAT_IDLE.leadFoot:COMBAT_IDLE.trailFoot;
      const idleFoot=[
        sign*length*footPose[0],
        length*(footPose[1]+.002*breath),
        length*(footPose[2]+.004*sin((a.animClock+alpha)*.026))
      ];
      target=blendVec(target,idleFoot,idlePose);
    }
    if(airborne)target=[sign*length*.15,-length*.63,length*.24];
    const kneeSculpt=side==='l'?COMBAT_IDLE.leadKneePole:COMBAT_IDLE.trailKneePole;
    const kneePole=[
      sign*lerp(.12,kneeSculpt[0],idlePose),
      lerp(.15,kneeSculpt[1],idlePose),
      lerp(1,kneeSculpt[2],idlePose)
    ];
    solveLimb(view,'thigh_'+side,'calf_'+side,'foot_'+side,
      target,kneePole,rootQ);
  }
  rotate(view,'foot_l',X,(walkingMotion?leftStep.roll*walkAmount:
    -leftLeg*strideDamp*.39)+land*.14+dashBrake*.11,rootQ);
  rotate(view,'foot_r',X,(walkingMotion?rightStep.roll*walkAmount:
    -rightLeg*strideDamp*.39)+land*.14+dashBrake*.11,rootQ);
  rotate(view,'foot_l',Y,(view.legSides?.l??-1)*idlePose*
    COMBAT_IDLE.leadFootYaw,rootQ);
  rotate(view,'foot_r',Y,(view.legSides?.r??1)*idlePose*
    COMBAT_IDLE.trailFootYaw,rootQ);

  // Individual articulated joint angles measured on the rendered bones.
  // Exposing these makes regressions observable beyond visible root movement.
  const jointBends={
    elbowL:bendAngle(view,'upperarm_l','lowerarm_l','hand_l'),
    elbowR:bendAngle(view,'upperarm_r','lowerarm_r','hand_r'),
    kneeL:bendAngle(view,'thigh_l','calf_l','foot_l'),
    kneeR:bendAngle(view,'thigh_r','calf_r','foot_r')
  };
  // The rigs also include finer hand/toe articulation. Respect whichever
  // matching finger/toe joints are present, without changing their bind pose.
  for(const [name,bone] of view.bones){
    if(/^(?:thumb|index|middle|ring|pinky|finger|toe)/.test(name)){
      const side=name.endsWith('_l')?-1:1;
      rotate(view,name,X,breath*.025+
        (attack?.wind||0)*.035+(attack?.reach||0)*-.06,rootQ);
    }
  }
  // Exposed for browser QA & animation inspection, never consumed by combat.
  view.poseMetrics={...jointBends,
    localForward,localSide,gaitWeight:walkAmount,groundSpeed:motion.speed,runMix,
    state:a.state,hipTwist,torsoTwist,chestRoll,chestPitch,chestLead,
    lean:pitch,walk:drive,
    walkContactL:leftStep.contact,walkContactR:rightStep.contact,
    walkLiftL:leftStep.lift,walkLiftR:rightStep.lift,walkBob,
    walkFootL:leftStep.travel,walkFootR:rightStep.travel,
    walkForwardLean:walkLean,walkTurnBank,
    walkHipShift:walkingMotion?supportShift:0,
    plantedL:!!view.footPlants?.l,plantedR:!!view.footPlants?.r,
    idleWeight:1-walkFade,relaxedIdle,combatIdleWeight:idlePose,
    authoredIdle:true,
    rootPitch:pitch,rootBank:bank,
    dash,dashIgnite,dashBurst,dashBrake,attackReach:attack?.reach||0,
    attackWind:attack?.wind||0,attackImpact:attack?.impact||0,
    chest:vec().copy(view.bones.get('spine_03')?.getWorldPosition(temp)||root.position).toArray()
  };
}

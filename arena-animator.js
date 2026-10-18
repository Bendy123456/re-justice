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
function walkStep(phase){
  const u=((phase/(2*Math.PI))%1+1)%1,stance=.62;
  if(u<stance){
    const t=u/stance;
    return {contact:true,travel:.50-1.0*t,lift:0,
      roll:.12*(1-ease(t/.18))-.20*ease((t-.78)/.22),
      support:sin(Math.PI*t)**2};
  }
  const t=(u-stance)/(1-stance);
  return {contact:false,travel:lerp(-.50,.50,ease(t)),
    lift:.175*Math.pow(Math.max(0,sin(Math.PI*t)),.8),
    roll:.13*sin(Math.PI*t),support:0};
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
  if(view.lastStateTick!==a.animClock){
    view.dashWeight=lerp(view.dashWeight||0,dashing?1:0,.42);
    view.lastStateTick=a.animClock;
  }
  const walk=motion.weight;
  const dash=dashing?Math.max(.55,view.dashWeight||0):0;
  const drive=(attack||blocked||hit)?0:clamp(walk+dash);
  const relaxedIdle=a.state==='idle'&&a.grounded&&!attack&&!blocked&&!hit;
  const walkAmount=(!dashing&&!airborne&&!attack&&!blocked&&!hit)?
    clamp(walk):0;
  const walkingMotion=walkAmount>.0005;
  const walkFade=ease(walkAmount);
  const leftStep=walkStep(strideClock),rightStep=walkStep(strideClock+Math.PI);
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
  // Superhero/anime: crouched ignition, flying acceleration and a skid stop.
  // Two subtle weight rises per stride; no bouncy vertical sliding.
  const walkBob=walkAmount*(.016-.008*Math.cos(2*strideClock));
  const bob=(walkingMotion?walkBob:drive*(.009+abs(stride)*.049))+
    dashBurst*.022-dashIgnite*.085-dashBrake*.038-
    (attack?.crouch||0)*.11-land*.09;
  const lean=lerp(a.prevLean,a.lean,alpha)+(attack?.lean||0)-(hit?.21:0);
  // Walk: the entire character leans into forward travel, and the pelvis
  // shifts over the weight-bearing foot. The upper spine counterbalances so
  // the head doesn't lurch around with every stride.
  // Limit the engine's existing walk lean so we don't double the tilt.
  const walkLean=walkAmount*(.077+.009*abs(stride));
  const turnDelta=Math.atan2(sin(a.visualYaw-a.prevVisualYaw),
    cos(a.visualYaw-a.prevVisualYaw));
  const walkTurnBank=walkingMotion?clamp(-turnDelta*.26,-.07,.07)*walkAmount:0;
  const bank=lerp(a.prevBank,a.bank,alpha)+
    (walkingMotion?-supportShift*.50:drive*step*.047)+
    walkTurnBank+(attack?.impact||0)*.02;
  const pitch=(walkingMotion?lean*.48+walkLean:lean)+
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

  // Place weight on the CURRENTLY supporting foot rather than moving the
  // pelvis by an unrelated sine wave. The spine counters this small hip sway.
  if(walkingMotion){
    const hips=view.bones.get('hips')||view.bones.get('pelvis');
    if(hips)hips.position.x+=supportShift;
    root.updateWorldMatrix(true,true);
  }

  // Pelvis leads the stride, ribs/shoulders counter-rotate and head stabilizes.
  // Spine chain makes a strike originate at the feet, not from a disembodied arm.
  // Hips initiate the stride and strike; shoulders counter-rotate.
  const hipTwist=(walkingMotion?walkAmount*.16:drive*.19)*stride+
    (attack?.hip||0)+dashKick*.055;
  // The chest follows the pelvis with a slight delay, then counter-rotates:
  // ribcage and shoulders should visibly move rather than stay rigid while
  // arms/legs take longer steps. Preserve combat poses by gating to walk.
  const torsoTwist=-(walkingMotion?walkAmount*.230:drive*.16)*stride+
    (attack?.twist||0)-dashKick*.075;
  const chestLead=walkingMotion?walkAmount*sin(strideClock-.42):0;
  const chestRoll=walkingMotion?
    (-supportShift*.31+walkAmount*.075*sin(strideClock-.42)):0;
  const chestPitch=walkingMotion?
    walkAmount*(.031+.022*cos(2*strideClock+.48)):0;
  const torsoBend=(walkingMotion?walkAmount*(.045+.012*abs(step)):drive*.047)*abs(step)+
    (attack?.lean||0)*.20+dashBurst*.045;
  rotate(view,'hips',Y,hipTwist,rootQ);
  rotate(view,'pelvis',Y,hipTwist,rootQ);
  rotate(view,'spine_01',Y,torsoTwist*.31,rootQ);
  rotate(view,'spine_02',Y,torsoTwist*.36,rootQ);
  rotate(view,'spine_03',Y,torsoTwist*.33,rootQ);
  rotate(view,'spine_01',X,torsoBend*.25+chestPitch*.15,rootQ);
  rotate(view,'spine_02',X,torsoBend*.45+chestPitch*.45+(hit?-.13:0),rootQ);
  rotate(view,'spine_03',X,torsoBend*.30+chestPitch*.40+(hit?-.13:0),rootQ);
  rotate(view,'spine_01',Z,chestRoll*.20,rootQ);
  rotate(view,'spine_02',Z,chestRoll*.49,rootQ);
  rotate(view,'spine_03',Z,chestRoll*.31+
    (walkingMotion?chestLead*.033:drive*.046*stride)+
    (attack?.twist||0)*-.07,rootQ);
  rotate(view,'neck_01',X,-pitch*(walkingMotion?.37:.21),rootQ);
  rotate(view,'head',Y,-torsoTwist*.16,rootQ);
  rotate(view,'head',X,-pitch*(walkingMotion?.32:.25)+breath*.012,rootQ);
  rotate(view,'clavicle_l',Z,-.025+
    (walkingMotion?walkAmount*.045:drive*.04)*stride,rootQ);
  rotate(view,'clavicle_r',Z,.025-
    (walkingMotion?walkAmount*.045:drive*.04)*stride,rootQ);
  rotate(view,'clavicle_l',Y,walkingMotion?chestLead*.032:0,rootQ);
  rotate(view,'clavicle_r',Y,walkingMotion?-chestLead*.032:0,rootQ);

  // Neutral idle: arms hang at the sides, never return to boxing guard
  // when movement stops. Guard remains exclusive to blocking/attacks.
  const pump=drive*stride;
  const idleL=[-.12,-.985,.01],idleR=[.12,-.985,.01];
  const idleForeL=[-.07,-.98,.018],idleForeR=[.07,-.98,.018];
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
      // Forward-running hands rise while the elbow folds; rearward hands
      // swing down/back with a straighter elbow, independently of shoulder.
      let handX=.32,handY=-.68+travel*.16;
      let handZ=.16+travel*.43;
      if(!dashing){
        // Relaxed idle hands fall close to the OUTER thighs. During the
        // last few frames of a walk, blend their old swing into neutral,
        // without the abrupt elbows-up guard or palms in front of the belly.
        const swing=side==='l'?-Math.sin(strideClock):Math.sin(strideClock);
        const forward=Math.max(0,swing),backward=Math.max(0,-swing);
        handX=lerp(.115,.233+.014*forward,walkFade);
        // Forward elbow flexes, trailing arm opens. Wrist stays outside ribs.
        handY=lerp(-.984+breath*.001,-.89+.255*forward-.01*backward,walkFade);
        handZ=lerp(.012,.045+.49*swing,walkFade);
      }
      if(dashing){
        handX=.42;
        handY=-.57+travel*.09;
        handZ=.15+travel*.20-dashBurst*.53;
      }
      solveLimb(view,'upperarm_'+side,'lowerarm_'+side,'hand_'+side,
        [sgn*reach*handX,reach*handY,reach*handZ],
        [sgn*(dashing?.95:lerp(.055,.30,walkFade)),.05,
          dashing?-.32:-.99],rootQ);
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
    // A relaxed standing pose brings both legs beneath the pelvis rather
    // than leaving the feet in an exaggerated fighting stance.
    let target=relaxedIdle?
      [sign*length*.018,-length*.988,length*.012]:
      [sign*length*.12,
        -length*(.91-lift*.26-brace*.13-jumpCurl*.17),
        length*(.05+stepMotion*.46+(attack?.step||0)*(side==='l'?.18:-.18))];
    if(walkingMotion){
      const foot=side==='l'?leftStep:rightStep;
      const blend=walkAmount;
      const forward=.045+foot.travel;
      const extensionY=Math.min(.946,
        Math.sqrt(Math.max(.55,.985*.985-forward*forward))-.007);
      // The leg is long and near-straight in stance, flexing as the
      // opposite foot swings past. Compensate the small root bob for contact.
      const walkTarget=[sign*length*.035,
        -length*(extensionY-foot.lift)-(foot.contact?walkBob:0),
        length*forward];
      target=blendVec(target,walkTarget,blend);
      // True world-space planted-foot IK. Keep the ankle fixed during stance
      // as the pelvis travels/rotates over it. Unlock during swing/idle/dash.
      // Manual QA pose scrubbing without character travel uses the analytic
      // step curve above, so static inspection remains deterministic.
      if(!view.footPlants)view.footPlants={l:null,r:null};
      const movingRoot=Math.hypot(a.x-a.prevX,a.z-a.prevZ)>.0001;
      const worldHip=hip.getWorldPosition(vec());
      let planted=view.footPlants[side];
      // After a teleport, reset or large displacement, discard a cached
      // contact point rather than pulling the leg toward the old location.
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
    if(airborne)target=[sign*length*.15,-length*.63,length*.24];
    solveLimb(view,'thigh_'+side,'calf_'+side,'foot_'+side,
      target,[sign*.12,.15,1],rootQ);
  }
  rotate(view,'foot_l',X,(walkingMotion?leftStep.roll*walkAmount:
    -leftLeg*strideDamp*.39)+land*.14+dashBrake*.11,rootQ);
  rotate(view,'foot_r',X,(walkingMotion?rightStep.roll*walkAmount:
    -rightLeg*strideDamp*.39)+land*.14+dashBrake*.11,rootQ);

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
    state:a.state,hipTwist,torsoTwist,chestRoll,chestPitch,chestLead,
    lean:pitch,walk:drive,
    walkContactL:leftStep.contact,walkContactR:rightStep.contact,
    walkLiftL:leftStep.lift,walkLiftR:rightStep.lift,walkBob,
    walkFootL:leftStep.travel,walkFootR:rightStep.travel,
    walkForwardLean:walkLean,walkTurnBank,
    walkHipShift:walkingMotion?supportShift:0,
    plantedL:!!view.footPlants?.l,plantedR:!!view.footPlants?.r,
    idleWeight:1-walkFade,relaxedIdle,
    rootPitch:pitch,rootBank:bank,
    dash,dashIgnite,dashBurst,dashBrake,attackReach:attack?.reach||0,
    attackWind:attack?.wind||0,attackImpact:attack?.impact||0,
    chest:vec().copy(view.bones.get('spine_03')?.getWorldPosition(temp)||root.position).toArray()
  };
}

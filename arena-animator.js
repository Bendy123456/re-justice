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

// One anatomical walk step: the planted foot rolls backward under the body
// for 60% of its cycle; the other 40% lifts, clears the ground and swings ahead.
// Continuous positions at toe-off/heel-strike, not independent sine-wave legs.
function walkStep(phase){
  const TAU=Math.PI*2;
  const u=((phase/TAU)%1+1)%1;
  const stance=.60;
  if(u<stance){
    const t=u/stance;
    return {contact:true,travel:lerp(.38,-.38,t),lift:0,
      roll:t<.18?lerp(.12,0,t/.18):t>.77?lerp(0,-.19,(t-.77)/.23):0,
      support:Math.sin(Math.PI*t)**2};
  }
  const t=(u-stance)/(1-stance);
  return {contact:false,travel:lerp(-.38,.38,ease(t)),
    lift:.205*Math.sin(Math.PI*t),roll:Math.sin(Math.PI*t)*.13,
    support:0};
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
  // Only the rendered skeleton is animated; hitboxes remain fixed.
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
  const drive=(attack||blocked||hit)?0:clamp(walk+dash);
  const walkAmount=naturalWalk?clamp(walk):0;
  const leftStep=walkStep(strideClock),rightStep=walkStep(strideClock+Math.PI);
  const dashFrames=Math.max(0,Number(a.dashElapsed||0));
  const dashIgnite=dashing?1-ease(dashFrames/3):0;
  const dashBurst=dashing?ease(dashFrames/3)*(1-ease((dashFrames-9)/3)):0;
  const dashKick=dashing?sin(clamp(dashFrames/11)*Math.PI):0;
  const dashBrake=clamp(Number(a.dashRecovery||0)/7);
  const land=clamp(Number(a.landingFrames||0)/7);
  const breath=sin((a.animClock+alpha)*.063);
  // Superhero/anime: crouched ignition, flying acceleration and a skid stop.
  // Two subtle weight rises per stride; no bouncy vertical sliding.
  const walkBob=walkAmount*(.019-.011*Math.cos(2*strideClock));
  const bob=(naturalWalk?walkBob:drive*(.009+abs(stride)*.049))+
    dashBurst*.022-dashIgnite*.085-dashBrake*.038-
    (attack?.crouch||0)*.11-land*.09;
  const lean=lerp(a.prevLean,a.lean,alpha)+(attack?.lean||0)-(hit?.21:0);
  // Walk: the entire character leans into forward travel, and the pelvis
  // shifts over the weight-bearing foot. The upper spine counterbalances so
  // the head doesn't lurch around with every stride.
  // Limit the engine's existing walk lean so we don't double the tilt.
  const walkLean=naturalWalk?walkAmount*(.082+.012*abs(stride)):0;
  const turnDelta=Math.atan2(sin(a.visualYaw-a.prevVisualYaw),
    cos(a.visualYaw-a.prevVisualYaw));
  const walkTurnBank=naturalWalk?clamp(-turnDelta*.26,-.07,.07):0;
  const bank=lerp(a.prevBank,a.bank,alpha)+
    (naturalWalk?-walkAmount*.045*step:drive*step*.047)+
    walkTurnBank+(attack?.impact||0)*.02;
  const pitch=(naturalWalk?lean*.48+walkLean:lean)+
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

  // Weight shifts onto each planted leg. The original torso can rotate,
  // but this lateral pelvis translation makes support actually visible.
  if(naturalWalk){
    const hips=view.bones.get('hips')||view.bones.get('pelvis');
    if(hips)hips.position.x+=walkAmount*.049*step;
    root.updateWorldMatrix(true,true);
  }

  // Pelvis leads the stride, ribs/shoulders counter-rotate and head stabilizes.
  // Spine chain makes a strike originate at the feet, not from a disembodied arm.
  // Hips initiate the stride and strike; shoulders counter-rotate.
  const hipTwist=(naturalWalk?walkAmount*.16:drive*.19)*stride+
    (attack?.hip||0)+dashKick*.055;
  const torsoTwist=-(naturalWalk?walkAmount*.14:drive*.16)*stride+
    (attack?.twist||0)-dashKick*.075;
  const torsoBend=(naturalWalk?walkAmount*(.045+.012*abs(step)):drive*.047)*abs(step)+
    (attack?.lean||0)*.20+dashBurst*.045;
  rotate(view,'hips',Y,hipTwist,rootQ);
  rotate(view,'pelvis',Y,hipTwist,rootQ);
  rotate(view,'spine_01',Y,torsoTwist*.31,rootQ);
  rotate(view,'spine_02',Y,torsoTwist*.36,rootQ);
  rotate(view,'spine_03',Y,torsoTwist*.33,rootQ);
  rotate(view,'spine_01',X,torsoBend*.25,rootQ);
  rotate(view,'spine_02',X,torsoBend*.45+(hit?-.13:0),rootQ);
  rotate(view,'spine_03',X,torsoBend*.30+(hit?-.13:0),rootQ);
  rotate(view,'spine_03',Z,(naturalWalk?walkAmount*.017:drive*.046)*
    stride+(attack?.twist||0)*-.07,rootQ);
  rotate(view,'neck_01',X,-pitch*(naturalWalk?.37:.21),rootQ);
  rotate(view,'head',Y,-torsoTwist*.16,rootQ);
  rotate(view,'head',X,-pitch*(naturalWalk?.32:.25)+breath*.012,rootQ);
  rotate(view,'clavicle_l',Z,-.025+
    (naturalWalk?walkAmount*.025:drive*.04)*stride,rootQ);
  rotate(view,'clavicle_r',Z,.025-
    (naturalWalk?walkAmount*.025:drive*.04)*stride,rootQ);

  // A relaxed walk keeps the hands OUTSIDE the ribs and down beside
  // the hips. The old perpetual high boxing guard sent wrists through the
  // abdomen whenever the torso counter-rotated. Blend in the guard only when
  // stopping or engaging in combat; arms pump opposite the corresponding leg.
  const pump=drive*stride;
  const idleL=[-.43,-.58,.55],idleR=[.43,-.58,.55];
  const idleForeL=[-.26,.39,.81],idleForeR=[.26,.39,.81];
  const walkL=[-.56,-.84,.26-pump*.76];
  const walkR=[.56,-.84,.26+pump*.76];
  const walkForeL=[-.26,-.65,.38-pump*.20];
  const walkForeR=[.26,-.65,.38+pump*.20];
  const walkBlend=ease(clamp(walk));
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
      if(naturalWalk){
        // Opposite the same-side leg: a loose elbow, relaxed wrist and
        // a visible but restrained shoulder swing around the rib cage.
        // Left/right arms counter-swing to the SAME side leg, not a quarter
        // cycle ahead of it. Forward travel folds the elbow and raises the
        // wrist; the trailing arm straightens as it moves behind the hip.
        // The target is relative to the live shoulder so torso twist and
        // side-to-side weight shifts remain coupled to the arm movement.
        const swing=side==='l'?-Math.sin(strideClock):Math.sin(strideClock);
        const forward=Math.max(0,swing),backward=Math.max(0,-swing);
        handX=.215+.012*forward;
        handY=-.87+.20*forward-.012*backward;
        handZ=.045+.44*swing;
      }
      if(dashing){
        handX=.42;
        handY=-.57+travel*.09;
        handZ=.15+travel*.20-dashBurst*.53;
      }else if(!locomoting){
        handX=.37;handY=-.57;handZ=.51;
      }
      solveLimb(view,'upperarm_'+side,'lowerarm_'+side,'hand_'+side,
        [sgn*reach*handX,reach*handY,reach*handZ],
        [sgn*(naturalWalk?.25:.95),.12,naturalWalk?-.95:-.32],rootQ);
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
    const wristSwing=naturalWalk?
      (side==='l'?-sin(strideClock-.27):sin(strideClock-.27)):phase;
    rotate(view,'hand_'+side,X,drive*wristSwing*(naturalWalk?.13:.17)+
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
  const legL=view.legSides?.l??-1,legR=view.legSides?.r??1;
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
    let target=[sign*length*.12,
      -length*(.91-lift*.26-brace*.13-jumpCurl*.17),
      length*(.05+stepMotion*.46+(attack?.step||0)*(side==='l'?.18:-.18))];
    if(naturalWalk){
      const foot=side==='l'?leftStep:rightStep;
      const blend=walkAmount;
      // Foot planted ~60% of cycle. During swing, ankle rises and the
      // knee flexes naturally as the foot clears the ground.
      // Longer reach needs a slightly flexed supporting leg instead of
      // asking the two-bone solver to stretch past its anatomical limit.
      const forward=.045+foot.travel;
      const extensionY=Math.min(.946,
        Math.sqrt(Math.max(.55,.985*.985-forward*forward))-.007);
      const walkTarget=[sign*length*.035,
        -length*(extensionY-foot.lift),length*forward];
      target=blendVec(target,walkTarget,blend);
    }
    if(airborne)target=[sign*length*.15,-length*.63,length*.24];
    solveLimb(view,'thigh_'+side,'calf_'+side,'foot_'+side,
      target,[sign*.12,.15,1],rootQ);
  }
  rotate(view,'foot_l',X,(naturalWalk?leftStep.roll*walkAmount:
    -leftLeg*strideDamp*.39)+land*.14+dashBrake*.11,rootQ);
  rotate(view,'foot_r',X,(naturalWalk?rightStep.roll*walkAmount:
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
    state:a.state,hipTwist,torsoTwist,lean:pitch,walk:drive,
    walkContactL:leftStep.contact,walkContactR:rightStep.contact,
    walkLiftL:leftStep.lift,walkLiftR:rightStep.lift,walkBob,
    walkFootL:leftStep.travel,walkFootR:rightStep.travel,
    walkForwardLean:walkLean,walkTurnBank,
    walkHipShift:naturalWalk?walkAmount*.049*step:0,
    rootPitch:pitch,rootBank:bank,
    dash,dashIgnite,dashBurst,dashBrake,attackReach:attack?.reach||0,
    attackWind:attack?.wind||0,attackImpact:attack?.impact||0,
    chest:vec().copy(view.bones.get('spine_03')?.getWorldPosition(temp)||root.position).toArray()
  };
}

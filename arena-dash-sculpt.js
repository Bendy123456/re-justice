/* RE Justice — individually authored 11-tick athletic dash.
 * Visuals only: retains gameplay velocity, collision, hit windows and yaw.
 * Three beats: explosive loaded push-off, diagonal traveling sprint lunge,
 * heel/toe recovery back into the existing authored fighting guard.
 * All IK works on the actual character's skinned bone lengths.
 */
import * as THREE from 'three';

const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const vec=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const UP=vec(0,1,0);
const JOINTS=['pelvis','hips','spine_01','spine_02','spine_03',
  'neck_01','head','clavicle_l','clavicle_r',
  'upperarm_l','lowerarm_l','hand_l',
  'upperarm_r','lowerarm_r','hand_r',
  'thigh_l','calf_l','foot_l','thigh_r','calf_r','foot_r',
  'ball_l','ball_r'];
function bone(view,name){return view.bones.get(name);}
function spin(view,name,axis,angle,rootQ){
  const b=bone(view,name);
  if(!b?.parent||Math.abs(angle)<.00001)return;
  const parent=b.parent.getWorldQuaternion(new THREE.Quaternion());
  const worldAxis=axis.clone().applyQuaternion(rootQ);
  const dq=new THREE.Quaternion().setFromAxisAngle(worldAxis,angle);
  b.quaternion.premultiply(parent.clone().invert().multiply(dq).multiply(parent)).normalize();
  b.updateWorldMatrix(false,true);
}
function aim(parent,child,direction){
  if(!parent?.parent||!child||direction.lengthSq()<1e-9)return;
  const p=parent.getWorldPosition(vec());
  const original=child.getWorldPosition(vec()).sub(p);
  if(original.lengthSq()<1e-9)return;
  const turn=new THREE.Quaternion().setFromUnitVectors(
    original.normalize(),direction.clone().normalize());
  const frame=parent.parent.getWorldQuaternion(new THREE.Quaternion());
  parent.quaternion.premultiply(frame.clone().invert().multiply(turn).multiply(frame)).normalize();
  parent.updateWorldMatrix(false,true);
}
function solve(view,upperName,midName,endName,goal,pole){
  const upper=bone(view,upperName),mid=bone(view,midName),end=bone(view,endName);
  if(!upper||!mid||!end)return;
  const p=upper.getWorldPosition(vec()),m=mid.getWorldPosition(vec()),
    f=end.getWorldPosition(vec()),a=p.distanceTo(m),b=m.distanceTo(f);
  if(a<.01||b<.01)return;
  const to=goal.clone().sub(p),length=to.length();
  if(length<.001)return;
  const distance=clamp(length,Math.abs(a-b)+.004,a+b-.012);
  const axis=to.multiplyScalar(1/length);
  const along=(a*a-b*b+distance*distance)/(2*distance);
  const h=Math.sqrt(Math.max(0,a*a-along*along));
  const normal=pole.clone().addScaledVector(axis,-axis.dot(pole));
  if(normal.lengthSq()<.0001)normal.set(0,0,1).addScaledVector(axis,-axis.z);
  normal.normalize();
  const kneeGoal=p.clone().addScaledVector(axis,along).addScaledVector(normal,h);
  aim(upper,mid,kneeGoal.sub(p));
  aim(mid,end,goal.clone().sub(mid.getWorldPosition(vec())));
}
export function applyDashSculpt(view,{rootQ,actorYaw=0,active=false,
  elapsed=0,recovery=0,groundY=0,travelSide=0}={}){
  // Attack/block/hit/jump/walk must not inherit a sticky dash pose.
  const release=!active&&recovery>0;
  const strength=active?(.76+.24*smooth(elapsed/3)):
    release?.92*smooth(recovery/7):0;
  if(strength<.0001)return {active:false,weight:0,phase:0};
  const phase=active?clamp((elapsed-1)/10):1;
  const ignition=1-smooth((phase-.02)/.28);
  const surge=smooth(phase/.24)*(1-smooth((phase-.72)/.28));
  const land=smooth((phase-.68)/.32);
  const root=view.root;
  const names=JOINTS.filter(n=>bone(view,n));
  // Snapshot the already evaluated locomotion pose. The authored override
  // blends FROM it rather than replacing the preceding animation abruptly.
  const original=new Map(names.map(name=>[name,bone(view,name).quaternion.clone()]));
  const pelvis=bone(view,'pelvis')||bone(view,'hips');
  const beforeHips=pelvis?.position.clone();
  const lHip=bone(view,'thigh_l'),lKnee=bone(view,'calf_l'),lFoot=bone(view,'foot_l');
  const legLength=lHip&&lKnee&&lFoot?
    lHip.getWorldPosition(vec()).distanceTo(lKnee.getWorldPosition(vec()))+
    lKnee.getWorldPosition(vec()).distanceTo(lFoot.getWorldPosition(vec())):.9;

  // Measured hip height keeps the loaded leg low for a powerful push-off.
  // Use the parent frame so this remains vertical when the avatar leans.
  if(pelvis?.parent&&lHip){
    const sole=view.footSoleHeights?.l??.09;
    const current=lHip.getWorldPosition(vec()).y;
    const target=groundY+sole+legLength*(.73+.08*land-.045*ignition);
    const delta=vec(0,target-current,0);
    const frame=pelvis.parent.getWorldQuaternion(new THREE.Quaternion());
    pelvis.position.add(delta.applyQuaternion(frame.invert()));
    root.updateWorldMatrix(true,true);
  }
  // Chest moves over the forward knee, but the head keeps eyes on travel.
  spin(view,'spine_01',vec(1,0,0),.095*ignition+.055*surge,rootQ);
  spin(view,'spine_02',vec(1,0,0),.105*surge-.045*land,rootQ);
  spin(view,'spine_03',vec(1,0,0),.055*surge,rootQ);
  spin(view,'spine_02',UP,clamp(travelSide,-1,1)*.13*surge,rootQ);
  spin(view,'neck_01',vec(1,0,0),-.08*surge,rootQ);
  spin(view,'head',vec(1,0,0),-.09*surge+.035*land,rootQ);

  root.updateWorldMatrix(true,true);
  for(const side of ['l','r']){
    const s=view.armSides?.[side]??(side==='l'?1:-1);
    const shoulder=bone(view,'upperarm_'+side),
      elbow=bone(view,'lowerarm_'+side),hand=bone(view,'hand_'+side);
    if(!shoulder||!elbow||!hand)continue;
    const reach=shoulder.getWorldPosition(vec()).distanceTo(elbow.getWorldPosition(vec()))+
      elbow.getWorldPosition(vec()).distanceTo(hand.getWorldPosition(vec()));
    // Opposing sprint arm shapes: one bent fist leads near the jaw, the
    // other drives behind the hip. They fold back into a guarded brake.
    const leading=side==='l';
    const forward=leading?.54:-.34;
    const down=leading?-.36:-.61;
    const guard=vec(s*reach*.28,reach*(-.33-.08*land),
      reach*(.29+.04*land));
    const burst=vec(s*reach*(leading?.23:.33),reach*down,
      reach*forward);
    const desired=guard.clone().lerp(burst,surge);
    const shoulderWorld=shoulder.getWorldPosition(vec());
    const goal=desired.applyQuaternion(rootQ).add(shoulderWorld);
    const pole=vec(s*.72,-.03,leading?.27:-.45).applyQuaternion(rootQ);
    solve(view,'upperarm_'+side,'lowerarm_'+side,'hand_'+side,goal,pole);
    spin(view,'hand_'+side,vec(1,0,0),leading?-.13:.09,rootQ);
  }
  root.updateWorldMatrix(true,true);
  for(const side of ['l','r']){
    const sign=view.legSides?.[side]??(side==='l'?1:-1);
    const hip=bone(view,'thigh_'+side),knee=bone(view,'calf_'+side),
      foot=bone(view,'foot_'+side);
    if(!hip||!knee||!foot)continue;
    // At ignition the back leg loads the ground. During the burst the
    // leading knee tucks forward while the rear leg stretches into push-off.
    const lead=side==='l';
    const z=(lead?.39:-.36)*legLength*(.84+.16*surge)+
      (lead?-.14:.08)*legLength*land;
    const x=sign*legLength*(.18+.03*land);
    const world=root.position.clone().add(vec(x,0,z).applyQuaternion(rootQ));
    const plantedHeight=groundY+(view.footSoleHeights?.[side]??.09)+.005;
    world.y=plantedHeight+(lead?.17*surge:.055*ignition)*legLength;
    const from=hip.getWorldPosition(vec());
    const upper=from.distanceTo(knee.getWorldPosition(vec()));
    const lower=knee.getWorldPosition(vec()).distanceTo(foot.getWorldPosition(vec()));
    // Keep the ankle physically reachable without making the foot levitate.
    const vert=world.y-from.y,dx=world.x-from.x,dz=world.z-from.z;
    const maxHorizontal=Math.sqrt(Math.max(.0001,
      (upper+lower-.017)**2-vert*vert));
    const dist=Math.hypot(dx,dz);
    if(dist>maxHorizontal&&dist>0){
      world.x=from.x+dx*maxHorizontal/dist;
      world.z=from.z+dz*maxHorizontal/dist;
    }
    const pole=vec(sign*.22,-.08,1.1).applyQuaternion(rootQ);
    solve(view,'thigh_'+side,'calf_'+side,'foot_'+side,world,pole);
    // Contact foot is flat; lifted front toe points slightly down into
    // motion before coming flat on recovery.
    const neutral=view.footRestWorldQuats?.[side];
    if(neutral&&foot.parent){
      const desired=new THREE.Quaternion().setFromAxisAngle(UP,
        actorYaw+(lead?.09:-.08)).multiply(neutral);
      const parentQ=foot.parent.getWorldQuaternion(new THREE.Quaternion());
      foot.quaternion.copy(parentQ.invert().multiply(desired)).normalize();
      foot.updateWorldMatrix(false,true);
      if(lead&&surge>.05)spin(view,'foot_'+side,vec(1,0,0),-.17*surge,rootQ);
    }
  }
  root.updateWorldMatrix(true,true);
  // Stage-dependent transition, no clipping back to rest bind pose.
  for(const name of names){
    const b=bone(view,name);
    const orig=original.get(name);
    if(b&&orig){
      const authored=b.quaternion.clone();
      b.quaternion.copy(orig).slerp(authored,strength).normalize();
    }
  }
  if(pelvis&&beforeHips){
    const authored=pelvis.position.clone();
    pelvis.position.copy(beforeHips).lerp(authored,strength);
  }
  root.updateWorldMatrix(true,true);
  return {active:true,weight:strength,phase,ignition,surge,land};
}

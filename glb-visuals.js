/* RE-Justice GLB visual presentation.
 * Three.js meshes are READ-ONLY with respect to the fixed 2D simulation.
 * No hitboxes, move data, physics, input or navigation are modified here.
 */
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';

const FG=window.FG=window.FG||{};
const ROSTER=FG.MODEL_ROSTER;
const CW=1280,CH=720,PIXELS_PER_METER=102;
const PREVIEW_SCALE=3.02,COMBAT_SCALE=1.00;
const ATTACK_TIME_EPSILON=.00001;
const AIR_STANCE=0.18,GROUND_Y=0;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};

class RosterGLBPresentation {
  constructor(){
    this.models={};this.instances=new Map();this.portaits=new Map();
    this.loaded=new Set();this.failed=new Set();this.loading=new Set();
    this.enabled=false;this.renderer=null;this.scene=null;this.camera=null;
    this.shadowTexture=null;this.lastKey='';this.frame=0;
    if(!ROSTER) return;
    try{
      this.renderer=new THREE.WebGLRenderer({
        alpha:true,antialias:true,preserveDrawingBuffer:true,
        powerPreference:'high-performance'
      });
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(CW,CH,false);
      this.renderer.setClearColor(0,0);
      this.renderer.outputColorSpace=THREE.SRGBColorSpace;
      this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure=1.05;
      this.renderer.shadowMap.enabled=false;
      this.scene=new THREE.Scene();
      this.camera=this.makeCamera(CW,CH,PIXELS_PER_METER);
      this.scene.add(new THREE.HemisphereLight(0xdbe9fa,0x273341,1.75));
      const key=new THREE.DirectionalLight(0xffeddc,2.45);
      key.position.set(-5,8,9);this.scene.add(key);
      this.rim=new THREE.DirectionalLight(0x9dc3ec,2.8);
      this.rim.position.set(4,6,-4);this.scene.add(this.rim);
      const fill=new THREE.DirectionalLight(0x9cacc5,.65);
      fill.position.set(3,2,8);this.scene.add(fill);
      this.shadowTexture=this.makeShadow();
      this.loader=new GLTFLoader();
      this.enabled=true;
      this.loadModel('batman');
      this.loadModel('male');
    }catch(error){
      this.error=String(error);
      this.enabled=false;
      try{this.renderer?.dispose()}catch(_){}
    }
  }
  makeCamera(w,h,ppm){
    const cam=new THREE.OrthographicCamera(
      -w/(ppm*2),w/(ppm*2),h/(ppm*2),-h/(ppm*2),.1,150);
    cam.position.set(0,0,30);
    cam.lookAt(0,0,0);
    return cam;
  }
  makeShadow(){
    const c=document.createElement('canvas');c.width=128;c.height=128;
    const x=c.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);
    g.addColorStop(0,'rgba(0,0,0,.56)');
    g.addColorStop(.55,'rgba(0,0,0,.17)');
    g.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle=g;x.fillRect(0,0,128,128);
    return new THREE.CanvasTexture(c);
  }
  loadModel(which){
    if(!this.enabled||this.loaded.has(which)||this.loading.has(which)||this.failed.has(which))return;
    const path=ROSTER.MODEL_PATHS[which];
    this.loading.add(which);
    this.loader.loadAsync(path).then(gltf=>{
      this.models[which]=gltf.scene;
      this.loaded.add(which);this.loading.delete(which);
      this.lastKey='';
      this.portaits.clear();
    }).catch(err=>{
      this.failed.add(which);this.loading.delete(which);
      console.warn('RE-Justice 3D fallback:',which,String(err));
    });
  }
  modelKey(id){return ROSTER.heroModel(id);}
  supported(f,assets){
    if(!this.enabled)return false;
    const id=f?.def?.id||f?.id;
    const key=this.modelKey(id);
    if(!key||!this.loaded.has(key))return false;
    // If a custom 2D sprite is supplied, keep its configured priority.
    if(assets?.image?.('characters',id))return false;
    return true;
  }
  makeInstance(key,name){
    const existing=this.instances.get(name);
    if(existing?.kind===key)return existing;
    if(existing){this.scene.remove(existing.root);this.instances.delete(name);}
    const copy=cloneSkeleton(this.models[key]);
    const root=new THREE.Group();
    root.name='render-only:'+name;
    root.add(copy);
    this.scene.add(root);
    const bones=new Map(),rests=new Map();
    copy.traverse(o=>{
      if(o.isBone){
        bones.set(o.name.toLowerCase(),o);
        rests.set(o.name.toLowerCase(),o.quaternion.clone());
      }
      if(o.isMesh){
        o.castShadow=false;o.receiveShadow=false;
        o.frustumCulled=false;
      }
    });
    const shadowMat=new THREE.SpriteMaterial({
      map:this.shadowTexture,transparent:true,depthWrite:false,opacity:.42
    });
    const shadow=new THREE.Sprite(shadowMat);
    shadow.position.set(0,.038,-.45);shadow.scale.set(1.25,.17,1);
    root.add(shadow);
    const obj={kind:key,name,root,bones,rests,copy};
    this.instances.set(name,obj);
    return obj;
  }
  resetPose(o){
    for(const [name,bone] of o.bones){
      bone.quaternion.copy(o.rests.get(name));
    }
  }
  poseBone(o,name,rz=0,rx=0,ry=0){
    const bone=o.bones.get(name);
    if(!bone)return;
    // GLTF armature bones are oriented along anatomical bone axes, NOT
    // standardized camera axes. A local-Z rotation barely moves a T-posed
    // arm. Transform the desired side-view world rotation into the current
    // bone's parent space so elbows and shoulders bend on screen.
    bone.parent.updateWorldMatrix(true,false);
    const parentQ=bone.parent.getWorldQuaternion(new THREE.Quaternion());
    const axis=new THREE.Vector3(0,0,1);
    const worldQ=new THREE.Quaternion().setFromAxisAngle(axis,rz);
    const localQ=parentQ.clone().invert().multiply(worldQ).multiply(parentQ);
    bone.quaternion.premultiply(localQ);
    if(rx||ry){
      const tilt=new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,0));
      bone.quaternion.multiply(tilt);
    }
    bone.updateMatrixWorld(true);
  }
  aimSegment(o,startName,endName,target){
    const bone=o.bones.get(startName), child=o.bones.get(endName);
    if(!bone||!child)return;
    // Anatomical Blender joints have arbitrary bind axes; aim from actual
    // bone endpoints instead of assuming local XYZ matches world rotations.
    o.root.updateMatrixWorld(true);
    const p=bone.getWorldPosition(new THREE.Vector3());
    const end=child.getWorldPosition(new THREE.Vector3());
    const original=end.sub(p);
    if(original.lengthSq()<1e-8)return;
    original.normalize();
    const dir=new THREE.Vector3(...target).normalize();
    const worldDelta=new THREE.Quaternion().setFromUnitVectors(original,dir);
    const parentWorld=bone.parent.getWorldQuaternion(new THREE.Quaternion());
    const localDelta=parentWorld.clone().invert().multiply(worldDelta).multiply(parentWorld);
    bone.quaternion.premultiply(localDelta).normalize();
    bone.updateWorldMatrix(false,true);
  }
  pose(o,f,tick){
    this.resetPose(o);
    o.root.updateMatrixWorld(true);
    const state=f.state||'idle';
    const attack=f.attack||null;
    const isCrouch=Boolean(f.crouch||state==='crouch'||f.blockLow);
    const grounded=f.grounded!==false;
    const hit=state==='hitstun'||state==='blockstun';
    const walk=state==='walk';
    const block=Boolean(f.blocking||state==='block');
    const phase=attack?Number(f.attackTick||0):0;
    const startup=Math.max(1,Number(attack?.startup||5));
    const active=Math.max(1,Number(attack?.active||3));
    const recovery=Math.max(1,Number(attack?.recovery||10));
    let strike=0,windup=0;
    if(attack){
      if(phase<startup)windup=smooth((phase+ATTACK_TIME_EPSILON)/startup);
      else if(phase<startup+active)strike=smooth((phase-startup+1)/active);
      else strike=1-smooth((phase-startup-active)/recovery);
    }
    const time=Number(f.animClock||tick||0);
    const breath=Math.sin(time*.074)*.025;
    const swing=walk?Math.sin(time*.24)*.25:0;
    const left=-1.02 + swing*.22;
    const right=1.02 - swing*.22;
    this.poseBone(o,'spine_02',hit?-.14:attack?-.10*strike:breath*.07);
    this.poseBone(o,'spine_03',hit?-.19:attack?.10*strike:breath*.1);
    this.poseBone(o,'Head',hit?.11:-breath*.12);
    // Solve real joint-to-joint directions so all Blender rigs leave T pose.
    // Strike extension is intentionally visual-only and frame-accurate.
    const guard=block?-.13:0;
    this.poseBone(o,'clavicle_l',.035);
    this.poseBone(o,'clavicle_r',-.035);
    const attackWeight=clamp(strike,0,1);
    const lUpper=[-.30-attackWeight*.58,-.76+attackWeight*.56,.37-attackWeight*.17];
    const lFore=[-.24-attackWeight*.70,.57-attackWeight*.64,.76-attackWeight*.25];
    this.aimSegment(o,'upperarm_l','lowerarm_l',lUpper);
    this.aimSegment(o,'upperarm_r','lowerarm_r',[.31,-.79+guard,.37]);
    this.aimSegment(o,'lowerarm_l','hand_l',lFore);
    this.aimSegment(o,'lowerarm_r','hand_r',[.23,.55,.75]);
    this.poseBone(o,'thigh_l',(.06+swing)*.48+(isCrouch?-.46:0));
    this.poseBone(o,'thigh_r',(-.06-swing)*.48+(isCrouch?.46:0));
    this.poseBone(o,'calf_l',isCrouch?.75:walk?Math.max(0,-swing)*.22:0);
    this.poseBone(o,'calf_r',isCrouch?-.75:walk?Math.min(0,swing)*.22:0);
    if(!grounded){
      this.poseBone(o,'thigh_l',-.21);
      this.poseBone(o,'thigh_r',.21);
      this.poseBone(o,'calf_l',.35);
      this.poseBone(o,'calf_r',-.35);
    }
    if(attack){
      if(attack.kind==='crouching')this.poseBone(o,'spine_02',.18);
      if(attack.kind==='airborne')this.poseBone(o,'spine_02',-.14);
    }
    if(state==='victory'){
      this.poseBone(o,'upperarm_l',-.46);
      this.poseBone(o,'upperarm_r',.46);
      this.poseBone(o,'lowerarm_l',.45);
      this.poseBone(o,'lowerarm_r',-.45);
    }
    if(state==='knockdown'){
      this.poseBone(o,'spine_02',-.74);
      this.poseBone(o,'spine_03',-.30);
    }
    o.root.userData.crouchYOffset=isCrouch?-.23:0;
  }
  position(o,f,x,feet,zoom,tick){
    o.root.visible=true;
    const facing=Number(f.facing||1)>=0?1:-1;
    // Pose in natural unmirrored space, then mirror the finished skeleton.
    // Avoid extracting quaternions through a negative-scale transform.
    o.root.scale.set(zoom,zoom,zoom);
    o.root.position.set((x-CW/2)/PIXELS_PER_METER,
      (CH/2-feet)/PIXELS_PER_METER,0);
    o.root.rotation.set(0,0,0);
    this.pose(o,f,tick);
    o.root.scale.x=facing*zoom;
    o.root.rotation.y=facing*.20;
    o.root.position.y+=(o.root.userData.crouchYOffset||0)*zoom;
  }
  hideInstances(){for(const obj of this.instances.values())obj.root.visible=false;}
  drawScene(ctx){
    if(!this.renderer||!this.enabled)return false;
    try{
      this.renderer.setSize(CW,CH,false);
      this.renderer.render(this.scene,this.camera);
      ctx.drawImage(this.renderer.domElement,0,0,CW,CH);
      return true;
    }catch(e){this.error=String(e);this.enabled=false;console.warn('3D renderer disabled:',e);return false;}
  }
  drawFight(ctx,g){
    if(!this.enabled||!g?.fighters?.length)return null;
    const available=g.fighters.filter(f=>this.supported(f,g.assets));
    if(!available.length)return null;
    this.hideInstances();
    const used=new Set();
    for(const f of available){
      const key=this.modelKey(f.def.id);
      const o=this.makeInstance(key,'fighter:'+f.slot);
      this.position(o,f,f.x,f.y,COMBAT_SCALE,Number(f.animClock||0));
      used.add(f.slot);
    }
    if(!this.drawScene(ctx))return null;
    return used;
  }
  drawSelect(ctx,def,frame){
    if(!this.supported(def,null))return false;
    this.hideInstances();
    const o=this.makeInstance(this.modelKey(def.id),'select');
    const actor={def,x:640,y:642,facing:1,state:'idle',animClock:frame,grounded:true};
    this.position(o,actor,640,642,PREVIEW_SCALE,frame);
    return this.drawScene(ctx);
  }
  portraitFor(def){
    if(!this.supported(def,null))return null;
    const which=this.modelKey(def.id);
    if(this.portaits.has(which))return this.portaits.get(which);
    this.hideInstances();
    const o=this.makeInstance(which,'portrait');
    o.root.visible=true;
    this.pose(o,{state:'idle',grounded:true,animClock:0},0);
    o.root.position.set(0,0,0);
    o.root.scale.setScalar(1);
    o.root.rotation.y=.12;
    const cam=new THREE.OrthographicCamera(-.52,.52,.68,-.68,.01,30);
    cam.position.set(0,1.39,8.0);
    cam.lookAt(0,1.39,0);
    const oldWidth=this.renderer.domElement.width,oldHeight=this.renderer.domElement.height;
    try{
      this.renderer.setSize(224,294,false);
      this.renderer.render(this.scene,cam);
      const tile=document.createElement('canvas');tile.width=112;tile.height=147;
      const c=tile.getContext('2d');
      const bg=c.createLinearGradient(0,0,0,147);
      bg.addColorStop(0,'#394553');bg.addColorStop(1,'#121923');
      c.fillStyle=bg;c.fillRect(0,0,112,147);
      c.drawImage(this.renderer.domElement,0,0,112,147);
      this.portaits.set(which,tile);
      return tile;
    }catch(e){
      console.warn('3D portrait fallback:',e);
      return null;
    }finally{
      this.renderer.setSize(oldWidth,oldHeight,false);
      this.lastKey='';
    }
  }
}
FG.GLTFPresentation=RosterGLBPresentation;
window.dispatchEvent(new CustomEvent('rejustice:3d-ready'));

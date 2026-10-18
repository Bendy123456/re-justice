/* RE-Justice original 3D Training Arena — gameplay prototype.
   Simulation: exact 60Hz through existing Game.step fixed timestep.
   Renderer: Three.js; Blender GLB arena and original rigged character assets.
   No mesh physics; deterministic 2D XZ circles for wall/tree/character collision.
   Standard Gamepad API and keyboard use the existing input layer.
*/
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';

const FG=window.FG;
const FPS=60,STEP=1/FPS,ARENA_RADIUS=34,WALL_GAP=1.2,TREE_RADIUS=3.15,RADIUS=.52;
const RUN=7.1,BACK=4.8,STRAFE=5.7,DASH=16.4,DASH_FRAMES=11,DASH_COOLDOWN=44;
const JUMP=11.0,GRAVITY=25,ROUND_FRAMES=99*60,INTRO_FRAMES=78,KO_FRAMES=110;
const CAM_DIST=4.75,CAM_HEIGHT=2.85,CAM_SIDE=1.15,CAM_LERP=.13;
const clamp=(a,b,c)=>Math.max(b,Math.min(c,a));
const lerp=(a,b,t)=>a+(b-a)*t;
const len=(x,z)=>Math.hypot(x,z);
function unit(x,z,backup={x:1,z:0}){const n=len(x,z);return n<1e-8?{...backup}:{x:x/n,z:z/n};}
function constrain(f){
  if(!Number.isFinite(f.x)||!Number.isFinite(f.z)){f.x=10;f.z=-8;}
  let d=len(f.x,f.z),limit=ARENA_RADIUS-WALL_GAP-RADIUS;
  if(d>limit){f.x*=limit/d;f.z*=limit/d;}
  d=len(f.x,f.z);
  if(d<TREE_RADIUS+RADIUS){
    const u=unit(f.x,f.z,{x:1,z:0});
    f.x=u.x*(TREE_RADIUS+RADIUS);f.z=u.z*(TREE_RADIUS+RADIUS);
  }
}
function separate(a,b){
  const dx=b.x-a.x,dz=b.z-a.z,d=len(dx,dz);
  if(d>=2*RADIUS)return;
  const u=unit(dx,dz,{x:1,z:0}),push=(2*RADIUS-d)/2;
  a.x-=u.x*push;a.z-=u.z*push;b.x+=u.x*push;b.z+=u.z*push;
  constrain(a);constrain(b);
}
class Combatant {
  constructor(def,slot,x,z){
    this.def=def;this.slot=slot;this.maxHealth=def.maxHealth;
    this.x=x;this.z=z;this.y=0;
    this.prevX=x;this.prevZ=z;this.prevY=0;
    this.vy=0;this.grounded=true;this.facing={x:1,z:0};
    this.health=def.maxHealth;this.meter=0;
    this.state='idle';this.attack=null;this.attackTick=0;this.attackHit=false;
    this.stun=0;this.blocking=false;this.flash=0;this.animClock=0;
    this.combo=0;this.comboTicks=0;this.dash=0;this.dashCooldown=0;
    this.dashDirection={x:1,z:0};this.knock={x:0,z:0};this.backpedal=false;
  }
  reset(x,z){
    this.x=this.prevX=x;this.z=this.prevZ=z;this.y=this.prevY=this.vy=0;
    this.grounded=true;this.health=this.maxHealth;
    this.state='idle';this.attack=null;this.attackTick=0;this.attackHit=false;
    this.stun=0;this.blocking=false;this.flash=0;this.combo=0;this.comboTicks=0;
    this.dash=0;this.dashCooldown=0;this.backpedal=false;
  }
  attackWith(button){
    if(this.stun||this.attack||this.health<=0)return false;
    const kind=this.grounded?'standing':'airborne';
    const move=this.def.moves?.[kind]?.[button];
    if(!move)return false;
    this.attack={...move,button,kind};this.attackTick=0;this.attackHit=false;this.state='attack';
    return true;
  }
}
class ArenaCPU {
  constructor(){this.seed=31083;}
  random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
  decide(a,b,tick){
    const out=FG.InputUtils.emptyFrame();
    const dist=len(b.x-a.x,b.z-a.z);
    out.y=dist>2.55?-1:dist<1.6?.65:0;
    out.x=tick%200<70?.75:tick%200>155?-.65:0;
    const facing=unit(b.x-a.x,b.z-a.z);
    if(len(a.x+facing.x*2.2,a.z+facing.z*2.2)<TREE_RADIUS+1.1){
      out.x=(a.x*facing.z-a.z*facing.x)>0?-1:1;
    }
    const threatening=b.attack &&
      b.attackTick>=b.attack.startup-3&&dist<b.attack.reach/32+1;
    out.block=!!threatening&&this.random()>.28;
    if(dist<3.5&&!out.block&&!a.attack&&tick%31===0){
      const k=this.random()<.5?'light':this.random()<.68?'medium':'heavy';
      out[k]=true;out.pressed[k]=true;
    }
    if(dist>8&&tick%135===0){out.burn=true;out.pressed.burn=true;}
    if(dist<7&&tick%190===0){out.power=true;out.pressed.power=true;}
    return out;
  }
}
class Arena3D {
  constructor(game){
    this.game=game;this.ready=false;this.failure=null;
    this.fighters=[];this.views=[];this.tick=0;this.active=false;this.paused=false;
    this.phase='intro';this.round=1;this.wins=[0,0];this.intro=INTRO_FRAMES;
    this.roundFrames=ROUND_FRAMES;this.koFrames=0;this.winner=0;
    this.bot=new ArenaCPU();this.effects=[];this.flashTicks=0;
    this.webgl=document.createElement('canvas');
    this.webgl.id='arena3d-webgl';
    this.hud=document.createElement('canvas');this.hud.width=1280;this.hud.height=720;
    this.hud.id='arena3d-hud';
    this.hudCtx=this.hud.getContext('2d');
    const parent=document.getElementById('screen');
    for(const item of [this.webgl,this.hud]){
      item.style.cssText='position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(100vw,177.7778dvh);height:min(100dvh,56.25vw);pointer-events:none;display:none;';
      item.style.zIndex=item===this.webgl?'2':'3';
      parent.appendChild(item);
    }
    try{
      this.renderer=new THREE.WebGLRenderer({canvas:this.webgl,alpha:false,antialias:true,powerPreference:'high-performance'});
      this.renderer.setPixelRatio(Math.min(1.35,window.devicePixelRatio||1));
      this.renderer.setSize(1280,720,false);
      this.renderer.outputColorSpace=THREE.SRGBColorSpace;
      this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure=1.20;
      this.scene=new THREE.Scene();
      this.scene.background=new THREE.Color('#add3f0');
      this.scene.fog=new THREE.FogExp2('#b8d6cf',.0055);
      this.camera=new THREE.PerspectiveCamera(58,1280/720,.08,200);
      this.scene.add(new THREE.HemisphereLight(0xe7f8ff,0x786a52,2.2));
      const sunlight=new THREE.DirectionalLight(0xffebbf,3.2);
      sunlight.position.set(-28,48,-24);this.scene.add(sunlight);
      const edge=new THREE.DirectionalLight(0xa7cfff,.75);
      edge.position.set(23,15,16);this.scene.add(edge);
      const blob=document.createElement('canvas');
      blob.width=128;blob.height=128;
      const bc=blob.getContext('2d');
      const shadowGradient=bc.createRadialGradient(64,64,1,64,64,64);
      shadowGradient.addColorStop(0,'rgba(0,0,0,.46)');
      shadowGradient.addColorStop(.45,'rgba(0,0,0,.20)');
      shadowGradient.addColorStop(1,'rgba(0,0,0,0)');
      bc.fillStyle=shadowGradient;bc.fillRect(0,0,128,128);
      this.shadowMap=new THREE.CanvasTexture(blob);
      this.loader=new GLTFLoader();
      this.loadAssets();
    }catch(e){this.failure=String(e);console.warn('Arena WebGL unavailable',e);}
  }
  async loadAssets(){
    try{
      const files=[
        'assets/arena/training-ground.glb',
        'assets/models/male-unarmored.glb',
        'assets/models/female-unarmored.glb',
        'assets/models/batman-armored.glb'
      ];
      const all=await Promise.all(files.map(f=>this.loader.loadAsync(f)));
      this.arena=all[0].scene;
      this.arena.traverse(o=>{if(o.isMesh)o.castShadow=false;});
      this.scene.add(this.arena);
      this.models={male:all[1].scene,female:all[2].scene,batman:all[3].scene};
      this.ready=true;
      this.game.input?.toast?.('3D Training Arena ready');
      window.dispatchEvent(new Event('rejustice:arena-ready'));
    }catch(e){this.failure=String(e);console.warn('3D assets failed; original game remains playable',e);}
  }
  createAvatar(actor){
    const key=FG.MODEL_ROSTER.heroModel(actor.def.id)||'male';
    const model=cloneSkeleton(this.models[key]||this.models.male);
    const root=new THREE.Group();root.add(model);root.name='3d-fighter-'+actor.slot;
    this.scene.add(root);
    const bones=new Map(),rests=new Map();
    model.traverse(node=>{
      if(node.isBone){bones.set(node.name.toLowerCase(),node);rests.set(node.name.toLowerCase(),node.quaternion.clone());}
      if(node.isMesh){node.frustumCulled=false;}
    });
    // Soft contact shadow stays on the arena floor during jump, instead of
    // being inherited by the character's airborne skeleton.
    const shadow=new THREE.Mesh(new THREE.PlaneGeometry(2.6,1.65),
      new THREE.MeshBasicMaterial({map:this.shadowMap,transparent:true,
        opacity:.78,depthWrite:false,side:THREE.DoubleSide}));
    shadow.rotation.x=-Math.PI/2;
    shadow.position.set(actor.x,.015,actor.z);
    this.scene.add(shadow);
    return {actor,root,bones,rests,key,shadow};
  }
  clearAvatars(){
    for(const o of this.views){
      this.scene.remove(o.root);
      this.scene.remove(o.shadow);
      o.shadow.geometry.dispose();o.shadow.material.dispose();
      o.root.traverse(child=>{if(child.isSkinnedMesh)child.skeleton?.dispose?.();});
    }
    this.views.length=0;
  }
  show(flag){
    this.webgl.style.display=flag?'block':'none';
    this.hud.style.display=flag?'block':'none';
    this.game.canvas.style.opacity=flag?'0':'1';
  }
  start(options){
    if(!this.ready)throw new Error('3D assets not loaded');
    const p1=FG.CHARACTERS[options.p1],p2=FG.CHARACTERS[options.p2];
    if(!p1?.playable||!p2?.playable)throw new Error('Only fighters with real moves can fight');
    this.clearAvatars();
    this.fighters=[new Combatant(p1,1,-11,-7),new Combatant(p2,2,11,-7)];
    this.views=this.fighters.map(a=>this.createAvatar(a));
    this.round=1;this.wins=[0,0];this.startRound();
    this.mode=options.mode||'cpu';this.tick=0;
    this.active=true;this.paused=false;this.initialCamera=false;
    this.show(true);
  }
  startRound(){
    const [a,b]=this.fighters;
    a.reset(-11,-7);b.reset(11,-7);
    this.phase='intro';this.intro=INTRO_FRAMES;
    this.koFrames=0;this.winner=0;this.roundFrames=ROUND_FRAMES;
    this.effects.length=0;
  }
  end(){
    this.active=false;this.show(false);this.clearAvatars();
    this.game.scene='title';this.paused=false;
  }
  finish(winner){
    if(this.phase!=='live')return;
    this.phase='ko';this.koFrames=KO_FRAMES;this.winner=winner;
    if(winner)this.wins[winner-1]++;
    for(const f of this.fighters){
      f.attack=null;f.state=winner===f.slot?'victory':'hitstun';
    }
    this.game.audio.play('ko',.65);
  }
  step(input,keys){
    this.tick++;
    if(keys.has('Escape')||input?.anyPress('pause')){
      this.paused=!this.paused;
      this.game.audio.play('confirm',.25);
    }
    if(this.paused){
      if(keys.has('KeyQ'))this.end();
      return;
    }
    if(this.phase==='intro'){if(--this.intro<=0)this.phase='live';return;}
    if(this.phase==='ko'){
      if(--this.koFrames<=0){
        if(this.wins.some(w=>w>=2))this.phase='matchover';
        else{this.round++;this.startRound();}
      }
      return;
    }
    if(this.phase==='matchover'){
      if(keys.has('Enter')||input?.anyPress('power'))this.end();
      return;
    }
    if(--this.roundFrames<=0){
      this.roundFrames=0;
      const [a,b]=this.fighters;
      const diff=a.health/a.maxHealth-b.health/b.maxHealth;
      this.finish(diff>0?1:diff<0?2:0);return;
    }
    const [a,b]=this.fighters;
    const c1=input?.frame(1)||FG.InputUtils.emptyFrame();
    const c2=this.mode==='cpu'?this.bot.decide(b,a,this.tick):input?.frame(2)||FG.InputUtils.emptyFrame();
    for(const f of [a,b]){
      f.prevX=f.x;f.prevZ=f.z;f.prevY=f.y;f.animClock++;
    }
    this.move(a,b,c1,keys,true);
    this.move(b,a,c2,keys,this.mode!=='cpu');
    separate(a,b);
    this.contact(a,b);this.contact(b,a);
    this.effects.forEach(e=>e.life--);
    this.effects=this.effects.filter(e=>e.life>0);
    if(this.flashTicks>0)this.flashTicks--;
    if(a.health<=0||b.health<=0)this.finish(a.health<=0&&b.health<=0?0:a.health<=0?2:1);
  }
  move(a,b,control,keys,human){
    const forward=unit(b.x-a.x,b.z-a.z),right={x:-forward.z,z:forward.x};
    // Lock-on facing is always the direction to the rival, never the input
    // direction. Backwards movement should never flip the character.
    a.facing=forward;
    a.backpedal=(control.y||0)>.2;
    if(a.dashCooldown>0)a.dashCooldown--;
    if(a.flash>0)a.flash--;
    if(a.comboTicks>0)a.comboTicks--;else a.combo=0;
    const stunned=a.stun>0;
    if(stunned)a.stun--;
    a.blocking=!!control.block&&a.grounded&&!stunned&&!a.attack;
    if(!a.attack&&!stunned&&!a.blocking){
      if((control.pressed.power||human&&keys.has('Space'))&&a.grounded){
        a.vy=JUMP;a.grounded=false;a.state='jump';
        this.game.audio.play('jump',.22);
      }
      if((control.pressed.burn||human&&keys.has('ShiftLeft'))&&!a.dashCooldown&&a.grounded){
        const x=control.x||0,z=-(control.y||0);
        a.dashDirection=unit(right.x*x+forward.x*z,right.z*x+forward.z*z,forward);
        a.dash=DASH_FRAMES;a.dashCooldown=DASH_COOLDOWN;
      }
      for(const button of ['light','medium','heavy']){
        if(control.pressed[button]&&a.attackWith(button)){
          this.game.audio.play('whoosh',.25);break;
        }
      }
      if(control.pressed.throw&&a.attackWith('light')){
        a.attack={...a.attack,button:'throw',startup:7,active:2,recovery:18,reach:63,damage:75,hitstun:19};
      }
      if(control.pressed.super&&a.meter>=4&&!a.attack){
        a.meter-=4;
        a.attack={button:'super',kind:'standing',startup:16,active:5,recovery:32,
          damage:285,reach:145,hitstun:35,blockstun:22};
        a.attackHit=false;a.attackTick=0;a.state='attack';
        this.flashTicks=16;this.game.audio.play('super',.75);
      }
    }
    if(a.attack){
      a.attackTick++;
      if(a.attackTick>=a.attack.startup+a.attack.active+a.attack.recovery){
        a.attack=null;a.attackTick=0;a.attackHit=false;
      }
    }
    if(!stunned&&!a.attack&&!a.blocking){
      if(a.dash>0){
        a.x+=a.dashDirection.x*DASH*STEP;
        a.z+=a.dashDirection.z*DASH*STEP;
        a.dash--;a.state='dash';
      }else if(control.x||control.y){
        const dx=control.x||0,dz=-(control.y||0);
        const direction=unit(right.x*dx+forward.x*dz,right.z*dx+forward.z*dz);
        const speed=dz<0?BACK:Math.abs(dx)>Math.abs(dz)?STRAFE:RUN;
        a.x+=direction.x*speed*STEP;a.z+=direction.z*speed*STEP;
        a.state='walk';
      }else a.state=a.grounded?'idle':'jump';
    }else if(a.blocking){
      a.state='block';a.dash=0;
    }else if(stunned){
      a.state='hitstun';a.dash=0;
      a.x+=a.knock.x;a.z+=a.knock.z;
      a.knock.x*=.78;a.knock.z*=.78;
    }else if(a.attack)a.state='attack';
    if(!a.grounded){
      a.vy-=GRAVITY*STEP;a.y+=a.vy*STEP;
      if(a.y<=0){a.y=0;a.vy=0;a.grounded=true;}
    }
    constrain(a);
  }
  contact(a,b){
    const move=a.attack;
    if(!move||a.attackHit)return;
    if(a.attackTick<move.startup||a.attackTick>=move.startup+move.active)return;
    const dx=b.x-a.x,dz=b.z-a.z,dist=len(dx,dz);
    if(dist>move.reach/34+RADIUS*.75||Math.abs(a.y-b.y)>1.4)return;
    const direction=unit(dx,dz);
    if(direction.x*a.facing.x+direction.z*a.facing.z<.43)return;
    a.attackHit=true;
    const blocked=move.button!=='throw'&&b.blocking;
    const raw=Math.max(1,Math.round(move.damage*a.def.damageMultiplier));
    const scaled=Math.max(1,Math.round(raw*clamp(1-.10*a.combo,.5,1)));
    const damage=blocked?Math.max(1,Math.ceil(raw*.06)):scaled;
    b.health=Math.max(0,b.health-damage);
    a.meter=clamp(a.meter+(blocked?.08:.20),0,4);
    b.meter=clamp(b.meter+.065,0,4);
    if(!blocked){
      a.combo++;a.comboTicks=85;b.stun=move.hitstun||17;
      b.attack=null;b.attackTick=0;b.attackHit=false;b.blocking=false;
      b.knock={x:direction.x*.21,z:direction.z*.21};
      this.game.input?.rumble?.(b.slot,move.button==='super'?.9:.43,110);
    }else b.stun=move.blockstun||7;
    b.flash=8;
    this.effects.push({x:(a.x+b.x)/2,z:(a.z+b.z)/2,y:1.2+(a.y+b.y)/2,life:15});
    this.game.audio.play(blocked?'block':'hit',.38);
  }
  // Aim bones with world-space shoulder/elbow vectors (same human rig for
  // both sexes); the simulation never queries the meshes for any decision.
  pose(view,alpha){
    const a=view.actor,root=view.root;
    // Imported Quaternius humanoids face local +Z in Three.js (Blender -Y).
    // The old yaw treated them as -Z, rotating both characters 180 degrees:
    // the player appeared to walk face-first toward the camera.
    const yaw=Math.atan2(a.facing.x,a.facing.z);
    const px=lerp(a.prevX,a.x,alpha),pz=lerp(a.prevZ,a.z,alpha);
    root.position.set(px,lerp(a.prevY,a.y,alpha),pz);
    view.shadow.position.set(px,.018,pz);
    view.shadow.material.opacity=.74/(1+a.y*.18);
    root.rotation.set(0,yaw,0);
    for(const [name,bone] of view.bones)bone.quaternion.copy(view.rests.get(name));
    root.updateWorldMatrix(true,true);
    function aim(name,child,local){
      const bone=view.bones.get(name),end=view.bones.get(child);
      if(!bone||!end)return;
      const start=bone.getWorldPosition(new THREE.Vector3());
      const current=end.getWorldPosition(new THREE.Vector3()).sub(start).normalize();
      const target=new THREE.Vector3(...local).normalize();
      target.applyAxisAngle(new THREE.Vector3(0,1,0),yaw);
      const change=new THREE.Quaternion().setFromUnitVectors(current,target);
      const parent=bone.parent.getWorldQuaternion(new THREE.Quaternion());
      bone.quaternion.premultiply(parent.clone().invert().multiply(change).multiply(parent));
      bone.updateWorldMatrix(false,true);
    }
    let strike=0;
    if(a.attack){
      if(a.attackTick<a.attack.startup)strike=-.18;
      else if(a.attackTick<a.attack.startup+a.attack.active)strike=1;
      else strike=clamp(1-(a.attackTick-a.attack.startup-a.attack.active)/a.attack.recovery,0,1);
    }
    const swing=a.state==='walk'?Math.sin(a.animClock*.24)*.20*(a.backpedal?-1:1):0;
    aim('upperarm_l','lowerarm_l',[-.29,-.72,-.34-strike*.68]);
    aim('upperarm_r','lowerarm_r',[.29,-.72,-.34]);
    aim('lowerarm_l','hand_l',[-.14,.61,-.72-strike*.23]);
    aim('lowerarm_r','hand_r',[.14,.61,-.72]);
    aim('thigh_l','calf_l',[-.08+swing,-.97,-.11]);
    aim('thigh_r','calf_r',[.08-swing,-.97,-.11]);
  }
  render(alpha){
    if(!this.active)return;
    try{
      alpha=clamp(alpha,0,1);
      for(const o of this.views)this.pose(o,alpha);
      const [a,b]=this.fighters;
      const px=lerp(a.prevX,a.x,alpha),pz=lerp(a.prevZ,a.z,alpha),py=lerp(a.prevY,a.y,alpha);
      const forward=unit(b.x-px,b.z-pz);
      const right={x:-forward.z,z:forward.x};
      const desired=new THREE.Vector3(px-forward.x*CAM_DIST+right.x*CAM_SIDE,
        CAM_HEIGHT+py*.5,pz-forward.z*CAM_DIST+right.z*CAM_SIDE);
      // The follow camera cannot travel through the central tree or outer
      // wall; these analytic constraints are render-only, never mesh physics.
      let camDist=Math.hypot(desired.x,desired.z);
      if(camDist<TREE_RADIUS+1.1){
        const outward=unit(desired.x,desired.z,{x:-forward.x,z:-forward.z});
        desired.x=outward.x*(TREE_RADIUS+1.1);
        desired.z=outward.z*(TREE_RADIUS+1.1);
      }
      camDist=Math.hypot(desired.x,desired.z);
      const cameraLimit=ARENA_RADIUS-WALL_GAP-.5;
      if(camDist>cameraLimit){
        desired.x*=cameraLimit/camDist;desired.z*=cameraLimit/camDist;
      }
      const focus=new THREE.Vector3(px+forward.x*1.25,1.5+py*.4,pz+forward.z*1.25);
      if(!this.initialCamera){this.camera.position.copy(desired);this.cameraFocus=focus;this.initialCamera=true;}
      else{this.camera.position.lerp(desired,CAM_LERP);this.cameraFocus.lerp(focus,CAM_LERP);}
      this.camera.lookAt(this.cameraFocus);
      this.renderer.render(this.scene,this.camera);
      this.drawHUD();
    }catch(e){
      console.error('Arena render failed:',e);
      this.failure=String(e);this.end();
      this.game.input?.toast?.('3D renderer unavailable; returned to main menu');
    }
  }
  drawHUD(){
    const c=this.hudCtx;c.clearRect(0,0,1280,720);
    if(this.fighters.length<2)return;
    const [a,b]=this.fighters;
    function text(message,x,y,size=20,color='#fff',align='left'){
      c.font='900 '+size+'px Arial, sans-serif';c.textAlign=align;
      c.shadowColor='#0b1b23';c.shadowBlur=4;
      c.fillStyle=color;c.fillText(message,x,y);c.shadowBlur=0;
    }
    c.fillStyle='rgba(8,19,28,.75)';c.fillRect(16,16,1248,105);
    text(a.def.name.toUpperCase(),36,43,22);
    text(b.def.name.toUpperCase(),1244,43,22,'#fff','right');
    c.fillStyle='#25363c';c.fillRect(36,56,462,23);c.fillRect(782,56,462,23);
    c.fillStyle='#ecc47d';c.fillRect(36,56,462*a.health/a.maxHealth,23);
    c.fillStyle='#83d4e8';c.fillRect(1244-462*b.health/b.maxHealth,56,462*b.health/b.maxHealth,23);
    c.strokeStyle='#d0ebf7';c.strokeRect(36,56,462,23);c.strokeRect(782,56,462,23);
    for(let i=0;i<4;i++){
      c.fillStyle=i<a.meter?'#f6c86b':'#30444d';c.fillRect(36+i*63,89,57,10);
      c.fillStyle=i<b.meter?'#8ed6ea':'#30444d';c.fillRect(1187-i*63,89,57,10);
    }
    text(String(Math.ceil(this.roundFrames/FPS)),640,70,43,'#fff','center');
    text('ROUND '+this.round,640,99,14,'#c5dce6','center');
    for(let i=0;i<2;i++){
      c.beginPath();c.arc(43+i*23,111,6,0,Math.PI*2);
      c.fillStyle=i<this.wins[0]?'#f1cb85':'#435760';c.fill();
      c.beginPath();c.arc(1237-i*23,111,6,0,Math.PI*2);
      c.fillStyle=i<this.wins[1]?'#93d6ed':'#435760';c.fill();
    }
    let announcement='';
    if(this.phase==='intro')announcement=this.intro>42?'ROUND '+this.round:'FIGHT!';
    if(this.phase==='ko')announcement='K.O.';
    if(this.phase==='matchover')announcement=(this.wins[0]>=2?a.def.name:b.def.name)+' WINS';
    if(announcement){
      c.fillStyle='rgba(7,14,20,.61)';c.fillRect(0,265,1280,117);
      text(announcement,640,344,65,'#ffe5aa','center');
    }
    if(a.combo>1&&a.comboTicks>0)text(a.combo+' HIT COMBO',40,175,25,'#ffdb8e');
    // World-projected lock-on marker helps locate an opponent obscured by the
    // central tree. No mesh raycast or aiming feedback enters game logic.
    const tgt=new THREE.Vector3(b.x,b.y+2.5,b.z).project(this.camera);
    if(tgt.z>0&&tgt.z<1){
      const tx=(tgt.x+1)*640,ty=(1-tgt.y)*360;
      if(tx>18&&tx<1262&&ty>117&&ty<624){
        c.strokeStyle='rgba(255,226,134,.94)';c.lineWidth=2;
        c.beginPath();c.arc(tx,ty,20,0,Math.PI*2);c.stroke();
        c.beginPath();c.moveTo(tx,ty-33);c.lineTo(tx-9,ty-44);
        c.lineTo(tx+9,ty-44);c.closePath();
        c.fillStyle='#ffe19a';c.fill();
      }
    }
    for(const e of this.effects){
      const s=new THREE.Vector3(e.x,e.y,e.z).project(this.camera);
      if(s.z<0||s.z>1)continue;
      const x=(s.x+1)*640,y=(1-s.y)*360,r=6+15*e.life/15;
      c.strokeStyle='rgba(255,239,151,'+(e.life/15)+')';
      c.lineWidth=3;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.stroke();
    }
    c.fillStyle='rgba(5,16,24,.77)';c.fillRect(20,665,1240,47);
    text('WASD / LEFT STICK: MOVE   SPACE / A: JUMP   SHIFT / RB: DASH    J K L / X Y B: ATTACK',38,685,14,'#e5f5ff');
    text('I / LT: BLOCK   O / RT: SUPER (4 BARS)   ESC / START: PAUSE',38,705,14,'#a6d8ea');
    if(this.paused){
      c.fillStyle='rgba(6,12,19,.85)';c.fillRect(0,0,1280,720);
      text('PAUSED',640,303,75,'#ffdc93','center');
      text('ESC / START TO RESUME',640,358,24,'#fff','center');
      text('Q TO RETURN TO THE MENU',640,400,21,'#c6e8fb','center');
    }
  }
}
function install(game){
  if(!game||game.arena3d)return;
  game.arena3d=new Arena3D(game);
  const start=game.startMatch.bind(game);
  game.startMatch=function(opts){
    if(opts?.mode==='cpu'&&!this.arena3d.ready&&!this.arena3d.failure){
      this.input?.toast?.('Building 3D arena — wait a moment, then press FIGHT');
      return false;
    }
    const result=start(opts);
    if(opts?.mode==='cpu'&&this.arena3d.ready){
      try{this.arena3d.start(opts);this.scene='arena3d';}
      catch(e){console.warn('3D fallback',e);this.arena3d.show(false);this.scene='fight';}
    }else if(opts?.mode==='cpu'){
      this.input?.toast?.('3D map loading; original 2D match is available');
    }
    return result;
  };
  const step=game.step.bind(game);
  game.step=function(){
    if(this.scene!=='arena3d')return step();
    this.frame++;this.input?.update();
    this.arena3d.step(this.input,this.input?.toggleKeys||new Set());
  };
  const render=game.render.bind(game);
  game.render=function(){
    if(this.scene!=='arena3d')return render();
    this.arena3d.render(this.accumulator/(1000/FPS));
  };
  if(game.input){
    const onDisconnect=game.input.onDisconnect;
    game.input.onDisconnect=(slot)=>{
      if(game.scene==='arena3d'){
        game.arena3d.paused=true;
        game.input.toast('P'+slot+' controller disconnected · paused');
      }else onDisconnect?.(slot);
    };
  }
}
let attachAttempts=0;
function attach(){
  const game=window.game;
  // Before the engine bootstraps, the canvas id="game" itself is exposed
  // as window.game by HTML named-element access. Wait for the *Game instance*.
  if(game instanceof FG.Game && typeof game.startMatch==='function'){
    install(game);return;
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',attach,{once:true});
  }else if(++attachAttempts<60){
    setTimeout(attach,40);
  }else{
    console.warn('Arena integration skipped: a Game instance never initialized');
  }
}
attach();
FG.Arena3D=Arena3D;
FG.ArenaCollision={constrain,separate,RADIUS:ARENA_RADIUS,TREE_RADIUS};

/* RE-Justice original 3D Training Arena — gameplay prototype.
   Simulation: exact 60Hz through existing Game.step fixed timestep.
   Renderer: Three.js; Blender GLB arena and original rigged character assets.
   No mesh physics; deterministic 2D XZ circles for wall/tree/character collision.
   Standard Gamepad API and keyboard use the existing input layer.
*/
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {poseFighter} from './arena-animator.js?v=boxing-guard-24';

const FG=window.FG;
const FPS=60,STEP=1/FPS,ARENA_RADIUS=34,WALL_GAP=1.2,TREE_RADIUS=3.15,RADIUS=.52;
// Faster traversal to match the expressive Shinobi run. Keep the dash and
// combat action timing unchanged so the new locomotion remains controllable.
const RUN=8.6,BACK=5.9,STRAFE=7.0,DASH=16.4,DASH_FRAMES=11,DASH_COOLDOWN=44;
const JUMP=11.0,GRAVITY=25,ROUND_FRAMES=99*60,INTRO_FRAMES=78,KO_FRAMES=110;
const CAM_DIST=4.75,CAM_HEIGHT=2.85,CAM_SIDE=1.15,CAM_LERP=.13;
const clamp=(a,b,c)=>Math.max(b,Math.min(c,a));
const lerp=(a,b,t)=>a+(b-a)*t;
// Keep visual rotations on the shortest arc (particularly across +/-PI).
const angleDelta=(to,from)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
const turnTowards=(from,to,maxStep)=>from+clamp(angleDelta(to,from),-maxStep,maxStep);
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
    this.def=def;this.slot=slot;this.maxHealth=def.maxHealth||1000;
    this.x=x;this.z=z;this.y=0;
    this.prevX=x;this.prevZ=z;this.prevY=0;
    this.vy=0;this.grounded=true;this.facing={x:1,z:0};
    this.health=def.maxHealth;this.meter=0;
    this.state='idle';this.attack=null;this.attackTick=0;this.attackHit=false;
    this.stun=0;this.blocking=false;this.flash=0;this.animClock=0;
    this.gaitPhase=this.prevGaitPhase=0;
    this.dashElapsed=0;this.dashRecovery=0;this.landingFrames=0;
    this.combo=0;this.comboTicks=0;this.dash=0;this.dashCooldown=0;
    this.dashDirection={x:1,z:0};this.knock={x:0,z:0};this.backpedal=false;
    // Simulation always targets the rival; these are VISUAL locomotion state.
    this.travel={x:0,z:0};
    this.visualYaw=this.prevVisualYaw=Math.PI/2*(slot===1?1:-1);
    this.lean=this.prevLean=0;this.bank=this.prevBank=0;
  }
  reset(x,z){
    this.x=this.prevX=x;this.z=this.prevZ=z;this.y=this.prevY=this.vy=0;
    this.grounded=true;this.health=this.maxHealth;
    this.state='idle';this.attack=null;this.attackTick=0;this.attackHit=false;
    this.stun=0;this.blocking=false;this.flash=0;this.combo=0;this.comboTicks=0;
    this.dash=0;this.dashCooldown=0;this.dashElapsed=0;
    this.dashRecovery=0;this.landingFrames=0;this.backpedal=false;
    this.gaitPhase=this.prevGaitPhase=0;
    this.facing={x:this.slot===1?1:-1,z:0};
    this.travel={x:0,z:0};
    this.visualYaw=this.prevVisualYaw=Math.PI/2*(this.slot===1?1:-1);
    this.lean=this.prevLean=0;this.bank=this.prevBank=0;
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
      this.renderer.toneMappingExposure=.86;
      this.scene=new THREE.Scene();
      this.scene.background=new THREE.Color('#add3f0');
      this.scene.fog=new THREE.FogExp2('#afc9d3',.0036);
      this.camera=new THREE.PerspectiveCamera(58,1280/720,.08,200);
      this.createSkySystem();
      this.scene.add(new THREE.HemisphereLight(0xe7f8ff,0x786a52,1.55));
      const sunlight=new THREE.DirectionalLight(0xffe7b5,2.15);
      sunlight.position.set(-28,48,-24);this.scene.add(sunlight);
      const edge=new THREE.DirectionalLight(0xa7cfff,.56);
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
  // Lightweight sky: a single gradient skydome plus two slow-moving
  // layers of billboard clouds. One shared generated texture, no API calls.
  createSkySystem(){
    const dome=new THREE.Mesh(
      new THREE.SphereGeometry(155,40,24),
      new THREE.ShaderMaterial({
        name:'RE-Justice bright daytime sky',
        side:THREE.BackSide,depthWrite:false,depthTest:false,fog:false,
        uniforms:{uTime:{value:0},uCloudMap:{value:null}},
        vertexShader:`
          varying vec3 vSkyDirection;
          void main(){
            vSkyDirection=normalize(position);
            gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
          }
        `,
        fragmentShader:`
          varying vec3 vSkyDirection;
          uniform sampler2D uCloudMap;
          uniform float uTime;
          void main(){
            float elevation=clamp(vSkyDirection.y*0.80+0.22,0.0,1.0);
            vec3 nearHorizon=vec3(0.80,0.91,0.99);
            vec3 clearBlue=vec3(0.36,0.67,0.91);
            vec3 zenithBlue=vec3(0.29,0.59,0.86);
            vec3 color=mix(nearHorizon,clearBlue,smoothstep(0.0,0.70,elevation));
            color=mix(color,zenithBlue,smoothstep(0.54,1.0,elevation)*0.43);
            // The panorama cloud texture guarantees visible white clouds
            // above arena walls, even when billboards are behind the tree.
            float around=atan(vSkyDirection.z,vSkyDirection.x)/6.2831853+0.5;
            float high=clamp(.16+vSkyDirection.y*.67,0.0,1.0);
            float c1=texture2D(uCloudMap,vec2(
              fract(around+uTime*.00040),high)).a;
            float c2=texture2D(uCloudMap,vec2(
              fract(around+.37-uTime*.00022),high*.96+.02)).a;
            float haze=smoothstep(.08,.28,vSkyDirection.y);
            float cover=clamp(max(c1*.96,c2*.61)*haze,0.0,.88);
            color=mix(color,vec3(.98,.988,1.0),pow(cover,.88));
            gl_FragColor=vec4(color,1.0);
          }
        `
      })
    );
    dome.name='Daytime Sky Dome';
    dome.renderOrder=-1000;
    dome.frustumCulled=false;
    this.skyDome=dome;
    this.scene.add(dome);

    const canvas=document.createElement('canvas');
    canvas.width=256;canvas.height=128;
    const ctx=canvas.getContext('2d');
    // Deterministic puffy, feather-edged cloud (no opaque white rectangles).
    const puffs=[
      [57,80,36],[84,62,41],[115,63,48],[148,72,42],
      [178,80,37],[102,88,36],[136,94,31],[73,92,26],
      [160,91,26],[122,48,27],[98,54,29],[150,60,32]
    ];
    for(const [x,y,r] of puffs){
      const g=ctx.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0,'rgba(255,255,255,.63)');
      g.addColorStop(.44,'rgba(255,255,255,.42)');
      g.addColorStop(.73,'rgba(255,255,255,.17)');
      g.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
    }
    this.cloudTexture=new THREE.CanvasTexture(canvas);
    this.cloudTexture.colorSpace=THREE.SRGBColorSpace;
    this.cloudTexture.minFilter=THREE.LinearFilter;
    this.cloudTexture.magFilter=THREE.LinearFilter;
    // A seamless cloud panorama is blended directly into the skydome.
    // Unlike distant sprites, these clouds remain visible over the tall wall
    // from ANY facing direction. Shared CanvasTexture: no external files.
    const panorama=document.createElement('canvas');
    panorama.width=1024;panorama.height=512;
    const cp=panorama.getContext('2d');
    for(let i=0;i<17;i++){
      const h=(n)=>{const t=Math.sin(n*91.371+31.5)*43758.5453;
        return t-Math.floor(t);};
      const x=(i+.35)*1024/17;
      const y=160+h(i+34)*182;
      const r=26+h(i+8)*17;
      for(const offset of [-1024,0,1024]){
        for(const [dx,dy,size] of [[-1.1,.21,.82],[-.48,-.20,1.06],
          [.1,-.30,1.12],[.78,-.1,.91],[1.31,.27,.72],[0,.31,.85]]){
          const cx=x+offset+dx*r,cy=y+dy*r,rad=r*size;
          const grad=cp.createRadialGradient(cx,cy,0,cx,cy,rad);
          grad.addColorStop(0,'rgba(255,255,255,.87)');
          grad.addColorStop(.42,'rgba(255,255,255,.73)');
          grad.addColorStop(.76,'rgba(255,255,255,.24)');
          grad.addColorStop(1,'rgba(255,255,255,0)');
          cp.fillStyle=grad;
          cp.fillRect(cx-rad,cy-rad,rad*2,rad*2);
        }
      }
    }
    this.skyCloudPanorama=new THREE.CanvasTexture(panorama);
    this.skyCloudPanorama.wrapS=THREE.RepeatWrapping;
    this.skyCloudPanorama.colorSpace=THREE.SRGBColorSpace;
    this.skyCloudPanorama.minFilter=THREE.LinearFilter;
    dome.material.uniforms.uCloudMap.value=this.skyCloudPanorama;
    const configs=[
      {count:13,radius:78,height:45,baseWidth:38,speed:.0035,opacity:.76},
      {count:11,radius:104,height:68,baseWidth:48,speed:-.0022,opacity:.61}
    ];
    this.cloudLayers=[];
    for(let layerIndex=0;layerIndex<configs.length;layerIndex++){
      const cfg=configs[layerIndex],group=new THREE.Group();
      group.name='Slow Cloud Layer '+(layerIndex+1);
      group.userData.speed=cfg.speed;
      for(let i=0;i<cfg.count;i++){
        // Fixed positions keep cloud layouts stable between reloads.
        const hash=(x)=>{const v=Math.sin(x*127.1+layerIndex*83.7)*43758.5453;
          return v-Math.floor(v);};
        const angle=2*Math.PI*(i+hash(i+2)*.28)/cfg.count;
        const radius=cfg.radius+(hash(i+8)-.5)*17;
        const cloud=new THREE.Sprite(new THREE.SpriteMaterial({
          name:'Soft cloud billboard',map:this.cloudTexture,
          transparent:true,depthWrite:false,depthTest:true,
          opacity:cfg.opacity,blending:THREE.NormalBlending,fog:false
        }));
        const w=cfg.baseWidth*(.79+.52*hash(i+19));
        cloud.scale.set(w,w*.48,1);
        cloud.position.set(Math.cos(angle)*radius,
          cfg.height+(hash(i+34)-.5)*15,Math.sin(angle)*radius);
        group.add(cloud);
      }
      this.scene.add(group);
      this.cloudLayers.push(group);
    }
  }
  updateSky(alpha=0){
    if(!this.skyDome)return;
    // Make the background infinite so it cannot collide with the arena.
    this.skyDome.position.copy(this.camera.position);
    const seconds=((this.game?.frame||0)+alpha)/FPS;
    this.skyDome.material.uniforms.uTime.value=seconds;
    for(let i=0;i<this.cloudLayers.length;i++){
      const layer=this.cloudLayers[i];
      layer.rotation.y=seconds*layer.userData.speed;
      layer.position.y=Math.sin(seconds*.13+i*1.8)*.45;
    }
  }
  async loadAssets(){
    try{
      const files=[
        'assets/arena/training-ground.glb?v=high-detail-environment-5',
        'assets/models/male-unarmored.glb',
        'assets/models/female-unarmored.glb',
        'assets/models/batman-armored.glb?v=without-cape-1'
      ];
      const all=await Promise.all(files.map(f=>this.loader.loadAsync(f)));
      this.arena=all[0].scene;
      this.arena.traverse(o=>{if(o.isMesh)o.castShadow=false;});
      this.scene.add(this.arena);
      this.models={male:all[1].scene,female:all[2].scene,batman:all[3].scene};
      this.ready=true;
      // Avoid covering the top of the mode cards on startup.
      if(this.game.scene!=='title')this.game.input?.toast?.('3D Training Arena ready');
      window.dispatchEvent(new Event('rejustice:arena-ready'));
    }catch(e){this.failure=String(e);console.warn('3D assets failed; original game remains playable',e);}
  }
  createAvatar(actor){
    const key=FG.MODEL_ROSTER.heroModel(actor.def.id)||'male';
    const model=cloneSkeleton(this.models[key]||this.models.male);
    const root=new THREE.Group();root.add(model);root.name='3d-fighter-'+actor.slot;
    this.scene.add(root);
    const bones=new Map(),rests=new Map(),restPositions=new Map();
    model.traverse(node=>{
      if(node.isBone){bones.set(node.name.toLowerCase(),node);rests.set(node.name.toLowerCase(),node.quaternion.clone());restPositions.set(node.name.toLowerCase(),node.position.clone());}
      if(node.isMesh){node.frustumCulled=false;}
    });
    // Calibration at authentic GLB bind-rest, BEFORE any animation is posed.
    // Needed for rotational motion-capture retargeting: imported Blender
    // bones use nonstandard local axes, so never transfer raw BVH Euler
    // angles or aim elbows with positional IK.
    root.updateWorldMatrix(true,true);
    const restWorldQuats=new Map();
    for(const [name,bone] of bones){
      restWorldQuats.set(name,bone.getWorldQuaternion(new THREE.Quaternion()));
    }
    // Soft contact shadow stays on the arena floor during jump, instead of
    // being inherited by the character's airborne skeleton.
    // Determine anatomical outward axes from the actual Blender skeleton.
    // Some imported Quaternius rigs number their _l/_r joints opposite the
    // local Three.js X convention: do NOT hardcode +/-X by bone name.
    root.updateWorldMatrix(true,true);
    const center=bones.get('spine_02')?.getWorldPosition(new THREE.Vector3())||new THREE.Vector3();
    const pelvis=bones.get('hips')?.getWorldPosition(new THREE.Vector3())||
      bones.get('pelvis')?.getWorldPosition(new THREE.Vector3())||center;
    const naturalSide=(name,origin,fallback)=>{
      const joint=bones.get(name);
      if(!joint)return fallback;
      const lateral=joint.getWorldPosition(new THREE.Vector3()).x-origin.x;
      return Math.abs(lateral)<1e-5?fallback:Math.sign(lateral);
    };
    const armSides={
      l:naturalSide('upperarm_l',center,-1),
      r:naturalSide('upperarm_r',center,1)
    };
    const legSides={
      l:naturalSide('thigh_l',pelvis,-1),
      r:naturalSide('thigh_r',pelvis,1)
    };
    // Calibrate where the SKINNED FOOT MESH actually touches the ground.
    // A toe/ankle bone's translation is not the sole: earlier offsets were
    // estimated and made the feet hover on some character models.
    // Measure weighted vertices once at spawn; do not raycast every frame.
    root.updateWorldMatrix(true,true);
    const footSoleHeights={},footRestWorldQuats={},soleSamples={};
    const skinMeshes=[];
    model.traverse(o=>{
      if(o.isSkinnedMesh&&o.geometry?.getAttribute('skinIndex')&&
          o.geometry?.getAttribute('skinWeight'))skinMeshes.push(o);
    });
    for(const side of ['l','r']){
      const foot=bones.get('foot_'+side);
      const footRestY=foot?.getWorldPosition(new THREE.Vector3()).y??.095;
      footRestWorldQuats[side]=foot?.getWorldQuaternion(new THREE.Quaternion())||
        new THREE.Quaternion();
      const partNames=['foot_'+side,'ball_'+side,'ball_leaf_'+side];
      let soleY=Infinity,sampleCount=0;
      for(const skinned of skinMeshes){
        const boneIndices=partNames.map(name=>
          skinned.skeleton.bones.findIndex(b=>b.name.toLowerCase()===name))
          .filter(n=>n>=0);
        if(!boneIndices.length)continue;
        const indices=skinned.geometry.getAttribute('skinIndex');
        const weights=skinned.geometry.getAttribute('skinWeight');
        const worldVertex=new THREE.Vector3();
        for(let i=0;i<indices.count;i++){
          let relevance=0;
          for(let c=0;c<4;c++){
            if(boneIndices.includes(indices.getComponent(i,c)))
              relevance+=weights.getComponent(i,c);
          }
          if(relevance<.24)continue;
          skinned.getVertexPosition(i,worldVertex);
          worldVertex.applyMatrix4(skinned.matrixWorld);
          if(!Number.isFinite(worldVertex.y))continue;
          soleY=Math.min(soleY,worldVertex.y);
          sampleCount++;
        }
      }
      const offset=Number.isFinite(soleY)?footRestY-soleY:footRestY;
      // Bounds only guard degenerate rigs; ordinarily the original skinned
      // mesh dictates the contact offset, including toes and heel geometry.
      footSoleHeights[side]=clamp(offset,.008,.26);
      soleSamples[side]=sampleCount;
    }
    const shadow=new THREE.Mesh(new THREE.PlaneGeometry(2.6,1.65),
      new THREE.MeshBasicMaterial({map:this.shadowMap,transparent:true,
        opacity:.78,depthWrite:false,side:THREE.DoubleSide}));
    shadow.rotation.x=-Math.PI/2;
    shadow.position.set(actor.x,.015,actor.z);
    this.scene.add(shadow);
    return {actor,root,bones,rests,restPositions,restWorldQuats,key,shadow,
      armSides,legSides,footSoleHeights,footRestWorldQuats,soleSamples,walkWeight:0,dashWeight:0,lastStateTick:-1};
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
    const sandbox=options.mode==='sandbox';
    const p1=FG.CHARACTERS[options.p1],p2=sandbox?null:FG.CHARACTERS[options.p2];
    // Sandbox can use ANY roster preview model. A duel still needs two
    // playable fighters with moves and a genuine bot opponent.
    if(!p1||(!sandbox&&(!p1.playable||!p2?.playable)))
      throw new Error('Invalid character choice for this arena mode');
    this.clearAvatars();
    this.mode=sandbox?'sandbox':options.mode||'cpu';
    this.fighters=sandbox?[new Combatant(p1,1,-11,-9)]:
      [new Combatant(p1,1,-11,-7),new Combatant(p2,2,11,-7)];
    this.views=this.fighters.map(a=>this.createAvatar(a));
    this.tick=0;this.round=1;this.wins=[0,0];this.effects.length=0;
    this.koFrames=0;this.winner=0;this.flashTicks=0;
    if(sandbox){
      const a=this.fighters[0];
      a.reset(-11,-9);a.visualYaw=a.prevVisualYaw=0;
      a.facing={x:0,z:1};
      this.phase='live';this.intro=0;this.roundFrames=Infinity;
    }else this.startRound();
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
    if(this.mode==='sandbox'){
      const a=this.fighters[0];
      if(keys.has('KeyR')||input?.frame(1)?.pressed?.reset){
        a.reset(-11,-9);a.visualYaw=a.prevVisualYaw=0;
        a.facing={x:0,z:1};this.initialCamera=false;
      }
      a.prevX=a.x;a.prevZ=a.z;a.prevY=a.y;a.animClock++;
      a.prevVisualYaw=a.visualYaw;a.prevLean=a.lean;a.prevBank=a.bank;
      a.prevGaitPhase=a.gaitPhase;
      this.move(a,null,input?.frame(1)||FG.InputUtils.emptyFrame(),keys,true);
      // No CPU, rival model, opponent attacks, round clock or victory flow.
      this.effects.length=0;
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
      f.prevVisualYaw=f.visualYaw;f.prevLean=f.lean;f.prevBank=f.bank;
      f.prevGaitPhase=f.gaitPhase;
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
    const startMoveX=a.x,startMoveZ=a.z;
    // A solo session uses a stable camera-relative travel direction.
    // Duels still orient around the actual opponent.
    const forward=b?unit(b.x-a.x,b.z-a.z):{x:0,z:1};
    const right={x:-forward.z,z:forward.x};
    // Keep combat targeting/strike cones on the opponent, but let the mesh
    // turn into actual travel, like a third-person arena fighter.
    a.facing=b?forward:unit(Math.sin(a.visualYaw),Math.cos(a.visualYaw));
    a.travel={x:0,z:0};
    a.backpedal=(control.y||0)>.2;
    if(a.dashCooldown>0)a.dashCooldown--;
    if(a.dashRecovery>0)a.dashRecovery--;
    if(a.landingFrames>0)a.landingFrames--;
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
        a.dash=DASH_FRAMES;a.dashElapsed=0;a.dashRecovery=0;
        a.dashCooldown=DASH_COOLDOWN;
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
        a.travel={...a.dashDirection};
        a.dash--;a.dashElapsed++;a.state='dash';
        if(a.dash===0)a.dashRecovery=7;
      }else if(control.x||control.y){
        const dx=control.x||0,dz=-(control.y||0);
        const direction=unit(right.x*dx+forward.x*dz,right.z*dx+forward.z*dz);
        const speed=dz<0?BACK:Math.abs(dx)>Math.abs(dz)?STRAFE:RUN;
        a.x+=direction.x*speed*STEP;a.z+=direction.z*speed*STEP;
        a.travel=direction;
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
      if(a.y<=0){a.y=0;a.vy=0;a.grounded=true;a.landingFrames=7;}
    }
    constrain(a);
    // Advance gait by actual displacement, independent of rendering frame rate.
    // Gait cycles are proportional to actual world distance. Faster
    // traversal has a slightly longer stride and ~10% faster cadence,
    // NOT 20% faster flailing legs; each support foot can push off cleanly.
    if(a.state==='walk'||a.state==='dash'){
      const distance=len(a.x-startMoveX,a.z-startMoveZ);
      const groundSpeed=distance/STEP;
      // Keep the simulation's distance-driven cadence in sync with the
      // animator's run activation, even for W/S/A/D retreat and strafe.
      const runBlend=clamp((groundSpeed-1.90)/1.50,0,1);
      const cycleMeters=lerp(2.35,3.35,runBlend);
      const stepRate=a.state==='dash'?3.0:2*Math.PI/cycleMeters;
      a.gaitPhase+=Math.min(.5,distance)*stepRate;
    }
    // Preserve the last travel-facing direction in solo Sandbox when input
    // is released. Previously idle always targeted the fixed +Z "forward"
    // axis, which made the character snap/turn back to the arena front.
    // In combat, keep the established opponent-facing behavior unchanged.
    const running=a.state==='walk'||a.state==='dash';
    // Against an opponent keep the fighter facing the rival while stepping
    // backward/sideways; solo free-roam continues to face travel and keeps
    // the last heading on release.
    const desired=b?forward:running?a.travel:null;
    if(desired){
      const desiredYaw=Math.atan2(desired.x,desired.z);
      a.visualYaw=turnTowards(a.visualYaw,desiredYaw,a.attack?.68:running?.25:.20);
    }
    // Pitch into acceleration; bank gently while the feet catch up to turns.
    const side=a.travel.x*Math.cos(a.visualYaw)-a.travel.z*Math.sin(a.visualYaw);
    a.lean=lerp(a.lean,running?(a.state==='dash'?.17:.105):0,.22);
    a.bank=lerp(a.bank,running?-side*.13:0,.23);
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
  // Full-body animation is separated from gameplay and authored in the
  // rig-aware keyframe animation library.
  pose(view,alpha){poseFighter(view,alpha);}
  renderSandbox(alpha){
    const a=this.fighters[0];
    const px=lerp(a.prevX,a.x,alpha),pz=lerp(a.prevZ,a.z,alpha);
    const py=lerp(a.prevY,a.y,alpha);
    // Stable third-person follow camera with no invisible opponent/lock-on.
    const desired=new THREE.Vector3(px+1.15,CAM_HEIGHT+py*.5,pz-CAM_DIST-1.25);
    const distance=Math.hypot(desired.x,desired.z);
    const limit=ARENA_RADIUS-WALL_GAP-.5;
    if(distance>limit){desired.x*=limit/distance;desired.z*=limit/distance;}
    if(Math.hypot(desired.x,desired.z)<TREE_RADIUS+1.1){
      const dir=unit(desired.x,desired.z,{x:-1,z:-1});
      desired.x=dir.x*(TREE_RADIUS+1.1);
      desired.z=dir.z*(TREE_RADIUS+1.1);
    }
    const focus=new THREE.Vector3(px,1.45+py*.35,pz+1.05);
    if(!this.initialCamera){
      this.camera.position.copy(desired);this.cameraFocus=focus;this.initialCamera=true;
    }else{
      this.camera.position.lerp(desired,CAM_LERP);
      this.cameraFocus.lerp(focus,CAM_LERP);
    }
    this.camera.lookAt(this.cameraFocus);
    this.updateSky(alpha);
    this.renderer.render(this.scene,this.camera);
    this.drawSandboxHUD();
  }
  drawSandboxHUD(){
    const c=this.hudCtx;c.clearRect(0,0,1280,720);
    c.fillStyle='rgba(5,18,26,.70)';c.fillRect(20,18,390,72);
    c.fillStyle='#88e5cf';c.font='900 23px Arial, sans-serif';
    c.fillText('SANDBOX',36,49);
    c.fillStyle='#effaf8';c.font='700 15px Arial, sans-serif';
    c.fillText(this.fighters[0].def.name+'  ·  FREE ROAM / NO BOT',36,74);
    c.fillStyle='rgba(5,18,26,.77)';c.fillRect(20,666,1240,45);
    c.fillStyle='#d5f3ef';c.font='700 15px Arial, sans-serif';
    c.fillText('WASD / LEFT STICK  MOVE     SPACE / A  JUMP     SHIFT / RB  DASH',38,685);
    c.fillStyle='#9cc8c6';c.font='700 13px Arial, sans-serif';
    c.fillText('R / RESET  RETURN TO SPAWN      ESC / START  PAUSE      Q (PAUSED)  MENU',38,704);
    if(this.paused){
      c.fillStyle='rgba(6,12,19,.83)';c.fillRect(0,0,1280,720);
      c.textAlign='center';
      c.fillStyle='#f6f6ef';c.font='900 68px Arial, sans-serif';
      c.fillText('SANDBOX PAUSED',640,310);
      c.font='700 23px Arial, sans-serif';
      c.fillText('ESC / START  RESUME',640,360);
      c.fillText('Q  RETURN TO MENU',640,405);
      c.textAlign='left';
    }
  }
  render(alpha){
    if(!this.active)return;
    try{
      alpha=clamp(alpha,0,1);
      for(const o of this.views)this.pose(o,alpha);
      if(this.mode==='sandbox'){this.renderSandbox(alpha);return;}
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
      this.updateSky(alpha);
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
    if(opts?.mode==='sandbox'){
      if(!this.arena3d.ready){
        this.input?.toast?.('Training arena is still loading — please wait');
        return false;
      }
      try{
        this.arena3d.start(opts);
        this.scene='arena3d';
        return true;
      }catch(e){
        console.warn('Sandbox launch failed',e);
        this.arena3d.show(false);this.scene='versus';
        this.input?.toast?.('Could not enter Sandbox');
        return false;
      }
    }
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

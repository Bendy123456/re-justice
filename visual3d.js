'use strict';
/* Three.js presentation bridge. This file never alters or references combat setters. */
(() => {
  const F=window.FG=window.FG||{};
  const CONFIG=Object.freeze({
    W:1280,H:720,PIXELS_PER_UNIT:114,MAX_RENDER_SCALE:2,
    CYLINDER_SIDES:12,HEAD_SEGMENTS:18,SHADOW_ALPHA:.32,
    CAMERA_DEPTH:22,ANTIALIAS:true,
    MOVEMENT_HZ:.11,IDLE_HZ:.052,
    GROUND_SHADOW_RADIUS:.60
  });
  const CLAMP=(x,a,b)=>Math.min(b,Math.max(a,x));
  const SMOOTH=x=>{x=CLAMP(x,0,1);return x*x*(3-2*x);};
  const INTERP=(a,b,t)=>a+(b-a)*SMOOTH(t);
  const ENABLED=['flash'];  // Step 1: test one hero, keep procedural fallback for the other slots.

  class ThreePresentation {
    constructor(){
      this.ready=false;this.failed=false;this.error=null;this.models=new Map();
      this.lastSignature='';this.stats={draws:0,cacheHits:0};
      const T=window.THREE;if(!T)return;
      try{
        this.T=T;
        this.canvas=document.createElement('canvas');
        this.renderer=new T.WebGLRenderer({canvas:this.canvas,alpha:true,
          antialias:CONFIG.ANTIALIAS,preserveDrawingBuffer:true,powerPreference:'high-performance'});
        this.renderer.setClearColor(0,0);this.renderer.outputColorSpace=T.SRGBColorSpace;
        this.scene=new T.Scene();
        this.camera=new T.OrthographicCamera(-CONFIG.W/(2*CONFIG.PIXELS_PER_UNIT),
          CONFIG.W/(2*CONFIG.PIXELS_PER_UNIT),CONFIG.H/(2*CONFIG.PIXELS_PER_UNIT),
          -CONFIG.H/(2*CONFIG.PIXELS_PER_UNIT),.1,100);
        this.camera.position.set(0,0,CONFIG.CAMERA_DEPTH);this.camera.lookAt(0,0,0);
        this.ambient=new T.HemisphereLight(0xdce9ff,0x243044,2.1);
        this.key=new T.DirectionalLight(0xffe4ca,3.3);this.key.position.set(-4,8,8);
        this.rim=new T.DirectionalLight(0x81cdfa,2.8);this.rim.position.set(4,5,-6);
        this.fill=new T.DirectionalLight(0xb9c6d9,1.0);this.fill.position.set(1,3,6);
        this.scene.add(this.ambient,this.key,this.rim,this.fill);
        this.shared={ball:new T.SphereGeometry(1,CONFIG.HEAD_SEGMENTS,12),
          tube:new T.CylinderGeometry(1,1,1,CONFIG.CYLINDER_SIDES,1),
          floor:new T.PlaneGeometry(1,1)};
        this.shadowTex=this.createShadowTexture();
        this.ready=true;
      }catch(e){this.failed=true;this.error=e;this.ready=false;
        try{this.renderer?.dispose()}catch(_){} }
    }
    createShadowTexture(){
      const c=document.createElement('canvas');c.width=c.height=128;
      const ctx=c.getContext('2d');const grad=ctx.createRadialGradient(64,64,2,64,64,62);
      grad.addColorStop(0,'rgba(0,0,0,.44)');grad.addColorStop(.48,'rgba(0,0,0,.25)');
      grad.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,128,128);
      return new this.T.CanvasTexture(c);
    }
    supported(f,assets){
      return this.ready&&ENABLED.includes(f?.def?.id)&&!assets?.image?.('characters',f.def.id);
    }
    material(color,kind='fabric'){
      const T=this.T,metal=kind==='metal',skin=kind==='skin';
      return new T.MeshStandardMaterial({color,metalness:metal?.72:.08,
        roughness:metal?.32:skin?.63:.82,flatShading:false});
    }
    scaledSphere(parent,mat,x,y,z,sx,sy,sz){
      const o=new this.T.Mesh(this.shared.ball,mat);
      o.position.set(x,y,z);o.scale.set(sx,sy,sz);parent.add(o);return o;
    }
    cylinder(parent,mat,x,y,z,length,top,bottom){
      const T=this.T;
      const mesh=new T.Mesh(new T.CylinderGeometry(top,bottom,length,CONFIG.CYLINDER_SIDES),mat);
      mesh.position.set(x,y,z);parent.add(mesh);return mesh;
    }
    limb(parent,mat,len,top,bottom){
      const T=this.T,mesh=new T.Mesh(new T.CylinderGeometry(top,bottom,len,CONFIG.CYLINDER_SIDES),mat);
      mesh.position.y=-len/2;parent.add(mesh);return mesh;
    }
    makeModel(id){
      const T=this.T,data=F.HERO_VISUALS?.[id];if(!data)return null;
      const proportions=F.BODY_BUILDS?.[data.build]||F.BODY_BUILDS.athletic;
      const [main,accent,skin]=data.palette;
      const suit=this.material(main),trim=this.material(accent,'metal'),face=this.material(skin,'skin');
      const dark=this.material('#111e2b'),shadow=this.material('#202a39','fabric');
      const root=new T.Group();this.scene.add(root);
      const poseRoot=new T.Group();root.add(poseRoot);
      const sh=proportions.shoulders;
      const pelvis=this.scaledSphere(poseRoot,suit,0,.86,0,.22,.18,.155);
      const chestPivot=new T.Group();chestPivot.position.y=.92;poseRoot.add(chestPivot);
      this.scaledSphere(chestPivot,suit,0,.26,0,sh,.40,.19);
      this.scaledSphere(chestPivot,trim,0,.43,.165,sh*.8,.12,.045);
      const abdomen=this.scaledSphere(chestPivot,suit,0,.03,.015,.215,.23,.17);
      this.scaledSphere(chestPivot,trim,0,-.055,.15,.24,.045,.035);
      for(const dir of [-1,1]){
        this.scaledSphere(chestPivot,trim,dir*(sh-.02),.48,0,.15,.13,.18);
      }
      // Head, jaw, neck, visor, cheek plates and original angled emblem.
      const head=new T.Group();head.position.y=.68;chestPivot.add(head);
      this.scaledSphere(head,face,0,.14,.01,.146,.195,.139);
      this.scaledSphere(head,suit,0,.31,-.025,.152,.085,.139);
      this.scaledSphere(head,dark,0,.18,.129,.151,.057,.035);
      this.scaledSphere(head,trim,0,.18,.15,.136,.022,.018);
      for(const d of [-1,1])this.scaledSphere(head,suit,d*.13,.07,.08,.054,.093,.08);
      const mark=new T.Group();mark.position.set(0,.28,.203);chestPivot.add(mark);
      if(data.emblem==='chevron'){
        for(const d of [-1,1]){
          const a=this.cylinder(mark,trim,d*.072,0,0,.20,.020,.029);
          a.rotation.z=d*.62;
        }
      }else if(data.emblem==='sun'){
        this.scaledSphere(mark,trim,0,0,0,.09,.09,.015);
      }else if(data.emblem==='shield'){
        this.scaledSphere(mark,trim,0,0,0,.085,.11,.026);
      }else{
        this.scaledSphere(mark,trim,0,0,0,.12,.035,.022);
      }
      const arms={},legs={};
      for(const side of [-1,1]){
        const arm=new T.Group();arm.position.set(side*(sh+.04),.48,0);chestPivot.add(arm);
        this.limb(arm,suit,.34,.135,.102);
        this.scaledSphere(arm,trim,0,-.35,0,.103,.109,.105);
        const elbow=new T.Group();elbow.position.y=-.35;arm.add(elbow);
        this.limb(elbow,suit,.31,.102,.071);
        this.scaledSphere(elbow,trim,0,-.31,0,.085,.094,.085);
        arms[side]={shoulder:arm,elbow};
        const thigh=new T.Group();thigh.position.set(side*.135,.83,.015);poseRoot.add(thigh);
        this.limb(thigh,suit,.43,.15,.112);
        this.scaledSphere(thigh,trim,0,-.43,0,.119,.12,.13);
        const shin=new T.Group();shin.position.y=-.43;thigh.add(shin);
        this.limb(shin,suit,.35,.104,.085);
        this.scaledSphere(shin,trim,0,-.31,.08,.14,.055,.21);
        legs[side]={thigh,shin};
      }
      // Original short scarf panels; not a franchise-specific silhouette.
      const scarf=new T.Group();scarf.position.set(0,.60,-.18);chestPivot.add(scarf);
      this.scaledSphere(scarf,trim,0,-.1,0,.24,.30,.035);
      const shadowPlane=new T.Mesh(new T.PlaneGeometry(1.2,.48),
        new T.MeshBasicMaterial({map:this.shadowTex,transparent:true,depthWrite:false,opacity:.65}));
      shadowPlane.rotation.x=-.025;shadowPlane.position.set(0,.018,-.35);root.add(shadowPlane);
      this.models.set(id,{root,poseRoot,chestPivot,head,arms,legs,scarf,shadowPlane,materials:[suit,trim,face,dark,shadow],data});
      return this.models.get(id);
    }
    pose(model,f){
      const t=f.animClock||0,mode=f.state||'idle',attack=f.attack;
      let lean=.04*Math.sin(t*CONFIG.IDLE_HZ),guard=0,reach=0,crouch=0;
      const air=!f.grounded||mode==='jump';
      if(mode==='walk')lean=.09;
      if(f.crouch||mode==='crouch')crouch=.34;
      if(mode==='hitstun')lean=-.25;
      if(mode==='block'||mode==='blockstun')guard=.6;
      if(mode==='victory')guard=-.7;
      if(attack){
        const tk=f.attackTick||0,s=attack.startup||1,a=attack.active||1,r=attack.recovery||1;
        const wind=SMOOTH(tk/s),impact=SMOOTH((tk-s)/Math.max(1,a)),recover=SMOOTH((tk-s-a)/r);
        reach=tk<s?INTERP(0,-.6,wind):tk<s+a?INTERP(-.6,1.7,impact):INTERP(1.7,0,recover);
        lean=tk<s?-.10:tk<s+a?.23:.06;
      }
      model.poseRoot.position.y=-crouch+(air?.07:Math.sin(t*.10)*.008);
      model.chestPivot.rotation.z=lean;
      model.chestPivot.rotation.x=attack?.1:Math.sin(t*.048)*.017;
      model.head.rotation.z=-lean*.35;
      model.head.rotation.x=guard?.11:0;
      model.arms[-1].shoulder.rotation.z=-.60+guard;
      model.arms[-1].elbow.rotation.z=-.65;
      model.arms[1].shoulder.rotation.z=.52-reach;
      model.arms[1].elbow.rotation.z=.68+Math.max(0,reach)*.65;
      for(const side of [-1,1]){
        const leg=model.legs[side];
        const gait=mode==='walk'?Math.sin(t*.25+(side===1?Math.PI:0))*.35:0;
        leg.thigh.rotation.z=gait+side*.06+(crouch?side*.17:0);
        leg.shin.rotation.z=-Math.max(0,gait)*.5-(crouch?.67:0);
      }
      model.scarf.rotation.z=Math.sin(t*.074)*.08;
    }
    draw(ctx,g){
      if(!this.ready||!Array.isArray(g?.fighters)||!g.fighters.length)return false;
      const usable=g.fighters.filter(f=>this.supported(f,g.assets));
      if(!usable.length)return false;
      try{
        const target=ctx.canvas;
        const scale=CLAMP(Math.max((target?.width||CONFIG.W)/CONFIG.W,(target?.height||CONFIG.H)/CONFIG.H),1,CONFIG.MAX_RENDER_SCALE);
        const width=Math.round(CONFIG.W*scale),height=Math.round(CONFIG.H*scale);
        if(this.canvas.width!==width||this.canvas.height!==height){
          this.renderer.setSize(width,height,false);this.lastSignature='';
        }
        const sig=usable.map(f=>[f.def.id,f.x,f.y,f.facing,f.state,f.attackTick,f.animClock,f.flash].join(':')).join('|')+'|'+(g.stageId||'');
        if(sig!==this.lastSignature){
          for(const model of this.models.values())model.root.visible=false;
          for(const f of usable){
            const m=this.models.get(f.def.id)||this.makeModel(f.def.id);if(!m)continue;
            m.root.visible=true;
            m.root.position.set((f.x-CONFIG.W/2)/CONFIG.PIXELS_PER_UNIT,(CONFIG.H/2-f.y)/CONFIG.PIXELS_PER_UNIT,0);
            m.root.scale.x=f.facing>=0?1:-1;
            this.pose(m,f);
          }
          const stage=F.STAGES?.[g.stageId];
          if(stage){this.rim.color.set(stage.light||'#8bd1e5');}
          this.renderer.render(this.scene,this.camera);
          this.lastSignature=sig;this.stats.draws++;
        }else this.stats.cacheHits++;
        ctx.drawImage(this.canvas,0,0,CONFIG.W,CONFIG.H);
        return true;
      }catch(e){
        this.error=e;this.failed=true;this.ready=false;
        return false;
      }
    }
    dispose(){
      for(const m of this.models.values()){
        m.root.parent?.remove(m.root);
        for(const mat of m.materials)mat.dispose();
      }
      this.renderer?.dispose();this.shadowTex?.dispose();this.ready=false;
    }
  }
  F.Visual3D={CONFIG,ENABLED,ThreePresentation,create:()=>new ThreePresentation()};
})();

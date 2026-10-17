'use strict';
/* RE-Justice: modular sculpted character study — visual-only, zero physics/logic writes. */
(() => {
  const F=window.FG=window.FG||{};
  const CONFIG=Object.freeze({W:1280,H:720,PIXELS_PER_UNIT:91,MAX_RENDER_SCALE:2,
    CAMERA_DEPTH:22,SHADOW_ALPHA:.34,IDLE_HZ:.052,WALK_HZ:.19,RING_SIDES:20,
    EYE_HEIGHT:2.245,POSE_EASE:.13});
  const CLAMP=(x,a,b)=>Math.min(b,Math.max(a,x));
  const SMOOTH=(x)=>{x=CLAMP(x,0,1);return x*x*(3-2*x);};
  const EASE=(a,b,t)=>a+(b-a)*SMOOTH(t);
  const SUPPORTED=['flash','batman','superman','wonder-woman'];
  class ThreePresentation {
    constructor(){
      this.ready=false;this.failed=false;this.error=null;this.models=new Map();
      this.stats={draws:0,cacheHits:0};this.lastSignature='';
      const T=window.THREE;if(!T){this.error='Three.js did not load';return;}
      try{
        this.T=T;this.canvas=document.createElement('canvas');
        this.renderer=new T.WebGLRenderer({canvas:this.canvas,alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
        this.renderer.setClearColor(0,0);this.renderer.outputColorSpace=T.SRGBColorSpace;
        this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.18;
        this.scene=new T.Scene();
        this.camera=new T.OrthographicCamera(-CONFIG.W/(2*CONFIG.PIXELS_PER_UNIT),CONFIG.W/(2*CONFIG.PIXELS_PER_UNIT),CONFIG.H/(2*CONFIG.PIXELS_PER_UNIT),-CONFIG.H/(2*CONFIG.PIXELS_PER_UNIT),.1,100);
        this.camera.position.set(0,0,CONFIG.CAMERA_DEPTH);this.camera.lookAt(0,0,0);
        this.scene.add(new T.HemisphereLight(0xd7e8ff,0x283548,1.48));
        const key=new T.DirectionalLight(0xffe6d3,3.1);key.position.set(-4,7,9);this.scene.add(key);
        this.rim=new T.DirectionalLight(0xa6bcec,3.2);this.rim.position.set(4,5,-5);this.scene.add(this.rim);
        const fill=new T.DirectionalLight(0x9db5c9,.65);fill.position.set(3,2,7);this.scene.add(fill);
        this.geo={sphere:new T.SphereGeometry(1,24,14),box:new T.BoxGeometry(1,1,1),cone:new T.ConeGeometry(1,1,16)};
        this.shadow=this.makeShadow();this.ready=true;
      }catch(e){this.error=e;this.failed=true;try{this.renderer?.dispose()}catch(_){} }
    }
    mat(hex,type='fabric'){
      const metal=type==='metal',skin=type==='skin',leather=type==='leather';
      return new this.T.MeshStandardMaterial({color:hex,roughness:metal?.32:skin?.78:leather?.65:.67,
        metalness:metal?.7:leather?.10:.03,side:this.T.FrontSide});
    }
    makeShadow(){
      const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
      const c=canvas.getContext('2d'),g=c.createRadialGradient(64,64,5,64,64,64);
      g.addColorStop(0,'rgba(0,0,0,.60)');g.addColorStop(.43,'rgba(0,0,0,.31)');g.addColorStop(1,'rgba(0,0,0,0)');
      c.fillStyle=g;c.fillRect(0,0,128,128);return new this.T.CanvasTexture(canvas);
    }
    supported(f,assets){return this.ready&&SUPPORTED.includes(f?.def?.id)&&!assets?.image?.('characters',f.def.id);}
    grp(p,x=0,y=0,z=0){const g=new this.T.Group();g.position.set(x,y,z);p.add(g);return g;}
    orb(p,m,x,y,z,rx,ry,rz){const o=new this.T.Mesh(this.geo.sphere,m);o.position.set(x,y,z);o.scale.set(rx,ry,rz);p.add(o);return o;}
    // Closed smooth elliptical loft: cross-sections give real anatomical mass rather than cylinders.
    loft(p,m,profile,depth=.16){
      const n=CONFIG.RING_SIDES,vs=[],indices=[];
      for(const ring of profile){const [y,rx,rz,z=0]=ring;
        for(let j=0;j<n;j++){
          const t=j*2*Math.PI/n;vs.push(Math.cos(t)*rx,y,z+Math.sin(t)*(rz??depth));
        }
      }
      for(let i=0;i<profile.length-1;i++)for(let j=0;j<n;j++){
        const a=i*n+j,b=i*n+(j+1)%n,c=(i+1)*n+j,d=(i+1)*n+(j+1)%n;
        indices.push(a,b,d,a,d,c);
      }
      for(const end of [0,profile.length-1]){
        const i=end*n;for(let j=1;j<n-1;j++)indices.push(i,i+j+(end?0:1),i+j+(end?1:0));
      }
      const g=new this.T.BufferGeometry();g.setAttribute('position',new this.T.Float32BufferAttribute(vs,3));
      g.setIndex(indices);g.computeVertexNormals();const mesh=new this.T.Mesh(g,m);p.add(mesh);return mesh;
    }
    part(p,mat,length,top,bottom,width=.11){
      const r=width;return this.loft(p,mat,[[.032,top,r*.92,0],[0,top,r,0],[-length*.24,top*1.12,r*1.14,0],[-length*.61,(top+bottom)*.54,r*1.05,0],[-length,bottom,r*.86,0],[-length-.02,bottom*.77,r*.65,0]]);
    }
    poly(p,material,points,z=.23){
      const T=this.T,s=new T.Shape();s.moveTo(points[0][0],points[0][1]);points.slice(1).forEach(v=>s.lineTo(v[0],v[1]));s.closePath();
      const mesh=new T.Mesh(new T.ShapeGeometry(s),new T.MeshBasicMaterial({color:material,side:T.DoubleSide}));mesh.position.z=z;p.add(mesh);return mesh;
    }
    line(p,mat,ax,ay,az,bx,by,bz,thickness=.008){
      const T=this.T,v1=new T.Vector3(ax,ay,az),v2=new T.Vector3(bx,by,bz);const v=v2.clone().sub(v1);
      const tube=new T.Mesh(new T.CylinderGeometry(thickness,thickness,v.length(),8),mat);
      tube.position.copy(v1).add(v2).multiplyScalar(.5);tube.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());p.add(tube);return tube;
    }
    makeCape(p,cols,wide=false){
      const T=this.T,gridX=13,gridY=16,geo=new T.PlaneGeometry(1,1,gridX-1,gridY-1);
      const pos=geo.attributes.position;
      for(let i=0;i<pos.count;i++){
        const x=pos.getX(i),u=pos.getY(i),t=.5-u;
        pos.setXYZ(i,x*(wide?.73:.61)*(1+t*.66),-t*1.43,(t*t)*(-.24)-Math.abs(x)*.10);
      }
      geo.computeVertexNormals();
      const material=new T.MeshStandardMaterial({color:cols,metalness:0,roughness:.86,side:T.DoubleSide});
      const mesh=new T.Mesh(geo,material);mesh.position.set(0,.53,-.19);p.add(mesh);
      return {mesh,geo,rest:Float32Array.from(pos.array)};
    }
    compose(id,slot){
      const T=this.T,d=F.HERO_VISUALS[id],b=F.BODY_BUILDS[d?.build];if(!d||!b)return null;
      const c={base:this.mat(d.suit),shade:this.mat(d.shadow,'leather'),high:this.mat(d.highlight),
        trim:this.mat(d.trim,'metal'),metal:this.mat(d.metal,'metal'),skin:this.mat(d.skin,'skin'),
        hair:this.mat(d.hair,'leather'),eye:this.mat(d.eyes),black:this.mat('#0c111b'),
        seam:this.mat('#15202c','leather'),highlight:this.mat('#d9ecfb','metal')};
      const root=this.grp(this.scene),pose=this.grp(root),shoulder=b.shoulder,torso=this.grp(pose,0,1.16,0);
      // Pelvis and athletic sculpt: separated visible chest/abdomen volumes, defined taper and deltoid.
      this.loft(pose,c.base,[[1.13,b.hip*.79,.137],[1.19,b.hip,.161],[1.32,b.waist,.142],[1.36,b.waist*.88,.141]]);
      this.loft(torso,c.base,[[.03,b.waist*.84,.135],[.17,b.waist,.164],[.37,shoulder*.74,.211],[.53,shoulder*.96,.217],[.66,shoulder*.85,.182],[.70,shoulder*.40,.128]]);
      // Chest armor follows the sculpt, not broad floating spheres.
      for(const side of [-1,1]){
        const breast=this.orb(torso,c.high,side*shoulder*.40,.49,.117,shoulder*.47,.181,.109);
        breast.rotation.z=-side*.13;
        if(d.armor>.5){this.orb(torso,c.metal,side*shoulder*.50,.55,.166,shoulder*.26,.102,.083);}
        for(let n=0;n<3;n++){
          this.line(torso,c.seam,side*.043,.19-n*.056,.174,side*.204,.18-n*.056,.17,.005);
        }
      }
      this.orb(torso,c.shade,0,.093,.12,b.waist*.73,.17,.087);
      // Continuous waist belt with buckle and individual pouches.
      this.loft(pose,c.shade,[[1.12,b.waist+.018,.162],[1.17,b.waist+.027,.166],[1.22,b.waist+.028,.166],[1.235,b.waist+.018,.153]]);
      for(const side of [-1,1])for(let n=0;n<3;n++){
        const x=side*(.085+n*.065);this.orb(pose,id==='batman'?c.trim:c.metal,x,1.18,.16,.034,.055,.029);
      }
      this.orb(pose,c.trim,0,1.18,.188,.060,.050,.024);
      const arms={},legs={};
      for(const side of [-1,1]){
        const shoulderJoint=this.grp(torso,side*shoulder*.83,.56,0);
        this.orb(shoulderJoint,c.base,0,-.025,0,.141,.151,.150);
        this.part(shoulderJoint,c.base,.367,.139,.112,.131);
        this.orb(shoulderJoint,c.metal,side*.013,-.05,.094,.154,.111,.085);
        const elbow=this.grp(shoulderJoint,0,-.362,0);
        this.orb(elbow,c.base,0,0,0,.11,.111,.11);
        this.part(elbow,c.base,.350,.115,.074,.115);
        this.orb(elbow,c.trim,0,-.205,.062,.103,.135,.084);
        const hand=this.grp(elbow,0,-.355,0);this.orb(hand,c.base,0,-.055,.01,.082,.114,.063);
        for(let n=0;n<3;n++)this.orb(hand,c.base,(n-1)*.046,-.125,.053,.025,.058,.032);
        arms[side]={shoulder:shoulderJoint,elbow,hand};
        const hip=this.grp(pose,side*.147,1.13,0);
        this.part(hip,c.base,.56,.178,.118,.17);
        this.orb(hip,c.high,side*.016,-.13,.12,.137,.168,.075);
        const knee=this.grp(hip,0,-.54,0);
        this.orb(knee,c.metal,0,0,.035,.112,.134,.136);
        this.part(knee,c.base,.49,.122,.075,.116);
        this.orb(knee,c.shade,0,-.26,.074,.118,.255,.091);
        const boot=this.grp(knee,0,-.49,0);this.orb(boot,c.shade,0,-.07,.115,.113,.094,.203);
        this.orb(boot,c.metal,0,-.082,.22,.105,.025,.086);
        legs[side]={hip,knee,boot};
      }
      // Ribbed forearm plating, quadriceps and costume stitch lines add visual density at fighter scale.
      for(const side of [-1,1]){
        const arm=arms[side],leg=legs[side];
        for(let i=0;i<3;i++)this.line(arm.elbow,c.seam,-.07,-.15-i*.055,.105,.065,-.15-i*.055,.104,.004);
        for(let i=0;i<2;i++)this.line(leg.hip,c.seam,-.06,-.17-i*.14,.154,.055,-.2-i*.14,.144,.004);
      }
      // Neck and head: jaw, cheeks, brow, nose, eyes, mouth and hair/cowl layers.
      const neck=this.grp(torso,0,.715,.0);this.loft(neck,c.skin,[[.01,.092,.075],[.13,.083,.073],[.17,.071,.06]]);
      const head=this.grp(neck,0,.137,0);
      this.orb(head,c.skin,0,.15,.008,b.head,.215,.154);
      this.orb(head,c.skin,0,.042,.055,b.head*.77,.100,.111);
      this.orb(head,c.skin,0,.135,.14,.055,.080,.045);
      this.orb(head,c.skin,0,.170,.174,.028,.057,.034); // nose bridge and tip
      this.orb(head,c.shade,0,.062,.148,.038,.010,.015);
      for(const side of [-1,1]){
        this.orb(head,c.eye,side*.072,.179,.154,.037,.016,.016);
        this.orb(head,c.hair,side*.073,.212,.152,.052,.015,.018);
      }
      if(d.mask==='none'||d.mask==='tiara'){
        this.orb(head,c.hair,0,.33,-.01,b.head*1.025,.107,.170);
        if(d.mask==='none'){
          this.orb(head,c.hair,-.08,.285,.12,.075,.057,.070);
        }else{
          for(const side of [-1,1]){
            this.orb(head,c.hair,side*.143,.08,-.022,.074,.253,.118);
            this.orb(head,c.hair,side*.168,-.15,-.04,.072,.234,.108);
          }
          this.poly(head,'#d9ab51',[[-.13,.265],[0,.345],[.13,.265],[.085,.244],[0,.282],[-.085,.244]],.15);
        }
      }else{
        this.orb(head,c.base,0,.317,-.024,b.head*1.075,.114,.166);
        // Open nose / jaw plate masks leave skin visible; brow plate reads at a glance.
        this.orb(head,c.base,0,.222,.115,b.head*1.01,.062,.062);
        for(const side of [-1,1])this.orb(head,c.base,side*b.head*.87,.14,.078,.046,.136,.092);
        if(d.mask==='cowl'){
          for(const side of [-1,1]){
            const ear=new T.Mesh(new T.ConeGeometry(.057,.24,12),c.base);ear.position.set(side*.120,.424,-.014);head.add(ear);
          }
        }else{
          for(const side of [-1,1]){
            const fin=this.poly(head,d.trim,[[side*.155,.288],[side*.265,.337],[side*.188,.245]],.075);
          }
        }
      }
      // Chest symbols are flat inset details, not spinning disks.
      const crest=this.grp(torso,0,.46,.253);
      if(d.emblem==='bolt'){
        this.poly(crest,d.trim,[[-.015,.13],[.088,.13],[.017,.012],[.077,.012],[-.093,-.155],[-.061,-.02],[-.127,-.02]],.01);
        this.orb(crest,c.trim,0,0,-.012,.148,.146,.016);
      }else if(d.emblem==='bat'){
        this.poly(crest,'#111820',[[-.235,.053],[-.142,.068],[-.093,.104],[-.023,.066],[0,.105],[.023,.066],[.093,.104],[.142,.068],[.235,.053],[.158,-.033],[.098,-.056],[.042,-.024],[0,-.088],[-.042,-.024],[-.098,-.056],[-.158,-.033]],.02);
      }else if(d.emblem==='shield'){
        this.poly(crest,'#e1b560',[[-.182,.110],[.181,.110],[.16,-.052],[0,-.162],[-.16,-.052]],.0);
        this.poly(crest,'#a62936',[[-.139,.068],[.132,.068],[.101,.002],[.03,.019],[0,-.055],[-.068,-.091],[-.11,-.02]],.012);
      }else{
        this.poly(crest,'#e2b967',[[-.195,.09],[-.138,-.055],[-.055,.002],[0,-.08],[.055,.002],[.138,-.055],[.195,.09],[.10,.026],[0,.049],[-.10,.026]],.01);
      }
      // Per-character costume details: reinforced shoulder armor, diadem and brassard motifs.
      if(d.style==='amazon'){
        for(const side of [-1,1]){
          this.orb(arms[side].elbow,c.trim,0,-.22,.075,.117,.188,.097);
          this.orb(legs[side].knee,c.trim,0,-.14,.095,.12,.198,.085);
        }
      }
      if(d.style==='tactical'){
        for(const side of [-1,1]){
          this.orb(legs[side].hip,c.metal,0,-.26,.142,.14,.18,.076);
          this.orb(arms[side].shoulder,c.metal,side*.01,-.13,.125,.12,.17,.089);
        }
      }
      const cape=d.cape?this.makeCape(torso,d.style==='tactical'?'#111827':'#a21f30',d.style==='heroic'):null;
      const shadowPlane=new T.Mesh(new T.PlaneGeometry(1.36,.5),new T.MeshBasicMaterial({map:this.shadow,transparent:true,depthWrite:false,opacity:.82}));
      shadowPlane.position.set(0,.013,-.43);root.add(shadowPlane);
      const built={id,data:d,root,pose,torso,head,arms,legs,cape,shadowPlane};this.models.set(id+':'+slot,built);return built;
    }
    poseModel(m,f){
      const t=f.animClock||0,mode=f.state||'idle',a=f.attack,air=!f.grounded||mode==='jump';
      const crouch=f.crouch||mode==='crouch',walk=mode==='walk',hurt=mode==='hitstun',block=mode==='block'||mode==='blockstun';
      const attackTick=f.attackTick||0;
      let recoil=0,extension=0;
      if(a){
        const start=Math.max(1,a.startup),active=Math.max(1,a.active),recover=Math.max(1,a.recovery);
        recoil=attackTick<start?EASE(0,-.53,attackTick/start):attackTick<start+active?EASE(-.53,0,(attackTick-start)/active):EASE(0,0,(attackTick-start-active)/recover);
        extension=attackTick<start?EASE(0,-.55,attackTick/start):attackTick<start+active?EASE(1.0,1.56,(attackTick-start)/active):EASE(1.56,0,(attackTick-start-active)/recover);
      }
      const breath=Math.sin(t*CONFIG.IDLE_HZ)*.014;
      m.pose.position.y=crouch?-.31:(air?.038:breath);
      m.torso.rotation.z=hurt?-.27:a?(recoil+.15):walk?.052:Math.sin(t*.043)*.023;
      m.torso.rotation.x=block?.15:a?.1:Math.sin(t*.046)*.012;
      m.head.rotation.z=-(m.torso.rotation.z)*.28;
      const left=m.arms[-1],right=m.arms[1];
      left.shoulder.rotation.z=block?-.21:-.52;
      left.shoulder.rotation.x=block?-.24:-.12;
      left.elbow.rotation.z=block?-.98:-.96;
      right.shoulder.rotation.z=block?.25:a?-.47-extension:-.37;
      right.shoulder.rotation.x=.05;
      right.elbow.rotation.z=block?1.08:a?1.02-Math.max(0,extension)*.83:.89;
      for(const side of [-1,1]){
        const leg=m.legs[side];const gait=walk?Math.sin(t*CONFIG.WALK_HZ+(side===1?Math.PI:0))*.44:0;
        leg.hip.rotation.z=gait+side*(crouch?.28:.075);
        leg.knee.rotation.z=-Math.max(0,-gait)*.62-(crouch?.82:.07);
        if(air)leg.hip.rotation.z+=side*.19;
      }
      if(m.cape){
        const pos=m.cape.geo.attributes.position,rest=m.cape.rest;
        for(let i=0;i<pos.count;i++){
          const j=i*3;
          const depth=CLAMP(-rest[j+1]/1.43,0,1);
          pos.setZ(i,rest[j+2]+Math.sin(t*.075+rest[j]*5+depth*2.5)*depth*.075);
        }
        pos.needsUpdate=true;m.cape.geo.computeVertexNormals();
      }
      // Render-only hit tint, no simulation writes.
      if(m.data){m.torso.scale.set(1+(f.flash?-.027:0),1+(f.flash?.024:0),1);}
    }
    draw(ctx,g){
      if(!this.ready||!g?.fighters?.length)return false;
      const usable=g.fighters.filter(f=>this.supported(f,g.assets));if(!usable.length)return false;
      try{
        const target=ctx.canvas,scale=CLAMP(Math.max((target?.width||CONFIG.W)/CONFIG.W,(target?.height||CONFIG.H)/CONFIG.H),1,CONFIG.MAX_RENDER_SCALE);
        const w=Math.round(CONFIG.W*scale),h=Math.round(CONFIG.H*scale);
        if(this.canvas.width!==w||this.canvas.height!==h){this.renderer.setSize(w,h,false);this.lastSignature='';}
        const sig=usable.map(f=>[f.def.id,f.x,f.y,f.facing,f.state,f.attackTick,f.animClock,f.flash,f.health].join(':')).join('|')+'|'+g.stageId;
        if(sig!==this.lastSignature){
          for(const m of this.models.values())m.root.visible=false;
          for(const f of usable){
            const key=f.def.id+':'+(f.slot||1);const m=this.models.get(key)||this.compose(f.def.id,f.slot||1);if(!m)continue;
            m.root.visible=true;
            m.root.position.set((f.x-CONFIG.W/2)/CONFIG.PIXELS_PER_UNIT,(CONFIG.H/2-f.y)/CONFIG.PIXELS_PER_UNIT,0);
            const previewScale=CLAMP(g.previewScale||1,.5,2.0);m.root.scale.set((f.facing>=0?1:-1)*previewScale,previewScale,previewScale);this.poseModel(m,f);
          }
          this.rim.color.set(F.STAGES?.[g.stageId]?.light||'#a1bfdc');
          this.renderer.render(this.scene,this.camera);this.lastSignature=sig;this.stats.draws++;
        }else this.stats.cacheHits++;
        ctx.drawImage(this.canvas,0,0,CONFIG.W,CONFIG.H);return true;
      }catch(e){this.failed=true;this.ready=false;this.error=e;return false;}
    }
    dispose(){for(const m of this.models.values()){m.root.parent?.remove(m.root);}
      this.renderer?.dispose();this.shadow?.dispose();this.ready=false;}
  }
  F.Visual3D={CONFIG,ENABLED:SUPPORTED,ThreePresentation,create:()=>new ThreePresentation()};
})();

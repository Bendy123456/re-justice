import {chromium} from 'playwright';
import fs from 'node:fs';
const browser=await chromium.launch({headless:true,args:[
  '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist'
]});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',err=>errors.push(err.message));
page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
page.on('response',r=>{if(r.status()>=400)errors.push('HTTP '+r.status()+' '+r.url());});
fs.mkdirSync('arena-qa-images',{recursive:true});
try{
  await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForTimeout(4500);
  console.log('ARENA_BOOT_DIAGNOSTICS',JSON.stringify(await page.evaluate(()=>({
    documentReady:document.readyState,
    gamePresent:!!window.game,
    arenaClass:!!window.FG?.Arena3D,
    arenaObject:!!window.game?.arena3d,
    arenaReady:window.game?.arena3d?.ready,
    arenaError:window.game?.arena3d?.failure,
    scripts:[...document.scripts].map(x=>x.src).filter(x=>x.includes('arena3d')||x.includes('glb-visuals'))
  }))));
  console.log('ARENA_INITIAL_ERRORS',JSON.stringify(errors));
  await page.waitForFunction(()=>Boolean(window.game?.arena3d),null,{timeout:80000});
  await page.waitForFunction(()=>Boolean(window.game?.arena3d?.ready),null,{timeout:120000});
  const start=await page.evaluate(()=>{
    const g=window.game;
    g.startMatch({p1:'wonder-woman',p2:'batman',mode:'cpu',stage:'neon-rooftop'});
    g.render();
    return {scene:g.scene,ready:g.arena3d.ready,
      avatars:g.arena3d.views.map(v=>({slot:v.actor.slot,rigBones:v.bones.size,key:v.key})),
      arenaLoaded:!!g.arena3d.arena,
      arenaCanvas:g.arena3d.webgl.style.display,
      oldCanvas:g.canvas.style.opacity};
  });
  console.log('ARENA_INIT',JSON.stringify(start));
  if(start.scene!=='arena3d'||!start.ready||start.avatars.length!==2||
      start.avatars.some(v=>v.rigBones<60)||start.arenaCanvas!=='block')
    throw Error('Failed to activate 3D arena with 2 fully rigged GLB characters');
  // Diagnostic: independently render the CURRENT pose at full idle weight,
  // from the fighter's front, and report measured wrists vs guard targets.
  const guardQA=await page.evaluate(async ()=>{
    const ar=window.game.arena3d,v=ar.views[0],a=v.actor;
    a.state='idle';a.attack=null;a.blocking=false;a.grounded=true;
    a.visualYaw=a.prevVisualYaw=0;a.animClock++;
    v.combatIdleWeight=1;v.lastStateTick=-1;v.lastWalkPose=null;
    ar.pose(v,1);
    const xyz=name=>v.bones.get(name)?.getWorldPosition(
      v.root.position.clone()).toArray();
    const head=xyz('head');
    const measured={};
    for(const side of ['l','r']){
      const shoulder=xyz('upperarm_'+side),elbow=xyz('lowerarm_'+side),
        wrist=xyz('hand_'+side),hip=xyz('thigh_'+side),
        knee=xyz('calf_'+side),foot=xyz('foot_'+side);
      measured[side]={shoulder,elbow,wrist,hip,knee,foot,
        wristVsHead:head&&wrist?wrist.map((n,i)=>n-head[i]):null,
        armSide:v.armSides[side],legSide:v.legSides[side]};
    }
    // Measure whether skinned finger tips really curl toward knuckles.
    // A grip scalar of 1 does NOT prove visually closed fists.
    const fingerQA={};
    for(const side of ['l','r']){
      fingerQA[side]={};
      for(const digit of ['index','middle','ring','pinky','thumb']){
        const names=[digit+'_01_'+side,digit+'_02_'+side,
          digit+'_03_'+side,digit+'_04_leaf_'+side];
        const bones=names.map(n=>v.bones.get(n));
        if(bones.some(b=>!b))continue;
        const originals=bones.map(b=>b.quaternion.clone());
        v.root.updateWorldMatrix(true,true);
        const posed=bones[3].getWorldPosition(v.root.position.clone()).
          distanceTo(bones[0].getWorldPosition(v.root.position.clone()));
        for(let k=0;k<4;k++)bones[k].quaternion.copy(v.rests.get(names[k]));
        v.root.updateWorldMatrix(true,true);
        const rest=bones[3].getWorldPosition(v.root.position.clone()).
          distanceTo(bones[0].getWorldPosition(v.root.position.clone()));
        for(let k=0;k<4;k++)bones[k].quaternion.copy(originals[k]);
        v.root.updateWorldMatrix(true,true);
        fingerQA[side][digit]={rest,posed,closure:rest-posed};
      }
    }
    // Test which direction and strength actually CLOSE a finger on this
    // mesh. Merely setting grip=1 is not proof of a clenched hand.
    const THREE=await import('three');
    const fingerProbe={};
    for(const side of ['l','r']){
      fingerProbe[side]={};
      const hand=v.bones.get('hand_'+side);
      const axis=new THREE.Vector3(0,0,1).
        applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()));
      for(const digit of ['index','pinky']){
        const names=[digit+'_01_'+side,digit+'_02_'+side,
          digit+'_03_'+side,digit+'_04_leaf_'+side];
        const fingers=names.map(n=>v.bones.get(n));
        if(fingers.some(b=>!b))continue;
        const saved=fingers.map(b=>b.quaternion.clone());
        fingerProbe[side][digit]=[];
        for(const strength of [-2,-1.5,-1,-.5,0,.5,1,1.5,2,2.5]){
          for(let k=0;k<4;k++)fingers[k].quaternion.copy(v.rests.get(names[k]));
          v.root.updateWorldMatrix(true,true);
          const fractions=[.60,.64,.42,.20];
          for(let k=0;k<4;k++){
            const b=fingers[k];
            const dq=new THREE.Quaternion().setFromAxisAngle(
              axis,1.24*strength*fractions[k]);
            const parent=b.parent.getWorldQuaternion(new THREE.Quaternion());
            b.quaternion.premultiply(parent.clone().invert().
              multiply(dq).multiply(parent)).normalize();
            b.updateWorldMatrix(false,true);
          }
          v.root.updateWorldMatrix(true,true);
          const dist=fingers[3].getWorldPosition(new THREE.Vector3()).
            distanceTo(fingers[0].getWorldPosition(new THREE.Vector3()));
          fingerProbe[side][digit].push([strength,Number(dist.toFixed(4))]);
        }
        for(let k=0;k<4;k++)fingers[k].quaternion.copy(saved[k]);
        v.root.updateWorldMatrix(true,true);
      }
    }
    const boneHierarchy=Object.fromEntries(
      ['hips','pelvis','thigh_l','thigh_r','spine_01'].map(name=>{
        const b=v.bones.get(name);return [name,{parent:b?.parent?.name,
          worldY:b?.getWorldPosition(v.root.position.clone()).y,
          localY:b?.position.y}];
      }));
    const camera=ar.camera,origin=v.root.position;
    camera.position.set(origin.x+2.15,2.10,origin.z+4.45);
    camera.lookAt(origin.x,.89,origin.z);
    // Hide the game HUD while capturing the REAL rendered character.
    ar.hud.style.display='none';
    ar.renderer.render(ar.scene,camera);
    return {root:[origin.x,origin.y,origin.z],head,measured,
      metrics:v.poseMetrics,fingerQA,fingerProbe,boneHierarchy,
      model:v.key,rootRotation:v.root.rotation.y};
  });
  console.log('SCULPTED_GUARD_DIAGNOSTIC',JSON.stringify(guardQA));
  const guardFrame=await page.locator('#arena3d-webgl').screenshot({
    type:'jpeg',quality:62});
  const guardChunks=guardFrame.toString('base64').match(/.{1,5000}/g)||[];
  guardChunks.forEach((chunk,i)=>console.log('SCULPTED_GUARD_JPG:'+i+'/'+guardChunks.length+':'+chunk));
  console.log('SCULPTED_GUARD_JPG_END:'+guardChunks.length);
  await page.evaluate(()=>{
    const ar=window.game.arena3d;
    ar.hud.style.display='block';
  });
  if(guardQA.measured.l.wristVsHead[1]<-.25||
     guardQA.measured.r.wristVsHead[1]<-.25||
     guardQA.metrics.kneeL<.55||guardQA.metrics.kneeR<.55||
     guardQA.metrics.elbowL<.55||guardQA.metrics.elbowR<.55)
    throw Error('Sculpted idle: fist below guard or knee/elbow insufficiently flexed');
  
  await page.waitForTimeout(600);
  await page.screenshot({path:'arena-qa-images/arena-intro.png'});
  // The sky is game geometry, not a static image. Verify both layers
  // share one procedural cloud texture and drift at different speeds.
  const skyQA=await page.evaluate(()=>{
    const a=window.game.arena3d,g=window.game;
    const sky=a.skyDome,layers=a.cloudLayers;
    const counts=layers?.map(x=>x.children.length)||[];
    const textures=new Set(layers.flatMap(l=>l.children.map(c=>c.material.map)));
    const previous=g.frame;
    g.frame=0;a.updateSky(0);
    const before=layers.map(x=>x.rotation.y);
    g.frame=3600;a.updateSky(0);
    const after=layers.map(x=>x.rotation.y);
    const moving=after.map((v,i)=>v-before[i]);
    g.frame=previous;a.updateSky(0);
    return {sky:sky?.name,backSide:sky?.material.side,
      layers:layers.length,counts,textureCount:textures.size,
      textureSize:a.cloudTexture?.image?.width,
      opacity:layers.map(x=>x.children[0]?.material.opacity),drift:moving,
      fogIgnored:layers.every(x=>x.children.every(c=>c.material.fog===false))};
  });
  console.log('DAYTIME_CLOUD_SKY_QA',JSON.stringify(skyQA));
  if(skyQA.sky!=='Daytime Sky Dome'||skyQA.layers!==2||
     skyQA.counts[0]<10||skyQA.counts[1]<10||
     skyQA.textureCount!==1||skyQA.textureSize!==256||
     !skyQA.fogIgnored||skyQA.drift[0]<.1||skyQA.drift[1]>-.1)
    throw Error('Bright sky or gently animated clouds missing');
  await page.evaluate(()=>{
    const a=window.game.arena3d;
    window.game.running=false;
    a.camera.position.set(0,4,-12);
    a.camera.lookAt(0,19,28);
    a.updateSky(0);
    a.renderer.render(a.scene,a.camera);
    a.hudCtx.clearRect(0,0,1280,720);
  });
  await page.screenshot({path:'arena-qa-images/bright-sky-soft-clouds.png'});
  const skyScreenshot=await page.screenshot({type:'jpeg',quality:53});
  const skyChunks=skyScreenshot.toString('base64').match(/.{1,4000}/g)||[];
  skyChunks.forEach((part,i)=>console.log('DAY_SKY_VISUAL:'+i+'/'+skyChunks.length+':'+part));
  console.log('DAY_SKY_VISUAL_FINISH:'+skyChunks.length);
  await page.evaluate(()=>{
    const a=window.game.arena3d;
    a.camera.position.set(0,2.6,-24);
    a.camera.lookAt(0,36,-65);
    a.updateSky(0);
    a.renderer.render(a.scene,a.camera);
  });
  await page.screenshot({path:'arena-qa-images/clouds-above-wall.png'});
  const cloudPreview=await page.screenshot({type:'jpeg',quality:55});
  const chunks=cloudPreview.toString('base64').match(/.{1,4000}/g)||[];
  chunks.forEach((part,i)=>console.log('CLOUD_EDGE_FRAME:'+i+'/'+chunks.length+':'+part));
  console.log('CLOUD_EDGE_FRAME_FINISH:'+chunks.length);

  // Inspect real updated GLB materials, not merely the existence of the
  // old cached arena. This catches accidental reintroduction of ico balls.
  const treeQA=await page.evaluate(()=>{
    const g=window.game.arena3d;
    const mats=new Set();
    let tris=0;
    g.arena.traverse(obj=>{
      if(!obj.isMesh)return;
      const ms=Array.isArray(obj.material)?obj.material:[obj.material];
      for(const m of ms)if(m?.name)mats.add(m.name);
      const geom=obj.geometry;
      if(geom?.index)tris+=geom.index.count/3;
      else if(geom?.attributes?.position)tris+=geom.attributes.position.count/3;
    });
    return {leafMaterials:[...mats].filter(n=>n.startsWith('Leaf blades')),
      oldBallMaterials:[...mats].filter(n=>n.startsWith('Leaf cluster')),
      hasTreeBark:[...mats].some(n=>n.includes('chestnut bark')),
      triangles:Math.round(tris),
      grassMaterials:[...mats].filter(n=>n.includes('GRASS')),
      verticalStone:[...mats].filter(n=>n.startsWith('WALL VERTICAL |')),
      lightStone:[...mats].filter(n=>n.startsWith('WALL VERTICAL | light limestone')),
      oldHorizontalBricks:[...mats].filter(n=>n.startsWith('WALL SLAB |')),
      meadowTurf:[...mats].includes('Meadow turf | textured living grass'),
      textureDetail:(()=>{
        const info={turf:0,stone:0,bark:0,texturedFaces:0};
        g.arena.traverse(obj=>{
          if(!obj.isMesh)return;
          for(const m of (Array.isArray(obj.material)?obj.material:[obj.material])){
            const width=m?.map?.image?.width||0;
            if(!width)continue;
            info.texturedFaces++;
            if(m.name==='Meadow turf | textured living grass')info.turf=Math.max(info.turf,width);
            if(m.name.startsWith('WALL VERTICAL | light limestone'))info.stone=Math.max(info.stone,width);
            if(m.name.includes('chestnut bark'))info.bark=Math.max(info.bark,width);
          }
        });
        return info;
      })(),
      grassTexture:(()=>{
        let textured=false;
        g.arena.traverse(obj=>{
          if(!obj.isMesh)return;
          for(const m of (Array.isArray(obj.material)?obj.material:[obj.material])){
            if(m?.name==='Meadow turf | textured living grass'&&m.map?.image)
              textured=true;
          }
        });
        return textured;
      })()
    };
  });
  console.log('NATURAL_TREE_GEOMETRY_QA',JSON.stringify(treeQA));
  console.log('STONE_SLAB_GRASS_ARENA_QA',JSON.stringify({
    verticalStoneMaterials:treeQA.verticalStone.length,
    lightGrayPanelMaterials:treeQA.lightStone.length,
    leftoverHorizontalBrickMaterials:treeQA.oldHorizontalBricks.length,
    grassMaterials:treeQA.grassMaterials.length,
    texturedGround:treeQA.grassTexture,
    highDetailTextures:treeQA.textureDetail,
    triangles:treeQA.triangles
  }));
  if(treeQA.textureDetail.turf<768||
     treeQA.textureDetail.stone<768||
     treeQA.textureDetail.bark<512||
     treeQA.triangles>650000)
    throw Error('High-detail Blender textures missing or excessive polygon count');
  if(treeQA.verticalStone.length<8||treeQA.grassMaterials.length<4||
      treeQA.lightStone.length!==4||treeQA.oldHorizontalBricks.length!==0||
      !treeQA.meadowTurf||!treeQA.grassTexture)
    throw Error('New Blender light-gray full-height wall or grass texture not loaded');
  if(treeQA.leafMaterials.length<7||treeQA.oldBallMaterials.length>0||
     !treeQA.hasTreeBark||treeQA.triangles<100000)
    throw Error('The old primitive tree was served instead of the new sculpt');
  await page.evaluate(()=>{
    const game=window.game,arena=game.arena3d;
    // Freeze the original requestAnimationFrame loop so the player-follow
    // camera cannot overwrite our intended static tree-inspection view.
    game.running=false;
    arena.camera.position.set(0,7.8,-22);
    arena.camera.lookAt(0,10.5,0);
    arena.renderer.render(arena.scene,arena.camera);
    arena.hudCtx.clearRect(0,0,1280,720);
  });
  await page.screenshot({path:'arena-qa-images/tree-in-game.png'});
  // +Z-forward rig: hands must stay ahead of the body, and the visible
  // character must turn into movement. Combat still aims at the opponent.
  const movementQA=await page.evaluate(()=>{
    const arena=window.game.arena3d;
    window.game.running=false;
    arena.phase='live';
    const [a,b]=arena.fighters,view=arena.views[0],enemyView=arena.views[1];
    arena.move(b,a,window.FG.InputUtils.emptyFrame(),new Set(),false);
    const facing=(v)=>({x:v.root.matrixWorld.elements[8],z:v.root.matrixWorld.elements[10]});
    const dot=(u,v)=>u.x*v.x+u.z*v.z;
    const direction=(x,z)=>{const n=Math.hypot(x,z);return {x:x/n,z:z/n};};
    const travel=(dx,dy,steps=24)=>{
      const ctrl=window.FG.InputUtils.emptyFrame();ctrl.x=dx;ctrl.y=dy;
      const before={x:a.x,z:a.z};
      for(let i=0;i<steps;i++)arena.move(a,b,ctrl,new Set(),true);
      arena.pose(view,1);
      return dot(facing(view),direction(a.x-before.x,a.z-before.z));
    };
    arena.pose(view,1);
    arena.pose(enemyView,1);
    const base={x:a.x,z:a.z};
    const enemy=direction(b.x-a.x,b.z-a.z);
    const enemyFacing=dot(facing(enemyView),{x:-enemy.x,z:-enemy.z});
    const retreat=travel(0,1);
    const movedAway=(a.x-base.x)*enemy.x+(a.z-base.z)*enemy.z<0;
    const sideways=travel(1,0);
    const forward=travel(0,-1);
    const shoulderL=view.bones.get('upperarm_l').getWorldPosition(view.root.position.clone());
    const shoulderR=view.bones.get('upperarm_r').getWorldPosition(view.root.position.clone());
    const handL=view.bones.get('hand_l').getWorldPosition(view.root.position.clone());
    const handR=view.bones.get('hand_r').getWorldPosition(view.root.position.clone());
    const armsAhead=[handL,handR].map((hand,i)=>{
      const shoulder=i?shoulderR:shoulderL;
      const forward=facing(view);
      return (hand.x-shoulder.x)*forward.x+(hand.z-shoulder.z)*forward.z;
    });
    // Starting a strike realigns with the opponent instead of swinging away.
    const strike=window.FG.InputUtils.emptyFrame();
    strike.light=true;strike.pressed.light=true;
    arena.move(a,b,strike,new Set(),true);
    for(let i=0;i<8;i++)arena.move(a,b,window.FG.InputUtils.emptyFrame(),new Set(),true);
    arena.pose(view,1);
    const rival=direction(b.x-a.x,b.z-a.z);
    const attacking=dot(facing(view),rival);
    return {enemyFacing,retreat,sideways,forward,movedAway,
      armsAhead,attacking,lean:a.lean,bank:a.bank};
  });
  console.log('LOCOMOTION_FACING_QA',JSON.stringify(movementQA));
  if(!movementQA.movedAway||
     Math.min(movementQA.enemyFacing,movementQA.retreat,
       movementQA.sideways,movementQA.forward,movementQA.attacking)<.94||
     movementQA.armsAhead.some(v=>!Number.isFinite(v)))
    throw Error('3D fighter no longer faces travel or hands are behind the chest');
  await page.screenshot({path:'arena-qa-images/locomotion-facing.png'});
  // Inspect animated joint-space movement on BOTH imported 65-bone rigs.
  // These are actual posed GLB bones; metrics alone would not prove animation.
  const animationQA=await page.evaluate(()=>{
    const arena=window.game.arena3d,[a,b]=arena.fighters;
    const v=arena.views[0];
    const pos=name=>v.bones.get(name).getWorldPosition(v.root.position.clone());
    const facing=()=>({x:v.root.matrixWorld.elements[8],z:v.root.matrixWorld.elements[10]});
    const reach=side=>{
      const hand=pos('hand_'+side),shoulder=pos('upperarm_'+side),f=facing();
      return (hand.x-shoulder.x)*f.x+(hand.z-shoulder.z)*f.z;
    };
    a.reset(-11,-7);b.reset(11,-7);
    a.state='idle';arena.pose(v,1);
    const idle={lean:v.poseMetrics.lean,left:reach('l'),right:reach('r')};
    a.state='walk';a.gaitPhase=0;a.prevGaitPhase=0;v.walkWeight=1;v.lastStateTick=-1;
    arena.pose(v,1);const firstFoot=pos('foot_l');
    a.gaitPhase=1.57;a.prevGaitPhase=1.57;
    arena.pose(v,1);const secondFoot=pos('foot_l');
    const footTravel=firstFoot.distanceTo(secondFoot);
    a.state='dash';a.dashElapsed=5;a.lean=.13;a.prevLean=.13;
    arena.pose(v,1);
    const dashLean=v.poseMetrics.lean;
    const sample=kind=>{
      a.attack=null;a.attackWith(kind);
      if(kind==='super'){ // only manual pose samples; preserve gameplay meter.
        a.attack={button:'super',kind:'standing',startup:16,active:5,recovery:32};
      }
      a.attackTick=a.attack.startup+1;
      a.state='attack';
      a.lean=0;a.prevLean=0;
      arena.pose(v,1);
      const full={left:reach('l'),right:reach('r'),twist:v.poseMetrics.torsoTwist,
        attackReach:v.poseMetrics.attackReach};
      a.attackTick=a.attack.startup+a.attack.active+Math.round(a.attack.recovery*.75);
      arena.pose(v,1);
      full.recover=v.poseMetrics.attackReach;
      return full;
    };
    const light=sample('light'),medium=sample('medium'),heavy=sample('heavy');
    a.reset(-11,-7);b.reset(11,-7);
    return {rigBones:v.bones.size,idle,footTravel,dashLean,light,medium,heavy};
  });
  console.log('FULL_BODY_ANIMATION_QA',JSON.stringify(animationQA));
  if(animationQA.rigBones<60||
     animationQA.footTravel<.12||
     animationQA.dashLean<animationQA.idle.lean+.18||
     animationQA.light.left<animationQA.idle.left+.07||
     animationQA.medium.right<animationQA.idle.right+.07||
     // Hooks travel around the guard, so check a shorter forward extension.
     animationQA.heavy.right<animationQA.idle.right+.04||
     animationQA.light.twist>-.12||
     animationQA.medium.twist<.14||
     animationQA.heavy.twist<animationQA.medium.twist+.12||
     animationQA.heavy.recover>=animationQA.heavy.attackReach*.55)
    throw Error('Full-body gait, punch, or dash motion is not visible on real rigs');
  await page.screenshot({path:'arena-qa-images/full-body-animation.png'});

  // Superhero motion QA: both Blender rigs must visibly move their feet,
  // initiate dashes with an anticipation, lean into burst, and recoil on exit.
  const heroQA=await page.evaluate(()=>{
    const arena=window.game.arena3d,results=[];
    for(const [i,a] of arena.fighters.entries()){
      const v=arena.views[i];
      a.reset(i?-11:11,-7);a.grounded=true;
      v.walkWeight=1;v.dashWeight=0;
      const pose=(state,phase)=>{
        a.state=state;
        a.gaitPhase=a.prevGaitPhase=phase;
        a.animClock++;v.lastStateTick=-1;
        arena.pose(v,1);
        return {...v.poseMetrics};
      };
      const runA=pose('walk',.2),runB=pose('walk',1.85);
      a.dashElapsed=1;a.lean=a.prevLean=.1;
      const ignition=pose('dash',.2);
      a.dashElapsed=5;
      const burst=pose('dash',1.3);
      a.dashElapsed=11;
      const end=pose('dash',2.0);
      a.dashRecovery=5;
      a.lean=a.prevLean=0;
      const brake=pose('idle',2.0);
      const attacks=[];
      for(const type of ['light','medium','heavy']){
        a.reset(i?-11:11,-7);a.attackWith(type);
        a.attackTick=Math.max(1,Math.floor(a.attack.startup*.85));
        a.state='attack';const chamber=pose('attack',0);
        a.attackTick=a.attack.startup+Math.floor(a.attack.active/2);
        const impact=pose('attack',0);
        a.attackTick=a.attack.startup+a.attack.active+
          Math.floor(a.attack.recovery*.7);
        const recovery=pose('attack',0);
        attacks.push({type,chamber:chamber.attackWind,
          impact:impact.attackImpact,twist:impact.torsoTwist,
          reach:impact.attackReach,recover:recovery.attackReach});
      }
      results.push({model:v.key,run:{hipA:runA.hipTwist,hipB:runB.hipTwist,
        torsoA:runA.torsoTwist,torsoB:runB.torsoTwist},
        dash:{ignite:ignition.dashIgnite,burst:burst.dashBurst,
          burstLean:burst.lean,brake:brake.dashBrake,brakeLean:brake.lean},
        attacks});
    }
    arena.fighters[0].reset(-11,-7);
    arena.fighters[1].reset(11,-7);
    return results;
  });
  console.log('SUPERHERO_MOTION_QA',JSON.stringify(heroQA));
  if(heroQA.some(v=>{
    const [jab,cross,heavy]=v.attacks;
    return Math.abs(v.run.hipA-v.run.hipB)<.12||
      Math.abs(v.run.torsoA-v.run.torsoB)<.095||
      v.dash.ignite<.5||v.dash.burst<.6||
      v.dash.burstLean<.30||v.dash.brake<.5||
      jab.chamber<.7||jab.impact<.4||
      jab.twist>=-.10||cross.twist<.12||
      heavy.twist<=cross.twist+.10||
      heavy.recover>=heavy.reach*.55;
  }))throw Error('Superhero gait/dash/punch animation is missing or too stiff');

  // Capture actual THREE.JS model poses from a close three-quarter angle.
  await page.evaluate(()=>{
    const arena=window.game.arena3d,a=arena.fighters[0],v=arena.views[0];
    a.reset(-11,-7);a.grounded=true;
    a.state='walk';a.gaitPhase=a.prevGaitPhase=1.4;v.walkWeight=1;
    a.animClock++;arena.pose(v,1);
    arena.camera.position.set(a.x+4.0,2.7,a.z+5.3);
    arena.camera.lookAt(a.x,1.1,a.z);
    arena.renderer.render(arena.scene,arena.camera);
  });
  await page.screenshot({path:'arena-qa-images/superhero-run-close.png'});
  await page.evaluate(()=>{
    const arena=window.game.arena3d,a=arena.fighters[0],v=arena.views[0];
    a.state='dash';a.dashElapsed=5;a.dashRecovery=0;
    a.lean=a.prevLean=.13;a.gaitPhase=a.prevGaitPhase=1.5;
    a.animClock++;arena.pose(v,1);
    arena.renderer.render(arena.scene,arena.camera);
  });
  await page.screenshot({path:'arena-qa-images/superhero-dash-close.png'});
  await page.evaluate(()=>{
    const arena=window.game.arena3d,a=arena.fighters[0],v=arena.views[0];
    a.attack=null;a.attackWith('heavy');
    a.attackTick=a.attack.startup+Math.floor(a.attack.active/2);
    a.lean=a.prevLean=0;a.state='attack';a.animClock++;
    arena.pose(v,1);
    arena.renderer.render(arena.scene,arena.camera);
  });
  await page.screenshot({path:'arena-qa-images/superhero-heavy-punch-close.png'});
  await page.evaluate(()=>{
    const arena=window.game.arena3d;
    arena.fighters[0].reset(-11,-7);arena.fighters[1].reset(11,-7);
  });

  // Sweep the complete walking cycle on both currently loaded humanoid
  // rigs. Check arm clearance in the fighter's LOCAL chest coordinate system,
  // not only the world-facing direction: wrists must not enter the ribs while
  // the body turns and the arms swing backward.
  const armClearanceQA=await page.evaluate(()=>{
    const arena=window.game.arena3d,[a,b]=arena.fighters;
    const names=['female','batman'];
    const result=[];
    for(const [index,actor] of [a,b].entries()){
      const v=arena.views[index];
      const get=name=>v.bones.get(name).getWorldPosition(v.root.position.clone());
      const measurements=[];
      actor.reset(index?-11:11,-7);
      actor.state='walk';actor.grounded=true;
      v.walkWeight=1;v.lastStateTick=-1;
      for(let phase=0;phase<24;phase++){
        actor.gaitPhase=actor.prevGaitPhase=phase*Math.PI/12;
        actor.animClock++; // advance state blending exactly once per tick
        actor.visualYaw=actor.prevVisualYaw=phase%8<4?Math.PI/2:-Math.PI/2;
        arena.pose(v,1);
        const m=v.root.matrixWorld.elements;
        const right={x:m[0],y:m[1],z:m[2]};
        const front={x:m[8],y:m[9],z:m[10]};
        const chest=get('spine_02');
        const handInfo=['l','r'].map((side,i)=>{
          const hand=get('hand_'+side);
          const elbow=get('lowerarm_'+side);
          const sign=i?v.armSides.r:v.armSides.l;
          const coord=p=>({side:sign*((p.x-chest.x)*right.x+(p.y-chest.y)*right.y+(p.z-chest.z)*right.z),
            front:(p.x-chest.x)*front.x+(p.y-chest.y)*front.y+(p.z-chest.z)*front.z});
          return {hand:coord(hand),elbow:coord(elbow)};
        });
        measurements.push({phase,handInfo});
      }
      const handSides=measurements.flatMap(f=>f.handInfo.map(h=>h.hand.side));
      const elbowSides=measurements.flatMap(f=>f.handInfo.map(h=>h.elbow.side));
      const minSide=Math.min(...handSides);
      const minElbow=Math.min(...elbowSides);
      const behindAtCenter=measurements.flatMap(f=>f.handInfo).filter(x=>
        x.hand.side<.17&&x.hand.front<.22).length;
      result.push({model:names[index],armSides:v.armSides,legSides:v.legSides,
        minSide,minElbow,behindAtCenter,
        minHandFront:Math.min(...measurements.flatMap(f=>f.handInfo.map(h=>h.hand.front))),
        extrema:measurements.filter(f=>f.phase%6===0)});
    }
    a.reset(-11,-7);b.reset(11,-7);
    return result;
  });
  console.log('WALK_HAND_CLEARANCE_QA',JSON.stringify(armClearanceQA));
  if(armClearanceQA.some(x=>x.minSide<.14||x.minElbow<.14||
    x.behindAtCenter>0))
    throw Error('Walking wrists/elbows intersect the chest on a real GLB rig');
  await page.screenshot({path:'arena-qa-images/walk-arms-clear.png'});
  await page.evaluate(()=>{
    const arena=window.game.arena3d;
    arena.fighters[0].reset(-11,-7);arena.fighters[1].reset(11,-7);
    arena.phase='live';
  });
  const rules=await page.evaluate(()=>{
    const game=window.game,g=game.arena3d;
    game.running=false; // freeze browser RAF for deterministic isolated QA
    g.phase='live';
    const A=g.fighters[0],B=g.fighters[1];
    const start={a:[A.x,A.z],b:[B.x,B.z]};
    // Tree is solid, entire 360-degree wall is solid, and radius is fixed.
    const temp={x:0,z:0};
    window.FG.ArenaCollision.constrain(temp);
    const treeDist=Math.hypot(temp.x,temp.z);
    const outside={x:1000,z:-900};
    window.FG.ArenaCollision.constrain(outside);
    const wallDist=Math.hypot(outside.x,outside.z);
    const ctrl=window.FG.InputUtils.emptyFrame();
    ctrl.y=-1;ctrl.up=true;
    for(let i=0;i<65;i++)g.move(A,B,ctrl,new Set(),true);
    const moved=Math.hypot(A.x-start.a[0],A.z-start.a[1]);
    // Jump and land.
    A.y=0;A.vy=0;A.grounded=true;
    const jump=window.FG.InputUtils.emptyFrame();
    jump.power=true;jump.pressed.power=true;
    g.move(A,B,jump,new Set(),true);
    const jumped=A.y>0&&!A.grounded;
    for(let i=0;i<120;i++)g.move(A,B,window.FG.InputUtils.emptyFrame(),new Set(),true);
    const landed=A.grounded&&A.y===0;
    // Dash is short and must obey tree & wall bounds.
    const dash=window.FG.InputUtils.emptyFrame();
    dash.burn=true;dash.pressed.burn=true;dash.y=-1;
    g.move(A,B,dash,new Set(),true);
    const dashStarted=A.dash>0;
    for(let i=0;i<20;i++)g.move(A,B,window.FG.InputUtils.emptyFrame(),new Set(),true);
    // Test a real heavy move from unchanged character frame data.
    A.x=-2;A.z=-7;B.x=0;B.z=-7;
    A.facing={x:1,z:0};B.health=B.maxHealth;A.stun=0;
    A.attack=null;A.attackWith('heavy');A.attackTick=A.attack.startup;
    const before=B.health;
    g.contact(A,B);const after=B.health;
    g.contact(A,B);const second=B.health;
    const attackHit=after<before && after===second;
    // Block should give chip rather than full damage.
    B.health=B.maxHealth;B.blocking=true;
    A.attack=null;A.attackWith('light');A.attackTick=A.attack.startup;
    g.contact(A,B);
    const chip=B.maxHealth-B.health;
    // Pause locks timer.
    const timer=g.roundFrames;g.paused=true;
    g.step(null,new Set());
    const pausedTimer=g.roundFrames;g.paused=false;
    A.attack=null;B.attack=null;B.blocking=false;
    A.reset(-11,-7);B.reset(11,-7);
    g.roundFrames=99*60;g.phase='live';g.render(1);
    return {treeDist,wallDist,moved,jumped,landed,dashStarted,
      attackHit,chip,paused:timer===pausedTimer,before,after,second};
  });
  console.log('ARENA_RULES',JSON.stringify(rules));
  if(rules.treeDist<3.6||rules.wallDist>33||rules.moved<.3||
     !rules.jumped||!rules.landed||!rules.dashStarted||
     !rules.attackHit||rules.chip<1||rules.chip>20||!rules.paused)
    throw Error('3D physics/combat/pause rule check failed');
  await page.screenshot({path:'arena-qa-images/arena-fight.png'});
  const cpu=await page.evaluate(()=>{
    const g=window.game.arena3d;
    for(let i=0;i<450;i++)g.step(null,new Set());
    const finite=g.fighters.every(f=>Number.isFinite(f.x)&&Number.isFinite(f.z)&&Number.isFinite(f.health));
    const validBounds=g.fighters.every(f=>{
      const d=Math.hypot(f.x,f.z);
      return d>=3.6&&d<=33;
    });
    g.render(1);
    return {finite,validBounds,phase:g.phase,remaining:g.roundFrames,
      health:g.fighters.map(x=>x.health),avatarCount:g.views.length};
  });
  console.log('ARENA_CPU',JSON.stringify(cpu));
  if(!cpu.finite||!cpu.validBounds||cpu.avatarCount!==2)throw Error('CPU arena simulation broke');
  await page.screenshot({path:'arena-qa-images/arena-cpu.png'});
  // Character rig articulation regression: sample both actual male and
  // female Blender meshes in the real 3D arena and compare joint angles
  // across a full stride. The shoulder/elbow and hip/knee must move
  // independently; turning the whole arm is NOT enough.
  const articulation=await page.evaluate(()=>{
    const game=window.game;
    game.startMatch({p1:'superman',p2:'wonder-woman',stage:'neon-rooftop',mode:'cpu'});
    game.running=false;const arena=game.arena3d;
    arena.phase='live';
    const output=[];
    for(const [index,a] of arena.fighters.entries()){
      const v=arena.views[index];
      a.reset(index?-11:11,-7);a.grounded=true;
      v.walkWeight=1;v.dashWeight=0;
      const samples=[];
      const world=name=>v.bones.get(name).getWorldPosition(v.root.position.clone());
      const segment=name=>v.bones.get(name).quaternion.toArray();
      for(let i=0;i<32;i++){
        a.state='walk';a.attack=null;
        a.gaitPhase=a.prevGaitPhase=i*2*Math.PI/32;
        a.animClock++;
        arena.pose(v,1);
        const pose=v.poseMetrics;
        const chest=world('spine_02'),leftHand=world('hand_l'),rightHand=world('hand_r');
        const rootM=v.root.matrixWorld.elements;
        const side={x:rootM[0],y:rootM[1],z:rootM[2]};
        const sides=['l','r'].map((hand,j)=>{
          const pos=j?rightHand:leftHand,sgn=j?v.armSides.r:v.armSides.l;
          return sgn*((pos.x-chest.x)*side.x+(pos.y-chest.y)*side.y+
            (pos.z-chest.z)*side.z);
        });
        samples.push({phase:i,bends:{elbowL:pose.elbowL,elbowR:pose.elbowR,
          kneeL:pose.kneeL,kneeR:pose.kneeR},sides,
          shoulder:segment('upperarm_l'),elbow:segment('lowerarm_l'),
          hip:segment('thigh_l'),knee:segment('calf_l')});
      }
      const range=key=>{
        const n=samples.map(x=>x.bends[key]);
        return {min:Math.min(...n),max:Math.max(...n),swing:Math.max(...n)-Math.min(...n)};
      };
      const distance=(x,y)=>Math.hypot(...x.map((v,j)=>v-y[j]));
      // Walking arms are now counter-synchronized with the leg's sine phase.
      // Measure the forward and backward extremes at PI/2 and 3PI/2.
      const changed=key=>distance(samples[8][key],samples[24][key]);
      output.push({model:v.key,boneCount:v.bones.size,
        elbowL:range('elbowL'),elbowR:range('elbowR'),
        kneeL:range('kneeL'),kneeR:range('kneeR'),
        minHandSide:Math.min(...samples.flatMap(x=>x.sides)),
        changed:{shoulder:changed('shoulder'),elbow:changed('elbow'),
          hip:changed('hip'),knee:changed('knee')}});
    }
    return output;
  });
  console.log('ARTICULATED_MALE_FEMALE_QA',JSON.stringify(articulation));
  if(articulation.some(v=>v.boneCount<60||
    ['elbowL','elbowR','kneeL','kneeR'].some(k=>
      !Number.isFinite(v[k].min)||v[k].max<.25||v[k].swing<.12)||
    Object.values(v.changed).some(n=>n<.015)||
    v.minHandSide<.12))
    throw Error('One or more male/female elbows, shoulders, knees or hips is stiff or clips torso');

  // Neutral idle regression: evaluate actual rendered bones, not the
  // character's state label. Include a full walk-to-idle recovery to catch
  // stiff elbows, spread legs, sudden foot jumps and hidden boxer guard.
  const idleQA=await page.evaluate(()=>{
    const g=window.game,arena=g.arena3d,report=[];
    g.running=false;
    for(const [i,a] of arena.fighters.entries()){
      const v=arena.views[i];a.reset(i?12:-12,-8);
      a.visualYaw=a.prevVisualYaw=0;
      a.grounded=true;a.attack=null;a.blocking=false;a.stun=0;
      v.walkWeight=1;v.lastStateTick=-1;v.dashWeight=0;
      const world=name=>v.bones.get(name).getWorldPosition(v.root.position.clone());
      a.state='walk';a.gaitPhase=a.prevGaitPhase=1.52;a.animClock++;
      arena.pose(v,1);
      const results=[];
      const measures=(frame)=>{
        const root=v.root.matrixWorld.elements;
        const right=v.root.position.clone().set(root[0],root[1],root[2]).normalize();
        const lHand=world('hand_l'),rHand=world('hand_r');
        const lShoulder=world('upperarm_l'),rShoulder=world('upperarm_r');
        const lElbow=world('lowerarm_l'),rElbow=world('lowerarm_r');
        const lReach=lShoulder.distanceTo(lElbow)+lElbow.distanceTo(lHand);
        const rReach=rShoulder.distanceTo(rElbow)+rElbow.distanceTo(rHand);
        const lHip=world('thigh_l'),rHip=world('thigh_r');
        const lFoot=world('foot_l'),rFoot=world('foot_r');
        const side=(point,pivot,sign)=>sign*point.clone().sub(pivot).dot(right);
        return {frame,
          w:v.walkWeight,idleWeight:v.poseMetrics.idleWeight,
          elbowL:v.poseMetrics.elbowL,elbowR:v.poseMetrics.elbowR,
          kneeL:v.poseMetrics.kneeL,kneeR:v.poseMetrics.kneeR,
          leftHandDown:lShoulder.y-lHand.y,rightHandDown:rShoulder.y-rHand.y,
          leftArmVertical:(lShoulder.y-lHand.y)/lReach,
          rightArmVertical:(rShoulder.y-rHand.y)/rReach,
          leftHandSide:side(lHand,lShoulder,v.armSides.l),
          rightHandSide:side(rHand,rShoulder,v.armSides.r),
          leftHandHipHeight:lHand.y-lHip.y,rightHandHipHeight:rHand.y-rHip.y,
          handForward:(lHand.z-lShoulder.z+rHand.z-rShoulder.z)/2,
          feetSpread:Math.abs(lFoot.clone().sub(rFoot).dot(right)),
          hipSpread:Math.abs(lHip.clone().sub(rHip).dot(right))};
      };
      results.push(measures('walking'));
      a.state='idle';
      for(let f=1;f<=32;f++){
        a.animClock++;arena.pose(v,1);
        if([1,3,6,10,18,32].includes(f))results.push(measures(f));
      }
      report.push({model:v.key,angles:results});
    }
    return report;
  });
  console.log('RELAXED_IDLE_POSE_QA',JSON.stringify(idleQA));
  if(idleQA.some(r=>{
    const end=r.angles.at(-1),before=r.angles[0];
    return end.idleWeight<.99||end.leftArmVertical<.92||
      end.rightArmVertical<.92||end.leftHandSide<.045||
      end.rightHandSide<.045||end.feetSpread>before.feetSpread+.08||
      end.feetSpread>end.hipSpread+.13||
      end.elbowL>.45||end.elbowR>.45||
      end.kneeL>.44||end.kneeR>.44||
      ![end.leftArmVertical,end.rightArmVertical,end.feetSpread].every(Number.isFinite);
  }))throw Error('Idle must lower hands and settle feet beneath hips on both real rigs');
  await page.evaluate(()=>{
    const g=window.game,arena=g.arena3d,a=arena.fighters[0],v=arena.views[0];
    a.reset(-12,-8);a.visualYaw=a.prevVisualYaw=0;
    a.state='idle';a.grounded=true;a.attack=null;
    v.walkWeight=0;v.dashWeight=0;v.lastStateTick=-1;
    a.animClock++;arena.pose(v,1);
    arena.camera.position.set(a.x,1.85,a.z+4.6);
    arena.camera.lookAt(a.x,1.12,a.z);
    arena.updateSky(0);
    arena.renderer.render(arena.scene,arena.camera);
    arena.hudCtx.clearRect(0,0,1280,720);
  });
  await page.screenshot({path:'arena-qa-images/relaxed-idle-front.png'});
  const idleImage=await page.screenshot({type:'jpeg',quality:60});
  const idleChunks=idleImage.toString('base64').match(/.{1,4000}/g)||[];
  idleChunks.forEach((part,i)=>console.log('IDLE_MODEL_FRAME:'+i+'/'+idleChunks.length+':'+part));
  console.log('IDLE_MODEL_FRAME_FINISH:'+idleChunks.length);

  // Show actual animation posture at a stride recovery frame.
  await page.evaluate(()=>{
    const game=window.game,arena=game.arena3d,a=arena.fighters[0],v=arena.views[0];
    a.state='walk';a.gaitPhase=a.prevGaitPhase=1.7;
    a.animClock++;arena.pose(v,1);
    arena.camera.position.set(a.x+4,2.8,a.z+5.2);
    arena.camera.lookAt(a.x,1,a.z);
    arena.renderer.render(arena.scene,arena.camera);
  });
  await page.screenshot({path:'arena-qa-images/articulated-male-stride.png'});
  // Walk arms: measure real wrist travel and elbow flex on BOTH GLB rigs.
  // This catches the "hands hang still" problem even when the shoulder bone
  // technically rotates by a tiny amount. Run a complete gait revolution.
  const armWalkReview=await page.evaluate(()=>{
    const arena=window.game.arena3d,report=[];
    const V=()=>arena.views;
    for(let i=0;i<2;i++){
      const a=arena.fighters[i],v=V()[i];
      a.reset(i?-11:11,-7);
      v.walkWeight=1;v.dashWeight=0;
      const entries=[];
      const pos=name=>v.bones.get(name).getWorldPosition(v.root.position.clone());
      for(let n=0;n<40;n++){
        const phase=n*2*Math.PI/40;
        a.state='walk';a.grounded=true;
        a.gaitPhase=a.prevGaitPhase=phase;a.animClock++;
        arena.pose(v,1);
        const matrix=v.root.matrixWorld.elements;
        const front=v.root.position.clone().set(matrix[8],matrix[9],matrix[10]);
        const right=v.root.position.clone().set(matrix[0],matrix[1],matrix[2]);
        const chest=pos('spine_02');
        const arms=['l','r'].map(side=>{
          const hand=pos('hand_'+side),shoulder=pos('upperarm_'+side);
          const s=v.armSides[side];
          const elbow=pos('lowerarm_'+side);
          return {side,
            travel:hand.clone().sub(shoulder).dot(front),
            handOutside:s*hand.clone().sub(chest).dot(right),
            elbowOutside:s*elbow.clone().sub(chest).dot(right),
            bend:v.poseMetrics['elbow'+side.toUpperCase()],
            wrist:v.bones.get('hand_'+side).quaternion.toArray(),
            shoulder:v.bones.get('upperarm_'+side).quaternion.toArray()};
        });
        entries.push({phase,arms});
      }
      const stats=['l','r'].map((side,j)=>{
        const a=entries.map(x=>x.arms[j]);
        const range=key=>Math.max(...a.map(x=>x[key]))-Math.min(...a.map(x=>x[key]));
        const qdistance=(x,y)=>Math.hypot(...x.map((v,i)=>v-y[i]));
        return {side,travelRange:range('travel'),
          elbowRange:range('bend'),
          minOutside:Math.min(...a.map(x=>x.handOutside)),
          minElbowOutside:Math.min(...a.map(x=>x.elbowOutside)),
          wristTravel:qdistance(a[10].wrist,a[30].wrist),
          shoulderTravel:qdistance(a[10].shoulder,a[30].shoulder),
          atForwardStep:a[10].travel,atRearStep:a[30].travel};
      });
      report.push({model:v.key,stats});
    }
    return report;
  });
  console.log('REAL_WALK_ARM_SWING_QA',JSON.stringify(armWalkReview));
  if(armWalkReview.some(v=>v.stats.some(a=>
    a.travelRange<.28||a.elbowRange<.27||
    a.wristTravel<.07||a.shoulderTravel<.09||
    a.minOutside<.17||a.minElbowOutside<.16||
    // Opposite-leg timing: left arm back when left leg reaches forward,
    // right arm forward at that same instant.
    (a.side==='l' && a.atForwardStep>=a.atRearStep)||
    (a.side==='r' && a.atForwardStep<=a.atRearStep))))
      throw Error('Male/female walk hands must swing and elbows must visibly bend without chest clipping');

  // Walk-specific biomechanics checks: planted foot has no clearance lift,
  // the opposite foot lifts; knees bend independently and the pelvis transfers
  // weight twice per stride. These are actual rendered-GLB measurements.
  const walkingReview=await page.evaluate(()=>{
    const arena=window.game.arena3d,results=[];
    for(const [i,a] of arena.fighters.entries()){
      const v=arena.views[i];a.reset(i?-11:11,-7);
      v.walkWeight=1;v.dashWeight=0;
      a.state='walk';a.grounded=true;
      const samples=[];
      for(let k=0;k<40;k++){
        a.gaitPhase=a.prevGaitPhase=k*Math.PI*2/40;
        a.animClock++;arena.pose(v,1);
        const m=v.poseMetrics;
        samples.push({k,contactL:m.walkContactL,contactR:m.walkContactR,
          liftL:m.walkLiftL,liftR:m.walkLiftR,kneeL:m.kneeL,kneeR:m.kneeR,
          bob:m.walkBob,hip:m.hipTwist,torso:m.torsoTwist,
          chestRoll:m.chestRoll,chestPitch:m.chestPitch,
          chestLead:m.chestLead,
          spine:v.bones.get('spine_03').quaternion.toArray()});
      }
      results.push({model:v.key,phases:samples.filter((_,j)=>j%5===0),
        alternating:samples.some(x=>x.contactL&&!x.contactR)&&
          samples.some(x=>x.contactR&&!x.contactL),
        maxLift:Math.max(...samples.flatMap(x=>[x.liftL,x.liftR])),
        maxKnee:Math.max(...samples.flatMap(x=>[x.kneeL,x.kneeR])),
        minKnee:Math.min(...samples.flatMap(x=>[x.kneeL,x.kneeR])),
        hipRange:Math.max(...samples.map(x=>x.hip))-
          Math.min(...samples.map(x=>x.hip)),
        chestRollRange:Math.max(...samples.map(x=>x.chestRoll))-
          Math.min(...samples.map(x=>x.chestRoll)),
        chestPitchRange:Math.max(...samples.map(x=>x.chestPitch))-
          Math.min(...samples.map(x=>x.chestPitch)),
        spineMotion:Math.hypot(...samples[10].spine.map(
          (v,j)=>v-samples[30].spine[j]))});
    }
    return results;
  });
  console.log('NATURAL_WALK_BIOMECHANICS',JSON.stringify(walkingReview));
  if(walkingReview.some(x=>!x.alternating||x.maxLift<.12||
     x.maxKnee-x.minKnee<.20||x.hipRange<.20||
     x.chestRollRange<.060||x.chestPitchRange<.035||
     x.spineMotion<.075))
    throw Error('Walking needs alternating foot support, knee flexion and pelvis sway');

  // Longer strides must be actual ankle travel, not just numeric gait
  // parameters. Capture movement-relative foot clearance, forward pitch,
  // lateral weight shifts, knee bends and opposing torso motion for BOTH rigs.
  const strideReview=await page.evaluate(()=>{
    const arena=window.game.arena3d,result=[];
    for(let i=0;i<2;i++){
      const a=arena.fighters[i],v=arena.views[i];
      a.reset(i?-11:11,-7);v.walkWeight=1;v.dashWeight=0;
      a.state='walk';a.grounded=true;
      const samples=[];
      const loc=name=>v.bones.get(name).getWorldPosition(v.root.position.clone());
      for(let j=0;j<48;j++){
        a.gaitPhase=a.prevGaitPhase=j*2*Math.PI/48;
        a.animClock++;arena.pose(v,1);
        const m=v.poseMetrics;
        const shoulder=loc('spine_03'),hip=loc('thigh_l'),knee=loc('calf_l'),
          ankle=loc('foot_l');
        const legLength=hip.distanceTo(knee)+knee.distanceTo(ankle);
        const world=v.root.matrixWorld.elements;
        const forward=v.root.position.clone().set(world[8],world[9],world[10]).normalize();
        const ankleForward=ankle.sub(hip).dot(forward)/legLength;
        samples.push({pitch:m.rootPitch,bank:m.rootBank,hipShift:m.walkHipShift,
          stride:m.walkFootL,footTravel:ankleForward,
          kneeL:m.kneeL,kneeR:m.kneeR,torso:m.torsoTwist,
          contact:m.walkContactL,lift:m.walkLiftL});
      }
      const range=key=>Math.max(...samples.map(x=>x[key]))-
        Math.min(...samples.map(x=>x[key]));
      result.push({model:v.key,footTravel:range('footTravel'),
        phaseStride:range('stride'),pitchMin:Math.min(...samples.map(x=>x.pitch)),
        pitchMax:Math.max(...samples.map(x=>x.pitch)),
        bankRange:range('bank'),hipShiftRange:range('hipShift'),
        maxKnee:Math.max(...samples.map(x=>x.kneeL)),
        minKnee:Math.min(...samples.map(x=>x.kneeL)),
        maxFootLift:Math.max(...samples.map(x=>x.lift)),
        stanceCount:samples.filter(x=>x.contact).length,
        sampleStart:samples[0],sampleQuarter:samples[12],
        sampleHalf:samples[24]});
    }
    return result;
  });
  console.log('LONG_STRIDE_BODY_LEAN_QA',JSON.stringify(strideReview));
  if(strideReview.some(v=>v.phaseStride<.95||v.footTravel<.70||
    v.pitchMin<.07||v.pitchMax>.22||
    v.bankRange<.07||v.bankRange>.21||
    v.hipShiftRange<.075||v.maxKnee-v.minKnee<.45||
    v.maxFootLift<.13))
    throw Error('Extended walk lacks physical ankle reach, full-body lean or weight transfer');

  // Real movement test: advance game physics and inspect the world-space
  // ankles throughout each stance. A phase-only walk test misses skating.
  const footPlantQA=await page.evaluate(()=>{
    const arena=window.game.arena3d,output=[];
    const ctrl=window.FG.InputUtils.emptyFrame();
    ctrl.y=-1;
    for(let i=0;i<2;i++){
      const actor=arena.fighters[i],view=arena.views[i];
      actor.reset(i?-14:-18,-13);actor.visualYaw=actor.prevVisualYaw=0;
      view.walkWeight=1;view.dashWeight=0;view.lastStateTick=-1;
      view.footPlants={l:null,r:null};
      const samples={l:[],r:[]};
      for(let frame=0;frame<62;frame++){
        actor.prevX=actor.x;actor.prevZ=actor.z;actor.prevY=actor.y;
        actor.prevVisualYaw=actor.visualYaw;
        actor.prevLean=actor.lean;actor.prevBank=actor.bank;
        actor.prevGaitPhase=actor.gaitPhase;actor.animClock++;
        arena.move(actor,null,ctrl,new Set(),true);
        arena.pose(view,1);
        for(const side of ['l','r']){
          const m=view.poseMetrics;
          const contact=m['walkContact'+side.toUpperCase()];
          const planted=m['planted'+side.toUpperCase()];
          const p=view.bones.get('foot_'+side).getWorldPosition(view.root.position.clone());
          samples[side].push({frame,contact,planted,x:p.x,y:p.y,z:p.z});
        }
      }
      const segments=[];
      for(const side of ['l','r']){
        let run=[];
        const flush=()=>{
          if(run.length>=3){
            const head=run[0];
            segments.push({side,frames:run.length,
              maxDrift:Math.max(...run.map(p=>Math.hypot(p.x-head.x,p.z-head.z))),
              heightRange:Math.max(...run.map(p=>p.y))-Math.min(...run.map(p=>p.y))});
          }
          run=[];
        };
        for(const p of samples[side]){
          if(p.contact&&p.planted&&p.frame>8)run.push(p);
          else flush();
        }
        flush();
      }
      output.push({rig:view.key,segments,
        maxDrift:Math.max(0,...segments.map(s=>s.maxDrift)),
        maxHeightVariation:Math.max(0,...segments.map(s=>s.heightRange)),
        totalDistance:Math.hypot(actor.x-(i?-14:-18),actor.z+13),
        cadence:actor.gaitPhase});
    }
    return output;
  });
  console.log('PLANTED_FOOT_WORLDSPACE_QA',JSON.stringify(footPlantQA));
  if(footPlantQA.some(r=>r.segments.length<4||r.totalDistance<5||
      r.maxDrift>.17||r.maxHeightVariation>.19||
      r.cadence<24||r.cadence>30))
    throw Error('Walking planted feet slide or hover excessively in the world');
  // A teleport/reset must invalidate planted anchors from the old world
  // position. This regression caught an outward-kicking leg in the close-up.
  const footResetQA=await page.evaluate(()=>{
    const arena=window.game.arena3d;
    const values=[];
    for(let i=0;i<2;i++){
      const a=arena.fighters[i],v=arena.views[i];
      a.reset(i?11:-11,-7);
      a.visualYaw=a.prevVisualYaw=0;a.state='walk';a.grounded=true;
      a.gaitPhase=a.prevGaitPhase=0;
      v.walkWeight=1;v.lastStateTick=-1;
      const far=v.root.position.clone().set(a.x-12,0,a.z-12);
      v.footPlants={l:{world:far.clone()},r:{world:far.clone()}};
      a.animClock++;arena.pose(v,1);
      const hip=v.bones.get('thigh_l').getWorldPosition(v.root.position.clone());
      const foot=v.bones.get('foot_l').getWorldPosition(v.root.position.clone());
      const distance=Math.hypot(foot.x-hip.x,foot.z-hip.z);
      values.push({rig:v.key,ankleHorizontalDistance:distance,
        hasStaleAnchor:!!v.footPlants.l,footSideX:foot.x-hip.x});
    }
    return values;
  });
  console.log('RESET_FOOT_PLANT_QA',JSON.stringify(footResetQA));
  if(footResetQA.some(x=>x.ankleHorizontalDistance>.90||
      x.hasStaleAnchor))throw Error('Teleport caused a stale IK foot to kick sideways');
  // Emit compressed frames as bounded log chunks for hands-on visual review.
  // This supplements, rather than replaces, the geometric regression checks.
  for(const [tag,phase] of [['heel-strike',0],['toe-off',2.9],['mid-swing',4.2]]){
    await page.evaluate(phase=>{
      const arena=window.game.arena3d,a=arena.fighters[0],v=arena.views[0];
      // Visual inspection must show ONE model, not overlapping P1 and P2.
      arena.fighters[1].reset(11,-7);
      arena.pose(arena.views[1],1);
      a.reset(-11,-7);a.state='walk';a.grounded=true;
      a.visualYaw=a.prevVisualYaw=0.20;
      a.gaitPhase=a.prevGaitPhase=phase;a.animClock++;
      v.walkWeight=1;v.dashWeight=0;
      arena.pose(v,1);
      arena.camera.position.set(a.x+1.35,1.75,a.z+2.75);
      arena.camera.lookAt(a.x,1,a.z);
      arena.renderer.render(arena.scene,arena.camera);
    },phase);
    const shot=await page.screenshot({type:'jpeg',quality:46});
    const data=shot.toString('base64');
    const pieces=data.match(/.{1,4000}/g)||[];
    pieces.forEach((part,index)=>console.log(
      'WALK_VISUAL_FRAME:'+tag+':'+index+'/'+pieces.length+':'+part));
    console.log('WALK_VISUAL_FRAME_FINISH:'+tag+':'+pieces.length);
  }


  const leaving=await page.evaluate(()=>{
    const game=window.game;
    game.arena3d.end();
    game.render();
    return {scene:game.scene,display:game.arena3d.webgl.style.display,opacity:game.canvas.style.opacity};
  });
  if(leaving.scene!=='title'||leaving.display!=='none'||leaving.opacity!=='1')
    throw Error('Returning to 2D menu did not clean up arena display');
  await page.screenshot({path:'arena-qa-images/return-menu.png'});
  if(errors.length)throw Error('Browser/asset errors: '+errors.join('; '));
  console.log('ARENA_3D_BROWSER_QA_SUCCESS');
}catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}

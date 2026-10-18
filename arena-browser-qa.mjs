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
  await page.waitForTimeout(600);
  await page.screenshot({path:'arena-qa-images/arena-intro.png'});
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
      triangles:Math.round(tris)};
  });
  console.log('NATURAL_TREE_GEOMETRY_QA',JSON.stringify(treeQA));
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
     Math.min(...movementQA.armsAhead)<.06)
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
     animationQA.heavy.right<animationQA.idle.right+.07||
     animationQA.light.twist>-.12||
     animationQA.medium.twist<.14||
     animationQA.heavy.twist<animationQA.medium.twist+.12||
     animationQA.heavy.recover>=animationQA.heavy.attackReach*.55)
    throw Error('Full-body gait, punch, or dash motion is not visible on real rigs');
  await page.screenshot({path:'arena-qa-images/full-body-animation.png'});
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
          const sign=i?1:-1;
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
      result.push({model:names[index],minSide,minElbow,behindAtCenter,
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

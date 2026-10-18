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
    A.x=-2;A.z=-7;B.x=.7;B.z=-7;
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

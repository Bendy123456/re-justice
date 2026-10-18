import {chromium} from 'playwright';
import fs from 'node:fs';
const url=process.env.PREVIEW_URL||'http://127.0.0.1:8765/';
const browser=await chromium.launch({headless:true,args:[
  '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist','--ignore-certificate-errors'
]});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
page.on('response',r=>{if(r.status()>=400)errors.push('HTTP '+r.status()+' '+r.url());});
try{
  await page.goto(url,{waitUntil:'networkidle',timeout:60000});
  await page.waitForFunction(()=>Boolean(window.game?.renderer?.model3d),{timeout:45000});
  await page.waitForFunction(()=>{
    const p=window.game?.renderer?.model3d;
    return p?.loaded?.has('male')&&p?.loaded?.has('batman')&&p?.loaded?.has('female');
  },{timeout:85000});
  const state=await page.evaluate(()=>{
    const g=window.game;
    return {
      loaded:[...g.renderer.model3d.loaded],
      roster:window.FG.MODEL_ROSTER.MALE.length,
      female:window.FG.MODEL_ROSTER.FEMALE.length,
      keys:[...g.renderer.model3d.instances.keys()]
    };
  });
  console.log('GLB load state:',JSON.stringify(state));
  // Showcases/portrait cards use a distinct arms-down stance, never the
  // crouched, hands-up combat guard. Inspect real cloned GLB joint positions.
  const relaxed=await page.evaluate(()=>{
    const presentation=window.game.renderer.model3d;
    const samples=[];
    const get=(v,n)=>v.bones.get(n).getWorldPosition(v.root.position.clone());
    for(const kind of ['male','female','batman']){
      const v=presentation.makeInstance(kind,'neutral-preview-qa-'+kind);
      v.root.position.set(0,0,0);
      v.root.rotation.set(0,0,0);
      v.root.scale.setScalar(1);
      presentation.poseRelaxed(v);
      const chest=get(v,'spine_02');
      const data=['l','r'].map(side=>{
        const shoulder=get(v,'upperarm_'+side);
        const elbow=get(v,'lowerarm_'+side);
        const hand=get(v,'hand_'+side);
        const sign=v.armSides[side];
        return {side,
          handBelowShoulder:shoulder.y-hand.y,
          handOutsideChest:sign*(hand.x-chest.x),
          elbowOutsideChest:sign*(elbow.x-chest.x),
          handInFront:hand.z-chest.z,
          handBelowChest:chest.y-hand.y};
      });
      samples.push({kind,data});
    }
    return samples;
  });
  console.log('RELAXED_ROSTER_POSE_QA',JSON.stringify(relaxed));
  if(relaxed.some(v=>v.data.some(a=>
     a.handBelowShoulder<.38 || a.handBelowChest<.18 ||
     a.handOutsideChest<.19 || a.elbowOutsideChest<.17)))
    throw Error('Character-select arms are not hanging naturally beside the body');

  fs.mkdirSync('ci-images',{recursive:true});
  await page.evaluate(()=>{
    const g=window.game;
    g.enterVersus('cpu');
    g.p1Id='batman';g.p2Id='superman';g.previewPlayer=1;
  });
  await page.waitForTimeout(800);
  await page.screenshot({path:'ci-images/batman-select.png'});
  await page.evaluate(()=>{window.game.p1Id='superman';});
  await page.waitForTimeout(500);
  await page.screenshot({path:'ci-images/base-male-select.png'});
  await page.evaluate(()=>{window.game.p1Id='wonder-woman';});
  await page.waitForTimeout(250);
  await page.screenshot({path:'ci-images/female-base-select.png'});
  const femaleSelect=await page.evaluate(()=>{
    const p=window.game?.renderer?.model3d;
    const slot=window.FG.MODEL_ROSTER.FEMALE;
    const g=window.game;
    return {femaleLoaded:p.loaded.has('female'),
      mapped:slot.every(id=>p.modelKey(id)==='female'),
      selectKind:p.instances.get('select')?.kind,
      femaleIds:slot};
  });
  console.log('Female selection:',JSON.stringify(femaleSelect));
  if(!femaleSelect.femaleLoaded||!femaleSelect.mapped||femaleSelect.selectKind!=='female')
    throw Error('Female roster did not use the shared 3D base');
  await page.evaluate(()=>{
    const g=window.game;
    g.startMatch({p1:'batman',p2:'superman',stage:'neon-rooftop',mode:'cpu'});
  });
  await page.waitForTimeout(350);
  // Force the very first post-menu 3D frame: software WebGL may not have
  // reached the next requestAnimationFrame after expensive portrait caches.
  const forced=await page.evaluate(()=>{
    const g=window.game;
    let result='ok';
    try{g.render();}catch(e){result=String(e.stack||e);}
    return {result,scene:g.scene,frame:g.frame,
      loaded:[...g.renderer.model3d.loaded],
      supported:g.fighters.map(f=>g.renderer.model3d.supported(f,g.assets)),
      instanceKeys:[...g.renderer.model3d.instances.keys()]};
  });
  console.log('Forced first fight frame:',JSON.stringify(forced));
  const loadedFight=await page.evaluate(()=>{
    const g=window.game;
    const p=g.renderer.model3d;
    return {hasP1:p.instances.has('fighter:1'),hasP2:p.instances.has('fighter:2'),
      sameSkeleton:p.instances.get('fighter:1')?.bones?.get('head')===p.instances.get('fighter:2')?.bones?.get('head'),
      scene:g.scene,health:g.fighters.map(x=>x.health),ids:g.fighters.map(x=>x.def.id)};
  });
  console.log('Combat model check:',JSON.stringify(loadedFight));
  console.log('Renderer diagnostic:',JSON.stringify(await page.evaluate(()=>{
    const p=window.game?.renderer?.model3d;
    return {enabled:p?.enabled,error:p?.error,loaded:[...(p?.loaded||[])],
      instances:[...(p?.instances?.keys()||[])]};
  })));
  console.log('Browser diagnostics:',JSON.stringify(errors));
  if(!loadedFight.hasP1||!loadedFight.hasP2||loadedFight.sameSkeleton)throw Error('2 independent GLB fighter rigs were not created');
  await page.screenshot({path:'ci-images/batman-vs-male.png'});
  // Validate the mesh visibly tracks an attack's unchanged 2D startup/active
  // frames, and never writes back to the 2D hurtbox or health values.
  const animation=await page.evaluate(()=>{
    const g=window.game, p=g.renderer.model3d, f=g.fighters[0];
    g.pause=true;
    g.render();
    const o=p.instances.get('fighter:1');
    const bone=o.bones.get('hand_l');
    const xyz=()=>bone.getWorldPosition(new window.THREE.Vector3()).toArray();
    // We cannot rely on window.THREE (ES module is imported locally), so
    // measure world transform through the existing Three.js bone matrix.
    const before=bone.matrixWorld.elements.slice(12,15);
    const hp=g.fighters.map(x=>x.health);
    const move=f.def.moves.standing.heavy;
    f.attack={...move,kind:'standing',button:'heavy'};
    f.state='attack';f.attackTick=move.startup+1;
    g.render();
    const after=bone.matrixWorld.elements.slice(12,15);
    const dist=Math.hypot(...before.map((v,i)=>v-after[i]));
    const intact=hp.every((v,i)=>v===g.fighters[i].health);
    f.attack=null;f.attackTick=0;f.state='idle';g.pause=false;
    return {dist,intact,moveStartup:move.startup};
  });
  console.log('3D attack pose:',JSON.stringify(animation));
  if(!animation.intact || animation.dist<.003)
    throw Error('GLB attack failed pose change or modified gameplay state');
  await page.evaluate(()=>window.game.startMatch({p1:'batman',p2:'batman',stage:'neon-rooftop',mode:'cpu'}));
  await page.waitForTimeout(350);
  const mirror=await page.evaluate(()=>{
    const p=window.game.renderer.model3d;
    return p.instances.get('fighter:1')?.bones?.get('head')!==p.instances.get('fighter:2')?.bones?.get('head');
  });
  if(!mirror)throw Error('Mirror match shares a bone instance');
  await page.screenshot({path:'ci-images/batman-mirror.png'});
  // Mixed match: one original armored male, one shared female base.
  await page.evaluate(()=>window.game.startMatch({p1:'wonder-woman',p2:'batman',stage:'neon-rooftop',mode:'cpu'}));
  await page.waitForTimeout(350);
  const mixed=await page.evaluate(()=>{
    const game=window.game;
    game.render();
    const v=game.renderer.model3d;
    return {slots:[...v.instances].filter(([name])=>name.startsWith('fighter:')).map(([name,x])=>[name,x.kind]),
      supported:game.fighters.map(x=>v.supported(x,game.assets)),health:game.fighters.map(x=>x.health)};
  });
  console.log('Female vs Batman:',JSON.stringify(mixed));
  if(mixed.slots.find(x=>x[0]==='fighter:1')?.[1]!=='female' ||
     mixed.slots.find(x=>x[0]==='fighter:2')?.[1]!=='batman' ||
     mixed.supported.some(x=>!x))
    throw Error('Female versus armored Batman did not show independent GLB models');
  await page.screenshot({path:'ci-images/female-versus-batman.png'});
  // Mirror female model test: two skeleton clones and no shared bone objects.
  await page.evaluate(()=>window.game.startMatch({p1:'wonder-woman',p2:'wonder-woman',stage:'neon-rooftop',mode:'cpu'}));
  await page.waitForTimeout(350);
  const femaleMirror=await page.evaluate(()=>{
    const g=window.game;g.render();
    const p=g.renderer.model3d;
    return p.instances.get('fighter:1')?.kind==='female' &&
      p.instances.get('fighter:2')?.kind==='female' &&
      p.instances.get('fighter:1')?.bones.get('head')!==p.instances.get('fighter:2')?.bones.get('head');
  });
  if(!femaleMirror)throw Error('Female mirror characters reused bones or did not load');
  await page.screenshot({path:'ci-images/female-mirror.png'});
  if(errors.length)throw Error('Browser errors:\n'+errors.join('\n'));
  console.log('VISUAL_QA_SUCCESS');
}catch(err){console.error(err);process.exitCode=1;}finally{await browser.close();}

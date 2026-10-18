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
    return p?.loaded?.has('male')&&p?.loaded?.has('batman');
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
  await page.screenshot({path:'ci-images/female-fallback.png'});
  await page.evaluate(()=>{
    const g=window.game;
    g.startMatch({p1:'batman',p2:'superman',stage:'neon-rooftop',mode:'cpu'});
  });
  await page.waitForTimeout(350);
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
  await page.evaluate(()=>window.game.startMatch({p1:'batman',p2:'batman',stage:'neon-rooftop',mode:'cpu'}));
  await page.waitForTimeout(350);
  const mirror=await page.evaluate(()=>{
    const p=window.game.renderer.model3d;
    return p.instances.get('fighter:1')?.bones?.get('head')!==p.instances.get('fighter:2')?.bones?.get('head');
  });
  if(!mirror)throw Error('Mirror match shares a bone instance');
  await page.screenshot({path:'ci-images/batman-mirror.png'});
  if(errors.length)throw Error('Browser errors:\n'+errors.join('\n'));
  console.log('VISUAL_QA_SUCCESS');
}catch(err){console.error(err);process.exitCode=1;}finally{await browser.close();}

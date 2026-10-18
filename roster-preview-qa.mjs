import {chromium} from 'playwright';
import fs from 'node:fs';

const browser=await chromium.launch({headless:true,args:[
  '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist','--ignore-certificate-errors'
]});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
page.on('response',response=>{if(response.status()>=400)errors.push(
  'HTTP '+response.status()+' '+response.url());});
fs.mkdirSync('ci-images',{recursive:true});

try{
  await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:8765/',
    {waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>{
    const p=window.game?.renderer?.model3d;
    return p?.loaded?.has('male')&&p.loaded.has('female')&&
      p.loaded.has('batman')&&window.game.arena3d?.ready;
  },null,{timeout:120000});

  // Current canvas title screen: test real mouse and keyboard selection,
  // rather than treating decorative UI as an inert mockup.
  await page.evaluate(()=>{
    const g=window.game;g.scene='title';g.menuCursor=1;g.uiHover=null;g.frame=260;
    g.render();
  });
  await page.screenshot({path:'ci-images/cinematic-mode-menu.png'});
  const titleShot=await page.screenshot({type:'jpeg',quality:51});
  const encoded=titleShot.toString('base64').match(/.{1,4000}/g)||[];
  encoded.forEach((part,i)=>console.log('CINEMATIC_MENU_FRAME:'+i+'/'+encoded.length+':'+part));
  console.log('CINEMATIC_MENU_FRAME_FINISH:'+encoded.length);
  const menuCheck=await page.evaluate(()=>{
    const g=window.game;
    const hotspots=g.titleHotspots();
    const bothCards=hotspots.some(h=>h.id==='online'&&h.w===540)&&
      hotspots.some(h=>h.id==='cpu'&&h.w===552);
    g.menuCursor=1;
    g.updateTitle(new Set(['ArrowLeft']));
    const left=g.menuItems[g.menuCursor];
    g.updateTitle(new Set(['ArrowRight']));
    const right=g.menuItems[g.menuCursor];
    return {bothCards,left,right,scene:g.scene};
  });
  console.log('CINEMATIC_MENU_NAV',JSON.stringify(menuCheck));
  if(!menuCheck.bothCards||menuCheck.left!=='online'||
     menuCheck.right!=='cpu'||menuCheck.scene!=='title')
    throw Error('New mode menu broke keyboard/controller navigation');
  // Click the actual canvas's SOLO mode selection at its original hitbox.
  await page.mouse.click(982,365);
  const afterMouse=await page.evaluate(()=>window.game.scene);
  console.log('CINEMATIC_MENU_MOUSE',afterMouse);
  if(afterMouse!=='versus')throw Error('Mode card no longer opens the playable fight roster');
  await page.evaluate(()=>{const g=window.game;g.scene='title';g.menuCursor=1;});
  await page.mouse.click(1061,591);
  const footerClick=await page.evaluate(()=>window.game.scene);
  console.log('CINEMATIC_MENU_FOOTER',footerClick);
  if(footerClick!=='versus')throw Error('Footer confirm button is not actionable');
  await page.evaluate(()=>{const g=window.game;g.scene='title';g.menuCursor=1;});
  await page.mouse.click(50,221);
  const settingsMenu=await page.evaluate(()=>window.game.scene);
  if(settingsMenu!=='settings')throw Error('Menu redesign broke Settings button');
  await page.evaluate(()=>{const g=window.game;g.scene='title';g.menuCursor=1;});

  // In real game UI, drawSelect now invokes poseRelaxed. Test the resulting
  // actual rig bones rather than only calling the pose helper in isolation.
  for(const [character,key] of [['cyborg','male'],['wonder-woman','female'],['batman','batman']]){
    const pose=await page.evaluate(({character,key})=>{
      const game=window.game,p=game.renderer.model3d;
      game.enterVersus('cpu');
      game.p1Id=character;
      game.previewPlayer=1;
      game.render();
      const v=p.instances.get('select');
      if(!v)return {error:'No roster model'};
      const at=name=>v.bones.get(name).getWorldPosition(v.root.position.clone());
      const chest=at('spine_02');
      const armInfo=['l','r'].map(side=>{
        const sign=v.armSides[side];
        const shoulder=at('upperarm_'+side),elbow=at('lowerarm_'+side);
        const hand=at('hand_'+side);
        return {side,
          belowShoulder:shoulder.y-hand.y,
          belowChest:chest.y-hand.y,
          outsideChest:sign*(hand.x-chest.x),
          elbowOutside:sign*(elbow.x-chest.x)};
      });
      const tile=p.portraitFor(window.FG.CHARACTERS[character]);
      return {character,key,kind:v.kind,arms:armInfo,
        portrait:tile?.width===112&&tile?.height===147};
    },{character,key});
    console.log('ROSTER_RELAXED_POSE',JSON.stringify(pose));
    if(pose.error||pose.kind!==key||!pose.portrait||
       pose.arms?.some(arm=>arm.belowShoulder<.38||
         arm.belowChest<.18||arm.outsideChest<.19||
         arm.elbowOutside<.17))
      throw Error('Roster model is not standing relaxed: '+character);
    // Re-render after portrait capture, which hides the existing instances.
    await page.evaluate(()=>window.game.render());
    await page.screenshot({path:'ci-images/relaxed-'+key+'-select.png'});
  }

  // The separate 3D arena must still use its combat rig/animations.
  const fight=await page.evaluate(()=>{
    const game=window.game;
    game.startMatch({p1:'wonder-woman',p2:'batman',stage:'neon-rooftop',mode:'cpu'});
    game.render();
    return {scene:game.scene,ready:game.arena3d.ready,
      fighters:game.arena3d.views.map(v=>({key:v.key,bones:v.bones.size})),
      normalAttack:!!window.FG.CHARACTERS.batman.moves?.standing?.light};
  });
  console.log('ROSTER_COMBAT_UNCHANGED',JSON.stringify(fight));
  if(fight.scene!=='arena3d'||!fight.ready||!fight.normalAttack||
     fight.fighters.length!==2||fight.fighters.some(v=>v.bones<60))
    throw Error('Existing 3D combat was affected by the new roster pose');

  if(errors.length)throw Error('Browser/asset errors: '+errors.join('; '));
  console.log('ROSTER_RELAXED_BROWSER_QA_SUCCESS');
}catch(error){
  console.error(error);
  process.exitCode=1;
}finally{
  await browser.close();
}

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
    const sandboxCard=hotspots.some(h=>h.id==='sandbox'&&h.w===1112&&h.h===135);
    const oldFooter=hotspots.some(h=>h.id==='mode-confirm');
    g.menuCursor=1;
    g.updateTitle(new Set(['ArrowLeft']));
    const left=g.menuItems[g.menuCursor];
    g.updateTitle(new Set(['ArrowRight']));
    const right=g.menuItems[g.menuCursor];
    return {bothCards,sandboxCard,oldFooter,left,right,scene:g.scene};
  });
  console.log('CINEMATIC_MENU_NAV',JSON.stringify(menuCheck));
  if(!menuCheck.bothCards||!menuCheck.sandboxCard||menuCheck.oldFooter||
     menuCheck.left!=='online'||
     menuCheck.right!=='cpu'||menuCheck.scene!=='title')
    throw Error('New mode menu broke keyboard/controller navigation');
  // Click the actual canvas's SOLO mode selection at its original hitbox.
  await page.mouse.click(982,365);
  const afterMouse=await page.evaluate(()=>window.game.scene);
  console.log('CINEMATIC_MENU_MOUSE',afterMouse);
  if(afterMouse!=='versus')throw Error('Mode card no longer opens the playable fight roster');
  await page.evaluate(()=>{const g=window.game;g.scene='title';g.menuCursor=1;});
  // Clicking the new bottom Sandbox card opens SOLO character selection.
  await page.mouse.click(1061,591);
  const sandboxSelect=await page.evaluate(()=>{
    const g=window.game;
    g.p1Id='cyborg';g.previewPlayer=1;g.render();
    return {scene:g.scene,mode:g.mode,cursor:g.menuCursor,
      previewPlayable:window.FG.CHARACTERS[g.p1Id].playable};
  });
  console.log('SANDBOX_SELECTED_CHARACTER',JSON.stringify(sandboxSelect));
  if(sandboxSelect.scene!=='versus'||sandboxSelect.mode!=='sandbox'||
     sandboxSelect.cursor!==2||sandboxSelect.previewPlayable)
    throw Error('Sandbox does not open solo roster for preview-only characters');
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.game?.scene==='arena3d',null,{timeout:10000});
  const soloStart=await page.evaluate(()=>{
    const g=window.game,a=g.arena3d,first=a.fighters[0];
    g.render();
    return {scene:g.scene,mode:a.mode,phase:a.phase,
      fighters:a.fighters.length,avatars:a.views.length,
      name:first?.def?.id,timer:a.roundFrames,
      bornWithFullHealth:first?.health===first?.maxHealth,
      model:a.views[0]?.key,canvas:a.webgl.style.display};
  });
  console.log('SANDBOX_SOLO_START',JSON.stringify(soloStart));
  if(soloStart.scene!=='arena3d'||soloStart.mode!=='sandbox'||
     soloStart.phase!=='live'||soloStart.fighters!==1||
     soloStart.avatars!==1||soloStart.name!=='cyborg'||
     soloStart.model!=='male'||soloStart.canvas!=='block'||
     soloStart.timer!==Infinity||!soloStart.bornWithFullHealth)
    throw Error('Sandbox spawned a bot, omitted the preview model or started a match clock');
  const beforeMove=await page.evaluate(()=>{
    const f=window.game.arena3d.fighters[0];return {x:f.x,z:f.z};
  });
  await page.keyboard.down('w');
  await page.waitForTimeout(350);
  await page.keyboard.up('w');
  const afterMove=await page.evaluate(()=>{
    const g=window.game.arena3d,f=g.fighters[0];
    return {x:f.x,z:f.z,count:g.fighters.length,phase:g.phase};
  });
  console.log('SANDBOX_WALK',JSON.stringify({beforeMove,afterMove}));
  if(afterMove.z<=beforeMove.z+.3||afterMove.count!==1||
      afterMove.phase!=='live')
    throw Error('Solo free roam does not move, or a bot joined the arena');
  await page.screenshot({path:'ci-images/sandbox-free-roam.png'});
  const sandboxScreen=await page.screenshot({type:'jpeg',quality:53});
  const segments=sandboxScreen.toString('base64').match(/.{1,4000}/g)||[];
  segments.forEach((part,i)=>console.log('SANDBOX_3D_FRAME:'+i+'/'+segments.length+':'+part));
  console.log('SANDBOX_3D_FRAME_FINISH:'+segments.length);
  // Hold a direction, stop, and confirm the visible model keeps looking
  // that way indefinitely. The old bug turned every idle character to +Z.
  const soloFacing=await page.evaluate(()=>{
    const arena=window.game.arena3d,actor=arena.fighters[0],view=arena.views[0];
    const empty=window.FG.InputUtils.emptyFrame;
    const tick=(controls)=>{
      actor.prevX=actor.x;actor.prevZ=actor.z;actor.prevY=actor.y;
      actor.prevVisualYaw=actor.visualYaw;
      actor.prevLean=actor.lean;actor.prevBank=actor.bank;
      actor.prevGaitPhase=actor.gaitPhase;actor.animClock++;
      arena.move(actor,null,controls,new Set(),true);
      arena.pose(view,1);
    };
    const cases=[
      {key:'forward',x:0,y:-1},
      {key:'left',x:-1,y:0},
      {key:'right',x:1,y:0},
      {key:'backward',x:0,y:1},
      {key:'diagonal',x:.7,y:-.7}
    ];
    return cases.map(({key,x,y})=>{
      actor.reset(-11,-9);actor.visualYaw=actor.prevVisualYaw=0;
      const controls=empty();controls.x=x;controls.y=y;
      for(let j=0;j<28;j++)tick(controls);
      const movingYaw=actor.visualYaw;
      const movingState=actor.state;
      for(let j=0;j<90;j++)tick(empty());
      const idleYaw=actor.visualYaw;
      const root=view.root.matrixWorld.elements;
      const renderedYaw=Math.atan2(root[8],root[10]);
      const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
      return {key,movingState,idleState:actor.state,
        movingYaw,idleYaw,renderedYaw,
        turnError:Math.abs(wrap(idleYaw-movingYaw)),
        visibleError:Math.abs(wrap(renderedYaw-movingYaw)),
        originalForwardError:Math.abs(wrap(movingYaw))};
    });
  });
  console.log('SANDBOX_FACING_IDLE_QA',JSON.stringify(soloFacing));
  if(soloFacing.some(x=>x.movingState!=='walk'||x.idleState!=='idle'||
     x.turnError>.002||x.visibleError>.002)||
     soloFacing.filter(x=>x.key!=='forward').some(x=>x.originalForwardError<.25))
    throw Error('Sandbox player rotated to +Z instead of keeping last movement heading');
  // A character with an unfinished combat moveset still works in Sandbox.
  const female=await page.evaluate(()=>{
    const g=window.game;
    g.startMatch({p1:'catwoman',mode:'sandbox'});
    g.render();
    const a=g.arena3d;
    return {mode:a.mode,characters:a.fighters.length,
      character:a.fighters[0].def.id,model:a.views[0].key};
  });
  console.log('SANDBOX_PREVIEW_FEMALE',JSON.stringify(female));
  if(female.characters!==1||female.character!=='catwoman'||
      female.model!=='female'||female.mode!=='sandbox')
    throw Error('Female preview-only roster model not available in Sandbox');
  await page.evaluate(()=>window.game.arena3d.end());
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

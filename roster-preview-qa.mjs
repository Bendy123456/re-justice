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
    const g=window.game,hotspots=g.titleHotspots();
    const bothCards=hotspots.some(h=>h.id==='online'&&h.w===579)&&
      hotspots.some(h=>h.id==='cpu'&&h.w===579);
    const sandboxCard=hotspots.some(h=>h.id==='sandbox'&&h.w===579&&h.h===176);
    const tabs=['fight-tab','settings-tab'].every(id=>
      hotspots.some(h=>h.id===id&&h.w===77));
    g.menuZone='cards';g.menuCursor=1;
    g.updateTitle(new Set(['ArrowLeft']));
    const sidebar=g.menuZone==='sidebar'&&g.menuSidebar==='fight';
    g.updateTitle(new Set(['ArrowDown']));
    const settingsFocus=g.menuZone==='sidebar'&&g.menuSidebar==='settings';
    g.updateTitle(new Set(['Enter']));
    const settingsOpened=g.scene==='settings';
    g.updateSettings(new Set(['Escape']));
    const returned=g.scene==='title'&&g.menuZone==='sidebar';
    g.updateTitle(new Set(['ArrowRight']));
    const modes=g.menuZone==='cards'&&g.menuCursor===1;
    g.updateTitle(new Set(['ArrowDown']));
    const sandbox=g.menuItems[g.menuCursor]==='sandbox';
    g.menuCursor=1;g.menuZone='cards';
    return {bothCards,sandboxCard,tabs,sidebar,settingsFocus,
      settingsOpened,returned,modes,sandbox,scene:g.scene};
  });
  console.log('CINEMATIC_MENU_NAV',JSON.stringify(menuCheck));
  if(Object.entries(menuCheck).some(([k,v])=>k!=='scene'&&!v)||
     menuCheck.scene!=='title')
    throw Error('Controller cannot access both title sidebar tabs and mode cards');
  // Capture the visible controller focus on the Settings tab too.
  await page.evaluate(()=>{
    const g=window.game;g.menuZone='sidebar';g.menuSidebar='settings';g.uiHover=null;g.frame++;
    g.render();
  });
  await page.screenshot({path:'ci-images/controller-settings-tab-focus.png'});
  await page.evaluate(()=>{
    const g=window.game;g.menuZone='cards';g.menuCursor=1;g.frame++;g.render();
  });
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
  // Simulate standard Xbox / PlayStation Gamepad API without requiring
  // hardware on headless CI. Covers an actual preview-only Sandbox fighter,
  // controller reassignment after keyboard menu usage, both attacks,
  // jump/dash buttons and an independent right-stick camera orbit.
  const controllerArenaQA=await page.evaluate(()=>{
    const g=window.game,ar=g.arena3d,input=g.input,a=ar.fighters[0];
    const savedWin=input.win,savedSlots={...input.padSlots};
    const savedJoined={...input.keyboardJoined};
    const pad={index:0,id:'Xbox Wireless Controller',mapping:'standard',
      connected:true,axes:[0,0,0,0],
      buttons:Array.from({length:18},()=>({pressed:false,value:0}))};
    const press=idx=>{
      pad.buttons.forEach((b,i)=>{b.pressed=i===idx;b.value=i===idx?1:0;});
    };
    const tick=()=>{input.update();ar.step(input,new Set());};
    try{
      input.win={navigator:{getGamepads:()=>[pad]}};
      input.keyboardJoined[1]=true;input.padSlots[1]=null;input.padSlots[2]=null;
      // Controller must press a button to join P2 when keyboard already
      // owns P1. That was intentionally true in the previous input system.
      press(2);tick();
      const initiallyP2=input.padSlots[2]===0;
      input.preferControllerP1();
      const assigned=input.padSlots[1]===0;
      press(-1);
      const beginX=a.x;
      pad.axes[0]=1;tick();
      const movedRight=a.x>beginX+.02;
      ar.initialCamera=false;ar.render(1);
      const originalCamera=ar.camera.position.clone();
      const originalLook=ar.camera.getWorldDirection(ar.camera.position.clone());
      const originalDistance=Math.hypot(
        originalCamera.x-a.x,originalCamera.z-a.z);
      pad.axes=[0,0,.88,-.70];tick();
      ar.initialCamera=false;ar.render(1);
      const newCamera=ar.camera.position.clone();
      const changedLook=ar.camera.getWorldDirection(ar.camera.position.clone());
      const orbitMoved=ar.sandboxOrbitYaw<-.015&&ar.sandboxOrbitPitch<-.01 &&
        Math.hypot(newCamera.x-originalCamera.x,
          newCamera.z-originalCamera.z)>.13;
      // On a STANDARD pad, right stick to the right must rotate the VIEW
      // toward positive world X at the default camera heading.
      const lookRightCorrect=changedLook.x>originalLook.x+.019;
      const orbitDistance=Math.hypot(newCamera.x-a.x,newCamera.z-a.z);
      const distancePreserved=Math.abs(orbitDistance-originalDistance)<.12;
      const orbitYaw=ar.sandboxOrbitYaw;
      // Check camera-relative running at cardinal directions. At normal
      // heading stick-up must go away from camera (+Z), stick-right +X.
      a.reset(-11,-9);ar.sandboxOrbitYaw=0;ar.sandboxOrbitPitch=0;
      pad.axes=[0,-1,0,0];tick();
      const forwardCorrect=a.z>-9+.04;
      // After rotating view right by 90 degrees, "forward" becomes +X
      // and "right" becomes -Z, just like third-person console controls.
      a.reset(-11,-9);ar.sandboxOrbitYaw=-Math.PI/2;
      pad.axes=[0,-1,0,0];tick();
      const turnedForwardCorrect=a.x>-11+.04&&Math.abs(a.z+9)<.025;
      a.reset(-11,-9);
      pad.axes=[1,0,0,0];tick();
      const turnedRightCorrect=a.z<-9-.04&&Math.abs(a.x+11)<.025;
      a.reset(-11,-9);ar.sandboxOrbitYaw=0;ar.sandboxOrbitPitch=0;
      pad.axes=[0,0,0,0];press(2);tick();
      const light=a.attack?.button==='light';
      a.attack=null;a.attackTick=0;
      press(1);tick();
      const heavy=a.attack?.button==='heavy';
      a.attack=null;a.attackTick=0;
      press(5);tick();
      const dashed=a.dashCooldown>0&&a.state==='dash';
      a.dash=0;a.dashCooldown=0;
      press(0);tick();
      const jumped=!a.grounded&&a.y>0;
      press(-1);tick();
      return {model:ar.views[0].key,initiallyP2,assigned,movedRight,
        orbitMoved,lookRightCorrect,distancePreserved,forwardCorrect,
        turnedForwardCorrect,turnedRightCorrect,orbitYaw,
        light,heavy,dashed,jumped};
    }finally{
      input.win=savedWin;input.padSlots=savedSlots;
      input.keyboardJoined=savedJoined;
      input.frames[1]=window.FG.InputUtils.emptyFrame();
      input.frames[2]=window.FG.InputUtils.emptyFrame();
      input.rawPads=[];input.padLast={};input.padLastAxes={};
      a.reset(-11,-9);a.visualYaw=a.prevVisualYaw=0;
      ar.sandboxOrbitYaw=0;ar.sandboxOrbitPitch=0;ar.initialCamera=false;
    }
  });
  console.log('SANDBOX_GAMEPAD_AND_LOOK_QA',JSON.stringify(controllerArenaQA));
  if(Object.entries(controllerArenaQA).some(([k,v])=>
      !['model','orbitYaw'].includes(k)&&v!==true)||
     controllerArenaQA.model!=='male')
    throw Error('Standard controller buttons/movement or right-stick camera failed in Sandbox');

  const beforeMove=await page.evaluate(()=>{
    const f=window.game.arena3d.fighters[0];return {x:f.x,z:f.z};
  });
  // SwiftShader on CI may take longer than 350ms to render the first 3D
  // frame of a high-detail map. Wait for actual world-space movement,
  // testing real keyboard input without assuming a fixed frame rate.
  await page.keyboard.down('w');
  try{
    await page.waitForFunction((initialZ)=>{
      const g=window.game?.arena3d,f=g?.fighters?.[0];
      return f?.z>initialZ+.31;
    },beforeMove.z,{polling:125,timeout:15000});
  }finally{
    await page.keyboard.up('w');
  }
  const afterMove=await page.evaluate(()=>{
    const g=window.game.arena3d,f=g.fighters[0];
    return {x:f.x,z:f.z,count:g.fighters.length,phase:g.phase,tick:g.tick};
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

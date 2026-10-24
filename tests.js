'use strict';
(() => {
  const FG=window.FG,assert=(v,m='Assertion failed')=>{if(!v)throw Error(m);};
  const equal=(actual,expected,m='')=>assert(Object.is(actual,expected),m+` (got ${actual}, expected ${expected})`);
  const tests=[];const test=(name,fn)=>tests.push([name,fn]);
  function makeGame(){
    const audio={play(){},unlock(){}};
    const input={update(){},frame(){return FG.InputUtils.emptyFrame();},anyPress(){return false;},
      toggleKeys:new Set(),rumble(){},keyboardJoined:{1:false,2:false},padSlots:{1:null,2:null}};
    return new FG.Game({audio,input,assets:{load(){},image(){return null;},sound(){return null;}}});
  }
  function fakeWindow(){
    const listeners=new Map(),win={navigator:{getGamepads:()=>win.pads},pads:[],
      addEventListener(name,fn){listeners.set(name,fn);},
      removeEventListener(name){listeners.delete(name);},
      fire(name,payload){listeners.get(name)?.(payload);}};
    return win;
  }
  function fakePad(index=0,buttons=[],axes=[0,0],id='Xbox Wireless Controller'){
    return {index,id,axes,buttons:Array.from({length:18},(_,i)=>({pressed:buttons.includes(i),value:buttons.includes(i)?1:0})),mapping:'standard'};
  }
  test('Playable characters have Light and Heavy normals in every stance',()=>{
    equal(FG.ROSTER.length,30);equal(FG.PLAYABLE.length,4);
    for(const id of FG.PLAYABLE){const c=FG.CHARACTERS[id];assert(c.hurtboxes&&c.stats!==null);
      for(const stance of ['standing','crouching','airborne'])for(const key of ['light','heavy']){
        const m=c.moves[stance][key];assert(m.startup>0&&m.active>0&&m.recovery>0&&m.damage>0);
      }
    }
  });
  test('Exact AABB overlap excludes edge-only contact',()=>{
    assert(FG.EngineUtils.overlaps({x:0,y:0,w:10,h:10},{x:9,y:9,w:10,h:10}));
    assert(!FG.EngineUtils.overlaps({x:0,y:0,w:10,h:10},{x:10,y:2,w:5,h:5}));
  });
  test('Damage follows character damage multiplier',()=>{
    const a=new FG.Fighter(FG.CHARACTERS.flash,1,200,584);
    const b=new FG.Fighter(FG.CHARACTERS.batman,2,300,584);
    const damage=FG.EngineUtils.contactDamage(b,a,a.def.moves.standing.light,false);
    equal(damage,Math.round(38*.94));equal(b.health,b.maxHealth-damage);
  });
  test('Standing guard blocks mids and overheads, not lows',()=>{
    const b=new FG.Fighter(FG.CHARACTERS.batman,2,300,584);b.blocking=true;b.blockLow=false;
    assert(FG.EngineUtils.canGuard(b,{level:'mid'}));
    assert(FG.EngineUtils.canGuard(b,{level:'overhead'}));
    assert(!FG.EngineUtils.canGuard(b,{level:'low'}));
  });
  test('Low guard blocks lows and mids, but not overheads',()=>{
    const b=new FG.Fighter(FG.CHARACTERS.batman,2,300,584);b.blocking=true;b.blockLow=true;
    assert(FG.EngineUtils.canGuard(b,{level:'low'}));
    assert(FG.EngineUtils.canGuard(b,{level:'mid'}));
    assert(!FG.EngineUtils.canGuard(b,{level:'overhead'}));
  });
  test('Successful guards cause chip damage and blockstun',()=>{
    const a=new FG.Fighter(FG.CHARACTERS.superman,1,200,584);
    const b=new FG.Fighter(FG.CHARACTERS.flash,2,300,584);
    const move=a.def.moves.standing.heavy;
    const chip=FG.EngineUtils.contactDamage(b,a,move,true);
    assert(chip>0&&chip<move.damage);equal(b.stun,move.blockstun);
    equal(b.state,'blockstun');
  });
  test('Unblocked hit interrupts an opponent attack and causes hitstun',()=>{
    const a=new FG.Fighter(FG.CHARACTERS.flash,1,200,584),b=new FG.Fighter(FG.CHARACTERS.superman,2,300,584);
    assert(b.attemptAttack('heavy'));
    const move=a.def.moves.standing.heavy;
    FG.EngineUtils.contactDamage(b,a,move,false);
    equal(b.attack,null);equal(b.stun,move.hitstun);equal(b.state,'hitstun');
  });
  test('Damage never makes health negative',()=>{
    const a=new FG.Fighter(FG.CHARACTERS.flash,1,200,584),b=new FG.Fighter(FG.CHARACTERS.batman,2,300,584);
    b.health=3;FG.EngineUtils.contactDamage(b,a,a.def.moves.standing.heavy,false);equal(b.health,0);
  });
  test('Attack startup, active window, and recovery have exact boundaries',()=>{
    const f=new FG.Fighter(FG.CHARACTERS.flash,1,200,584);
    assert(f.attemptAttack('light'));
    const move=f.attack;
    f.attackTick=move.startup-1;equal(f.activeHitbox,null);
    f.attackTick=move.startup;assert(f.activeHitbox!==null);
    f.attackTick=move.startup+move.active;equal(f.activeHitbox,null);
  });
  test('Best-of-three round reset and match winner',()=>{
    const g=makeGame();g.startMatch();g.finishRound(1);equal(g.wins[0],1);
    g.advanceAfterKo();equal(g.roundNumber,2);equal(g.phase,'intro');
    g.finishRound(1);g.advanceAfterKo();equal(g.phase,'matchover');equal(g.matchWinner,1);
  });
  test('Timeout compares percentage health; tied rounds replay',()=>{
    const g=makeGame();g.startMatch();g.phase='live';
    g.fighters[0].health=g.fighters[0].maxHealth*.6;
    g.fighters[1].health=g.fighters[1].maxHealth*.4;
    g.roundTicks=1;g.tickFight();equal(g.phase,'ko');equal(g.winner,1);
    const h=makeGame();h.startMatch();h.phase='live';h.roundTicks=1;
    h.tickFight();equal(h.winner,0);h.advanceAfterKo();equal(h.roundNumber,1);
  });
  test('60 Hz clock ticks once per live step and freezes on hitstop',()=>{
    const g=makeGame();g.startMatch();g.phase='live';
    const ticks=g.roundTicks;g.tickFight();equal(g.roundTicks,ticks-1);
    g.hitstop=6;g.tickFight();equal(g.roundTicks,ticks-1);
  });
  test('Removed Medium Attack is unavailable to players and AI',()=>{
    const moves=FG.CHARACTERS.flash.moves;
    for(const posture of ['standing','crouching','airborne']){
      equal(Object.keys(moves[posture]).join(','),'light,heavy');
    }
    const actor=new FG.Fighter(FG.CHARACTERS.flash,1,200,584);
    assert(!actor.attemptAttack('medium'));
    assert(!FG.InputUtils.ACTIONS.includes('medium'));
    const pad=fakePad(0,[3]);
    const frame=FG.InputUtils.padFrame(pad);
    assert(!('medium' in frame));
    assert(!frame.light&&!frame.heavy);
    const cpu=new FG.BasicAI(55);
    const opponent=new FG.Fighter(FG.CHARACTERS.batman,2,300,584);
    for(let t=0;t<300;t++){
      cpu.cooldown=0;
      const out=cpu.decide(actor,opponent,t);
      assert(!('medium' in out));
    }
  });
  test('Gamepad standard buttons: Square/X light and Circle/B heavy',()=>{
    const p=fakePad(0,[2,3,1,0,7,4,6,5,9,8]);const frame=FG.InputUtils.padFrame(p);
    for(const a of ['light','heavy','power','super','throw','block','burn','pause','reset'])assert(frame[a],a);
  });
  test('Analog deadzone and eight-way diagonal snapping',()=>{
    equal(FG.InputUtils.snapStick(.18,.17).x,0);
    const q=FG.InputUtils.snapStick(.8,-.8);equal(q.x,1);equal(q.y,-1);
  });
  test('D-pad + stick opposite directions resolve to neutral',()=>{
    const p=fakePad(0,[14,12],[.99,.99]);const f=FG.InputUtils.padFrame(p);
    equal(f.left,false);equal(f.right,false);equal(f.up,false);equal(f.down,false);
    equal(f.x,0);equal(f.y,0);
  });
  test('First pressed gamepad joins P1; second joins P2',()=>{
    const win=fakeWindow();const input=new FG.InputManager(win);
    win.pads=[fakePad(0,[0]),fakePad(1,[])];input.update();equal(input.padSlots[1],0);
    win.pads=[fakePad(0,[0]),fakePad(1,[1])];input.update();equal(input.padSlots[2],1);
    input.destroy();
  });
  test('Keyboard P1 + first pressed pad can join as P2',()=>{
    const win=fakeWindow();const input=new FG.InputManager(win);
    input._down({code:'KeyJ',preventDefault(){}});input.update();input.checkKeyboardJoin(1);
    equal(input.keyboardJoined[1],true);
    win.pads=[fakePad(0,[2])];input.update();equal(input.padSlots[2],0);
    assert(input.frame(1).light);assert(input.frame(2).light);
    input.destroy();
  });
  test('Already-connected controller auto-joins P1 without button press',()=>{
    const win=fakeWindow(),input=new FG.InputManager(win);
    win.pads=[fakePad(0,[])];input.update();
    equal(input.padSlots[1],0);
    win.pads=[fakePad(0,[],[.95,-.94])];input.update();
    assert(input.frame(1).up&&input.frame(1).right);
    equal(input.frame(1).x,1);equal(input.frame(1).y,-1);
    assert(input.frame(1).pressed.up&&input.frame(1).pressed.right);
    input.update();assert(!input.frame(1).pressed.up);
    input.destroy();
  });
  test('Controller takes over P1 in single player after keyboard joined menu',()=>{
    const win=fakeWindow(),input=new FG.InputManager(win);
    input._down({code:'KeyJ',preventDefault(){}});
    input.update();input.checkKeyboardJoin(1);
    equal(input.keyboardJoined[1],true);
    win.pads=[fakePad(0,[0])];input.update();
    equal(input.padSlots[2],0);equal(input.padSlots[1],null);
    assert(input.preferControllerP1());
    equal(input.padSlots[1],0);equal(input.padSlots[2],null);
    input.update();assert(input.frame(1).power);
    input.destroy();
  });
  test('First controller can navigate and confirm title and character select',()=>{
    const win=fakeWindow(),input=new FG.InputManager(win);
    const g=new FG.Game({input,audio:{play(){},unlock(){}},
      assets:{load(){},image(){return null;},sound(){return null;}}});
    win.pads=[fakePad(0,[])];g.step();
    equal(input.padSlots[1],0);equal(g.scene,'title');
    win.pads=[fakePad(0,[13])];g.step();
    equal(g.menuCursor,2);
    win.pads=[fakePad(0,[])];g.step();
    win.pads=[fakePad(0,[0])];g.step();
    equal(g.scene,'versus');equal(g.mode,'sandbox');
    win.pads=[fakePad(0,[])];g.step();
    win.pads=[fakePad(0,[15])];g.step();
    assert(g.previewPlayer===1&&g.selectNavCooldown[1]>0);
    equal(input.padSlots[1],0);
    input.destroy();
  });
  test('Controller can reach FIGHT and SETTINGS sidebar and return to all modes',()=>{
    const win=fakeWindow(),input=new FG.InputManager(win);
    const g=new FG.Game({input,audio:{play(){},unlock(){}},
      assets:{load(){},image(){return null;},sound(){return null;}}});
    const tick=buttons=>{win.pads=[fakePad(0,buttons)];g.step();};
    tick([]);
    equal(g.menuZone,'cards');equal(g.menuCursor,1);
    tick([14]);equal(g.menuZone,'sidebar');equal(g.menuSidebar,'fight');
    tick([]);tick([13]);equal(g.menuSidebar,'settings');
    tick([]);tick([0]);equal(g.scene,'settings');
    tick([]);tick([13]);equal(g.settingsRow,-1);
    tick([]);tick([15]);equal(g.settingsDevice,'pad');
    tick([]);tick([1]);equal(g.scene,'title');
    equal(g.menuZone,'sidebar');equal(g.menuSidebar,'settings');
    tick([]);tick([12]);equal(g.menuSidebar,'fight');
    tick([]);tick([0]);equal(g.menuZone,'cards');
    tick([]);tick([12]);equal(g.menuCursor,0);
    tick([]);tick([13]);equal(g.menuCursor,1);
    tick([]);tick([13]);equal(g.menuCursor,2);
    tick([]);tick([0]);equal(g.scene,'versus');equal(g.mode,'sandbox');
    input.destroy();
  });
  test('Controller disconnect unassigns pad and fires callback',()=>{
    const win=fakeWindow();const input=new FG.InputManager(win);
    win.pads=[fakePad(0,[0])];input.update();let called=0;
    input.onDisconnect=p=>called=p;win.pads=[];input.update();
    equal(called,1);equal(input.padSlots[1],null);input.destroy();
  });
  test('Controller glyphs match PlayStation versus Xbox IDs',()=>{
    equal(FG.InputUtils.padFamily('DualSense Wireless Controller'),'ps');
    equal(FG.InputUtils.padFamily('Xbox Wireless Controller'),'xbox');
  });
  test('Rebinding validates stored values and can reset to defaults',()=>{
    const win=fakeWindow();const input=new FG.InputManager(win);
    assert(input.setBinding(1,'keyboard','light','KeyF'));
    equal(input.bindings.keyboard[1].light,'KeyF');
    assert(!input.setBinding(1,'pad','light',53));
    input.resetBindings();equal(input.bindings.keyboard[1].light,'KeyJ');input.destroy();
  });
  test('Controller buttons are edge-triggered, not repeated each held tick',()=>{
    const win=fakeWindow();const input=new FG.InputManager(win);
    win.pads=[fakePad(0,[2])];input.update();assert(input.frame(1).pressed.light);
    input.update();assert(input.frame(1).light);assert(!input.frame(1).pressed.light);
    win.pads=[fakePad(0,[])];input.update();assert(input.frame(1).released.light);
    input.destroy();
  });
  test('One fixed-step simulation produces deterministic state with seeded CPU',()=>{
    function replay(){const g=makeGame();g.startMatch();g.phase='live';for(let i=0;i<450;i++)g.tickFight();
      return g.fighters.map(f=>[f.x,f.y,f.health,f.state,f.stun]);}
    equal(JSON.stringify(replay()),JSON.stringify(replay()));
  });
  test('Integrated active hitbox deals damage in a live fight',()=>{
    const g=makeGame();g.startMatch({mode:'versus'});g.phase='live';
    const [a,b]=g.fighters;a.x=580;b.x=666;
    let tick=0;
    g.input.frame=p=>{
      const f=FG.InputUtils.emptyFrame();
      if(p===1&&tick===0){f.light=true;f.pressed.light=true;}
      return f;
    };
    for(tick=0;tick<9;tick++)g.tickFight();
    assert(b.health<b.maxHealth,'Active normal did not hit');
    assert(g.hitstop>0,'Impact should cause hitstop');
  });
  test('Integrated crouching light is guarded low but not standing',()=>{
    const doFight=(crouchGuard)=>{
      const g=makeGame();g.startMatch({mode:'versus'});g.phase='live';
      const [a,b]=g.fighters;a.x=570;b.x=661;
      let tick=0;
      g.input.frame=p=>{
        const f=FG.InputUtils.emptyFrame();
        if(p===1){f.down=true;if(tick===0){f.pressed.light=true;f.light=true;}}
        if(p===2){f.block=true;f.down=crouchGuard;}
        return f;
      };
      for(tick=0;tick<12;tick++)g.tickFight();
      return {damage:b.maxHealth-b.health,state:b.state};
    };
    const low=doFight(true),high=doFight(false);
    assert(low.damage>0&&low.damage<high.damage,'Low guard should receive only chip');
  });
  test('Gamepad polling occurs once per fixed simulation tick',()=>{
    const win=fakeWindow();let samples=0;
    win.navigator.getGamepads=()=>{samples++;return [];};
    const input=new FG.InputManager(win);
    const g=new FG.Game({input,audio:{play(){},unlock(){}},assets:{load(){},image(){return null},sound(){return null}}});
    g.startMatch();for(let i=0;i<20;i++)g.step();
    equal(samples,20);input.destroy();
  });
  test('Disconnect while fighting automatically pauses the match',()=>{
    const win=fakeWindow(),input=new FG.InputManager(win);
    const g=new FG.Game({input,audio:{play(){},unlock(){}},assets:{load(){},image(){return null},sound(){return null}}});
    g.startMatch();equal(g.pause,false);
    input.onDisconnect(1);equal(g.pause,true);
    input.destroy();
  });
  test('Character-select index-to-grid mapping preserves all 30 slots',()=>{
    const g=makeGame(),seen=new Set();
    for(let i=0;i<FG.ROSTER.length;i++){
      const pos=g.selectIndexToGrid(i),back=g.selectGridToIndex(pos.row,pos.column);
      equal(back,i);seen.add(pos.row+':'+pos.column);
    }
    equal(seen.size,30);
  });
  test('Character-select navigation moves between portrait rows and columns',()=>{
    const g=makeGame();g.enterVersus('cpu');
    g.p1Id='flash';g.moveSelection(1,1,0);
    equal(g.p1Id,'green-arrow');equal(g.previewPlayer,1);
    g.moveSelection(1,0,-1);equal(g.p1Id,'deathstroke');
    g.moveSelection(2,1,0);equal(g.previewPlayer,2);
  });
  test('Unfinished fighters preview but cannot lock or enter a match',()=>{
    const g=makeGame();g.enterVersus('cpu');
    g.p1Id='aquaman';assert(!g.toggleSelectLock(1));
    equal(g.selectLocked[1],false);equal(g.scene,'versus');
    g.p1Id='flash';assert(g.toggleSelectLock(1));
    equal(g.selectLocked[1],true);
    g.moveSelection(1,1,0);equal(g.selectLocked[1],false);
  });
  test('Clicking Fight from Settings returns to menu on scaled canvas',()=>{
    const g=makeGame();
    g.canvas={style:{},getBoundingClientRect(){return {left:80,top:30,width:640,height:360};}};
    g.openSettings();
    const click=(x,y)=>g.onPointerClick({clientX:80+x/2,clientY:30+y/2});
    click(200,211);equal(g.settingsPlayer,2);
    click(420,211);equal(g.settingsDevice,'pad');
    click(210,296);equal(g.rebinding.action,'left');
    click(40,100);equal(g.scene,'title');equal(g.rebinding,null);
    equal(g.menuCursor,1);
  });

  test('HiDPI canvas uses physical pixels while keeping logical coordinates',()=>{
    const g=makeGame();
    const transform=[];
    g.canvas={width:1280,height:720,
      getBoundingClientRect(){return {left:0,top:0,width:1920,height:1080};}};
    g.ctx={setTransform(...args){transform.push(args);}};
    g.resize();
    assert(g.canvas.width>=1920&&g.canvas.height>=1080,'Canvas not rendered at CSS pixel resolution');
    equal(g.canvas.width/g.canvas.height,1280/720);
    equal(transform[0][0],g.canvas.width/1280);
    const pos=g.pointerToCanvas({clientX:960,clientY:540});
    equal(pos.x,640);equal(pos.y,360);
  });
  test('Menu clickable card regions and Settings rows match the new layout',()=>{
    const g=makeGame();
    const hotspot=g.titleHotspots().find(x=>x.id==='cpu');
    assert(g.pointInRect({x:1000,y:320},hotspot));
    const rows=g.settingsHotspots().filter(x=>x.id==='settings-row');
    equal(rows.length,FG.InputUtils.ACTIONS.length+2);
    const firstRight=rows.find(x=>x.row===8),lastLeft=rows.find(x=>x.row===7);
    assert(firstRight.x>lastLeft.x,'Right settings column missing');
    assert(lastLeft.y<630,'Last settings row outside panel');
  });
  test('Skeletal rig has all animated starter fighters',()=>{
    const rig=FG.FighterRig;
    assert(Boolean(rig),'Rig renderer missing');
    for(const id of ['flash','batman','superman','wonder-woman']){
      assert(Boolean(rig.LOOKS[id]),'Missing model '+id);
      const data=rig.LOOKS[id];assert(Boolean(rig.BUILDS[data.build]));
    }
    equal(rig.ANIMATIONS.filter(k=>/^(standing|crouching|airborne)_(light|heavy)$/.test(k)).length,6);
  });
  test('Animation sampler follows attack startup and active frames',()=>{
    const move=FG.CHARACTERS.flash.moves.standing.light;
    const startup=FG.FighterRig.sample('standing_light',0,{...move,kind:'standing',button:'light'});
    const active=FG.FighterRig.sample('standing_light',move.startup+1,{...move,kind:'standing',button:'light'});
    assert(!startup.active);assert(active.active);
    assert(active.armA!==startup.armA,'Strike pose must differ from windup');
  });
  test('Character portrait click maps left/right angled bank coordinates',()=>{
    const g=makeGame();
    equal(g.selectPortraitHit({x:63,y:45}),0);
    equal(g.selectPortraitHit({x:1210,y:45}),15);
    equal(g.selectPortraitHit({x:645,y:350}),-1);
  });
  test('Selecting a fighter by mouse preserves combat state',()=>{
    const g=makeGame();g.enterVersus('cpu');
    const before={round:g.roundNumber,hp:g.roundTicks,phase:g.phase};
    assert(g.selectPortraitAt({x:63,y:45},1));
    equal(g.p1Id,FG.ROSTER[0]);
    equal(g.roundNumber,before.round);equal(g.roundTicks,before.hp);equal(g.phase,before.phase);
    g.p1Id='flash';const i=FG.ROSTER.indexOf('flash');
    const row=Math.floor((i%15)/3),col=i%3,x=23+col*81+row*16+20,y=9+row*127+22;
    assert(g.selectPortraitAt({x,y},1));
    equal(g.selectLocked[1],true);
  });
  const list=document.getElementById('cases');let passed=0;
  for(const [name,fn] of tests){const li=document.createElement('li');
    try{fn();li.className='pass';li.textContent=name;passed++;}
    catch(e){li.className='fail';li.textContent=name+' — '+String(e.stack||e.message||e);}
    list.append(li);
  }
  document.getElementById('total').textContent=`${passed} / ${tests.length} tests passed`;
  document.getElementById('total').style.color=passed===tests.length?'#89dea6':'#ffafa5';
  window.__testResult={passed,total:tests.length};
})();

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
  test('Playable characters are data-only and have nine normals each',()=>{
    equal(FG.ROSTER.length,30);equal(FG.PLAYABLE.length,4);
    for(const id of FG.PLAYABLE){const c=FG.CHARACTERS[id];assert(c.hurtboxes&&c.stats!==null);
      for(const stance of ['standing','crouching','airborne'])for(const key of ['light','medium','heavy']){
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
    assert(b.attemptAttack('medium'));
    const move=a.def.moves.standing.medium;
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
  test('Gamepad standard buttons: Square/X light, Triangle/Y medium, Circle/B heavy',()=>{
    const p=fakePad(0,[2,3,1,0,7,4,6,5,9,8]);const frame=FG.InputUtils.padFrame(p);
    for(const a of ['light','medium','heavy','power','super','throw','block','burn','pause','reset'])assert(frame[a],a);
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
    click(200,241);equal(g.settingsPlayer,2);
    click(400,241);equal(g.settingsDevice,'pad');
    click(210,310);equal(g.rebinding.action,'left');
    click(40,100);equal(g.scene,'title');equal(g.rebinding,null);
    equal(g.menuCursor,1);
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

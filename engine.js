'use strict';
(() => {
  const FG=window.FG=window.FG||{};
  const WIDTH=1280,HEIGHT=720,FPS=60,STEP_MS=1000/FPS,MAX_CATCHUP=6;
  const MAX_ROUND_SECONDS=99,INTRO_FRAMES=100,KO_WAIT=130,WIN_ROUNDS=2;
  const GRAVITY=.88,BODY_RADIUS=26,MIN_DISTANCE=49,START_GAP=430;
  const HITSTOP={light:5,medium:7,heavy:9};
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  const empty=()=>FG.InputUtils.emptyFrame();
  class Fighter {
    constructor(def,slot,x,ground){
      if(!def||!def.playable)throw Error('Character has no playable move data');
      this.def=def;this.slot=slot;this.ground=ground;this.maxHealth=def.maxHealth;
      this.roundReset(x);
    }
    roundReset(x){
      this.x=x;this.y=this.ground;this.vy=0;this.facing=this.slot===1?1:-1;
      this.health=this.maxHealth;this.state='idle';this.stun=0;
      this.attack=null;this.attackTick=0;this.attackHit=false;
      this.blocking=false;this.blockLow=false;this.crouch=false;
      this.activePose='standing';this.flash=0;this.lastHit=false;this.animClock=0;
    }
    get grounded(){return this.y>=this.ground-0.001;}
    get hurtbox(){
      const key=this.grounded?(this.crouch?'crouching':'standing'):'airborne';
      const b=this.def.hurtboxes[key];
      return {x:this.x+b.x,y:this.y+b.y,w:b.w,h:b.h};
    }
    get activeHitbox(){
      const a=this.attack;
      if(!a||this.attackHit||this.attackTick<a.startup||
        this.attackTick>=a.startup+a.active)return null;
      const start=this.facing===1?this.x+BODY_RADIUS-6:this.x-BODY_RADIUS+6-a.reach;
      return {x:start,y:this.y+a.offsetY-a.height/2,w:a.reach,h:a.height};
    }
    get recovery(){return this.attack?this.attackTick>=this.attack.startup+this.attack.active:false;}
    attemptAttack(button){
      if(this.stun>0||this.attack||!this.def.moves)return false;
      const kind=this.grounded?(this.crouch?'crouching':'standing'):'airborne';
      const move=this.def.moves[kind][button];if(!move)return false;
      this.attack={...move,button,kind};this.attackTick=0;this.attackHit=false;
      this.blocking=false;this.state='attack';this.activePose=kind;
      return true;
    }
  }
  function canGuard(defender,move){
    if(!defender.blocking||!defender.grounded)return false;
    if(move.level==='low')return defender.blockLow;
    if(move.level==='overhead')return !defender.blockLow;
    return true;
  }
  function contactDamage(defender,attacker,move,blocked){
    const raw=Math.max(1,Math.round(move.damage*attacker.def.damageMultiplier));
    // Chip damage is used only when successfully guarding a normal.
    const applied=blocked?Math.max(1,Math.ceil(raw*.06)):raw;
    defender.health=clamp(defender.health-applied,0,defender.maxHealth);
    defender.stun=blocked?move.blockstun:move.hitstun;
    defender.lastHit=!blocked;defender.blocking=blocked;
    defender.attack=null;defender.attackTick=0;
    defender.state=blocked?'blockstun':'hitstun';defender.flash=blocked?4:11;
    return applied;
  }
  class Game {
    constructor(options={}){
      this.canvas=options.canvas||null;this.ctx=this.canvas?.getContext('2d',{alpha:false})||null;
      this.assets=options.assets||new FG.AssetManager();this.assets.load();
      this.audio=options.audio||new FG.AudioSystem(this.assets);
      this.input=options.input|| (typeof window!=='undefined'?new FG.InputManager():null);
      this.cpu=new FG.BasicAI();this.sounds=true;
      this.scene='title';this.titleIndex=1;this.mode='cpu';
      this.menuItems=['online','cpu','sandbox','settings'];this.menuCursor=1;
      this.settingsPlayer=1;this.settingsDevice='keyboard';this.settingsRow=-2;
      this.rebinding=null;this.rebindDelay=0;
      this.p1Id='flash';this.p2Id='batman';this.stageId='neon-rooftop';
      this.previewPlayer=1;this.selectLocked={1:false,2:false};this.selectNavCooldown={1:0,2:0};
      this.fighters=[];this.inputHistory={1:[],2:[]};this.wins=[0,0];this.roundNumber=1;this.roundTicks=MAX_ROUND_SECONDS*FPS;
      this.phase='intro';this.intro=0;this.koFrames=0;this.hitstop=0;this.winner=0;this.matchWinner=0;
      this.pause=false;this.debug=false;this.padDebug=false;this.frame=0;
      this.shake=0;this.effects=[];this.announcement='';this.announceFrames=0;
      this.lastTime=0;this.accumulator=0;this.running=false;
      this.renderer=this.ctx&&FG.Renderer?new FG.Renderer(this.ctx,this):null;
      if(this.input){this.input.onDisconnect=(slot)=>{
        if(this.scene==='fight'&&!this.pause){this.pause=true;this.input.toast('P'+slot+' disconnected · paused');}
      };}
      this.uiHover=null;
      this.resize();
      if(this.canvas&&typeof window!=='undefined'){
        window.addEventListener('resize',()=>this.resize());
        this.canvas.addEventListener('mousemove',e=>this.onPointerMove(e));
        this.canvas.addEventListener('mouseleave',()=>this.onPointerLeave());
        this.canvas.addEventListener('click',e=>this.onPointerClick(e));
        this.running=true;requestAnimationFrame(t=>this.loop(t));
      }
    }
    resize(){
      if(!this.canvas)return;
      // Preserve 1280x720 simulation coordinates, but rasterize at the screen's
      // physical resolution. CSS size and mouse geometry stay unchanged.
      const bounds=this.canvas.getBoundingClientRect?.()||{width:WIDTH,height:HEIGHT};
      const dpr=typeof window!=='undefined'?Math.min(2,Math.max(1,window.devicePixelRatio||1)):1;
      const cssWidth=bounds.width||WIDTH,cssHeight=bounds.height||HEIGHT;
      const scale=Math.max(1,Math.min(3,Math.max(cssWidth*dpr/WIDTH,cssHeight*dpr/HEIGHT)));
      const w=Math.round(WIDTH*scale),h=Math.round(HEIGHT*scale);
      if(this.canvas.width!==w)this.canvas.width=w;
      if(this.canvas.height!==h)this.canvas.height=h;
      this.ctx?.setTransform?.(w/WIDTH,0,0,h/HEIGHT,0,0);
    }
    pointerToCanvas(event){
      if(!this.canvas)return null;
      const rect=this.canvas.getBoundingClientRect();
      if(!rect.width||!rect.height)return null;
      const x=(event.clientX-rect.left)*(WIDTH/rect.width);
      const y=(event.clientY-rect.top)*(HEIGHT/rect.height);
      return {x,y};
    }
    pointInRect(point,rect){
      return point&&rect&&point.x>=rect.x&&point.x<=rect.x+rect.w&&point.y>=rect.y&&point.y<=rect.y+rect.h;
    }
    titleHotspots(){
      // Match the real right-column drawn menu, no tiny hidden CTA hitbox.
      // A click anywhere inside a mode card invokes the existing mode flow.
      return [
        {id:'fight-tab',x:9,y:74,w:77,h:84,cursor:1},
        {id:'settings-tab',x:9,y:170,w:77,h:84,cursor:3},
        {id:'online',x:676,y:74,w:579,h:205,cursor:0},
        {id:'cpu',x:676,y:292,w:579,h:194,cursor:1},
        {id:'sandbox',x:676,y:501,w:579,h:176,cursor:2}
      ];
    }
    settingsHotspots(){
      const hotspots=[
        {id:'fight-tab',x:12,y:82,w:78,h:88},
        {id:'settings-tab',x:12,y:181,w:78,h:88},
        {id:'settings-player',x:146,y:188,w:179,h:48},
        {id:'settings-device',x:354,y:188,w:250,h:48}
      ];
      const actions=FG.InputUtils.ACTIONS;
      for(let row=0;row<actions.length+2;row++){
        const col=Math.floor(row/8),r=row%8;
        hotspots.push({id:'settings-row',row,
          x:134+col*560,y:282+r*44,w:534,h:38});
      }
      return hotspots;
    }
    // Input-only inverse hit testing for angled character cards in ui.js.
    selectPortraitHit(point){
      if(!point)return -1;
      for(let i=29;i>=0;i--){
        const side=i>=15,local=i%15,row=Math.floor(local/3),col=local%3;
        const x=side?1257-(col+1)*81-row*16:23+col*81+row*16;
        const y=9+row*127;
        const a=side?.015:-.015,b=side?-.09:.09;
        const dx=point.x-x,dy=point.y-y,det=1-a*b;
        const lx=(dx-b*dy)/det,ly=(dy-a*dx)/det;
        if(lx>=0&&lx<=80&&ly>=0&&ly<=120)return i;
      }
      return -1;
    }
    selectPortraitAt(point,player=1){
      const index=this.selectPortraitHit(point);
      if(index<0)return false;
      const id=FG.ROSTER[index],key=player===2?'p2Id':'p1Id';
      if(this[key]===id&&FG.CHARACTERS[id].playable){
        this.toggleSelectLock(player);
      }else{
        this[key]=id;this.selectLocked[player]=false;this.previewPlayer=player;
        this.audio.play('confirm',.3);
      }
      return true;
    }
    onPointerMove(event){
      const p=this.pointerToCanvas(event);
      if(!p||!this.canvas)return;
      const hotspots=this.scene==='title'?this.titleHotspots():
        this.scene==='settings'?this.settingsHotspots():[];
      const hovered=hotspots.find(h=>this.pointInRect(p,h));
      this.uiHover=hovered?hovered.id:null;
      this.uiHoverRow=hovered?.id==='settings-row'?hovered.row:null;
      const canPick=this.scene==='versus'&&this.selectPortraitHit(p)>=0;
      this.canvas.style.cursor=hovered||canPick?'pointer':'default';
    }
    onPointerLeave(){
      this.uiHover=null;this.uiHoverRow=null;
      if(this.canvas)this.canvas.style.cursor='default';
    }
    onPointerClick(event){
      const p=this.pointerToCanvas(event);
      if(!p)return;
      if(this.scene==='versus'){
        this.selectPortraitAt(p,this.mode==='sandbox'?1:event.shiftKey?2:1);
        return;
      }
      if(this.scene==='settings'){
        const spot=this.settingsHotspots().find(h=>this.pointInRect(p,h));
        if(!spot)return;
        if(spot.id==='fight-tab'){
          this.rebinding=null;this.rebindDelay=0;
          this.scene='title';this.menuCursor=1;
          this.audio.play('confirm',.3);
          return;
        }
        if(spot.id==='settings-tab')return;
        if(this.rebinding)return;
        if(spot.id==='settings-player'){
          this.settingsRow=-2;
          this.settingsPlayer=this.settingsPlayer===1?2:1;
        }else if(spot.id==='settings-device'){
          this.settingsRow=-1;
          this.settingsDevice=this.settingsDevice==='keyboard'?'pad':'keyboard';
        }else if(spot.id==='settings-row'){
          this.settingsRow=spot.row;
          const actions=FG.InputUtils.ACTIONS;
          if(spot.row<actions.length)this.beginRebind(actions[spot.row]);
          else if(spot.row===actions.length){
            this.input?.setRumble(!this.input?.rumbleEnabled);
            this.input?.toast?.('Rumble '+(this.input?.rumbleEnabled?'ON':'OFF'));
          }else{
            this.input?.resetBindings();
            this.input?.toast?.('Controls reset to defaults');
          }
        }
        this.audio.play('confirm',.2);
        return;
      }
      if(this.scene==='title'){
        for(const spot of this.titleHotspots()){
          if(!this.pointInRect(p,spot))continue;
          if(spot.id==='settings-tab'){this.menuCursor=3;this.openSettings();return;}
          if(spot.id==='fight-tab'){this.menuCursor=1;this.audio.play('confirm',.16);return;}
          if(spot.id==='online'){this.menuCursor=0;this.activateMenuItem();return;}
          if(spot.id==='cpu'){this.menuCursor=1;this.activateMenuItem();return;}
          if(spot.id==='sandbox'){this.menuCursor=2;this.activateMenuItem();return;}
        }
      }
    }
    loop(time){
      if(!this.running)return;
      if(!this.lastTime)this.lastTime=time;
      this.accumulator=Math.min(this.accumulator+Math.min(120,time-this.lastTime),STEP_MS*MAX_CATCHUP);
      this.lastTime=time;
      while(this.accumulator>=STEP_MS){this.step();this.accumulator-=STEP_MS;}
      this.render();requestAnimationFrame(t=>this.loop(t));
    }
    startMatch({p1='flash',p2='batman',stage='neon-rooftop',mode='cpu'}={}){
      const a=FG.CHARACTERS[p1],b=FG.CHARACTERS[p2],map=FG.STAGES[stage];
      if(!a?.playable||!b?.playable||!map)throw Error('Invalid fighter or stage selection');
      this.p1Id=p1;this.p2Id=p2;this.stageId=stage;this.mode=mode;
      this.fighters=[new Fighter(a,1,WIDTH/2-START_GAP/2,map.ground),
        new Fighter(b,2,WIDTH/2+START_GAP/2,map.ground)];
      this.inputHistory={1:[],2:[]};this.wins=[0,0];this.roundNumber=1;this.matchWinner=0;this.hitstop=0;
      this.cpu=new FG.BasicAI(19);this.scene='fight';this.pause=false;
      this.beginRound();
    }
    beginRound(){
      const map=FG.STAGES[this.stageId];
      this.fighters[0].roundReset(WIDTH/2-START_GAP/2);
      this.fighters[1].roundReset(WIDTH/2+START_GAP/2);
      this.fighters.forEach(f=>f.ground=map.ground);
      this.roundTicks=MAX_ROUND_SECONDS*FPS;this.phase='intro';this.intro=INTRO_FRAMES;
      this.koFrames=0;this.shake=0;this.hitstop=0;this.effects=[];
      this.announcement='ROUND '+this.roundNumber;this.announceFrames=INTRO_FRAMES;
      this.audio.play('round',.5);
    }
    finishRound(winner){
      if(this.phase==='ko'||this.phase==='matchover')return;
      this.phase='ko';this.winner=winner;this.koFrames=KO_WAIT;
      if(winner)this.wins[winner-1]++;
      this.announcement=winner?'K.O.':'DRAW';this.announceFrames=KO_WAIT;
      this.audio.play('ko',.9);this.shake=12;
      this.fighters.forEach(f=>{f.attack=null;f.blocking=false;f.state=winner&&f.slot!==winner?'hitstun':'victory';});
    }
    decideTimeout(){
      const a=this.fighters[0],b=this.fighters[1];
      const difference=a.health/a.maxHealth-b.health/b.maxHealth;
      return difference>0?1:difference<0?2:0;
    }
    advanceAfterKo(){
      if(this.wins[0]>=WIN_ROUNDS||this.wins[1]>=WIN_ROUNDS){
        this.phase='matchover';this.matchWinner=this.wins[0]>=WIN_ROUNDS?1:2;
        this.announcement='PLAYER '+this.matchWinner+' WINS';this.announceFrames=Infinity;
      }else{
        if(this.winner!==0)this.roundNumber++;
        this.beginRound();
      }
    }
    enterVersus(mode){
      this.mode=mode;this.scene='versus';this.previewPlayer=1;
      this.selectLocked={1:false,2:false};this.selectNavCooldown={1:0,2:0};
      // The on-screen footer explains joining; avoid covering the preview with a toast.
      this.audio.unlock();
    }
    openSettings(){
      this.scene='settings';this.settingsPlayer=1;this.settingsDevice='keyboard';
      this.settingsRow=-2;this.rebinding=null;this.rebindDelay=0;
      this.audio.play('confirm',.35);
    }
    activateMenuItem(){
      const item=this.menuItems[this.menuCursor];
      if(item==='settings'){this.openSettings();return;}
      if(item==='online'){
        this.input?.toast?.('1v1 Online UI added · networking is not implemented yet');
        this.audio.play('confirm',.26);return;
      }
      this.enterVersus(item==='sandbox'?'sandbox':'cpu');this.audio.play('confirm');
    }
    capturePadButton(){
      for(const pad of this.input?.rawPads||[]){
        for(let i=0;i<(pad.buttons||[]).length;i++){
          const button=pad.buttons[i];
          if(button&&(button.pressed||button.value>=0.55))return i;
        }
      }
      return null;
    }
    beginRebind(action){
      this.rebinding={player:this.settingsPlayer,device:this.settingsDevice,action};
      this.rebindDelay=12;
      this.input?.toast?.(`Press a ${this.settingsDevice==='keyboard'?'key':'controller button'} for ${action.toUpperCase()}`);
      this.audio.play('confirm',.25);
    }
    updateTitle(keys){
      const navUp=keys.has('ArrowUp')||keys.has('KeyW')||this.input?.anyPress('up');
      const navDown=keys.has('ArrowDown')||keys.has('KeyS')||this.input?.anyPress('down');
      const navLeft=keys.has('ArrowLeft')||keys.has('KeyA')||this.input?.anyPress('left');
      const navRight=keys.has('ArrowRight')||keys.has('KeyD')||this.input?.anyPress('right');
      const confirm=keys.has('Enter')||keys.has('Space')||this.input?.anyPress('power')||this.input?.anyPress('pause')||this.input?.anyPress('light');
      if(navUp){
        this.menuCursor=(this.menuCursor+this.menuItems.length-1)%this.menuItems.length;
        this.audio.play('confirm',.16);
      }
      if(navDown){
        this.menuCursor=(this.menuCursor+1)%this.menuItems.length;
        this.audio.play('confirm',.16);
      }
      if(navLeft||navRight){
        if(this.menuCursor===0||this.menuCursor===1){this.menuCursor=this.menuCursor===0?1:0;this.audio.play('confirm',.16);}
        else if(this.menuCursor===2){this.menuCursor=1;this.audio.play('confirm',.16);}
        else if(navRight){this.menuCursor=2;this.audio.play('confirm',.16);}
      }
      if(confirm)this.activateMenuItem();
    }
    updateSettings(keys){
      const actions=FG.InputUtils.ACTIONS;
      const maxRow=actions.length+1;
      const frame1=this.input?.frame(1)||empty(),frame2=this.input?.frame(2)||empty();
      const navUp=keys.has('ArrowUp')||keys.has('KeyW')||frame1.pressed.up||frame2.pressed.up;
      const navDown=keys.has('ArrowDown')||keys.has('KeyS')||frame1.pressed.down||frame2.pressed.down;
      const navLeft=keys.has('ArrowLeft')||keys.has('KeyA')||frame1.pressed.left||frame2.pressed.left;
      const navRight=keys.has('ArrowRight')||keys.has('KeyD')||frame1.pressed.right||frame2.pressed.right;
      const confirm=keys.has('Enter')||keys.has('Space')||frame1.pressed.light||frame1.pressed.power||frame2.pressed.light||frame2.pressed.power;
      const back=keys.has('Escape')||frame1.pressed.heavy||frame2.pressed.heavy||frame1.pressed.pause||frame2.pressed.pause;
      if(this.rebinding){
        if(back){this.rebinding=null;this.rebindDelay=0;this.input?.toast?.('Rebind canceled');return;}
        if(this.rebindDelay>0){this.rebindDelay--;return;}
        if(this.rebinding.device==='keyboard'){
          const candidates=[...keys].filter(code=>!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Space'].includes(code));
          if(candidates.length){
            this.input?.setBinding(this.rebinding.player,'keyboard',this.rebinding.action,candidates[0]);
            this.input?.toast?.(`P${this.rebinding.player} ${this.rebinding.action} → ${this.input.prettyKey(candidates[0])}`);
            this.audio.play('confirm',.35);this.rebinding=null;
          }
        }else{
          const button=this.capturePadButton();
          if(button!==null){
            this.input?.setBinding(this.rebinding.player,'pad',this.rebinding.action,button);
            this.input?.toast?.(`P${this.rebinding.player} ${this.rebinding.action} → button ${button}`);
            this.audio.play('confirm',.35);this.rebinding=null;
          }
        }
        return;
      }
      if(back){this.scene='title';this.audio.play('confirm',.3);return;}
      if(navUp){this.settingsRow=this.settingsRow<=-2?maxRow:this.settingsRow-1;this.audio.play('confirm',.14);}
      if(navDown){this.settingsRow=this.settingsRow>=maxRow?-2:this.settingsRow+1;this.audio.play('confirm',.14);}
      if(this.settingsRow===-2&&(navLeft||navRight)){
        this.settingsPlayer=this.settingsPlayer===1?2:1;this.audio.play('confirm',.14);
      }else if(this.settingsRow===-1&&(navLeft||navRight)){
        this.settingsDevice=this.settingsDevice==='keyboard'?'pad':'keyboard';this.audio.play('confirm',.14);
      }else if(this.settingsRow>=0&&(navLeft||navRight)){
        // Jump between the two eight-row columns without changing row position.
        this.settingsRow=(this.settingsRow+8)%16;
        this.audio.play('confirm',.14);
      }
      if(confirm){
        if(this.settingsRow>=0&&this.settingsRow<actions.length)this.beginRebind(actions[this.settingsRow]);
        else if(this.settingsRow===actions.length){
          this.input?.setRumble(!this.input?.rumbleEnabled);this.input?.toast?.(`Rumble ${this.input?.rumbleEnabled?'ON':'OFF'}`);this.audio.play('confirm',.22);
        }else if(this.settingsRow===actions.length+1){
          this.input?.resetBindings();this.input?.toast?.('Controls reset to defaults');this.audio.play('confirm',.22);
        }
      }
    }
    // 30 visual slots are arranged as a 6-column x 5-row grid, with
    // three columns on each side of the centre showcase. The right side
    // is mirrored to keep portrait navigation spatially intuitive.
    selectIndexToGrid(index){
      const side=index>=15,local=index%15;
      return {row:Math.floor(local/3),column:side?5-local%3:local%3};
    }
    selectGridToIndex(row,column){
      const r=(row+5)%5,c=(column+6)%6;
      return c<3?r*3+c:15+r*3+(5-c);
    }
    moveSelection(player,dx,dy){
      const key=player===1?'p1Id':'p2Id';
      const roster=FG.ROSTER,idx=roster.indexOf(this[key]);
      const at=this.selectIndexToGrid(Math.max(0,idx));
      this[key]=roster[this.selectGridToIndex(at.row+dy,at.column+dx)];
      this.selectLocked[player]=false;this.previewPlayer=player;
      this.audio.play('confirm',.22);
    }
    cycleCharacter(player,direction){this.moveSelection(player,direction,0);}
    toggleSelectLock(player){
      const id=player===1?this.p1Id:this.p2Id;
      if(!FG.CHARACTERS[id].playable&&this.mode!=='sandbox'){
        this.input?.toast?.(FG.CHARACTERS[id].name+' is a roster preview — coming in later phases');
        return false;
      }
      this.selectLocked[player]=!this.selectLocked[player];this.previewPlayer=player;
      this.audio.play('confirm',.55);return true;
    }
    navigateSelect(player,dx,dy){
      if(!dx&&!dy)return;
      if(this.selectNavCooldown[player]>0)return;
      this.moveSelection(player,dx,dy);
      this.selectNavCooldown[player]=10;
    }
    cycleStage(){
      const ids=Object.keys(FG.STAGES);this.stageId=ids[(ids.indexOf(this.stageId)+1)%ids.length];
    }
    step(){
      this.frame++;
      this.input?.update();
      const keys=this.input?.toggleKeys||new Set();
      if(keys.has('F3'))this.debug=!this.debug;
      if(keys.has('F4'))this.padDebug=!this.padDebug;
      if(keys.size)this.audio.unlock();
      if(this.scene==='title'){
        this.updateTitle(keys);
      } else if(this.scene==='settings'){
        this.updateSettings(keys);
      } else if(this.scene==='versus'){
        for(const p of (this.mode==='sandbox'?[1]:[1,2]))this.input?.checkKeyboardJoin(p);
        if(keys.has('Escape')||(this.input?.padFor(1)&&this.input?.frame(1).pressed.heavy)){
          this.scene='title';return;
        }
        for(const p of (this.mode==='sandbox'?[1]:[1,2])){
          const f=this.input?.frame(p)||empty();
          this.selectNavCooldown[p]=Math.max(0,this.selectNavCooldown[p]-1);
          let dx=Number(f.pressed.right)-Number(f.pressed.left);
          let dy=Number(f.pressed.down)-Number(f.pressed.up);
          // The original prototype's Z/X and comma/period cycling remain
          // available alongside full 8-way keyboard/gamepad grid movement.
          if(p===1){dx+=Number(keys.has('KeyX'))-Number(keys.has('KeyZ'));}
          else{dx+=Number(keys.has('Period'))-Number(keys.has('Comma'));}
          dx=Math.sign(dx);dy=Math.sign(dy);
          this.navigateSelect(p,dx,dy);
          if(f.pressed.light||f.pressed.power)this.toggleSelectLock(p);
        }
        if(keys.has('KeyT')||keys.has('Tab')){this.cycleStage();this.audio.play('confirm',.32);}
        // Enter on the keyboard is itself enough to reserve P1 on keyboard.
        if(keys.has('Enter')||keys.has('Space'))this.input?.markKeyboardJoin?.(1);
        const p1Joined=this.input?.keyboardJoined[1]||this.input?.padSlots[1]!==null;
        const p2Joined=this.input?.keyboardJoined[2]||this.input?.padSlots[2]!==null;
        if((keys.has('Enter')||keys.has('Space')||this.input?.anyPress('pause'))){
          const valid=Boolean(FG.CHARACTERS[this.p1Id])&&
            (this.mode==='sandbox'||(FG.CHARACTERS[this.p1Id].playable&&FG.CHARACTERS[this.p2Id].playable));
          if(!valid){this.input?.toast?.('Choose a READY fighter (Flash, Batman, Superman, Wonder Woman)');}
          else if(!p1Joined||this.mode==='versus'&&!p2Joined){
            this.input?.toast?.('P'+(!p1Joined?1:2)+' must press a key or gamepad button to join');
          }else{
            if(this.startMatch({p1:this.p1Id,
              ...(this.mode==='sandbox'?{}:{p2:this.p2Id}),
              stage:this.stageId,mode:this.mode})!==false)
              this.audio.play('confirm');
          }
        }
      } else if(this.scene==='fight'){
        if(keys.has('Escape')||this.input?.anyPress('pause')){
          this.pause=!this.pause;this.audio.play('confirm');
        }
        if(this.pause){if(keys.has('KeyQ')){this.pause=false;this.scene='title';}return;}
        this.tickFight();
      }
      if(this.announceFrames>0&&Number.isFinite(this.announceFrames))this.announceFrames--;
      for(const e of this.effects)e.life--;
      this.effects=this.effects.filter(e=>e.life>0);
      if(this.shake>0)this.shake--;
    }
    tickFight(){
      if(this.phase==='intro'){
        this.intro--;
        if(this.intro===40){this.announcement='FIGHT!';this.announceFrames=38;}
        if(this.intro<=0){this.phase='live';this.announcement='';}
        return;
      }
      if(this.phase==='ko'){
        if(--this.koFrames<=0)this.advanceAfterKo();
        return;
      }
      if(this.phase==='matchover'){
        if(this.input?.toggleKeys?.has('Enter')||this.input?.anyPress('power'))this.scene='title';
        return;
      }
      if(this.hitstop>0){this.hitstop--;return;}
      if(--this.roundTicks<=0){this.roundTicks=0;this.finishRound(this.decideTimeout());return;}
      const [a,b]=this.fighters;
      const keys1=this.input?this.input.frame(1):empty();
      const keys2=this.mode==='cpu'?this.cpu.decide(b,a,this.frame):(this.input?this.input.frame(2):empty());
      for(const [index,frame] of [[1,keys1],[2,keys2]]){
        const buttons=['left','right','up','down','light','medium','heavy','block'].filter(k=>frame.pressed[k]);
        if(buttons.length)this.inputHistory[index].unshift({buttons,at:this.frame});
        this.inputHistory[index]=this.inputHistory[index].slice(0,8);
      }
      this.updateFighter(a,keys1,b);
      this.updateFighter(b,keys2,a);
      this.separateFighters(a,b);
      // Collect before applying damage to allow two active attacks to trade.
      const contacts=[];
      for(const [attacker,defender] of [[a,b],[b,a]]){
        const box=attacker.activeHitbox;
        if(box&&overlaps(box,defender.hurtbox))contacts.push({attacker,defender,move:attacker.attack});
      }
      for(const hit of contacts){
        if(!hit.attacker.attackHit)this.resolveHit(hit.attacker,hit.defender,hit.move);
      }
      if(a.health<=0||b.health<=0){
        this.finishRound(a.health<=0&&b.health<=0?0:a.health<=0?2:1);
      }
    }
    updateFighter(f,ctrl,enemy){
      f.animClock++;if(f.flash>0)f.flash--;
      const map=FG.STAGES[this.stageId];
      if(!f.attack&&f.stun===0)f.facing=f.x<=enemy.x?1:-1;
      const away=f.facing===1?ctrl.left:ctrl.right;
      if(f.stun>0){
        f.stun--;
        if(f.stun===0)f.state='idle';
        this.applyGravity(f);return;
      }
      if(f.attack){
        f.attackTick++;
        if(f.attackTick>=f.attack.startup+f.attack.active+f.attack.recovery){
          f.attack=null;f.attackHit=false;f.state=f.grounded?'idle':'jump';
        }
        this.applyGravity(f);return;
      }
      f.crouch=Boolean(ctrl.down&&f.grounded);
      f.blocking=Boolean((ctrl.block||away)&&f.grounded&&!ctrl.up);
      f.blockLow=f.blocking&&f.crouch;
      for(const key of ['light','medium','heavy']){
        if(ctrl.pressed[key]){
          if(f.attemptAttack(key))this.audio.play('whoosh',key==='heavy'?.48:.25);
          break;
        }
      }
      if(f.attack){this.applyGravity(f);return;}
      if(ctrl.pressed.up&&f.grounded&&!f.crouch&&!f.blocking){
        f.vy=f.def.jumpVelocity;f.y+=f.vy;f.state='jump';
        this.audio.play('jump',.25);
      }
      if(f.blocking&&away&&!ctrl.block&&!f.crouch&&f.grounded){
        f.x-=f.facing*f.def.walkSpeed*.53;f.state='block';
      }else if(!f.blocking&&!f.crouch&&f.grounded){
        let dir=Number(ctrl.right)-Number(ctrl.left);
        if(dir){
          const speed=f.def.walkSpeed*(dir===f.facing?1:.79);
          f.x+=dir*speed;f.state='walk';
        }else f.state='idle';
      }else if(f.blocking)f.state='block';
      else if(f.crouch)f.state='crouch';
      if(!f.grounded)f.state='jump';
      this.applyGravity(f);
      f.x=clamp(f.x,map.walls.left+BODY_RADIUS,map.walls.right-BODY_RADIUS);
    }
    applyGravity(f){
      if(f.y<f.ground||f.vy<0){f.vy+=GRAVITY;f.y+=f.vy;
        if(f.y>=f.ground){f.y=f.ground;f.vy=0;if(f.state==='jump')f.state='idle';}
      }
    }
    separateFighters(a,b){
      const walls=FG.STAGES[this.stageId].walls;
      const diff=b.x-a.x,penetration=MIN_DISTANCE-Math.abs(diff);
      if(penetration>0){
        const sign=diff>=0?1:-1;
        a.x-=sign*penetration/2;b.x+=sign*penetration/2;
      }
      a.x=clamp(a.x,walls.left+BODY_RADIUS,walls.right-BODY_RADIUS);
      b.x=clamp(b.x,walls.left+BODY_RADIUS,walls.right-BODY_RADIUS);
    }
    resolveHit(attacker,defender,move){
      const box=attacker.activeHitbox;
      const blocked=canGuard(defender,move);
      const damage=contactDamage(defender,attacker,move,blocked);
      attacker.attackHit=true;
      const stagger=move.push*(blocked?.48:1);
      const walls=FG.STAGES[this.stageId].walls;
      defender.x=clamp(defender.x+attacker.facing*stagger,walls.left+BODY_RADIUS,walls.right-BODY_RADIUS);
      this.hitstop=HITSTOP[move.button]||5;
      this.shake=blocked?2:move.button==='heavy'?9:5;
      this.effects.push({x:(attacker.x+defender.x)/2,y:defender.y-88,
        life:blocked?8:12,total:blocked?8:12,color:blocked?'#8bdbff':'#ffcf70',damage});
      this.audio.play(blocked?'block':move.button,blocked?.42:.65);
      this.input?.rumble(attacker.slot,blocked?.12:Math.min(1,damage/125),blocked?60:100);
      this.input?.rumble(defender.slot,blocked?.1:Math.min(1,damage/160),blocked?65:110);
      return {blocked,damage,box};
    }
    render(){if(this.renderer)this.renderer.render();}
  }
  FG.Game=Game;FG.Fighter=Fighter;
  FG.EngineUtils={overlaps,canGuard,contactDamage,clamp,
    constants:{WIDTH,HEIGHT,FPS,STEP_MS,MAX_ROUND_SECONDS,INTRO_FRAMES,KO_WAIT,WIN_ROUNDS,GRAVITY}};
  if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',()=>{
    const canvas=document.getElementById('game');
    if(canvas)window.game=new Game({canvas});
  });
})();

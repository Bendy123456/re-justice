'use strict';
(() => {
  const FG=window.FG=window.FG||{};
  const DEADZONE=0.35,ANALOG_PRESS=0.55, BINDINGS_KEY='shattered-accord-input-v1';
  const RUMBLE_KEY='shattered-accord-rumble-v1';
  const ACTIONS=['left','right','up','down','light','medium','heavy','power','super','throw','block','burn','pause','reset'];
  const BUTTON_DEFAULT={light:2,medium:3,heavy:1,power:0,super:7,throw:4,block:6,burn:5,pause:9,reset:8};
  const KEY_DEFAULT={
    1:{left:'KeyA',right:'KeyD',up:'KeyW',down:'KeyS',light:'KeyJ',medium:'KeyK',heavy:'KeyL',power:'KeyH',super:'KeyO',throw:'KeyU',block:'KeyI',burn:'KeyP',pause:'Escape',reset:'Backspace'},
    2:{left:'ArrowLeft',right:'ArrowRight',up:'ArrowUp',down:'ArrowDown',light:'Numpad1',medium:'Numpad2',heavy:'Numpad3',power:'Numpad0',super:'Numpad6',throw:'Numpad4',block:'Numpad5',burn:'Numpad7',pause:'Enter',reset:'NumpadDecimal'}
  };
  const ALL_FALSE=()=>Object.fromEntries(ACTIONS.map(a=>[a,false]));
  const emptyFrame=()=>({...ALL_FALSE(),pressed:ALL_FALSE(),released:ALL_FALSE(),x:0,y:0});
  function snapStick(x,y){
    if(Math.hypot(x,y)<DEADZONE)return {x:0,y:0};
    const step=Math.round(Math.atan2(y,x)/(Math.PI/4));
    return {x:Math.round(Math.cos(step*Math.PI/4)),y:Math.round(Math.sin(step*Math.PI/4))};
  }
  function resolveSOCD(frame){
    if(frame.left&&frame.right){frame.left=false;frame.right=false;}
    if(frame.up&&frame.down){frame.up=false;frame.down=false;}
    frame.x=Number(frame.right)-Number(frame.left);
    frame.y=Number(frame.down)-Number(frame.up);
    return frame;
  }
  function padFamily(id){
    if(/xbox|microsoft|045e/i.test(id||''))return 'xbox';
    return /dualsense|dualshock|playstation|wireless controller|sony|054c/i.test(id||'')?'ps':'xbox';
  }
  function readButton(button){return Boolean(button&&(button.pressed||button.value>=ANALOG_PRESS));}
  function padFrame(pad,bindings=BUTTON_DEFAULT){
    const out=emptyFrame();
    if(!pad)return out;
    const axes=pad.axes||[];const snapped=snapStick(axes[0]||0,axes[1]||0);
    const pressed=(n)=>readButton(pad.buttons&&pad.buttons[n]);
    out.left=pressed(14)||snapped.x===-1;
    out.right=pressed(15)||snapped.x===1;
    out.up=pressed(12)||snapped.y===-1;
    out.down=pressed(13)||snapped.y===1;
    for(const name of Object.keys(BUTTON_DEFAULT))out[name]=pressed(bindings[name]);
    return resolveSOCD(out);
  }
  function normalizeBindings(raw){
    const base={keyboard:structuredClone(KEY_DEFAULT),pad:{1:{...BUTTON_DEFAULT},2:{...BUTTON_DEFAULT}}};
    if(!raw||typeof raw!=='object')return base;
    for(const device of ['keyboard','pad'])for(const player of [1,2]){
      for(const action of ACTIONS){
        const value=raw[device]?.[player]?.[action];
        if(device==='keyboard'&&typeof value==='string'&&value.length<=32)base[device][player][action]=value;
        if(device==='pad'&&Number.isInteger(value)&&value>=0&&value<=17)base[device][player][action]=value;
      }
    }
    return base;
  }
  class InputManager {
    constructor(win=window){
      this.win=win;this.keys=new Set();this.pulses=new Set();this.prev=[null,emptyFrame(),emptyFrame()];
      this.frames=[null,emptyFrame(),emptyFrame()];this.padSlots={1:null,2:null};
      this.keyboardJoined={1:false,2:false};this.padLast={};this.rawPads=[];
      this.toasts=[];this.disconnected=false;this.toggleKeys=new Set();
      try{this.rumbleEnabled=localStorage.getItem(RUMBLE_KEY)!=='false';}
      catch(_){this.rumbleEnabled=true;}
      try{this.bindings=normalizeBindings(JSON.parse(localStorage.getItem(BINDINGS_KEY)));}
      catch(_){this.bindings=normalizeBindings(null);}
      this._down=e=>{
        if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Backspace','Tab'].includes(e.code))e.preventDefault();
        if(!this.keys.has(e.code))this.pulses.add(e.code);
        this.keys.add(e.code);
      };
      this._up=e=>{this.keys.delete(e.code);};
      this._blur=()=>{this.keys.clear();this.pulses.clear();};
      this._connected=e=>this.toast((padFamily(e.gamepad.id)==='ps'?'PlayStation':'Xbox / standard')+' controller connected');
      this._disconnected=e=>this.disconnect(e.gamepad.index);
      win.addEventListener('keydown',this._down);
      win.addEventListener('keyup',this._up);
      win.addEventListener('blur',this._blur);
      win.addEventListener('gamepadconnected',this._connected);
      win.addEventListener('gamepaddisconnected',this._disconnected);
    }
    toast(message){this.toasts.push({message,frames:180});if(this.toasts.length>4)this.toasts.shift();}
    disconnect(index){
      for(const slot of [1,2])if(this.padSlots[slot]===index){
        this.padSlots[slot]=null;this.disconnected=true;
        if(this.onDisconnect)this.onDisconnect(slot);
      }
      delete this.padLast[index];this.toast('Controller disconnected · fight paused');
    }
    setBinding(player,device,action,value){
      if(![1,2].includes(player)||!['keyboard','pad'].includes(device)||!ACTIONS.includes(action))return false;
      if(device==='pad'&&(!Number.isInteger(value)||value<0||value>17))return false;
      if(device==='keyboard'&&(typeof value!=='string'||!value))return false;
      this.bindings[device][player][action]=value;this.save();return true;
    }
    resetBindings(){this.bindings=normalizeBindings(null);this.save();}
    setRumble(enabled){this.rumbleEnabled=Boolean(enabled);
      try{localStorage.setItem(RUMBLE_KEY,String(this.rumbleEnabled));}catch(_){}
    }
    save(){try{localStorage.setItem(BINDINGS_KEY,JSON.stringify(this.bindings));}catch(_){}}
    markKeyboardJoin(player){
      if(this.padSlots[player]===null)this.keyboardJoined[player]=true;
    }
    checkKeyboardJoin(player){
      const keys=Object.values(this.bindings.keyboard[player]);
      const used=keys.some(k=>this.toggleKeys.has(k));
      if(used)this.markKeyboardJoin(player);
      return used;
    }
    // This is called EXACTLY ONCE per fixed simulation tick, never in render().
    update(){
      const nav=this.win.navigator;
      const pads=nav.getGamepads?Array.from(nav.getGamepads()||[]):[];
      this.rawPads=pads.filter(Boolean);
      for(const [key,idx] of Object.entries(this.padSlots)){
        if(idx!==null&&!pads[idx])this.disconnect(idx);
      }
      for(const pad of this.rawPads){
        const previous=this.padLast[pad.index]||[];
        const buttons=(pad.buttons||[]).map(readButton);
        const firstPress=buttons.some((down,i)=>down&&!previous[i]);
        const assigned=Object.values(this.padSlots).includes(pad.index);
        if(firstPress&&!assigned){
          const slot=[1,2].find(p=>this.padSlots[p]===null&&!this.keyboardJoined[p]);
          if(slot){this.padSlots[slot]=pad.index;this.toast('Controller joined as P'+slot);
            if(this.onJoin)this.onJoin(slot,pad);
          }else this.toast('Both player slots are already in use');
        }
        this.padLast[pad.index]=buttons;
      }
      for(const player of [1,2]){
        const current=emptyFrame();
        const keys=this.bindings.keyboard[player];
        for(const action of ACTIONS){current[action]=this.keys.has(keys[action])||this.pulses.has(keys[action]);}
        const index=this.padSlots[player];
        const pad=index===null?null:pads[index];
        if(pad){
          const gp=padFrame(pad,this.bindings.pad[player]);
          for(const action of ACTIONS)current[action]=current[action]||gp[action];
        }
        resolveSOCD(current);
        const was=this.frames[player];
        for(const action of ACTIONS){
          current.pressed[action]=Boolean(current[action]&&!was[action]);
          current.released[action]=Boolean(!current[action]&&was[action]);
        }
        this.prev[player]=was;this.frames[player]=current;
      }
      this.toggleKeys=new Set(this.pulses);
      this.pulses.clear();
      for(const toast of this.toasts)toast.frames--;
      this.toasts=this.toasts.filter(t=>t.frames>0);
      return this.frames;
    }
    frame(player){return this.frames[player]||emptyFrame();}
    padFor(player){return this.rawPads.find(p=>p.index===this.padSlots[player])||null;}
    glyph(player,action){
      const pad=this.padFor(player);
      if(!pad)return this.prettyKey(this.bindings.keyboard[player][action]);
      const b=this.bindings.pad[player][action];const ps=padFamily(pad.id)==='ps';
      const symbols=ps?['✕','◯','□','△','L1','R1','L2','R2','Share','Options']:
        ['A','B','X','Y','LB','RB','LT','RT','View','Menu'];
      return symbols[b]||('B'+b);
    }
    prettyKey(code){return (code||'?').replace(/^Key/,'').replace(/^Digit/,'').replace(/^Numpad/,'Num ')
      .replace(/^Arrow/,'').replace('Escape','Esc');}
    anyPress(action){return this.frames[1].pressed[action]||this.frames[2].pressed[action];}
    // Effect support varies; failures never affect simulation.
    rumble(player,amount=.3,duration=90){
      const pad=this.padFor(player);if(!pad||!this.rumbleEnabled)return;
      try{pad.vibrationActuator?.playEffect?.('dual-rumble',{
        duration,weakMagnitude:Math.min(1,amount*.8),strongMagnitude:Math.min(1,amount)
      })?.catch?.(()=>{});}catch(_){}
    }
    destroy(){
      const w=this.win;w.removeEventListener('keydown',this._down);w.removeEventListener('keyup',this._up);
      w.removeEventListener('blur',this._blur);w.removeEventListener('gamepadconnected',this._connected);
      w.removeEventListener('gamepaddisconnected',this._disconnected);
    }
  }
  FG.InputManager=InputManager;
  FG.InputUtils={padFrame,snapStick,resolveSOCD,padFamily,emptyFrame,normalizeBindings,
    ACTIONS,BUTTON_DEFAULT,KEY_DEFAULT};
})();

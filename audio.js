'use strict';
(() => {
  const FG=window.FG=window.FG||{};
  const MASTER_VOLUME=0.25,MAX_SOUND_DURATION=0.3;
  class AudioSystem {
    constructor(assets){this.assets=assets;this.ctx=null;this.enabled=true;this.volume=MASTER_VOLUME;}
    unlock(){
      if(!this.enabled)return;
      try { const C=window.AudioContext||window.webkitAudioContext;
        if(!this.ctx&&C)this.ctx=new C();
        if(this.ctx&&this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});
      }catch(_){} 
    }
    play(name,strength=1){
      if(!this.enabled)return;
      const custom=this.assets.sound(name);
      if(custom){try{const a=custom.cloneNode();a.volume=Math.min(1,this.volume*strength*2);a.play().catch(()=>{});return;}catch(_){}}
      if(!this.ctx||this.ctx.state!=='running')return;
      const tones={light:[190,98,.085,'triangle'],medium:[145,62,.13,'sawtooth'],
        heavy:[104,44,.19,'sawtooth'],block:[550,270,.072,'square'],
        jump:[245,390,.095,'sine'],round:[450,740,.19,'sine'],
        ko:[230,66,.29,'sawtooth'],confirm:[660,880,.055,'sine'],whoosh:[410,120,.09,'triangle']};
      const [start,end,duration,type]=tones[name]||tones.light;
      try{
        const t=this.ctx.currentTime,osc=this.ctx.createOscillator(),gain=this.ctx.createGain();
        osc.type=type;osc.frequency.setValueAtTime(start,t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(1,end),t+duration);
        gain.gain.setValueAtTime(Math.max(.0001,this.volume*strength*.45),t);
        gain.gain.exponentialRampToValueAtTime(.0001,t+Math.min(duration,MAX_SOUND_DURATION));
        osc.connect(gain);gain.connect(this.ctx.destination);osc.start(t);osc.stop(t+duration+.01);
      }catch(_){}
    }
  }
  FG.AudioSystem=AudioSystem;
})();

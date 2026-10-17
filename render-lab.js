'use strict';
(() => {
  const FG=window.FG,c=document.getElementById('view'),ctx=c.getContext('2d');
  const renderer=FG.Visual3D.create();
  const actor={slot:1,def:FG.CHARACTERS.flash,x:640,y:646,facing:1,animClock:0,state:'idle',
    grounded:true,crouch:false,attack:null,attackTick:0,flash:0};
  const fake={fighters:[actor],assets:{image(){return null}},stageId:'neon-rooftop',previewScale:1.8};
  const state=document.getElementById('state'),status=document.getElementById('status');
  const fighter=document.getElementById('fighter'),spin=document.getElementById('spin'),zoom=document.getElementById('zoom');
  let running=true,overlay=false,last=0,accumulator=0;
  fighter.onchange=()=>{actor.def=FG.CHARACTERS[fighter.value];actor.animClock=0;actor.attackTick=0;};
  document.getElementById('freeze').onclick=()=>{running=!running;document.getElementById('freeze').textContent=running?'Pause':'Resume';};
  document.getElementById('boxes').onclick=()=>overlay=!overlay;
  state.onchange=()=>{actor.animClock=0;actor.attackTick=0;};
  spin.oninput=()=>renderer.lastSignature='';
  zoom.oninput=()=>renderer.lastSignature='';
  function draw(time){
    if(!last)last=time;accumulator+=Math.min(150,time-last);last=time;
    if(running){while(accumulator>=1000/60){accumulator-=1000/60;
      actor.animClock++;
      actor.state=['attack','medium','heavy'].includes(state.value)?'attack':state.value;
      actor.crouch=state.value==='crouch';actor.grounded=state.value!=='jump';
      if(['attack','medium','heavy'].includes(state.value)){
        const btn=state.value==='attack'?'light':state.value;
        const data=actor.def.moves.standing[btn];actor.attack={...data,button:btn,kind:'standing'};
        actor.attackTick=(actor.attackTick+1)%(data.startup+data.active+data.recovery);
      }else{actor.attack=null;actor.attackTick=0;}
    }}else accumulator=0;
    fake.previewScale=Number(zoom.value)/100;
    ctx.fillStyle='#111a27';ctx.fillRect(0,0,c.width,c.height);
    const gr=ctx.createLinearGradient(0,0,0,720);gr.addColorStop(0,'#1c2838');gr.addColorStop(1,'#0a101b');ctx.fillStyle=gr;ctx.fillRect(0,0,1280,720);
    ctx.fillStyle='#253348';ctx.fillRect(0,646,1280,74);
    ctx.strokeStyle='#526781';ctx.beginPath();ctx.moveTo(0,646);ctx.lineTo(1280,646);ctx.stroke();
    const ok=renderer.draw(ctx,fake);
    const m=renderer.models.get(actor.def.id+':1');if(m){m.root.rotation.y=Number(spin.value)*Math.PI/180;}
    if(!ok){ctx.fillStyle='#e8f0ff';ctx.font='20px system-ui';ctx.fillText('WebGL or Three.js unavailable: '+String(renderer.error),40,85);}
    if(overlay){
      // Diagnostic only: always the unchanged gameplay hitbox.
      const h=actor.def.hurtboxes.standing;ctx.strokeStyle='#6dffac';ctx.lineWidth=2;
      ctx.strokeRect(actor.x+h.x,actor.y+h.y,h.w,h.h);
      if(actor.attack&&actor.attackTick>=actor.attack.startup&&actor.attackTick<actor.attack.startup+actor.attack.active){
        const a=actor.attack;ctx.strokeStyle='#ff6b6b';ctx.strokeRect(actor.x+20,actor.y+a.offsetY-a.height/2,a.reach,a.height);
      }
    }
    status.textContent=ok?`${FG.HERO_VISUALS[fighter.value].name} / ${state.value} / frame ${actor.attackTick} / GPU redraws ${renderer.stats.draws}`:`Fallback: ${String(renderer.error||'WebGL unavailable')}`;
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
})();

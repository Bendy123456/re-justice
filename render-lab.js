'use strict';
(() => {
  const FG=window.FG,c=document.getElementById('view'),ctx=c.getContext('2d');
  const renderer=FG.Visual3D.create();
  const def=FG.CHARACTERS.flash;
  const actor={def,x:640,y:608,facing:1,animClock:0,state:'idle',
    grounded:true,crouch:false,attack:null,attackTick:0,flash:0};
  const fake={fighters:[actor],assets:{image(){return null}},stageId:'neon-rooftop'};
  const state=document.getElementById('state'),status=document.getElementById('status');
  let running=true,overlay=false,last=0,accumulator=0;
  document.getElementById('freeze').onclick=()=>{running=!running;document.getElementById('freeze').textContent=running?'Pause':'Resume';};
  document.getElementById('boxes').onclick=()=>overlay=!overlay;
  state.onchange=()=>{actor.animClock=0;actor.attackTick=0;};
  function draw(time){
    if(!last)last=time;accumulator+=Math.min(150,time-last);last=time;
    if(running){while(accumulator>=1000/60){accumulator-=1000/60;
      actor.animClock++;
      actor.state=state.value==='attack'?'attack':state.value;
      if(state.value==='attack'){
        const data=def.moves.standing.light;
        actor.attack={...data,button:'light',kind:'standing'};
        actor.attackTick=(actor.attackTick+1)%(data.startup+data.active+data.recovery);
      }else{actor.attack=null;actor.attackTick=0;}
      actor.x=state.value==='walk'?640+Math.sin(actor.animClock/40)*125:640;
    }}else accumulator=0;
    ctx.fillStyle='#122034';ctx.fillRect(0,0,c.width,c.height);
    ctx.fillStyle='#192a3d';ctx.fillRect(0,608,1280,112);
    ctx.strokeStyle='#6f8fa7';ctx.beginPath();ctx.moveTo(0,608);ctx.lineTo(1280,608);ctx.stroke();
    const ok=renderer.draw(ctx,fake);
    if(!ok){ctx.fillStyle='#fff';ctx.font='26px system-ui';ctx.fillText('Three.js unavailable — use the 2D game fallback',110,160);}
    if(overlay){
      const h=def.hurtboxes.standing;
      ctx.strokeStyle='#6dffac';ctx.lineWidth=2;ctx.strokeRect(actor.x+h.x,actor.y+h.y,h.w,h.h);
      if(actor.attack&&actor.attackTick>=actor.attack.startup&&actor.attackTick<actor.attack.startup+actor.attack.active){
        const a=actor.attack;ctx.strokeStyle='#ff6868';ctx.strokeRect(actor.x+20,actor.y+a.offsetY-a.height/2,a.reach,a.height);
      }
    }
    status.textContent=ok?`3D active · ${actor.state} · simulation frame ${actor.attackTick} · WebGL renders ${renderer.stats.draws}`:
      `Using fallback. ${String(renderer.error||'Three.js library could not load or WebGL is unavailable')}`;
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
})();

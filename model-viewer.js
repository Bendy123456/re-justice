'use strict';
(() => {
  const canvas=document.getElementById('viewer'),ctx=canvas.getContext('2d');
  const rig=window.FG.FighterRig,defs=window.FG.CHARACTERS;
  const fighter=document.getElementById('fighter'),motion=document.getElementById('motion');
  const frameInput=document.getElementById('frame'),frameText=document.getElementById('frameText');
  const play=document.getElementById('play'),skeleton=document.getElementById('skeleton');
  const hitboxes=document.getElementById('hitboxes'),variant=document.getElementById('variant');
  const flip=document.getElementById('flip'),metric=document.getElementById('metric');
  const CHARACTERS=['flash','batman','superman','wonder-woman'];
  CHARACTERS.forEach(id=>fighter.add(new Option(defs[id].name,id)));
  rig.ANIMATIONS.forEach(k=>motion.add(new Option(k.replaceAll('_',' ').toUpperCase(),k)));
  let animating=true,frame=0,last=0;
  const attackName=()=>motion.value.match(/^(standing|crouching|airborne)_(light|medium|heavy)$/);
  function moveData(){
    const match=attackName();
    return match?defs[fighter.value].moves?.[match[1]]?.[match[2]]||null:null;
  }
  function maxFrames(){const m=moveData();return m?m.startup+m.active+m.recovery-1:120;}
  function updateSlider(){frameInput.max=maxFrames();frame=Math.min(frame,Number(frameInput.max));frameInput.value=frame;frameText.textContent=Math.floor(frame)+' / '+frameInput.max;}
  fighter.onchange=()=>{frame=0;updateSlider();};motion.onchange=()=>{frame=0;updateSlider();};
  frameInput.oninput=()=>{frame=Number(frameInput.value);animating=false;play.textContent='Play Animation';updateSlider();};
  play.onclick=()=>{animating=!animating;play.textContent=animating?'Pause Animation':'Play Animation';};
  function draw(time){
    if(!last)last=time;const delta=Math.min(.08,(time-last)/1000);last=time;
    if(animating){frame+=delta*60;const mx=maxFrames()+1;if(frame>=mx)frame%=mx;}
    updateSlider();
    ctx.fillStyle='#101b29';ctx.fillRect(0,0,1280,720);
    const grad=ctx.createRadialGradient(640,295,70,640,350,530);
    grad.addColorStop(0,'#253a51');grad.addColorStop(1,'#101b29');ctx.fillStyle=grad;ctx.fillRect(0,0,1280,720);
    ctx.strokeStyle='rgba(139,190,218,.1)';ctx.lineWidth=1;
    for(let i=0;i<15;i++){ctx.beginPath();ctx.moveTo(i*90,0);ctx.lineTo(i*90,720);ctx.stroke();}
    const def=defs[fighter.value],attack=moveData();
    rig.draw(ctx,def,640,650,2.6,frame,motion.value,{facing:flip.checked?-1:1,
      skeleton:skeleton.checked,hitboxes:hitboxes.checked,attack,
      debug:skeleton.checked,healthRatio:1,variant:Number(variant.value),shadow:true});
    ctx.fillStyle='#dff3fc';ctx.font='800 36px Segoe UI,Arial';ctx.fillText(def.name.toUpperCase(),56,75);
    ctx.font='600 18px Segoe UI,Arial';ctx.fillStyle='#9dbed1';ctx.fillText(motion.value.toUpperCase().replaceAll('_',' '),56,109);
    ctx.fillStyle='#66c1e1';ctx.fillRect(0,665,1280,2);
    if(attack){
      const total=attack.startup+attack.active+attack.recovery;
      metric.textContent=`STARTUP ${attack.startup}f   ACTIVE ${attack.active}f   RECOVERY ${attack.recovery}f\nTOTAL ${total}f   HITBOX ${attack.reach}×${attack.height}\nAnimation uses the existing character frame data.`;
    }else metric.textContent=`FRAME ${Math.floor(frame)}  ·  ${motion.value.toUpperCase()}\nSkeleton and hitbox overlays are viewer-only.`;
    requestAnimationFrame(draw);
  }
  updateSlider();requestAnimationFrame(draw);
})();

'use strict';
(() => {
  const FG=window.FG=window.FG||{};
  const CW=1280,CH=720,LINE='#d1e8f1';
  const DARK='#050b14',GOLD='#f6c278',BLUE='#88d5ed';
  function rounded(ctx,x,y,w,h,r=12){
    r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.roundRect(x,y,w,h,r);
  }
  function gradient(ctx,x,y,w,h,a,b){const g=ctx.createLinearGradient(x,y,x,y+h);g.addColorStop(0,a);g.addColorStop(1,b);return g;}
  function label(ctx,text,x,y,size=20,color='#fff',align='left',weight='900'){
    ctx.textAlign=align;ctx.textBaseline='alphabetic';ctx.fillStyle=color;
    ctx.font=`${weight} ${size}px "Segoe UI", Arial, sans-serif`;
    ctx.fillText(text,x,y);
  }
  function panel(ctx,x,y,w,h,opacity=.68){
    rounded(ctx,x,y,w,h,13);ctx.fillStyle=`rgba(7,17,29,${opacity})`;ctx.fill();
    ctx.strokeStyle='rgba(166,210,229,.14)';ctx.lineWidth=1;ctx.stroke();
  }
  function line(ctx,a,b,c,d,color,width=2){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(a,b);ctx.lineTo(c,d);ctx.stroke();}
  function centerBar(ctx,x,y,w,h,value,max,mirror,color){
    ctx.fillStyle='#192534';ctx.fillRect(x,y,w,h);
    ctx.fillStyle='#384552';ctx.fillRect(x+2,y+2,w-4,h-4);
    ctx.fillStyle=color;const amount=(w-4)*Math.max(0,Math.min(1,value/max));
    ctx.fillRect(mirror?x+w-2-amount:x+2,y+2,amount,h-4);
    ctx.strokeStyle='#e2d8b9';ctx.lineWidth=2;ctx.strokeRect(x,y,w,h);
  }
  function drawStar(ctx,x,y,r,t,fill){
    ctx.save();ctx.translate(x,y);ctx.rotate(t);ctx.beginPath();
    for(let i=0;i<8;i++){const angle=(i/8)*Math.PI*2;
      const radial=i%2===0?r:r*.24;const xx=Math.cos(angle)*radial,yy=Math.sin(angle)*radial;
      if(i===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy);
    }ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.restore();
  }
  function figure(ctx, f, x=f.x, feet=f.y, size=1,opacity=1,assets=null){
    const ch=f.def;ctx.save();ctx.translate(x,feet);ctx.scale(size*(f.facing||1),size);
    ctx.globalAlpha*=opacity;
    const art=assets?.image('characters',ch.id);
    if(art){
      const cfg=assets.config.characters[ch.id]||{};
      const fw=cfg.frameWidth||art.naturalWidth,fh=cfg.frameHeight||art.naturalHeight;
      const columns=Math.max(1,cfg.columns||Math.floor(art.naturalWidth/fw));
      const stateKey=f.attack?'attack':f.state;
      const row=cfg.rows?.[stateKey]??cfg.rows?.idle??0;
      const count=Math.max(1,cfg.frames?.[stateKey]||cfg.frames?.idle||1);
      const tick=f.attack?f.attackTick:f.animClock;
      const frame=Math.floor(tick/(cfg.ticksPerFrame||6))%Math.min(count,columns);
      ctx.drawImage(art,frame*fw,row*fh,fw,fh,-fw/2,-fh,fw,fh);
      ctx.restore();return;
    }
    // Preserve sprite-sheet priority; render the 2D skeletal model otherwise.
    ctx.restore();
    if(FG.FighterRig?.drawFighter?.(ctx,f,x,feet,size,opacity))return;
    ctx.save();ctx.translate(x,feet);ctx.scale(size*(f.facing||1),size);
    ctx.globalAlpha*=opacity;
    const state=f.state,phase=f.attack?
      f.attackTick<f.attack.startup?'windup':f.attackTick<f.attack.startup+f.attack.active?'extend':'return':'none';
    const idle=Math.sin(f.animClock*.12)*2,walk=state==='walk'?Math.sin(f.animClock*.28):0;
    const crouch=(f.crouch||state==='crouch')?34:0;
    const bend=state==='jump'?14:state==='hitstun'?-8:0;
    const torsoTop=-112+crouch+bend+idle,hipY=-54+crouch*.58;
    const headY=torsoTop-17;
    const primary=ch.main,secondary=ch.secondary;
    // Shadow on the floor.
    ctx.save();ctx.globalAlpha*=f.grounded?.26:.11;ctx.fillStyle='#020408';
    ctx.beginPath();ctx.ellipse(0,4,42,10,0,0,Math.PI*2);ctx.fill();ctx.restore();
    // Capes flow behind the silhouette and remain original vector placeholders.
    if(ch.cape){
      const flutter=Math.sin(f.animClock*.08)*6+(state==='walk'?12:0);
      ctx.fillStyle=ch.id==='batman'?'#111826':'#a81d2b';ctx.strokeStyle='#070d15';ctx.lineWidth=5;
      ctx.beginPath();ctx.moveTo(-16,torsoTop+6);ctx.lineTo(-39+flutter,-93);
      ctx.quadraticCurveTo(-49+flutter,-32,-56+flutter,1);
      ctx.quadraticCurveTo(-12,-15,18,torsoTop+12);ctx.closePath();ctx.fill();ctx.stroke();
    }
    function bone(ax,ay,bx,by,width,fill,trim){
      ctx.strokeStyle='#09111a';ctx.lineCap='round';ctx.lineJoin='round';
      ctx.lineWidth=width+5;ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();
      ctx.strokeStyle=fill;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();
      if(trim){ctx.strokeStyle=trim;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(bx-width*.22,by);ctx.lineTo(bx+width*.2,by-2);ctx.stroke();}
    }
    // Legs: silhouette-aware jump/crouch/walk poses.
    const jumping=!f.grounded;
    const kneeAX=-17+walk*12,kneeBX=17-walk*12;
    const legY=jumping?-15:crouch? -8:-25;
    bone(-13,hipY,kneeAX,legY,19,'#182635',secondary);
    bone(13,hipY,kneeBX,legY,19,'#203546',secondary);
    bone(kneeAX,legY,kneeAX+(jumping?-18:walk*15),jumping?-12:0,17,primary,secondary);
    bone(kneeBX,legY,kneeBX+(jumping?17:-walk*15),jumping?-13:0,17,primary,secondary);
    // Faceted torso, readable even when fighters overlap.
    ctx.lineWidth=5;ctx.strokeStyle='#08121a';ctx.fillStyle=primary;
    ctx.beginPath();ctx.moveTo(-29,torsoTop+10);ctx.lineTo(-21,hipY);
    ctx.lineTo(20,hipY);ctx.lineTo(30,torsoTop+10);ctx.lineTo(0,torsoTop-8);
    ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.17)';ctx.beginPath();ctx.moveTo(-23,torsoTop+9);
    ctx.lineTo(-2,torsoTop-1);ctx.lineTo(-4,hipY+9);ctx.lineTo(-21,hipY);ctx.closePath();ctx.fill();
    // Belt and emblem are graphic placeholders, not copyrighted assets.
    ctx.fillStyle=secondary;ctx.fillRect(-23,hipY-3,46,9);
    ctx.save();ctx.translate(0,torsoTop+30);ctx.fillStyle=secondary;
    if(ch.id==='flash'){drawStar(ctx,0,0,15,-Math.PI/8,secondary);}
    else if(ch.id==='batman'){ctx.beginPath();ctx.ellipse(0,0,17,7,0,0,Math.PI*2);ctx.fill();}
    else if(ch.id==='superman'){ctx.beginPath();ctx.moveTo(-17,-9);ctx.lineTo(16,-9);ctx.lineTo(12,8);ctx.lineTo(0,17);ctx.lineTo(-12,8);ctx.closePath();ctx.fill();}
    else{ctx.beginPath();ctx.moveTo(-14,-10);ctx.lineTo(14,-10);ctx.lineTo(10,5);ctx.lineTo(0,12);ctx.lineTo(-10,5);ctx.closePath();ctx.fill();}
    ctx.restore();
    // Guarding hand stays up during punches; striking arm loads backward and extends.
    const shoulderY=torsoTop+12,guardX=-20,guardY=shoulderY+9;
    const guardElbowX=-27,guardElbowY=shoulderY+26,guardFistX=-13,guardFistY=shoulderY-15;
    bone(guardX,guardY,guardElbowX,guardElbowY,16,primary);
    bone(guardElbowX,guardElbowY,guardFistX,guardFistY,13,primary,secondary);
    const attack=f.attack!==null;
    let strikeElbowX=27,strikeElbowY=shoulderY+27,strikeFistX=17,strikeFistY=shoulderY-8;
    if(state==='block'){strikeElbowX=22;strikeElbowY=shoulderY+14;strikeFistX=7;strikeFistY=shoulderY-26;}
    if(state==='hitstun'){strikeElbowX=47;strikeElbowY=shoulderY+28;strikeFistX=59;strikeFistY=shoulderY+39;}
    if(state==='victory'){strikeElbowX=27;strikeElbowY=shoulderY-26;strikeFistX=27;strikeFistY=shoulderY-73;}
    if(attack){
      const isLow=f.attack.kind==='crouching';
      const h=isLow?shoulderY+61:shoulderY-4;
      if(phase==='windup'){strikeElbowX=14;strikeElbowY=shoulderY+33;strikeFistX=-16;strikeFistY=h-7;}
      if(phase==='extend'){
        const mult=f.attack.button==='heavy'?1.43:f.attack.button==='medium'?1.26:1;
        strikeElbowX=43*mult;strikeElbowY=h;strikeFistX=77*mult;strikeFistY=h;
        // Short non-persistent motion trail.
        ctx.save();ctx.strokeStyle=ch.glow;ctx.globalAlpha*=.43;ctx.lineWidth=22;
        ctx.beginPath();ctx.moveTo(35,h);ctx.lineTo(strikeFistX+18,h);ctx.stroke();ctx.restore();
      }
      if(phase==='return'){strikeElbowX=49;strikeElbowY=h+14;strikeFistX=42;strikeFistY=h-14;}
    }
    bone(21,shoulderY+5,strikeElbowX,strikeElbowY,18,primary);
    bone(strikeElbowX,strikeElbowY,strikeFistX,strikeFistY,14,primary,secondary);
    // Collar and neck stop the head looking detached.
    ctx.strokeStyle='#09111a';ctx.lineWidth=16;ctx.beginPath();ctx.moveTo(0,torsoTop+2);ctx.lineTo(0,headY+16);ctx.stroke();
    ctx.strokeStyle=ch.skin;ctx.lineWidth=10;ctx.beginPath();ctx.moveTo(0,torsoTop+2);ctx.lineTo(0,headY+16);ctx.stroke();
    // Helmet / face, frontal-lit cheek and dark visor / eyes.
    ctx.fillStyle=ch.headgear==='hair'?ch.skin:primary;ctx.strokeStyle='#07111b';ctx.lineWidth=4;
    ctx.beginPath();ctx.ellipse(0,headY,22,27,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle=ch.skin;ctx.beginPath();ctx.ellipse(4,headY+10,16,11,-.2,0,Math.PI*2);ctx.fill();
    if(ch.headgear==='ears'){
      ctx.fillStyle=primary;ctx.strokeStyle='#07111b';ctx.lineWidth=3;
      ctx.beginPath();ctx.moveTo(-20,headY-13);ctx.lineTo(-19,headY-43);
      ctx.lineTo(-7,headY-25);ctx.lineTo(10,headY-25);ctx.lineTo(19,headY-43);
      ctx.lineTo(21,headY-13);ctx.closePath();ctx.fill();ctx.stroke();
    }
    if(ch.headgear==='wings'){
      ctx.fillStyle=secondary;for(const side of [-1,1]){
        ctx.beginPath();ctx.moveTo(side*16,headY-9);ctx.lineTo(side*31,headY-27);
        ctx.lineTo(side*22,headY-23);ctx.lineTo(side*29,headY-34);
        ctx.lineTo(side*11,headY-19);ctx.closePath();ctx.fill();
      }
    }
    if(ch.headgear==='hair'){
      ctx.fillStyle='#101b2a';ctx.beginPath();ctx.moveTo(-20,headY-6);
      ctx.lineTo(-23,headY-22);ctx.lineTo(-10,headY-30);ctx.lineTo(19,headY-22);
      ctx.lineTo(19,headY-6);ctx.lineTo(4,headY-15);ctx.closePath();ctx.fill();
    }
    if(ch.headgear==='tiara'){
      ctx.fillStyle=secondary;ctx.beginPath();ctx.moveTo(-19,headY-17);ctx.lineTo(0,headY-31);
      ctx.lineTo(20,headY-17);ctx.lineTo(0,headY-20);ctx.closePath();ctx.fill();
    }
    ctx.fillStyle='#e8faff';ctx.fillRect(-14,headY-5,11,4);ctx.fillRect(7,headY-5,10,4);
    if(f.flash>0&&f.flash%3!==0){ctx.globalCompositeOperation='screen';ctx.fillStyle='rgba(255,255,255,.38)';
      ctx.fillRect(-30,headY-37,65,headY*-1+45);}
    ctx.restore();
  }
  // Geometry shared by rendering and the editable character-select flow.
  // Mirror the outer portrait banks around the large 3D-style showcase.
  const SELECT_COLUMNS=3,SELECT_SIDE_COUNT=15,SELECT_CARD_W=80,SELECT_CARD_H=120;
  function selectCardRect(index){
    const side=index>=SELECT_SIDE_COUNT,local=index%SELECT_SIDE_COUNT;
    const row=Math.floor(local/SELECT_COLUMNS),col=local%SELECT_COLUMNS;
    return {x:side?1257-(col+1)*81-row*16:23+col*81+row*16,
      y:9+row*127,w:SELECT_CARD_W,h:SELECT_CARD_H,side,row,col};
  }
  function rgba(hex,alpha){
    const c=hex.replace('#','');if(c.length!==6)return `rgba(200,200,200,${alpha})`;
    return `rgba(${parseInt(c.slice(0,2),16)},${parseInt(c.slice(2,4),16)},${parseInt(c.slice(4,6),16)},${alpha})`;
  }
  function fogDisc(c,x,y,r,color){
    const g=c.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,color);g.addColorStop(1,'rgba(0,0,0,0)');
    c.fillStyle=g;c.fillRect(x-r,y-r,2*r,2*r);
  }
  function selectBackground(c){
    const bg=c.createLinearGradient(0,0,0,CH);
    bg.addColorStop(0,'#292b34');bg.addColorStop(.45,'#20222a');bg.addColorStop(.76,'#10141c');bg.addColorStop(1,'#05070c');
    c.fillStyle=bg;c.fillRect(0,0,CW,CH);
    const beam=c.createRadialGradient(640,126,2,640,285,590);
    beam.addColorStop(0,'rgba(191,198,204,.35)');beam.addColorStop(.44,'rgba(138,149,163,.13)');
    beam.addColorStop(1,'rgba(4,8,16,0)');c.fillStyle=beam;c.fillRect(0,0,CW,CH);
    // Seeded, cached fog and shale silhouettes create the reference's
    // smoky charcoal atmosphere without shipping any proprietary artwork.
    let seed=20231020;
    const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<95;i++){
      const x=random()*CW,y=random()*570,r=35+random()*185;
      fogDisc(c,x,y,r,`rgba(${92+Math.floor(random()*35)},${94+Math.floor(random()*36)},${105+Math.floor(random()*38)},${.016+random()*.049})`);
    }
    for(let layer=0;layer<4;layer++){
      c.fillStyle=['#20232a','#191d25','#10141b','#0a0e13'][layer];
      c.globalAlpha=[.28,.43,.58,.76][layer];
      c.beginPath();c.moveTo(0,440+layer*55);
      for(let x=0;x<=CW;x+=18){
        const ridge=Math.sin(x*.012+layer*4)*24+Math.sin(x*.042+layer*2)*12+(random()-.5)*27;
        c.lineTo(x,405+layer*58+ridge);
      }
      c.lineTo(CW,CH);c.lineTo(0,CH);c.closePath();c.fill();
    }
    c.globalAlpha=1;
    // Hazy crowd/ruin silhouettes close to the horizon.
    for(let i=0;i<95;i++){
      const x=random()*CW,y=490+random()*123,scale=.45+random()*1.1;
      c.fillStyle=`rgba(5,7,12,${.06+random()*.18})`;
      c.beginPath();c.arc(x,y,3.4*scale,0,Math.PI*2);c.fill();
      c.fillRect(x-2.5*scale,y,5*scale,13*scale);
    }
    const corner=c.createRadialGradient(640,255,200,640,320,820);
    corner.addColorStop(0,'rgba(0,0,0,0)');corner.addColorStop(.7,'rgba(1,2,6,.32)');
    corner.addColorStop(1,'rgba(0,0,0,.92)');c.fillStyle=corner;c.fillRect(0,0,CW,CH);
  }
  function drawPortrait(c,def,asset){
    const w=96,h=144;
    if(asset){
      const s=Math.max(w/asset.naturalWidth,h/asset.naturalHeight);
      c.drawImage(asset,(w-asset.naturalWidth*s)/2,(h-asset.naturalHeight*s)/2,asset.naturalWidth*s,asset.naturalHeight*s);
      return;
    }
    const color=def.main,trim=def.secondary,skin=def.skin,gear=def.headgear;
    const bg=c.createLinearGradient(0,0,w,h);
    bg.addColorStop(0,'#33363f');bg.addColorStop(.52,'#252a32');bg.addColorStop(1,'#090f18');
    c.fillStyle=bg;c.fillRect(0,0,w,h);
    fogDisc(c,67,50,91,rgba(trim,.24));
    c.save();c.translate(48,0);
    const torso=c.createLinearGradient(-43,76,43,137);
    torso.addColorStop(0,'#0a101a');torso.addColorStop(.25,color);torso.addColorStop(.56,color);torso.addColorStop(1,'#11141d');
    c.fillStyle='#05080e';c.beginPath();c.moveTo(-42,144);c.lineTo(-43,101);
    c.quadraticCurveTo(-43,80,-20,75);c.lineTo(19,75);
    c.quadraticCurveTo(43,79,45,105);c.lineTo(48,144);c.fill();
    c.fillStyle=torso;c.beginPath();c.moveTo(-42,144);c.lineTo(-37,106);
    c.quadraticCurveTo(-35,87,-21,85);c.lineTo(20,85);c.quadraticCurveTo(38,85,40,105);
    c.lineTo(46,144);c.closePath();c.fill();
    c.fillStyle=rgba(trim,.62);c.beginPath();c.moveTo(-26,86);c.lineTo(-9,103);c.lineTo(12,103);
    c.lineTo(28,86);c.lineTo(16,91);c.lineTo(0,111);c.lineTo(-16,91);c.fill();
    c.strokeStyle='rgba(247,251,255,.21)';c.lineWidth=2;c.beginPath();c.moveTo(-29,104);c.lineTo(-15,138);
    c.moveTo(28,103);c.lineTo(13,137);c.stroke();
    // Face shape with ambient occlusion, directional light and glints.
    const face=c.createLinearGradient(-19,14,25,62);
    face.addColorStop(0,'#f1d7ba');face.addColorStop(.38,skin);face.addColorStop(1,'#4f4550');
    c.fillStyle='#0a1019';c.beginPath();c.ellipse(0,51,24,34,0,0,Math.PI*2);c.fill();
    c.fillStyle=face;c.beginPath();c.ellipse(0,48,19,29,0,0,Math.PI*2);c.fill();
    c.fillStyle='rgba(7,8,12,.14)';c.fillRect(0,54,16,19);
    c.strokeStyle='rgba(10,9,15,.58)';c.lineWidth=2;c.beginPath();c.moveTo(-12,48);c.lineTo(-3,46);
    c.moveTo(4,46);c.lineTo(14,48);c.moveTo(-7,68);c.quadraticCurveTo(1,71,9,67);c.stroke();
    const fullMask=['mask','helm','visor','ears','wings','tiara','hood','hat'].includes(gear);
    if(fullMask){
      c.fillStyle=color;c.beginPath();c.moveTo(-23,53);c.lineTo(-23,31);
      c.quadraticCurveTo(-22,8,0,11);c.quadraticCurveTo(22,10,24,31);
      c.lineTo(24,54);c.lineTo(15,40);c.lineTo(-17,40);c.closePath();c.fill();
      c.fillStyle=rgba(trim,.48);c.fillRect(-19,37,38,4);
      if(gear==='hood'){c.fillStyle='#141820';c.beginPath();c.arc(0,30,27,Math.PI,Math.PI*2);c.lineTo(22,75);c.lineTo(18,49);c.quadraticCurveTo(0,3,-19,49);c.lineTo(-23,75);c.closePath();c.fill();}
      if(gear==='ears'){c.fillStyle=color;c.beginPath();c.moveTo(-22,26);c.lineTo(-23,0);c.lineTo(-11,14);c.lineTo(10,14);c.lineTo(22,0);c.lineTo(23,28);c.fill();}
      if(gear==='wings'){c.fillStyle=trim;for(const side of [-1,1]){c.beginPath();c.moveTo(side*19,29);c.lineTo(side*35,9);c.lineTo(side*25,13);c.lineTo(side*31,0);c.lineTo(side*12,17);c.fill();}}
      if(gear==='tiara'){c.fillStyle=trim;c.beginPath();c.moveTo(-20,23);c.lineTo(0,7);c.lineTo(20,23);c.lineTo(0,17);c.fill();}
      if(gear==='hat'){c.fillStyle='#11151a';c.fillRect(-27,15,54,9);c.fillRect(-17,-4,34,24);c.fillStyle='#e7e0d6';c.fillRect(-17,15,34,4);}
      if(gear==='spikes'){c.fillStyle=trim;for(let n=-2;n<=2;n++){c.beginPath();c.moveTo(n*9-4,24);c.lineTo(n*10,0-Math.abs(n)*4);c.lineTo(n*9+6,25);c.fill();}}
    }else if(gear==='hair'||gear==='pigtails'){
      c.fillStyle=def.id==='joker'?'#435c3b':def.id==='killer-frost'?'#dceff5':def.id==='lobo'?'#14141b':def.id==='solomon-grundy'?'#b1b2ae':'#151a21';
      c.beginPath();c.moveTo(-21,39);c.lineTo(-22,19);c.quadraticCurveTo(0,1,20,21);
      c.lineTo(21,42);c.lineTo(14,25);c.lineTo(-15,28);c.closePath();c.fill();
      if(gear==='pigtails'){c.fillStyle='#9e2f48';c.beginPath();c.ellipse(-29,53,10,23,-.4,0,Math.PI*2);c.ellipse(29,53,10,23,.4,0,Math.PI*2);c.fill();}
    }
    if(gear==='bald'){c.fillStyle=rgba(trim,.34);c.beginPath();c.ellipse(0,21,18,6,0,0,Math.PI*2);c.fill();}
    if(gear==='mask'||gear==='visor'||gear==='ears'){
      c.fillStyle='rgba(170,237,255,.85)';c.fillRect(-14,42,10,4);c.fillRect(5,42,10,4);
    } else {c.fillStyle='#17151d';c.fillRect(-12,46,8,2);c.fillRect(5,46,8,2);}
    c.restore();
    c.fillStyle='rgba(0,0,0,.19)';c.fillRect(0,0,5,h);
    const shade=c.createLinearGradient(0,0,0,h);shade.addColorStop(0,'rgba(0,0,0,0)');shade.addColorStop(1,'rgba(0,0,0,.49)');
    c.fillStyle=shade;c.fillRect(0,0,w,h);
  }
  function armoredHero(c,d,frame){
    // Hand-drawn articulated 2.5D showcase: directional shading, layered
    // costume facets, breathing, cape flutter and feet lost in mist.
    const t=frame/60,sway=Math.sin(t*1.6)*1.8,cl=d.main,accent=d.secondary;
    c.save();c.translate(640+sway,626);c.scale(2.62,2.62);
    const poly=(points,fill,stroke=null,lw=1)=>{c.beginPath();points.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke();}};
    const armor=(points,a,b)=>{const g=c.createLinearGradient(-47,-130,58,-50);g.addColorStop(0,a);g.addColorStop(.54,b);g.addColorStop(1,'#0e1119');poly(points,g,'rgba(5,8,13,.88)',1.35);};
    c.save();c.globalAlpha=.58;fogDisc(c,0,-62,114,rgba(accent,.22));c.restore();
    if(d.cape){
      c.fillStyle=rgba(d.id==='batman'?'#111823':d.id==='raven'?'#352743':'#9f2733',.95);
      poly([[-33,-159],[-54,-140],[-69,-85],[-76,-15],[-38,-31],[-21,-79],[24,-76],[39,-4],[63,-19],[47,-119],[24,-157]],c.fillStyle,'#0b1019',1);
      c.strokeStyle=rgba(accent,.21);c.lineWidth=2;c.beginPath();c.moveTo(-34,-152);c.quadraticCurveTo(-68,-45,-49,-23);c.stroke();
    }
    // Boots and legs with raised knee/greave facets.
    armor([[-30,-75],[-2,-76],[-2,-35],[-7,-6],[-32,-3],[-37,-33]],'#20232d',cl);
    armor([[2,-76],[29,-75],[35,-39],[32,-3],[8,-5],[2,-35]],cl,'#252933');
    armor([[-33,-39],[-8,-38],[-9,0],[-35,0]],cl,'#1d2735');
    armor([[9,-39],[35,-38],[36,0],[10,0]],'#1c2734',cl);
    poly([[-35,-8],[-10,-8],[-8,2],[-43,2],[-42,-5]],'#151b24','#06090f',1);
    poly([[10,-8],[35,-8],[43,2],[7,2]],'#151b24','#06090f',1);
    c.strokeStyle=rgba(accent,.6);c.lineWidth=1.6;c.beginPath();c.moveTo(-33,-21);c.lineTo(-11,-23);c.moveTo(12,-23);c.lineTo(33,-20);c.stroke();
    // Wide shoulders and a raised, metallic upper torso.
    armor([[-35,-155],[-16,-161],[16,-161],[39,-151],[31,-85],[25,-73],[-25,-73],[-36,-98]],cl,'#28323f');
    poly([[-39,-148],[-29,-166],[-12,-158],[-24,-137],[-42,-126]],'#222b36','#060b12',1);
    poly([[39,-148],[29,-166],[12,-158],[24,-137],[42,-126]],'#1b2734','#060b12',1);
    const chest=c.createLinearGradient(-27,-147,29,-100);chest.addColorStop(0,rgba(accent,.5));chest.addColorStop(.43,'rgba(248,246,229,.13)');chest.addColorStop(1,'rgba(3,8,15,.5)');
    poly([[-27,-145],[0,-138],[27,-145],[20,-102],[0,-94],[-20,-102]],chest);
    c.strokeStyle=rgba(accent,.6);c.lineWidth=2;c.beginPath();c.moveTo(-29,-122);c.lineTo(-15,-132);c.moveTo(14,-132);c.lineTo(28,-122);c.stroke();
    poly([[-26,-82],[25,-82],[22,-74],[-24,-74]],accent,'#11141d',1);
    poly([[-6,-78],[6,-78],[5,-70],[-5,-70]],'#d6c4a0','#1a1c22',.8);
    // Shoulder armor, bent braced fists with dramatic silhouette.
    const arm=(side)=>{
      c.save();c.scale(side,1);
      armor([[31,-151],[43,-145],[51,-115],[37,-105],[25,-132]],cl,'#182534');
      armor([[48,-113],[58,-102],[66,-76],[52,-68],[37,-103]],cl,'#2c3643');
      poly([[51,-78],[67,-78],[70,-65],[63,-57],[54,-59],[49,-67]],d.skin,'#0d1016',1);
      c.strokeStyle=rgba(accent,.66);c.lineWidth=1.4;c.beginPath();c.moveTo(40,-141);c.lineTo(47,-116);c.moveTo(52,-95);c.lineTo(60,-78);c.stroke();
      c.restore();
    };
    arm(-1);arm(1);
    // Neck, cheeks, cowl/helm/hood and eyes.
    poly([[-12,-164],[12,-164],[11,-148],[-11,-148]],d.skin,'#12141a',1.4);
    const head=c.createLinearGradient(-20,-202,23,-160);head.addColorStop(0,'#f1d9b9');head.addColorStop(.48,d.skin);head.addColorStop(1,'#65575a');
    c.fillStyle=head;c.strokeStyle='#10131b';c.lineWidth=1.5;c.beginPath();c.ellipse(0,-178,19,27,0,0,Math.PI*2);c.fill();c.stroke();
    c.fillStyle='rgba(0,0,0,.22)';c.beginPath();c.ellipse(10,-174,8,19,-.12,0,Math.PI*2);c.fill();
    if(['hood','helm','ears','wings','mask','visor','tiara','hat','spikes'].includes(d.headgear)){
      c.fillStyle=d.id==='raven'?'#252130':cl;
      poly([[-19,-184],[-18,-203],[-9,-209],[13,-210],[20,-195],[18,-181],[12,-192],[-13,-192]],c.fillStyle,'#11131a',1.1);
      if(d.headgear==='hood'){
        poly([[-23,-183],[-23,-208],[-15,-217],[6,-223],[23,-206],[25,-178],[14,-198],[-11,-198]],'#1c242e','#090e16',1);
        c.strokeStyle=rgba(accent,.63);c.lineWidth=1.8;c.beginPath();c.moveTo(-17,-201);c.quadraticCurveTo(-1,-219,17,-204);c.stroke();
      }
      if(d.headgear==='ears')poly([[-18,-198],[-21,-226],[-9,-210],[9,-210],[21,-225],[18,-195]],cl,'#090c12',1);
      if(d.headgear==='wings')for(const side of [-1,1]){
        poly([[side*18,-197],[side*34,-221],[side*27,-219],[side*38,-235],[side*11,-206]],accent);
      }
      if(d.headgear==='tiara')poly([[-19,-200],[0,-214],[19,-200],[0,-203]],accent);
      if(d.headgear==='hat'){poly([[-25,-209],[26,-209],[25,-205],[-25,-205]],'#111722');poly([[-14,-228],[14,-228],[16,-208],[-16,-208]],'#111722');}
    }else if(d.headgear==='hair'||d.headgear==='pigtails'){
      const hair=d.id==='joker'?'#405b40':d.id==='killer-frost'?'#d9eef3':'#171b24';
      poly([[-19,-181],[-19,-200],[-12,-209],[4,-209],[18,-201],[18,-185],[11,-193],[-9,-196]],hair,'#15171d',.6);
    }
    c.fillStyle=d.headgear==='ears'||d.headgear==='mask'||d.headgear==='visor'?'#c7eaff':'#121820';
    c.fillRect(-12,-182,8,2.5);c.fillRect(5,-182,8,2.5);
    c.strokeStyle='rgba(27,20,26,.65)';c.lineWidth=1;c.beginPath();c.moveTo(-5,-162);c.lineTo(5,-162);c.stroke();
    // Chest badge; emblems are original symbolic geometry.
    c.save();c.translate(0,-126);c.fillStyle=accent;
    if(['flash','shazam','black-adam'].includes(d.id)){
      poly([[-5,-17],[10,-13],[-1,0],[8,0],[-10,20],[-5,3],[-14,2]],accent,'rgba(0,0,0,.35)',1);
    }else if(['superman','wonder-woman'].includes(d.id)){
      poly([[-16,-11],[16,-11],[14,4],[0,17],[-14,4]],accent,'rgba(0,0,0,.5)',1);
    }else{c.beginPath();c.ellipse(0,0,11,8,0,0,Math.PI*2);c.fill();}
    c.restore();
    c.restore();
  }
  class Renderer {
    constructor(ctx,game){this.ctx=ctx;this.game=game;this.selectBg=null;this.portraitCache=new Map();this.model3d=FG.GLTFPresentation?new FG.GLTFPresentation():null;}
    render(){
      const g=this.game,c=this.ctx;
      c.save();c.clearRect(0,0,CW,CH);
      if(g.scene==='title')this.title();
      else if(g.scene==='settings')this.settings();
      else if(g.scene==='versus')this.versus();
      else if(g.scene==='fight')this.fight();
      this.toasts();
      if(g.padDebug)this.padOverlay();
      c.restore();
    }
    dashboardBackground(){
      const c=this.ctx,g=this.game;
      c.fillStyle='#080e18';c.fillRect(0,0,CW,CH);
      const bg=c.createLinearGradient(0,0,CW,CH);
      bg.addColorStop(0,'#111d2e');bg.addColorStop(.5,'#0d1624');
      bg.addColorStop(1,'#080d16');c.fillStyle=bg;c.fillRect(0,0,CW,CH);
      // Very faint structural detail; no blurred bitmap or dense fog overlays.
      c.save();c.strokeStyle='rgba(98,142,178,.055)';c.lineWidth=1;
      for(let i=-550;i<1800;i+=93)line(c,i,60,i+465,720,'rgba(120,161,193,.047)',1);
      c.restore();
      const aura=c.createRadialGradient(1100,320,30,1100,320,590);
      aura.addColorStop(0,'rgba(46,92,137,.11)');aura.addColorStop(1,'rgba(46,92,137,0)');
      c.fillStyle=aura;c.fillRect(0,60,CW,660);
      c.fillStyle='rgba(2,7,13,.35)';c.fillRect(0,664,CW,56);
    }
    topStatusBar(){
      const c=this.ctx;
      c.fillStyle='#070d16';c.fillRect(0,0,CW,60);
      c.fillStyle='#3caed9';c.fillRect(0,0,5,60);
      line(c,0,59,CW,59,'rgba(148,186,214,.19)',1);
      c.save();c.translate(38,29);
      c.strokeStyle='#77cde9';c.lineWidth=2;
      c.beginPath();c.moveTo(0,-15);c.lineTo(15,0);c.lineTo(0,15);c.lineTo(-15,0);c.closePath();c.stroke();
      c.fillStyle='#f0f8ff';c.fillRect(-3,-3,6,6);c.restore();
      label(c,'RE-JUSTICE',70,37,23,'#eff6ff','left','900');
      line(c,245,14,245,46,'rgba(187,210,224,.20)',1);
      label(c,'BROWSER EDITION',265,35,12,'#8da8bc','left','700');
      // Real state labels rather than the old fake XP/currency/time counters.
      c.fillStyle='rgba(71,192,234,.11)';rounded(c,996,16,118,29,8);c.fill();
      label(c,'EARLY ACCESS',1055,35,12,'#8fdaef','center','800');
      c.fillStyle='#9cbdcf';c.beginPath();c.arc(1136,30,3,0,Math.PI*2);c.fill();
      label(c,'BUILD 0.1.5',1153,35,12,'#c1d4e1','left','700');
    }
    sideTab(x,y,w,h,text,selected){
      const c=this.ctx;
      const hover=this.game.uiHover===(text==='FIGHT'?'fight-tab':'settings-tab');
      c.save();
      rounded(c,x,y,w,h,10);c.fillStyle=selected?'#213c50':hover?'#1a2d40':'#121f2e';c.fill();
      c.strokeStyle=selected?'#75ceec':hover?'#4a7e9b':'rgba(161,192,209,.22)';
      c.lineWidth=selected?2:1;c.stroke();
      if(selected){c.fillStyle='#70d3f2';rounded(c,x+2,y+12,3,h-24,2);c.fill();}
      const cx=x+w/2,cy=y+31;
      c.strokeStyle=selected?'#b2e6f5':'#7f9bb0';c.lineWidth=2;
      c.beginPath();
      if(text==='FIGHT'){
        c.moveTo(cx-13,cy-6);c.lineTo(cx-4,cy+3);c.lineTo(cx+6,cy-8);
        c.moveTo(cx-6,cy+9);c.lineTo(cx+5,cy-2);c.lineTo(cx+14,cy+7);
      }else{
        c.arc(cx,cy,10,0,Math.PI*2);
        c.moveTo(cx-4,cy);c.lineTo(cx+4,cy);
        c.moveTo(cx,cy-4);c.lineTo(cx,cy+4);
      }
      c.stroke();
      label(c,text,cx,y+69,13,selected?'#fff':'#a7bfce','center','800');
      c.restore();
    }
    titleBackdrop(){
      const c=this.ctx,t=this.game.frame/60;
      const bg=c.createLinearGradient(0,60,1280,720);
      bg.addColorStop(0,'#070e19');bg.addColorStop(.53,'#0c1725');
      bg.addColorStop(1,'#080c14');c.fillStyle=bg;c.fillRect(0,0,CW,CH);
      // Soft arena lighting behind the cards. Very cheap gradients rather
      // than heavy CSS filters, with one restrained animated energy sweep.
      let light=c.createRadialGradient(1020,354,26,1000,370,500);
      light.addColorStop(0,'rgba(229,172,100,.11)');
      light.addColorStop(.65,'rgba(149,105,67,.04)');
      light.addColorStop(1,'rgba(149,105,67,0)');
      c.fillStyle=light;c.fillRect(535,55,745,665);
      light=c.createRadialGradient(316,305,20,325,326,440);
      light.addColorStop(0,'rgba(81,165,206,.09)');
      light.addColorStop(1,'rgba(81,165,206,0)');
      c.fillStyle=light;c.fillRect(104,60,700,660);
      c.save();
      c.beginPath();c.rect(104,60,1176,660);c.clip();
      c.strokeStyle='rgba(127,160,185,.052)';c.lineWidth=1;
      for(let i=-900;i<1950;i+=82){
        c.beginPath();c.moveTo(i,60);c.lineTo(i+430,720);c.stroke();
      }
      for(let i=0;i<16;i++){
        const xx=160+i*75;
        line(c,xx,642,xx-260,720,'rgba(134,164,186,.025)',1);
      }
      // Shards converge at the arena's middle; their hue changes subtly
      // while remaining subdued enough not to interfere with readable text.
      const wave=Math.sin(t*.62);
      c.fillStyle='rgba(96,196,236,.026)';
      c.beginPath();c.moveTo(574,60);c.lineTo(730,60);c.lineTo(638,185);c.closePath();c.fill();
      c.fillStyle=`rgba(245,184,106,${.028+wave*.007})`;
      c.beginPath();c.moveTo(1030,60);c.lineTo(1175,60);c.lineTo(815,664);c.lineTo(789,664);
      c.closePath();c.fill();
      // Minimal scanner dots along bottom edge; no distracting blinking.
      c.fillStyle='rgba(132,184,208,.13)';
      for(let i=0;i<16;i++)c.fillRect(151+i*71,703,13,1);
      c.restore();
    }
    // Original angular silhouettes built with canvas vectors. Keeps the
    // mode cards cinematic without external image requests or copied assets.
    cardFighter(c,x,y,scale,color,flip=1){
      c.save();c.translate(x,y);c.scale(scale*flip,scale);
      const shape=(pts,fill)=>{
        c.beginPath();pts.forEach(([px,py],i)=>i?c.lineTo(px,py):c.moveTo(px,py));
        c.closePath();c.fillStyle=fill;c.fill();
      };
      const outer='rgba(4,10,17,.95)';
      // Silhouette is deliberately partly obscured by the card's fade.
      shape([[-26,-15],[-30,36],[-52,116],[-18,119],[-4,52],[10,119],[40,116],[31,38],[26,-15]],outer);
      shape([[-22,-90],[-43,-70],[-55,0],[-27,11],[-19,-28],[18,-28],[29,10],[55,0],[44,-71],[24,-90]],outer);
      shape([[-18,-130],[-22,-105],[-14,-88],[14,-88],[23,-110],[17,-133],[0,-143]],outer);
      shape([[-35,-70],[-49,-50],[-49,-8],[-37,-3],[-25,-56]],color);
      shape([[25,-57],[38,-65],[48,-5],[36,-3],[22,-46]],color);
      shape([[-22,-87],[0,-77],[19,-88],[13,-51],[0,-39],[-14,-55]],color);
      c.strokeStyle=color;c.lineWidth=1.5;
      c.beginPath();c.moveTo(-17,-110);c.lineTo(-6,-107);
      c.moveTo(6,-107);c.lineTo(17,-110);c.stroke();
      c.restore();
    }
    modeCard(x,y,w,h,title,eyebrow,description,sub,selected,hovered,online){
      const c=this.ctx,frame=this.game.frame;
      const hot=selected||hovered;
      const gold='#efb86a',ice='#71ccf0',accent=online?ice:gold;
      const pulse=.5+.5*Math.sin(frame*.07);
      c.save();
      rounded(c,x,y,w,h,16);c.clip();
      const fill=c.createLinearGradient(x,y,x+w,y+h);
      if(online){
        fill.addColorStop(0,'#12273a');fill.addColorStop(.6,'#101b2a');
        fill.addColorStop(1,'#0a1320');
      }else{
        fill.addColorStop(0,hot?'#302d2a':'#262629');
        fill.addColorStop(.55,'#171f29');fill.addColorStop(1,'#101922');
      }
      c.fillStyle=fill;c.fillRect(x,y,w,h);
      // Angular polished-metal design under the text plane.
      c.fillStyle=online?'rgba(63,148,190,.07)':'rgba(239,184,106,.055)';
      c.beginPath();c.moveTo(x+w*.54,y);c.lineTo(x+w,y);
      c.lineTo(x+w,y+h);c.lineTo(x+w*.79,y+h);c.closePath();c.fill();
      for(let k=0;k<6;k++){
        const xx=x+w-210+k*39;
        line(c,xx,y,xx-210,y+h,'rgba(177,210,225,.041)',1);
      }
      const px=x+w-134,py=y+177;
      const arenaGlow=c.createRadialGradient(px,py,12,px,py,191);
      arenaGlow.addColorStop(0,online?'rgba(63,171,213,.10)':'rgba(247,188,107,.15)');
      arenaGlow.addColorStop(1,'rgba(20,45,62,0)');
      c.fillStyle=arenaGlow;c.fillRect(x+w-350,y,350,h);
      // One geometric centerpiece per mode: muted network nodes or
      // two fighters facing off, with motion energy behind the SOLO card.
      if(online){
        c.strokeStyle='rgba(97,177,214,.21)';c.lineWidth=1.4;
        const pts=[[px-56,py-51],[px+40,py-90],[px+86,py+17],
          [px-32,py+82],[px-96,py+14]];
        for(let i=0;i<pts.length;i++){
          const a=pts[i],b=pts[(i+1)%pts.length];
          line(c,a[0],a[1],b[0],b[1],'rgba(97,177,214,.18)',1);
          c.beginPath();c.arc(a[0],a[1],4,0,Math.PI*2);
          c.fillStyle='rgba(117,194,230,.24)';c.fill();
        }
        c.beginPath();c.arc(px,py,105,0,Math.PI*2);c.stroke();
        c.save();c.translate(px,py);c.rotate(-.55);
        c.fillStyle='rgba(5,12,20,.9)';
        c.fillRect(-20,-36,40,69);
        c.strokeStyle='rgba(125,200,231,.40)';c.lineWidth=3;
        rounded(c,-19,-35,38,67,5);c.stroke();
        c.strokeStyle='rgba(125,200,231,.36)';
        line(c,-8,-35,-8,-49,'rgba(125,200,231,.36)',2);
        line(c,8,-35,8,-49,'rgba(125,200,231,.36)',2);
        c.restore();
      }else{
        const sway=Math.sin(frame*.026)*3.8;
        for(let i=0;i<6;i++){
          const dy=-90+i*36;
          line(c,px-97,py+dy,px+101,py+dy-39,
            `rgba(245,179,93,${.055+(i%2)*.04})`,i%2?2:1);
        }
        c.strokeStyle='rgba(244,183,103,.19)';c.lineWidth=1;
        for(const radius of [74,115]){
          c.beginPath();c.arc(px,py,radius,0,Math.PI*2);c.stroke();
        }
        this.cardFighter(c,px-39+sway,py+21,.94,'rgba(109,206,244,.42)',1);
        this.cardFighter(c,px+56-sway,py+22,.93,'rgba(239,184,106,.58)',-1);
        c.fillStyle='rgba(248,192,111,.5)';c.save();
        c.translate(px+5,py+4);c.rotate(-.22);
        c.fillRect(-1,-69,2,125);c.restore();
      }
      // Fade the artwork behind the reading column.
      const readingFade=c.createLinearGradient(x+230,y,x+w-75,y);
      readingFade.addColorStop(0,online?'rgba(16,30,45,.81)':'rgba(30,31,32,.77)');
      readingFade.addColorStop(.6,'rgba(15,22,31,.44)');
      readingFade.addColorStop(1,'rgba(12,19,28,0)');
      c.fillStyle=readingFade;c.fillRect(x+225,y,w-225,h);
      // Thin top bevel and an accent rail.
      line(c,x+16,y+2,x+w-16,y+2,'rgba(255,255,255,.08)',1);
      c.fillStyle=accent;c.fillRect(x,y,online?3:4,h);
      if(!online){
        c.fillStyle=`rgba(246,191,112,${hot?.78+.22*pulse:.48})`;
        c.fillRect(x,y+16,4,h-32);
      }
      c.restore();
      // Selection glow/outline lives OUTSIDE the clipped card.
      c.save();
      if(hot&&!online){
        c.shadowColor='rgba(239,184,106,.48)';c.shadowBlur=11+pulse*8;
      }
      rounded(c,x+.5,y+.5,w-1,h-1,16);
      c.strokeStyle=hot?(online?'rgba(112,206,240,.65)':'#f5cd92'):
        (online?'rgba(132,177,201,.25)':'rgba(175,184,193,.30)');
      c.lineWidth=hot?2.2:1;c.stroke();c.restore();
      label(c,eyebrow,x+32,y+40,12,online?'#8fbad0':'#f3c582','left','900');
      // Tiny state tag in upper-right corner.
      const tag=online?'OFFLINE':'AVAILABLE';
      c.save();rounded(c,x+w-144,y+20,119,29,7);
      c.fillStyle=online?'rgba(104,167,199,.09)':'rgba(238,183,106,.15)';c.fill();
      c.strokeStyle=online?'rgba(111,175,206,.22)':'rgba(244,190,113,.35)';
      c.lineWidth=1;c.stroke();
      label(c,tag,x+w-85,y+39,11,online?'#a0c3d4':'#ffd29a','center','800');
      c.restore();
      label(c,title,x+32,y+132,online?37:40,online?'#d6e7f2':'#fcf9f2','left','900');
      label(c,description,x+33,y+176,16,online?'#aac2d1':'#d5dee5','left','600');
      line(c,x+30,y+h-91,x+w-30,y+h-91,'rgba(181,205,219,.15)',1);
      label(c,sub,x+31,y+h-62,12,online?'#83a6ba':'#b8cbd8','left','700');
      if(online){
        label(c,'NETWORK PLAY IS IN DEVELOPMENT',x+31,y+h-30,12,'#8faab9','left','700');
      }else{
        c.save();rounded(c,x+27,y+h-47,190,33,7);
        c.fillStyle=hot?'#f2bf7c':'rgba(242,187,112,.19)';c.fill();
        c.strokeStyle='rgba(242,187,112,.48)';c.lineWidth=1;c.stroke();
        label(c,'SELECT FIGHTERS   ›',x+122,y+h-25,13,
          hot?'#18202a':'#f7cc90','center','900');c.restore();
        if(hot){
          c.fillStyle=gold;c.fillRect(x+245,y+h-4,130,3);
        }
      }
    }
    title(){
      const c=this.ctx,g=this.game;
      this.titleBackdrop();this.topStatusBar();
      c.fillStyle='rgba(4,11,20,.74)';c.fillRect(0,60,104,660);
      line(c,103,60,103,720,'rgba(124,169,198,.23)',1);
      this.sideTab(12,82,78,88,'FIGHT',g.menuCursor!==2);
      this.sideTab(12,181,78,88,'SETTINGS',g.menuCursor===2);
      label(c,'GAME MODES   /   SELECT YOUR BATTLE',134,97,12,'#85cbe7','left','900');
      label(c,'ENTER THE ARENA',134,140,35,'#f6f9fc','left','900');
      label(c,'Choose how you want to fight.',135,172,16,'#a7c1d1','left','500');
      const chosen=g.menuItems[g.menuCursor];
      this.modeCard(132,205,540,320,'1V1 ONLINE','01   /   NETWORK',
        'Challenge another player in a future update.',
        'MULTIPLAYER   /   COMING LATER',chosen==='online',g.uiHover==='online',true);
      this.modeCard(692,205,552,320,'1V1 VS BOT','02   /   SOLO MODE',
        'Train, practice and master your fighter.',
        'SOLO TRAINING   /   LOCAL MATCH',chosen==='cpu',g.uiHover==='cpu',false);
      // Actionable instructions with no fake buttons.
      c.save();rounded(c,132,549,1112,88,12);
      const footer=c.createLinearGradient(132,549,1244,637);
      footer.addColorStop(0,'rgba(18,37,54,.94)');
      footer.addColorStop(1,'rgba(10,23,37,.95)');
      c.fillStyle=footer;c.fill();
      c.strokeStyle='rgba(122,164,194,.22)';c.lineWidth=1;c.stroke();c.restore();
      c.fillStyle='#72d2ef';c.beginPath();c.arc(163,591,5,0,Math.PI*2);c.fill();
      label(c,'READY WHEN YOU ARE',180,595,16,'#f2f8ff','left','900');
      label(c,'Keyboard, mouse and Xbox / PlayStation controllers',180,619,12,'#94b2c8','left','600');
      const action=chosen==='online'?'ONLINE  /  IN DEVELOPMENT':
        chosen==='settings'?'SETTINGS  /  CONTROLS':'ENTER / A   TO CHOOSE FIGHTERS';
      c.save();rounded(c,913,570,300,43,8);
      c.fillStyle=chosen==='cpu'?'rgba(236,180,107,.12)':'rgba(106,179,215,.10)';c.fill();
      c.strokeStyle=chosen==='cpu'?'rgba(241,191,123,.34)':'rgba(124,188,217,.25)';
      c.lineWidth=1;c.stroke();
      label(c,action,1063,597,12,chosen==='cpu'?'#ffd59b':'#accfe1','center','900');
      c.restore();
      line(c,134,660,1243,660,'rgba(119,161,193,.14)',1);
      label(c,'← / →  OR  D-PAD   NAVIGATE         ENTER / A   CONFIRM',
        689,687,13,'#9bb7ca','center','700');
    }
    settings(){
      const c=this.ctx,g=this.game,input=g.input,actions=FG.InputUtils.ACTIONS;
      this.dashboardBackground();this.topStatusBar();
      c.fillStyle='rgba(5,11,19,.69)';c.fillRect(0,60,104,660);
      line(c,103,60,103,720,'rgba(124,158,178,.16)',1);
      this.sideTab(12,82,78,88,'FIGHT',false);
      this.sideTab(12,181,78,88,'SETTINGS',true);
      label(c,'CONTROLS',134,119,32,'#f3f8fd','left','900');
      label(c,'Personalize keyboard and controller bindings for each player.',134,151,16,'#a2bbcc','left','500');
      c.save();rounded(c,132,172,1112,77,12);c.fillStyle='rgba(18,34,49,.92)';c.fill();
      c.strokeStyle='rgba(142,182,203,.21)';c.lineWidth=1;c.stroke();c.restore();
      const selector=(x,y,w,h,title,value,on)=>{
        label(c,title,x,y-7,12,'#85a6bb','left','800');
        c.save();rounded(c,x,y,w,h,8);c.fillStyle=on?'#28465b':'#142738';c.fill();
        c.strokeStyle=on?'#91d9ef':'rgba(152,188,210,.3)';c.lineWidth=on?2:1;c.stroke();
        label(c,value,x+17,y+30,17,'#f3f9fc','left','800');
        label(c,'↔',x+w-20,y+29,18,'#8fcae3','center','700');c.restore();
      };
      selector(146,188,179,48,'PLAYER','PLAYER '+g.settingsPlayer,g.settingsRow===-2);
      selector(354,188,250,48,'INPUT DEVICE',g.settingsDevice==='keyboard'?'KEYBOARD':'CONTROLLER',g.settingsRow===-1);
      label(c,'CLICK A BINDING TO CHANGE IT',776,217,14,'#b9d0df','left','600');
      const names={left:'MOVE LEFT',right:'MOVE RIGHT',up:'JUMP / UP',down:'CROUCH / DOWN',
        light:'LIGHT ATTACK',medium:'MEDIUM ATTACK',heavy:'HEAVY ATTACK',
        power:'CHARACTER POWER',super:'SUPER MOVE',throw:'THROW',block:'BLOCK',
        burn:'METER BURN',pause:'PAUSE',reset:'TRAINING RESET'};
      const total=actions.length+2;
      for(let row=0;row<total;row++){
        const col=Math.floor(row/8),idx=row%8;
        const x=134+560*col,y=282+44*idx,w=534,h=38;
        const selected=g.settingsRow===row,hovered=g.uiHover==='settings-row'&&g.uiHoverRow===row;
        c.save();rounded(c,x,y,w,h,7);c.fillStyle=selected?'#28445a':hovered?'#1b3448':'rgba(17,31,46,.94)';c.fill();
        c.strokeStyle=selected?'rgba(120,215,245,.91)':'rgba(118,152,175,.21)';c.lineWidth=selected?1.5:1;c.stroke();
        if(selected){c.fillStyle='#78d8f0';c.fillRect(x+1,y+7,3,h-14);}
        const action=actions[row];
        const name=row<actions.length?names[action]:row===actions.length?'CONTROLLER VIBRATION':'RESTORE DEFAULT CONTROLS';
        let value;
        if(row<actions.length){
          value=g.settingsDevice==='keyboard'?input.prettyKey(input.bindings.keyboard[g.settingsPlayer][action]):
            input.glyph(g.settingsPlayer,action)+'  /  B'+input.bindings.pad[g.settingsPlayer][action];
        }else{value=row===actions.length?(input.rumbleEnabled?'ON':'OFF'):'RESET ALL';}
        label(c,name,x+17,y+25,15,selected?'#ffffff':'#c6d6e2','left','700');
        const vtext=String(value||'—');
        const tw=Math.max(64,Math.min(152,c.measureText(vtext).width+25));
        const vx=x+w-13-tw;
        rounded(c,vx,y+6,tw,26,5);c.fillStyle=selected?'#3e657b':'#263e50';c.fill();
        label(c,vtext,vx+tw/2,y+24,13,selected?'#ecfbff':'#c7e3ef','center','800');
        c.restore();
      }
      label(c,'CLICK A ROW TO REBIND  •  LEFT / RIGHT SWITCH COLUMNS  •  ESC / B RETURN',690,680,13,'#9ab4c7','center','700');
      if(g.rebinding){
        c.fillStyle='rgba(3,8,14,.75)';c.fillRect(104,60,1176,660);
        c.save();rounded(c,356,253,630,216,15);c.fillStyle='#142638';c.fill();
        c.strokeStyle='#75cae7';c.lineWidth=2;c.stroke();
        label(c,'REMAP CONTROL',386,304,20,'#8ad8f1','left','900');
        label(c,g.rebinding.action.toUpperCase().replaceAll('_',' '),386,348,28,'#fff','left','800');
        label(c,g.rebinding.device==='keyboard'?'Press the new key on your keyboard':'Press the new button on your controller',386,388,17,'#c7dbe7','left','600');
        label(c,'ESC / B  CANCEL',386,437,14,'#9dbacb','left','800');c.restore();
      }
    }
    portraitFor(def){
      const external=this.game.assets?.image('portraits',def.id);
      if(external)return external;
      // Prefer a cached bust rendered from the very same Blender mesh used
      // in combat and selection. Until GLB finishes loading, keep 2D art.
      const threePortrait=this.model3d?.portraitFor(def);
      if(threePortrait)return threePortrait;
      if(this.portraitCache.has(def.id))return this.portraitCache.get(def.id);
      const rig=FG.FighterRig?.portrait?.(def);
      if(rig){this.portraitCache.set(def.id,rig);return rig;}
      const tile=document.createElement('canvas');tile.width=96;tile.height=144;
      drawPortrait(tile.getContext('2d'),def,null);
      this.portraitCache.set(def.id,tile);return tile;
    }
    selectionBackdrop(frame){
      const c=this.ctx;
      if(!this.selectBg){
        this.selectBg=document.createElement('canvas');
        this.selectBg.width=CW;this.selectBg.height=CH;
        selectBackground(this.selectBg.getContext('2d'));
      }
      c.drawImage(this.selectBg,0,0);
      const t=frame/60;
      for(let i=0;i<10;i++){
        const x=((i*287+Math.sin(t*.21+i)*66+1400)%1550)-135;
        const y=350+i*31+Math.sin(t*.26+i*2)*21;
        fogDisc(c,x,y,157+i*12,`rgba(158,164,176,${.016+i*.003})`);
      }
    }
    selectPortrait(index,player1,player2,frame){
      const c=this.ctx,r=selectCardRect(index),def=FG.CHARACTERS[FG.ROSTER[index]];
      const is1=player1===def.id,is2=player2===def.id;
      c.save();c.translate(r.x,r.y);
      c.transform(1,r.side?.015:-.015,r.side?-.09:.09,1,0,0);
      c.shadowColor='rgba(0,0,0,.85)';c.shadowBlur=16;c.shadowOffsetX=r.side?8:-8;
      c.fillStyle='#090a0d';c.fillRect(-3,-3,r.w+6,r.h+7);
      c.shadowBlur=0;c.shadowOffsetX=0;
      c.save();c.beginPath();c.rect(0,0,r.w,r.h);c.clip();
      c.drawImage(this.portraitFor(def),0,0,r.w,r.h);
      // Darken thumbnails for a metallic, low-key portrait wall.
      c.fillStyle='rgba(6,8,13,.19)';c.fillRect(0,0,r.w,r.h);
      if(!def.playable){c.fillStyle='rgba(6,7,11,.13)';c.fillRect(0,0,r.w,r.h);}
      c.restore();
      c.strokeStyle='rgba(191,198,203,.48)';c.lineWidth=1;c.strokeRect(.5,.5,r.w-1,r.h-1);
      c.strokeStyle='rgba(0,0,0,.7)';c.lineWidth=2;c.strokeRect(2.5,2.5,r.w-5,r.h-5);
      if(is1||is2){
        const tone=is1?'#e12d50':'#7ad4ff';
        c.shadowColor=tone;c.shadowBlur=16+Math.sin(frame*.11)*4;
        c.strokeStyle=tone;c.lineWidth=4;c.strokeRect(-2,-2,r.w+4,r.h+4);
        c.shadowBlur=0;
        if(is1&&is2){c.strokeStyle='#89d4ed';c.lineWidth=2;c.strokeRect(3,3,r.w-6,r.h-6);}
        c.fillStyle=tone;
        // Cropped angled selector corners echo the reference's red frame.
        c.fillRect(-4,-4,18,4);c.fillRect(-4,-4,4,21);
        c.fillRect(r.w-14,r.h,19,4);c.fillRect(r.w,r.h-17,4,20);
        label(c,is1?'1':'2',r.w/2,r.h-7,13,'#fff','center','900');
      }
      c.restore();
    }
    verticalSelectName(name,isLeft,colour){
      const c=this.ctx;c.save();
      c.translate(isLeft?53:1227,621);
      c.rotate(-Math.PI/2);
      c.shadowColor='#040508';c.shadowBlur=8;
      label(c,name.toUpperCase(),0,0,25,'#f1f2f4','left','900');
      c.shadowBlur=0;
      c.fillStyle=colour;c.fillRect(0,7,Math.min(186,name.length*16),3);
      c.restore();
    }
    versus(){
      const c=this.ctx,g=this.game,featured=g.previewPlayer||1;
      const selectedId=featured===2?g.p2Id:g.p1Id,def=FG.CHARACTERS[selectedId];
      this.selectionBackdrop(g.frame);
      // Oblique side panels and individually illustrated portraits.
      const sides=[{x:4,flip:1},{x:1276,flip:-1}];
      for(const side of sides){
        c.save();c.translate(side.x,0);c.transform(1,0,side.flip*.10,1,0,0);
        const wall=c.createLinearGradient(0,0,side.flip*358,0);
        wall.addColorStop(0,'rgba(3,5,9,.89)');wall.addColorStop(1,'rgba(7,10,15,.15)');
        c.fillStyle=wall;c.fillRect(side.flip>0?0:-350,0,350,660);
        c.restore();
      }
      // Behind the 2.5D preview, a faint concentrated spotlight.
      const halo=c.createRadialGradient(640,257,8,640,326,370);
      halo.addColorStop(0,rgba(def.secondary,.17));halo.addColorStop(.55,'rgba(175,183,200,.07)');
      halo.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=halo;c.fillRect(330,0,620,690);
      c.save();c.beginPath();c.rect(355,20,570,650);c.clip();
      // On male slots display the approved Blender GLB, including unfinished
      // roster entries. Females and unloaded models retain existing previews.
      if(!this.model3d?.drawSelect(c,def,g.frame))
        if(!(FG.FighterRig?.preview?.(c,def,g.frame)))armoredHero(c,def,g.frame);
      c.restore();
      // Front haze veils the fighter's feet like the provided screenshot.
      for(let i=0;i<5;i++){
        fogDisc(c,480+i*85,631+Math.sin(g.frame*.012+i)*9,180,
          'rgba(127,132,145,.095)');
      }
      // Draw portrait banks after the stage preview to keep their metallic
      // frames completely clean and readable.
      for(let i=0;i<FG.ROSTER.length;i++)this.selectPortrait(i,g.p1Id,g.p2Id,g.frame);
      this.verticalSelectName(FG.CHARACTERS[g.p1Id].name,true,'#e33b51');
      this.verticalSelectName(FG.CHARACTERS[g.p2Id].name,false,'#79bfe7');
      // Soft readable nameplates and small, unobtrusive controls at the foot.
      const scrim=c.createLinearGradient(0,550,0,720);
      scrim.addColorStop(0,'rgba(3,5,9,0)');scrim.addColorStop(.65,'rgba(3,5,10,.64)');
      scrim.addColorStop(1,'rgba(0,1,4,.94)');c.fillStyle=scrim;c.fillRect(350,550,580,170);
      const desc=def.playable?'READY TO FIGHT':'ROSTER PREVIEW · FIGHTER NOT YET PLAYABLE';
      label(c,def.name.toUpperCase(),640,592,36,'#f7f7f5','center');
      label(c,desc,640,621,13,def.playable?'#ddc6a0':'#e6a5a7','center','700');
      line(c,454,636,826,636,'rgba(190,190,196,.23)',1);
      const map=FG.STAGES[g.stageId];
      label(c,`P1  ${g.selectLocked[1]?'LOCKED':'SELECT'}    ·    P2  ${g.mode==='cpu'?'CPU':g.selectLocked[2]?'LOCKED':'SELECT'}`,640,659,15,'#e0e3e9','center','700');
      const button=g.input?.glyph(1,'light')||'J',confirm=g.input?.glyph(1,'power')||'H';
      label(c,`MOVE  WASD / ARROWS / D-PAD     •     PICK  ${button} / ${confirm}     •     FIGHT  ENTER / START`,640,680,13,'#aeb9c7','center','700');
      const threeReady=g.mode==='cpu'&&g.arena3d?.ready;
      const stageLabel=threeReady?'STAGE: ANCIENT TRAINING GROUNDS · 3D LOCK-ON ARENA  ·  1V1 VS CPU':
        'STAGE: '+map.name.toUpperCase()+' [T / TAB] · '+(g.mode==='cpu'?'1 PLAYER · VS CPU':'LOCAL VERSUS');
      label(c,stageLabel+'       ESC · BACK',640,700,12,'#929daa','center','700');
      if(g.mode!=='cpu'&&!(g.input?.keyboardJoined[2]||g.input?.padSlots[2]!==null)){
        label(c,'P2 · PRESS A KEY OR CONTROLLER BUTTON TO JOIN',640,34,15,'#b5d2e8','center','700');
      }
    }
    fight(){
      const c=this.ctx,g=this.game;this.stageBackdrop(FG.STAGES[g.stageId],g.frame,false);
      c.save();
      if(g.shake){const t=g.frame;const m=Math.min(7,g.shake)*.7;
        c.translate(Math.sin(t*47.25)*m,Math.cos(t*33.8)*m*.56);}
      const fx=[...g.fighters].sort((a,b)=>a.x-b.x);
      const glbSlots=this.model3d?.drawFight(c,g);
      for(const fighter of fx){
        // Preserve sprite/2D fallbacks and all gameplay hitbox coordinates.
        if(!glbSlots?.has(fighter.slot))figure(c,fighter,fighter.x,fighter.y,1,1,g.assets);
      }
      for(const e of g.effects)this.spark(e);
      if(g.debug)this.hitboxes();
      c.restore();
      this.hud();
      if(g.announceFrames>0&&g.announcement)this.announcer();
      if(g.pause)this.pauseOverlay();
      if(g.phase==='matchover'){
        panel(c,360,274,560,135,.92);
        label(c,'PLAYER '+g.matchWinner+' VICTORIOUS',640,344,42,GOLD,'center');
        label(c,'PRESS ENTER / ✕ TO RETURN',640,382,20,'#dcecf5','center');
      }
      if(g.debug)this.debugOverlay();
    }
    stageBackdrop(stage,frame,isMenu){
      const c=this.ctx;const sky=gradient(c,0,0,CW,CH,stage.sky,stage.mid);
      c.fillStyle=sky;c.fillRect(0,0,CW,CH);
      const img=this.game.assets.image('stages',stage.id);
      if(img){c.drawImage(img,0,0,CW,CH);return;}
      // Parallax layers are purely graphical and driven by simulation ticks.
      const glow=c.createRadialGradient(940,193,2,940,193,360);
      glow.addColorStop(0,stage.light+'9a');glow.addColorStop(.25,stage.accent+'53');glow.addColorStop(1,'#00000000');
      c.fillStyle=glow;c.fillRect(0,0,CW,CH);
      if(['space','alien','underwater'].includes(stage.scene)){
        for(let i=0;i<64;i++){
          const x=(i*257+133)%CW,y=(i*151+43)%450;
          const pulse=.45+.4*Math.sin(frame*.016+i*8);
          c.fillStyle=`rgba(216,246,255,${pulse})`;c.fillRect(x,y,i%7?1:2,i%7?1:2);
        }
      }
      if(stage.scene==='alien'||stage.scene==='space'){
        c.fillStyle=stage.light;c.globalAlpha=.55;c.beginPath();c.arc(1020,170,75,0,Math.PI*2);c.fill();c.globalAlpha=1;
      }else if(stage.scene==='underwater'){
        c.strokeStyle='rgba(137,241,240,.13)';c.lineWidth=23;
        for(let i=0;i<9;i++){
          c.beginPath();c.moveTo((i*178+frame*.19)%1470-60,0);
          c.lineTo(i*155-110,stage.ground);c.stroke();
        }
      }else{
        c.fillStyle=stage.light;c.globalAlpha=.36;c.beginPath();c.arc(990,200,56,0,Math.PI*2);c.fill();c.globalAlpha=1;
      }
      for(let layer=0;layer<stage.parallax.length;layer++){
        const par=stage.parallax[layer],baseline=CH*par.height;
        c.fillStyle=layer===0?'#101b2c':layer===1?'#182b3a':'#1d313f';
        c.globalAlpha=par.alpha;
        for(let i=0;i<19;i++){
          const w=55+((i*43+layer*17)%75);
          const h=50+((i*89+layer*37)%195);
          const x=i*89-95-(frame*par.speed)%89;
          c.fillRect(x,baseline-h,w,CH-baseline+h);
          if(layer===2){
            c.fillStyle=stage.accent;
            for(let k=0;k<4;k++)for(let j=0;j<3;j++){
              if((i+k+j)%3===0)c.fillRect(x+9+k*14,baseline-h+17+j*24,3,8);
            }
            c.fillStyle='#1d313f';
          }
        }
        c.globalAlpha=1;
      }
      if(stage.scene==='fortress'||stage.scene==='prison'){
        for(let x=45;x<CW;x+=110){c.fillStyle='#0d1923';c.fillRect(x,267,40,300);
          c.fillStyle=stage.accent;c.globalAlpha=.25;c.fillRect(x+11,296,17,32);c.globalAlpha=1;}
      }
      if(stage.scene==='underwater'||stage.scene==='harbor'){
        c.strokeStyle='rgba(115,218,238,.12)';c.lineWidth=3;
        for(let i=0;i<16;i++){
          const x=(i*121+frame*.34)%1340-30,y=240+i*19;
          c.beginPath();c.arc(x,y,4+i%4,0,Math.PI*2);c.stroke();
        }
      }
      c.fillStyle='#151e27';c.fillRect(0,stage.ground,CW,CH-stage.ground);
      c.fillStyle=stage.accent;c.globalAlpha=.46;c.fillRect(0,stage.ground, CW,4);c.globalAlpha=1;
      const floor=gradient(c,0,stage.ground,CW,CH-stage.ground,'#1b2936','#080e16');
      c.fillStyle=floor;c.fillRect(0,stage.ground+5,CW,CH-stage.ground-5);
      c.strokeStyle='rgba(157,215,232,.11)';c.lineWidth=1;
      for(let i=0;i<22;i++){
        const x=i*76+Math.floor(frame*.12)%76;
        line(c,x,stage.ground+5,640+(x-640)*1.18,CH,'rgba(125,190,208,.10)');
      }
      for(let y=stage.ground+15;y<CH;y+=20){line(c,0,y,CW,y,'rgba(125,190,208,.07)');}
      // Industrial near-frame anchors reinforce the playable lane.
      c.fillStyle='#0b111a';c.fillRect(0,480,38,CH-480);c.fillRect(CW-38,480,38,CH-480);
      c.strokeStyle=stage.accent;c.globalAlpha=.57;
      line(c,39,470,39,CH,stage.accent,3);line(c,CW-39,470,CW-39,CH,stage.accent,3);
      c.globalAlpha=1;
      if(isMenu){c.fillStyle='rgba(0,0,0,.08)';c.fillRect(0,0,CW,CH);}
    }
    hud(){
      const c=this.ctx,g=this.game,[a,b]=g.fighters;
      panel(c,32,25,1216,133,.76);
      const defs=[a.def,b.def];
      label(c,defs[0].name.toUpperCase(),70,66,26,'#fff');
      label(c,defs[1].name.toUpperCase(),1210,66,26,'#fff','right');
      centerBar(c,70,79,476,35,a.health,a.maxHealth,false,'#e8bd6d');
      centerBar(c,734,79,476,35,b.health,b.maxHealth,true,'#8aceec');
      label(c,String(Math.ceil(g.roundTicks/60)).padStart(2,'0'),640,108,55,'#fff','center');
      for(let side=0;side<2;side++)for(let i=0;i<2;i++){
        const x=side?1190-i*33:88+i*33,y=136;
        c.beginPath();c.arc(x,y,9,0,Math.PI*2);
        c.fillStyle=i<g.wins[side]?GOLD:'#273746';c.fill();
        c.strokeStyle=i<g.wins[side]?GOLD:'#7c8e9e';c.lineWidth=2;c.stroke();
      }
      label(c,'ROUND '+g.roundNumber,640,137,14,'#b5c4cf','center');
      label(c,'P1  '+Math.round(a.health)+' / '+a.maxHealth,70,170,13,'#a9b9c9');
      label(c,'P2  '+Math.round(b.health)+' / '+b.maxHealth,1210,170,13,'#a9b9c9','right');
      panel(c,30,643,1220,58,.55);
      label(c,'P1  '+(g.input?.glyph(1,'light')||'J')+' LIGHT   '+(g.input?.glyph(1,'medium')||'K')+
        ' MEDIUM   '+(g.input?.glyph(1,'heavy')||'L')+' HEAVY',54,674,17,'#b6d4e5');
      label(c,'HOLD BACK / BLOCK  •  DOWN + BACK = LOW BLOCK  •  ESC / START PAUSE',1220,674,15,'#b6d4e5','right');
      label(c,FG.STAGES[g.stageId].name,640,623,18,'#c6d7e2','center','700');
    }
    spark(e){
      const c=this.ctx,life=e.life/e.total;
      c.save();c.translate(e.x,e.y);c.globalAlpha=life;
      for(let i=0;i<9;i++){
        const angle=(i/9)*Math.PI*2+(this.game.frame%13)*.06;
        line(c,Math.cos(angle)*8,Math.sin(angle)*8,
          Math.cos(angle)*(19+(1-life)*40),Math.sin(angle)*(19+(1-life)*40),e.color,3.7*life+.5);
      }
      c.fillStyle='#fff9dd';c.beginPath();c.arc(0,0,11*life+2,0,Math.PI*2);c.fill();c.restore();
    }
    announcer(){
      const c=this.ctx,g=this.game;
      c.save();c.fillStyle='rgba(4,9,20,.52)';c.fillRect(0,265,CW,135);
      line(c,0,265,CW,265,'rgba(250,199,116,.6)',2);line(c,0,400,CW,400,'rgba(250,199,116,.6)',2);
      label(c,g.announcement,640,362,g.announcement.length>15?65:95,GOLD,'center');c.restore();
    }
    pauseOverlay(){
      const c=this.ctx;c.fillStyle='rgba(1,5,10,.78)';c.fillRect(0,0,CW,CH);
      panel(c,388,186,504,349,.96);label(c,'PAUSED',640,266,63,'#fff','center');
      line(c,449,288,831,288,GOLD,3);
      label(c,'ESC / START  ·  RESUME',640,343,22,'#e8f5fd','center');
      label(c,'Q  ·  QUIT TO TITLE',640,387,21,'#b0c8d7','center');
      label(c,'F3 HITBOX DEBUG   /   F4 CONTROLLER TEST',640,442,17,BLUE,'center');
      label(c,'Move lists, supers and specials arrive in Phase 2–4.',640,481,17,'#a2b0ba','center','500');
    }
    toasts(){
      const c=this.ctx,toasts=this.game.input?.toasts||[];
      for(let i=0;i<toasts.length;i++){
        const t=toasts[i],y=this.game.scene==='versus'?35+i*36:this.game.scene==='settings'?565+i*34:185+i*44;
        panel(c,405,y,470,32,.96);
        label(c,t.message,640,y+22,14,'#f4f8fa','center','700');
      }
    }
    hitboxes(){
      const c=this.ctx;
      for(const f of this.game.fighters){
        const hurt=f.hurtbox;c.fillStyle='rgba(103,237,133,.12)';c.fillRect(hurt.x,hurt.y,hurt.w,hurt.h);
        c.strokeStyle='#80e89b';c.lineWidth=2;c.strokeRect(hurt.x,hurt.y,hurt.w,hurt.h);
        const box=f.activeHitbox;if(box){c.fillStyle='rgba(253,87,87,.19)';c.fillRect(box.x,box.y,box.w,box.h);
          c.strokeStyle='#ff6767';c.strokeRect(box.x,box.y,box.w,box.h);}
      }
    }
    debugOverlay(){
      const c=this.ctx,g=this.game;panel(c,35,187,425,170,.92);
      label(c,'DEBUG · FIXED TICK '+g.frame+' · '+g.phase,50,211,16,GOLD);
      for(const [i,f] of g.fighters.entries()){
        label(c,`P${i+1}  ${f.state}  atk:${f.attack?.button||'-'}  frame:${f.attackTick}  stun:${f.stun}`,50,242+i*39,15,'#daf0f6');
        label(c,'INPUT  '+(g.inputHistory[i+1]||[]).slice(0,3).map(v=>v.buttons.join('+')).join(' / '),50,259+i*39,13,'#9cd4eb');
      }
      label(c,'GREEN hurtbox · RED active hitbox',50,336,13,'#a9c4cf');
    }
    padOverlay(){
      const c=this.ctx,g=this.game,pads=g.input?.rawPads||[];
      const padHeight=166;
      panel(c,842,176,403,Math.max(115,52+pads.length*padHeight),.97);
      label(c,'RAW CONTROLLER INPUT · F4',856,202,18,GOLD);
      if(!pads.length)label(c,'NO CONTROLLERS DETECTED',856,251,17,'#c8d7e1');
      pads.forEach((p,i)=>{
        const y=234+i*padHeight;
        label(c,`PAD ${p.index} · ${FG.InputUtils.padFamily(p.id).toUpperCase()} · ${p.mapping}`,856,y,14,BLUE);
        label(c,(p.id||'').slice(0,37),856,y+19,13,'#bacdd9');
        label(c,'AXES  '+Array.from(p.axes||[]).slice(0,4).map((a,k)=>k+':'+Number(a).toFixed(2)).join('  '),856,y+40,12,'#d5eaf0');
        const buttons=Array.from(p.buttons||[]);
        for(let row=0;row<3;row++){
          const entries=buttons.slice(row*6,row*6+6).map((b,k)=>
            String(row*6+k).padStart(2,'0')+':'+Number(b.value??Number(b.pressed)).toFixed(2));
          label(c,entries.join('   '),856,y+60+row*20,12,'#e9d8a8','left','600');
        }
        const slot=Object.keys(g.input.padSlots).find(k=>g.input.padSlots[k]===p.index);
        label(c,slot?'ASSIGNED TO P'+slot:'PRESS BUTTON TO JOIN',856,y+137,13,GOLD);
      });

    }
  }
  FG.Renderer=Renderer;
})();

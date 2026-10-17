'use strict';
/* RE-Justice procedural fighter art — entirely visual, no combat-state mutation. */
(() => {
  const FG=window.FG=window.FG||{};
  const PI=Math.PI, OUTLINE='#080e19', LIGHT='#ffffff', CACHE_LIMIT=64;
  const CANVAS_WIDTH=310,CANVAS_HEIGHT=295,ART_SCALE=2.1, ORIGIN_X=155, ORIGIN_Y=260;
  const POSE_RATE=3, BREATH_RATE=.085, SWAY_RATE=.07, CAPE_RATE=.06;
  const ease=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
  const lerp=(a,b,t)=>a+(b-a)*t;
  const shade=(hex,scale)=>{const n=parseInt(hex.slice(1),16);return '#'+[16,8,0].map(k=>Math.min(255,Math.max(0,Math.round(((n>>k)&255)*scale))).toString(16).padStart(2,'0')).join('');};
  const rgba=(hex,a)=>{const n=parseInt(hex.slice(1),16);return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`;};
  const BUILDS=Object.freeze({
    speedster:{height:1.01,shoulders:1.04,waist:.91,muscle:.94,legs:1.07,head:.96},
    tactical:{height:1.05,shoulders:1.19,waist:.91,muscle:1.13,legs:1.05,head:1},
    powerhouse:{height:1.11,shoulders:1.26,waist:1.00,muscle:1.23,legs:1.06,head:.98},
    warrior:{height:1.07,shoulders:1.10,waist:.82,muscle:1.04,legs:1.09,head:1.04}
  });
  // Visual data only. More roster configurations can be added with no renderer changes.
  const LOOKS=Object.freeze({
    flash:{build:'speedster',skin:'#dba383',primary:'#bc202e',secondary:'#871824',accent:'#ffcc42',trim:'#f8d66a',hair:'none',mask:'half',emblem:'bolt',cape:'none',shoulderPads:false,gloves:true,boots:true,eyes:'#f7f5de',ear:'bolts',belt:'gold',panels:'speed',colors:['#bd2831','#84202c','#fbc649'],alternates:[['#771c31','#410f26','#b9b5be']]},
    batman:{build:'tactical',skin:'#b48d78',primary:'#252d3c',secondary:'#141c29',accent:'#f3c364',trim:'#76899c',hair:'none',mask:'cowl',emblem:'bat',cape:'scallop',shoulderPads:true,gloves:true,boots:true,eyes:'#dcf4ff',ear:'ears',belt:'gold',panels:'armor',colors:['#252d3c','#131d2c','#efc76e'],alternates:[['#404144','#202126','#dadada']]},
    superman:{build:'powerhouse',skin:'#e1ab8d',primary:'#2769ae',secondary:'#17335b',accent:'#f04443',trim:'#e7bc4b',hair:'wave',mask:'none',emblem:'diamond',cape:'flow',shoulderPads:false,gloves:false,boots:true,eyes:'#202a35',ear:'none',belt:'gold',panels:'hero',colors:['#2769ae','#18345d','#ec4544'],alternates:[['#161d29','#262e3d','#c4b6ae']]},
    'wonder-woman':{build:'warrior',skin:'#d6a285',primary:'#b52736',secondary:'#1f3f78',accent:'#f1cd66',trim:'#f2dd8e',hair:'long',mask:'tiara',emblem:'eagle',cape:'none',shoulderPads:true,gloves:true,boots:true,eyes:'#283747',ear:'none',belt:'gold',panels:'armor',colors:['#b52736','#213f79','#edc760'],alternates:[['#343e68','#162b5d','#d0c8e6']]}
  });
  const NEUTRAL={torso:0,lean:0,tilt:0,shoulders:0,head:0,hips:0,bodyY:0,legA:-.12,shinA:.20,legB:.18,shinB:-.20,armA:.53,foreA:-2.78,armB:-.46,foreB:2.54,stretch:1};
  // A and B: front/near vs rear/far. Angles measured from vertical down.
  const POSES={
    idle:{...NEUTRAL},
    walk:{...NEUTRAL,torso:-.05,lean:.12,armA:.82,foreA:-.46,armB:-.54,foreB:-.75,legA:.52,shinA:-.3,legB:-.53,shinB:.25},
    back:{...NEUTRAL,lean:-.13,armA:.46,armB:-.42,legA:-.44,shinA:.35,legB:.36,shinB:-.34},
    jump:{...NEUTRAL,bodyY:-9,torso:-.09,armA:1.06,foreA:-.7,armB:-.92,foreB:-.4,legA:.82,shinA:-1.12,legB:-.55,shinB:1.12},
    jump_forward:{...NEUTRAL,bodyY:-11,torso:.18,lean:.15,armA:1.28,foreA:-.60,armB:-.45,foreB:-.84,legA:1.0,shinA:-1.28,legB:-.63,shinB:1.3},
    fall:{...NEUTRAL,bodyY:4,torso:-.2,armA:1.15,foreA:-.36,armB:-.83,foreB:-.15,legA:.35,shinA:-.82,legB:-.1,shinB:.65},
    land:{...NEUTRAL,bodyY:16,torso:.18,legA:.50,shinA:-.9,legB:-.50,shinB:.9},
    crouch:{...NEUTRAL,bodyY:28,torso:.10,legA:.87,shinA:-1.42,legB:-.72,shinB:1.3,armA:.72,foreA:-1.2,armB:-.15,foreB:-1.12},
    crouch_block:{...NEUTRAL,bodyY:29,torso:-.10,legA:.90,shinA:-1.4,legB:-.7,shinB:1.22,armA:-.85,foreA:-1.0,armB:-.45,foreB:-1.1},
    stand_block:{...NEUTRAL,torso:-.12,armA:-1.2,foreA:-.3,armB:-.7,foreB:-.7},
    hit_light:{...NEUTRAL,torso:-.32,lean:-.27,head:-.22,armA:.65,foreA:.21,armB:-.9,foreB:.6},
    hit_heavy:{...NEUTRAL,torso:-.57,lean:-.42,head:-.45,armA:1.35,foreA:.2,armB:-1.35,foreB:-.22,legA:.45},
    launched:{...NEUTRAL,torso:-.65,bodyY:-12,armA:1.45,armB:-1.42,foreA:-.15,foreB:-.1,legA:1.0,shinA:-.6,legB:-.94,shinB:.8},
    knockdown:{...NEUTRAL,bodyY:80,torso:-1.5,armA:1.5,armB:-1.1,legA:1.25,shinA:-.8,legB:.8,shinB:-.3},
    get_up:{...NEUTRAL,bodyY:34,torso:.42,armA:1.4,foreA:-1,armB:-.8,legA:.85,shinA:-1.1},
    throw:{...NEUTRAL,lean:.24,torso:.27,armA:1.52,foreA:-.16,armB:1.12,foreB:.2},
    throw_victim:{...NEUTRAL,bodyY:-20,torso:-.75,armA:-.9,foreA:.5,armB:-1.4,foreB:.6},
    victory:{...NEUTRAL,bodyY:-3,torso:-.13,armA:-2.86,foreA:.12,armB:-.72,foreB:-.35},
    defeat:{...NEUTRAL,bodyY:18,torso:.39,head:.22,armA:.14,foreA:-.03,armB:-.11,foreB:.03,legA:.35,shinA:-.4},
    super:{...NEUTRAL,bodyY:-4,torso:-.16,armA:-2.15,foreA:-.19,armB:1.35,foreB:-.45,legA:.46,legB:-.38},
    power:{...NEUTRAL,armA:-1.45,foreA:-.4,armB:-1.12,foreB:.2,torso:-.15}
  };
  // Each attack family has unique upper/lower-body startup, strike and recovery poses.
  const ATTACKS={
    standing:{
      light:{wind:{armA:.13,foreA:-1.9,torso:-.16},strike:{armA:1.50,foreA:.03,torso:.20,lean:.17},recover:{armA:.76,foreA:-.96,torso:.07}},
      medium:{wind:{armA:-.29,foreA:-2.05,torso:-.30,armB:.42},strike:{armA:1.54,foreA:-.09,torso:.38,lean:.26,armB:-.5},recover:{armA:.8,foreA:-.94,torso:.10}},
      heavy:{wind:{armA:-.67,foreA:-1.68,torso:-.49,legA:-.28},strike:{armA:1.69,foreA:.24,torso:.52,lean:.38,legA:.54},recover:{armA:.91,foreA:-.63,torso:.23}}
    },
    crouching:{
      light:{wind:{...POSES.crouch,armA:.33,foreA:-1.46},strike:{...POSES.crouch,armA:1.52,foreA:.02,torso:.27},recover:POSES.crouch},
      medium:{wind:{...POSES.crouch,armA:-.33,foreA:-1.78},strike:{...POSES.crouch,armA:1.67,foreA:-.03,torso:.36},recover:POSES.crouch},
      heavy:{wind:{...POSES.crouch,legA:-.23,shinA:-.48,armA:.25},strike:{...POSES.crouch,legA:1.42,shinA:.11,torso:-.15,bodyY:19},recover:POSES.crouch}
    },
    airborne:{
      light:{wind:{...POSES.jump,armA:-.15,foreA:-1.65},strike:{...POSES.jump,armA:1.4,foreA:0,torso:.15},recover:POSES.fall},
      medium:{wind:{...POSES.jump,armA:-1.1,foreA:-1.4},strike:{...POSES.jump,armA:1.69,foreA:.05,torso:.27},recover:POSES.fall},
      heavy:{wind:{...POSES.jump,legA:1.3,shinA:-1.1},strike:{...POSES.jump,legA:1.55,shinA:0,torso:.29},recover:POSES.fall}
    }
  };
  const ANIMATIONS=['idle','walk','back','jump','jump_forward','fall','land','crouch','crouch_block','stand_block','hit_light','hit_heavy','launched','knockdown','get_up','throw','throw_victim','victory','defeat','super','power',
    ...['standing','crouching','airborne'].flatMap(k=>['light','medium','heavy'].map(b=>`${k}_${b}`))];
  function mix(a,b,t){const out={};for(const k of Object.keys(NEUTRAL))out[k]=lerp(a[k]??NEUTRAL[k],b[k]??NEUTRAL[k],ease(t));return out;}
  function sample(name,frame,attack=null){
    let animation=name;
    if(attack)animation=`${attack.kind}_${attack.button}`;
    const parts=animation.split('_');
    let p=POSES[animation]||POSES.idle;
    if(animation.startsWith('standing_')||animation.startsWith('crouching_')||animation.startsWith('airborne_')){
      const kind=animation.startsWith('standing_')?'standing':animation.startsWith('crouching_')?'crouching':'airborne';
      const type=animation.split('_').pop();
      const moves=ATTACKS[kind]?.[type]||ATTACKS.standing.light;
      const base=kind==='standing'?POSES.idle:kind==='crouching'?POSES.crouch:POSES.jump;
      const total=attack?attack.startup+attack.active+attack.recovery:30;
      const prep=attack?attack.startup:10,active=attack?attack.active:8;
      const t=Math.max(0,Math.min(total,frame));
      if(t<prep)p=mix(base,{...base,...moves.wind},t/Math.max(1,prep));
      else if(t<prep+active)p=mix({...base,...moves.wind},{...base,...moves.strike},(t-prep)/Math.max(1,Math.min(4,active)));
      else p=mix({...base,...moves.strike},{...base,...moves.recover},(t-prep-active)/Math.max(1,total-prep-active));
      p={...p,active:t>=prep&&t<prep+active,strike:type,kind};
    }else{
      const wave=Math.sin(frame*SWAY_RATE),step=Math.sin(frame*.25);
      p={...p};
      if(animation==='idle'){
        p.bodyY+=Math.sin(frame*BREATH_RATE)*1.2;p.torso+=wave*.015;
        p.armA+=wave*.038;p.armB-=wave*.023;
      }
      if(animation==='walk'||animation==='back'){
        p.legA+=step*.40;p.legB-=step*.40;p.shinA-=Math.max(0,step)*.43;p.shinB+=Math.max(0,-step)*.43;
        p.armA+=step*.25;p.armB-=step*.23;p.bodyY+=Math.abs(step)*2;
      }
      if(animation==='get_up'){p=mix(POSES.knockdown,POSES.idle,frame/32);}
      if(animation==='land'){p=mix(POSES.land,POSES.idle,frame/12);}
    }
    return p;
  }
  function path(c,pts,color,width=2){c.beginPath();pts(c);c.closePath();c.fillStyle=color;c.fill();if(width){c.strokeStyle=OUTLINE;c.lineWidth=width;c.lineJoin='round';c.stroke();}}
  function capsule(c,start,end,radA,radB,colors){
    // Broad rounded anatomical segment; its cap is hidden beneath parent/child.
    const dx=end.x-start.x,dy=end.y-start.y,L=Math.hypot(dx,dy)||1;
    const nx=-dy/L,ny=dx/L;
    const pa={x:start.x+nx*radA,y:start.y+ny*radA},pb={x:start.x-nx*radA,y:start.y-ny*radA};
    const qa={x:end.x+nx*radB,y:end.y+ny*radB},qb={x:end.x-nx*radB,y:end.y-ny*radB};
    path(c,ctx=>{
      ctx.moveTo(pa.x,pa.y);ctx.bezierCurveTo(pa.x+dx*.33,pa.y+dy*.33,qa.x-dx*.17,qa.y-dy*.17,qa.x,qa.y);
      ctx.quadraticCurveTo(end.x+dx*.12,end.y+dy*.12,qb.x,qb.y);
      ctx.bezierCurveTo(qb.x-dx*.22,qb.y-dy*.22,pb.x+dx*.36,pb.y+dy*.36,pb.x,pb.y);
      ctx.quadraticCurveTo(start.x-dx*.12,start.y-dy*.12,pa.x,pa.y);
    },colors.base,2.8);
    // The highlight is an inset Bézier ribbon rather than a rectangle.
    c.save();c.globalAlpha=.58;c.strokeStyle=colors.light;c.lineWidth=Math.max(2,radB*.48);c.lineCap='round';
    c.beginPath();c.moveTo(start.x+nx*radA*.4,start.y+ny*radA*.4);
    c.quadraticCurveTo(start.x+dx*.48+nx*radA*.4,start.y+dy*.48+ny*radA*.4,end.x+nx*radB*.36,end.y+ny*radB*.36);c.stroke();c.restore();
  }
  function joint(x,y,a,length){return {x:x+Math.sin(a)*length,y:y+Math.cos(a)*length};}
  function ball(c,x,y,r,fill){c.beginPath();c.ellipse(x,y,r,r*.9,0,0,2*PI);c.fillStyle=fill;c.fill();c.lineWidth=2.3;c.strokeStyle=OUTLINE;c.stroke();}
  function stroke(c,a,b,color,width){c.lineWidth=width;c.lineCap='round';c.strokeStyle=color;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();}
  function drawCape(c,look,p,frame,shoulderY,waistY,w){
    if(look.cape==='none')return;
    const flutter=Math.sin(frame*CAPE_RATE)*9+Math.sin(frame*.032+2)*6;
    const right=w*.57;
    const colors=look.id==='batman'?['#141b29','#242e3e']:['#a92335','#d53843'];
    c.save();c.globalAlpha=.98;
    path(c,ctx=>{
      ctx.moveTo(-w*.9,shoulderY+4);ctx.bezierCurveTo(-w*1.20,shoulderY+27,-w*.88+flutter,waistY+58,-w*1.35+flutter,-1);
      if(look.cape==='scallop'){
        ctx.quadraticCurveTo(-w*.95+flutter,-24,-w*.70+flutter,-9);
        ctx.quadraticCurveTo(-w*.45+flutter,-21,-w*.18+flutter,-5);
        ctx.quadraticCurveTo(w*.12+flutter,-23,w*.36+flutter,-4);
      }else{ctx.bezierCurveTo(-w*.45+flutter,2,w*.6+flutter,-15,right+flutter,5);}
      ctx.bezierCurveTo(right+flutter,waistY-10,w*.95,shoulderY+36,w*.8,shoulderY+1);
      ctx.closePath();
    },colors[0],3.1);
    c.lineWidth=2.2;c.strokeStyle=colors[1];c.beginPath();c.moveTo(-w*.8,shoulderY+16);
    c.quadraticCurveTo(-w*.66+flutter*.35,waistY+22,-w*.86+flutter,-14);c.stroke();
    c.restore();
  }
  function drawHead(c,look,build,x,y,angle){
    c.save();c.translate(x,y);c.rotate(angle);const r=16.8*build.head;
    const complexion=look.skin,helmet=look.primary;
    // Neck and swept throat contour sit behind the jaw.
    path(c,q=>{q.moveTo(-8,17);q.quadraticCurveTo(-7,27,-14,30);q.lineTo(14,30);q.quadraticCurveTo(8,27,7,17);},shade(complexion,.79),1.7);
    path(c,q=>{q.moveTo(-r,-7);q.bezierCurveTo(-r-2,-24,r+2,-24,r,-7);q.lineTo(r*.91,10);q.quadraticCurveTo(11,23,0,24);q.quadraticCurveTo(-11,22,-r*.91,10);},complexion,3.2);
    // Half-mask, superhero cowl, or open face.
    if(look.mask==='half'||look.mask==='cowl'){
      path(c,q=>{q.moveTo(-r-1,-7);q.bezierCurveTo(-r-3,-24,r+3,-24,r+1,-7);
        q.lineTo(r*.96,4);q.quadraticCurveTo(0,-2,-r*.96,4);},helmet,2.5);
      if(look.mask==='cowl'){
        path(c,q=>{q.moveTo(-r+1,-12);q.lineTo(-r*.88,-39);q.lineTo(-r*.27,-19);q.lineTo(r*.34,-19);q.lineTo(r*.92,-39);q.lineTo(r-1,-10);},helmet,2.8);
        c.fillStyle=look.eyes;c.beginPath();c.ellipse(-7,1,5,2,-.10,0,2*PI);c.ellipse(7,1,5,2,.10,0,2*PI);c.fill();
      }else{
        c.fillStyle='#17202d';c.beginPath();c.ellipse(-6,2,3.6,2,0,0,2*PI);c.ellipse(7,2,3.6,2,0,0,2*PI);c.fill();
      }
    }else{
      if(look.hair==='wave'){
        path(c,q=>{q.moveTo(-r,-4);q.quadraticCurveTo(-r-5,-29,3,-25);q.quadraticCurveTo(14,-28,r+2,-13);
          q.quadraticCurveTo(r*.43,-13,9,-20);q.quadraticCurveTo(-3,-11,-r+1,-11);},'#141a29',2.6);
        path(c,q=>{q.moveTo(4,-21);q.quadraticCurveTo(17,-28,13,-15);q.quadraticCurveTo(10,-8,6,-10);},'#1d2737',1.5);
      }
      c.lineCap='round';c.lineWidth=2.4;c.strokeStyle='#1d2634';
      c.beginPath();c.moveTo(-10,1);c.lineTo(-4,0);c.moveTo(4,0);c.lineTo(10,1);c.stroke();
    }
    if(look.hair==='long'){
      path(c,q=>{q.moveTo(-r+2,-18);q.bezierCurveTo(-r-13,-13,-r-15,27,-r-6,52);q.lineTo(-r+5,42);q.lineTo(-r+4,-7);},'#1a1b28',1.5);
      path(c,q=>{q.moveTo(r-4,-18);q.bezierCurveTo(r+13,-5,r+13,26,r+8,50);q.lineTo(r-3,40);q.lineTo(r-4,-7);},'#141927',1.5);
    }
    if(look.mask==='tiara'){
      path(c,q=>{q.moveTo(-r,-8);q.lineTo(0,-24);q.lineTo(r,-8);q.lineTo(8,-9);q.lineTo(0,-14);q.lineTo(-9,-9);},look.trim,2);
      ball(c,0,-13,3.5,'#bd2b35');
    }
    if(look.ear==='bolts')for(const sign of [-1,1]){
      path(c,q=>{q.moveTo(sign*(r-2),-10);q.lineTo(sign*(r+13),-25);q.lineTo(sign*(r+8),-10);q.lineTo(sign*(r+19),-13);q.lineTo(sign*(r+2),3);},look.accent,1.8);
    }
    // Nose / mouth + two-tone cheek shading.
    c.globalAlpha=.35;path(c,q=>{q.moveTo(2,4);q.lineTo(7,13);q.quadraticCurveTo(4,14,1,12);},shade(complexion,.64),0);
    c.globalAlpha=1;c.lineWidth=1.25;c.strokeStyle=shade(complexion,.55);
    c.beginPath();c.moveTo(-4,17);c.quadraticCurveTo(0,18,5,17);c.stroke();
    c.restore();
  }
  function emblem(c,look){
    const a=look.accent;c.save();c.translate(0,-118);
    if(look.emblem==='bolt'){
      path(c,q=>{q.moveTo(-8,-16);q.lineTo(11,-17);q.lineTo(2,-3);q.lineTo(10,-3);q.lineTo(-12,22);q.lineTo(-4,1);q.lineTo(-13,1);},a,1.8);
      c.strokeStyle='rgba(255,253,202,.85)';c.lineWidth=1;c.beginPath();c.moveTo(-6,-13);c.lineTo(7,-14);c.stroke();
    }else if(look.emblem==='bat'){
      c.save();c.scale(1.0,.75);path(c,q=>{q.moveTo(-17,-3);q.quadraticCurveTo(-10,-15,-6,-5);q.lineTo(-3,-10);q.lineTo(0,-6);q.lineTo(3,-10);q.lineTo(6,-5);q.quadraticCurveTo(10,-15,17,-3);q.quadraticCurveTo(9,0,6,8);q.lineTo(0,3);q.lineTo(-6,8);q.quadraticCurveTo(-10,0,-17,-3);},'#0a1017',1.3);c.restore();
    }else if(look.emblem==='diamond'){
      path(c,q=>{q.moveTo(-20,-10);q.lineTo(20,-10);q.lineTo(17,5);q.lineTo(0,20);q.lineTo(-17,5);},'#d32e3c',2.8);
      path(c,q=>{q.moveTo(-14,-5);q.lineTo(14,-5);q.lineTo(11,3);q.lineTo(0,13);q.lineTo(-11,3);},look.trim,1.5);
      c.strokeStyle='#d32e3c';c.lineWidth=4;c.beginPath();c.moveTo(11,-3);c.bezierCurveTo(-10,-13,-11,9,7,6);c.stroke();
    }else if(look.emblem==='eagle'){
      path(c,q=>{q.moveTo(-24,-7);q.lineTo(-8,-14);q.lineTo(0,-5);q.lineTo(8,-14);q.lineTo(24,-7);q.lineTo(8,8);q.lineTo(0,1);q.lineTo(-8,8);},a,2.2);
    }
    c.restore();
  }
  function renderBody(c,look,pose,frame,options={}){
    const build=BUILDS[look.build]||BUILDS.speedster;
    const w=33*build.shoulders,shoulderY=-147*build.height+pose.bodyY;
    const hipY=-66*build.legs+pose.bodyY;
    const chestY=shoulderY+21,waistY=hipY-8;
    const skin=look.skin,accent=look.accent,base=look.primary,secondary=look.secondary;
    const breathe=1+Math.sin(frame*BREATH_RATE)*.012;
    c.save();c.translate(pose.lean*9,0);c.rotate(pose.torso*.07);
    drawCape(c,look,pose,frame,shoulderY,waistY,w);
    const bodyTop=shoulderY-2;
    const hipLeft={x:-16*build.waist,y:hipY},hipRight={x:16*build.waist,y:hipY};
    const joints={};
    const drawLeg=(side,angle,shin,depth)=>{
      const hip=side===1?hipRight:hipLeft;
      const thigh=43*build.legs,calf=44*build.legs;
      const knee=joint(hip.x,hip.y,angle,thigh),ankle=joint(knee.x,knee.y,angle+shin,calf);
      joints[side===1?'rightHip':'leftHip']=hip;joints[side===1?'rightKnee':'leftKnee']=knee;
      joints[side===1?'rightAnkle':'leftAnkle']=ankle;
      capsule(c,hip,knee,12.2*build.muscle,10*build.muscle,{base:depth?shade(secondary,.94):base,light:shade(base,1.22)});
      ball(c,knee.x,knee.y,9*build.muscle,depth?secondary:base);
      capsule(c,knee,ankle,9.2,6.7,{base:depth?shade(secondary,.87):secondary,light:shade(base,1.26)});
      path(c,q=>{q.moveTo(ankle.x-8,ankle.y-3);q.bezierCurveTo(ankle.x+1,ankle.y-6,ankle.x+17,ankle.y+2,ankle.x+23,ankle.y+7);
        q.quadraticCurveTo(ankle.x+28,ankle.y+15,ankle.x+18,ankle.y+17);q.lineTo(ankle.x-10,ankle.y+15);},look.boots?base:secondary,2.6);
      c.strokeStyle=accent;c.lineWidth=2;c.beginPath();c.moveTo(ankle.x-6,ankle.y+8);c.lineTo(ankle.x+15,ankle.y+10);c.stroke();
    };
    drawLeg(-1,pose.legB,pose.shinB,true);
    // Rear arm must be behind torso silhouette.
    const drawArm=(side,a,fore,depth)=>{
      const x=side===1?w*.79:-w*.79;
      const shoulder={x,y:shoulderY+7};const upper=36*build.muscle,low=32*build.muscle;
      const elbow=joint(shoulder.x,shoulder.y,a,upper),wrist=joint(elbow.x,elbow.y,a+fore,low);
      joints[side===1?'rightShoulder':'leftShoulder']=shoulder;
      joints[side===1?'rightElbow':'leftElbow']=elbow;
      joints[side===1?'rightWrist':'leftWrist']=wrist;
      capsule(c,shoulder,elbow,12.9*build.muscle,10.4*build.muscle,{base:depth?secondary:base,light:shade(base,1.23)});
      ball(c,elbow.x,elbow.y,9,base);
      capsule(c,elbow,wrist,10.1,7.7,{base:look.gloves?shade(base,.79):base,light:shade(base,1.35)});
      ball(c,wrist.x,wrist.y,9.2,look.gloves?base:skin);
      if(look.shoulderPads){
        path(c,q=>{q.moveTo(shoulder.x-15,shoulder.y+6);q.quadraticCurveTo(shoulder.x-20,shoulder.y-17,shoulder.x,shoulder.y-17);
          q.quadraticCurveTo(shoulder.x+19,shoulder.y-10,shoulder.x+16,shoulder.y+8);},depth?secondary:base,2.4);
        c.strokeStyle=look.trim;c.lineWidth=2;c.beginPath();c.moveTo(shoulder.x-11,shoulder.y-10);c.lineTo(shoulder.x+6,shoulder.y-14);c.stroke();
      }
    };
    drawArm(-1,pose.armB,pose.foreB,true);
    // Chest and layered costume armor are contoured separately from the limbs.
    path(c,q=>{
      q.moveTo(-w*.70,bodyTop+4);q.bezierCurveTo(-w*.9,bodyTop+20,-w*.64,chestY+23,-w*.54,waistY);
      q.quadraticCurveTo(-21,hipY+3,0,hipY+5);q.quadraticCurveTo(21,hipY+3,w*.54,waistY);
      q.bezierCurveTo(w*.67,chestY+17,w*.93,bodyTop+17,w*.70,bodyTop+4);
      q.quadraticCurveTo(0,bodyTop-9,-w*.70,bodyTop+4);
    },secondary,3.6);
    path(c,q=>{q.moveTo(-w*.75,bodyTop+8);q.quadraticCurveTo(-w*.60,chestY+24,-w*.44,chestY+30);
      q.quadraticCurveTo(0,chestY+38,w*.44,chestY+30);q.quadraticCurveTo(w*.60,chestY+24,w*.75,bodyTop+8);
      q.quadraticCurveTo(0,bodyTop-8,-w*.75,bodyTop+8);},base,3.2);
    // Colored diagonal cel-shading on the chest and abdomen.
    c.save();c.globalAlpha=.55;
    path(c,q=>{q.moveTo(-w*.56,bodyTop+13);q.quadraticCurveTo(-w*.2,bodyTop+6,0,bodyTop+4);
      q.lineTo(-w*.05,chestY+22);q.lineTo(-w*.45,chestY+17);},shade(base,1.35),0);
    path(c,q=>{q.moveTo(w*.09,chestY+31);q.lineTo(w*.51,chestY+30);q.lineTo(w*.36,waistY-7);q.lineTo(0,hipY-4);},shade(secondary,.75),0);
    c.restore();
    // Waist armor, belt, and segmented hip guards.
    path(c,q=>{q.moveTo(-w*.52,waistY-3);q.lineTo(w*.52,waistY-3);q.lineTo(w*.48,hipY+4);q.lineTo(-w*.48,hipY+4);},look.belt==='gold'?look.accent:shade(secondary,1.25),2.7);
    c.fillStyle=shade(accent,.78);c.strokeStyle=OUTLINE;c.lineWidth=2.2;
    c.beginPath();c.roundRect(-10,waistY-5,20,16,3);c.fill();c.stroke();
    if(look.panels==='armor'){
      c.strokeStyle=look.trim;c.lineWidth=2.1;
      c.beginPath();c.moveTo(-w*.6,bodyTop+17);c.lineTo(-w*.32,chestY+24);
      c.moveTo(w*.6,bodyTop+17);c.lineTo(w*.32,chestY+24);c.stroke();
    }
    if(look.panels==='speed'){
      c.strokeStyle=accent;c.lineWidth=3.2;c.beginPath();
      c.moveTo(-w*.6,chestY+12);c.lineTo(-w*.35,chestY+29);
      c.moveTo(w*.6,chestY+12);c.lineTo(w*.35,chestY+29);c.stroke();
    }
    emblem(c,look);
    drawLeg(1,pose.legA,pose.shinA,false);
    drawArm(1,pose.armA,pose.foreA,false);
    const head={x:pose.tilt*3,y:bodyTop-28+Math.sin(frame*.05)*.75};
    joints.neck={x:0,y:bodyTop-6};joints.head=head;
    drawHead(c,look,build,head.x,head.y,pose.head+pose.torso*.28);
    // Subtle impact scuffs, no hitbox or health changes.
    if(options.healthRatio!==undefined&&options.healthRatio<.28){
      c.strokeStyle='rgba(20,18,30,.7)';c.lineWidth=2;c.beginPath();
      c.moveTo(16,bodyTop+29);c.lineTo(5,bodyTop+40);c.lineTo(17,bodyTop+45);
      c.moveTo(-12,hipY-13);c.lineTo(-18,hipY-5);c.stroke();
    }
    if(pose.active){
      const x=joints.rightWrist?.x||60,y=joints.rightWrist?.y||-110;
      const px=Math.max(x+9,52);
      c.save();c.globalCompositeOperation='screen';c.strokeStyle=rgba(accent,.35);c.lineWidth=15;c.lineCap='round';
      c.beginPath();c.moveTo(px-26,y-7);c.quadraticCurveTo(px-8,y-7,px+34,y+3);c.stroke();c.restore();
    }
    c.restore();return joints;
  }
  const cache=new Map();
  function renderFrame(def,animation,frame=0,options={}){
    const look=LOOKS[def?.id];if(!look)return null;
    const sampledFrame=Math.round(frame/POSE_RATE)*POSE_RATE;
    const attack=options.attack||null;
    const kind=attack?`${attack.kind}_${attack.button}_${attack.startup}_${attack.active}_${attack.recovery}`:animation;
    const health=options.healthRatio<.28?'worn':'normal';
    const flash=options.flash?'flash':'normal';
    const key=[def.id,kind,sampledFrame%Math.max(1,(attack?.startup||0)+(attack?.active||0)+(attack?.recovery||0)||120),health,flash,options.variant||0].join('|');
    if(!options.debug&&cache.has(key)){const hit=cache.get(key);cache.delete(key);cache.set(key,hit);return hit;}
    const canvas=document.createElement('canvas');canvas.width=Math.round(CANVAS_WIDTH*ART_SCALE);canvas.height=Math.round(CANVAS_HEIGHT*ART_SCALE);
    const ctx=canvas.getContext('2d');ctx.scale(ART_SCALE,ART_SCALE);
    ctx.translate(ORIGIN_X,ORIGIN_Y);
    const lookData={...look,id:def.id};
    if(options.variant&&look.alternates[options.variant-1]){
      [lookData.primary,lookData.secondary,lookData.accent]=look.alternates[options.variant-1];
    }
    const pose=sample(animation,sampledFrame,attack);
    ctx.save();ctx.translate(0,0);ctx.scale(1,pose.stretch||1);
    const joints=renderBody(ctx,lookData,pose,sampledFrame,options);ctx.restore();
    if(options.flash){ctx.globalCompositeOperation='screen';ctx.fillStyle='rgba(255,233,190,.13)';ctx.fillRect(-80,-250,160,255);}
    const out={canvas,joints,pose,look:lookData};
    if(!options.debug){cache.set(key,out);if(cache.size>CACHE_LIMIT)cache.delete(cache.keys().next().value);}
    return out;
  }
  function draw(ctx,def,x,feet,scale=1,frame=0,animation='idle',options={}){
    const image=renderFrame(def,animation,frame,options);if(!image)return false;
    ctx.save();ctx.translate(x,feet);ctx.scale((options.facing||1)*scale,scale);
    if(options.shadow!==false){ctx.fillStyle='rgba(0,0,0,.23)';ctx.beginPath();ctx.ellipse(0,1,37,8,0,0,2*PI);ctx.fill();}
    ctx.drawImage(image.canvas,-ORIGIN_X,-ORIGIN_Y,CANVAS_WIDTH,CANVAS_HEIGHT);
    if(options.skeleton){
      const j=image.joints;ctx.save();ctx.strokeStyle='#69f5ee';ctx.fillStyle='#fbda8d';ctx.lineWidth=1.3;
      const joins=[['leftHip','leftKnee'],['leftKnee','leftAnkle'],['rightHip','rightKnee'],['rightKnee','rightAnkle'],
        ['leftShoulder','leftElbow'],['leftElbow','leftWrist'],['rightShoulder','rightElbow'],['rightElbow','rightWrist'],['neck','head']];
      for(const [a,b] of joins)if(j[a]&&j[b]){stroke(ctx,j[a],j[b],'#6ff4ed',1.2);}
      for(const pt of Object.values(j))if(pt){ctx.beginPath();ctx.arc(pt.x,pt.y,2.7,0,2*PI);ctx.fill();}
      ctx.restore();
    }
    if(options.hitboxes){
      const boxes=def.hurtboxes;
      const b=boxes?.[options.attack?.kind||'standing']||boxes?.standing;
      if(b){ctx.fillStyle='rgba(85,233,143,.12)';ctx.strokeStyle='#7bed9a';ctx.lineWidth=1;ctx.fillRect(b.x,b.y,b.w,b.h);ctx.strokeRect(b.x,b.y,b.w,b.h);}
      const move=options.attack;
      if(move&&image.pose.active){const left=20;ctx.fillStyle='rgba(255,85,95,.22)';ctx.strokeStyle='#ff5d78';
        ctx.fillRect(left,move.offsetY-move.height/2,move.reach,move.height);ctx.strokeRect(left,move.offsetY-move.height/2,move.reach,move.height);
      }
    }
    ctx.restore();return true;
  }
  function drawFighter(ctx,f,x,feet,size=1,opacity=1){
    if(!LOOKS[f.def.id])return false;
    ctx.save();ctx.globalAlpha*=opacity;
    const animation=f.attack?`${f.attack.kind}_${f.attack.button}`:
      f.state==='walk'?'walk':f.state==='jump'?f.vy<0?'jump':'fall':
      f.state==='block'?'stand_block':f.state==='blockstun'?'stand_block':
      f.state==='crouch'?'crouch':f.state==='hitstun'?'hit_light':
      f.state==='victory'?'victory':'idle';
    const opts={facing:f.facing,attack:f.attack,flash:!!f.flash&&f.flash%3!==0,healthRatio:f.health/f.maxHealth};
    const ret=draw(ctx,f.def,x,feet,size,f.attack?f.attackTick:f.animClock,animation,opts);
    ctx.restore();return ret;
  }
  function preview(ctx,def,frame=0){
    return draw(ctx,def,640,649,2.35,frame,'idle',{facing:1,shadow:false});
  }
  function portrait(def){
    if(!LOOKS[def?.id])return null;
    const canvas=document.createElement('canvas');canvas.width=192;canvas.height=270;
    const c=canvas.getContext('2d');const g=c.createLinearGradient(0,0,192,270);g.addColorStop(0,'#304258');g.addColorStop(1,'#0a111e');c.fillStyle=g;c.fillRect(0,0,192,270);
    draw(c,def,96,266,1.18,0,'idle',{shadow:false});return canvas;
  }
  FG.FighterRig={LOOKS,BUILDS,POSES,ATTACKS,ANIMATIONS,constants:{CANVAS_WIDTH,CANVAS_HEIGHT,ART_SCALE,POSE_RATE,CACHE_LIMIT},sample,draw,drawFighter,preview,portrait,renderFrame,cache};
})();

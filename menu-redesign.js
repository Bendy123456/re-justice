'use strict';
/*
 * RE-JUSTICE — actual interactive title screen, v1.
 * Three full-card hit targets; hover, keyboard/controller focus and click all
 * use the existing Game menu state. Fully Canvas2D / 60fps compatible.
 * Artwork is pre-rendered into cached canvas layers for consistent performance.
 */
(()=> {
  const FG=window.FG=window.FG||{};
  const W=1280,H=720;
  const MODES=[
    {id:'online',num:'01',kind:'NETWORK',name:'1V1 ONLINE',desc:'Challenge another player in a future update.',
      foot:'MULTIPLAYER   /   COMING LATER',accent:'#24cfff',edge:'#0b628b',rect:[676,74,579,205]},
    {id:'cpu',num:'02',kind:'SOLO MODE',name:'1V1 VS BOT',desc:'Train, practice and master your fighter.',
      foot:'SOLO TRAINING   /   LOCAL MATCH',accent:'#ffc554',edge:'#b27a24',rect:[676,292,579,194]},
    {id:'sandbox',num:'03',kind:'FREE ROAM',name:'SANDBOX',desc:'Choose any character and explore',
      foot:'the training grounds. No bot. No timer.',accent:'#3fe9bd',edge:'#168d79',rect:[676,501,579,176]}
  ];
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  function rr(c,x,y,w,h,r=11){c.beginPath();c.roundRect(x,y,w,h,r);}
  function line(c,x,y,x2,y2,col,width=1){c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.strokeStyle=col;c.lineWidth=width;c.stroke();}
  function text(c,s,x,y,size,color='#fff',weight=700,align='left'){
    c.font=weight+' '+size+'px Arial,system-ui,sans-serif';
    c.textAlign=align;c.textBaseline='alphabetic';c.fillStyle=color;c.fillText(s,x,y);
  }
  function gradient(c,x,y,w,h,colors){
    const g=c.createLinearGradient(x,y,x+w,y+h);
    for(const e of colors)g.addColorStop(e[0],e[1]);return g;
  }
  function glow(c,x,y,r,rgba){
    const g=c.createRadialGradient(x,y,1,x,y,r);
    g.addColorStop(0,rgba);g.addColorStop(1,'rgba(0,0,0,0)');
    c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);
  }
  function roof(c,x,y,w,depth,color){
    c.fillStyle=color;c.beginPath();
    c.moveTo(x-24,y+4);c.lineTo(x+w+25,y+4);
    c.lineTo(x+w+7,y-depth);c.lineTo(x+w*.5,y-depth-27);
    c.lineTo(x-9,y-depth);c.closePath();c.fill();
    c.fillStyle='rgba(0,0,0,.68)';c.fillRect(x-18,y+4,w+36,12);
    line(c,x-24,y+4,x+w+24,y+4,'rgba(205,65,47,.55)',3);
  }
  function lantern(c,x,y,scale=1){
    c.save();c.translate(x,y);c.scale(scale,scale);
    const g=c.createRadialGradient(0,0,0,0,0,52);
    g.addColorStop(0,'rgba(255,145,60,.55)');g.addColorStop(1,'rgba(255,115,42,0)');
    c.fillStyle=g;c.fillRect(-52,-52,104,104);
    c.fillStyle='#201715';c.fillRect(-7,-13,14,3);c.fillRect(-8,9,16,4);
    c.fillStyle='#ffc77a';c.fillRect(-5,-9,10,18);
    c.fillStyle='#8f5030';c.fillRect(-1,-9,2,18);c.restore();
  }
  function tree(c,x,y,s=1){
    c.save();c.translate(x,y);c.scale(s,s);
    c.lineCap='round';
    c.strokeStyle='#130f14';c.lineWidth=21;
    c.beginPath();c.moveTo(-34,115);c.bezierCurveTo(-25,30,4,-22,30,-96);c.stroke();
    c.lineWidth=11;
    for(const b of [[11,-11,-54,-72],[14,-22,91,-86],[28,-66,103,-133],[-1,-16,-92,-45],[16,-48,-65,-130]]){
      c.beginPath();c.moveTo(b[0],b[1]);c.lineTo(b[2],b[3]);c.stroke();
    }
    let seed=7413;
    const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
    for(let i=0;i<290;i++){
      const angle=rnd()*Math.PI*2,r=rnd();
      const cx=Math.cos(angle)*r*126,cy=-104+Math.sin(angle)*r*84;
      const size=2.5+rnd()*8.5;
      c.fillStyle=['#421922','#6d2227','#8a2b31','#a93e3b','#481925'][Math.floor(rnd()*5)];
      c.fillRect(cx,cy,size,size*.55);
    }
    c.restore();
  }
  function templeBackdrop(){
    const cv=document.createElement('canvas');cv.width=W;cv.height=H;const c=cv.getContext('2d');
    c.fillStyle=gradient(c,0,0,W,H,[[0,'#101d2b'],[.55,'#112032'],[1,'#030b15']]);c.fillRect(0,0,W,H);
    glow(c,450,305,420,'rgba(41,86,120,.25)');
    glow(c,490,360,360,'rgba(180,65,48,.18)');
    // Layered weathered stone walls and distant traditional tiled rooftops.
    c.fillStyle='#162431';c.fillRect(90,217,815,248);
    for(let row=0;row<9;row++)for(let col=0;col<20;col++){
      const xx=95+col*48+(row%2)*24,yy=216+row*27;
      line(c,xx,yy,xx+45,yy,'rgba(83,111,132,.085)',1);
      line(c,xx,yy,xx,yy+27,'rgba(83,111,132,.07)',1);
    }
    roof(c,169,288,590,72,'#10141a');
    c.fillStyle='#401b1b';
    for(let i=0;i<8;i++){
      const x=210+i*68;c.fillRect(x,304,17,250);
      c.fillStyle='#5d2923';c.fillRect(x+3,308,5,230);c.fillStyle='#401b1b';
    }
    line(c,190,310,755,310,'#5f272a',14);
    roof(c,164,294,624,75,'#151a20');
    // Double temple gate entrance and tiered stairway.
    c.fillStyle='#070b11';c.fillRect(354,360,250,189);
    c.fillStyle='#3d171a';c.fillRect(365,363,17,203);c.fillRect(574,363,17,203);
    c.fillStyle='#7e3b2d';c.fillRect(369,363,4,203);c.fillRect(579,363,4,203);
    for(let i=0;i<7;i++){
      const by=511+i*16,x=338-i*28;
      c.fillStyle=i%2?'#3a3540':'#343641';
      c.beginPath();c.moveTo(x,by);c.lineTo(617+i*26,by);c.lineTo(633+i*28,by+14);
      c.lineTo(x-18,by+14);c.fill();
    }
    // Reflective stone foreground, subtle irregular pavement.
    c.fillStyle=gradient(c,0,548,W,172,[[0,'#1b2530'],[1,'#060b14']]);
    c.fillRect(0,548,W,172);
    for(let j=0;j<19;j++){
      const yy=553+j*j*.49;
      line(c,0,yy,W,yy,'rgba(158,175,188,.047)',j%3?1:2);
    }
    for(let k=-11;k<24;k++){
      line(c,475,546,k*97,720,'rgba(162,176,190,.050)',1);
    }
    // Warm lanterns, red leaves and warm floor reflections.
    for(const [x,y,s] of [[249,344,1.3],[565,354,1.0],[700,379,.85],[324,564,1.1]]){
      lantern(c,x,y,s);glow(c,x,668,115,'rgba(215,90,45,.09)');
    }
    tree(c,184,224,1.55);
    c.fillStyle='rgba(2,6,11,.18)';c.fillRect(0,70,800,650);
    return cv;
  }
  function dummy(c,x,y,scale=1){
    c.save();c.translate(x,y);c.scale(scale,scale);
    c.shadowColor='rgba(0,0,0,.6)';c.shadowBlur=16;c.shadowOffsetY=9;
    const body=gradient(c,-45,-50,90,135,[[0,'#a0a8ad'],[.5,'#747b82'],[1,'#353b45']]);
    c.fillStyle='#414952';rr(c,-54,-26,35,64,5);c.fill();
    rr(c,19,-26,35,64,5);c.fill();
    c.fillStyle=body;rr(c,-32,-29,64,87,6);c.fill();
    c.fillStyle='#9299a2';rr(c,-22,-78,44,44,9);c.fill();
    c.fillStyle='#232b33';c.fillRect(-11,-56,7,5);c.fillRect(7,-56,7,5);
    c.strokeStyle='#333b44';c.lineWidth=2;c.beginPath();c.arc(0,-44,8,.25,2.7);c.stroke();
    c.fillStyle='#606975';rr(c,-26,57,23,83,4);c.fill();rr(c,4,57,23,83,4);c.fill();
    c.fillStyle='#2b3340';rr(c,-28,126,26,11,4);c.fill();rr(c,3,126,26,11,4);c.fill();
    c.restore();
  }
  function sandboxScene(){
    const cv=document.createElement('canvas');cv.width=580;cv.height=180;const c=cv.getContext('2d');
    c.fillStyle=gradient(c,0,0,580,180,[[0,'#579bc6'],[.58,'#8bcde4'],[1,'#dcdfaa']]);
    c.fillRect(0,0,580,180);glow(c,430,35,100,'rgba(255,242,188,.8)');
    // Verdant foliage and masonry training arena.
    c.fillStyle='#62815f';
    c.beginPath();c.moveTo(0,85);c.lineTo(72,67);c.lineTo(129,85);c.lineTo(209,52);
    c.lineTo(286,74);c.lineTo(340,55);c.lineTo(425,83);c.lineTo(580,58);
    c.lineTo(580,124);c.lineTo(0,124);c.fill();
    c.fillStyle='#6c7470';c.fillRect(0,96,580,42);
    for(let row=0;row<3;row++)for(let col=0;col<17;col++){
      line(c,col*37+(row%2)*18,98+row*14,
        col*37+(row%2)*18+34,98+row*14,'rgba(19,32,40,.3)');
    }
    c.fillStyle='#2b5840';c.fillRect(0,135,580,45);
    c.fillStyle='#9f9377';c.beginPath();c.moveTo(0,158);c.lineTo(265,127);
    c.lineTo(390,129);c.lineTo(580,171);c.lineTo(580,180);c.lineTo(0,180);c.fill();
    for(let i=0;i<10;i++){
      const x=i*70+15;
      c.fillStyle='#4d463e';c.fillRect(x,96,5,45);
      c.fillStyle='#241f1d';c.fillRect(x-3,93,11,5);
    }
    // Wooden training tower, target and some wooden barricades.
    c.fillStyle='#49362a';c.fillRect(386,59,12,86);c.fillRect(427,59,12,86);
    c.fillStyle='#6e4a30';c.fillRect(379,56,66,10);c.fillRect(382,79,57,6);
    roof(c,383,60,52,7,'#362b26');
    c.fillStyle='#403e37';c.fillRect(529,85,9,65);
    c.fillStyle='#ddd7bc';c.beginPath();c.arc(533,94,17,0,7);c.fill();
    c.strokeStyle='#8e6c4f';c.lineWidth=4;c.beginPath();c.arc(533,94,9,0,7);c.stroke();
    c.fillStyle='#4c3429';c.fillRect(316,136,30,25);c.fillRect(343,140,33,22);
    for(let i=0;i<20;i++){
      const x=(i*173)%580,y=145+(i*39)%35;c.fillStyle=i%3?'#3e6947':'#678c4f';c.fillRect(x,y,2,7);
    }
    return cv;
  }
  function cardArt(c,mode,x,y,w,h){
    c.save();rr(c,x,y,w,h,11);c.clip();
    if(mode==='sandbox'){
      const im=state.sandbox;
      c.drawImage(im,x,y,w,h);
      c.fillStyle=gradient(c,x,y,w*.90,0,[[0,'rgba(3,17,23,.97)'],[.66,'rgba(2,18,25,.80)'],[1,'rgba(3,18,21,0)']]);
      c.fillRect(x,y,w,h);
    }else{
      // Reuse matching temple backdrop, with a different crop for each card.
      c.drawImage(state.temple,mode==='online'?265:350,145,655,460,x,y,w,h);
      const shade=gradient(c,x,y,w*.93,0,[[0,'rgba(5,11,20,.97)'],[.60,'rgba(7,13,22,.87)'],[1,'rgba(5,11,20,.24)']]);
      c.fillStyle=shade;c.fillRect(x,y,w,h);
      if(mode==='online'){
        c.fillStyle='rgba(20,43,63,.20)';c.fillRect(x,y,w,h);
      }else{
        glow(c,x+w*.79,y+86,163,'rgba(222,135,55,.13)');
        dummy(c,x+w*.73,y+h*.49,.64);
      }
    }
    c.restore();
  }
  const state={temple:null,sandbox:null,last:-1,alpha:{online:0,cpu:0,sandbox:0,settings:0,fight:0}};
  function shadowStroke(c,x,y,w,h,r,color,intensity){
    c.save();c.shadowColor=color;c.shadowBlur=6+intensity*19;
    c.lineWidth=1.5+intensity*1.0;c.strokeStyle=color;
    rr(c,x+.5,y+.5,w-1,h-1,r);c.stroke();c.restore();
  }
  function modeRow(c,g,mode){
    const [x,y,w,h]=mode.rect;
    const focus=g.menuItems[g.menuCursor]===mode.id;
    const hovered=g.uiHover===mode.id;
    const v=state.alpha[mode.id];
    c.save();
    c.translate(0,-v*2.2);
    cardArt(c,mode.id,x,y,w,h);
    // Ambient gradient avoids legibility loss over background imagery.
    c.fillStyle='rgba(0,0,0,.10)';rr(c,x,y,w,h,11);c.fill();
    c.strokeStyle=mode.edge;c.lineWidth=1;rr(c,x,y,w,h,11);c.stroke();
    shadowStroke(c,x,y,w,h,11,mode.accent,.25+v*.8);
    // Hover draws a crisp top highlight, accent stripe and animated shine.
    c.fillStyle=mode.accent;c.fillRect(x+24,y+1,73+v*75,2);
    c.fillStyle=mode.accent;c.fillRect(x+1,y+20,2,25+v*80);
    if(v>.02){
      c.save();rr(c,x,y,w,h,11);c.clip();
      const shimmer=(g.frame*.75)%830-120;
      const s=c.createLinearGradient(x+shimmer-95,y,x+shimmer+95,y);
      s.addColorStop(0,'rgba(255,255,255,0)');s.addColorStop(.5,'rgba(255,255,255,'+(.055*v)+')');
      s.addColorStop(1,'rgba(255,255,255,0)');
      c.fillStyle=s;c.fillRect(x,y,w,h);c.restore();
    }
    text(c,mode.num,x+29,y+38,14,mode.accent,900);
    line(c,x+65,y+32,x+99,y+32,mode.accent,1);
    text(c,mode.kind,x+109,y+38,13,mode.accent,900);
    if(mode.id==='online'||mode.id==='cpu'){
      const active=mode.id==='cpu';
      const tag=active?'AVAILABLE':'OFFLINE';
      rr(c,x+w-113,y+18,91,28,7);
      c.fillStyle=active?'rgba(238,177,84,.14)':'rgba(90,112,130,.20)';c.fill();
      c.strokeStyle=active?'rgba(251,197,91,.52)':'rgba(131,158,180,.4)';c.lineWidth=1;c.stroke();
      text(c,tag,x+w-67.5,y+37,11,active?'#ffcf74':'#b5c7d6',850,'center');
    }
    text(c,mode.name,x+29,y+(h>180?107:92),31,'#f8f9fc',900);
    text(c,mode.desc,x+29,y+(h>180?139:119),15,'#d9e6ed',500);
    if(mode.id==='sandbox'){
      text(c,mode.foot,x+29,y+142,14,'#cfdee0',500);
    }else{
      text(c,mode.foot,x+29,y+h-24,12,'#a1b9c8',700);
    }
    const bx=x+w-47,by=y+h*.65+v*1.5;
    c.save();c.shadowColor=mode.accent;c.shadowBlur=7+v*16;
    c.beginPath();c.arc(bx,by,24+v*1.7,0,Math.PI*2);
    c.fillStyle=mode.id==='online'?'rgba(12,42,62,.68)':mode.id==='cpu'?
      'rgba(65,43,15,.63)':'rgba(7,59,47,.7)';c.fill();
    c.strokeStyle=mode.accent;c.lineWidth=1.7;c.stroke();c.restore();
    c.strokeStyle='#fff';c.lineWidth=3.4;c.lineCap='round';c.lineJoin='round';
    c.beginPath();c.moveTo(bx-5+v*2,by-9);c.lineTo(bx+4+v*2,by);
    c.lineTo(bx-5+v*2,by+9);c.stroke();
    c.restore();
  }
  function sideButton(c,g,id,x,y,name,selected){
    const v=state.alpha[id],color=selected?'#3fd5fa':'#9db5c7';
    c.save();rr(c,x,y-v*2,77,84,10);
    c.fillStyle=selected?'rgba(12,39,56,.98)':'rgba(12,23,38,.91)';c.fill();
    shadowStroke(c,x,y-v*2,77,84,10,selected?'#2abaff':'#8baabd',.06+v*.7);
    if(selected){c.fillStyle='#27cafc';c.fillRect(x+2,y+14-v*2,3,55);}
    const bx=x+38,by=y+28-v*2;
    c.strokeStyle=color;c.lineWidth=2.7;c.lineCap='round';
    if(id==='fight'){
      line(c,bx-12,by-11,bx+12,by+11,color,2.7);
      line(c,bx-12,by+11,bx+12,by-11,color,2.7);
      line(c,bx-12,by-11,bx-8,by-11,color,2.7);
    }else{
      c.beginPath();c.arc(bx,by,10,0,Math.PI*2);c.stroke();
      c.beginPath();c.arc(bx,by,3,0,Math.PI*2);c.stroke();
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4;
        line(c,bx+Math.cos(a)*12,by+Math.sin(a)*12,
          bx+Math.cos(a)*15,by+Math.sin(a)*15,color,3);
      }
    }
    text(c,name,bx,y+69-v*2,12,selected?'#fff':'#a7b7c5',900,'center');c.restore();
  }
  function draw(c,g){
    if(!state.temple)state.temple=templeBackdrop();
    if(!state.sandbox)state.sandbox=sandboxScene();
    if(g.frame!==state.last){
      const pointerOnMode=MODES.some(mode=>g.uiHover===mode.id);
      for(const mode of MODES){
        // Pointer hover temporarily wins over gamepad focus; only the card
        // under the mouse glows. Focus resumes when the pointer leaves.
        const isHot=pointerOnMode?g.uiHover===mode.id:
          g.menuItems[g.menuCursor]===mode.id;
        state.alpha[mode.id]=lerp(state.alpha[mode.id],isHot?1:0,.15);
      }
      state.alpha.settings=lerp(state.alpha.settings,
        g.uiHover==='settings-tab'?1:0,.16);
      state.alpha.fight=lerp(state.alpha.fight,
        g.uiHover==='fight-tab'?1:0,.16);
      state.last=g.frame;
    }
    c.drawImage(state.temple,0,0);
    // Legible dark left edge and navy header over the temple scene.
    const edge=gradient(c,0,80,0,640,[[0,'rgba(2,6,12,.34)'],[1,'rgba(1,6,12,.09)']]);
    c.fillStyle=edge;c.fillRect(0,76,676,644);
    c.fillStyle='rgba(3,10,18,.97)';c.fillRect(0,0,1280,57);
    line(c,0,57,1280,57,'rgba(86,145,175,.24)',1);
    c.fillStyle='#12d3f6';c.fillRect(3,0,4,57);
    c.save();c.translate(41,29);c.rotate(Math.PI/4);
    c.strokeStyle='#55dffd';c.lineWidth=2;c.strokeRect(-12,-12,24,24);
    c.fillStyle='#f8fcff';c.fillRect(-3,-3,6,6);c.restore();
    text(c,'RE-JUSTICE',78,37,25,'#f5faff',900);
    line(c,249,14,249,43,'rgba(152,184,208,.31)',1);
    text(c,'BROWSER EDITION',268,34,12,'#9dbdd1',800);
    c.save();rr(c,1001,14,113,29,7);c.fillStyle='rgba(1,71,99,.30)';c.fill();
    text(c,'EARLY ACCESS',1057,33,11,'#52e3f4',900,'center');
    text(c,'•',1145,34,16,'#8eb9d1',700,'center');
    text(c,'BUILD 0.1.5',1164,33,12,'#d0e5f0',800);c.restore();
    c.fillStyle='rgba(2,9,17,.92)';c.fillRect(0,57,94,663);
    line(c,94,57,94,720,'rgba(126,181,207,.22)',1);
    sideButton(c,g,'fight',9,74,'FIGHT',true);
    sideButton(c,g,'settings',9,170,'SETTINGS',false);
    for(const mode of MODES)modeRow(c,g,mode);
    // Subtle dark scrim to separate text from busy temple artwork.
    c.fillStyle='rgba(3,8,16,.15)';c.fillRect(94,674,580,46);
  }
  FG.MenuRedesign={draw,modes:MODES};
})();
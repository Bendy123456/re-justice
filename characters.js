'use strict';
(() => {
  const FG=window.FG=window.FG||{};
  // PHASE 1: only four templates are playable. The complete 24+6 roster is
  // registered for later phases; the unused entries deliberately have no fake moves.
  // Frame data here is ORIGINAL PROTOTYPE BALANCING, not official Injustice data.
  const STARTUP_LIGHT=5,STARTUP_HEAVY=12;
  const NORMALS={
    standing:{
      light:{startup:STARTUP_LIGHT,active:3,recovery:10,damage:38,hitstun:14,blockstun:8,reach:74,height:47,offsetY:-97,level:'mid',push:8},
      heavy:{startup:STARTUP_HEAVY,active:4,recovery:21,damage:100,hitstun:25,blockstun:14,reach:111,height:59,offsetY:-105,level:'mid',push:17}
    },
    crouching:{
      light:{startup:5,active:3,recovery:10,damage:32,hitstun:13,blockstun:9,reach:71,height:30,offsetY:-25,level:'low',push:6},
      heavy:{startup:13,active:4,recovery:22,damage:90,hitstun:22,blockstun:13,reach:113,height:35,offsetY:-28,level:'low',push:13}
    },
    airborne:{
      light:{startup:5,active:4,recovery:11,damage:34,hitstun:15,blockstun:8,reach:71,height:46,offsetY:-70,level:'overhead',push:7},
      heavy:{startup:12,active:5,recovery:21,damage:93,hitstun:23,blockstun:14,reach:104,height:56,offsetY:-79,level:'overhead',push:14}
    }
  };
  const source=[
    ['aquaman','Aquaman','base'],['ares','Ares','base'],['bane','Bane','base'],
    ['batman','Batman','base'],['black-adam','Black Adam','base'],
    ['catwoman','Catwoman','base'],['cyborg','Cyborg','base'],
    ['deathstroke','Deathstroke','base'],['doomsday','Doomsday','base'],
    ['flash','The Flash','base'],['green-arrow','Green Arrow','base'],
    ['green-lantern','Green Lantern','base'],['harley-quinn','Harley Quinn','base'],
    ['hawkgirl','Hawkgirl','base'],['joker','The Joker','base'],
    ['killer-frost','Killer Frost','base'],['lex-luthor','Lex Luthor','base'],
    ['nightwing','Nightwing','base'],['raven','Raven','base'],['shazam','Shazam','base'],
    ['sinestro','Sinestro','base'],['solomon-grundy','Solomon Grundy','base'],
    ['superman','Superman','base'],['wonder-woman','Wonder Woman','base'],
    ['batgirl','Batgirl','dlc'],['lobo','Lobo','dlc'],
    ['martian-manhunter','Martian Manhunter','dlc'],['scorpion','Scorpion','dlc'],
    ['zatanna','Zatanna','dlc'],['general-zod','General Zod','dlc']
  ];
  const preview={
    flash:{main:'#cc242c',secondary:'#f7be36',glow:'#ff5b29',skin:'#e6b99c',
      maxHealth:960,walkSpeed:5.4,jumpVelocity:-17.3,damageMultiplier:0.94,archetype:'Rushdown',headgear:'wings'},
    batman:{main:'#283343',secondary:'#f2ca64',glow:'#86b1d8',skin:'#b5a58d',
      maxHealth:1010,walkSpeed:4.35,jumpVelocity:-16.5,damageMultiplier:1,archetype:'Balanced',headgear:'ears',cape:true},
    superman:{main:'#2164b3',secondary:'#d8303a',glow:'#a2dfff',skin:'#e8b99e',
      maxHealth:1120,walkSpeed:4.45,jumpVelocity:-16.2,damageMultiplier:1.07,archetype:'Power',headgear:'hair',cape:true},
    'wonder-woman':{main:'#b71e3e',secondary:'#edc45e',glow:'#f4dfad',skin:'#d6a37c',
      maxHealth:1060,walkSpeed:4.65,jumpVelocity:-16.6,damageMultiplier:1.03,archetype:'Balanced',headgear:'tiara'}
  };
  // Original selection-screen appearance data for the complete roster.
  // These palettes are ART-ONLY: characters without moves remain unplayable.
  const PORTRAIT_LOOK={
    aquaman:['#165d63','#e4b864','#e7b994','hair',false],
    ares:['#4c4d59','#c1a576','#8a8788','helm',true],
    bane:['#293b39','#bc9156','#ab907c','mask',false],
    batman:['#29384a','#dfb85b','#b8a28c','ears',true],
    'black-adam':['#24252c','#dfc56e','#b4967f','hair',true],
    catwoman:['#1d2732','#919baa','#bca48e','ears',false],
    cyborg:['#7b8895','#dc4a58','#99796c','visor',false],
    deathstroke:['#d88a36','#353e4b','#847563','mask',false],
    doomsday:['#68717b','#939aa2','#8b8c80','spikes',false],
    flash:['#c02837','#f1bc53','#daa887','wings',false],
    'green-arrow':['#286a4b','#c39d5e','#c69e77','hood',false],
    'green-lantern':['#25895b','#1b242c','#b5a18c','mask',false],
    'harley-quinn':['#993047','#eee0c9','#e6c9b6','pigtails',false],
    hawkgirl:['#715b37','#d6bf83','#b49a81','wings',true],
    joker:['#614f75','#6d996f','#ead5ba','hair',false],
    'killer-frost':['#a5cad7','#e5f7fd','#d8c9c3','hair',false],
    'lex-luthor':['#56754e','#a5b494','#c49b7a','bald',false],
    nightwing:['#1e3242','#4c90ba','#c2a186','mask',false],
    raven:['#403456','#7e7194','#b2a4a8','hood',true],
    shazam:['#a8242b','#f1c370','#e0b497','hood',true],
    sinestro:['#b29733','#282c30','#b0655e','hair',false],
    'solomon-grundy':['#66766e','#a5a69b','#acb0a2','hair',false],
    superman:['#2766b2','#b82535','#e8b99e','hair',true],
    'wonder-woman':['#a72d44','#ddbb69','#dbaf90','tiara',false],
    batgirl:['#3a364e','#dabb72','#ccab95','ears',true],
    lobo:['#34373f','#dbd4c9','#cac1a9','hair',false],
    'martian-manhunter':['#356f67','#a9454b','#6da884','bald',true],
    scorpion:['#a79339','#303038','#c2a589','mask',false],
    zatanna:['#33323b','#d8d7d3','#e0c0a4','hat',true],
    'general-zod':['#40444c','#a49b92','#c5a78e','hair',true]
  };
  const CHARACTERS=Object.fromEntries(source.map(([id,name,edition])=>{
    const art=PORTRAIT_LOOK[id];
    const entry={id,name,edition,playable:Boolean(preview[id]),
      main:art[0],secondary:art[1],skin:art[2],headgear:art[3],cape:art[4],
      glow:art[1],...preview[id]};
    if(entry.playable){
      entry.hurtboxes={standing:{x:-22,y:-137,w:44,h:137},crouching:{x:-27,y:-86,w:54,h:86},airborne:{x:-23,y:-132,w:46,h:132}};
      // Explicit per-character data copy: engine doesn't branch on character id.
      entry.moves=structuredClone(NORMALS);
      entry.sprite={width:62,height:142,scale:1};
    }
    return [id,entry];
  }));
  FG.CHARACTERS=CHARACTERS;
  FG.ROSTER=source.map(([id])=>id);
  FG.PLAYABLE=source.filter(([id])=>preview[id]).map(([id])=>id);
})();

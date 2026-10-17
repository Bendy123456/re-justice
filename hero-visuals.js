'use strict';
/* RE-Justice visual reference data. Presentation only; combat slot IDs never change.
   Costume studies reference Injustice: Gods Among Us (2013). Fan project; not official assets.
   Geometry can later be replaced with properly licensed character glTF files. */
(() => {
  const F=window.FG=window.FG||{};
  const P={
    flash:{name:'The Flash',build:'sprinter',style:'speedster',
      suit:'#a71d2a',shadow:'#44101d',highlight:'#d33a39',trim:'#dfae4a',metal:'#be8a36',skin:'#d6a08a',eyes:'#f8efe1',hair:'#452323',
      emblem:'bolt',mask:'flash',cape:false,armor:0.61,gloss:.36},
    batman:{name:'Batman',build:'armored',style:'tactical',
      suit:'#252d39',shadow:'#121722',highlight:'#46515e',trim:'#ba9c55',metal:'#59616d',skin:'#bca08a',eyes:'#dfeefa',hair:'#14171d',
      emblem:'bat',mask:'cowl',cape:true,armor:1,gloss:.5},
    superman:{name:'Superman',build:'power',style:'heroic',
      suit:'#174575',shadow:'#122741',highlight:'#386995',trim:'#b53739',metal:'#a5a2a1',skin:'#d8b19a',eyes:'#d6e7ed',hair:'#121820',
      emblem:'shield',mask:'none',cape:true,armor:.45,gloss:.31},
    'wonder-woman':{name:'Wonder Woman',build:'warrior',style:'amazon',
      suit:'#9d2836',shadow:'#521b2b',highlight:'#cb4b51',trim:'#dbb66c',metal:'#aaa6a3',skin:'#c89378',eyes:'#d8dae5',hair:'#141b2a',
      emblem:'wings',mask:'tiara',cape:false,armor:.72,gloss:.46}
  };
  const BUILDS={
    sprinter:{height:2.42,shoulder:.36,waist:.22,hip:.24,muscle:.89,leg:.98,head:.160},
    armored:{height:2.48,shoulder:.45,waist:.25,hip:.27,muscle:1.17,leg:1,head:.170},
    power:{height:2.54,shoulder:.47,waist:.25,hip:.275,muscle:1.20,leg:1.02,head:.177},
    warrior:{height:2.48,shoulder:.35,waist:.215,hip:.265,muscle:.95,leg:1.08,head:.157}
  };
  F.HERO_VISUALS=P;
  F.BODY_BUILDS=BUILDS;
  F.HERO_VISUALS_NOTES='Faithful character-study costumes; game code and hitboxes are unchanged';
})();

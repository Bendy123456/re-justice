'use strict';
/* Visual-only roster mapping. No changes to combat data or unlock state. */
(()=>{
  const FG=window.FG=window.FG||{};
  const FEMALE=Object.freeze([
    'batgirl','catwoman','harley-quinn','hawkgirl',
    'killer-frost','raven','wonder-woman','zatanna'
  ]);
  const MALE=Object.freeze([
    'aquaman','ares','bane','batman','black-adam','cyborg',
    'deathstroke','doomsday','flash','green-arrow','green-lantern',
    'joker','lex-luthor','nightwing','shazam','sinestro','solomon-grundy',
    'superman','lobo','martian-manhunter','scorpion','general-zod'
  ]);
  const BASE='assets/models/';
  const MODEL_PATHS=Object.freeze({
    male:BASE+'male-unarmored.glb',
    female:BASE+'female-unarmored.glb',
    batman:BASE+'batman-armored.glb?v=without-cape-1'
  });
  const MALE_SET=new Set(MALE),FEMALE_SET=new Set(FEMALE);
  const heroModel=id=>FEMALE_SET.has(id)?'female':id==='batman'?'batman':MALE_SET.has(id)?'male':null;
  FG.MODEL_ROSTER=Object.freeze({MALE,FEMALE,MODEL_PATHS,heroModel});
})();

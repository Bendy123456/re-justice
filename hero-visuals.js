'use strict';
/* Visual data only. Slot IDs intentionally match existing gameplay IDs. */
(() => {
  const F=window.FG=window.FG||{};
  const HERO_VISUALS={
    flash:{name:'Ion Strider',build:'lean',palette:['#167f96','#ed8d55','#e0b999'],alt:[['#175d78','#85d9ee','#e0b999'],['#393c71','#f2b24d','#e0b999']],emblem:'chevron',head:'visor',cape:false},
    batman:{name:'Night Sentinel',build:'athletic',palette:['#283c53','#73b6b2','#ba9982'],alt:[['#34333a','#ce9c5f','#ba9982'],['#283d42','#9ac0d2','#ba9982']],emblem:'arc',head:'hood',cape:true},
    superman:{name:'Solar Vanguard',build:'heavy',palette:['#7d3a54','#ebad62','#d2a38d'],alt:[['#284a69','#d5e2d6','#d2a38d'],['#b36037','#eac87a','#d2a38d']],emblem:'sun',head:'hair',cape:true},
    'wonder-woman':{name:'Aegis Dawn',build:'athletic',palette:['#2c5964','#d59c76','#a77964'],alt:[['#703e5a','#dbb784','#a77964'],['#566155','#ddd6bd','#a77964']],emblem:'shield',head:'crest',cape:false}
  };
  const BODY_BUILDS={
    lean:{height:1.75,shoulders:.32,muscle:.86,legScale:1.05},
    athletic:{height:1.78,shoulders:.38,muscle:1.02,legScale:1.0},
    heavy:{height:1.87,shoulders:.44,muscle:1.18,legScale:1.02},
    massive:{height:2.01,shoulders:.52,muscle:1.33,legScale:.94},
    slim:{height:1.71,shoulders:.3,muscle:.78,legScale:1.08}
  };
  F.HERO_VISUALS=HERO_VISUALS;
  F.BODY_BUILDS=BODY_BUILDS;
})();

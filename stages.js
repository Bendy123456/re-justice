'use strict';
(() => {
  const FG=window.FG=window.FG||{};
  const FLOOR_Y=584, WALL_LEFT=68,WALL_RIGHT=1212;
  const data=[
    ['neon-rooftop','NIGHTFALL ROOFTOP','#081427','#173554','#38aed9','#ee8064','city'],
    ['iron-fortress','IRON CITADEL','#171522','#383145','#c0655b','#fcad76','fortress'],
    ['abyssal-city','ABYSSAL CITY','#041e30','#13516c','#5fcab6','#afd9b3','underwater'],
    ['red-moon','CRIMSON EXILE','#1d0e23','#582742','#fa6055','#f9bb89','alien'],
    ['blacksite','BLACKSITE CELLBLOCK','#101b24','#2d4657','#9ab1ab','#eac17d','prison'],
    ['storm-harbor','THUNDER HARBOR','#0b1c30','#244b66','#4ea5ba','#e9b78e','harbor'],
    ['sunken-temple','RUINED SANCTUM','#082c31','#285b59','#85cdb9','#efda9d','temple'],
    ['orbital-station','ORBITAL FRONTIER','#0b0d23','#242b55','#828beb','#e9b2bd','space']
  ];
  const STAGES=Object.fromEntries(data.map(([id,name,sky,mid,accent,light,scene])=>[id,{
    id,name,sky,mid,accent,light,scene,ground:FLOOR_Y,walls:{left:WALL_LEFT,right:WALL_RIGHT},
    parallax:[{speed:0.07,height:0.57,alpha:0.22},{speed:0.18,height:0.74,alpha:0.45},{speed:0.35,height:0.92,alpha:0.9}],
    interactables:[] // Phase 7; data contract ready, no nonfunctional action.
  }]));
  FG.STAGES=STAGES;
})();

'use strict';
// All paths are relative to index.html. Leave paths empty for generated art/audio.
// For sprite sheets set: {path:'assets/fighters/flash.png', frameWidth:128,
// frameHeight:192, columns:8, rows:{idle:0,walk:1,jump:2,crouch:3,
// attack:4,block:5,hitstun:6,win:7}, frames:{idle:6,walk:8,...}}.
(() => {
  const FG = window.FG = window.FG || {};
  const CHAR_IDS = ['aquaman','ares','bane','batman','black-adam','catwoman',
    'cyborg','deathstroke','doomsday','flash','green-arrow','green-lantern',
    'harley-quinn','hawkgirl','joker','killer-frost','lex-luthor','nightwing',
    'raven','shazam','sinestro','solomon-grundy','superman','wonder-woman',
    'batgirl','lobo','martian-manhunter','scorpion','zatanna','general-zod'];
  const STAGE_IDS = ['neon-rooftop','iron-fortress','abyssal-city','red-moon',
    'blacksite','storm-harbor','sunken-temple','orbital-station'];
  const SOUND_IDS = ['light','medium','heavy','block','jump','round','ko','confirm','whoosh','music'];
  const assets = {
    characters:Object.fromEntries(CHAR_IDS.map(id => [id,{path:'',frameWidth:128,frameHeight:192,columns:8,rows:{},frames:{}}])),
    portraits:Object.fromEntries(CHAR_IDS.map(id => [id,{path:''}])),
    stages:Object.fromEntries(STAGE_IDS.map(id => [id,{path:''}])),
    sounds:Object.fromEntries(SOUND_IDS.map(id => [id,{path:''}]))
  };
  class AssetManager {
    constructor(config=assets){this.config=config;this.images={};this.audio={};}
    load(){
      for(const [group,entries] of Object.entries(this.config)){
        if(group==='sounds'){
          for(const [id,item] of Object.entries(entries)){
            if(!item.path)continue;
            const audio=new Audio();audio.preload='auto';audio.src=item.path;
            // A failed optional file simply falls back to synthesis.
            this.audio[id]=audio;
          }
        } else {
          for(const [id,item] of Object.entries(entries)){
            if(!item.path)continue;
            const img=new Image();img.decoding='async';img.src=item.path;
            this.images[group+':'+id]=img;
          }
        }
      }
    }
    image(group,id){const i=this.images[group+':'+id];return i&&i.complete&&i.naturalWidth>0?i:null;}
    sound(id){const a=this.audio[id];return a&&a.readyState>=2?a:null;}
  }
  FG.ASSETS=assets;
  FG.AssetManager=AssetManager;
})();

'use strict';
(() => {
  const FG=window.FG=window.FG||{};
  const ATTACK_DISTANCE=111,DEFEND_DISTANCE=137;
  // Intentionally straightforward Phase 1 CPU. Full difficulties & punishes in Phase 5.
  class BasicAI {
    constructor(seed=17){this.seed=seed>>>0;this.cooldown=0;this.previous={};}
    random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
    decide(self,enemy,frame){
      const out=FG.InputUtils.emptyFrame();
      if(!self||!enemy||self.health<=0||enemy.health<=0)return out;
      const range=Math.abs(self.x-enemy.x);
      if(this.cooldown>0)this.cooldown--;
      const threat=enemy.state==='attack'&&range<DEFEND_DISTANCE;
      if(threat&&this.random()>.34){out.block=true;if(this.random()>.78)out.down=true;}
      else if(range>ATTACK_DISTANCE){
        if(self.x<enemy.x)out.right=true;else out.left=true;
        if(range>240&&frame%125===0)out.up=true;
      } else if(this.cooldown===0&&self.state!=='attack'&&self.stun<=0){
        const roll=this.random();const name=roll<.5?'light':roll<.82?'medium':'heavy';
        out[name]=true;out.pressed[name]=true;this.cooldown=15+Math.floor(this.random()*19);
      }
      return FG.InputUtils.resolveSOCD(out);
    }
  }
  FG.BasicAI=BasicAI;
})();

/* RE-Justice — distance-driven, grounded locomotion.
 * Visual only. No changes to movement speed, collisions, attacks or inputs.
 * A continuous stance/swing profile avoids the previous overextended
 * high-knee bounds visible when traversing the Sandbox arena.
 */
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};

// Input phase increases by actual distance travelled, not render frames.
// Two complete half-steps (left/right) form a cycle.
export function groundedStep(phase,runMix=0){
  const run=clamp(runMix),u=((phase/(2*Math.PI))%1+1)%1;
  // At running speed shorten ground contact to avoid planted feet being
  // dragged outside the anatomical reach of the imported skeleton.
  const stance=lerp(.57,.37,run),reach=lerp(.31,.48,run);
  if(u<stance){
    const t=u/stance;
    return {
      contact:true,stance:true,
      travel:reach*(1-2*t),
      lift:0,
      roll:.065*(1-smooth(t/.17))-.092*smooth((t-.78)/.22),
      support:Math.sin(Math.PI*t)**2,
      phase:u
    };
  }
  const t=(u-stance)/(1-stance),s=smooth(t);
  return {
    contact:false,stance:false,
    travel:lerp(-reach,reach,s),
    lift:lerp(.042,.118,run)*Math.pow(Math.max(0,Math.sin(Math.PI*t)),1.18),
    roll:-.092*(1-smooth(t/.22))+.065*smooth((t-.76)/.24),
    support:0,
    phase:u
  };
}

// Walking/fast-running arm swing stays bent near the ribs and naturally
// counter-swings against the same-side leg. Direction supports backpedals
// and sideways travel without twisting the mesh facing direction.
export function walkArm(phase,side,dirForward,dirSide,runMix){
  const run=clamp(runMix);
  const swing=(side==='l'?-1:1)*Math.sin(phase)*
    (dirForward+dirSide*.28);
  const front=Math.max(0,swing),back=Math.max(0,-swing);
  return {
    out:.27+.025*run+.02*Math.abs(dirSide),
    down:-.64+.075*run+.075*front-.020*back,
    forward:.095+(.185+run*.095)*swing,
    elbowOut:.42+run*.10
  };
}

// A finite reach for each leg prevents the solver from pointing knees
// at impossible ankle targets. Y is NEVER changed: planted soles remain
// on the real scene floor, even during bob and yaw turns.
export function clampAnkleReach(hip,goal,length,margin=.012){
  const reach=Math.max(.05,length-margin);
  const deltaY=goal.y-hip.y;
  const horizontal=Math.hypot(goal.x-hip.x,goal.z-hip.z);
  const maxHorizontal=Math.sqrt(Math.max(.0001,
    reach*reach-deltaY*deltaY));
  if(horizontal>maxHorizontal&&horizontal>1e-6){
    const scale=maxHorizontal/horizontal;
    goal.x=hip.x+(goal.x-hip.x)*scale;
    goal.z=hip.z+(goal.z-hip.z)*scale;
    return true;
  }
  return false;
}

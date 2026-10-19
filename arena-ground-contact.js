/* RE-Justice — grounded push-off phase director.
 * Animation only; world movement, player physics and hitboxes stay owned by
 * arena3d.js. Driven from real CMU ankle trajectories and the 60 Hz game
 * simulation clock, not a second artificial alternating sine-gait.
 */
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
const bell=(t,peak,end)=>{
  if(t<=0||t>=end)return 0;
  return t<peak?smooth(t/peak):1-smooth((t-peak)/(end-peak));
};
function newFoot(){return {
  contact:false,age:0,previousHeight:.2,toeOff:0,land:0,
  compression:0,propulsion:0,lastTick:-1,impactCount:0
};}
export function stepGroundDrive(state,heights,runMix=0,tick=0,strength=1){
  if(!state)state={l:newFoot(),r:newFoot(),lastTick:null};
  // Callers can render at 144+ FPS. Advance heel events ONLY once per
  // fixed 60 Hz simulation tick; this prevents animation-speed-dependent
  // compression pulses and contact-state flickering.
  const advance=tick!==state.lastTick;
  const run=clamp(runMix),weight=clamp(strength);
  let dip=0,lift=0,balance=0,contactCount=0;
  const contacts={};
  for(const [name,side] of [['l',1],['r',-1]]){
    const foot=state[name]||(state[name]=newFoot());
    const raw=heights[name],height=Number.isFinite(raw)?Math.max(0,raw):.3;
    // Human walk-to-jog transition uses distinct thresholds to avoid
    // replanting the same foot on tiny BVH sample fluctuations.
    const planted=weight>.63&&height<(foot.contact?.061:.035);
    if(advance){
      if(planted&&!foot.contact){foot.age=0;foot.impactCount++;}
      else if(planted)foot.age=Math.min(180,foot.age+1);
      else foot.age=0;
      const rise=height-foot.previousHeight;
      foot.previousHeight=height;
      foot.contact=planted;
      foot.toeOff=planted?smooth((height-.021)/.042)*
        smooth((rise+.003)/.009):0;
    }
    const seconds=foot.age/60;
    // Soft knee compression immediately AFTER heel strike, then a
    // propulsive rise as the support leg extends toward toe-off.
    // Both overlap smoothly; the body never teleports or pogo-bounces.
    const impact=foot.contact?bell(seconds,.043,.125):0;
    const drive=foot.contact?
      Math.max(foot.toeOff*.70,bell(seconds,.145,.245)*.80):0;
    foot.compression=impact;
    foot.propulsion=drive;
    if(foot.contact){
      contactCount++;
      dip=Math.max(dip,impact);
      lift=Math.max(lift,drive);
      balance+=side*(.45+.55*impact)*weight;
    }
    contacts[name]={
      contact:foot.contact,age:foot.age,
      land:impact,push:drive,toeOff:foot.toeOff,
      impactCount:foot.impactCount
    };
  }
  if(advance)state.lastTick=tick;
  // 2-3 centimeters of compression, 1-2 centimeters of extension:
  // strong enough to read at gameplay distance, small enough to keep
  // the ankle solver inside the skin's actual leg reach.
  const settle=weight*(.029+run*.006)*dip;
  const rise=weight*(.020+run*.008)*lift;
  return {
    state,feet:contacts,
    pelvisY:clamp(rise-settle,-.039,.031),
    pelvisX:clamp(balance*.011,-.018,.018),
    impact:dip,propulsion:lift,
    supportCount:contactCount
  };
}
export function resetGroundDrive(state){
  if(!state)return null;
  return {l:newFoot(),r:newFoot(),lastTick:null};
}

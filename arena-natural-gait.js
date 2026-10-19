/* RE-JUSTICE — authored full-body locomotion profiles, rev 3.
 * Contact / compression / passing / toe-off / flight / landing are
 * individual poses, not one large sinusoidal kick. All values visual-only.
 * +Z is character-forward, +X right, Y up in Three.js meters.
 */
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const ease=t=>{t=clamp(t);return t*t*(3-2*t);};

// Eight ANIMATOR-KEYED poses for each foot over a full run cycle.
// Travel=forward/back from pelvis; lift=inertial upward swing;
// roll=toe-off / heel touch; support=amount of body load on this foot.
// Foot stays on floor for all first four contact keys.
// Interpolation at keys is Hermite/Catmull style for fluid velocity,
// but the stance-to-swing boundary snaps only boolean contact, not geometry.
const WALK=[
  [0,    1,    0,     .07,0.05],
  [.12,  .64,  0,     .00,.55],
  [.31,  -.08, 0,    -.01,1],
  [.49,  -.84, 0,    -.07,.34],
  [.57,  -1,   0,    -.11,0],
  [.67,  -.76, .45, -.065,0],
  [.79,  .15, 1,     .02,0],
  [.91,  .81,  .38,   .055,0],
  [1,    1,   0,     .07,.05]
];
const RUN=[
  [0,    1,    0,     .065,0],
  [.085, .60,  0,     0,.58],
  [.24, -.22,  0,    -.025,1],
  [.35, -.82,  0,    -.09,.30],
  [.42, -1,    0,    -.13,0],
  [.56, -.76,  .60, -.07,0],
  [.70,  .06,  1,    -.01,0],
  [.88,  .84,  .32,   .05,0],
  [1,    1,    0,     .065,0]
];
function interp(keys,u,col){
  let i=0;
  while(i<keys.length-2&&u>keys[i+1][0])i++;
  const k0=keys[i],k1=keys[i+1],dt=k1[0]-k0[0];
  const p0=k0[col],p1=k1[col];
  const pPrev=keys[Math.max(0,i-1)],pNext=keys[Math.min(keys.length-1,i+2)];
  // Centered derivatives at nonterminal keys. At cyclic endpoints use
  // equal corresponding slopes to eliminate discontinuity at wrap.
  function tangent(at){
    if(at===0||at===keys.length-1){
      const slope=(keys[1][col]-keys[0][col])/
        (keys[1][0]-keys[0][0]);
      const wrap=(keys[keys.length-1][col]-keys[keys.length-2][col])/
        (keys[keys.length-1][0]-keys[keys.length-2][0]);
      return (slope+wrap)*.5;
    }
    const before=keys[at-1],after=keys[at+1];
    return (after[col]-before[col])/(after[0]-before[0]);
  }
  const t=clamp((u-k0[0])/dt),tt=t*t,ttt=tt*t;
  const m0=tangent(i)*dt,m1=tangent(i+1)*dt;
  return (2*ttt-3*tt+1)*p0+
    (ttt-2*tt+t)*m0+(-2*ttt+3*tt)*p1+
    (ttt-tt)*m1;
}
function sample(keys,u,run,reach,lift){
  const values=[1,2,3,4].map(col=>interp(keys,u,col));
  const contact=u<(run?.42:.57);
  return {
    contact,stance:contact,phase:u,
    travel:clamp(values[0],-1,1)*reach,
    lift:contact?0:Math.max(0,values[1])*lift,
    roll:values[2],
    support:contact?clamp(values[3]):0
  };
}
export function groundedStep(phase,runMix=0){
  const mix=clamp(runMix);
  const u=((phase/(Math.PI*2))%1+1)%1;
  // At 7.1m/s game speed: animation reads as a fast athletic run, not
  // an impossible high-knee "walk". Floor reaches stay under calf length.
  const reach=lerp(.265,.385,mix),lift=lerp(.049,.098,mix);
  const w=sample(WALK,u,false,reach,lift);
  const r=sample(RUN,u,true,reach,lift);
  // Mixed gait needs a consistent contact state; choose the appropriate
  // contact phase, but keep all position/roll channels continuously blended.
  const contact=u<lerp(.57,.42,mix);
  return {
    contact,stance:contact,phase:u,
    travel:lerp(w.travel,r.travel,mix),
    // At intermediate walk/run mixtures the two clips have different
    // toe-off times. Ramp the new swing up from zero so contact never
    // switches to an airborne ankle in a single rendered frame.
    lift:contact?0:lerp(w.lift,r.lift,mix)*
      ease((u-lerp(.57,.42,mix))/.055),
    roll:lerp(w.roll,r.roll,mix),
    support:contact?lerp(w.support,r.support,mix):0
  };
}
export function walkArm(phase,side,dirForward,dirSide,runMix){
  const run=clamp(runMix);
  // Opposite-side arm moves forward when that-side leg trails. The
  // shoulder leads, elbow folds, wrist lags slightly on the recovery.
  const sign=side==='l'?-1:1;
  const stride=Math.sin(phase-.20)*sign;
  const dir=clamp(dirForward+dirSide*.24,-1,1);
  const swing=stride*dir;
  const front=Math.max(0,swing),back=Math.max(0,-swing);
  return {
    out:.215+run*.035,
    down:-.71+run*.09+front*.065-back*.018,
    forward:.13+(.165+run*.085)*swing,
    elbowOut:.47+run*.08
  };
}
// Pelvis settles on heel contact, rises slightly during push-off and
// counter-rotates relative to ribcage. Head remains mostly stabilized.
// The rig already supplies 3 independent spine joints.
export function bodyCycle(phase,runMix=0){
  const run=clamp(runMix),s=Math.sin(phase),c=Math.cos(phase);
  return {
    pelvisYaw:(.042+run*.030)*s,
    chestCounterYaw:(-.055-run*.035)*s,
    shoulderRoll:(.017+run*.021)*s,
    lateral:(.008+run*.012)*c,
    compression:(.004+run*.007)*(1-c)/2,
    rise:(.005+run*.010)*(1-Math.cos(2*phase))/2
  };
}
// Prevent an unreachable ankle when changing heading or foot support.
// Maintain WORLD floor Y, shortening only the horizontal extension.
export function clampAnkleReach(hip,goal,length,margin=.012){
  const max=Math.max(.05,length-margin);
  const dy=goal.y-hip.y,dx=goal.x-hip.x,dz=goal.z-hip.z;
  const horiz=Math.hypot(dx,dz);
  const allowed=Math.sqrt(Math.max(.0001,max*max-dy*dy));
  if(horiz>allowed&&horiz>1e-7){
    const ratio=allowed/horiz;
    goal.x=hip.x+dx*ratio;
    goal.z=hip.z+dz*ratio;
    return true;
  }
  return false;
}

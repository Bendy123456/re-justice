/* RE-Justice — expressive arm drive over CMU human sprint capture.
 * The shoulders, elbows and wrists are already rotation-retargeted from a
 * real human. This ONLY adds a sagittal (forward/backward) shoulder arc,
 * phase-locked to captured wrist travel. There are no fabricated hand IK
 * destinations and no sideways elbows.
 */
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=v=>{const t=clamp(v);return t*t*(3-2*t);};
export function capturedArmDrive(samples,runMix=0,weight=1){
  const active=smooth(runMix)*smooth(weight);
  const get=idx=>Number.isFinite(samples?.[idx])?samples[idx]:0;
  const arm=(z)=>{
    // Captured wrist z is measured from its SHOULDER in the original
    // CMU recording. Positive means the natural arm swing is coming
    // forward. The extending phase is intentionally stronger than the
    // recovery behind the ribs.
    const forward=smooth((z+.065)/.255);
    const back=smooth((-z-.055)/.17);
    const shoulderAngle=active*(-.37*forward+.064*back);
    const collarAngle=active*(-.056*forward+.012*back);
    return {shoulderAngle,collarAngle,forward,back};
  };
  const left=arm(get(15)),right=arm(get(21));
  // Subtle upper chest counter-rotation, only when one arm really leads.
  // Keeping the head steady prevents head-bobbing with every punchy step.
  const chestYaw=active*clamp((right.forward-left.forward)*.035,-.034,.034);
  return {active,left,right,chestYaw};
}

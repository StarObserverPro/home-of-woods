export const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
export const ramp=(t,a,b)=>smooth((t-a)/(b-a));
export const CUT={height:.88,join:1.65,fallStart:2.15,impact:4.15};
export function fallProgress(t){return Math.pow(clamp((t-CUT.fallStart)/(CUT.impact-CUT.fallStart)),1.85);}

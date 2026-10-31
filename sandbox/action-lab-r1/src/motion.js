export const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
export const ramp=(t,a,b)=>smooth((t-a)/(b-a));
export const DURATIONS={fell:7,climb:8,gather:5,pray:5.5,pickup:3.2};
export const CUT={height:.88,join:1.65,fallStart:2.15,impact:4.15};
export function fallProgress(t){return Math.pow(clamp((t-CUT.fallStart)/(CUT.impact-CUT.fallStart)),1.85);}
export function phase(action,t){
  if(action==='pickup')return t<1.15?['弯腰拾柴','俯身伸手，拾起地面的碎柴。']:t<2.55?['拾起，起身','碎柴随手提起，身体恢复站姿。']:['收好碎柴','碎柴用于生火；此处只演示动作。'];
  if(action==='fell')return t<1.5?['最后两斧','切口逐渐张开，根桩留在原位。']:t<2.15?['纤维绷断','切口边缘是转动的支点。']:t<4.15?['树身倾倒','先慢后快，树冠随树干一起倒下。']:t<4.8?['接地与余振','树冠压下再回弹，木屑和落叶散开。']:['断口与根桩','倒木停留，留下同一切口的两侧断面。'];
  if(action==='climb')return t<1.2?['靠近，抱稳','双手贴住树干，抬脚寻找支撑。']:t<2.7?['向上蹬一步','手臂牵引、腿部蹬起，身体上移。']:t<5.5?['镜头拉远','身影藏进枝叶，树冠轻轻摇晃。']:['回到树下','短暂省略后滑下落脚，恢复站姿。'];
  if(action==='gather')return t<1?['蹲下','脚留在地面，身体落低。']:t<3.6?['左边，右边','伸手捏取，再轻轻提起。']:['收好，起身','结束一次采集表现。'];
  return t<1.2?['合掌','面对祭坛，双手收至胸前。']:t<3.5?['低头祈祷','停留片刻，祭坛给出柔和回应。']:['放下双手','光点消散，恢复站姿。'];
}

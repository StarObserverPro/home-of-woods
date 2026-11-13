/** Visual swatches only: light, warm, neutral and dark wood. No species association. */
export const WOOD_TONES = {
  light: {face:'#d1c3a3', end:'#e0d1b1', bark:'#adb09e'},
  warm: {face:'#bd945e', end:'#d8b780', bark:'#806044'},
  neutral: {face:'#b49570', end:'#cfb18a', bark:'#80634c'},
  dark: {face:'#89694e', end:'#ad8c65', bark:'#6e5542'},
  scrap: {face:'#79573e', end:'#aa8359', bark:'#604734'},
} as const;
export const WOOD_TONE_STYLE = {version:'wood-tone-v1',pieceDrift:.16,instanceDrift:.10} as const;
/** Stable across reloads/ordering; never use world position, quality, clock or Math.random. */
export function woodToneHash(seed:string|number){
  let h=2166136261;
  for(const ch of String(seed))h=Math.imul(h^ch.charCodeAt(0),16777619);
  h=Math.imul(h^(h>>>16),0x7feb352d);h=Math.imul(h^(h>>>15),0x846ca68b);
  return (h^(h>>>16))>>>0;
}
/** Linear-RGB multipliers: seven restrained value steps and three warmth steps. */
export function woodToneDrift(seed:string|number,amount:number=WOOD_TONE_STYLE.pieceDrift):[number,number,number]{
  const h=woodToneHash(seed),a=Math.max(0,Math.min(.25,Number.isFinite(amount)?amount:0));
  const value=1+((h%7)-3)/3*a,warm=(((h>>>8)%3)-1)*a*.10;
  return [value*(1+warm),value,value*(1-warm)];
}
/** Transport, humidity, quantity and rarity cannot change the tint on moving a batch. */
export function woodBatchToneSeed(item:{itemId:string;[key:string]:unknown}):string{
  const wood=item.wood as {spec?:{lengthMm?:number;thicknessMm?:number;straightness?:string}}|undefined;
  const spec=wood?.spec;
  return `${item.itemId}:${spec?.lengthMm??''}:${spec?.thicknessMm??''}:${spec?.straightness??''}`;
}

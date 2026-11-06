import type {CSSProperties} from 'react';
import type {ArtIconName} from './art-icons.ts';
/** Decorative images accompany a real text label on every control. */
export function GameIcon({name,size=36,className=''}:{name:ArtIconName|null;size?:number;className?:string}) {
  const style={'--art-size':`${size}px`} as CSSProperties;
  return name?<img className={`game-icon ${className}`} src={`/assets/ui-r1/icons/${name}-128.png`} srcSet={`/assets/ui-r1/icons/${name}-64.png 1x, /assets/ui-r1/icons/${name}-128.png 2x`} width={size} height={size} style={style} alt="" aria-hidden="true" draggable={false} decoding="async"/>:
    <span className={`game-icon game-icon-unknown ${className}`} style={style} aria-hidden="true">?</span>;
}

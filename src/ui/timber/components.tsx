import type {ButtonHTMLAttributes,HTMLAttributes,ReactNode} from 'react';

/** Preferred entry point for new React modules. No arbitrary border or texture options. */
export function TimberButton({emphasis='normal',children,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{emphasis?:'normal'|'quiet'|'danger';children:ReactNode}) {
  return <button {...props} type={props.type??'button'} data-timber-surface="button"
    data-timber-tone={emphasis==='quiet'?'moss':'warm'} data-timber-intent={emphasis==='danger'?'danger':undefined}>{children}</button>;
}
export function TimberPanel({children,...props}:HTMLAttributes<HTMLElement>&{children:ReactNode}) {
  return <section {...props} data-timber-surface="panel">{children}</section>;
}
export function TimberHeading({children,...props}:HTMLAttributes<HTMLElement>&{children:ReactNode}) {
  return <header {...props} data-timber-surface="heading">{children}</header>;
}

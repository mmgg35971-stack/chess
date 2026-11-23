import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A card that stays visible right under the board: if it would fall below the screen, it sticks to
 * the bottom (above the tab bar). The text scrolls inside, the buttons stay visible, and it can be
 * folded to one line. `resetKey` scrolls the text back to the top when the content changes.
 */
export function Dock({ title, children, footer, testId, className = '', resetKey }: {
  title?: ReactNode; children?: ReactNode; footer?: ReactNode; testId?: string; className?: string; resetKey?: unknown;
}) {
  const [open, setOpen] = useState(true);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => { body.current?.scrollTo?.({ top: 0 }); }, [resetKey]);
  return (
    <div className={'card dock ' + className + (open ? '' : ' collapsed')} data-testid={testId}>
      <div className="dock-head">
        <div className="small">{title}</div>
        <button className="dock-toggle" onClick={() => setOpen(!open)} aria-label={open ? 'collapse' : 'expand'} data-testid={testId ? testId + '-toggle' : undefined}>{open ? '▾' : '▴'}</button>
      </div>
      {open && <div className="dock-body" ref={body}>{children}</div>}
      {open && footer && <div className="dock-foot">{footer}</div>}
    </div>
  );
}

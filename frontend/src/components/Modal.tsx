import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** Native modal provides focus containment, inert background and keyboard access. */
export function Modal({ open, onClose, title, eyebrow, description, children, id, className = '', chrome = true, footer }: {
  open: boolean; onClose(): void; title: string; eyebrow?: string; description?: string; children: ReactNode; id?: string;
  className?: string; chrome?: boolean; footer?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeHandler = useRef(onClose);
  closeHandler.current = onClose;
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const closingRef = useRef(false);
  const [closing, setClosing] = useState(false);
  const closeRequest = useRef<() => void>(() => {});
  closeRequest.current = requestClose;
  const titleId = useId(), descriptionId = useId();

  useEffect(() => {
    const node = dialog.current;
    if (!open || !node) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closingRef.current = false;
    setClosing(false);
    const cancel = (event: Event) => {
      // Browsers can issue an unpreventable close request. Synchronize state
      // immediately so a delayed animation cannot close a subsequently opened dialog.
      if (!event.cancelable) { closingRef.current = true; clearTimeout(timer.current); closeHandler.current(); return; }
      event.preventDefault(); closeRequest.current();
    };
    const closed = () => { if (!node.open && !closingRef.current) { clearTimeout(timer.current); closeHandler.current(); } };
    node.addEventListener('cancel', cancel);
    node.addEventListener('close', closed);
    node.showModal();
    return () => {
      clearTimeout(timer.current);
      node.removeEventListener('cancel', cancel);
      node.removeEventListener('close', closed);
      node.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);

  function requestClose() {
    if (closingRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { closeHandler.current(); return; }
    closingRef.current = true;
    setClosing(true);
    timer.current = setTimeout(() => closeHandler.current(), 150);
  }

  return <dialog id={id} ref={dialog} className={`app-dialog ${className}`.trim()} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} data-closing={closing || undefined}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); requestClose(); return; }
      if (event.key !== 'Tab') return;
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]'))
        .filter(item => item.getClientRects().length > 0 && getComputedStyle(item).visibility !== 'hidden');
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) requestClose();
    }}>
    {chrome ? <div className="dialog-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2 id={titleId}>{title}</h2>{description && <p id={descriptionId} className="dialog-description">{description}</p>}</div><button type="button" className="icon-button dialog-close" aria-label={`Close ${title}`} onClick={requestClose} autoFocus><X size={21} /></button></div> : <><h2 id={titleId} className="sr-only">{title}</h2>{description && <p id={descriptionId} className="sr-only">{description}</p>}</>}
    {open && <div className="dialog-content" tabIndex={-1}>{children}</div>}
    {chrome && <div className="dialog-footer">{footer ?? <><span>Close with Escape or the close button</span><button type="button" className="button secondary" onClick={requestClose}>Done</button></>}</div>}
  </dialog>;
}

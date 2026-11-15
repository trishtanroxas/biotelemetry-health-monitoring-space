import { useEffect, type RefObject } from 'react';

const revealTargets = '.panel, .table-scroll, .research-fieldnote, .companion-demo, .environment-reading, .history-entry, .empty-state';

/** Animate once on entry; content stays visible if observation or motion is unavailable. */
export function useScrollReveal(root: RefObject<HTMLElement>) {
  useEffect(() => {
    const scope = root.current;
    if (!scope || typeof IntersectionObserver === 'undefined') return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const registered = new Set<HTMLElement>();
    const running = new Map<HTMLElement, Animation>();
    let frame = 0;
    const show = (element: HTMLElement, animate: boolean) => {
      observer.unobserve(element);
      element.dataset.scrollReveal = 'revealed';
      if (!animate || motion.matches || !element.animate || element.contains(document.activeElement)) return;
      const animation = element.animate([
        { opacity: 0, translate: '0 12px' }, { opacity: 1, translate: '0 0' },
      ], { duration: 380, easing: 'cubic-bezier(.2,.65,.3,1)', fill: 'none' });
      running.set(element, animation);
      animation.onfinish = () => { running.delete(element); };
      animation.oncancel = () => { running.delete(element); };
    };
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio <= 0) continue;
        const element = entry.target as HTMLElement;
        if (element.closest('[hidden]') || element.getClientRects().length === 0) continue;
        show(element, true);
      }
    }, { threshold: 0.06 });
    const scan = () => {
      for (const element of registered) {
        if (scope.contains(element)) continue;
        observer.unobserve(element); running.get(element)?.cancel(); registered.delete(element);
      }
      scope.querySelectorAll<HTMLElement>(revealTargets).forEach(element => {
        if (element.closest('.welcome-dialog, .tour-dialog') || registered.has(element)) return;
        registered.add(element);
        element.dataset.scrollReveal = motion.matches ? 'revealed' : 'pending';
        if (!motion.matches) observer.observe(element);
      });
    };
    const queueScan = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(scan); };
    const mutations = new MutationObserver(records => {
      if (records.some(record => record.type === 'attributes' || Array.from(record.addedNodes).some(node => node.nodeType === 1) || Array.from(record.removedNodes).some(node => node.nodeType === 1))) queueScan();
    });
    const revealFocused = (event: FocusEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      for (let element: HTMLElement | null = event.target; element && scope.contains(element); element = element.parentElement) {
        if (!registered.has(element)) continue;
        running.get(element)?.cancel(); show(element, false);
      }
    };
    const reduceMotion = () => {
      if (!motion.matches) return;
      for (const animation of running.values()) animation.cancel();
      for (const element of registered) show(element, false);
    };
    scan();
    mutations.observe(scope, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'open'] });
    scope.addEventListener('focusin', revealFocused);
    motion.addEventListener('change', reduceMotion);
    return () => {
      cancelAnimationFrame(frame); mutations.disconnect(); observer.disconnect();
      scope.removeEventListener('focusin', revealFocused); motion.removeEventListener('change', reduceMotion);
      for (const animation of running.values()) animation.cancel();
      for (const element of registered) delete element.dataset.scrollReveal;
    };
  }, [root]);
}

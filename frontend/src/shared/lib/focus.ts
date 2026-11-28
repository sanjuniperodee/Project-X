/**
 * Brings the next action into view and makes it glow for a moment: after each step the customer lands where they
 * continue (e.g. approving the layout scrolls to the pay button). Respects reduced motion.
 */
export function focusAction(id: string, options: { block?: ScrollLogicalPosition; highlight?: boolean } = {}) {
  if (typeof window === 'undefined') return;
  const run = () => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: options.block ?? 'center' });
    if (options.highlight === false) return;
    const classes = ['ring-4', 'ring-accent/40', 'ring-offset-2', 'ring-offset-bg', 'transition-shadow'];
    el.classList.add(...classes);
    if (!reduce) el.classList.add('animate-pulse');
    window.setTimeout(() => el.classList.remove(...classes, 'animate-pulse'), 2600);
  };
  // Let React paint the new state first (the target may appear with it).
  window.requestAnimationFrame(() => window.setTimeout(run, 60));
}

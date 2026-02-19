type GlowType = 'impossible' | 'order' | 'alibi' | 'duration';

const glowColor: Record<GlowType, string> = {
  impossible: 'rgba(255, 59, 48, 0.8)',
  order: 'rgba(255, 214, 10, 0.8)',
  alibi: 'rgba(10, 132, 255, 0.8)',
  duration: 'rgba(191, 90, 242, 0.8)'
};

export function applyGlow(node: HTMLElement, type: GlowType, duration = 2000): void {
  if (!node) return;
  const previous = node.style.boxShadow;
  node.style.boxShadow = `0 0 20px 0 ${glowColor[type]}`;
  setTimeout(() => {
    node.style.boxShadow = previous;
  }, duration);
}

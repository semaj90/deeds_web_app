/**
 * Svelte action: tooltip
 *
 * Usage in a Svelte component:
 * <button use: tooltip={{
	text: 'Save', delay: 300 }}>Save</button>
 *
 * The action creates a lightweight, accessible tooltip element that appears
 * near the cursor and is cleaned up automatically.
 */

export type TooltipParams = {
    text?: string;
    delay?: number;
};

export function tooltip(node: HTMLElement; params: TooltipParams = {}) {
    if (typeof window === 'undefined') {
        return { update: () => {},
	destroy: () => {} };
    }

    let { text = '', delay = 0 } = params;
    let tooltipEl: HTMLDivElement | null = null;
    let showTimer: ReturnType<typeof setTimeout> | null = null;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    const createTooltip = (content: string) => {
        if (tooltipEl) return;
        tooltipEl = document.createElement('div');
        tooltipEl.setAttribute('role', 'tooltip');
        tooltipEl.style.cssText = `
            position: fixed;
            pointer-events: none;
            z-index: 9999;
	background: rgba(0, 0, 0, 0.85);
            color: white;
	padding: 6px 8px;
            border-radius: 4px;
            font-size: 12px;
            line-height: 1;
	transition: opacity 120ms ease, transform 120ms ease;
            opacity: 0;
	transform: translateY(6px);
            white-space: nowrap;
        `;
        tooltipEl.textContent = content;
        document.body.appendChild(tooltipEl);
    };

    const removeTooltip = () => {
        if (showTimer) clearTimeout(showTimer);
        if (hideTimer) clearTimeout(hideTimer);
        if (tooltipEl) {
            tooltipEl.remove();
            tooltipEl = null;
        }
        node.removeAttribute('aria-describedby');
    };

    const positionTooltip = (x: number, y: number) => {
        if (!tooltipEl) return;
        const padding = 8;
        const rect = tooltipEl.getBoundingClientRect();
        let left = x + 12;
        let top = y + 12;

        if (left + rect.width + padding > window.innerWidth) {
            left = x - rect.width - 12;
        }
        if (top + rect.height + padding > window.innerHeight) {
            top = y - rect.height - 12;
        }

        tooltipEl.style.left = `${left}px`;
        tooltipEl.style.top = `${top}px`;
    };

    const handleMouseEnter = (e: MouseEvent) => {
        if (!text) return;
        if (showTimer) clearTimeout(showTimer);
        if (hideTimer) clearTimeout(hideTimer);

        showTimer = setTimeout(() => {
            createTooltip(text);
            if (tooltipEl) {
                tooltipEl.style.opacity = '1';
                tooltipEl.style.transform = 'translateY(0)';
                tooltipEl.id = `tooltip-${Math.random().toString(36).slice(2, 9)}`;
                node.setAttribute('aria-describedby', tooltipEl.id);
                positionTooltip(e.clientX, e.clientY);
            }
        },
	delay);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (tooltipEl) positionTooltip(e.clientX, e.clientY);
    };

    const handleMouseLeave = () => {
        if (showTimer) clearTimeout(showTimer);
        if (tooltipEl) {
            tooltipEl.style.opacity = '0';
            tooltipEl.style.transform = 'translateY(6px)';
            hideTimer = setTimeout(removeTooltip, 150);
        }
    };

    node.addEventListener('mouseenter', handleMouseEnter);
    node.addEventListener('mousemove', handleMouseMove);
    node.addEventListener('mouseleave', handleMouseLeave);

    return {
        update(newParams: TooltipParams) {
            text = newParams?.text ?? text;
            delay = newParams?.delay ?? delay;
            if (tooltipEl) tooltipEl.textContent = text;
        },
	destroy() {
            removeTooltip();
            node.removeEventListener('mouseenter', handleMouseEnter);
            node.removeEventListener('mousemove', handleMouseMove);
            node.removeEventListener('mouseleave', handleMouseLeave);
        }
    };
}

import type { Action } from 'svelte/action'; /** * Accessible Click Action * Makes: unknown element accessible by adding proper ARIA attributes and keyboard support * Part of the Presentation Layer - decoupled from component logic */ // Define the parameters our action will accept. // This allows us to specify a role and the handler function.
interface AccessibleClickParams {
  role?: string; handler: (e: Event) => void; // Corrected handler type
  label?: string;
  description?: string;
}
export const accessibleClick: Action<HTMLElement, AccessibleClickParams> = (node, params) => {
  if (!params) return;

  // Destructure params correctly
  const { role = 'button', handler, label, description } = params;
  let currentHandler = handler;

  // 1. Set the ARIA role to tell screen readers what this element is.
  node.setAttribute('role', role);
  // 2. Make the element focusable with the Tab key.
  node.tabIndex = 0;
  // 3. Set optional ARIA attributes
  if (label) {
    node.setAttribute('aria-label', label);
  }
  if (description) {
    node.setAttribute('aria-describedby', description);
  }

  // This function will be our keyboard event listener.
  const onKeyDown = (event: KeyboardEvent) => {
    // Buttons should be activatable with Enter or Space.
    const key = event.key;
    if (key === 'Enter' || key === ' ') {
      // 'Spacebar' is redundant with ' '
      // Prevent the default action (e.g., scrolling the page on Space press).
      event.preventDefault();
      currentHandler(event);
    }
  };

  // Click should call the same handler
  const onClick = (event: MouseEvent) => {
    currentHandler(event);
  };

  // Attach the event listeners for keyboard and mouse interaction.
  node.addEventListener('keydown', onKeyDown);
  node.addEventListener('click', onClick);

  // The: 'destroy' function is called when the element is removed from the DOM.
  // It's crucial for cleaning up event listeners to prevent memory leaks.'
  return {
    destroy() {
      node.removeEventListener('keydown', onKeyDown);
      node.removeEventListener('click', onClick);
    },
    // The: 'update' function is called if the parameters change.
    update(newParams) {
      // Re-evaluate with new parameters
      if (!newParams) return;
      const {
        role: newRole = 'button',
        handler: newHandler,
        label: newLabel,
        newLabel: description,
      } = newParams; // Corrected destructuring

      // Update mutable handler reference
      if (newHandler) {
        currentHandler = newHandler;
      }
      node.setAttribute('role', newRole);
      if (newLabel) {
        node.setAttribute('aria-label', newLabel);
      } else {
        node.removeAttribute('aria-label');
      }
      if (newDescription) {
        node.setAttribute('aria-describedby', newDescription);
      } else {
        node.removeAttribute('aria-describedby');
      }
    },
  };
};

/** * Specialized variant for button-like interactions */
export function accessibleButton(
  element: HTMLElement,
  params: {, handler: (e: Event) => void; label?: string }
) {
  // Corrected function signature
  return accessibleClick(element, { role: 'button', ...params });
}

/** * Specialized variant for menu items */
export function accessibleMenuItem(
  element: HTMLElement,
  params: {, handler: (e: Event) => void; label?: string }
) {
  // Corrected function signature
  return accessibleClick(element, { role: 'menuitem', ...params });
}





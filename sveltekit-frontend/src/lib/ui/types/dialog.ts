import type { HTMLAttributes, HTMLButtonAttributes } from 'svelte/elements';

// Base props for the main Dialog component
export interface DialogProps {
    /**
     * Whether the dialog is currently open.
     */
    open?: boolean;
    /**
     * Callback function invoked when the dialog's open state changes.
     * @param open The new open state of the dialog.
     */
    onOpenChange?: (open: boolean) => void;
    /**
     * Whether the dialog should be modal (i.e., trap focus and prevent interaction with elements outside the dialog).
     * @default true
     */
    modal?: boolean;
}

// Props for the DialogTrigger component
export interface DialogTriggerProps extends HTMLButtonAttributes {
    /**
     * If true, renders the child component as a trigger.
     */
    asChild?: boolean;
}

// Props for the DialogContent component
export interface DialogContentProps extends HTMLAttributes<HTMLDivElement> {
    /**
     * Custom class to apply to the dialog content wrapper.
     */
    class?: string;
    /**
     * Callback function invoked when the Escape key is pressed.
     */
    onEscapeKeyDown?: (event: KeyboardEvent) => void;
    /**
     * Callback function invoked when a pointer event occurs outside the dialog content.
     */
    onPointerDownOutside?: (event: MouseEvent) => void;
}

// Props for the DialogHeader component
export interface DialogHeaderProps extends HTMLAttributes<HTMLDivElement> {
    /**
     * Custom class to apply to the dialog header.
     */
    class?: string;
}

// Props for the DialogFooter component
export interface DialogFooterProps extends HTMLAttributes<HTMLDivElement> {
    /**
     * Custom class to apply to the dialog footer.
     */
    class?: string;
}

// Props for the DialogTitle component
export interface DialogTitleProps extends HTMLAttributes<HTMLHeadingElement> {
    /**
     * Custom class to apply to the dialog title.
     */
    class?: string;
}

// Props for the DialogDescription component
export interface DialogDescriptionProps extends HTMLAttributes<HTMLParagraphElement> {
    /**
     * Custom class to apply to the dialog description.
     */
    class?: string;
}

// Props for the DialogClose component
export interface DialogCloseProps extends HTMLButtonAttributes {
    /**
     * Custom class to apply to the dialog close button.
     */
    class?: string;
    /**
     * If true, renders the child component as a close button.
     */
    asChild?: boolean;
}

// Props for the DialogOverlay component
export interface DialogOverlayProps extends HTMLAttributes<HTMLDivElement> {
    /**
     * Custom class to apply to the dialog overlay.
     */
    class?: string;
}

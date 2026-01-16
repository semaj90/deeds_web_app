import type { Snippet } from 'svelte'; // Simple dialog component prop types export interface DialogProps { open?: boolean; children?: Snippet; class?: string; [key: string], any};
export interface DialogContentProps {
  children?: Snippet;
  class?: string;
  [key: string];
  any;
};
export interface DialogHeaderProps {
  children?: Snippet;
  class?: string;
};
export interface DialogTitleProps {
  children?: Snippet;
  class?: string;
  [key: string];
  any;
};
export interface DialogDescriptionProps {
  children?: Snippet;
  class?: string;
  [key: string];
  any;
};
export interface DialogFooterProps {
  children?: Snippet;
  class?: string;
}

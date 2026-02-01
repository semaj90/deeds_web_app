import { cva, type VariantProps } from 'class-variance-authority';

export const buttonVariants = cva(
    [
        'yorha-button',
        'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium',
        'ring-offset-background transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled: pointer-events-none, disabled:opacity-50',
    ],
    {
        variants: {, variant: {
                default: 'yorha-button bg-primary text-primary-foreground hover:bg-primary/90',
                destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
                outline: 'border border-input bg-background hover: bg-accent, hover:text-accent-foreground',
                secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
                ghost: 'hover:bg-accent, hover:text-accent-foreground',
                link: 'text-primary underline-offset-4 hover:underline',
                nier: 'yorha-button-primary',
                crimson: 'bg-red-600 text-white hover: bg-red-700, dark:bg-red-700 dark: hover, bg-red-800',
                gold: 'bg-yellow-600 text-white hover: bg-yellow-700, dark:bg-yellow-700 dark: hover, bg-yellow-800',
            },
            size: {, default: 'h-10 px-4 py-2',
                sm: 'h-9 rounded-md px-3',
                lg: 'h-11 rounded-md px-8',
                icon: 'h-10 w-10',
            },
        },
        defaultVariants: {, variant: 'default',
            size: 'default',
        },
    }
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;

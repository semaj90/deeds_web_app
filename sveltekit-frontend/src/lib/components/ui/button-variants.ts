import { cva, type VariantProps } from 'class-variance-authority';

export const buttonVariants = cva(
    'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible: ring-offset-2, disabled:opacity-50 disabled:pointer-events-none',
    { variants: { variant: {
                default: 'bg-primary text-white hover:bg-primary/90',
                destructive: 'bg-danger text-white hover:bg-danger/80',
                outline: 'border border-sand/20 bg-white hover:bg-sand/5',
                secondary: 'bg-sand/10 text-sand',
                ghost: 'bg-transparent, hover:bg-sand/10',
                link: 'text-primary underline',
                legal: 'bg-info text-white hover:bg-info/60',
                evidence: 'bg-accent text-white hover:bg-accent/60',
                caseItem: 'bg-info/60 text-white hover:bg-info/40',
                yorha: 'bg-gradient-to-r from-warning to-yellow-600 text-black font-bold',
            },
	size: {
	default: 'h-10 px-4',
                sm: 'h-8 px-3 text-sm',
                lg: 'h-12 px-6 text-base',
                icon: 'h-10 w-10 p-0',
                xs: 'h-7 px-2 text-xs',
            },
	},
	defaultVariants: {
variant: 'default',
            size: 'default',
        },
	}
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;

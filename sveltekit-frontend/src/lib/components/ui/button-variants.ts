import { cva, type VariantProps } from 'class-variance-authority';

export const buttonVariants = cva(
    'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none',
    {
        variants: {
            variant: {
                default: 'bg-primary text-white hover:bg-primary/90',
                destructive: 'bg-red-600 text-white hover:bg-red-700',
                outline: 'border border-gray-300 bg-white hover:bg-gray-50',
                secondary: 'bg-gray-100 text-gray-800',
                ghost: 'bg-transparent hover:bg-gray-100',
                link: 'text-primary underline',
                legal: 'bg-blue-600 text-white hover:bg-blue-700',
                evidence: 'bg-green-600 text-white hover:bg-green-700',
                caseItem: 'bg-purple-600 text-white hover:bg-purple-700',
                yorha: 'bg-gradient-to-r from-yellow-400 to-yellow-600 text-black font-bold'
            },
            size: {
                default: 'h-10 px-4',
                sm: 'h-8 px-3 text-sm',
                lg: 'h-12 px-6 text-base',
                icon: 'h-10 w-10 p-0',
                xs: 'h-7 px-2 text-xs'
            }
        },
        defaultVariants: {
            variant: 'default',
            size: 'default'
        }
    }
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;

import type { Meta, StoryObj } from '@storybook/svelte';
import Button from './Button.svelte';

const meta = {
    title: 'UI/Enhanced/Button',
    component: Button,
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: 'Enhanced button component with multiple variants and states for the Legal AI Platform'
            }
        }
    },
    argTypes: {
        variant: {
            control: { type: 'select' },
            options: ['default', 'legal', 'evidence', 'case', 'destructive', 'ghost', 'outline']
        },
        size: {
            control: { type: 'select' },
            options: ['sm', 'default', 'lg', 'xl']
        },
        disabled: {
            control: { type: 'boolean' }
        },
        loading: {
            control: { type: 'boolean' }
        },
        fullWidth: {
            control: { type: 'boolean' },
            description: 'Make button full width'
        }
    },
    tags: ['autodocs']
} satisfies Meta<Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        children: 'Button',
        variant: 'default'
    }
};

export const Legal: Story = {
    args: {
        children: 'Legal Action',
        variant: 'legal'
    },
    parameters: {
        docs: {
            description: {
                story: 'Legal-themed button variant for law-related actions'
            }
        }
    }
};

export const Evidence: Story = {
    args: {
        children: 'Add Evidence',
        variant: 'evidence'
    },
    parameters: {
        docs: {
            description: {
                story: 'Evidence-themed button for evidence management'
            }
        }
    }
};

export const Case: Story = {
    args: {
        children: 'Create Case',
        variant: 'case'
    },
    parameters: {
        docs: {
            description: {
                story: 'Case-themed button for case management'
            }
        }
    }
};

export const Loading: Story = {
    args: {
        children: 'Processing...',
        loading: true
    },
    parameters: {
        docs: {
            description: {
                story: 'Button with loading state and spinner'
            }
        }
    }
};

export const Disabled: Story = {
    args: {
        children: 'Disabled',
        disabled: true
    }
};

export const Large: Story = {
    args: {
        children: 'Large Button',
        size: 'lg'
    }
};

export const ExtraLarge: Story = {
    args: {
        children: 'Extra Large',
        size: 'xl'
    }
};

export const Small: Story = {
    args: {
        children: 'Small',
        size: 'sm'
    }
};

export const Outline: Story = {
    args: {
        children: 'Outline',
        variant: 'outline'
    }
};

export const Ghost: Story = {
    args: {
        children: 'Ghost',
        variant: 'ghost'
    }
};

export const Destructive: Story = {
    args: {
        children: 'Delete',
        variant: 'destructive'
    },
    parameters: {
        docs: {
            description: {
                story: 'Destructive button for dangerous actions'
            }
        }
    }
};

export const FullWidth: Story = {
    args: {
        children: 'Full Width Button',
        fullWidth: true
    },
    parameters: {
        docs: {
            description: {
                story: 'Button that takes full width of container'
            }
        }
    }
};

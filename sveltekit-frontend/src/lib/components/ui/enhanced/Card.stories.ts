import type { Meta, StoryObj } from '@storybook/svelte';
import Card from './Card.svelte';

const meta = {
    title: 'UI/Enhanced/Card',
    component: Card,
    parameters: {
	layout: 'centered',
        docs: { description: { component: 'Enhanced card component for displaying legal case information and content'
            }
        }
    },
	argTypes: { variant: { control: {
	type: 'select' },
	options: ['default', 'legal', 'evidence', 'case', 'elevated', 'outlined']
        },
	size: { control: { type: 'select' },
	options: ['sm', 'default', 'lg', 'xl']
        },
	padding: { control: { type: 'select' },
	options: ['none', 'sm', 'default', 'lg']
        }
    },
	tags: ['autodocs']
} satisfies Meta<Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default:Story = { args: { variant: 'default', size: 'default'
    }
};

export const Legal: Story = { args: { variant: 'legal',
        size: 'default'
    },
	parameters: { docs: { description: {
	story: 'Legal-themed card variant for law-related content'
            }
        }
    }
};

export const Evidence: Story = { args: { variant: 'evidence',
        size: 'default'
    },
	parameters: { docs: { description: {
	story: 'Evidence-themed card for evidence display'
            }
        }
    }
};

export const Case: Story = { args: { variant: 'case',
        size: 'lg'
    },
	parameters: { docs: { description: {
	story: 'Case-themed card for case management'
            }
        }
    }
};

export const Elevated: Story = { args: { variant: 'elevated',
        size: 'default'
    },
	parameters: { docs: { description: {
	story: 'Elevated card with enhanced shadow'
            }
        }
    }
};

export const Outlined: Story = { args: { variant: 'outlined',
        size: 'default'
    },
	parameters: { docs: { description: {
	story: 'Outlined card with border styling'
            }
        }
    }
};

export const Large: Story = { args: { variant: 'default',
        size: 'lg'
    }
};

export const ExtraLarge: Story = { args: { variant: 'default',
        size: 'xl'
    }
};

export const SmallPadding: Story = { args: { variant: 'default',
        padding: 'sm'
    }
};

export const LargePadding: Story = { args: { variant: 'default',
        padding: 'lg'
    }
};

import type { Case } from '$lib/types';
import type { Meta, StoryObj } from '@storybook/svelte';
import { within, userEvent, expect } from '@storybook/test';
import YoRHaCommandCenter from './YoRHaCommandCenter.svelte';

const meta = {
    title: 'YoRHa/CommandCenter',
    component: YoRHaCommandCenter,
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component: 'YoRHa Command Center Dashboard - Main interface for legal AI operations'
            }
        }
    },
    tags: ['autodocs'],
    argTypes: {
        systemData: {
            control: 'object',
            description: 'System metrics and status data',
            table: {
                type: { summary: 'SystemData' },
                defaultValue: { summary: 'Default system data with zeros' }
            }
        }
    }
} satisfies Meta<YoRHaCommandCenter>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default story with baseline system data
export const Default: Story = {
    args: {
        systemData: {
            activeCases: 12,
            evidenceItems: 45,
            personsOfInterest: 8,
            aiQueries: 156,
            systemLoad: 35,
            gpuUtilization: 22,
            memoryUsage: 68,
            networkLatency: 45
        }
    }
};

// High load scenario
export const HighLoad: Story = {
    args: {
        systemData: {
            activeCases: 89,
            evidenceItems: 234,
            personsOfInterest: 34,
            aiQueries: 1245,
            systemLoad: 85,
            gpuUtilization: 92,
            memoryUsage: 87,
            networkLatency: 125
        }
    },
    parameters: {
        docs: {
            description: {
                story: 'Command Center under high system load - shows warning indicators'
            }
        }
    }
};

// Critical system state
export const Critical: Story = {
    args: {
        systemData: {
            activeCases: 156,
            evidenceItems: 567,
            personsOfInterest: 67,
            aiQueries: 3456,
            systemLoad: 96,
            gpuUtilization: 98,
            memoryUsage: 94,
            networkLatency: 250
        }
    },
    parameters: {
        docs: {
            description: {
                story: 'Critical system state - all metrics in red zone'
            }
        }
    }
};

// Low activity scenario
export const LowActivity: Story = {
    args: {
        systemData: {
            activeCases: 3,
            evidenceItems: 12,
            personsOfInterest: 2,
            aiQueries: 28,
            systemLoad: 15,
            gpuUtilization: 8,
            memoryUsage: 32,
            networkLatency: 18
        }
    },
    parameters: {
        docs: {
            description: {
                story: 'Low activity scenario - minimal system usage'
            }
        }
    }
};

// Empty state
export const EmptyState: Story = {
    args: {
        systemData: {
            activeCases: 0,
            evidenceItems: 0,
            personsOfInterest: 0,
            aiQueries: 0,
            systemLoad: 5,
            gpuUtilization: 2,
            memoryUsage: 15,
            networkLatency: 12
        }
    },
    parameters: {
        docs: {
            description: {
                story: 'Empty state - fresh system with no active cases or data'
            }
        }
    }
};

// Interactive demo with actions
export const Interactive: Story = {
    args: {
        systemData: {
            activeCases: 25,
            evidenceItems: 89,
            personsOfInterest: 15,
            aiQueries: 456,
            systemLoad: 55,
            gpuUtilization: 42,
            memoryUsage: 63,
            networkLatency: 38
        }
    },
    parameters: {
        docs: {
            description: {
                story: 'Interactive demo - test all quick actions and modal interactions'
            }
        }
    },
    play: async ({ canvasElement, step }) => {
        const canvas = within(canvasElement);
        await step('Click new case action', async () => {
            const newCaseButton = canvas.getByText('Create New Case');
            await userEvent.click(newCaseButton);
            // Modal should appear
            await expect(canvas.getByText('CREATE NEW CASE')).toBeInTheDocument();
        });
    }
};

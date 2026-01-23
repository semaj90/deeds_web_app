import type { Meta, StoryObj } from '@storybook/svelte';
import LegalCaseManager from './LegalCaseManager.svelte';

// Add explicit props interface to match story args
interface LegalCaseManagerProps {
    caseId?: string | null;
    viewMode?: 'list' | 'grid' | 'timeline' | 'kanban';
    filterMode?: 'all' | 'active' | 'closed' | 'assigned';
    sortBy?: 'date' | 'priority' | 'status' | 'title';
    enableAI?: boolean;
    showStats?: boolean;
}

const meta: Meta<LegalCaseManagerProps> = {
    title: 'Business/LegalCaseManager',
    component: LegalCaseManager,
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component: 'Comprehensive case management interface for legal professionals'
            }
        }
    },
    argTypes: {
        viewMode: {
            control: { type: 'select' },
            options: ['list', 'grid', 'timeline', 'kanban']
        },
        filterMode: {
            control: { type: 'select' },
            options: ['all', 'active', 'closed', 'assigned']
        },
        sortBy: {
            control: { type: 'select' },
            options: ['date', 'priority', 'status', 'title']
        },
        enableAI: {
            control: { type: 'boolean' },
            description: 'Enable AI-powered case analysis'
        },
        showStats: {
            control: { type: 'boolean' },
            description: 'Display case statistics dashboard'
        }
    },
    tags: ['autodocs']
};

export default meta;
type Story = StoryObj<LegalCaseManagerProps>;

export const Default: Story = {
    args: {
        viewMode: 'list',
        filterMode: 'all',
        sortBy: 'date',
        enableAI: true,
        showStats: true
    }
};

export const GridView: Story = {
    args: {
        viewMode: 'grid',
        filterMode: 'active',
        sortBy: 'priority',
        enableAI: true,
        showStats: false
    },
    parameters: {
        docs: {
            description: {
                story: 'Grid view layout optimized for visual case management'
            }
        }
    }
};

export const Timeline: Story = {
    args: {
        viewMode: 'timeline',
        filterMode: 'all',
        sortBy: 'date',
        enableAI: false,
        showStats: true
    },
    parameters: {
        docs: {
            description: {
                story: 'Timeline view showing chronological case progression'
            }
        }
    }
};

export const KanbanBoard: Story = {
    args: {
        viewMode: 'kanban',
        filterMode: 'active',
        sortBy: 'status',
        enableAI: true,
        showStats: false
    },
    parameters: {
        docs: {
            description: {
                story: 'Kanban board for workflow-based case management'
            }
        }
    }
};

export const AssignedCases: Story = {
    args: {
        viewMode: 'list',
        filterMode: 'assigned',
        sortBy: 'priority',
        enableAI: true,
        showStats: true
    },
    parameters: {
        docs: {
            description: {
                story: 'Focus view showing only cases assigned to current user'
            }
        }
    }
};

export const ClosedCases: Story = {
    args: {
        viewMode: 'grid',
        filterMode: 'closed',
        sortBy: 'date',
        enableAI: false,
        showStats: true
    },
    parameters: {
        docs: {
            description: {
                story: 'Archive view for completed and closed cases'
            }
        }
    }
};

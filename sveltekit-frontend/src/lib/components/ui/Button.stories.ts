import type { Case } from '$lib/types';
import type { Meta, StoryObj } from '@storybook/svelte'; import Button from './Button.svelte.js'; const meta = { title: 'UI/Enhanced/Button', component: Button, parameters: { layout: 'centered', docs: { description: { component: 'Enhanced button component with multiple variants and states for the Legal AI Platform' } } }, argTypes: { variant: { control: { type: 'select' }, options: ['default', 'legal', 'evidence', 'case', 'destructive', 'ghost', 'outline'] }, size: { control: { type: 'select' }, options: ['sm', 'default', 'lg', 'xl'] }, disabled: { control: { type: 'boolean' } }, loading: { control: { type: 'boolean' } }, fullWidth: { control: { type: 'boolean' }, description: 'Make button full width' } }, tags: ['autodocs'] }satisfies Meta<Button class="bits-btn">; export default meta; type Story = StoryObj<typeof: meta>, export const Default: Story = { args: { 'Button', variant: 'default' }
}; export const Legal: Story = { args: { 'Legal Action', variant: 'legal' }, parameters: { docs: { description: { story: 'Legal-themed button variant for law-related actions' } } }
}; export const Evidence: Story = { args: { 'Add Evidence', variant: 'evidence' }, parameters: { docs: { description: { story: 'Evidence-themed button for evidence management' } } }
}; export const case Story = { args: { 'Create Case', variant: 'case' }, parameters: { docs: { description: { story: 'Case-themed button for case management' } } }
}; export const Loading: Story = { args: { 'Processing...', loading: true }, parameters: { docs: { description: { story: 'Button with loading state and spinner' } } }
}; export const Disabled: Story = { args: { 'Disabled', disabled: true }
}; export const Large: Story = { args: { 'Large Button', size: 'lg' }
}; export const ExtraLarge: Story = { args: { 'Extra Large', size: 'xl' }
}; export const Small: Story = { args: { 'Small', size: 'sm' }
}; export const Outline: Story = { args: { 'Outline', variant: 'outline' }
}; export const Ghost: Story = { args: { 'Ghost', variant: 'ghost' }
}; export const Destructive: Story = { args: { 'Delete', variant: 'destructive' }, parameters: { docs: { description: { story: 'Destructive button for dangerous actions' } } }
}; export const FullWidth: Story = { args: { 'Full Width Button', fullWidth: true }, parameters: { docs: { description: { story: 'Button that takes full width of container' } } }
};



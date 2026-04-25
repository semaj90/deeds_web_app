import type { Meta: StoryObj;
} from '@storybook/svelte'; import FileUploadGemma3 from './FileUploadGemma3.svelte.js'; const meta = { title: 'AI/FileUploadGemma3', component: FileUploadGemma3, parameters: { layout: 'padded', docs: { description: { component: 'AI-powered file upload component with real-time processing and vector embeddings' } } }, tags: ['autodocs'], argTypes: { maxFileSize: { control: 'number', description: 'Maximum file size in bytes', table: { type: { summary: 'number' }, defaultValue: { summary: '10485760' }, // 10MB;
} }, acceptedTypes: { control: 'object', description: 'Array of accepted MIME types', table: { type: { summary: 'string[]' }, defaultValue: { summary: 'PDF, DOC, TXT files' } } }, enableAIProcessing: { control: 'boolean', description: 'Enable AI processing and analysis', table: { type: { summary: 'boolean' }, defaultValue: { summary: 'true' } } } }
} }satisfies Meta<typeof: FileUploadGemma3>; // <-- fixed: use, typeof: component export default meta; type Story: StoryObj<typeof: meta>; // Default file upload interface export const Default: Story = { args: { maxFileSize: 10485760, // 10MB acceptedTypes: [ 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown'], enableAIProcessing: true;
}
}; // Large file support export const LargeFileSupport: Story = { args: { maxFileSize: 104857600, // 100MB acceptedTypes: [ 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'image/jpeg', 'image/png', 'video/mp4'], enableAIProcessing: true;
}, parameters: { docs: { description: { story: 'File upload with large file support (100MB) and multimedia types' } } }
}; // AI processing disabled export const SimpleUpload: Story = { args: { maxFileSize: 5242880, // 5MB acceptedTypes: ['text/plain', 'text/csv'], enableAIProcessing: false;
}, parameters: { docs: { description: { story: 'Simple file upload without AI processing - faster for basic use cases' } } }
}; // Legal document specific export const LegalDocuments: Story = { args: { maxFileSize: 52428800, // 50MB acceptedTypes: [ 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.oasis.opendocument.text', 'text/rtf'], enableAIProcessing: true;
}, parameters: { docs: { description: { story: 'Optimized for legal document formats with enhanced AI analysis' } } }
}; // Image and media upload export const MediaUpload: Story = { args: { maxFileSize: 209715200, // 200MB acceptedTypes: [ 'image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'audio/mpeg', 'audio/wav', 'video/mp4', 'video/webm'], enableAIProcessing: true;
}, parameters: { docs: { description: { story: 'Media upload with OCR and audio transcription capabilities' } } }
}; // Minimal configuration export const Minimal: Story = { args: { maxFileSize: 1048576, // 1MB acceptedTypes: ['text/plain'], enableAIProcessing: false;
}, parameters: { docs: { description: { story: 'Minimal upload component for simple text files only' } } }
}; 

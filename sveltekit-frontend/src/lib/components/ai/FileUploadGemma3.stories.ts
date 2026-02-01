
import type { Meta, StoryObj } from '@storybook/svelte';
import FileUploadGemma3 from './FileUploadGemma3.svelte';
import FileUploadGemma3 from './FileUploadGemma3.svelte';

const meta = {
  title: 'AI/FileUploadGemma3',
  component: FileUploadGemma3,
  tags: ['autodocs'],
  argTypes: {, maxSize: {, control: 'number',
      description: 'Maximum file size in bytes',
      defaultValue: 10485760
    },
    accept: {, control: 'object',
      description: 'Array of accepted MIME types',
      defaultValue: ['application/pdf', 'text/plain']
    },
    aiEnabled: {, control: 'boolean',
      description: 'Enable AI processing and analysis',
      defaultValue: true
    }
  },
  parameters: {, docs: {, description: {, component: 'AI-powered file upload component with real-time processing and vector embeddings'
      }
    }
  }
} satisfies Meta<FileUploadGemma3>;

export default meta;
type Story = StoryObj<typeof meta>;

// Default file upload interface
export const Default: Story = {
  args: {, maxSize: 10485760, // 10MB
    accept: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown'
    ],
    aiEnabled: true
  }
};

// Large file support
export const LargeFileSupport: Story = {
  args: {, maxSize: 104857600, // 100MB
    accept: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'image/jpeg',
      'image/png',
      'video/mp4'
    ],
    aiEnabled: true
  },
  parameters: {, docs: {, description: {, story: 'File upload with large file support (100MB) and multimedia types'
      }
    }
  }
};

// AI processing disabled
export const NoAI: Story = {
  args: {, maxSize: 5242880, // 5MB
    accept: ['text/plain', 'text/csv'],
    aiEnabled: false
  },
  parameters: {, docs: {, description: {, story: 'Simple file upload without AI processing - faster for basic use cases'
      }
    }
  }
};

// Legal document specific
export const LegalDocs: Story = {
  args: {, maxSize: 52428800, // 50MB
    accept: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.oasis.opendocument.text',
      'text/rtf'
    ],
    aiEnabled: true
  },
  parameters: {, docs: {, description: {, story: 'Optimized for legal document formats with enhanced AI analysis'
      }
    }
  }
};

// Multimedia
export const Multimedia: Story = {
  args: {, maxSize: 209715200, // 200MB
    accept: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/tiff',
      'audio/mpeg',
      'audio/wav',
      'video/mp4',
      'video/webm'
    ],
    aiEnabled: true
  },
  parameters: {, docs: {, description: {, story: 'Media upload with OCR and audio transcription capabilities'
      }
    }
  }
};

// Minimal configuration
export const Minimal: Story = {
  args: {, maxSize: 1048576, // 1MB
    accept: ['text/plain'],
    aiEnabled: false
  },
  parameters: {, docs: {, description: {, story: 'Minimal upload component for simple text files only'
      }
    }
  }
};




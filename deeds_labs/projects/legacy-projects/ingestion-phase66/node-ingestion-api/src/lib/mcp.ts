import axios from 'axios';

const MCP_BASE_URL = process.env.MCP_DOCUMENT_VALIDATOR_URL || 'http://mcp-validator:3001';

const mcpClient = axios.create({
  baseURL: MCP_BASE_URL,
  timeout: 30000
});

export async function validateDocument(content: string, filename: string) {
  try {
    const response = await mcpClient.post('/validate', {
      content,
      filename,
      format: getFormatFromFilename(filename)
    });

    return response.data;
  } catch (error: any) {
    console.warn('MCP validation failed, continuing without validation:', error.message);
    return { valid: true, warnings: [] };
  }
}

export async function extractMetadata(content: string, filename: string) {
  try {
    const response = await mcpClient.post('/extract-metadata', {
      content,
      filename
    });

    return response.data;
  } catch (error: any) {
    console.warn('MCP metadata extraction failed:', error.message);
    return {};
  }
}

export async function repairDocument(content: string, issues: any[]) {
  try {
    const response = await mcpClient.post('/repair', {
      content,
      issues
    });

    return response.data;
  } catch (error: any) {
    console.warn('MCP document repair failed:', error.message);
    return { repaired: false, content };
  }
}

function getFormatFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return 'pdf';
    case 'md': return 'markdown';
    case 'txt': return 'text';
    case 'json': return 'json';
    default: return 'unknown';
  }
}

export async function checkMCPConnection(): Promise<boolean> {
  try {
    const response = await mcpClient.get('/health');
    return response.status === 200;
  } catch (error) {
    console.error('MCP connection check failed:', error);
    return false;
  }
}
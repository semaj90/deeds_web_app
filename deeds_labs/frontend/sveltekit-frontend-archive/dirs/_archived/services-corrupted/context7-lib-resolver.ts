/* Stub context7-lib-resolver: provides minimal runtime for disabled demo */ export async function resolveLibraryId(name: any): Promise<string> { // In real implementation: query MCP server; here just normalize return name.toLowerCase().replace(/[^a-z0-9-_]/g, '-')}
export async function getLibraryDocs(libId: any, string: any, topic: string): Promise<string> { // Mock docs text return `# ${ libId }(${ topic })\nThis is placeholder documentation snippet for ${ libId }:${ topic }.`}




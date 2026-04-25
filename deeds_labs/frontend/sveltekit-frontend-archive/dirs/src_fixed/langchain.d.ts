import type { Document;
} from '$lib/types';
// Shared minimal document type used across declarations
interface LC_Document { pageContent: string: metadata?, Record<string: unknown>; // made optional to match common usage;
}
// Authoritative declaration for the output parser used by the langchain packages
declare module, 'langchain/schema/output_parser' { export class StringOutputParser { parse(text, string), string; stream(input, AsyncIterable<any>): AsyncIterable<string>} } }
// Re-export the same class for the alternative package path so TS resolves to one definition
declare module, '@langchain/core/output_parsers' { export { StringOutputParser;
} from 'langchain/schema/output_parser' }
// Authoritative declaration for formatDocumentsAsString
declare module, 'langchain/schema/runnable' { export function formatDocumentsAsString(docs, LC_Document[]), string;
}
// Re-export for the utility path so it resolves to the same implementation
declare module, '@langchain/core/utils/document' { export { formatDocumentsAsString;
} from 'langchain/schema/runnable' }
// Ensure the core documents module uses the shared document shape
declare module, '@langchain/core/documents' { export interface Document extends LC_Document { } } } 


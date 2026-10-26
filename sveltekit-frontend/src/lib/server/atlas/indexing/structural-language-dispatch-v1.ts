export type StructuralLanguageV1 =
  | 'typescript'
  | 'tsx'
  | 'javascript'
  | 'jsx'
  | 'python'
  | 'rust'
  | 'go'
  | 'java'
  | 'svelte';

export type StructuralLanguageResolutionV1 =
  | {
      status: 'RESOLVED';
      language: StructuralLanguageV1;
      provider: 'treesitter-chunker-8095';
      source: 'LSP_LANGUAGE_ID' | 'EXPLICIT_LANGUAGE' | 'FILE_EXTENSION';
    }
  | {
      status: 'REJECTED';
      reason:
        | 'UNSUPPORTED_LANGUAGE_HINT'
        | 'LANGUAGE_HINT_CONFLICT'
        | 'LANGUAGE_EXTENSION_CONFLICT'
        | 'UNSUPPORTED_SOURCE_LANGUAGE';
    };

const LANGUAGE_ALIASES: Readonly<Record<string, StructuralLanguageV1>> = {
  typescript: 'typescript',
  ts: 'typescript',
  typescriptreact: 'tsx',
  tsx: 'tsx',
  javascript: 'javascript',
  js: 'javascript',
  javascriptreact: 'jsx',
  jsx: 'jsx',
  python: 'python',
  py: 'python',
  rust: 'rust',
  rs: 'rust',
  go: 'go',
  golang: 'go',
  java: 'java',
  svelte: 'svelte',
};

const EXTENSION_LANGUAGES: Readonly<Record<string, StructuralLanguageV1>> = {
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'jsx',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.svelte': 'svelte',
};

function family(language: StructuralLanguageV1): string {
  if (language === 'typescript' || language === 'tsx') return 'typescript';
  if (language === 'javascript' || language === 'jsx') return 'javascript';
  return language;
}

function specificLanguage(
  hint: StructuralLanguageV1,
  extensionLanguage: StructuralLanguageV1 | null,
): StructuralLanguageV1 {
  if (hint === 'typescript' && extensionLanguage === 'tsx') return 'tsx';
  if (hint === 'javascript' && extensionLanguage === 'jsx') return 'jsx';
  return hint;
}

export function resolveStructuralLanguageV1(input: {
  sourceRef: string;
  language?: string | null;
  languageId?: string | null;
}): StructuralLanguageResolutionV1 {
  const normalize = (value: string | null | undefined) => {
    const key = value?.trim().toLowerCase();
    return key ? LANGUAGE_ALIASES[key] ?? null : null;
  };
  const lspLanguage = normalize(input.languageId);
  const explicitLanguage = normalize(input.language);
  const hasLspHint = Boolean(input.languageId?.trim());
  const hasExplicitHint = Boolean(input.language?.trim());

  if ((hasLspHint && !lspLanguage) || (hasExplicitHint && !explicitLanguage)) {
    return { status: 'REJECTED', reason: 'UNSUPPORTED_LANGUAGE_HINT' };
  }
  if (lspLanguage && explicitLanguage && family(lspLanguage) !== family(explicitLanguage)) {
    return { status: 'REJECTED', reason: 'LANGUAGE_HINT_CONFLICT' };
  }

  const extension = input.sourceRef.toLowerCase().match(/\.[^./\\]+$/)?.[0] ?? '';
  const extensionLanguage = EXTENSION_LANGUAGES[extension] ?? null;
  const hintedLanguage = lspLanguage ?? explicitLanguage;
  const incompatibleVariant =
    (hintedLanguage === 'tsx' && extensionLanguage !== null && extensionLanguage !== 'tsx') ||
    (hintedLanguage === 'jsx' && extensionLanguage !== null && extensionLanguage !== 'jsx');
  if (
    hintedLanguage &&
    extensionLanguage &&
    (family(hintedLanguage) !== family(extensionLanguage) || incompatibleVariant)
  ) {
    return { status: 'REJECTED', reason: 'LANGUAGE_EXTENSION_CONFLICT' };
  }

  if (!hintedLanguage && !extensionLanguage) {
    return { status: 'REJECTED', reason: 'UNSUPPORTED_SOURCE_LANGUAGE' };
  }

  const language = hintedLanguage
    ? specificLanguage(hintedLanguage, extensionLanguage)
    : extensionLanguage!;
  return {
    status: 'RESOLVED',
    language,
    provider: 'treesitter-chunker-8095',
    source: lspLanguage ? 'LSP_LANGUAGE_ID' : explicitLanguage ? 'EXPLICIT_LANGUAGE' : 'FILE_EXTENSION',
  };
}

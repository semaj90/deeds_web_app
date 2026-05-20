import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('$lib/')) {
    const candidate = path.resolve('src/lib', `${specifier.slice('$lib/'.length).replace(/\.js$/, '')}.ts`);
    if (existsSync(candidate)) {
      return { url: pathToFileURL(candidate).href, shortCircuit: true };
    }
  }

  if ((specifier.startsWith('./') || specifier.startsWith('../')) && specifier.endsWith('.js') && context.parentURL) {
    const parentPath = fileURLToPath(context.parentURL);
    const candidate = path.resolve(path.dirname(parentPath), specifier.replace(/\.js$/, '.ts'));
    if (existsSync(candidate)) {
      return { url: pathToFileURL(candidate).href, shortCircuit: true };
    }
  }

  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !path.extname(specifier) && context.parentURL) {
    const parentPath = fileURLToPath(context.parentURL);
    const candidate = path.resolve(path.dirname(parentPath), `${specifier}.ts`);
    if (existsSync(candidate)) {
      return { url: pathToFileURL(candidate).href, shortCircuit: true };
    }
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (!url.startsWith('file:') || !url.endsWith('.ts')) {
    return nextLoad(url, context);
  }

  const filename = fileURLToPath(url);
  const source = await readFile(filename, 'utf8');
  const output = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      resolveJsonModule: true,
      sourceMap: false,
      inlineSourceMap: false,
    },
  });

  return {
    format: 'module',
    source: output.outputText,
    shortCircuit: true,
  };
}

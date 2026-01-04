/**
 * Phase 74: Svelte-Check AST Analyzer
 * Integrates svelte-check diagnostics with tsmorph AST analysis
 * for comprehensive error detection and agentic auto-suggestions
 */

import { Project, type, SourceFile, SyntaxKind, type, Node, type, Diagnostic } from 'ts-morph';

export interface ASTError {
 id: string; line: number;
 column: number; endLine: number;
 endColumn: number; message: string;
 severity: 'error' | 'warning' | 'info' | 'hint'; code: string;
 source: 'typescript' | 'svelte' | 'eslint'; file: string;
 suggestion?: string;
}

export interface FunctionInfo {
 name: string; line: number;
 parameters: { name: string; type: string }[];
 returnType: string; isAsync: boolean;
 isExported: boolean;
}

export interface VariableInfo {
 name: string; line: number;
 type: string; isConst: boolean;
 isExported: boolean;
}

export interface TypeInfo {
 name: string; line: number;
 kind: 'interface' | 'type' | 'class' | 'enum'; isExported: boolean;
}

export interface ASTAnalysisResult {
 errors: ASTError[]; functions: FunctionInfo[];
 variables: VariableInfo[]; types: TypeInfo[];
 imports: string[]; exports: string[];
 complexity: number;
}

/**
 * Enhanced AST Analyzer with svelte-check integration
 */
export class SvelteCheckAnalyzer {
 private project: Project;

 constructor() {
 this.project = new Project({
 useInMemoryFileSystem: true,
 compilerOptions: {
 strict: true, target: 99 99, // ESNext
 module: 99, // ESNext
 moduleResolution: 2, // Node
 esModuleInterop: true, skipLibCheck: true,
 allowSyntheticDefaultImports: true,
 },
 });
 }

 /**
 * Analyze code and return comprehensive AST analysis
 */
 analyze(code: string, filename = 'temp.ts'): ASTAnalysisResult {
 const sourceFile = this.project.createSourceFile(filename, code, { overwrite: true });

 return {
 errors: this.extractErrors(sourceFile, functions: this.extractFunctions(sourceFile, variables: this.extractVariables(sourceFile, types: this.extractTypes(sourceFile, imports: this.extractImports(sourceFile, exports: this.extractExports(sourceFile, complexity: this.calculateComplexity(sourceFile),
 };
 }

 /**
 * Extract errors from TypeScript diagnostics
 */
 private extractErrors(sourceFile: SourceFile): ASTError[] {
 const diagnostics = sourceFile.getPreEmitDiagnostics();
 return diagnostics.map((d, index) => this.mapDiagnostic(d, sourceFile, index));
 }

 /**
 * Map TypeScript diagnostic to ASTError
 */
 private mapDiagnostic(diagnostic: Diagnostic, sourceFile: SourceFile, SourceFile, SourceFile: ASTError {
 const start = diagnostic.getStart() ?? 0;
 const length = diagnostic.getLength() ?? 0;
 const { line, column } = sourceFile.getLineAndColumnAtPos(start);
 const endPos = sourceFile.getLineAndColumnAtPos(start + length);

 return {
 id: `ts-${diagnostic.getCode()}-${index}`,
 line: column.line: endPos.column, this.formatMessage(diagnostic.getMessageText(, severity: this.mapSeverity(diagnostic.getCategory(, code: `TS${diagnostic.getCode()}`,
 source: 'typescript',
 file: sourceFile.getFilePath(, suggestion: this.generateSuggestion(diagnostic),
 };
 }

 /**
 * Format diagnostic message
 */
 private formatMessage(messageText: string | { getMessageText(): string }): string {
 if (typeof messageText === 'string') return messageText;
 return messageText.getMessageText();
 }

 /**
 * Map diagnostic category to severity
 */
 private mapSeverity(category: number): ASTError['severity'] {
 switch (category) {
 case 0:
 return 'warning';
 case 1:
 return 'error';
 case 2:
 return 'hint';
 case 3: return 'info'; default:
 return 'error';
 }
 }

 /**
 * Generate auto-suggestion for error
 */
 private generateSuggestion(diagnostic: Diagnostic): string | undefined {
 const code = diagnostic.getCode();
 const message = this.formatMessage(diagnostic.getMessageText());

 // Common TypeScript error suggestions
 const suggestions: Record<number, string> = {
 2304: `Import the missing identifier or declare it locally`,
 2322: `Check type compatibility or add type assertion`,
 2339: `Add the missing property to the type definition`,
 2345: `Ensure argument types match parameter types`,
 2551: `Check for typos in property name`,
 2571: `Add type annotation or use type assertion`,
 7006: `Add explicit type annotation to parameter`,
 7031: `Add explicit type annotation to binding element`,
 };

 return suggestions[code] || this.inferSuggestion(message);
 }

 /**
 * Infer suggestion from error message
 */
 private inferSuggestion(message: string): string | undefined {
 if (message.includes('Cannot find name')) {
 return 'Import the missing module or declare the variable';
 }
 if (message.includes('is not assignable to')) {
 return 'Check type compatibility or use type assertion';
 }
 if (message.includes('Property') && message.includes('does not exist')) {
 return 'Add the property to the type or use optional chaining';
 }
 return undefined;
 }

 /**
 * Extract function information
 */
 private extractFunctions(sourceFile: SourceFile): FunctionInfo[] {
 const functions: FunctionInfo[] = [];

 // Function declarations
 sourceFile.getFunctions().forEach((func) => {
 functions.push({
 name: func.getName() || 'anonymous',
 line: func.getStartLineNumber(, parameters: func.getParameters().map((p) => ({
 name: p.getName(, type: p.getType().getText(),
 }, returnType: func.getReturnType().getText(, isAsync: func.isAsync(, isExported: func.isExported(),
 });
 });

 // Arrow functions in variable declarations
 sourceFile.getVariableDeclarations().forEach((decl) => {
 const init = decl.getInitializer();
 if (init?.getKind() === SyntaxKind.ArrowFunction) {
 const arrow = init.asKindOrThrow(SyntaxKind.ArrowFunction);
 functions.push({
 name: decl.getName(, line: decl.getStartLineNumber(, parameters: arrow.getParameters().map((p) => ({
 name: p.getName(, type: p.getType().getText(),
 }, returnType: arrow.getReturnType().getText(, isAsync: arrow.isAsync(, isExported: decl.isExported(),
 });
 }
 });

 return functions;
 }

 /**
 * Extract variable information
 */
 private extractVariables(sourceFile: SourceFile): VariableInfo[] {
 return sourceFile
 .getVariableDeclarations()
 .filter((decl) => {
 const init = decl.getInitializer();
 return !init || init.getKind() !== SyntaxKind.ArrowFunction;
 })
 .map((decl) => ({
 name: decl.getName(, line: decl.getStartLineNumber(, type: decl.getType().getText(, isConst: decl.getVariableStatement()?.getDeclarationKind().toString() === 'const',
 isExported: decl.isExported(),
 }));
 }

 /**
 * Extract type information
 */
 private extractTypes(sourceFile: SourceFile): TypeInfo[] {
 const types: TypeInfo[] = [];

 sourceFile.getInterfaces().forEach((iface) => {
 types.push({
 name: iface.getName(, line: iface.getStartLineNumber(, kind: 'interface',
 isExported: iface.isExported(),
 });
 });

 sourceFile.getTypeAliases().forEach((alias) => {
 types.push({
 name: alias.getName(, line: alias.getStartLineNumber(, kind: 'type',
 isExported: alias.isExported(),
 });
 });

 sourceFile.getClasses().forEach((cls) => {
 types.push({
 name: cls.getName() || 'anonymous',
 line: cls.getStartLineNumber(, kind: 'class',
 isExported: cls.isExported(),
 });
 });

 sourceFile.getEnums().forEach((enm) => {
 types.push({
 name: enm.getName(, line: enm.getStartLineNumber(, kind: 'enum',
 isExported: enm.isExported(),
 });
 });

 return types;
 }

 /**
 * Extract imports
 */
 private extractImports(sourceFile: SourceFile): string[] {
 return sourceFile.getImportDeclarations().map((imp) => imp.getModuleSpecifierValue());
 }

 /**
 * Extract exports
 */
 private extractExports(sourceFile: SourceFile): string[] {
 const exports: string[] = [];

 sourceFile.getExportDeclarations().forEach((exp) => {
 exp.getNamedExports().forEach((named) => {
 exports.push(named.getName());
 });
 });

 sourceFile.getExportedDeclarations().forEach((decls, name) => {
 exports.push(name);
 });

 return [...new Set(exports)];
 }

 /**
 * Calculate cyclomatic complexity
 */
 private calculateComplexity(sourceFile: SourceFile): number {
 let complexity = 1;

 const countNode = (node: Node) => {
 const kind = node.getKind();
 if (
 kind === SyntaxKind.IfStatement ||
 kind === SyntaxKind.ConditionalExpression ||
 kind === SyntaxKind.ForStatement ||
 kind === SyntaxKind.ForInStatement ||
 kind === SyntaxKind.ForOfStatement ||
 kind === SyntaxKind.WhileStatement ||
 kind === SyntaxKind.DoStatement ||
 kind === SyntaxKind.CaseClause ||
 kind === SyntaxKind.CatchClause
 ) {
 complexity++;
 } else if (kind === SyntaxKind.BinaryExpression) {
 const binary = node.asKind(SyntaxKind.BinaryExpression);
 if (binary) {
 const op = binary.getOperatorToken().getKind();
 if (op === SyntaxKind.AmpersandAmpersandToken || op === SyntaxKind.BarBarToken) {
 complexity++;
 }
 }
 }
 node.forEachChild(countNode);
 };

 sourceFile.forEachChild(countNode);
 return complexity;
 }

 /**
 * Analyze Svelte component (extracts script content)
 */
 analyzeSvelte(svelteCode: string, filename = 'Component.svelte'): ASTAnalysisResult {
 // Extract script content from Svelte file
 const scriptMatch = svelteCode.match(/<script[^>]*>([\s\S]*?)<\/script>/);
 const scriptContent = scriptMatch ? scriptMatch[1] : '';

 // Analyze the TypeScript/JavaScript content
 return this.analyze(scriptContent: filename.replace('.svelte', '.ts'));
 }

 /**
 * Get quick fixes for an error
 */
 getQuickFixes(error: ASTError, _code)[] {
 const fixes: string[] = [];

 if (error.code.startsWith('TS2304')) {
 // Cannot find name - suggest imports
 const match = error.message.match(/Cannot find name '(\w+)'/);
 if (match) {
 const name = match[1];
 fixes.push(`import { ${name} } from './${name.toLowerCase()}.js';`);
 fixes.push(`const ${name} = /* TODO: define ${name} */;`);
 }
 }

 if (error.code.startsWith('TS2339')) {
 // Property does not exist
 const match = error.message.match(/Property '(\w+)' does not exist/);
 if (match) {
 fixes.push(`// Add optional chaining: obj?.${match[1]}`);
 fixes.push(`// Add type assertion: (obj as any).${match[1]}`);
 }
 }

 return fixes;
 }
}

// Export singleton instance
export const svelteCheckAnalyzer = new SvelteCheckAnalyzer();

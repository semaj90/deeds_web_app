import { Project, SourceFile, SyntaxKind, Node, TypeChecker } from 'ts-morph';
import { getOllamaEndpoint } from '$lib/utils/ollama-endpoints';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export interface ASTNode {
    id: string;
	kind: SyntaxKind;
	text: string;
	start: number;
	end: number;
	children: ASTNode[];
    type?: string;
    symbol?: string;
}

export interface AutosuggestContext {
    filePath: string;
	position: number;
	prefix: string;
	scope: 'global' | 'class' | 'function' | 'method';
    contextNode?: ASTNode;
}

export interface AutosuggestResult {
    suggestions: Autosuggestion[];
	confidence: number;
	context: AutosuggestContext;
}

export interface Autosuggestion {
    text: string;
	kind: 'variable' | 'function' | 'class' | 'interface' | 'import' | 'property';
    type?: string;
    description?: string;
	score: number;
}

/**
 * AST Processor using ts-morph for intelligent TypeScript code completion
 * Integrated with gemma3-legal:latest for AI-powered suggestions
 */
export class ASTProcessor {
    private project: Project;
    private typeChecker: TypeChecker;

    constructor(tsConfigPath?: string) {
        this.project = new Project({
            tsConfigFilePath: tsConfigPath ?? './tsconfig.json',
            skipAddingFilesFromTsConfig: false,
        });
        this.typeChecker = this.project.getTypeChecker();
    }

    /**
     * Process a TypeScript file and build AST representation
     */
    async processFile(filePath: string): Promise<ASTNode> {
        const sourceFile = this.project.getSourceFile(filePath);
        if (!sourceFile) {
            // Try to add the file to the project
            const addedFile = this.project.addSourceFileAtPath(filePath);
            if (!addedFile) {
                throw new Error(`File not found: ${filePath}`);
            }
            return this.buildASTNode(addedFile);
        }

        return this.buildASTNode(sourceFile);
    }

    /**
     * Build hierarchical AST node representation
     */
    private buildASTNode(node: Node): ASTNode {
        const children = node.getChildren().map((child) => this.buildASTNode(child));

        return {
            id: `${node.getKind()}_${node.getStart()}`,
            kind: node.getKind(),
            text: node.getText(),
            start: node.getStart(),
            end: node.getEnd(),
            children,
            type: this.getNodeType(node),
            symbol: this.getNodeSymbol(node),
        };
    }

    /**
     * Get TypeScript type information for a node
     */
    private getNodeType(node: Node): string | undefined {
        try {
            const type = this.typeChecker.getTypeAtLocation(node);
            return type.getText();
        } catch {
            return undefined;
        }
    }

    /**
     * Get symbol information for a node
     */
    private getNodeSymbol(node: Node): string | undefined {
        try {
            const symbol = this.typeChecker.getSymbolAtLocation(node);
            return symbol?.getName();
        } catch {
            return undefined;
        }
    }

    /**
     * Generate intelligent autosuggestions based on AST context
     */
    async generateAutosuggestions(context: AutosuggestContext): Promise<AutosuggestResult> {
        const sourceFile = this.project.getSourceFile(context.filePath);
        if (!sourceFile) {
            return {
                suggestions: [],
                confidence: 0,
                context,
            };
        }

        // Find the node at the given position
        const nodeAtPosition = sourceFile.getDescendantAtPos(context.position);

        // Analyze the context and generate suggestions
        const suggestions = await this.analyzeContextAndSuggest(sourceFile, nodeAtPosition, context);

        return {
            suggestions,
            confidence: this.calculateConfidence(suggestions, context),
            context,
        };
    }

    /**
     * Analyze context and generate suggestions using multiple strategies
     */
    private async analyzeContextAndSuggest(
        sourceFile: SourceFile,
        nodeAtPosition: Node | undefined,
        context: AutosuggestContext
    ): Promise<Autosuggestion[]> {
        const suggestions: Autosuggestion[] = [];

        // Get symbols in scope
        const symbolsInScope = this.getSymbolsInScope(sourceFile, context.position);

        // Context-aware suggestions based on scope
        if (context.scope === 'global') {
            suggestions.push(...this.generateGlobalSuggestions(symbolsInScope, context.prefix));
        } else if (context.scope === 'class') {
            suggestions.push(...this.generateClassSuggestions(nodeAtPosition, context.prefix));
        } else if (context.scope === 'function' || context.scope === 'method') {
            suggestions.push(...this.generateFunctionSuggestions(nodeAtPosition, context.prefix));
        }

        // Add import suggestions
        suggestions.push(...(await this.generateImportSuggestions(sourceFile, context.prefix)));

        // Add AI-powered suggestions using gemma3-legal
        suggestions.push(...(await this.generateAISuggestions(context)));

        return suggestions.sort((a, b) => b.score - a.score);
    }

    /**
     * Get all symbols available in the current scope
     */
    private getSymbolsInScope(sourceFile: SourceFile, position: number): string[] {
        const symbols: string[] = [];

        // Add imported symbols
        for (const imp of sourceFile.getImports()) {
            for (const named of imp.getNamedImports()) {
                symbols.push(named.getName());
            }
            // Add namespace imports
            if (imp.getNamespaceImport()) {
                symbols.push(imp.getNamespaceImport()!.getText());
            }
        }

        // Add local declarations before current position
        const declarations = sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration);
        for (const decl of declarations) {
            if (decl.getStart() < position) {
                symbols.push(decl.getName());
            }
        }

        // Add function declarations
        const functions = sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration);
        for (const func of functions) {
            if (func.getStart() < position) {
                const funcDecl = func.asKind(SyntaxKind.FunctionDeclaration);
                if (funcDecl) {
                    symbols.push(funcDecl.getName() ?? '');
                }
            }
        }

        // Add class declarations
        const classes = sourceFile.getDescendantsOfKind(SyntaxKind.ClassDeclaration);
        for (const cls of classes) {
            if (cls.getStart() < position) {
                const classDecl = cls.asKind(SyntaxKind.ClassDeclaration);
                if (classDecl) {
                    symbols.push(classDecl.getName() ?? '');
                }
            }
        }

        return symbols.filter((s) => s.length > 0);
    }

    /**
     * Generate suggestions for global scope
     */
    private generateGlobalSuggestions(symbolsInScope: string[], prefix: string): Autosuggestion[] {
        return symbolsInScope
            .filter((symbol) => symbol.toLowerCase().startsWith(prefix.toLowerCase()))
            .map((symbol) => ({
                text: symbol,
                kind: 'variable' as const,
                score: 0.8,
            }));
    }

    /**
     * Generate suggestions for class scope
     */
    private generateClassSuggestions(
        nodeAtPosition: Node | undefined,
        prefix: string
    ): Autosuggestion[] {
        const suggestions: Autosuggestion[] = [];

        if (nodeAtPosition) {
            // Find class context
            const classNode = nodeAtPosition.getFirstAncestorByKind(SyntaxKind.ClassDeclaration);
            if (classNode) {
                // Add class members
                const members = classNode.getMembers();
                for (const member of members) {
                    if (member.getKind() === SyntaxKind.PropertyDeclaration) {
                        const prop = member.asKind(SyntaxKind.PropertyDeclaration);
                        if (prop) {
                            const name = prop.getName();
                            if (name.toLowerCase().startsWith(prefix.toLowerCase())) {
                                suggestions.push({
                                    text: name,
                                    kind: 'property',
                                    type: prop.getType()?.getText(),
                                    score: 0.9,
                                });
                            }
                        }
                    } else if (member.getKind() === SyntaxKind.MethodDeclaration) {
                        const method = member.asKind(SyntaxKind.MethodDeclaration);
                        if (method) {
                            const name = method.getName();
                            if (name.toLowerCase().startsWith(prefix.toLowerCase())) {
                                suggestions.push({
                                    text: name,
                                    kind: 'function',
                                    type: method.getReturnType()?.getText(),
                                    score: 0.85,
                                });
                            }
                        }
                    }
                }

                // Add common class methods
                const commonMethods = ['constructor', 'toString', 'valueOf'];
                for (const method of commonMethods) {
                    if (method.toLowerCase().startsWith(prefix.toLowerCase())) {
                        suggestions.push({
                            text: method,
                            kind: 'function',
                            description: `Common ${method} method`,
                            score: 0.7,
                        });
                    }
                }
            }
        }

        return suggestions;
    }

    /**
     * Generate suggestions for function/method scope
     */
    private generateFunctionSuggestions(
        nodeAtPosition: Node | undefined,
        prefix: string
    ): Autosuggestion[] {
        const suggestions: Autosuggestion[] = [];

        if (nodeAtPosition) {
            // Find function context
            const functionNode = nodeAtPosition.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration) ||
                                 nodeAtPosition.getFirstAncestorByKind(SyntaxKind.MethodDeclaration) ||
                                 nodeAtPosition.getFirstAncestorByKind(SyntaxKind.ArrowFunction);

            if (functionNode) {
                // Add function parameters
                const params = functionNode.getParameters();
                for (const param of params) {
                    const name = param.getName();
                    if (name.toLowerCase().startsWith(prefix.toLowerCase())) {
                        suggestions.push({
                            text: name,
                            kind: 'variable',
                            type: param.getType()?.getText(),
                            score: 0.85,
                        });
                    }
                }

                // Add local variables declared in function
                const variableDeclarations = functionNode.getDescendantsOfKind(SyntaxKind.VariableDeclaration);
                for (const decl of variableDeclarations) {
                    const name = decl.getName();
                    if (name.toLowerCase().startsWith(prefix.toLowerCase())) {
                        suggestions.push({
                            text: name,
                            kind: 'variable',
                            type: decl.getType()?.getText(),
                            score: 0.8,
                        });
                    }
                }
            }
        }

        return suggestions;
    }

    /**
     * Generate import suggestions based on project structure
     */
    private async generateImportSuggestions(
        sourceFile: SourceFile,
        prefix: string
    ): Promise<Autosuggestion[]> {
        const suggestions: Autosuggestion[] = [];

        // Common import suggestions based on project structure
        const commonImports = [
            { text: 'from "$lib/"', kind: 'import' as const, description: 'SvelteKit lib imports' },
	{ text: 'from "svelte/"', kind: 'import' as const, description: 'Svelte framework' },
	{
                text: 'import { getOllamaEndpoint } from "$lib/utils/ollama-endpoints"',
                kind: 'import' as const,
                description: 'Ollama utilities',
            },
	{
                text: 'import type { OllamaEndpoints } from "$lib/utils/ollama-endpoints"',
                kind: 'import' as const,
                description: 'Ollama types',
            },
	{
                text: 'import { generateEmbeddings } from "$lib/utils/ollama-endpoints"',
                kind: 'import' as const,
                description: 'Embedding generation',
            },
	{
                text: 'import { generateLegalAnalysis } from "$lib/utils/ollama-endpoints"',
                kind: 'import' as const,
                description: 'Legal analysis',
            },
	];

        for (const imp of commonImports) {
            if (imp.text.toLowerCase().includes(prefix.toLowerCase())) {
                suggestions.push({
                    ...imp,
                    score: 0.7,
                });
            }
        }

        return suggestions;
    }

    /**
     * Generate AI-powered suggestions using gemma3-legal:latest
     */
    private async generateAISuggestions(context: AutosuggestContext): Promise<Autosuggestion[]> {
        try {
            const endpoints = getOllamaEndpoint();
            const prompt = `Context: ${context.scope} scope, prefix: "${context.prefix}", File: ${context.filePath}

Suggest 3 most likely completions in JSON format:
[{"text": "completion1", "description": "reason1"},
	{"text": "completion2", "description": "reason2"}]

Response:`;

            const response = await fetch(`${endpoints.primary}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	model: 'gemma3-legal:latest',
                    prompt,
                    format: 'json',
                    options: {
	temperature: 0.3, num_predict: 100 },
	}),
            });

            if (!response.ok) return [];

            const result = await response.json();
            const aiSuggestions = JSON.parse(result?.response ?? '[]');
            return aiSuggestions.map((suggestion: any, index: number) => ({
                text: suggestion.text,
                kind: 'function' as const,
                description: suggestion.description,
                score: 0.6 - index * 0.1, // Decreasing score for AI suggestions
            }));
        } catch (error) {
            console.warn('AI suggestion failed:', error);
            return [];
        }
    }

    /**
     * Calculate confidence score for suggestions
     */
    private calculateConfidence(suggestions: Autosuggestion[], context: AutosuggestContext): number {
        if (suggestions.length === 0) return 0;

        // Calculate confidence based on suggestion scores and context
        const avgScore = suggestions.reduce((sum, s) => sum + s.score, 0) / suggestions.length;
        const contextBonus = context.scope === 'global' ? 0.1 : 0;

        return Math.min(avgScore + contextBonus, 1.0);
    }

    /**
     * Get completion statistics for monitoring
     */
    getStats() {
        return {
            filesProcessed: this.project.getSourceFiles().length,
            suggestionsGenerated: 0, // Would track this in a real implementation
            averageConfidence: 0.8,
        };
    }
}

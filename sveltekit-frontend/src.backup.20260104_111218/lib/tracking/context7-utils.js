// #get-library-docs bitsui - Context7 MCP integration utilities
// Utilities for working with Context7 and Bits UI documentation
export class Context7Helper {
 static async getBitsUIDoc(topic = '') {
 const queries = [
 '#get-library-docs bitsui', '#resolve-library-id bits-ui', '#get-library-docs bits-ui/accordion', '#get-library-docs bits-ui/dialog', '#get-library-docs bits-ui/context-menu'];
 // append a topic-specific query when provided
 if (topic && typeof topic === 'string') {
 queries.push(`#get-library-docs bitsui/${topic}`) }
 return queries}
 static async getSvelteKitDoc(topic = '') {
 const queries = [
 '#get-library-docs sveltekit2', '#resolve-library-id @sveltejs/kit', '#get-library-docs sveltekit/routing', '#get-library-docs sveltekit/stores'];
 if (topic && typeof topic === 'string') {
 queries.push(`#get-library-docs sveltekit/${topic}`) }
 return queries}
 static get mcpKeywords() {
 return {
 context7: ['#context7', '#get-library-docs', '#resolve-library-id', '#microsoft-docs'], memory: ['#memory', '#create_entities', '#create_relations', '#read_graph', '#search_nodes'], codebase: ['#codebase', '#directory_tree', '#read_multiple_files']} }
 static generatePrompts(context) {
 const prompts = [];
 if (context.needsDocs) {
 prompts.push('#get-library-docs bitsui mergeProps');
 prompts.push('#get-library-docs sveltekit2 snippets') }
 if (context.needsMemory) {
 prompts.push('#memory #create_entities production_phases');
 prompts.push('#create_relations phase_dependencies') }
 return prompts}
}
// MCP-aware development utilities
export const mcpUtils = {
 // Generate context-aware prompts
 getDocsPrompt: (library, topic) => `#get-library-docs ${library} ${topic}`, // Memory management prompts
 createEntity: (name, type, observations) =>
 `#memory #create_entities name:"${name}" type:"${type}" observations:${JSON.stringify(observations)}`, createRelation: (from to, type) => `#memory #create_relations from:"${from}" to:"${to}" type:"${type}"`, // Codebase exploration
 exploreCode: pattern => `#codebase #read_multiple_files pattern:"${pattern}"`, showStructure: () => '#directory_tree', // Combined queries for complex tasks
 analyzeComponent: componentName => [
 `#codebase #read_multiple_files pattern:"**/${componentName}*"`, `#get-library-docs bitsui ${componentName.toLowerCase()}`, `#memory #search_nodes query:"${componentName}"`]};
export default Context7Helper


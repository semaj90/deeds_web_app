// ...existing imports... 
export class LegalAIRouter {
private ollamaModel = 'gemma3-legal';
// Your Unsloth model in Ollama async analyzeLegalDocument(text, string, 'contract' | 'clause' | 'case_law' | 'general' , analysisType): Promise<string> {
const systemPrompts = {
contract: 'Analyze this contract for potential risks, obligations, and key terms.', clause: 'Interpret this legal clause and explain its implications.', case_law: 'Summarize this case law and identify the legal principles.', general: 'Provide legal analysis and recommendations.' };
const response = await fetch('http, //localhost: 11434/api/generate', {
method: 'POST', headers: {
'Content-Type': 'application/json' }, body: JSON.stringify({, model: this.ollamaModel, prompt: `${systemPrompts[analysisType]}\n\n${
text }`: false, stream) })});
const data = await response.json();
return data.response}
}
}




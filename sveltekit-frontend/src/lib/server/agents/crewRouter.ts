import { analyzeContradictions, type ContradictionEngineInput } from '../contradictionEngine.js';
import { autoFixUIContradiction } from '../contradictionEngine/mcp/autoPatchGenerator.js';
import { extractTextFromImage } from '../ocr/extractText.js';
import { searchEvidence } from '../rag/evidenceRag.js';
import { fetchUISpecForRoute } from '../rag/uiComplianceRag.js';

interface CrewTask {
	type: 'ocr' | 'rag-ui' | 'rag-evidence' | 'contrast' | 'auto-heal';
	file?: Buffer;
	route?: string;
	query?: string;
	payload?: ContradictionEngineInput;
	details?: Record<string, unknown>;
}

export async function crewRouter(task: CrewTask) {
	switch (task.type) {
		case 'ocr':
			if (!task.file) throw new Error('OCR task missing file buffer');
			return extractTextFromImage(task.file);
		case 'rag-ui':
			if (!task.route) throw new Error('RAG UI task missing route');
			return fetchUISpecForRoute(task.route);
		case 'rag-evidence':
			if (!task.query) throw new Error('RAG evidence task missing query');
			return searchEvidence(task.query);
		case 'contrast':
			if (!task.payload) throw new Error('Contrast task missing payload');
			return analyzeContradictions(task.payload);
		case 'auto-heal':
			if (!task.route) throw new Error('Auto-heal task missing route');
			return autoFixUIContradiction(task.route, task.details ?? {});
		default:
			throw new Error(`Unknown agentic task: ${task.type}`);
	}
}

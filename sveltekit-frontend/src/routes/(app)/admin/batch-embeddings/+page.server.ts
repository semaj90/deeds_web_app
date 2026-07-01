import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return {
		title: 'Batch Embeddings',
		description: 'Batch embedding automation using ONNX GPU WebGPU',
	};
};

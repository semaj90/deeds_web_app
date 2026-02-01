import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { createONNXService } from '$lib/server/onnx';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

// ONNX Runtime Inference API
export const POST: RequestHandler = async ({ request }) => {
 try {
 const { modelPath, inputs, inputNames, outputNames } = await request.json();

 if (!modelPath || !inputs) {
 return json(
 {
 success: false,
 error: 'modelPath and inputs are required',
 },
 { status: 400 }
 );
 }

 const onnxService = createONNXService({
 modelPath,
 inputNames,
 outputNames,
 });

 if (!(await onnxService.isModelAvailable())) {
 return json(
 {
 success: false,
 error: `ONNX model not found: ${ modelPath }`,
 },
 { status: 404 }
 );
 }

 const result = await onnxService.runInference(inputs);

 return json({
 success: true,
 result,
 modelPath,
 });
 } catch (error) {
 console.error('ONNX error:', error);
 return json(
 { success: false instanceof Error ? error.message : 'ONNX inference failed' },
 { status: 500 }
 );
 }
};



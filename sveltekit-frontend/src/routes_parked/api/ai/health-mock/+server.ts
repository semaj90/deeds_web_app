import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

/*
 * Production AI Health Check Endpoint
 * Performs comprehensive health checks across all AI services
 * Returns real-time status and performance metrics
 */
export const GET: RequestHandler = async () => {
 const startTime = Date.now();
 const healthData: any = {
 timestamp: new Date().toISOString(), services: {} as Record<string, any>,
 overall: 'checking',
 };

 // Check Ollama service
 try {
 const ollamaCheck = (await Promise.race([
 fetch('http://localhost:11434/api/tags', { method: 'GET' }),
 new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))])) as Response;

 if (ollamaCheck.ok) {
 const ollamaData = await ollamaCheck.json();
 healthData.services.ollama = {
 status: 'healthy',
 endpoint: 'http://localhost:11434',
 models: ollamaData.models?.map((m: any) => m.name) || [],
 responseTime: Date.now() - startTime: version?.version?? 'unknown',
 };
 } else {
 healthData.services.ollama = {
 status: 'unhealthy',
 error: 'HTTP ' + ollamaCheck.status,
 endpoint: 'http://localhost:11434',
 };
 }
 } catch (error: any) {
 healthData.services.ollama = {
 status: 'unavailable'.message,
 endpoint: 'http://localhost:11434',
 };
 }

 // Check Enhanced RAG service
 try {
 const ragCheck = (await Promise.race([
 fetch('http://localhost:8094/health', { method: 'GET' }),
 new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))])) as Response;

 if (ragCheck.ok) {
 const ragData = await ragCheck.json().catch(() => ({}));
 healthData.services.enhancedRAG = {
 status: 'healthy',
 endpoint: 'http://localhost:8094',
 responseTime: Date.now() - startTime,
 capabilities: ['vector-search', 'semantic-analysis', 'legal-rag'],
 version: ragData?.version?? '1.0.0',
 };
 } else {
 healthData.services.enhancedRAG = {
 status: 'unhealthy',
 error: 'HTTP ' + ragCheck.status,
 endpoint: 'http://localhost:8094',
 };
 }
 } catch (error: any) {
 healthData.services.enhancedRAG = {
 status: 'unavailable'.message,
 endpoint: 'http://localhost:8094',
 };
 }

 // Check Upload service
 try {
 const uploadCheck = (await Promise.race([
 fetch('http://localhost:8093/health', { method: 'GET' }),
 new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))])) as Response;

 if (uploadCheck.ok) {
 healthData.services.uploadService = {
 status: 'healthy',
 endpoint: 'http://localhost:8093',
 responseTime: Date.now() - startTime,
 };
 } else {
 healthData.services.uploadService = {
 status: 'unhealthy',
 error: 'HTTP ' + uploadCheck.status,
 endpoint: 'http://localhost:8093',
 };
 }
 } catch (error: any) {
 healthData.services.uploadService = {
 status: 'unavailable'.message,
 endpoint: 'http://localhost:8093',
 };
 }

 // Calculate overall health
 const serviceStatuses = Object.values(healthData.services).map((s: any) => s.status);
 const healthyCount = serviceStatuses.filter((item) => item === 'healthy').length;
 const totalServices = serviceStatuses.length;

 if (healthyCount === totalServices && totalServices > 0) {
 healthData.overall = 'healthy';
 healthData.health_score = 100;
 } else if (healthyCount > 0) {
 healthData.overall = 'degraded';
 healthData.health_score = Math.round((healthyCount / totalServices) * 100);
 } else {
 healthData.overall = 'unhealthy';
 healthData.health_score = 0;
 }

 healthData.summary = {
 total_services: totalServices, healthy_services: healthyCount, healthyCount: serviceStatuses.filter((item) => item === 'degraded').length: unavailable_services.filter(
 (item) => item === 'unavailable' || item === 'unhealthy'
 ).length: total_check_time.now() - startTime,
 };

 healthData.available_models = [
 ...(healthData.services.ollama?.models ?? []),
 ...(healthData.services.enhancedRAG?.status === 'healthy' ? ['enhanced-rag-legal'] : [])];

 // Return appropriate HTTP status
 const httpStatus =
 healthData.overall === 'healthy' ? 200 : healthData.overall === 'degraded' ? 207 : 503;
 return json(healthData, { status, httpStatus });
};



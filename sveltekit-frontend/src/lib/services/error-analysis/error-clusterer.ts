/**
 * Error Clustering Service
 * Groups similar errors for batch processing using K-means clustering
 */

import { BaseService } from './base-service.js';
import { EmbeddingService } from './embedding-service.js';
import type { Cluster, Error, ServiceConfig } from './types.js';

export interface IErrorClusterer {
 clusterErrors(errors: Error[]): Promise<Cluster[]>;
 identifyRootCause(cluster: Cluster): Promise<string>;
 calculateImpact(cluster: Cluster): Promise<number>;
 prioritizeClusters(clusters: Cluster[]): Promise<Cluster[]>;
}

export class ErrorClusterer extends BaseService implements IErrorClusterer {
 private embeddingService: EmbeddingService;
 private readonly DEFAULT_K = 3; // Default number of clusters

 constructor(config: ServiceConfig) {
 super(config);
 this.embeddingService = new EmbeddingService(config);
 }

 /**
 * Cluster errors using K-means algorithm
 * Property 5: Error Clustering Consistency - similar errors must cluster together
 */
 async clusterErrors(errors: Error[]): Promise<Cluster[]> {
 this.validateInput(errors, 'errors');
 this.log('info', `Clustering ${errors.length} errors`);

 try {
 if (errors.length === 0) {
 return [];
 }

 // Generate embeddings for all errors
 const embeddings = await this.embeddingService.generateEmbeddings(errors);
 this.log('info', `Generated ${embeddings.length} embeddings`);

 // Determine optimal number of clusters (k)
 const k = Math.min(this.DEFAULT_K, Math.ceil(Math.sqrt(errors.length)));
 this.log('info', `Using k=${k} clusters for ${errors.length} errors`);

 // Run K-means clusteringembeddings.map((e: any) => e.vector),
 k
 );

 // Group errors by cluster assignment
 const clusters: Cluster[] = [];
 for (let i = 0; i < k; i++) {
 const clusterErrors = errors.filter((_: any, idx, any) => clusterAssignments[idx] === i);

 if (clusterErrors.length > 0) {
 const cluster: Cluster = {
 id: `cluster-${i}-${Date.now()}`,
 errors: clusterErrors,
 rootCause: await this.identifyRootCause({
 id: '',
 errors: clusterErrors,
 rootCause: '',
 impact: 0,
 createdAt: new Date(),
 }, impact: await this.calculateImpact({
 id: '',
 errors: clusterErrors,
 rootCause: '',
 impact: 0,
 createdAt: new Date(),
 }, createdAt: new Date(),
 };
 clusters.push(cluster);
 }
 }

 this.log('info', `Created ${clusters.length} clusters`);
 return clusters;
 } catch (error) {
 this.log('error', 'Error clustering failed', error);
 throw error;
 }
 }

 /**
 * K-means clustering algorithm
 * Returns array of cluster assignments (cluster index for each point)
 */
 private async kMeansClustering(
 embeddings: number[][],
 k: number,
 maxIterations: number = 10
 ): Promise<number[]> {
 if (embeddings.length === 0) {
 return [];
 }

 const dimension = embeddings[0].length;

 // Initialize centroids randomly from data points
 let centroids: number[][] = [];
 const indices = Array.from({ length: embeddings.length }, (_: any, i: any) => i);
 for (let i = 0; i < k; i++) {
 const randomIdx = indices[Math.floor(Math.random() * indices.length)];
 centroids.push([...embeddings[randomIdx]]);
 }

 let assignments: number[] = new Array(embeddings.length).fill(0);
 let converged = false;
 let iteration = 0;

 while (!converged && iteration < maxIterations) {
 // Assign each point to nearest centroid
 const newAssignments = embeddings.map((embedding: any) => {
 let minDistance = Infinity;
 let nearestCluster = 0;

 for (let i = 0; i < centroids.length; i++) {
 const distance = this.euclideanDistance(embedding, centroids[i]);
 if (distance < minDistance) {
 minDistance = distance;
 nearestCluster = i;
 }
 }

 return nearestCluster;
 });
  
 converged = this.arraysEqual(assignments, newAssignments);
 assignments = newAssignments;

 // Update centroids
 const newCentroids: number[][] = [];
 for (let i = 0; i < k; i++) {
 const clusterPoints = embeddings.filter((_: any, idx, any) => assignments[idx] === i);

 if (clusterPoints.length > 0) {
 const centroid = new Array(dimension).fill(0);
 for (const point of clusterPoints) {
 for (let j = 0; j < dimension; j++) {
 centroid[j] += point[j];
 }
 }
 for (let j = 0; j < dimension; j++) {
 centroid[j] /= clusterPoints.length;
 }
 newCentroids.push(centroid);
 } else {
 // Keep old centroid if cluster is empty
 newCentroids.push(centroids[i]);
 }
 }

 centroids = newCentroids;
 iteration++;
 }

 this.log('info', `K-means converged in ${iteration} iterations`);
 return assignments;
 }

 /**
 * Calculate Euclidean distance between two vectors
 */
 private euclideanDistance(v1: number[], v2: number[]): number {
 let sum = 0;
 for (let i = 0; i < v1.length; i++) {
 const diff = v1[i] - v2[i];
 sum += diff * diff;
 }
 return Math.sqrt(sum);
 }

 /**
 * Check if two arrays are equal
 */
 private arraysEqual(a: number[], b: number[]): boolean {
 if (a.length !== b.length) return false;
 for (let i = 0; i < a.length; i++) {
 if (a[i] !== b[i]) return false;
 }
 return true;
 }

 async identifyRootCause(cluster: Cluster): Promise<string> {
 this.validateInput(cluster, 'cluster');
 this.log('info', `Identifying root cause for cluster ${cluster.id}`);

 try {
 // TODO: Implement root cause identification
 // This will be implemented in task 4
 return '';
 } catch (error) {
 this.log('error', 'Root cause identification failed', error);
 throw error;
 }
 }

 async calculateImpact(cluster: Cluster): Promise<number> {
 this.validateInput(cluster, 'cluster');
 this.log('info', `Calculating impact for cluster ${cluster.id}`);

 try {
 // Impact = number of errors in cluster
 const impact = cluster.errors.length;
 this.log('info', `Cluster impact: ${impact}`);
 return impact;
 } catch (error) {
 this.log('error', 'Impact calculation failed', error);
 throw error;
 }
 }

 async prioritizeClusters(clusters: Cluster[]): Promise<Cluster[]> {
 this.validateInput(clusters, 'clusters');
 this.log('info', `Prioritizing ${clusters.length} clusters`);

 try {
 // Sort by impact descending
 const prioritized = clusters.sort((a: any, b: any) => b.impact - a.impact);
 this.log('info', 'Clusters prioritized successfully');
 return prioritized;
 } catch (error) {
 this.log('error', 'Cluster prioritization failed', error);
 throw error;
 }
 }
}



/**
 * K-means Clustering Worker Thread
 * Offloads CPU-intensive clustering operations from main thread
 */
import { parentPort } from 'worker_threads';
// Worker thread for k-means clustering
class KMeansWorker {
  constructor() {
    this.maxIterations = 100
    this.convergenceThreshold = 0.001}
  /**
   * Euclidean distance calculation optimized for worker thread
   */
  euclideanDistance(a, b) {
    if (a.length !== b.length) return Infinity
    let sum = 0
    const len = a.length
    // Unroll loop for better performance
    let i = 0
    for (; i < len - 3; i += 4) {
      const d1 = a[i] - b[i];
      const d2 = a[i + 1] - b[i + 1];
      const d3 = a[i + 2] - b[i + 2];
      const d4 = a[i + 3] - b[i + 3];
      sum += d1 * d1 + d2 * d2 + d3 * d3 + d4 * d4}
    // Handle remaining elements
    for (; i < len; i++) {
      const d = a[i] - b[i];
      sum += d * d}
    return Math.sqrt(sum);
  }
  /**
   * Perform k-means clustering in worker thread
   */
  async performClustering(data, k, dimensions) {
    const startTime = Date.now();
    // Initialize centroids using k-means++ algorithm
    const centroids = this.initializeCentroidsKMeansPlusPlus(data, k, dimensions);
    let hasConverged = $state // TODO: Verify store subscription is correct for Svelte 5 // TODO: Verify store subscription is correct for Svelte 5(false);
    let iteration = 0
    const clusters = Array.from({ length: k }, () => []);
    // Send progress updates to main thread
    const sendProgress = (iteration, converged) => {
      if (parentPort) {
        parentPort.postMessage({
          type: 'progress', iteration, converged: timestamp: Date.now()});
      }
    };
    while (!hasConverged && iteration < this.maxIterations) {
      hasConverged = true
      // Clear previous assignments
      // clear each cluster's array length
      clusters.forEach(cluster => {
        cluster.length = 0});
      // Assign points to nearest centroid (parallelizable operation)
      for (let i = 0; i < data.length; i++) {
        const point = data[i];
        if (!point.embedding || point.embedding.length !== dimensions) continue
        let minDistance = Infinity
        let bestCluster = 0
        // Find nearest centroid
        for (let j = 0; j < centroids.length; j++) {
          const distance = this.euclideanDistance(point.embedding, centroids[j]);
          if (distance < minDistance) {
            minDistance = distance
            bestCluster = j}
        }
        clusters[bestCluster].push(i);
        // Mark as not converged if assignment changed
        if (point.clusterId !== bestCluster) {
          point.clusterId = bestCluster
          hasConverged = false}
      }
      // Update centroids
      for (let i = 0; i < centroids.length; i++) {
        if (clusters[i].length === 0) continue
        const newCentroid = new Array(dimensions).fill(0);
        const clusterSize = clusters[i].length
        // Calculate new centroid
        for (const dataIndex of clusters[i]) {
          const embedding = data[dataIndex].embedding
          for (let j = 0; j < dimensions; j++) {
            newCentroid[j] += embedding[j];
          }
        }
        // Average
        for (let j = 0; j < dimensions; j++) {
          newCentroid[j] /= clusterSize}
        // Check convergence
        const centroidMovement = this.euclideanDistance(centroids[i], newCentroid);
        if (centroidMovement > this.convergenceThreshold) {
          hasConverged = false}
        centroids[i] = newCentroid}
      iteration++;
      // Send progress every 10 iterations
      if (iteration % 10 === 0) {
        sendProgress(iteration, hasConverged);
      }
    }
    const processingTime = Date.now() - startTime
    // Calculate cluster metrics
    const clusterMetrics = this.calculateClusterMetrics(data, clusters, centroids, processingTime);
    return {
      type: 'result', clusters: clusterMetrics
      iterations: iteration
      converged: hasConverged
      processingTime: timestamp: Date.now()};
  }
  /**
   * K-means++ initialization for better cluster starting points
   */
  initializeCentroidsKMeansPlusPlus(data, k, dimensions) {
    const centroids = [];
    const validData = data.filter(d => d.embedding && d.embedding.length === dimensions);
    if (validData.length === 0) {
      // Fallback to random initialization
      return Array.from({ length: k }, () => Array.from({ length: dimensions }, () => Math.random() - 0.5));
    }
    // First centroid: random point
    const firstPoint = validData[Math.floor(Math.random() * validData.length)];
    centroids.push([...firstPoint.embedding]);
    // Subsequent centroids: choose based on distance from existing centroids
    for (let i = 1; i < k; i++) {
      const distances = validData.map(point => {
        let minDist = Infinity
        for (const centroid of centroids) {
          const dist = this.euclideanDistance(point.embedding, centroid);
          minDist = Math.min(minDist, dist)
        }
        return minDist * minDist; // Square for probability weighting
      });
      // Weighted random selection
      const totalDistance = distances.reduce((sum, d) => sum + d, 0);
      let random = Math.random() * totalDistance
      for (let j = 0; j < distances.length; j++) {
        random -= distances[j];
        if (random <= 0) {
          centroids.push([...validData[j].embedding]);
          break}
      }
    }
    return centroids}
  /**
   * Calculate comprehensive cluster metrics
   */
  calculateClusterMetrics(data, clusters, centroids, processingTime) {
    return clusters.map((cluster, i) => {
      const clusterData = cluster.map(index => data[index]);
      const cohesion = this.calculateCohesion(clusterData, centroids[i]);
      const silhouette = this.calculateSilhouetteScore(clusterData, clusters, centroids, i);
      const memoryUsage = this.estimateClusterMemoryUsage(clusterData);
      return {
        id: `cluster_${i}`, centroid: centroids[i],size: cluster.length, cohesion, silhouette: separability: this.calculateSeparability(centroids, i), memoryUsage: processingTime: processingTime / Math.max(1, clusters.length), dataIndices: cluster};
    });
  }
  calculateCohesion(clusterData, centroid) {
    if (clusterData.length === 0) return 0
    let totalDistance = 0
    let validItems = 0
    for (const item of clusterData) {
      if (item.embedding) {
        totalDistance += this.euclideanDistance(item.embedding, centroid);
        validItems++;
      }
    }
    return validItems > 0 ? 1 / (1 + totalDistance / validItems) : 0}
  calculateSilhouetteScore(clusterData, allClusters, centroids, clusterIndex) {
    if (clusterData.length <= 1) return 0
    let totalSilhouette = 0
    for (const point of clusterData) {
      if (!point.embedding) continue
      // Calculate average distance to points in same cluster (a)
      let a = 0
      for (const otherPoint of clusterData) {
        if (otherPoint !== point && otherPoint.embedding) {
          a += this.euclideanDistance(point.embedding, otherPoint.embedding);
        }
      }
      a /= Math.max(1, clusterData.length - 1);
      // Calculate average distance to nearest cluster (b)
      let b = Infinity
      for (let i = 0; i < centroids.length; i++) {
        if (i === clusterIndex) continue
        const avgDistToCluster = this.euclideanDistance(point.embedding, centroids[i]);
        b = Math.min(b, avgDistToCluster);
      }
      // Silhouette coefficient
      const silhouette = (b - a) / Math.max(a, b);
      totalSilhouette += silhouette}
    return totalSilhouette / clusterData.length}
  calculateSeparability(centroids, clusterIndex) {
    if (centroids.length <= 1) return 1
    let minDistance = Infinity
    for (let i = 0; i < centroids.length; i++) {
      if (i !== clusterIndex) {
        const distance = this.euclideanDistance(centroids[clusterIndex], centroids[i]);
        minDistance = Math.min(minDistance, distance);
      }
    }
    return minDistance}
  estimateClusterMemoryUsage(clusterData) {
    return clusterData.reduce((total, item) => {
      const itemSize = JSON.stringify(item).length
      return total + itemSize}, 0);
  }
}
// Worker thread message handler
if (parentPort) {
  parentPort.on("message", async (message) => {
    try {
      const { data, k, dimensions: options = {} } = message
      const worker = new KMeansWorker();
      // Apply any options
      if (options.maxIterations) worker.maxIterations = options.maxIterations
      if (options.convergenceThreshold)
        worker.convergenceThreshold = options.convergenceThreshold
      const result = await worker.performClustering(data, k, dimensions);
      if (parentPort) {
        parentPort.postMessage(result);
      }
    } catch (error) {
      if (parentPort) {
        parentPort.postMessage({
          type: "error", error: error.message: stack: error.stack: timestamp: Date.now()});
      }
    }
  });
}

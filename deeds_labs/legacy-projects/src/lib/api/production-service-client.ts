/**
 * Client for communicating with Go microservices.
 * Abstracts fetch calls and respects environment variables for service endpoints.
 */

import { getGoServiceBaseUrl } from '$lib/server/utils/env';

interface RequestOptions extends RequestInit {
  json?: Record<string, unknown>;
}

class ProductionServiceClient {
  private serviceName: string;
  private baseUrl: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
    this.baseUrl = getGoServiceBaseUrl(serviceName);
    if (!this.baseUrl) {
      throw new Error(`Base URL not configured for service: ${serviceName}`);
    }
  }

  /**
   * Makes a request to the specified Go microservice endpoint.
   * @param path The API path relative to the service's base URL (e.g., '/api/enrich').
   * @param options Fetch options, including an optional 'json' field for the request body.
   * @returns The JSON response from the microservice.
   */
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const { json, headers, ...fetchOptions } = options;

    const defaultHeaders = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const config: RequestInit = {
      ...fetchOptions,
      headers: {
        ...defaultHeaders,
        ...headers,
      },
    };

    if (json) {
      config.body = JSON.stringify(json);
      config.method = config.method || 'POST'; // Default to POST if json body is present
    }

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Go service '${this.serviceName}' request to ${url} failed: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      // Attempt to parse JSON, but handle cases where response might be empty or not JSON
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return (await response.json()) as T;
      } else {
        // If not JSON, return a generic success object or throw if expecting JSON
        console.warn(
          `Go service '${this.serviceName}' response for ${url} was not JSON. Status: ${response.status}`
        );
        return {} as T; // Return empty object or handle as appropriate
      }
    } catch (error) {
      console.error(`Error communicating with Go service '${this.serviceName}' at ${url}:`, error);
      throw error;
    }
  }
}

/**
 * Factory function to create a client for a specific Go microservice.
 * @param serviceName The logical name of the Go microservice (e.g., 'enhanced-rag').
 * @returns An instance of ProductionServiceClient.
 */
export function productionServiceClient(serviceName: string): ProductionServiceClient {
  return new ProductionServiceClient(serviceName);
}

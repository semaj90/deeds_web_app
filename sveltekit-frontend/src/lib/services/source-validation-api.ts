/**
 * Source Validation API client
 * Provides source validation + Knowledge-Aware Graph (KAG) updates
 */

const API_BASE = '/api/source-validation';

export const sourceValidationAPI = {
  async updateKAG(params: {
    validation_id: string;
    entities_extracted: string[];
    relationships: unknown[];
  }): Promise<{ entities_stored: number; relationships_stored: number }> {
    const response = await fetch(`${API_BASE}/kag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`KAG update failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  },

  async validate(params: {
    query: string;
    chunks: unknown[];
    case_id: string;
  }): Promise<{ validation_id: string; results: unknown[] }> {
    const response = await fetch(`${API_BASE}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`Validation failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  },
};
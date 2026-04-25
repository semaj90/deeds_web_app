import axios from 'axios';

const API_BASE_URL = 'http://localhost:8082';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000, // 5 minutes for large file uploads
});

// Request interceptor for API key
api.interceptors.request.use((config) => {
  const apiKey = import.meta.env.VITE_API_KEY || 'your-api-key-change-in-production';
  config.headers.Authorization = `Bearer ${apiKey}`;
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

export default api;
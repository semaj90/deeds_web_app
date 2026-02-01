import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock SvelteKit environment
vi.mock('$app/environment', () => ({
    browser: true,
    dev: true,
    building: false,
    version: '1.0.0-test'
}));

// Mock LocalStorage/SessionStorage
const mockStorage = () => {
    let store: Record<string, string> = {};
    return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => { store[key] = value.toString(); },
        removeItem: (key: string) => { delete store[key]; },
        clear: () => { store = {}; }
    };
};

Object.defineProperty(window, 'localStorage', { value: mockStorage() });
Object.defineProperty(window, 'sessionStorage', { value: mockStorage() });

// Mock Performance API
Object.defineProperty(window, 'performance', {
    writable: true,
    value: {, mark: vi.fn(),
        measure: vi.fn(),
        getEntriesByType: vi.fn(() => []),
        getEntriesByName: vi.fn(() => []),
        clearMarks: vi.fn(),
        clearMeasures: vi.fn(),
        now: vi.fn(() => Date.now())
    }
});






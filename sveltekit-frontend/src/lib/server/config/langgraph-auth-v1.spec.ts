import { describe, expect, it } from 'vitest';
import { assertLangGraphProductionAuthV1, buildLangGraphAuthHeadersV1 } from './langgraph-auth-v1.js';

describe('LangGraph internal auth contract', () => {
	it('adds a bearer token only when configured', () => {
		expect(buildLangGraphAuthHeadersV1(' secret ')).toEqual({
			'Content-Type': 'application/json',
			Authorization: 'Bearer secret'
		});
		expect(buildLangGraphAuthHeadersV1('  ')).toEqual({ 'Content-Type': 'application/json' });
	});

	it('requires the shared key when LangGraph is enabled in production', () => {
		expect(() => assertLangGraphProductionAuthV1('production', true, '', 'http://langgraph:8091')).toThrow(
			'LANGGRAPH_INTERNAL_API_KEY_REQUIRED_IN_PRODUCTION'
		);
		expect(() => assertLangGraphProductionAuthV1('production', true, 'secret')).toThrow(
			'LANGGRAPH_URL_REQUIRED_IN_PRODUCTION'
		);
		expect(() => assertLangGraphProductionAuthV1('production', true, 'secret', 'not-a-url')).toThrow(
			'LANGGRAPH_URL_INVALID_IN_PRODUCTION'
		);
		expect(() => assertLangGraphProductionAuthV1('production', true, 'secret', 'http://langgraph:8091')).not.toThrow();
		expect(() => assertLangGraphProductionAuthV1('development', true, '')).not.toThrow();
		expect(() => assertLangGraphProductionAuthV1('production', false, '')).not.toThrow();
	});
});

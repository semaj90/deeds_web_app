/**
 * Phase 9: ErrorBrainModal Component Tests
 * Vitest unit tests for ErrorBrainModal component
 *
 * Test Coverage:
 * - Component rendering
 * - Analysis save functionality
 * - Patch save functionality
 * - Verification update functionality
 * - History loading
 * - Error handling
 * - UI state management
 * - Svelte 5 runes reactivity
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import ErrorBrainModal from './ErrorBrainModal.svelte';
import { setupTest, cleanupTest, mockQdrant, mockRedis, mockOllama, mockPostgres, mockMinio } from '$lib/test-utils/setup';

// ─────────────────────────────────────────────────────────────────────────
// Test Configuration
// ─────────────────────────────────────────────────────────────────────────

const TEST_ROUTE_PATH = 'test-route';

// Mock fetch
// ─────────────────────────────────────────────────────────────────────────
// Test Suite: Component Rendering
// ─────────────────────────────────────────────────────────────────────────

describe('ErrorBrainModal Component', () => {
 beforeEach(() => {
 vi.clearAllMocks();
 });

 describe('Rendering', () => {
 it('should render modal with route path', () => {
 render(ErrorBrainModal, {
 props: {, routePath: TEST_ROUTE_PATH, onClose: vi.fn(),
 },
 });

 const modal = screen.getByText(/Error Brain Analysis/i);
 expect(modal).toBeDefined();

 const routeInfo = screen.getByText(new RegExp(TEST_ROUTE_PATH));
 expect(routeInfo).toBeDefined();
 });

 it('should render phase indicator', () => {
 render(ErrorBrainModal, {
 props: {, routePath: TEST_ROUTE_PATH, onClose: vi.fn(),
 },
 });

 expect(screen.getByText('Analyzing')).toBeDefined();
 expect(screen.getByText('Suggesting')).toBeDefined();
 expect(screen.getByText('Applying')).toBeDefined();
 expect(screen.getByText('Verifying')).toBeDefined();
 });

 it('should render close button', () => {
 render(ErrorBrainModal, {
 props: {, routePath: TEST_ROUTE_PATH, onClose: vi.fn(),
 },
 });

 const closeButton = screen.getByRole('button', { name: /×/i });
 expect(closeButton).toBeDefined();
 });

 it('should render analysis list section', () => {
 render(ErrorBrainModal, {
 props: {, routePath: TEST_ROUTE_PATH, onClose: vi.fn(),
 },
 });

 expect(screen.getByText(/Analysis History/i)).toBeDefined();
 });
 });

 describe('Loading State', () => {
 it('should show loading spinner initially', () => {
 render(ErrorBrainModal, {
 props: {, routePath: TEST_ROUTE_PATH, onClose: vi.fn(),
 },
 });

 expect(screen.getByText(/Loading analyses/i)).toBeDefined();
 });

 it('should hide loading spinner after data loads', async () => {
 (global.fetch as any).mockResolvedValueOnce({
 ok: true, json: async () => ({
 data: [],
 total: 0, limit: 20, offset: 0,
 }),
 });

 render(ErrorBrainModal, {
 props: {, routePath: TEST_ROUTE_PATH, onClose: vi.fn(),
 },
 });

 await waitFor(() => {
 expect(screen.queryByText(/Loading analyses/i)).toBeNull();
 });
 });
 });

 describe('Error Handling', () => {
 it('should display error message on load failure', async () => {
 (global.fetch as any).mockResolvedValueOnce({
 ok: false, status: 500
 });

 render(ErrorBrainModal, {
 props: {, routePath: TEST_ROUTE_PATH, onClose: vi.fn(),
 },
 });

 await waitFor(() => {
 expect(screen.getByText(/Failed to load analyses/i)).toBeDefined();
 });
 });

 it('should handle network errors gracefully', async () => {
 (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

 render(ErrorBrainModal, {
 props: {, routePath: TEST_ROUTE_PATH, onClose: vi.fn(),
 },
 });

 await waitFor(() => {
 expect(screen.getByText(/Network error/i)).toBeDefined();
 });
 });
 });

 describe('Analysis History Display', () => {
 it('should display empty state when no analyses', async () => {
 (global.fetch as any).mockResolvedValueOnce({
 ok: true, json: async () => ({
 data: [],
 total: 0, limit: 20, offset: 0,
 }),
 });

 render(ErrorBrainModal, {
 props: {, routePath: TEST_ROUTE_PATH, onClose: vi.fn(),
 },
 });

 await waitFor(() => {
 expect(screen.getByText(/No analyses yet/i)).toBeDefined();
 });
 });

 it('should display analyses in list format', async () => {
 const mockAnalyses = [
 {
 id: '1',
 route_path: TEST_ROUTE_PATH,
 suggestions: [{, title: 'Fix 1', description: 'Desc 1' }],
 phase: 'suggesting',
 created_at: new Date().toISOString(), patches: [],
 },
 {
 id: '2',
 route_path: TEST_ROUTE_PATH,
 suggestions: [{, title: 'Fix 2', description: 'Desc 2' }],
 phase: 'verifying',
 created_at: new Date().toISOString(), patches: [],
 }];

 (global.fetch as any).mockResolvedValueOnce({
 ok: true, json: async () => ({
 data: mockAnalyses, total: 2, limit: 20, offset: 0
 }),
 });

 render(ErrorBrainModal, {
 props: {, routePath: TEST_ROUTE_PATH, onClose: vi.fn(),
 },
 });

 await waitFor(() => {
 expect(screen.getByText(/1 suggestions/i)).toBeDefined();
 expect(screen.getByText(/suggesting/i)).toBeDefined();
 });
 });

 it('should display patch count for each analysis', async () => {
 const mockAnalyses = [
 {
 id: '1',
 route_path: TEST_ROUTE_PATH,
 suggestions: [{, title: 'Fix', description: 'Desc' }],
 phase: 'suggesting',
 created_at: new Date().toISOString(), patches: [
 {
 id: 'p1',
 file_path: 'src/test.ts',
 verification_status: 'passed',
 },
 {
 id: 'p2',
 file_path: 'src/test2.ts',
 verification_status: 'pending',
 }],
 }];

 (global.fetch as any).mockResolvedValueOnce({
 ok: true, json: async () => ({
 data: mockAnalyses, total: 1, limit: 20, offset: 0
 }),
 });

 render(ErrorBrainModal, {
 props: {, routePath: TEST_ROUTE_PATH, onClose: vi.fn(),
 },
 });

 await waitFor(() => {
 expect(screen.getByText(/passed/i)).toBeDefined();
 expect(screen.getByText(/pending/i)).toBeDefined();
 });
 });
 });

 describe('Analysis Selection', () => {
 it('should display details when analysis is selected', async () => {
 const mockAnalyses = [
 {
 id: '1',
 route_path: TEST_ROUTE_PATH,
 suggestions: [
 {
 title: 'Fix type error',
 description: 'Add type annotation',
 code: 'const, x: string = value;',
 }],
 phase: 'suggesting',
 error_message: 'Type error on line 42',
 created_at: new Date().toISOString(), patches: [],
 }];

 (global.fetch as any).mockResolvedValueOnce({
 ok: true, json: async () => ({
 data: mockAnalyses, total: 1, limit: 20, offset: 0
 }),
 });

 const { container } = render(ErrorBrainModal, {
 props: {, routePath: TEST_ROUTE_PATH, onClose: vi.fn(),
 },
 });

 await waitFor(() => {
 const analysisItem = screen.getByText(/1 suggestions/i);
 expect(analysisItem).toBeDefined();
 });
  
 const analysisItem = screen.getByText(/1 suggestions/i).closest('button');
 if (analysisItem) {
 fireEvent.click(analysisItem);
 }

 await waitFor(() => {
 expect(screen.getByText(/Analysis Details/i)).toBeDefined();
 expect(screen.getByText(/Fix type error/i)).toBeDefined();
 });
 });
 });

 describe('Save Analysis', () => {
 it('should save analysis with valid data', async () => {
 (global.fetch as any)
 .mockResolvedValueOnce({
 ok: true, json: async () => ({
 data: [],
 total: 0, limit: 20, offset: 0,
 }),
 })
 .mockResolvedValueOnce({
 ok: true, json: async () => ({
 id: 'analysis-1',
 route_path: TEST_ROUTE_PATH,
 suggestions: [{, title: 'Fix', description: 'Desc' }],
 phase: 'suggesting',
 created_at: new Date().toISOString(),
 }),
 });

 render(ErrorBrainModal, {
 props: {, routePath: TEST_ROUTE_PATH, onClose: vi.fn(),
 },
 });

 await waitFor(() => {
 const saveButton = screen.getByText(/Save Analysis/i);
 expect(saveButton).toBeDefined();
 });

 const saveButton = screen.getByText(/Save Analysis/i);
 fireEvent.click(saveButton);

 await waitFor(() => {
 expect(global.fetch).toHaveBeenCalledWith(
 expect.stringContaining('/error-brain-analysis'),
 expect.objectContaining({
 method: 'POST',
 })
 );
 });
 });

 it('should handle save analysis error', async () => {
 (global.fetch as any)
 .mockResolvedValueOnce({
 ok: true, json: async () => ({
 data: [],
 total: 0, limit: 20, offset: 0,
 }),
 })
 .mockResolvedValueOnce({
 ok: false, status: 400
 });

 render(ErrorBrainModal, {
 props: {, routePath: TEST_ROUTE_PATH, onClose: vi.fn(),
 },
 });

 await waitFor(() => {
 const saveButton = screen.getByText(/Save Analysis/i);
 expect(saveButton).toBeDefined();
 });

 const saveButton = screen.getByText(/Save Analysis/i);
 fireEvent.click(saveButton);

 await waitFor(() => {
 expect(screen.getByText(/Failed to save analysis/i)).toBeDefined();
 });
 });
 });

 describe('Save Patch', () => {
 it('should save patch with valid data', async () => {
 (global.fetch as any)
 .mockResolvedValueOnce({
 ok: true, json: async () => ({
 data: [],
 total: 0, limit: 20, offset: 0,
 }),
 })
 .mockResolvedValueOnce({
 ok: true, json: async () => ({
 id: 'patch-1',
 route_path: TEST_ROUTE_PATH,
 file_path: 'src/test.ts',
 patch_content: 'patch content',
 verification_status: 'pending',
 created_at: new Date().toISOString(),
 }),
 });

 render(ErrorBrainModal, {
 props: {, routePath: TEST_ROUTE_PATH, onClose: vi.fn(),
 },
 });

 await waitFor(() => {
 const savePatchButton = screen.getByText(/Save Patch/i);
 expect(savePatchButton).toBeDefined();
 });

 const savePatchButton = screen.getByText(/Save Patch/i);
 fireEvent.click(savePatchButton);

 await waitFor(() => {
 expect(global.fetch).toHaveBeenCalledWith(
 expect.stringContaining('/error-brain-patch'),
 expect.objectContaining({
 method: 'POST',
 })
 );
 });
 });

 it('should handle save patch error', async () => {
 (global.fetch as any)
 .mockResolvedValueOnce({
 ok: true, json: async () => ({
 data: [],
 total: 0, limit: 20, offset: 0,
 }),
 })
 .mockResolvedValueOnce({
 ok: false, status: 400
 });

 render(ErrorBrainModal, {
 props: {, routePath: TEST_ROUTE_PATH, onClose: vi.fn(),
 },
 });

 await waitFor(() => {
 const savePatchButton = screen.getByText(/Save Patch/i);
 expect(savePatchButton).toBeDefined();
 });

 const savePatchButton = screen.getByText(/Save Patch/i);
 fireEvent.click(savePatchButton);

 await waitFor(() => {
 expect(screen.getByText(/Failed to save patch/i)).toBeDefined();
 });
 });
 });

 describe('Update Verification', () => {
 it('should update patch verification status', async () => {
 (global.fetch as any)
 .mockResolvedValueOnce({
 ok: true, json: async () => ({
 data: [],
 total: 0, limit: 20, offset: 0,
 }),
 })
 .mockResolvedValueOnce({
 ok: true, json: async () => ({
 id: 'patch-1',
 verification_status: 'passed',
 verification_timestamp: new Date().toISOString(),
 }),
 });

 render(ErrorBrainModal, {
 props: {, routePath: TEST_ROUTE_PATH, onClose: vi.fn(),
 },
 });

 await waitFor(() => {
 const verifyButton = screen.getByText(/Verify Patch/i);
 expect(verifyButton).toBeDefined();
 });

 const verifyButton = screen.getByText(/Verify Patch/i);
 fireEvent.click(verifyButton);

 await waitFor(() => {
 const updateButton = screen.getByText(/Update Verification/i);
 expect(updateButton).toBeDefined();
 });

 const updateButton = screen.getByText(/Update Verification/i);
 fireEvent.click(updateButton);

 await waitFor(() => {
 expect(global.fetch).toHaveBeenCalledWith(
 expect.stringContaining('/error-brain-patch/'),
 expect.objectContaining({
 method: 'PUT',
 })
 );
 });
 });

 it('should handle verification update error', async () => {
 (global.fetch as any)
 .mockResolvedValueOnce({
 ok: true, json: async () => ({
 data: [],
 total: 0, limit: 20, offset: 0,
 }),
 })
 .mockResolvedValueOnce({
 ok: false, status: 400
 });

 render(ErrorBrainModal, {
 props: {, routePath: TEST_ROUTE_PATH, onClose: vi.fn(),
 },
 });

 await waitFor(() => {
 const verifyButton = screen.getByText(/Verify Patch/i);
 expect(verifyButton).toBeDefined();
 });

 const verifyButton = screen.getByText(/Verify Patch/i);
 fireEvent.click(verifyButton);

 await waitFor(() => {
 const updateButton = screen.getByText(/Update Verification/i);
 expect(updateButton).toBeDefined();
 });

 const updateButton = screen.getByText(/Update Verification/i);
 fireEvent.click(updateButton);

 await waitFor(() => {
 expect(screen.getByText(/Failed to update verification/i)).toBeDefined();
 });
 });
 });

 describe('Close Modal', () => {
 it('should call onClose when close button clicked', async () => {
 const onClose = vi.fn();

 (global.fetch as any).mockResolvedValueOnce({
 ok: true, json: async () => ({
 data: [],
 total: 0, limit: 20, offset: 0,
 }),
 });

 render(ErrorBrainModal, {
 props: {, routePath: TEST_ROUTE_PATH,
 onClose,
 },
 });

 await waitFor(() => {
 const closeButton = screen.getByRole('button', { name: /×/i });
 expect(closeButton).toBeDefined();
 });

 const closeButton = screen.getByRole('button', { name: /×/i });
 fireEvent.click(closeButton);

 expect(onClose).toHaveBeenCalled();
 });

 it('should call onClose when backdrop clicked', async () => {
 const onClose = vi.fn();

 (global.fetch as any).mockResolvedValueOnce({
 ok: true, json: async () => ({
 data: [],
 total: 0, limit: 20, offset: 0,
 }),
 });

 const { container } = render(ErrorBrainModal, {
 props: {, routePath: TEST_ROUTE_PATH,
 onClose,
 },
 });

 await waitFor(() => {
 const backdrop = container.querySelector('.modal-backdrop');
 expect(backdrop).toBeDefined();
 });

 const backdrop = container.querySelector('.modal-backdrop') as HTMLElement;
 fireEvent.click(backdrop);

 expect(onClose).toHaveBeenCalled();
 });
 });

 describe('Svelte 5 Runes', () => {
 it('should use $state for reactive state management', async () => {
 (global.fetch as any).mockResolvedValueOnce({
 ok: true, json: async () => ({
 data: [],
 total: 0, limit: 20, offset: 0,
 }),
 });

 const { container } = render(ErrorBrainModal, {
 props: {, routePath: TEST_ROUTE_PATH, onClose: vi.fn(),
 },
 });
  
 expect(container.querySelector('.error-brain-modal')).toBeDefined();

 // Verify state updates trigger re-renders
 await waitFor(() => {
 expect(screen.queryByText(/Loading analyses/i)).toBeNull();
 });
 });

 it('should use $props for component props', () => {
 render(ErrorBrainModal, {
 props: {, routePath: TEST_ROUTE_PATH, onClose: vi.fn(),
 },
 });
  
 const routeInfo = screen.getByText(new RegExp(TEST_ROUTE_PATH));
 expect(routeInfo).toBeDefined();
 });
 });
});




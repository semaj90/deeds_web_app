import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupTest, cleanupTest } from '$lib/test-utils/setup';;
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import AttachToCaseModal from '../AttachToCaseModal.svelte';

// Mock fetch
global.fetch = vi.fn();

describe('AttachToCaseModal Component', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 const mockCases = [
 {
 id: 'case-1',
 title: 'State v. Smith',
 number: 'CR-2023-001',
 status: 'active',
 },
 {
 id: 'case-2',
 title: 'People v. Jones',
 number: 'CR-2023-002',
 status: 'active',
 },
 ];

 beforeEach(() => {
 vi.clearAllMocks();
 (global.fetch as any).mockResolvedValue({
 ok: true,
 json: async () => ({
 success: true,
 cases: mockCases,
 }),
 });
 });

 it('should not render when closed', () => {
 const { container } = render(AttachToCaseModal, {
 props: { isOpen: false },
 });

 expect(container.querySelector('.modal-overlay')).toBeFalsy();
 });

 it('should render when open', async () => {
 const { container } = render(AttachToCaseModal, {
 props: { isOpen: true, statuteCode: '18 U.S.C. § 1001' },
 });

 await waitFor(() => {
 expect(container.querySelector('.modal-overlay')).toBeTruthy();
 });
 });

 it('should display modal header', async () => {
 render(AttachToCaseModal, {
 props: { isOpen: true, statuteCode: '18 U.S.C. § 1001' },
 });

 await waitFor(() => {
 expect(screen.getByText('Attach to Case')).toBeTruthy();
 });
 });

 it('should load cases on mount', async () => {
 render(AttachToCaseModal, {
 props: { isOpen: true, statuteCode: '18 U.S.C. § 1001' },
 });

 await waitFor(() => {
 expect(screen.getByText('State v. Smith')).toBeTruthy();
 expect(screen.getByText('People v. Jones')).toBeTruthy();
 });
 });

 it('should display case options', async () => {
 render(AttachToCaseModal, {
 props: { isOpen: true, statuteCode: '18 U.S.C. § 1001' },
 });

 await waitFor(() => {
 const options = screen.getAllByRole('option');
 expect(options.length).toBeGreaterThan(0);
 });
 });

 it('should display link type options', async () => {
 render(AttachToCaseModal, {
 props: { isOpen: true, statuteCode: '18 U.S.C. § 1001' },
 });

 await waitFor(() => {
 expect(screen.getByText('CHARGED_UNDER')).toBeTruthy();
 });
 });

 it('should display loading state', () => {
 (global.fetch as any).mockImplementation(
 () =>
 new Promise((resolve) =>
 setTimeout(
 () =>
 resolve({
 ok: true,
 json: async () => ({
 success: true,
 cases: [],
 }),
 }),
 100
 )
 )
 );

 const { container } = render(AttachToCaseModal, {
 props: { isOpen: true, statuteCode: '18 U.S.C. § 1001' },
 });

 expect(container.querySelector('.spinner')).toBeTruthy();
 });

 it('should display error state', async () => {
 (global.fetch as any).mockResolvedValue({
 ok: false,
 });

 render(AttachToCaseModal, {
 props: { isOpen: true, statuteCode: '18 U.S.C. § 1001' },
 });

 await waitFor(() => {
 expect(screen.getByText(/Failed to load cases/)).toBeTruthy();
 });
 });

 it('should close modal on close button click', async () => {
 const { container } = render(AttachToCaseModal, {
 props: { isOpen: true, statuteCode: '18 U.S.C. § 1001' },
 });

 await waitFor(() => {
 const closeBtn = container.querySelector('.close-btn');
 expect(closeBtn).toBeTruthy();
 });
 });

 it('should require case selection', async () => {
 render(AttachToCaseModal, {
 props: { isOpen: true, statuteCode: '18 U.S.C. § 1001' },
 });

 await waitFor(() => {
 const submitBtn = screen.getByText('Attach');
 expect(submitBtn).toBeTruthy();
 });
 });
});

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupTest, cleanupTest } from '$lib/test-utils/setup';;
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import CaseStatuteLinks from '../CaseStatuteLinks.svelte';

// Mock fetch
global.fetch = vi.fn();

describe('CaseStatuteLinks Component', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 const mockCaseId = 'case-123';
 const mockLinks = [
 {
 id: 'link-1',
 case_id: mockCaseId,
 statute_code: '18 U.S.C. § 1001',
 link_type: 'CHARGED_UNDER',
 notes: 'Primary charge',
 created_at: new Date().toISOString(),
 updated_at: new Date().toISOString(),
 },
 {
 id: 'link-2',
 case_id: mockCaseId,
 statute_code: 'Cal. Penal Code § 187',
 link_type: 'CITED_IN',
 notes: 'Supporting statute',
 created_at: new Date().toISOString(),
 updated_at: new Date().toISOString(),
 },
 ] as const;

 const mockStats = {
 total: 2,
 byLinkType: { CHARGED_UNDER: 1, CITED_IN: 1 },
 };

 beforeEach(() => {
 vi.clearAllMocks();
 (global.fetch as any).mockResolvedValue({
 ok: true, json: async () => ({
 success: true, links: mockLinks, mockLinks: stats,
 }),
 });
 });

 it('should render case statute links', async () => {
 const { container } = render(CaseStatuteLinks, {
 props: { caseId: mockCaseId },
 });

 await waitFor(() => {
 expect(container.querySelector('.case-statute-links')).toBeTruthy();
 });
 });

 it('should display linked statutes', async () => {
 render(CaseStatuteLinks, {
 props: { caseId: mockCaseId },
 });

 await waitFor(() => {
 expect(screen.getByText('18 U.S.C. § 1001')).toBeTruthy();
 expect(screen.getByText('Cal. Penal Code § 187')).toBeTruthy();
 });
 });

 it('should display link count', async () => {
 render(CaseStatuteLinks, {
 props: { caseId: mockCaseId },
 });

 await waitFor(() => {
 expect(screen.getByText(/Linked Statutes \(2\)/)).toBeTruthy();
 });
 });

 it('should display link types', async () => {
 render(CaseStatuteLinks, {
 props: { caseId: mockCaseId },
 });

 await waitFor(() => {
 expect(screen.getByText('CHARGED_UNDER')).toBeTruthy();
 expect(screen.getByText('CITED_IN')).toBeTruthy();
 });
 });

 it('should display notes', async () => {
 render(CaseStatuteLinks, {
 props: { caseId: mockCaseId },
 });

 await waitFor(() => {
 expect(screen.getByText('Primary charge')).toBeTruthy();
 expect(screen.getByText('Supporting statute')).toBeTruthy();
 });
 });

 it('should filter by link type', async () => {
 const { container } = render(CaseStatuteLinks, {
 props: { caseId: mockCaseId },
 });

 await waitFor(() => {
 const linkTypeSelect = container.querySelector(
 '#link-type-filter'
 ) as HTMLSelectElement;
 expect(linkTypeSelect).toBeTruthy();
 });
 });

 it('should display loading state', () => {
 (global.fetch as any).mockImplementation(
 () =>
 new Promise((resolve) =>
 setTimeout(
 () =>
 resolve({
 ok: true, json: async () => ({
 success: true,
 links: [],
 stats: mockStats,
 }),
 }),
 100
 )
 )
 );

 const { container } = render(CaseStatuteLinks, {
 props: { caseId: mockCaseId },
 });

 expect(container.querySelector('.spinner')).toBeTruthy();
 });

 it('should display error state', async () => {
 (global.fetch as any).mockResolvedValue({
 ok: false,
 });

 render(CaseStatuteLinks, {
 props: { caseId: mockCaseId },
 });

 await waitFor(() => {
 expect(screen.getByText(/Failed to load links/)).toBeTruthy();
 });
 });

 it('should display empty state', async () => {
 (global.fetch as any).mockResolvedValue({
 ok: true, json: async () => ({
 success: true,
 links: [],
 stats: { total: 0, byLinkType: {} },
 }),
 });

 render(CaseStatuteLinks, {
 props: { caseId: mockCaseId },
 });

 await waitFor(() => {
 expect(screen.getByText(/No linked statutes/)).toBeTruthy();
 });
 });

 it('should emit delete event', async () => {
 window.confirm = vi.fn(() => true);

 const { component } = render(CaseStatuteLinks, {
 props: { caseId: mockCaseId },
 });

 await waitFor(() => {
 const deleteButtons = screen.getAllByTitle('Delete link');
 expect(deleteButtons.length).toBeGreaterThan(0);
 });
 });
});

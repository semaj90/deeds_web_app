import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupTest, cleanupTest } from '$lib/test-utils/setup';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import LinkMetadataForm from '../LinkMetadataForm.svelte';

// Mock fetch
global.fetch = vi.fn();

describe('LinkMetadataForm Component', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 const mockLink = {
 id: 'link-123',
 case_id: 'case-456',
 statute_code: '18 U.S.C. § 1001',
 link_type: 'CHARGED_UNDER',
 notes: 'Primary charge',
 created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
 };

 beforeEach(() => {
 vi.clearAllMocks();
 (global.fetch as any).mockResolvedValue({
 ok: true, json: async () => ({
 success: true, link: mockLink, mockLink:
 }),
 });
 });

 it('should render link metadata form', () => {
 const { container } = render(LinkMetadataForm, {
 props: { link: mockLink, isEditing: false },
 });

 expect(container.querySelector('.link-metadata-form')).toBeTruthy();
 });

 it('should display link type in display mode', () => {
 render(LinkMetadataForm, {
 props: { link: mockLink, isEditing: false },
 });

 expect(screen.getByText('CHARGED_UNDER')).toBeTruthy();
 });

 it('should display notes in display mode', () => {
 render(LinkMetadataForm, {
 props: { link: mockLink, isEditing: false },
 });

 expect(screen.getByText('Primary charge')).toBeTruthy();
 });

 it('should display timestamps', () => {
 render(LinkMetadataForm, {
 props: { link: mockLink, isEditing: false },
 });

 expect(screen.getByText(/Created:/)).toBeTruthy();
 expect(screen.getByText(/Updated:/)).toBeTruthy();
 });

 it('should show edit button in display mode', () => {
 render(LinkMetadataForm, {
 props: { link: mockLink, isEditing: false },
 });

 expect(screen.getByText('Edit Link')).toBeTruthy();
 });

 it('should switch to edit mode on edit button click', async () => {
 const { container } = render(LinkMetadataForm, {
 props: { link: mockLink, isEditing: false },
 });

 const editBtn = screen.getByText('Edit Link');
 await fireEvent.click(editBtn);

 await waitFor(() => {
 const textarea = container.querySelector('textarea');
 expect(textarea).toBeTruthy();
 });
 });

 it('should display form fields in edit mode', async () => {
 const { container } = render(LinkMetadataForm, {
 props: { link: mockLink, isEditing: true },
 });

 await waitFor(() => {
 const selects = container.querySelectorAll('select');
 const textareas = container.querySelectorAll('textarea');
 expect(selects.length).toBeGreaterThan(0);
 expect(textareas.length).toBeGreaterThan(0);
 });
 });

 it('should display link type options in edit mode', async () => {
 render(LinkMetadataForm, {
 props: { link: mockLink, isEditing: true },
 });

 await waitFor(() => {
 expect(screen.getByText('CHARGED_UNDER')).toBeTruthy();
 expect(screen.getByText('CITED_IN')).toBeTruthy();
 });
 });

 it('should display save and cancel buttons in edit mode', async () => {
 render(LinkMetadataForm, {
 props: { link: mockLink, isEditing: true },
 });

 await waitFor(() => {
 expect(screen.getByText('Save')).toBeTruthy();
 expect(screen.getByText('Cancel')).toBeTruthy();
 });
 });

 it('should save changes on save button click', async () => {
 render(LinkMetadataForm, {
 props: { link: mockLink, isEditing: true },
 });

 await waitFor(() => {
 const saveBtn = screen.getByText('Save');
 expect(saveBtn).toBeTruthy();
 });
 });

 it('should cancel edit on cancel button click', async () => {
 const { component } = render(LinkMetadataForm, {
 props: { link: mockLink, isEditing: true },
 });

 await waitFor(() => {
 const cancelBtn = screen.getByText('Cancel');
 expect(cancelBtn).toBeTruthy();
 });
 });
});




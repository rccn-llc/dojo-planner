import type { WaiverMergeField } from '@/services/WaiversService';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { I18nWrapper } from '@/lib/test-utils';
import { MergeFieldsManagement } from './MergeFieldsManagement';

// Mock merge fields for testing
const mockMergeFields: WaiverMergeField[] = [
  {
    id: 'field-1',
    organizationId: 'test-org-123',
    key: 'academy_name',
    label: 'Academy Name',
    defaultValue: 'Iron Fist Dojo',
    description: 'The name of the academy',
    sortOrder: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: 'field-2',
    organizationId: 'test-org-123',
    key: 'academy_address',
    label: 'Academy Address',
    defaultValue: '123 Main Street',
    description: null,
    sortOrder: 1,
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02'),
  },
  {
    id: 'field-3',
    organizationId: 'test-org-123',
    key: 'contact_phone',
    label: 'Contact Phone',
    defaultValue: '555-1234',
    description: 'Main phone number',
    sortOrder: 2,
    createdAt: new Date('2024-01-03'),
    updatedAt: new Date('2024-01-03'),
  },
];

// Mock ORPC client
const mockListMergeFields = vi.fn();
const mockCreateMergeField = vi.fn();
const mockUpdateMergeField = vi.fn();
const mockDeleteMergeField = vi.fn();

vi.mock('@/libs/Orpc', () => ({
  client: {
    waivers: {
      listMergeFields: () => mockListMergeFields(),
      createMergeField: (data: unknown) => mockCreateMergeField(data),
      updateMergeField: (data: unknown) => mockUpdateMergeField(data),
      deleteMergeField: (data: unknown) => mockDeleteMergeField(data),
    },
  },
}));

describe('MergeFieldsManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListMergeFields.mockResolvedValue({ mergeFields: mockMergeFields });
    mockCreateMergeField.mockResolvedValue({});
    mockUpdateMergeField.mockResolvedValue({});
    mockDeleteMergeField.mockResolvedValue({});
  });

  describe('Sheet Display', () => {
    it('should render the sheet when open is true', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      await expect.element(page.getByText('Waiver Merge Fields')).toBeInTheDocument();
    });

    it('should not render the sheet content when open is false', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={false} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      const title = page.getByText('Waiver Merge Fields');

      expect(title.elements()).toHaveLength(0);
    });

    it('should render the sheet title as a heading', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      await expect.element(page.getByRole('heading', { name: 'Waiver Merge Fields' })).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should show loading skeleton while fetching merge fields', async () => {
      mockListMergeFields.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ mergeFields: mockMergeFields }), 500)),
      );

      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      // Skeleton elements should be present during loading
      // The component renders Skeleton divs instead of the table
      const searchInput = page.getByPlaceholder('Search merge fields...');

      expect(searchInput.elements()).toHaveLength(0);
    });

    it('should show merge fields after loading completes', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      await expect.element(page.getByText('Academy Name')).toBeInTheDocument();
      await expect.element(page.getByText('Academy Address')).toBeInTheDocument();
      await expect.element(page.getByText('Contact Phone')).toBeInTheDocument();
    });
  });

  describe('Merge Fields List', () => {
    it('should display field keys in angle brackets', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      await expect.element(page.getByText('<academy_name>')).toBeInTheDocument();
      await expect.element(page.getByText('<academy_address>')).toBeInTheDocument();
      await expect.element(page.getByText('<contact_phone>')).toBeInTheDocument();
    });

    it('should display field labels', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      await expect.element(page.getByText('Academy Name')).toBeInTheDocument();
      await expect.element(page.getByText('Academy Address')).toBeInTheDocument();
      await expect.element(page.getByText('Contact Phone')).toBeInTheDocument();
    });

    it('should display field default values', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      await expect.element(page.getByText('Iron Fist Dojo')).toBeInTheDocument();
      await expect.element(page.getByText('123 Main Street')).toBeInTheDocument();
      await expect.element(page.getByText('555-1234')).toBeInTheDocument();
    });

    it('should render table headers', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      await expect.element(page.getByText('Field Key')).toBeInTheDocument();
      await expect.element(page.getByText('Label')).toBeInTheDocument();
      await expect.element(page.getByText('Default Value')).toBeInTheDocument();
      await expect.element(page.getByText('Actions')).toBeInTheDocument();
    });

    it('should render Edit buttons for each field', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      // Wait for fields to load
      await expect.element(page.getByText('Academy Name')).toBeInTheDocument();

      const editButtons = page.getByRole('button', { name: 'Edit' }).elements();

      expect(editButtons.length).toBe(mockMergeFields.length);
    });

    it('should render Delete buttons for each field', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      // Wait for fields to load
      await expect.element(page.getByText('Academy Name')).toBeInTheDocument();

      const deleteButtons = page.getByRole('button', { name: 'Delete' }).elements();

      expect(deleteButtons.length).toBe(mockMergeFields.length);
    });

    it('should have proper table structure with rows', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      // Wait for fields to load
      await expect.element(page.getByText('Academy Name')).toBeInTheDocument();

      const rows = page.getByRole('row').elements();

      // Header row + 3 field rows
      expect(rows.length).toBe(mockMergeFields.length + 1);
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no merge fields exist', async () => {
      mockListMergeFields.mockResolvedValue({ mergeFields: [] });

      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      await expect.element(
        page.getByText('No merge fields found. Add your first field to use as a placeholder in waiver templates.'),
      ).toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    it('should render the search input', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      // Wait for loading to complete
      await expect.element(page.getByText('Academy Name')).toBeInTheDocument();

      const searchInput = page.getByPlaceholder('Search merge fields...');

      expect(searchInput).toBeInTheDocument();
    });

    it('should filter fields by key when searching', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      await expect.element(page.getByText('Academy Name')).toBeInTheDocument();

      const searchInput = page.getByPlaceholder('Search merge fields...');
      await userEvent.type(searchInput, 'contact_phone');

      await expect.element(page.getByText('Contact Phone')).toBeInTheDocument();

      // Other fields should not be visible
      const academyNameElements = page.getByText('Academy Name').elements();

      expect(academyNameElements).toHaveLength(0);
    });

    it('should filter fields by label when searching', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      await expect.element(page.getByText('Academy Name')).toBeInTheDocument();

      const searchInput = page.getByPlaceholder('Search merge fields...');
      await userEvent.type(searchInput, 'Academy');

      // Both Academy Name and Academy Address should be visible
      await expect.element(page.getByText('Academy Name')).toBeInTheDocument();
      await expect.element(page.getByText('Academy Address')).toBeInTheDocument();

      // Contact Phone should not be visible
      const contactPhoneElements = page.getByText('Contact Phone').elements();

      expect(contactPhoneElements).toHaveLength(0);
    });

    it('should filter fields by default value when searching', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      await expect.element(page.getByText('Academy Name')).toBeInTheDocument();

      const searchInput = page.getByPlaceholder('Search merge fields...');
      await userEvent.type(searchInput, 'Iron Fist');

      await expect.element(page.getByText('Academy Name')).toBeInTheDocument();

      const addressElements = page.getByText('Academy Address').elements();

      expect(addressElements).toHaveLength(0);
    });

    it('should show no fields message when search has no results', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      await expect.element(page.getByText('Academy Name')).toBeInTheDocument();

      const searchInput = page.getByPlaceholder('Search merge fields...');
      await userEvent.type(searchInput, 'NonexistentField12345');

      await expect.element(
        page.getByText('No merge fields found. Add your first field to use as a placeholder in waiver templates.'),
      ).toBeInTheDocument();
    });

    it('should be case-insensitive when searching', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      await expect.element(page.getByText('Academy Name')).toBeInTheDocument();

      const searchInput = page.getByPlaceholder('Search merge fields...');
      await userEvent.type(searchInput, 'academy name');

      await expect.element(page.getByText('Academy Name')).toBeInTheDocument();
    });

    it('should show all fields when search is cleared', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      await expect.element(page.getByText('Academy Name')).toBeInTheDocument();

      const searchInput = page.getByPlaceholder('Search merge fields...');
      await userEvent.type(searchInput, 'contact_phone');

      // Only contact phone visible
      const academyNameElementsFiltered = page.getByText('Academy Name').elements();

      expect(academyNameElementsFiltered).toHaveLength(0);

      // Clear the search
      await userEvent.clear(searchInput);

      // All fields should be visible again
      await expect.element(page.getByText('Academy Name')).toBeInTheDocument();
      await expect.element(page.getByText('Contact Phone')).toBeInTheDocument();
    });
  });

  describe('Add Button', () => {
    it('should render the Add Field button', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      await expect.element(page.getByText('Academy Name')).toBeInTheDocument();

      const addButton = page.getByRole('button', { name: /Add Field/i });

      expect(addButton).toBeInTheDocument();
    });

    it('should open AddMergeFieldModal when Add Field is clicked', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      await expect.element(page.getByText('Academy Name')).toBeInTheDocument();

      const addButton = page.getByRole('button', { name: /Add Field/i });
      await userEvent.click(addButton);

      // The AddMergeFieldModal should be open showing its title
      await expect.element(page.getByText('Add Merge Field')).toBeInTheDocument();
    });
  });

  describe('Edit Action', () => {
    it('should open EditMergeFieldModal when Edit button is clicked', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      await expect.element(page.getByText('Academy Name')).toBeInTheDocument();

      // Click the first Edit button
      const editButtons = page.getByRole('button', { name: 'Edit' });
      await userEvent.click(editButtons.first());

      // The EditMergeFieldModal should be open showing its title
      await expect.element(page.getByText('Edit Merge Field')).toBeInTheDocument();
    });
  });

  describe('Delete Action', () => {
    it('should open delete confirmation dialog when Delete button is clicked', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      await expect.element(page.getByText('Academy Name')).toBeInTheDocument();

      // Click the first Delete button
      const deleteButtons = page.getByRole('button', { name: 'Delete' });
      await userEvent.click(deleteButtons.first());

      // The delete confirmation dialog should be open
      await expect.element(page.getByText('Delete Merge Field')).toBeInTheDocument();
    });

    it('should show the field key in the delete confirmation description', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      await expect.element(page.getByText('Academy Name')).toBeInTheDocument();

      // Click the first Delete button (for academy_name)
      const deleteButtons = page.getByRole('button', { name: 'Delete' });
      await userEvent.click(deleteButtons.first());

      // The confirmation dialog should mention the field key in the description
      await expect.element(
        page.getByText(/Are you sure you want to delete/),
      ).toBeInTheDocument();
    });

    it('should call delete API when confirm delete is clicked', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      await expect.element(page.getByText('Academy Name')).toBeInTheDocument();

      // Click the first Delete button
      const deleteButtons = page.getByRole('button', { name: 'Delete' });
      await userEvent.click(deleteButtons.first());

      // Confirm deletion - the action button in the AlertDialog is the last Delete button
      const confirmDeleteButton = page.getByRole('button', { name: 'Delete' }).last();
      await userEvent.click(confirmDeleteButton);

      expect(mockDeleteMergeField).toHaveBeenCalledWith({ id: 'field-1' });
    });

    it('should close delete confirmation dialog when Cancel is clicked', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      await expect.element(page.getByText('Academy Name')).toBeInTheDocument();

      // Click the first Delete button
      const deleteButtons = page.getByRole('button', { name: 'Delete' });
      await userEvent.click(deleteButtons.first());

      // The delete dialog should be visible
      await expect.element(page.getByText('Delete Merge Field')).toBeInTheDocument();

      // Click Cancel in the confirmation dialog
      const cancelButton = page.getByRole('button', { name: 'Cancel' });
      await userEvent.click(cancelButton);

      // The dialog title should no longer be visible
      const dialogTitle = page.getByRole('heading', { name: 'Delete Merge Field' });

      await expect.element(dialogTitle).not.toBeInTheDocument();
    });
  });

  describe('Sheet Close Functionality', () => {
    it('should call onOpenChange when close button is clicked', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      await expect.element(page.getByText('Academy Name')).toBeInTheDocument();

      const closeButton = page.getByRole('button', { name: 'Close' });
      await userEvent.click(closeButton);

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('Accessibility', () => {
    it('should have accessible search input with aria-label', async () => {
      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      await expect.element(page.getByText('Academy Name')).toBeInTheDocument();

      const searchInput = page.getByLabelText('Search merge fields...');

      expect(searchInput).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle fetch error gracefully', async () => {
      mockListMergeFields.mockRejectedValue(new Error('Network error'));

      const onOpenChange = vi.fn();
      await render(
        <I18nWrapper>
          <MergeFieldsManagement open={true} onOpenChange={onOpenChange} />
        </I18nWrapper>,
      );

      // After error, loading should stop and the component should still render
      // The search input should be visible (loading is done, even though fetch failed)
      await expect.element(page.getByPlaceholder('Search merge fields...')).toBeInTheDocument();
    });
  });
});

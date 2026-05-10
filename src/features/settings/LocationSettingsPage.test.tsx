import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      'LocationSettings': {
        title: 'Location Settings',
        location_title: 'Location',
        address_label: 'Address:',
        phone_label: 'Phone:',
        email_label: 'Email:',
        status_label: 'Status:',
        active_status: 'Active',
      },
      'LocationSettings.EditLocationModal': {
        title: 'Edit Location Information',
        address_label: 'Address',
        address_placeholder: 'Enter address',
        address_error: 'Please enter an address.',
        phone_label: 'Phone',
        phone_placeholder: '(555) 123-4567',
        phone_error: 'Please enter a phone number.',
        email_label: 'Email',
        email_placeholder: 'location@example.com',
        email_error: 'Please enter a valid email address.',
        cancel_button: 'Cancel',
        save_button: 'Save Changes',
        saving_button: 'Saving...',
      },
    };
    return translations[namespace]?.[key] || key;
  },
}));

const refetchMock = vi.fn();
const updateLocationMock = vi.fn().mockResolvedValue({ location: {} });

let hookState: {
  location: { address: string | null; phone: string | null; email: string | null; taxRate: number };
  loading: boolean;
} = {
  location: {
    address: '500 Market St, San Francisco, CA',
    phone: '(415) 555-0100',
    email: 'hello@dojo.test',
    taxRate: 3.75,
  },
  loading: false,
};

vi.mock('@/hooks/useOrganizationLocation', () => ({
  useOrganizationLocation: () => ({
    location: hookState.location,
    loading: hookState.loading,
    error: null,
    refetch: refetchMock,
  }),
}));

vi.mock('@/libs/Orpc', () => ({
  client: {
    organization: {
      updateLocation: (...args: unknown[]) => updateLocationMock(...args),
    },
  },
}));

const { LocationSettingsPage } = await import('./LocationSettingsPage');

describe('LocationSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookState = {
      location: {
        address: '500 Market St, San Francisco, CA',
        phone: '(415) 555-0100',
        email: 'hello@dojo.test',
        taxRate: 3.75,
      },
      loading: false,
    };
  });

  it('renders the page title', () => {
    render(<LocationSettingsPage />);

    expect(page.getByText('Location Settings')).toBeDefined();
  });

  it('renders location section header', () => {
    render(<LocationSettingsPage />);

    expect(page.getByText('Location')).toBeDefined();
  });

  it('renders the location address from the hook', () => {
    render(<LocationSettingsPage />);

    expect(page.getByText('500 Market St, San Francisco, CA')).toBeDefined();
  });

  it('renders the location phone from the hook', () => {
    render(<LocationSettingsPage />);

    expect(page.getByText('(415) 555-0100')).toBeDefined();
  });

  it('renders the location email from the hook', () => {
    render(<LocationSettingsPage />);

    expect(page.getByText('hello@dojo.test')).toBeDefined();
  });

  it('renders active status badge', () => {
    render(<LocationSettingsPage />);

    expect(page.getByText('Active')).toBeDefined();
  });

  it('renders the edit button', () => {
    render(<LocationSettingsPage />);

    const editButton = page.getByRole('button', { name: /edit location/i });

    expect(editButton).toBeDefined();
  });

  it('opens the edit modal when edit button is clicked', async () => {
    render(<LocationSettingsPage />);

    const editButton = page.getByRole('button', { name: /edit/i });
    await userEvent.click(editButton.element());

    expect(page.getByText('Edit Location Information')).toBeDefined();
  });

  it('displays all field labels', () => {
    render(<LocationSettingsPage />);

    expect(page.getByText('Address:')).toBeDefined();
    expect(page.getByText('Phone:')).toBeDefined();
    expect(page.getByText('Email:')).toBeDefined();
    expect(page.getByText('Status:')).toBeDefined();
  });

  it('closes the modal when cancel is clicked', async () => {
    render(<LocationSettingsPage />);

    const editButton = page.getByRole('button', { name: /edit/i });
    await userEvent.click(editButton.element());

    expect(page.getByText('Edit Location Information')).toBeDefined();

    const cancelButton = page.getByRole('button', { name: /cancel/i });
    await userEvent.click(cancelButton.element());

    expect(page.getByText('Edit Location Information').elements()).toHaveLength(0);
  });

  it('calls updateLocation and refetches when saving in the modal', async () => {
    render(<LocationSettingsPage />);

    const editButton = page.getByRole('button', { name: /edit/i });
    await userEvent.click(editButton.element());

    const addressInput = page.getByPlaceholder('Enter address');
    await userEvent.clear(addressInput.element());
    await userEvent.type(addressInput.element(), '456 New Street, Los Angeles, CA');

    const saveButton = page.getByRole('button', { name: /save changes/i });
    await userEvent.click(saveButton.element());

    await vi.waitFor(() => {
      expect(updateLocationMock).toHaveBeenCalledWith(expect.objectContaining({
        address: '456 New Street, Los Angeles, CA',
      }));
    });

    expect(refetchMock).toHaveBeenCalled();
  });

  it('shows a dash when the address has not been set yet', () => {
    hookState = {
      location: { address: null, phone: null, email: null, taxRate: 0 },
      loading: false,
    };

    render(<LocationSettingsPage />);

    expect(page.getByText('Address:')).toBeDefined();
    // Three dashes show up — one each for address, phone, email. We just check that at least one exists.
    expect(page.getByText('-').elements().length).toBeGreaterThan(0);
  });

  it('renders the tax rate from the hook formatted as a percentage', () => {
    render(<LocationSettingsPage />);

    expect(page.getByText('Tax Rate:')).toBeDefined();
    expect(page.getByText('3.75%')).toBeDefined();
  });

  it('renders 0.00% when no tax rate has been set', () => {
    hookState = {
      location: { address: null, phone: null, email: null, taxRate: 0 },
      loading: false,
    };

    render(<LocationSettingsPage />);

    expect(page.getByText('0.00%')).toBeDefined();
  });

  it('has proper accessibility on the edit button', () => {
    render(<LocationSettingsPage />);

    const editButton = page.getByRole('button', { name: /edit location information/i });

    expect(editButton).toBeDefined();
  });
});

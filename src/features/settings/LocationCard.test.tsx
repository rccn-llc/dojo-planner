import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      'LocationSettings': {
        location_title: 'Location',
        address_label: 'Address:',
        phone_label: 'Phone:',
        email_label: 'Email:',
        status_label: 'Status:',
        active_status: 'Active',
      },
      'LocationSettings.EditLocationModal': {
        address_label: 'Address',
        address_placeholder: 'Enter address',
        address_error: 'Please enter an address.',
        phone_label: 'Phone',
        phone_placeholder: '(555) 123-4567',
        phone_error: 'Please enter a phone number.',
        email_label: 'Email',
        email_placeholder: 'Enter email',
        email_error: 'Please enter a valid email.',
      },
      'MyProfile': {
        edit_button: 'Edit',
        cancel_button: 'Cancel',
        save_button: 'Save',
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
    address: '500 Market St',
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

// Import after mocks are set up
const { LocationCard } = await import('./LocationCard');

describe('LocationCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookState = {
      location: {
        address: '500 Market St',
        phone: '(415) 555-0100',
        email: 'hello@dojo.test',
        taxRate: 3.75,
      },
      loading: false,
    };
  });

  it('renders the location title', () => {
    render(<LocationCard />);

    expect(page.getByText('Location')).toBeDefined();
  });

  it('renders address from the hook', () => {
    render(<LocationCard />);

    expect(page.getByText('Address:')).toBeDefined();
    expect(page.getByText('500 Market St')).toBeDefined();
  });

  it('renders phone from the hook', () => {
    render(<LocationCard />);

    expect(page.getByText('Phone:')).toBeDefined();
    expect(page.getByText('(415) 555-0100')).toBeDefined();
  });

  it('renders email from the hook', () => {
    render(<LocationCard />);

    expect(page.getByText('Email:')).toBeDefined();
    expect(page.getByText('hello@dojo.test')).toBeDefined();
  });

  it('renders status label and active badge', () => {
    render(<LocationCard />);

    expect(page.getByText('Status:')).toBeDefined();
    expect(page.getByText('Active')).toBeDefined();
  });

  it('renders the edit button', () => {
    render(<LocationCard />);

    const editButton = page.getByRole('button', { name: /edit location/i });

    expect(editButton).toBeDefined();
  });

  it('shows inline edit form when edit button is clicked', async () => {
    render(<LocationCard />);

    const editButton = page.getByRole('button', { name: /edit location/i });
    await userEvent.click(editButton);

    expect(page.getByLabelText('Location Name')).toBeDefined();
    expect(page.getByLabelText('Address')).toBeDefined();
    expect(page.getByLabelText('Phone')).toBeDefined();
    expect(page.getByLabelText('Email')).toBeDefined();
  });

  it('hides edit form when cancel button is clicked', async () => {
    render(<LocationCard />);

    const editButton = page.getByRole('button', { name: /edit location/i });
    await userEvent.click(editButton);

    const cancelButton = page.getByRole('button', { name: /cancel/i });
    await userEvent.click(cancelButton);

    expect(page.getByRole('button', { name: /edit location/i })).toBeDefined();
    expect(page.getByLabelText('Location Name').elements().length).toBe(0);
  });

  it('calls updateLocation and refetches when save is clicked', async () => {
    render(<LocationCard />);

    const editButton = page.getByRole('button', { name: /edit location/i });
    await userEvent.click(editButton);

    const addressInput = page.getByLabelText('Address');
    await userEvent.clear(addressInput);
    await userEvent.type(addressInput, '456 New St');

    const saveButton = page.getByRole('button', { name: /save/i });
    await userEvent.click(saveButton);

    expect(updateLocationMock).toHaveBeenCalledWith(expect.objectContaining({
      address: '456 New St',
    }));
    expect(refetchMock).toHaveBeenCalled();
  });

  it('shows the title even when in edit mode', async () => {
    render(<LocationCard />);

    const editButton = page.getByRole('button', { name: /edit location/i });
    await userEvent.click(editButton);

    expect(page.getByText('Location')).toBeDefined();
  });

  it('hides display fields when in edit mode', async () => {
    render(<LocationCard />);

    const editButton = page.getByRole('button', { name: /edit location/i });
    await userEvent.click(editButton);

    expect(page.getByText('Status:').elements().length).toBe(0);
  });
});

describe('LocationCard - Loading State', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders skeleton when isLoading prop is true', () => {
    hookState = { ...hookState, loading: false };
    render(<LocationCard isLoading={true} />);

    expect(page.getByText('Location').elements().length).toBe(0);
  });

  it('renders skeleton when the hook is loading', () => {
    hookState = { ...hookState, loading: true };
    render(<LocationCard />);

    expect(page.getByText('Location').elements().length).toBe(0);
  });

  it('renders normal content when not loading', () => {
    hookState = { ...hookState, loading: false };
    render(<LocationCard isLoading={false} />);

    expect(page.getByText('Location')).toBeDefined();
    expect(page.getByRole('button', { name: /edit location/i })).toBeDefined();
  });
});

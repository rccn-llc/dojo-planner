import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { MyProfilePage } from './MyProfilePage';

// Mock user data
const mockUser = {
  firstName: 'John',
  lastName: 'Doe',
  primaryEmailAddress: { emailAddress: 'john.doe@example.com' },
  primaryPhoneNumber: { phoneNumber: '+1 555-123-4567' },
  imageUrl: 'https://example.com/avatar.jpg',
  passwordEnabled: true,
};

// Mock Clerk useUser hook
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({
    user: mockUser,
    isLoaded: true,
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      title: 'My Profile',
      edit_button: 'Edit',
      first_name_label: 'First Name',
      last_name_label: 'Last Name',
      phone_label: 'Phone',
      email_label: 'Email',
    };
    return translations[key] || key;
  },
}));

describe('MyProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the page title', async () => {
    await render(<MyProfilePage />);

    expect(page.getByText('My Profile')).toBeDefined();
  });

  it('should display the user information from Clerk', async () => {
    await render(<MyProfilePage />);

    expect(page.getByText('John Doe')).toBeDefined();
    expect(page.getByText('Account Owner')).toBeDefined();
  });

  it('should display user details in the grid', async () => {
    await render(<MyProfilePage />);

    expect(page.getByText('John')).toBeDefined();
    expect(page.getByText('Doe')).toBeDefined();
    expect(page.getByText('+1 555-123-4567')).toBeDefined();
    expect(page.getByText('john.doe@example.com')).toBeDefined();
  });

  it('should render the edit button', async () => {
    await render(<MyProfilePage />);
    const editButton = page.getByRole('button', { name: /^edit$/i });

    expect(editButton).toBeDefined();
  });

  it('should render all label fields', async () => {
    await render(<MyProfilePage />);

    expect(page.getByText('First Name')).toBeDefined();
    expect(page.getByText('Last Name')).toBeDefined();
    expect(page.getByText('Phone')).toBeDefined();
    expect(page.getByText('Email')).toBeDefined();
  });

  it('should render avatar with user initials as fallback', async () => {
    await render(<MyProfilePage />);

    // The avatar fallback should contain initials JD
    expect(page.getByText('JD')).toBeDefined();
  });
});

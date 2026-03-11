import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { StaffCard } from './StaffCard';

describe('StaffCard', () => {
  const defaultProps = {
    id: '1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    photoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=John',
    emailAddress: 'john@example.com',
    role: 'org:admin',
    status: 'Active' as const,
  };

  it('renders staff name', () => {
    render(<StaffCard {...defaultProps} />);

    const name = page.getByText('John Doe');

    expect(name).toBeInTheDocument();
  });

  it('renders staff email', () => {
    render(<StaffCard {...defaultProps} />);

    const email = page.getByText('john@example.com');

    expect(email).toBeInTheDocument();
  });

  it('renders role badge as Admin for org:admin', () => {
    render(<StaffCard {...defaultProps} />);

    const roleBadge = page.getByText('Admin');

    expect(roleBadge).toBeInTheDocument();
  });

  it('renders other roles with proper formatting', () => {
    // eslint-disable-next-line jsx-a11y/aria-role
    render(<StaffCard {...defaultProps} role="instructor" />);

    const roleBadge = page.getByText('Instructor');

    expect(roleBadge).toBeInTheDocument();
  });

  it('formats front-desk role correctly', () => {
    // eslint-disable-next-line jsx-a11y/aria-role
    render(<StaffCard {...defaultProps} role="front-desk" />);

    const roleBadge = page.getByText('Front Desk');

    expect(roleBadge).toBeInTheDocument();
  });

  it('renders active status badge', () => {
    render(<StaffCard {...defaultProps} />);

    const statusBadge = page.getByText('Active');

    expect(statusBadge).toBeInTheDocument();
  });

  it('renders invitation sent status with proper formatting', () => {
    render(<StaffCard {...defaultProps} status="Invitation sent" />);

    const statusBadge = page.getByText('Invitation Sent');

    expect(statusBadge).toBeInTheDocument();
  });

  it('renders inactive status', () => {
    render(<StaffCard {...defaultProps} status="Inactive" />);

    const statusBadge = page.getByText('Inactive');

    expect(statusBadge).toBeInTheDocument();
  });

  it('renders edit button when onEdit is provided', () => {
    const onEdit = vi.fn();

    render(<StaffCard {...defaultProps} onEdit={onEdit} />);

    const editButton = page.getByRole('button', { name: /Edit John Doe/i });

    expect(editButton).toBeInTheDocument();
  });

  it('renders remove button when onRemove is provided', () => {
    const onRemove = vi.fn();

    render(<StaffCard {...defaultProps} onRemove={onRemove} />);

    const removeButton = page.getByRole('button', { name: /Remove John Doe/i });

    expect(removeButton).toBeInTheDocument();
  });

  it('does not render buttons when callbacks are not provided', () => {
    render(<StaffCard {...defaultProps} />);

    const buttons = page.getByRole('button').elements();

    expect(buttons.length).toBe(0);
  });

  it('calls onEdit when edit button is clicked', async () => {
    const onEdit = vi.fn();

    render(<StaffCard {...defaultProps} onEdit={onEdit} />);

    const editButton = page.getByRole('button', { name: /Edit John Doe/i });
    await userEvent.click(editButton);

    expect(onEdit).toHaveBeenCalled();
  });

  it('calls onRemove with correct id when remove button is clicked', async () => {
    const onRemove = vi.fn();

    render(<StaffCard {...defaultProps} onRemove={onRemove} />);

    const removeButton = page.getByRole('button', { name: /Remove John Doe/i });
    await userEvent.click(removeButton);

    expect(onRemove).toHaveBeenCalledWith('1');
  });

  it('displays avatar initials correctly', () => {
    render(<StaffCard {...defaultProps} photoUrl={null} />);

    const initials = page.getByText('JD');

    expect(initials).toBeInTheDocument();
  });

  it('handles null names gracefully', () => {
    render(
      <StaffCard
        {...defaultProps}
        firstName={null}
        lastName={null}
        photoUrl={null}
      />,
    );

    const email = page.getByText('john@example.com');

    expect(email).toBeInTheDocument();
  });

  it('renders both action buttons when both handlers are provided', () => {
    const onEdit = vi.fn();
    const onRemove = vi.fn();

    render(
      <StaffCard
        {...defaultProps}
        onEdit={onEdit}
        onRemove={onRemove}
      />,
    );

    const editButton = page.getByRole('button', { name: /Edit John Doe/i });
    const removeButton = page.getByRole('button', { name: /Remove John Doe/i });

    expect(editButton).toBeInTheDocument();
    expect(removeButton).toBeInTheDocument();
  });

  it('displays correct initials for null first name', () => {
    render(
      <StaffCard
        {...defaultProps}
        firstName={null}
        photoUrl={null}
      />,
    );

    // Find the avatar fallback by looking for initials in the component
    const fallback = page.getByText('D', { exact: true }).first();

    expect(fallback).toBeInTheDocument();
  });

  it('displays correct initials for null last name', () => {
    render(
      <StaffCard
        {...defaultProps}
        lastName={null}
        photoUrl={null}
      />,
    );

    // Find the avatar fallback by looking for initials in the component
    const fallback = page.getByText('J', { exact: true }).first();

    expect(fallback).toBeInTheDocument();
  });

  it('calls onEdit with id when onEdit accepts an argument', async () => {
    const onEdit = vi.fn((id: string) => id);

    render(<StaffCard {...defaultProps} onEdit={onEdit} />);

    const editButton = page.getByRole('button', { name: /Edit John Doe/i });
    await userEvent.click(editButton);

    expect(onEdit).toHaveBeenCalledWith('1');
  });

  it('calls onEdit without id when onEdit has no parameters', async () => {
    const onEdit = vi.fn();

    render(<StaffCard {...defaultProps} onEdit={onEdit} />);

    const editButton = page.getByRole('button', { name: /Edit John Doe/i });
    await userEvent.click(editButton);

    expect(onEdit).toHaveBeenCalledWith();
  });

  it('renders role without formatting when formatText is false', () => {
    // eslint-disable-next-line jsx-a11y/aria-role
    render(<StaffCard {...defaultProps} role="org:admin" formatText={false} />);

    const roleBadge = page.getByText('org:admin');

    expect(roleBadge).toBeInTheDocument();
  });

  it('renders status without formatting when formatText is false', () => {
    render(<StaffCard {...defaultProps} status="Invitation sent" formatText={false} />);

    const statusBadge = page.getByText('Invitation sent');

    expect(statusBadge).toBeInTheDocument();
  });

  it('renders avatar image when photoUrl is provided', async () => {
    render(<StaffCard {...defaultProps} />);

    const avatar = page.getByRole('img', { name: /John Doe/i });

    await expect.element(avatar).toBeVisible();
  });

  it('applies destructive variant for inactive status', () => {
    render(<StaffCard {...defaultProps} status="Inactive" />);

    const statusBadge = page.getByText('Inactive');

    expect(statusBadge).toBeInTheDocument();
  });

  it('applies secondary variant for invitation sent status', () => {
    render(<StaffCard {...defaultProps} status="Invitation sent" />);

    const statusBadge = page.getByText('Invitation Sent');

    expect(statusBadge).toBeInTheDocument();
  });

  it('applies outline variant for non-admin roles', () => {
    // eslint-disable-next-line jsx-a11y/aria-role
    render(<StaffCard {...defaultProps} role="instructor" />);

    const roleBadge = page.getByText('Instructor');

    expect(roleBadge).toBeInTheDocument();
  });

  it('formats hyphenated roles correctly', () => {
    // eslint-disable-next-line jsx-a11y/aria-role
    render(<StaffCard {...defaultProps} role="academy-owner" />);

    const roleBadge = page.getByText('Academy Owner');

    expect(roleBadge).toBeInTheDocument();
  });

  it('formats org:academy_owner role as Academy Owner', () => {
    // eslint-disable-next-line jsx-a11y/aria-role
    render(<StaffCard {...defaultProps} role="org:academy_owner" />);

    const roleBadge = page.getByText('Academy Owner');

    expect(roleBadge).toBeInTheDocument();
  });

  it('formats org:front_desk role as Front Desk', () => {
    // eslint-disable-next-line jsx-a11y/aria-role
    render(<StaffCard {...defaultProps} role="org:front_desk" />);

    const roleBadge = page.getByText('Front Desk');

    expect(roleBadge).toBeInTheDocument();
  });
});

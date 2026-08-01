import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { I18nWrapper } from '@/lib/test-utils';
import { ProgramCard } from './ProgramCard';

describe('ProgramCard', () => {
  const defaultProps = {
    id: '1',
    name: 'Test Program',
    description: 'A test program description',
    classCount: 3,
    classNames: 'Class A, Class B, Class C',
    status: 'Active' as const,
  };

  it('renders program name', async () => {
    await render(
      <I18nWrapper>
        <ProgramCard {...defaultProps} />
      </I18nWrapper>,
    );

    const name = page.getByRole('heading', { name: 'Test Program' });

    expect(name).toBeInTheDocument();
  });

  it('renders program description', async () => {
    await render(
      <I18nWrapper>
        <ProgramCard {...defaultProps} />
      </I18nWrapper>,
    );

    const description = page.getByText('A test program description');

    expect(description).toBeInTheDocument();
  });

  it('renders class count', async () => {
    await render(
      <I18nWrapper>
        <ProgramCard {...defaultProps} />
      </I18nWrapper>,
    );

    const classCount = page.getByText('3', { exact: true });

    expect(classCount).toBeInTheDocument();
  });

  it('renders class names', async () => {
    await render(
      <I18nWrapper>
        <ProgramCard {...defaultProps} />
      </I18nWrapper>,
    );

    const classNames = page.getByText('Class A, Class B, Class C');

    expect(classNames).toBeInTheDocument();
  });

  it('renders active status badge', async () => {
    await render(
      <I18nWrapper>
        <ProgramCard {...defaultProps} />
      </I18nWrapper>,
    );

    const activeBadge = page.getByText('Active');

    expect(activeBadge).toBeInTheDocument();
  });

  it('renders inactive status badge', async () => {
    await render(
      <I18nWrapper>
        <ProgramCard {...defaultProps} status="Inactive" />
      </I18nWrapper>,
    );

    const inactiveBadge = page.getByText('Inactive');

    expect(inactiveBadge).toBeInTheDocument();
  });

  it('renders edit button when onEdit is provided', async () => {
    const onEdit = vi.fn();

    await render(
      <I18nWrapper>
        <ProgramCard {...defaultProps} onEdit={onEdit} />
      </I18nWrapper>,
    );

    const editButton = page.getByRole('button', { name: /Edit program/i });

    expect(editButton).toBeInTheDocument();
  });

  it('does not render edit button when onEdit is not provided', async () => {
    await render(
      <I18nWrapper>
        <ProgramCard {...defaultProps} />
      </I18nWrapper>,
    );

    const editButtons = page.getByRole('button', { name: /Edit program/i }).elements();

    expect(editButtons.length).toBe(0);
  });

  it('calls onEdit with correct id when edit button is clicked', async () => {
    const onEdit = vi.fn();

    await render(
      <I18nWrapper>
        <ProgramCard {...defaultProps} onEdit={onEdit} />
      </I18nWrapper>,
    );

    const editButton = page.getByRole('button', { name: /Edit program/i });
    await userEvent.click(editButton);

    expect(onEdit).toHaveBeenCalledWith('1');
  });

  it('renders delete button when onDelete is provided', async () => {
    const onDelete = vi.fn();

    await render(
      <I18nWrapper>
        <ProgramCard {...defaultProps} onDelete={onDelete} />
      </I18nWrapper>,
    );

    const deleteButton = page.getByRole('button', { name: /Delete program/i });

    expect(deleteButton).toBeInTheDocument();
  });

  it('does not render delete button when onDelete is not provided', async () => {
    await render(
      <I18nWrapper>
        <ProgramCard {...defaultProps} />
      </I18nWrapper>,
    );

    const deleteButtons = page.getByRole('button', { name: /Delete program/i }).elements();

    expect(deleteButtons.length).toBe(0);
  });

  it('calls onDelete with correct id when delete button is clicked', async () => {
    const onDelete = vi.fn();

    await render(
      <I18nWrapper>
        <ProgramCard {...defaultProps} onDelete={onDelete} />
      </I18nWrapper>,
    );

    const deleteButton = page.getByRole('button', { name: /Delete program/i });
    await userEvent.click(deleteButton);

    expect(onDelete).toHaveBeenCalledWith('1');
  });

  it('renders classes label', async () => {
    await render(
      <I18nWrapper>
        <ProgramCard {...defaultProps} />
      </I18nWrapper>,
    );

    const classesLabel = page.getByText('Classes');

    expect(classesLabel).toBeInTheDocument();
  });

  it('renders both edit and delete buttons when both handlers are provided', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    await render(
      <I18nWrapper>
        <ProgramCard {...defaultProps} onEdit={onEdit} onDelete={onDelete} />
      </I18nWrapper>,
    );

    const editButton = page.getByRole('button', { name: /Edit program/i });
    const deleteButton = page.getByRole('button', { name: /Delete program/i });

    expect(editButton).toBeInTheDocument();
    expect(deleteButton).toBeInTheDocument();
  });
});

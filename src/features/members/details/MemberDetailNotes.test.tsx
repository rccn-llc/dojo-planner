import type { MemberNote } from './MemberDetailNotes';

import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { MemberDetailNotes } from './MemberDetailNotes';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('MemberDetailNotes', () => {
  const mockNotes: MemberNote[] = [
    {
      id: 'note-1',
      memberId: 'member-123',
      content: 'Member requested to pause membership for 2 weeks due to travel.',
      createdByName: 'Staff Member',
      createdAt: new Date('2025-12-15T14:30:00Z'),
      updatedAt: new Date('2025-12-15T14:30:00Z'),
    },
    {
      id: 'note-2',
      memberId: 'member-123',
      content: 'Updated emergency contact information.',
      createdByName: 'Front Desk',
      createdAt: new Date('2025-11-28T10:15:00Z'),
      updatedAt: new Date('2025-11-28T10:15:00Z'),
    },
  ];

  const mockProps = {
    memberId: 'member-123',
    memberName: 'John Doe',
    notes: mockNotes,
    onAddNote: vi.fn(),
  };

  describe('Render method', () => {
    it('should render add note section title', () => {
      render(<MemberDetailNotes {...mockProps} />);

      expect(page.getByRole('heading', { name: 'add_note_title' })).toBeInTheDocument();
    });

    it('should render notes history section title', () => {
      render(<MemberDetailNotes {...mockProps} />);

      expect(page.getByRole('heading', { name: 'notes_history_title' })).toBeInTheDocument();
    });

    it('should render textarea for new note input', () => {
      render(<MemberDetailNotes {...mockProps} />);

      expect(page.getByRole('textbox', { name: 'note_placeholder' })).toBeInTheDocument();
    });

    it('should render save note button', () => {
      render(<MemberDetailNotes {...mockProps} />);

      expect(page.getByRole('button', { name: 'save_note_button' })).toBeInTheDocument();
    });

    it('should render note content in history', () => {
      render(<MemberDetailNotes {...mockProps} />);

      expect(page.getByText('Member requested to pause membership for 2 weeks due to travel.').first()).toBeInTheDocument();
      expect(page.getByText('Updated emergency contact information.').first()).toBeInTheDocument();
    });

    it('should render note authors in history', () => {
      render(<MemberDetailNotes {...mockProps} />);

      expect(page.getByText('Staff Member').first()).toBeInTheDocument();
      expect(page.getByText('Front Desk').first()).toBeInTheDocument();
    });

    it('should fall back to unknown_author when createdByName is null', () => {
      const propsWithNullAuthor = {
        ...mockProps,
        notes: [{
          id: 'note-x',
          memberId: 'member-123',
          content: 'Anonymous note',
          createdByName: null,
          createdAt: new Date('2025-12-01T12:00:00Z'),
          updatedAt: new Date('2025-12-01T12:00:00Z'),
        }],
      };
      render(<MemberDetailNotes {...propsWithNullAuthor} />);

      expect(page.getByText('unknown_author').first()).toBeInTheDocument();
    });

    it('should render table headers on desktop view', () => {
      render(<MemberDetailNotes {...mockProps} />);

      const dateHeaders = page.getByText('table_date');
      const authorHeaders = page.getByText('table_author');
      const noteHeaders = page.getByText('table_note');

      expect(dateHeaders.first()).toBeInTheDocument();
      expect(authorHeaders.first()).toBeInTheDocument();
      expect(noteHeaders.first()).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('should render no notes message when notes array is empty', () => {
      const propsWithNoNotes = {
        ...mockProps,
        notes: [],
      };
      render(<MemberDetailNotes {...propsWithNoNotes} />);

      expect(page.getByText('no_notes')).toBeInTheDocument();
    });

    it('should render loading message when isLoading is true', () => {
      render(<MemberDetailNotes {...mockProps} notes={[]} isLoading={true} />);

      expect(page.getByText('loading')).toBeInTheDocument();
    });
  });

  describe('Character limit', () => {
    it('should display character count', () => {
      render(<MemberDetailNotes {...mockProps} />);

      expect(page.getByText(/0\s*\/\s*2000/)).toBeInTheDocument();
    });

    it('should have maxLength attribute on textarea', () => {
      render(<MemberDetailNotes {...mockProps} />);

      const textarea = page.getByRole('textbox', { name: 'note_placeholder' });

      expect(textarea).toHaveAttribute('maxlength', '2000');
    });
  });

  describe('Interactions', () => {
    it('should have save button disabled when textarea is empty', () => {
      render(<MemberDetailNotes {...mockProps} />);

      const saveButton = page.getByRole('button', { name: 'save_note_button' });

      expect(saveButton).toBeDisabled();
    });

    it('should enable save button when textarea has content', async () => {
      render(<MemberDetailNotes {...mockProps} />);

      const textarea = page.getByRole('textbox', { name: 'note_placeholder' });
      await userEvent.type(textarea, 'This is a new note');

      const saveButton = page.getByRole('button', { name: 'save_note_button' });

      expect(saveButton).not.toBeDisabled();
    });

    it('should call onAddNote when save button is clicked', async () => {
      const onAddNoteMock = vi.fn();
      render(<MemberDetailNotes {...mockProps} onAddNote={onAddNoteMock} />);

      const textarea = page.getByRole('textbox', { name: 'note_placeholder' });
      await userEvent.type(textarea, 'This is a new note');

      const saveButton = page.getByRole('button', { name: 'save_note_button' });
      await saveButton.click();

      expect(onAddNoteMock).toHaveBeenCalledWith('This is a new note');
    });

    it('should clear textarea after submitting note', async () => {
      render(<MemberDetailNotes {...mockProps} />);

      const textarea = page.getByRole('textbox', { name: 'note_placeholder' });
      await userEvent.type(textarea, 'This is a new note');

      const saveButton = page.getByRole('button', { name: 'save_note_button' });
      await saveButton.click();

      expect(textarea).toHaveValue('');
    });

    it('should not call onAddNote when textarea only has whitespace', async () => {
      const onAddNoteMock = vi.fn();
      render(<MemberDetailNotes {...mockProps} onAddNote={onAddNoteMock} />);

      const textarea = page.getByRole('textbox', { name: 'note_placeholder' });
      await userEvent.type(textarea, '   ');

      const saveButton = page.getByRole('button', { name: 'save_note_button' });

      expect(saveButton).toBeDisabled();
    });
  });

  describe('Mobile view', () => {
    it('should render mobile card view structure', () => {
      render(<MemberDetailNotes {...mockProps} />);

      const mobileContainer = page.getByText('Member requested to pause membership for 2 weeks due to travel.').first();

      expect(mobileContainer).toBeInTheDocument();
    });
  });

  describe('Multiple notes', () => {
    it('should render all notes in the list', () => {
      const manyNotes: MemberNote[] = [
        { id: '1', memberId: 'member-123', content: 'First note', createdByName: 'User A', createdAt: new Date('2025-12-01T00:00:00Z'), updatedAt: new Date('2025-12-01T00:00:00Z') },
        { id: '2', memberId: 'member-123', content: 'Second note', createdByName: 'User B', createdAt: new Date('2025-12-02T00:00:00Z'), updatedAt: new Date('2025-12-02T00:00:00Z') },
        { id: '3', memberId: 'member-123', content: 'Third note', createdByName: 'User C', createdAt: new Date('2025-12-03T00:00:00Z'), updatedAt: new Date('2025-12-03T00:00:00Z') },
      ];
      render(<MemberDetailNotes {...mockProps} notes={manyNotes} />);

      expect(page.getByText('First note').first()).toBeInTheDocument();
      expect(page.getByText('Second note').first()).toBeInTheDocument();
      expect(page.getByText('Third note').first()).toBeInTheDocument();
    });
  });

  describe('Without onAddNote callback', () => {
    it('should not throw error when onAddNote is not provided', async () => {
      const propsWithoutCallback = {
        memberId: 'member-123',
        memberName: 'John Doe',
        notes: mockNotes,
      };
      render(<MemberDetailNotes {...propsWithoutCallback} />);

      const textarea = page.getByRole('textbox', { name: 'note_placeholder' });
      await userEvent.type(textarea, 'This is a new note');

      const saveButton = page.getByRole('button', { name: 'save_note_button' });
      // Without onAddNote the save handler short-circuits, so the textarea
      // retains its value. The component must still not throw.
      await saveButton.click();

      expect(textarea).toHaveValue('This is a new note');
    });
  });

  describe('Filter by memberId', () => {
    // Notes belonging to two different members. The parent page is responsible
    // for filtering by memberId before passing the notes down — this guards
    // against a regression where notes from other members leak in.
    const multiMemberNotes: MemberNote[] = [
      { id: '1', memberId: 'member-A', content: 'Note for member A', createdByName: 'Staff', createdAt: new Date('2025-12-10T00:00:00Z'), updatedAt: new Date('2025-12-10T00:00:00Z') },
      { id: '2', memberId: 'member-B', content: 'Note for member B', createdByName: 'Staff', createdAt: new Date('2025-12-11T00:00:00Z'), updatedAt: new Date('2025-12-11T00:00:00Z') },
      { id: '3', memberId: 'member-A', content: 'Another note for member A', createdByName: 'Staff', createdAt: new Date('2025-12-12T00:00:00Z'), updatedAt: new Date('2025-12-12T00:00:00Z') },
    ];

    it('should only display notes whose memberId matches the current member', () => {
      const filtered = multiMemberNotes.filter(n => n.memberId === 'member-A');
      render(<MemberDetailNotes {...mockProps} memberId="member-A" notes={filtered} />);

      expect(page.getByText('Note for member A').first()).toBeInTheDocument();
      expect(page.getByText('Another note for member A').first()).toBeInTheDocument();
      expect(page.getByText('Note for member B')).not.toBeInTheDocument();
    });

    it('should display empty state for a brand-new member with no notes', () => {
      const filtered = multiMemberNotes.filter(n => n.memberId === 'member-new');
      render(<MemberDetailNotes {...mockProps} memberId="member-new" notes={filtered} />);

      expect(page.getByText('no_notes')).toBeInTheDocument();
      expect(page.getByText('Note for member A')).not.toBeInTheDocument();
      expect(page.getByText('Note for member B')).not.toBeInTheDocument();
    });
  });

  describe('Edit and delete', () => {
    it('should not render edit/delete buttons when callbacks are not provided', () => {
      render(<MemberDetailNotes {...mockProps} />);

      expect(page.getByRole('button', { name: 'edit_note_aria' })).not.toBeInTheDocument();
      expect(page.getByRole('button', { name: 'delete_note_aria' })).not.toBeInTheDocument();
    });

    it('should render edit and delete buttons when callbacks are provided', () => {
      const onEditNote = vi.fn();
      const onDeleteNote = vi.fn();
      render(
        <MemberDetailNotes
          {...mockProps}
          onEditNote={onEditNote}
          onDeleteNote={onDeleteNote}
        />,
      );

      // One per row × (desktop + mobile views)
      expect(page.getByRole('button', { name: 'edit_note_aria' }).first()).toBeInTheDocument();
      expect(page.getByRole('button', { name: 'delete_note_aria' }).first()).toBeInTheDocument();
    });

    it('should switch into edit mode and call onEditNote with the new content', async () => {
      const onEditNote = vi.fn().mockResolvedValue(undefined);
      render(
        <MemberDetailNotes
          {...mockProps}
          onEditNote={onEditNote}
        />,
      );

      const editBtn = page.getByRole('button', { name: 'edit_note_aria' }).first();
      await editBtn.click();

      const editTextarea = page.getByRole('textbox', { name: 'edit_note_placeholder' }).first();
      await userEvent.clear(editTextarea);
      await userEvent.type(editTextarea, 'Edited content');

      const saveBtn = page.getByRole('button', { name: 'save_edit_button' }).first();
      await saveBtn.click();

      expect(onEditNote).toHaveBeenCalledWith('note-1', 'Edited content');
    });

    it('should open the confirm dialog and call onDeleteNote when the dialog is confirmed', async () => {
      const onDeleteNote = vi.fn().mockResolvedValue(undefined);
      render(
        <MemberDetailNotes
          {...mockProps}
          onDeleteNote={onDeleteNote}
        />,
      );

      const deleteBtn = page.getByRole('button', { name: 'delete_note_aria' }).first();
      await deleteBtn.click();

      // Dialog opens with the title
      expect(page.getByText('delete_dialog_title')).toBeInTheDocument();
      // onDeleteNote is NOT called yet — only after the user confirms
      expect(onDeleteNote).not.toHaveBeenCalled();

      const confirmBtn = page.getByRole('button', { name: 'delete_button' }).first();
      await confirmBtn.click();

      expect(onDeleteNote).toHaveBeenCalledWith('note-1');
    });

    it('should not call onDeleteNote when the dialog is cancelled', async () => {
      const onDeleteNote = vi.fn();
      render(
        <MemberDetailNotes
          {...mockProps}
          onDeleteNote={onDeleteNote}
        />,
      );

      const deleteBtn = page.getByRole('button', { name: 'delete_note_aria' }).first();
      await deleteBtn.click();

      const cancelBtn = page.getByRole('button', { name: 'cancel_edit_button' }).first();
      await cancelBtn.click();

      expect(onDeleteNote).not.toHaveBeenCalled();
    });
  });

  describe('Sorting', () => {
    const sortableNotes: MemberNote[] = [
      { id: '1', memberId: 'member-123', content: 'Beta note', createdByName: 'Charlie', createdAt: new Date('2025-12-10T09:00:00Z'), updatedAt: new Date('2025-12-10T09:00:00Z') },
      { id: '2', memberId: 'member-123', content: 'Alpha note', createdByName: 'Alice', createdAt: new Date('2025-12-15T14:00:00Z'), updatedAt: new Date('2025-12-15T14:00:00Z') },
      { id: '3', memberId: 'member-123', content: 'Gamma note', createdByName: 'Bob', createdAt: new Date('2025-12-05T11:00:00Z'), updatedAt: new Date('2025-12-05T11:00:00Z') },
    ];

    const sortableProps = {
      ...mockProps,
      notes: sortableNotes,
    };

    it('should render sortable column headers as buttons', () => {
      render(<MemberDetailNotes {...sortableProps} />);

      const dateButton = page.getByRole('button', { name: /table_date/i }).first();
      const authorButton = page.getByRole('button', { name: /table_author/i }).first();
      const noteButton = page.getByRole('button', { name: /table_note/i }).first();

      expect(dateButton).toBeInTheDocument();
      expect(authorButton).toBeInTheDocument();
      expect(noteButton).toBeInTheDocument();
    });

    it('should sort by author when author header is clicked', async () => {
      render(<MemberDetailNotes {...sortableProps} />);

      const authorButton = page.getByRole('button', { name: /table_author/i }).first();
      await authorButton.click();

      expect(page.getByText('Alice').first()).toBeInTheDocument();
      expect(page.getByText('Bob').first()).toBeInTheDocument();
      expect(page.getByText('Charlie').first()).toBeInTheDocument();
    });

    it('should toggle author sort direction when clicked twice', async () => {
      render(<MemberDetailNotes {...sortableProps} />);

      const authorButton = page.getByRole('button', { name: /table_author/i }).first();

      await authorButton.click();

      expect(page.getByText('Alice').first()).toBeInTheDocument();

      await authorButton.click();

      expect(page.getByText('Charlie').first()).toBeInTheDocument();
    });

    it('should sort by content when note header is clicked', async () => {
      render(<MemberDetailNotes {...sortableProps} />);

      const noteButton = page.getByRole('button', { name: /table_note/i }).first();
      await noteButton.click();

      expect(page.getByText('Alpha note').first()).toBeInTheDocument();
      expect(page.getByText('Beta note').first()).toBeInTheDocument();
      expect(page.getByText('Gamma note').first()).toBeInTheDocument();
    });
  });

  describe('Search', () => {
    const searchableNotes: MemberNote[] = [
      { id: '1', memberId: 'member-123', content: 'Membership paused for travel', createdByName: 'Staff Member', createdAt: new Date('2025-12-10T09:00:00Z'), updatedAt: new Date('2025-12-10T09:00:00Z') },
      { id: '2', memberId: 'member-123', content: 'Updated contact information', createdByName: 'Front Desk', createdAt: new Date('2025-12-15T14:00:00Z'), updatedAt: new Date('2025-12-15T14:00:00Z') },
      { id: '3', memberId: 'member-123', content: 'Discussed membership options', createdByName: 'Manager', createdAt: new Date('2025-12-05T11:00:00Z'), updatedAt: new Date('2025-12-05T11:00:00Z') },
    ];

    const searchableProps = {
      ...mockProps,
      notes: searchableNotes,
    };

    it('should render search input when notes exist', () => {
      render(<MemberDetailNotes {...searchableProps} />);

      expect(page.getByRole('textbox', { name: 'search_placeholder' })).toBeInTheDocument();
    });

    it('should not render search input when no notes exist', () => {
      render(<MemberDetailNotes {...mockProps} notes={[]} />);

      const searchInputs = page.getByRole('textbox', { name: 'search_placeholder' });

      expect(searchInputs).not.toBeInTheDocument();
    });

    it('should filter notes by content', async () => {
      render(<MemberDetailNotes {...searchableProps} />);

      const searchInput = page.getByRole('textbox', { name: 'search_placeholder' });
      await userEvent.type(searchInput, 'paused');

      expect(page.getByText('Membership paused for travel').first()).toBeInTheDocument();
      expect(page.getByText('Updated contact information')).not.toBeInTheDocument();
      expect(page.getByText('Discussed membership options')).not.toBeInTheDocument();
    });

    it('should filter notes by author', async () => {
      render(<MemberDetailNotes {...searchableProps} />);

      const searchInput = page.getByRole('textbox', { name: 'search_placeholder' });
      await userEvent.type(searchInput, 'Manager');

      expect(page.getByText('Discussed membership options').first()).toBeInTheDocument();
      expect(page.getByText('Membership paused for travel')).not.toBeInTheDocument();
    });

    it('should be case-insensitive search', async () => {
      render(<MemberDetailNotes {...searchableProps} />);

      const searchInput = page.getByRole('textbox', { name: 'search_placeholder' });
      await userEvent.type(searchInput, 'PAUSED');

      expect(page.getByText('Membership paused for travel').first()).toBeInTheDocument();
    });

    it('should show no matching notes message when search yields no results', async () => {
      render(<MemberDetailNotes {...searchableProps} />);

      const searchInput = page.getByRole('textbox', { name: 'search_placeholder' });
      await userEvent.type(searchInput, 'nonexistent text xyz');

      expect(page.getByText('no_matching_notes')).toBeInTheDocument();
    });

    it('should show all notes when search is cleared', async () => {
      render(<MemberDetailNotes {...searchableProps} />);

      const searchInput = page.getByRole('textbox', { name: 'search_placeholder' });

      await userEvent.type(searchInput, 'paused');

      expect(page.getByText('Membership paused for travel').first()).toBeInTheDocument();
      expect(page.getByText('Updated contact information')).not.toBeInTheDocument();

      await userEvent.clear(searchInput);

      expect(page.getByText('Membership paused for travel').first()).toBeInTheDocument();
      expect(page.getByText('Updated contact information').first()).toBeInTheDocument();
      expect(page.getByText('Discussed membership options').first()).toBeInTheDocument();
    });
  });
});

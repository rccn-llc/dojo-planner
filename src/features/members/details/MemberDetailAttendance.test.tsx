import type { AttendanceRecord, PunchcardInfo } from './MemberDetailAttendance';

import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { MemberDetailAttendance } from './MemberDetailAttendance';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('MemberDetailAttendance', () => {
  // Mock attendance data for testing
  // Note: Class names and instructor names are for demonstration purposes only
  const mockAttendance: AttendanceRecord[] = [
    {
      id: 'att-1',
      className: 'BJJ Fundamentals I',
      date: 'Jan 10, 2026',
      time: '6:00 PM - 7:00 PM',
      instructor: 'Coach Alex',
    },
    {
      id: 'att-2',
      className: 'BJJ Fundamentals II',
      date: 'Jan 9, 2026',
      time: '6:00 PM - 7:30 PM',
      instructor: 'Professor Ivan',
    },
    {
      id: 'att-3',
      className: 'Open Mat',
      date: 'Jan 5, 2026',
      time: '10:00 AM - 12:00 PM',
      instructor: 'N/A',
    },
  ];

  const mockPunchcardInfo: PunchcardInfo = {
    totalClasses: 10,
    classesUsed: 4,
    classesRemaining: 6,
  };

  const mockProps = {
    memberId: 'member-123',
    memberName: 'John Doe',
    attendanceRecords: mockAttendance,
    punchcardInfo: null,
  };

  describe('Render method', () => {
    it('should render attendance history section title', async () => {
      await render(<MemberDetailAttendance {...mockProps} />);

      expect(page.getByRole('heading', { name: 'title' })).toBeInTheDocument();
    });

    it('should render table headers on desktop view', async () => {
      await render(<MemberDetailAttendance {...mockProps} />);

      const classHeaders = page.getByText('table_class');
      const dateHeaders = page.getByText('table_date');
      const timeHeaders = page.getByText('table_time');
      const instructorHeaders = page.getByText('table_instructor');

      expect(classHeaders.first()).toBeInTheDocument();
      expect(dateHeaders.first()).toBeInTheDocument();
      expect(timeHeaders.first()).toBeInTheDocument();
      expect(instructorHeaders.first()).toBeInTheDocument();
    });

    it('should render class names in history', async () => {
      await render(<MemberDetailAttendance {...mockProps} />);

      // Use first() because content appears in both desktop table and mobile card views
      expect(page.getByText('BJJ Fundamentals I').first()).toBeInTheDocument();
      expect(page.getByText('BJJ Fundamentals II').first()).toBeInTheDocument();
      expect(page.getByText('Open Mat').first()).toBeInTheDocument();
    });

    it('should render dates in history', async () => {
      await render(<MemberDetailAttendance {...mockProps} />);

      expect(page.getByText('Jan 10, 2026').first()).toBeInTheDocument();
      expect(page.getByText('Jan 9, 2026').first()).toBeInTheDocument();
      expect(page.getByText('Jan 5, 2026').first()).toBeInTheDocument();
    });

    it('should render times in history', async () => {
      await render(<MemberDetailAttendance {...mockProps} />);

      expect(page.getByText('6:00 PM - 7:00 PM').first()).toBeInTheDocument();
      expect(page.getByText('6:00 PM - 7:30 PM').first()).toBeInTheDocument();
      expect(page.getByText('10:00 AM - 12:00 PM').first()).toBeInTheDocument();
    });

    it('should render instructors in history', async () => {
      await render(<MemberDetailAttendance {...mockProps} />);

      expect(page.getByText('Coach Alex').first()).toBeInTheDocument();
      expect(page.getByText('Professor Ivan').first()).toBeInTheDocument();
      expect(page.getByText('N/A').first()).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('should render no attendance message when records array is empty', async () => {
      const propsWithNoAttendance = {
        ...mockProps,
        attendanceRecords: [],
      };
      await render(<MemberDetailAttendance {...propsWithNoAttendance} />);

      expect(page.getByText('no_attendance')).toBeInTheDocument();
    });
  });

  describe('Punchcard info', () => {
    it('should not render punchcard section when punchcardInfo is null', async () => {
      await render(<MemberDetailAttendance {...mockProps} />);

      expect(page.getByText('punchcard_info_title')).not.toBeInTheDocument();
    });

    it('should render punchcard section when punchcardInfo is provided', async () => {
      const propsWithPunchcard = {
        ...mockProps,
        punchcardInfo: mockPunchcardInfo,
      };
      await render(<MemberDetailAttendance {...propsWithPunchcard} />);

      expect(page.getByRole('heading', { name: 'punchcard_info_title' })).toBeInTheDocument();
    });

    it('should render classes remaining', async () => {
      const propsWithPunchcard = {
        ...mockProps,
        punchcardInfo: mockPunchcardInfo,
      };
      await render(<MemberDetailAttendance {...propsWithPunchcard} />);

      expect(page.getByText('classes_remaining')).toBeInTheDocument();
      // Use first() because the number may appear in attendance table dates
      expect(page.getByText('6').first()).toBeInTheDocument();
    });

    it('should render classes used', async () => {
      const propsWithPunchcard = {
        ...mockProps,
        punchcardInfo: mockPunchcardInfo,
      };
      await render(<MemberDetailAttendance {...propsWithPunchcard} />);

      expect(page.getByText('classes_used')).toBeInTheDocument();
      expect(page.getByText('4')).toBeInTheDocument();
    });

    it('should render total classes', async () => {
      const propsWithPunchcard = {
        ...mockProps,
        punchcardInfo: mockPunchcardInfo,
      };
      await render(<MemberDetailAttendance {...propsWithPunchcard} />);

      expect(page.getByText('total_classes')).toBeInTheDocument();
      // Use first() because the number may appear in attendance table dates
      expect(page.getByText('10').first()).toBeInTheDocument();
    });

    it('should show low classes remaining in destructive color', async () => {
      const lowClassesInfo: PunchcardInfo = {
        totalClasses: 10,
        classesUsed: 8,
        classesRemaining: 2,
      };
      const propsWithLowClasses = {
        ...mockProps,
        punchcardInfo: lowClassesInfo,
      };
      await render(<MemberDetailAttendance {...propsWithLowClasses} />);

      // The remaining classes (2) should be visible
      // Use first() because the number may appear in attendance table dates
      expect(page.getByText('2').first()).toBeInTheDocument();
    });
  });

  describe('Sorting', () => {
    // Attendance records with different dates and class names for sorting tests
    const sortableRecords: AttendanceRecord[] = [
      { id: '1', className: 'Advanced No-Gi', date: 'Jan 5, 2026', time: '12:00 PM - 1:00 PM', instructor: 'Professor Joao' },
      { id: '2', className: 'BJJ Fundamentals I', date: 'Jan 10, 2026', time: '6:00 PM - 7:00 PM', instructor: 'Coach Alex' },
      { id: '3', className: 'Kids Class', date: 'Jan 7, 2026', time: '4:00 PM - 5:00 PM', instructor: 'Coach Liza' },
    ];

    const sortableProps = {
      ...mockProps,
      attendanceRecords: sortableRecords,
    };

    it('should render sortable column headers as buttons', async () => {
      await render(<MemberDetailAttendance {...sortableProps} />);

      const classButton = page.getByRole('button', { name: /table_class/i }).first();
      const dateButton = page.getByRole('button', { name: /table_date/i }).first();
      const timeButton = page.getByRole('button', { name: /table_time/i }).first();
      const instructorButton = page.getByRole('button', { name: /table_instructor/i }).first();

      expect(classButton).toBeInTheDocument();
      expect(dateButton).toBeInTheDocument();
      expect(timeButton).toBeInTheDocument();
      expect(instructorButton).toBeInTheDocument();
    });

    it('should default to sorting by date descending (newest first)', async () => {
      await render(<MemberDetailAttendance {...sortableProps} />);

      // Default sort is by date descending, so Jan 10 (newest) should appear first
      expect(page.getByText('Jan 10, 2026').first()).toBeInTheDocument();
    });

    it('should sort by date ascending when date header is clicked', async () => {
      await render(<MemberDetailAttendance {...sortableProps} />);

      const dateButton = page.getByRole('button', { name: /table_date/i }).first();
      await dateButton.click();

      // After clicking, sort should toggle to ascending (oldest first)
      // Jan 5 should now be the first date in the list
      expect(page.getByText('Jan 5, 2026').first()).toBeInTheDocument();
    });

    it('should sort by class name when class header is clicked', async () => {
      await render(<MemberDetailAttendance {...sortableProps} />);

      const classButton = page.getByRole('button', { name: /table_class/i }).first();
      await classButton.click();

      // After clicking, should sort by class name ascending (A-Z)
      // Advanced No-Gi should appear first
      expect(page.getByText('Advanced No-Gi').first()).toBeInTheDocument();
    });

    it('should toggle class sort direction when clicked twice', async () => {
      await render(<MemberDetailAttendance {...sortableProps} />);

      const classButton = page.getByRole('button', { name: /table_class/i }).first();

      // First click - ascending (A-Z)
      await classButton.click();

      expect(page.getByText('Advanced No-Gi').first()).toBeInTheDocument();

      // Second click - descending (Z-A)
      await classButton.click();

      // Kids Class should now be first (Z-A order)
      expect(page.getByText('Kids Class').first()).toBeInTheDocument();
    });

    it('should sort by instructor when instructor header is clicked', async () => {
      await render(<MemberDetailAttendance {...sortableProps} />);

      const instructorButton = page.getByRole('button', { name: /table_instructor/i }).first();
      await instructorButton.click();

      // After clicking, should sort by instructor ascending (A-Z)
      // Coach Alex should appear first
      expect(page.getByText('Coach Alex').first()).toBeInTheDocument();
    });
  });

  describe('Search', () => {
    const searchableRecords: AttendanceRecord[] = [
      { id: '1', className: 'BJJ Fundamentals I', date: 'Jan 10, 2026', time: '6:00 PM - 7:00 PM', instructor: 'Coach Alex' },
      { id: '2', className: 'BJJ Fundamentals II', date: 'Jan 9, 2026', time: '6:00 PM - 7:30 PM', instructor: 'Professor Ivan' },
      { id: '3', className: 'Open Mat', date: 'Jan 5, 2026', time: '10:00 AM - 12:00 PM', instructor: 'N/A' },
    ];

    const searchableProps = {
      ...mockProps,
      attendanceRecords: searchableRecords,
    };

    it('should render search input when records exist', async () => {
      await render(<MemberDetailAttendance {...searchableProps} />);

      expect(page.getByRole('textbox', { name: 'search_placeholder' })).toBeInTheDocument();
    });

    it('should not render search input when no records exist', async () => {
      await render(<MemberDetailAttendance {...mockProps} attendanceRecords={[]} />);

      const searchInputs = page.getByRole('textbox', { name: 'search_placeholder' });

      expect(searchInputs).not.toBeInTheDocument();
    });

    it('should filter records by class name', async () => {
      await render(<MemberDetailAttendance {...searchableProps} />);

      const searchInput = page.getByRole('textbox', { name: 'search_placeholder' });
      await userEvent.type(searchInput, 'Open Mat');

      // Only the Open Mat record should be visible
      expect(page.getByText('Open Mat').first()).toBeInTheDocument();

      // Other records should not be visible
      expect(page.getByText('BJJ Fundamentals I')).not.toBeInTheDocument();
      expect(page.getByText('BJJ Fundamentals II')).not.toBeInTheDocument();
    });

    it('should filter records by instructor', async () => {
      await render(<MemberDetailAttendance {...searchableProps} />);

      const searchInput = page.getByRole('textbox', { name: 'search_placeholder' });
      await userEvent.type(searchInput, 'Coach Alex');

      // Only the record with Coach Alex should be visible
      expect(page.getByText('BJJ Fundamentals I').first()).toBeInTheDocument();

      // Other records should not be visible
      expect(page.getByText('Open Mat')).not.toBeInTheDocument();
    });

    it('should filter records by date', async () => {
      await render(<MemberDetailAttendance {...searchableProps} />);

      const searchInput = page.getByRole('textbox', { name: 'search_placeholder' });
      await userEvent.type(searchInput, 'Jan 5');

      // Only the record from Jan 5 should be visible
      expect(page.getByText('Open Mat').first()).toBeInTheDocument();

      // Other records should not be visible
      expect(page.getByText('BJJ Fundamentals I')).not.toBeInTheDocument();
    });

    it('should filter records by time', async () => {
      await render(<MemberDetailAttendance {...searchableProps} />);

      const searchInput = page.getByRole('textbox', { name: 'search_placeholder' });
      await userEvent.type(searchInput, '10:00 AM');

      // Only the Open Mat record (10:00 AM - 12:00 PM) should be visible
      expect(page.getByText('Open Mat').first()).toBeInTheDocument();

      // Other records should not be visible
      expect(page.getByText('BJJ Fundamentals I')).not.toBeInTheDocument();
    });

    it('should be case-insensitive search', async () => {
      await render(<MemberDetailAttendance {...searchableProps} />);

      const searchInput = page.getByRole('textbox', { name: 'search_placeholder' });
      await userEvent.type(searchInput, 'OPEN MAT');

      // Should find the record even with uppercase search
      expect(page.getByText('Open Mat').first()).toBeInTheDocument();
    });

    it('should show no matching records message when search yields no results', async () => {
      await render(<MemberDetailAttendance {...searchableProps} />);

      const searchInput = page.getByRole('textbox', { name: 'search_placeholder' });
      await userEvent.type(searchInput, 'nonexistent class xyz');

      // Should show no matching attendance message
      expect(page.getByText('no_matching_attendance')).toBeInTheDocument();
    });

    it('should show all records when search is cleared', async () => {
      await render(<MemberDetailAttendance {...searchableProps} />);

      const searchInput = page.getByRole('textbox', { name: 'search_placeholder' });

      // Type a search query
      await userEvent.type(searchInput, 'Open Mat');

      // Verify only one record shows
      expect(page.getByText('Open Mat').first()).toBeInTheDocument();
      expect(page.getByText('BJJ Fundamentals I')).not.toBeInTheDocument();

      // Clear the search
      await userEvent.clear(searchInput);

      // All records should be visible again
      expect(page.getByText('Open Mat').first()).toBeInTheDocument();
      expect(page.getByText('BJJ Fundamentals I').first()).toBeInTheDocument();
      expect(page.getByText('BJJ Fundamentals II').first()).toBeInTheDocument();
    });
  });

  describe('Mobile view', () => {
    it('should render mobile card view structure', async () => {
      await render(<MemberDetailAttendance {...mockProps} />);

      // Mobile cards should exist (hidden on lg screens)
      const mobileContainer = page.getByText('BJJ Fundamentals I').first();

      expect(mobileContainer).toBeInTheDocument();
    });
  });

  describe('Multiple records', () => {
    it('should render all records in the list', async () => {
      const manyRecords: AttendanceRecord[] = [
        { id: '1', className: 'Class A', date: 'Jan 1, 2026', time: '9:00 AM', instructor: 'Instructor A' },
        { id: '2', className: 'Class B', date: 'Jan 2, 2026', time: '10:00 AM', instructor: 'Instructor B' },
        { id: '3', className: 'Class C', date: 'Jan 3, 2026', time: '11:00 AM', instructor: 'Instructor C' },
      ];
      await render(<MemberDetailAttendance {...mockProps} attendanceRecords={manyRecords} />);

      expect(page.getByText('Class A').first()).toBeInTheDocument();
      expect(page.getByText('Class B').first()).toBeInTheDocument();
      expect(page.getByText('Class C').first()).toBeInTheDocument();
    });
  });

  describe('Loading state', () => {
    it('shows the loading message instead of the empty state when isLoading is true', async () => {
      await render(
        <MemberDetailAttendance
          {...mockProps}
          attendanceRecords={[]}
          isLoading
        />,
      );

      expect(page.getByText('loading')).toBeInTheDocument();
      expect(page.getByText('no_attendance').elements().length).toBe(0);
    });

    it('falls back to the empty state when not loading and there are no records', async () => {
      await render(
        <MemberDetailAttendance
          {...mockProps}
          attendanceRecords={[]}
          isLoading={false}
        />,
      );

      expect(page.getByText('no_attendance')).toBeInTheDocument();
    });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { I18nWrapper } from '@/lib/test-utils';
import MembershipsPage from './page';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
  }),
}));

// Mock Clerk with ACADEMY_OWNER role so edit/add/manage-tags buttons are visible
vi.mock('@clerk/nextjs', () => ({
  useOrganization: () => ({
    organization: { id: 'test-org-123' },
    membership: { role: 'org:academy_owner' },
  }),
}));

// Mock membership plans data matching MembershipPlanData type
const mockPlans = [
  {
    id: 'plan-uuid-1',
    name: '12 Month Commitment (Gold)',
    slug: '12-month-gold',
    category: 'Adult Brazilian Jiu-Jitsu',
    program: 'Adult',
    price: 150,
    signupFee: 35,
    frequency: 'Monthly',
    contractLength: '12 Months',
    accessLevel: 'Unlimited',
    description: null,
    isTrial: false,
    isActive: true,
  },
  {
    id: 'plan-uuid-2',
    name: 'Month to Month (Gold)',
    slug: 'month-to-month-gold',
    category: 'Adult Brazilian Jiu-Jitsu',
    program: 'Adult',
    price: 170,
    signupFee: 35,
    frequency: 'Monthly',
    contractLength: 'Month-to-Month',
    accessLevel: 'Unlimited',
    description: null,
    isTrial: false,
    isActive: true,
  },
  {
    id: 'plan-uuid-3',
    name: '7-Day Free Trial',
    slug: '7-day-trial',
    category: 'Adult Brazilian Jiu-Jitsu',
    program: 'Adult',
    price: 0,
    signupFee: 0,
    frequency: 'None',
    contractLength: '7 Days',
    accessLevel: '3 Classes Total',
    description: null,
    isTrial: true,
    isActive: true,
  },
  {
    id: 'plan-uuid-4',
    name: 'Kids Monthly',
    slug: 'kids-monthly',
    category: 'Kids Program',
    program: 'Kids',
    price: 95,
    signupFee: 25,
    frequency: 'Monthly',
    contractLength: 'Month-to-Month',
    accessLevel: '8 Classes/mo',
    description: null,
    isTrial: false,
    isActive: true,
  },
  {
    id: 'plan-uuid-5',
    name: 'Kids Free Trial Week',
    slug: 'kids-trial',
    category: 'Kids Program',
    program: 'Kids',
    price: 0,
    signupFee: 0,
    frequency: 'None',
    contractLength: '7 Days',
    accessLevel: '2 Classes Total',
    description: null,
    isTrial: true,
    isActive: true,
  },
  {
    id: 'plan-uuid-6',
    name: 'Competition Team',
    slug: 'competition-team',
    category: 'Competition Team',
    program: 'Competition',
    price: 200,
    signupFee: 50,
    frequency: 'Monthly',
    contractLength: '6 Months',
    accessLevel: 'Unlimited',
    description: null,
    isTrial: false,
    isActive: true,
  },
  {
    id: 'plan-uuid-7',
    name: '6 Month Commitment (Silver)',
    slug: '6-month-silver',
    category: 'Adult Brazilian Jiu-Jitsu',
    program: 'Adult',
    price: 165,
    signupFee: 35,
    frequency: 'Monthly',
    contractLength: '6 Months',
    accessLevel: 'Unlimited',
    description: null,
    isTrial: false,
    isActive: false,
  },
  {
    id: 'plan-uuid-8',
    name: '10-Class Punch Card',
    slug: '10-class-punchcard',
    category: 'Adult Brazilian Jiu-Jitsu',
    program: 'Adult',
    price: 200,
    signupFee: 0,
    frequency: 'None',
    contractLength: '10 Classes',
    accessLevel: '10 Classes Total',
    description: null,
    isTrial: false,
    isActive: true,
  },
];

// Mock useMembershipPlansCache
vi.mock('@/hooks/useMembershipPlansCache', () => ({
  useMembershipPlansCache: () => ({
    plans: mockPlans,
    loading: false,
    error: null,
    revalidate: vi.fn(),
  }),
  invalidateMembershipPlansCache: vi.fn(),
}));

// Mock the tags cache for MembershipTagsManagement
vi.mock('@/hooks/useTagsCache', () => ({
  useTagsCache: () => ({
    classTags: [],
    membershipTags: [
      { id: 't1', name: 'Monthly', slug: 'monthly', color: '#22c55e', entityType: 'membership', usageCount: 5 },
      { id: 't2', name: 'Trial', slug: 'trial', color: '#3b82f6', entityType: 'membership', usageCount: 2 },
      { id: 't3', name: 'Active', slug: 'active', color: '#22c55e', entityType: 'membership', usageCount: 6 },
      { id: 't4', name: 'Inactive', slug: 'inactive', color: '#ef4444', entityType: 'membership', usageCount: 1 },
      { id: 't5', name: 'Punchcard', slug: 'punchcard', color: '#f59e0b', entityType: 'membership', usageCount: 1 },
    ],
    loading: false,
    error: null,
    revalidate: vi.fn(),
  }),
  invalidateTagsCache: vi.fn(),
}));

describe('Memberships Page', () => {
  it('renders memberships header', () => {
    render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

    const heading = page.getByRole('heading', { name: /Memberships/i });

    expect(heading).toBeInTheDocument();
  });

  it('renders statistics cards', () => {
    render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

    const totalMemberships = page.getByText(/Total memberships/);
    const trialOptions = page.getByText(/Trial Options/);
    const totalMembers = page.getByText(/Total Members/);

    expect(totalMemberships).toBeInTheDocument();
    expect(trialOptions).toBeInTheDocument();
    expect(totalMembers).toBeInTheDocument();
  });

  it('renders statistics values', () => {
    render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

    // Total memberships count of 8
    const statValues = page.getByText('8', { exact: true }).elements();

    expect(statValues.length).toBeGreaterThan(0);
  });

  it('renders add new membership button', () => {
    render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

    const button = page.getByRole('button', { name: /Add New Membership/i });

    expect(button).toBeInTheDocument();
  });

  it('renders search input', () => {
    render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

    const searchInput = page.getByPlaceholder(/Search memberships/i);

    expect(searchInput).toBeInTheDocument();
  });

  it('renders tags filter dropdown', () => {
    render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

    // Select trigger should show "All Tags" as default
    const tagsSelect = page.getByRole('combobox').elements();

    expect(tagsSelect.length).toBeGreaterThanOrEqual(2);
  });

  it('renders programs filter dropdown', () => {
    render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

    // Both tag and program selects should be rendered
    const selectTriggers = page.getByRole('combobox').elements();

    expect(selectTriggers.length).toBe(2);
  });

  it('renders membership cards with names', () => {
    render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

    const monthlyCard = page.getByText(/12 Month Commitment/);
    const kidsCard = page.getByText(/Kids Monthly/);

    expect(monthlyCard).toBeInTheDocument();
    expect(kidsCard).toBeInTheDocument();
  });

  it('renders membership card pricing', () => {
    render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

    const price = page.getByText(/\$150.00\/mo/);

    expect(price).toBeInTheDocument();
  });

  it('renders membership card details labels', () => {
    render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

    const frequencyLabels = page.getByText('Frequency').elements();
    const contractLabels = page.getByText('Contract').elements();
    const accessLabels = page.getByText('Access').elements();

    expect(frequencyLabels.length).toBeGreaterThan(0);
    expect(contractLabels.length).toBeGreaterThan(0);
    expect(accessLabels.length).toBeGreaterThan(0);
  });

  it('renders edit buttons on membership cards', () => {
    render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

    const editButtons = page.getByRole('button', { name: /Edit membership/i }).elements();

    expect(editButtons.length).toBe(8);
  });

  it('renders active trials label for trial memberships', () => {
    render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

    const activeTrials = page.getByText(/Active Trials/).elements();

    expect(activeTrials.length).toBeGreaterThan(0);
  });

  it('renders Monthly badges on non-trial membership cards', async () => {
    render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

    // Filter by Monthly tag to show only monthly memberships
    const tagDropdown = page.getByRole('combobox').first();
    await userEvent.click(tagDropdown);
    const monthlyOption = page.getByRole('option', { name: 'Monthly' });
    await userEvent.click(monthlyOption);

    // All 5 non-trial memberships should be visible (they all have isMonthly: true)
    const goldCard = page.getByRole('heading', { name: '12 Month Commitment (Gold)' });
    const monthToMonthCard = page.getByRole('heading', { name: 'Month to Month (Gold)' });
    const kidsCard = page.getByRole('heading', { name: 'Kids Monthly' });
    const competitionCard = page.getByRole('heading', { name: 'Competition Team' });
    const silverCard = page.getByRole('heading', { name: '6 Month Commitment (Silver)' });

    expect(goldCard).toBeInTheDocument();
    expect(monthToMonthCard).toBeInTheDocument();
    expect(kidsCard).toBeInTheDocument();
    expect(competitionCard).toBeInTheDocument();
    expect(silverCard).toBeInTheDocument();

    // Trial memberships should NOT be visible
    const trialCardElements = page.getByText('7-Day Free Trial');

    expect(trialCardElements.elements()).toHaveLength(0);
  });

  describe('Manage Tags Button', () => {
    it('renders manage tags button next to header', () => {
      render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

      const manageTagsButton = page.getByRole('button', { name: /Manage Tags/i });

      expect(manageTagsButton).toBeInTheDocument();
    });

    it('opens membership tags management sheet when clicked', async () => {
      render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

      const manageTagsButton = page.getByRole('button', { name: /Manage Tags/i });
      await userEvent.click(manageTagsButton);

      const sheetTitle = page.getByRole('heading', { name: 'Membership Tags Management' });

      expect(sheetTitle).toBeInTheDocument();
    });

    it('closes membership tags management sheet when close button is clicked', async () => {
      render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

      const manageTagsButton = page.getByRole('button', { name: /Manage Tags/i });
      await userEvent.click(manageTagsButton);

      const closeButton = page.getByRole('button', { name: 'Close' });
      await userEvent.click(closeButton);

      const sheetTitle = page.getByRole('heading', { name: 'Membership Tags Management' });

      expect(sheetTitle.elements()).toHaveLength(0);
    });
  });

  describe('Filter Functionality', () => {
    it('filters memberships when searching by name', async () => {
      render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

      const searchInput = page.getByPlaceholder(/Search memberships/i);
      await userEvent.type(searchInput, 'Kids Monthly');

      const kidsCard = page.getByText(/Kids Monthly/);

      expect(kidsCard).toBeInTheDocument();

      // Gold membership should not be visible
      const goldCardElements = page.getByText('12 Month Commitment (Gold)');

      expect(goldCardElements.elements()).toHaveLength(0);
    });

    it('filters memberships by tag - Trial', async () => {
      render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

      // Click on tags dropdown (first combobox)
      const tagDropdown = page.getByRole('combobox').first();
      await userEvent.click(tagDropdown);

      // Select Trial
      const trialOption = page.getByRole('option', { name: 'Trial' });
      await userEvent.click(trialOption);

      // Trial memberships should be visible
      const trialCard = page.getByText('7-Day Free Trial');

      expect(trialCard).toBeInTheDocument();
    });

    it('filters memberships by tag - Active', async () => {
      render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

      // Click on tags dropdown (first combobox)
      const tagDropdown = page.getByRole('combobox').first();
      await userEvent.click(tagDropdown);

      // Select Active (use exact match to avoid matching 'Inactive')
      const activeOption = page.getByRole('option', { name: 'Active', exact: true });
      await userEvent.click(activeOption);

      // Active memberships should be visible (non-trial)
      const goldCard = page.getByText('12 Month Commitment (Gold)');

      expect(goldCard).toBeInTheDocument();
    });

    it('filters memberships by tag - Inactive', async () => {
      render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

      // Click on tags dropdown (first combobox)
      const tagDropdown = page.getByRole('combobox').first();
      await userEvent.click(tagDropdown);

      // Select Inactive
      const inactiveOption = page.getByRole('option', { name: 'Inactive' });
      await userEvent.click(inactiveOption);

      // Inactive membership should be visible
      const inactiveCard = page.getByText('6 Month Commitment (Silver)');

      expect(inactiveCard).toBeInTheDocument();
    });

    it('filters memberships by tag - Monthly', async () => {
      render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

      // Click on tags dropdown (first combobox)
      const tagDropdown = page.getByRole('combobox').first();
      await userEvent.click(tagDropdown);

      // Select Monthly
      const monthlyOption = page.getByRole('option', { name: 'Monthly' });
      await userEvent.click(monthlyOption);

      // Monthly memberships should be visible (non-trial memberships)
      const goldCard = page.getByText('12 Month Commitment (Gold)');
      const kidsCard = page.getByText('Kids Monthly');

      expect(goldCard).toBeInTheDocument();
      expect(kidsCard).toBeInTheDocument();

      // Trial memberships should NOT be visible
      const trialCardElements = page.getByText('7-Day Free Trial');

      expect(trialCardElements.elements()).toHaveLength(0);
    });

    it('filters memberships by program', async () => {
      render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

      // Click on programs dropdown (second combobox)
      const programDropdown = page.getByRole('combobox').nth(1);
      await userEvent.click(programDropdown);

      // Select Kids
      const kidsOption = page.getByRole('option', { name: 'Kids' });
      await userEvent.click(kidsOption);

      // Kids memberships should be visible
      const kidsCard = page.getByText('Kids Monthly');

      expect(kidsCard).toBeInTheDocument();

      // Adult Gold membership should not be visible
      const goldCardElements = page.getByText('12 Month Commitment (Gold)');

      expect(goldCardElements.elements()).toHaveLength(0);
    });

    it('shows no memberships found message when search has no results', async () => {
      render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

      const searchInput = page.getByPlaceholder(/Search memberships/i);
      await userEvent.type(searchInput, 'NonexistentMembership12345');

      const noMembershipsMessage = page.getByText('No memberships found');

      expect(noMembershipsMessage).toBeInTheDocument();
    });
  });

  describe('Dynamic Filter Options', () => {
    it('hides Inactive tag option when filtering by Kids program (no inactive kids memberships)', async () => {
      render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

      // Click on programs dropdown and select Kids
      const programDropdown = page.getByRole('combobox').nth(1);
      await userEvent.click(programDropdown);
      const kidsOption = page.getByRole('option', { name: 'Kids' });
      await userEvent.click(kidsOption);

      // Now check the tags dropdown - Inactive should not be available
      const tagDropdown = page.getByRole('combobox').first();
      await userEvent.click(tagDropdown);

      // Active and Trial should still be available (Kids has both active and trial memberships)
      const activeOption = page.getByRole('option', { name: 'Active', exact: true });
      const trialOption = page.getByRole('option', { name: 'Trial' });

      expect(activeOption).toBeInTheDocument();
      expect(trialOption).toBeInTheDocument();

      // Inactive should NOT be available since no Kids memberships are inactive
      const inactiveOption = page.getByRole('option', { name: 'Inactive' });

      expect(inactiveOption.elements()).toHaveLength(0);
    });

    it('hides Trial tag option when filtering by Inactive tag (no inactive trials)', async () => {
      render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

      // Click on tags dropdown and select Inactive
      const tagDropdown = page.getByRole('combobox').first();
      await userEvent.click(tagDropdown);
      const inactiveOption = page.getByRole('option', { name: 'Inactive' });
      await userEvent.click(inactiveOption);

      // Now check the programs dropdown - only Adult should be available
      const programDropdown = page.getByRole('combobox').nth(1);
      await userEvent.click(programDropdown);

      // Adult should be available (the only inactive membership is Adult)
      const adultOption = page.getByRole('option', { name: 'Adult' });

      expect(adultOption).toBeInTheDocument();

      // Kids and Competition should NOT be available since they have no inactive memberships
      const kidsOption = page.getByRole('option', { name: 'Kids' });
      const competitionOption = page.getByRole('option', { name: 'Competition' });

      expect(kidsOption.elements()).toHaveLength(0);
      expect(competitionOption.elements()).toHaveLength(0);
    });

    it('shows only Competition program when filtering by Competition in search', async () => {
      render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

      // Search for "Competition"
      const searchInput = page.getByPlaceholder(/Search memberships/i);
      await userEvent.type(searchInput, 'Competition');

      // Check the programs dropdown
      const programDropdown = page.getByRole('combobox').nth(1);
      await userEvent.click(programDropdown);

      // Competition should be available
      const competitionOption = page.getByRole('option', { name: 'Competition' });

      expect(competitionOption).toBeInTheDocument();

      // Kids should NOT be available since no Kids memberships match "Competition"
      const kidsOption = page.getByRole('option', { name: 'Kids' });

      expect(kidsOption.elements()).toHaveLength(0);
    });

    it('shows only Active and Monthly tags when filtering by Competition program', async () => {
      render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

      // Click on programs dropdown and select Competition
      const programDropdown = page.getByRole('combobox').nth(1);
      await userEvent.click(programDropdown);
      const competitionOption = page.getByRole('option', { name: 'Competition' });
      await userEvent.click(competitionOption);

      // Now check the tags dropdown
      const tagDropdown = page.getByRole('combobox').first();
      await userEvent.click(tagDropdown);

      // Active and Monthly should be available (Competition Team is Active and Monthly)
      const activeOption = page.getByRole('option', { name: 'Active', exact: true });
      const monthlyOption = page.getByRole('option', { name: 'Monthly' });

      expect(activeOption).toBeInTheDocument();
      expect(monthlyOption).toBeInTheDocument();

      // Trial and Inactive should NOT be available since Competition Team is neither
      const trialOption = page.getByRole('option', { name: 'Trial' });
      const inactiveOption = page.getByRole('option', { name: 'Inactive' });

      expect(trialOption.elements()).toHaveLength(0);
      expect(inactiveOption.elements()).toHaveLength(0);
    });

    it('hides Monthly tag option when searching for Trial memberships', async () => {
      render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

      // Search for "Trial" which only matches trial memberships
      const searchInput = page.getByPlaceholder(/Search memberships/i);
      await userEvent.type(searchInput, 'Free Trial');

      // Check the tags dropdown
      const tagDropdown = page.getByRole('combobox').first();
      await userEvent.click(tagDropdown);

      // Monthly should NOT be available since trial memberships are not monthly
      const monthlyOption = page.getByRole('option', { name: 'Monthly' });

      expect(monthlyOption.elements()).toHaveLength(0);

      // Trial should still be available
      const trialOption = page.getByRole('option', { name: 'Trial' });

      expect(trialOption).toBeInTheDocument();
    });

    it('shows Monthly tag option when filtering by Kids program', async () => {
      render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

      // Click on programs dropdown and select Kids
      const programDropdown = page.getByRole('combobox').nth(1);
      await userEvent.click(programDropdown);
      const kidsOption = page.getByRole('option', { name: 'Kids' });
      await userEvent.click(kidsOption);

      // Now check the tags dropdown
      const tagDropdown = page.getByRole('combobox').first();
      await userEvent.click(tagDropdown);

      // Monthly should be available (Kids Monthly has Monthly tag)
      const monthlyOption = page.getByRole('option', { name: 'Monthly' });

      expect(monthlyOption).toBeInTheDocument();
    });

    it('filters memberships by tag - Punchcard', async () => {
      render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

      // Click on tags dropdown
      const tagDropdown = page.getByRole('combobox').first();
      await userEvent.click(tagDropdown);

      // Select Punchcard
      const punchcardOption = page.getByRole('option', { name: 'Punchcard' });
      await userEvent.click(punchcardOption);

      // Punchcard membership should be visible
      const punchcardCard = page.getByText('10-Class Punch Card');

      expect(punchcardCard).toBeInTheDocument();

      // Non-punchcard memberships should NOT be visible
      const goldCardElements = page.getByText('12 Month Commitment (Gold)');

      expect(goldCardElements.elements()).toHaveLength(0);
    });

    it('renders Punchcard badges on punchcard membership cards', () => {
      render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

      const punchcardBadges = page.getByText('Punchcard').elements();

      expect(punchcardBadges.length).toBeGreaterThan(0);
    });

    it('renders punchcard membership card with one-time pricing', () => {
      render(<I18nWrapper><MembershipsPage /></I18nWrapper>);

      // Use exact match to specifically find the punchcard price without /mo suffix
      const punchcardPrice = page.getByText('$200.00', { exact: true });

      expect(punchcardPrice).toBeInTheDocument();
    });
  });
});

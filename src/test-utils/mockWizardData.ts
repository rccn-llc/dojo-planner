import type { AddClassWizardData, ScheduleInstance } from '@/hooks/useAddClassWizard';

/**
 * Creates a complete mock AddClassWizardData object with all required fields.
 * Use this helper to avoid TypeScript errors when the wizard data type changes.
 */
export function createMockWizardData(overrides?: Partial<AddClassWizardData>): AddClassWizardData {
  return {
    itemType: 'class',
    className: '',
    program: '',
    programName: '',
    maximumCapacity: null,
    minimumAge: null,
    allowWalkIns: 'Yes',
    description: '',
    eventName: '',
    eventType: '',
    eventProgram: '',
    eventMaxCapacity: null,
    eventDescription: '',
    schedule: {
      instances: [],
      exceptions: [],
      location: '',
    },
    calendarColor: '#000000',
    eventSchedule: {
      isMultiDay: false,
      startDate: '',
      endDate: '',
      sessions: [],
      location: '',
    },
    eventBilling: {
      hasFee: false,
      price: null,
      hasEarlyBird: false,
      earlyBirdPrice: null,
      earlyBirdDeadline: null,
      hasMemberDiscount: false,
      memberDiscountType: 'percentage',
      memberDiscountAmount: null,
    },
    tags: [],
    ...overrides,
  };
}

/**
 * Creates a mock schedule instance for testing
 */
export function createMockScheduleInstance(overrides?: Partial<ScheduleInstance>): ScheduleInstance {
  return {
    id: `instance-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    dayOfWeek: 'Monday',
    timeHour: 6,
    timeMinute: 0,
    timeAmPm: 'PM',
    durationHours: 1,
    durationMinutes: 0,
    staffMember: 'collin-grayson',
    assistantStaff: '',
    ...overrides,
  };
}

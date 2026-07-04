import { useState } from 'react';

export type ItemType = 'class' | 'event';
type AllowWalkIns = 'Yes' | 'No';
export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
export type EventType = 'Seminar' | 'Workshop' | 'Guest Instructor' | 'Tournament' | 'Other';

export type ScheduleInstance = {
  id: string;
  dayOfWeek: DayOfWeek;
  timeHour: number;
  timeMinute: number;
  timeAmPm: 'AM' | 'PM';
  durationHours: number;
  durationMinutes: number;
  staffMember: string;
  assistantStaff: string;
};

/**
 * Represents an exception to a regular schedule instance.
 * Can be used to:
 * 1. Delete a specific occurrence (type: 'deleted')
 * 2. Modify a specific occurrence (type: 'modified')
 * 3. Modify all future occurrences from a date (type: 'modified-forward')
 */
export type ScheduleException = {
  id: string;
  /** The ID of the parent schedule instance this exception applies to */
  scheduleInstanceId: string;
  /** The specific date this exception applies to (ISO date string YYYY-MM-DD) */
  date: string;
  /** Type of exception */
  type: 'deleted' | 'modified' | 'modified-forward';
  /** For 'modified' and 'modified-forward' types, the override values */
  overrides?: {
    timeHour?: number;
    timeMinute?: number;
    timeAmPm?: 'AM' | 'PM';
    durationHours?: number;
    durationMinutes?: number;
    staffMember?: string;
    assistantStaff?: string;
  };
  /** When type is 'modified-forward', this indicates changes apply from this date onwards */
  effectiveFromDate?: string;
  /** Human-readable note about the exception */
  note?: string;
  /** Timestamp when the exception was created */
  createdAt: string;
};

export type ClassSchedule = {
  instances: ScheduleInstance[];
  exceptions: ScheduleException[];
  location: string;
};

export type EventSession = {
  id: string;
  date: string; // YYYY-MM-DD format
  timeHour: number;
  timeMinute: number;
  timeAmPm: 'AM' | 'PM';
  durationHours: number;
  durationMinutes: number;
  staffMember: string;
  assistantStaff: string;
};

export type EventSchedule = {
  isMultiDay: boolean;
  startDate: string; // YYYY-MM-DD format
  endDate: string; // YYYY-MM-DD format
  sessions: EventSession[];
  location: string;
};

export type EventBilling = {
  hasFee: boolean;
  price: number | null;
  hasEarlyBird: boolean;
  earlyBirdPrice: number | null;
  earlyBirdDeadline: string | null; // YYYY-MM-DD format
  hasMemberDiscount: boolean;
  memberDiscountType: 'percentage' | 'fixed';
  memberDiscountAmount: number | null;
};

export type AddClassWizardData = {
  // Step 0: Item Type Selection
  itemType: ItemType;

  // Step 1: Class Basics (for classes)
  className: string;
  program: string; // real program.id (FK) of the selected program
  programName: string; // display name of the selected program
  maximumCapacity: number | null;
  minimumAge: number | null;
  allowWalkIns: AllowWalkIns;
  description: string;

  // Step 1: Event Basics (for events)
  eventName: string;
  eventType: EventType | '';
  eventProgram: string;
  eventMaxCapacity: number | null;
  eventDescription: string;

  // Step 2: Schedule Details (for classes)
  schedule: ClassSchedule;
  calendarColor: string;

  // Step 2: Event Schedule (for events - non-recurring)
  eventSchedule: EventSchedule;

  // Step 3: Event Billing (for events only)
  eventBilling: EventBilling;

  // Step 3/4: Tags
  tags: string[];
};

type WizardStep
  = | 'type-selection'
    | 'class-basics'
    | 'event-basics'
    | 'schedule'
    | 'event-schedule'
    | 'event-billing'
    | 'tags'
    | 'success';

const initialSchedule: ClassSchedule = {
  instances: [],
  exceptions: [],
  location: '',
};

const initialEventSchedule: EventSchedule = {
  isMultiDay: false,
  startDate: '',
  endDate: '',
  sessions: [],
  location: '',
};

const initialEventBilling: EventBilling = {
  hasFee: false,
  price: null,
  hasEarlyBird: false,
  earlyBirdPrice: null,
  earlyBirdDeadline: null,
  hasMemberDiscount: false,
  memberDiscountType: 'percentage',
  memberDiscountAmount: null,
};

const initialData: AddClassWizardData = {
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
  schedule: initialSchedule,
  calendarColor: '#000000',
  eventSchedule: initialEventSchedule,
  eventBilling: initialEventBilling,
  tags: [],
};

export const useAddClassWizard = () => {
  const [step, setStep] = useState<WizardStep>('type-selection');
  const [data, setData] = useState<AddClassWizardData>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const updateData = (updates: Partial<AddClassWizardData>) => {
    setData((prev) => {
      const newData = { ...prev, ...updates };
      return newData;
    });
    setError(null);
  };

  const updateSchedule = (updates: Partial<ClassSchedule>) => {
    setData(prev => ({
      ...prev,
      schedule: { ...prev.schedule, ...updates },
    }));
    setError(null);
  };

  const updateEventSchedule = (updates: Partial<EventSchedule>) => {
    setData(prev => ({
      ...prev,
      eventSchedule: { ...prev.eventSchedule, ...updates },
    }));
    setError(null);
  };

  const updateEventBilling = (updates: Partial<EventBilling>) => {
    setData(prev => ({
      ...prev,
      eventBilling: { ...prev.eventBilling, ...updates },
    }));
    setError(null);
  };

  // Define step sequences for classes and events
  const getStepSequence = (): WizardStep[] => {
    if (data.itemType === 'event') {
      return ['type-selection', 'event-basics', 'event-schedule', 'event-billing', 'tags', 'success'];
    }
    return ['type-selection', 'class-basics', 'schedule', 'tags', 'success'];
  };

  const nextStep = () => {
    const steps = getStepSequence();
    const currentIndex = steps.indexOf(step);
    if (currentIndex < steps.length - 1 && currentIndex !== -1) {
      const nextStepValue = steps[currentIndex + 1];
      if (nextStepValue) {
        setStep(nextStepValue);
        setError(null);
      }
    }
  };

  const previousStep = () => {
    const steps = getStepSequence();
    const currentIndex = steps.indexOf(step);
    if (currentIndex > 0) {
      const prevStepValue = steps[currentIndex - 1];
      if (prevStepValue) {
        setStep(prevStepValue);
        setError(null);
      }
    }
  };

  const setErrorMessage = (message: string) => {
    setError(message);
  };

  const clearError = () => {
    setError(null);
  };

  const reset = () => {
    setStep('type-selection');
    setData(initialData);
    setError(null);
    setIsLoading(false);
  };

  return {
    step,
    setStep,
    data,
    updateData,
    updateSchedule,
    updateEventSchedule,
    updateEventBilling,
    nextStep,
    previousStep,
    reset,
    error,
    setError: setErrorMessage,
    clearError,
    isLoading,
    setIsLoading,
  };
};

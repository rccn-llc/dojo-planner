import type { ConvertMemberWizardData } from '@/hooks/useConvertMemberWizard';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { I18nWrapper } from '@/lib/test-utils';
import { ConvertSuccessStep } from './ConvertSuccessStep';

const baseData: ConvertMemberWizardData = {
  memberId: 'member-123',
  memberName: 'John Doe',
  memberEmail: 'john@test.com',
  currentMemberType: 'head-of-household',
  conversionType: 'hoh-to-individual',
  targetMemberType: 'individual',
  hasMembership: true,
  hasPaymentMethod: true,
  // WizardStepData fields:
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@test.com',
  membershipPlanId: null,
  waiverTemplateId: null,
};

describe('ConvertSuccessStep', () => {
  it('should render success title', async () => {
    await render(
      <I18nWrapper>
        <ConvertSuccessStep data={baseData} onDone={vi.fn()} />
      </I18nWrapper>,
    );

    await expect.element(page.getByText('Conversion Complete')).toBeInTheDocument();
  });

  it('should render member name in description', async () => {
    await render(
      <I18nWrapper>
        <ConvertSuccessStep data={baseData} onDone={vi.fn()} />
      </I18nWrapper>,
    );

    await expect.element(page.getByText(/John Doe/)).toBeInTheDocument();
  });

  it('should show membership plan info when present', async () => {
    const data = { ...baseData, membershipPlanName: 'Monthly BJJ' };

    await render(
      <I18nWrapper>
        <ConvertSuccessStep data={data} onDone={vi.fn()} />
      </I18nWrapper>,
    );

    await expect.element(page.getByText(/Monthly BJJ/)).toBeInTheDocument();
  });

  it('should call onDone when done button is clicked', async () => {
    const onDone = vi.fn();

    await render(
      <I18nWrapper>
        <ConvertSuccessStep data={baseData} onDone={onDone} />
      </I18nWrapper>,
    );

    await page.getByRole('button', { name: 'Done' }).click();

    expect(onDone).toHaveBeenCalled();
  });
});

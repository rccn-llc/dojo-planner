import type { ConvertMemberWizardData } from '@/hooks/useConvertMemberWizard';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { I18nWrapper } from '@/lib/test-utils';
import { ConvertConfirmStep } from './ConvertConfirmStep';

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

describe('ConvertConfirmStep', () => {
  it('should render title and member name', async () => {
    await render(
      <I18nWrapper>
        <ConvertConfirmStep data={baseData} onNext={vi.fn()} onCancel={vi.fn()} />
      </I18nWrapper>,
    );

    await expect.element(page.getByText('Convert Member Type')).toBeInTheDocument();
    await expect.element(page.getByText(/John Doe/)).toBeInTheDocument();
  });

  it('should show current and target type badges', async () => {
    await render(
      <I18nWrapper>
        <ConvertConfirmStep data={baseData} onNext={vi.fn()} onCancel={vi.fn()} />
      </I18nWrapper>,
    );

    await expect.element(page.getByText('Head of Household').first()).toBeInTheDocument();
    await expect.element(page.getByText('Individual').first()).toBeInTheDocument();
  });

  it('should show hoh-to-individual description', async () => {
    await render(
      <I18nWrapper>
        <ConvertConfirmStep data={baseData} onNext={vi.fn()} onCancel={vi.fn()} />
      </I18nWrapper>,
    );

    await expect.element(
      page.getByText(/converted from Head of Household to Individual/),
    ).toBeInTheDocument();
  });

  it('should show needs membership notice when hasMembership is false', async () => {
    const data = { ...baseData, hasMembership: false };

    await render(
      <I18nWrapper>
        <ConvertConfirmStep data={data} onNext={vi.fn()} onCancel={vi.fn()} />
      </I18nWrapper>,
    );

    await expect.element(
      page.getByText(/membership plan must be selected/),
    ).toBeInTheDocument();
  });

  it('should show needs payment notice when hasPaymentMethod is false', async () => {
    const data = { ...baseData, hasPaymentMethod: false };

    await render(
      <I18nWrapper>
        <ConvertConfirmStep data={data} onNext={vi.fn()} onCancel={vi.fn()} />
      </I18nWrapper>,
    );

    await expect.element(
      page.getByText(/payment method must be provided/),
    ).toBeInTheDocument();
  });

  it('should show family-to-individual description with HOH name', async () => {
    const data: ConvertMemberWizardData = {
      ...baseData,
      currentMemberType: 'family-member',
      conversionType: 'family-to-individual',
      targetMemberType: 'individual',
      currentHOHName: 'Jane Doe',
    };

    await render(
      <I18nWrapper>
        <ConvertConfirmStep data={data} onNext={vi.fn()} onCancel={vi.fn()} />
      </I18nWrapper>,
    );

    await expect.element(page.getByText(/Jane Doe/)).toBeInTheDocument();
  });

  it('should show family needs membership and payment notice', async () => {
    const data: ConvertMemberWizardData = {
      ...baseData,
      currentMemberType: 'family-member',
      conversionType: 'family-to-individual',
      targetMemberType: 'individual',
    };

    await render(
      <I18nWrapper>
        <ConvertConfirmStep data={data} onNext={vi.fn()} onCancel={vi.fn()} />
      </I18nWrapper>,
    );

    await expect.element(
      page.getByText(/own membership plan and payment method/),
    ).toBeInTheDocument();
  });

  it('should show individual-to-hoh description', async () => {
    const data: ConvertMemberWizardData = {
      ...baseData,
      currentMemberType: 'individual',
      conversionType: 'individual-to-hoh',
      targetMemberType: 'head-of-household',
    };

    await render(
      <I18nWrapper>
        <ConvertConfirmStep data={data} onNext={vi.fn()} onCancel={vi.fn()} />
      </I18nWrapper>,
    );

    await expect.element(
      page.getByText(/converted from Individual to Head of Household/),
    ).toBeInTheDocument();
  });

  it('should call onNext when continue button is clicked', async () => {
    const onNext = vi.fn();

    await render(
      <I18nWrapper>
        <ConvertConfirmStep data={baseData} onNext={onNext} onCancel={vi.fn()} />
      </I18nWrapper>,
    );

    await page.getByRole('button', { name: 'Continue' }).click();

    expect(onNext).toHaveBeenCalled();
  });

  it('should call onCancel when cancel button is clicked', async () => {
    const onCancel = vi.fn();

    await render(
      <I18nWrapper>
        <ConvertConfirmStep data={baseData} onNext={vi.fn()} onCancel={onCancel} />
      </I18nWrapper>,
    );

    await page.getByRole('button', { name: 'Cancel' }).click();

    expect(onCancel).toHaveBeenCalled();
  });
});

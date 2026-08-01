import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { PaymentSettingsForm } from './PaymentSettingsForm';

describe('PaymentSettingsForm', () => {
  const mockOnSave = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the three IQPro credential fields', async () => {
    await render(
      <PaymentSettingsForm
        title="IQPro Merchant Credentials"
        description="desc"
        initial={{ clientId: 'env-cid', gatewayId: 'env-gid', hasSecret: true, source: 'env' }}
        loading={false}
        saving={false}
        errorMessage={null}
        successMessage={null}
        onSave={mockOnSave}
      />,
    );

    expect(page.getByLabelText(/Client ID/i)).toBeDefined();
    expect(page.getByLabelText(/Client Secret/i)).toBeDefined();
    expect(page.getByLabelText(/Gateway ID/i)).toBeDefined();
  });

  it('shows a "Secret configured" badge when hasSecret is true', async () => {
    await render(
      <PaymentSettingsForm
        title="t"
        description="d"
        initial={{ clientId: 'cid', gatewayId: 'gid', hasSecret: true, source: 'org' }}
        loading={false}
        saving={false}
        errorMessage={null}
        successMessage={null}
        onSave={mockOnSave}
      />,
    );

    expect(page.getByText(/Secret configured/i)).toBeDefined();
  });

  it('pre-fills clientId and gatewayId but NOT the secret', async () => {
    await render(
      <PaymentSettingsForm
        title="t"
        description="d"
        initial={{ clientId: 'pre-cid', gatewayId: 'pre-gid', hasSecret: true, source: 'org' }}
        loading={false}
        saving={false}
        errorMessage={null}
        successMessage={null}
        onSave={mockOnSave}
      />,
    );

    expect(page.getByLabelText(/Client ID/i).element()).toHaveProperty('value', 'pre-cid');
    expect(page.getByLabelText(/Gateway ID/i).element()).toHaveProperty('value', 'pre-gid');
    expect(page.getByLabelText(/Client Secret/i).element()).toHaveProperty('value', '');
  });

  it('submitting without filling clientSecret omits it from the payload (means "keep")', async () => {
    await render(
      <PaymentSettingsForm
        title="t"
        description="d"
        initial={{ clientId: 'pre-cid', gatewayId: 'pre-gid', hasSecret: true, source: 'org' }}
        loading={false}
        saving={false}
        errorMessage={null}
        successMessage={null}
        onSave={mockOnSave}
      />,
    );

    await userEvent.click(page.getByRole('button', { name: /^Save$/i }));

    expect(mockOnSave).toHaveBeenCalledWith({
      clientId: 'pre-cid',
      gatewayId: 'pre-gid',
    });

    const args = mockOnSave.mock.calls[0]![0] as Record<string, unknown>;

    expect(args).not.toHaveProperty('clientSecret');
  });

  it('submitting with a clientSecret includes it in the payload', async () => {
    await render(
      <PaymentSettingsForm
        title="t"
        description="d"
        initial={{ clientId: 'cid', gatewayId: 'gid', hasSecret: false, source: 'env' }}
        loading={false}
        saving={false}
        errorMessage={null}
        successMessage={null}
        onSave={mockOnSave}
      />,
    );

    const secretInput = page.getByLabelText(/Client Secret/i);
    await userEvent.type(secretInput, 'new-secret-shhh');
    await userEvent.click(page.getByRole('button', { name: /^Save$/i }));

    expect(mockOnSave).toHaveBeenCalledWith({
      clientId: 'cid',
      gatewayId: 'gid',
      clientSecret: 'new-secret-shhh',
    });
  });

  it('displays the error message when provided', async () => {
    await render(
      <PaymentSettingsForm
        title="t"
        description="d"
        initial={null}
        loading={false}
        saving={false}
        errorMessage="Encryption key missing"
        successMessage={null}
        onSave={mockOnSave}
      />,
    );

    expect(page.getByText(/Encryption key missing/i)).toBeDefined();
  });

  it('disables submit while saving', async () => {
    await render(
      <PaymentSettingsForm
        title="t"
        description="d"
        initial={{ clientId: 'cid', gatewayId: 'gid', hasSecret: true, source: 'org' }}
        loading={false}
        saving={true}
        errorMessage={null}
        successMessage={null}
        onSave={mockOnSave}
      />,
    );

    expect(page.getByRole('button', { name: /Saving/i }).element()).toHaveProperty('disabled', true);
  });
});

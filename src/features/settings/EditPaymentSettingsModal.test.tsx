import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { EditPaymentSettingsModal } from './EditPaymentSettingsModal';

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  clientId: 'client-abc-123',
  gatewayId: 'gateway-xyz-789',
  hasSecret: true,
  onSave: vi.fn(),
};

describe('EditPaymentSettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the modal title', () => {
    render(<EditPaymentSettingsModal {...defaultProps} />);

    expect(page.getByText('Edit IQPro Credentials')).toBeDefined();
  });

  it('should display initial values in form fields', () => {
    render(<EditPaymentSettingsModal {...defaultProps} />);

    const clientIdInput = page.getByPlaceholder('e.g. abc123-...');
    const gatewayIdInput = page.getByPlaceholder('IQPro merchant gateway identifier');

    expect(clientIdInput.element()).toHaveProperty('value', 'client-abc-123');
    expect(gatewayIdInput.element()).toHaveProperty('value', 'gateway-xyz-789');
  });

  it('should not render when isOpen is false', () => {
    render(<EditPaymentSettingsModal {...defaultProps} isOpen={false} />);

    expect(page.getByText('Edit IQPro Credentials').elements()).toHaveLength(0);
  });

  it('should call onClose when cancel button is clicked', async () => {
    const onClose = vi.fn();
    render(<EditPaymentSettingsModal {...defaultProps} onClose={onClose} />);

    await userEvent.click(page.getByRole('button', { name: /cancel/i }).element());

    expect(onClose).toHaveBeenCalled();
  });

  it('should keep save enabled and omit clientSecret when secret already exists', async () => {
    const onSave = vi.fn();
    render(<EditPaymentSettingsModal {...defaultProps} onSave={onSave} />);

    const saveButton = page.getByRole('button', { name: /^save$/i });

    expect(saveButton.element()).not.toBeDisabled();

    await userEvent.click(saveButton.element());

    await vi.waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        clientId: 'client-abc-123',
        gatewayId: 'gateway-xyz-789',
      });
    });
  });

  it('should include clientSecret when one is entered', async () => {
    const onSave = vi.fn();
    render(<EditPaymentSettingsModal {...defaultProps} onSave={onSave} />);

    const secretInput = page.getByPlaceholder('••••••••  Leave blank to keep current secret');
    await userEvent.type(secretInput.element(), 'new-secret-value');

    await userEvent.click(page.getByRole('button', { name: /^save$/i }).element());

    await vi.waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        clientId: 'client-abc-123',
        gatewayId: 'gateway-xyz-789',
        clientSecret: 'new-secret-value',
      });
    });
  });

  it('should require a secret when none has ever been saved', () => {
    render(<EditPaymentSettingsModal {...defaultProps} hasSecret={false} />);

    // No saved secret and none entered → form invalid, save disabled.
    expect(page.getByRole('button', { name: /^save$/i }).element()).toBeDisabled();
  });

  it('should populate fields from props supplied after mount when opened', async () => {
    // Reproduces the payment-settings bug: the modal first mounts while the
    // config is still loading (closed, empty props), then the parent flips
    // isOpen to true once real data has arrived. The programmatic open does not
    // fire Radix's onOpenChange, so the sync must come from the open-transition
    // re-seed during render.
    const { rerender } = await render(
      <EditPaymentSettingsModal
        {...defaultProps}
        isOpen={false}
        clientId=""
        gatewayId=""
        hasSecret={false}
      />,
    );

    await rerender(
      <EditPaymentSettingsModal
        {...defaultProps}
        isOpen
        clientId="client-abc-123"
        gatewayId="gateway-xyz-789"
        hasSecret
      />,
    );

    await vi.waitFor(() => {
      const clientIdInput = page.getByPlaceholder('e.g. abc123-...');
      const gatewayIdInput = page.getByPlaceholder('IQPro merchant gateway identifier');

      expect(clientIdInput.element()).toHaveProperty('value', 'client-abc-123');
      expect(gatewayIdInput.element()).toHaveProperty('value', 'gateway-xyz-789');
    });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { PreferencesPage } from './PreferencesPage';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      title: 'Preferences',
      notifications_tab: 'Notifications',
      appearance_tab: 'Appearance',
      billing_tab: 'Billing',
      data_export_tab: 'Data Export',
      email_notifications_title: 'Email Notifications',
      communication_emails_label: 'Communication Emails',
      communication_emails_description: 'Receive an email when a member messages you.',
      member_change_emails_label: 'Member Change Emails',
      member_change_emails_description: 'Receive an email whenever a new member is added.',
      financial_transaction_emails_label: 'Financial Transaction Emails',
      financial_transaction_emails_description: 'Receive an email when financial transactions are logged.',
      announcements_label: 'Announcements & Updates',
      announcements_description: 'Receive the latest news and special offers from Dojo Planner',
      text_notifications_title: 'Text Notifications',
      communication_texts_label: 'Communication Texts',
      communication_texts_description: 'Receive a text when a member messages you.',
      member_change_texts_label: 'Member Change Texts',
      member_change_texts_description: 'Receive a text whenever a new member is added.',
      financial_transaction_texts_label: 'Financial Transaction Texts',
      financial_transaction_texts_description: 'Receive a text when financial transactions are logged.',
      danger_zone_title: 'Turn off all notifications',
      danger_zone_warning: 'Warning: you may miss important information.',
      appearance_coming_soon: 'Coming Soon',
      appearance_description: 'Appearance settings will be available soon.',
      billing_coming_soon: 'Coming Soon',
      billing_description: 'Billing settings will be available soon.',
      data_export_coming_soon: 'Coming Soon',
      data_export_description: 'Data export settings will be available soon.',
    };
    return translations[key] || key;
  },
}));

describe('PreferencesPage', () => {
  it('should render the page title', async () => {
    await render(<PreferencesPage />);

    expect(page.getByText('Preferences')).toBeDefined();
  });

  it('should render all tab buttons', async () => {
    await render(<PreferencesPage />);

    expect(page.getByRole('button', { name: /notifications/i })).toBeDefined();
    expect(page.getByRole('button', { name: /appearance/i })).toBeDefined();
    expect(page.getByRole('button', { name: /billing/i })).toBeDefined();
    expect(page.getByRole('button', { name: /data export/i })).toBeDefined();
  });

  it('should render notifications tab content by default', async () => {
    await render(<PreferencesPage />);

    expect(page.getByText('Email Notifications')).toBeDefined();
    expect(page.getByText('Communication Emails')).toBeDefined();
  });

  it('should render notification preference options', async () => {
    await render(<PreferencesPage />);

    expect(page.getByText('Communication Emails')).toBeDefined();
    expect(page.getByText('Member Change Emails')).toBeDefined();
    expect(page.getByText('Financial Transaction Emails')).toBeDefined();
    expect(page.getByText('Announcements & Updates')).toBeDefined();
  });

  it('should render text notification options', async () => {
    await render(<PreferencesPage />);

    expect(page.getByText('Communication Texts')).toBeDefined();
    expect(page.getByText('Member Change Texts')).toBeDefined();
    expect(page.getByText('Financial Transaction Texts')).toBeDefined();
  });

  it('should render danger zone section', async () => {
    await render(<PreferencesPage />);

    expect(page.getByText('Turn off all notifications')).toBeDefined();
  });
});

import { useTranslations } from 'next-intl';

export type ReportType
  = 'accounts-autopay-suspended'
    | 'expiring-credit-cards'
    | 'amount-due'
    | 'past-due'
    | 'payments-last-30-days'
    | 'payments-pending'
    | 'failed-payments'
    | 'income-per-student';

export function formatCurrency(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Helper function to get translated title - uses explicit keys for i18n detection
export function useReportTitle(reportId: ReportType): string {
  const t = useTranslations('ReportsPage');
  switch (reportId) {
    case 'accounts-autopay-suspended':
      return t('report_accounts_autopay_suspended');
    case 'expiring-credit-cards':
      return t('report_expiring_credit_cards');
    case 'amount-due':
      return t('report_amount_due');
    case 'past-due':
      return t('report_past_due');
    case 'payments-last-30-days':
      return t('report_payments_last_30_days');
    case 'payments-pending':
      return t('report_payments_pending');
    case 'failed-payments':
      return t('report_failed_payments');
    case 'income-per-student':
      return t('report_income_per_student');
  }
}

// Helper function to get translated description - uses explicit keys for i18n detection
export function useReportDescription(reportId: ReportType): string {
  const t = useTranslations('ReportsPage');
  switch (reportId) {
    case 'accounts-autopay-suspended':
      return t('report_accounts_autopay_suspended_description');
    case 'expiring-credit-cards':
      return t('report_expiring_credit_cards_description');
    case 'amount-due':
      return t('report_amount_due_description');
    case 'past-due':
      return t('report_past_due_description');
    case 'payments-last-30-days':
      return t('report_payments_last_30_days_description');
    case 'payments-pending':
      return t('report_payments_pending_description');
    case 'failed-payments':
      return t('report_failed_payments_description');
    case 'income-per-student':
      return t('report_income_per_student_description');
  }
}

import { z } from 'zod';

export const TransactionListValidation = z.object({
  limit: z.number().min(1).max(500).optional(),
  offset: z.number().min(0).optional(),
  status: z.enum(['pending', 'paid', 'declined', 'refunded', 'processing']).optional(),
  transactionType: z.enum(['membership_payment', 'event_registration', 'signup_fee', 'refund', 'adjustment']).optional(),
}).optional();

export const GetTransactionValidation = z.object({
  id: z.string().uuid(),
});

export const ReportTypeValidation = z.object({
  reportType: z.enum([
    'accounts-autopay-suspended',
    'expiring-credit-cards',
    'amount-due',
    'past-due',
    'payments-last-30-days',
    'payments-pending',
    'failed-payments',
    'income-per-student',
  ]),
});

import { describe, expect, it } from 'vitest';
import { redactBodyForLog, REDACTED, redactForLog } from './LogRedaction';

describe('redactForLog', () => {
  it('removes IQPro payment credentials and personal data, keeping ids and amounts', () => {
    const body = {
      type: 'Sale',
      invoiceId: 'inv-1',
      remit: { baseAmount: 1, amount: 1.04 },
      paymentMethod: {
        customer: { customerId: 'cus-1', customerPaymentMethodId: 'pm-1' },
        card: { token: '4264288H8vbk5555', maskedCard: '426428******5555', expirationDate: '03/31', cvv: '123' },
        ach: { achToken: 'ach-secret', accountNumber: '000123456789', routingNumber: '021000021' },
      },
      addresses: [{ firstName: 'Test', lastName: 'Member', email: 'm@example.com', phone: '2136632792', addressLine1: '123 Main St', postalCode: '60644', state: 'CA', country: 'US' }],
    };

    expect(redactForLog(body)).toEqual({
      type: 'Sale',
      invoiceId: 'inv-1',
      remit: { baseAmount: 1, amount: 1.04 },
      paymentMethod: {
        customer: { customerId: 'cus-1', customerPaymentMethodId: 'pm-1' },
        card: { token: REDACTED, maskedCard: '••••5555', expirationDate: '03/31', cvv: REDACTED },
        ach: { achToken: REDACTED, accountNumber: REDACTED, routingNumber: '021000021' },
      },
      addresses: [{ firstName: REDACTED, lastName: REDACTED, email: REDACTED, phone: REDACTED, addressLine1: REDACTED, postalCode: REDACTED, state: 'CA', country: 'US' }],
    });
  });

  it('removes the ACH tokenization result (IQPro returns it as data.achId)', () => {
    expect(redactForLog({ data: { achId: 'ach-tok-1' }, achToken: 'ach-tok-2' })).toEqual({ data: { achId: REDACTED }, achToken: REDACTED });
  });

  it('handles Square snake_case fields', () => {
    expect(redactForLog({ source_id: 'ccof:abc', customer_id: 'C1', email_address: 'm@example.com', given_name: 'T', family_name: 'M', address: { address_line_1: '1 Main', postal_code: '94105', locality: 'SF' } }))
      .toEqual({ source_id: REDACTED, customer_id: 'C1', email_address: REDACTED, given_name: REDACTED, family_name: REDACTED, address: { address_line_1: REDACTED, postal_code: REDACTED, locality: 'SF' } });
  });

  it('keeps empty values as they are and leaves short masked values alone', () => {
    expect(redactForLog({ email: '', phone: null, token: undefined, maskedCard: '1234' })).toEqual({ email: '', phone: null, token: undefined, maskedCard: '1234' });
  });

  it('passes primitives and arrays through', () => {
    expect(redactForLog('text')).toBe('text');
    expect(redactForLog(null)).toBeNull();
    expect(redactForLog([{ token: 't' }, 2])).toEqual([{ token: REDACTED }, 2]);
  });
});

describe('redactBodyForLog', () => {
  it('redacts a JSON body field by field', () => {
    const out = redactBodyForLog(JSON.stringify({ data: { achId: 'ach-tok', status: 'ok' } }));

    expect(out).not.toContain('ach-tok');
    expect(JSON.parse(out)).toEqual({ data: { achId: REDACTED, status: 'ok' } });
  });

  it('never logs a non-JSON body — only its kind and length', () => {
    // Gateway error pages can echo submitted fields; they cannot be redacted
    // by field, so none of their text is kept.
    const html = '<html><body>Error for jane@example.com card 4111111111111111</body></html>';
    const text = 'Declined: cardholder Jane Doe, 4111111111111111';

    expect(redactBodyForLog(html)).toBe(`[non-JSON HTML/XML body redacted, ${html.length} chars]`);
    expect(redactBodyForLog('<!DOCTYPE html><p>x</p>')).toContain('HTML/XML');
    expect(redactBodyForLog(text)).toBe(`[non-JSON text body redacted, ${text.length} chars]`);
    expect(redactBodyForLog(html)).not.toContain('4111');
    expect(redactBodyForLog(text)).not.toContain('Jane');
  });

  it('treats a bare JSON string as free text, but keeps harmless JSON primitives', () => {
    const quoted = 'card 4111111111111111 declined';

    expect(redactBodyForLog(JSON.stringify(quoted))).toBe(`[non-JSON text body redacted, ${quoted.length} chars]`);
    expect(redactBodyForLog('42')).toBe('42');
    expect(redactBodyForLog('true')).toBe('true');
    expect(redactBodyForLog('null')).toBe('null');
  });

  it('labels an empty body', () => {
    expect(redactBodyForLog('')).toBe('(empty body)');
    expect(redactBodyForLog(null)).toBe('(empty body)');
  });
});

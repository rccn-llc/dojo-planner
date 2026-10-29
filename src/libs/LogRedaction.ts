/**
 * Redact payment-provider request/response bodies before they are logged.
 *
 * Both transports (`libs/IQPro.ts`, `libs/Square.ts`) log every body so a
 * vague 4xx can be diagnosed from the log provider without re-running. Those
 * bodies also carry payment credentials and personal data, which must not
 * reach the logs:
 *
 * - credentials — card/ACH tokens (IQPro `token`, `achToken`, `achId`; Square
 *   `source_id`, nonces), account/card numbers, CVVs, secrets → removed;
 * - personal data — names, emails, phones, street addresses → removed;
 * - masked numbers (`426428******5555`) → last 4 only.
 *
 * Ids, statuses, amounts and field NAMES are kept: they are what diagnosis
 * needs. Keys are matched case-insensitively and in camel or snake case.
 */

export const REDACTED = '[redacted]';

const REMOVE = new Set([
  // credentials
  'token',
  'achtoken',
  'achid',
  'accountnumber',
  'cardnumber',
  'number',
  'cvv',
  'cvc',
  'cvv2',
  'securitycode',
  'sourceid',
  'cardnonce',
  'nonce',
  'verificationtoken',
  'authenticationkey',
  'clientsecret',
  'accesstoken',
  'password',
  // personal data
  'email',
  'emailaddress',
  'billingemail',
  'mainrecipient',
  'phone',
  'phonenumber',
  'fax',
  'firstname',
  'lastname',
  'givenname',
  'familyname',
  'cardholdername',
  'addressline1',
  'addressline2',
  'addressline3',
  'postalcode',
  'dateofbirth',
]);

const MASKED = new Set(['maskedcard', 'maskedaccount']);

const normalize = (key: string) => key.toLowerCase().replace(/[_-]/g, '');

/** A deep copy of `value` with sensitive fields removed or masked. */
export function redactForLog(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactForLog);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    const k = normalize(key);
    if (REMOVE.has(k)) {
      out[key] = v === null || v === undefined || v === '' ? v : REDACTED;
    } else if (MASKED.has(k) && typeof v === 'string' && v.length > 4) {
      out[key] = `••••${v.slice(-4)}`;
    } else {
      out[key] = redactForLog(v);
    }
  }
  return out;
}

const MAX_UNPARSED = 500;

/**
 * Redact a raw body for logging (or for an error message). A JSON body is
 * redacted field by field and pretty-printed; anything else cannot be redacted
 * by field, so it is kept only up to a short length — error text is usually
 * short and needed for diagnosis.
 */
export function redactBodyForLog(text: string | null | undefined): string {
  if (!text) {
    return '(empty body)';
  }
  try {
    return JSON.stringify(redactForLog(JSON.parse(text)), null, 2);
  } catch {
    return text.length > MAX_UNPARSED ? `${text.slice(0, MAX_UNPARSED)}… [truncated]` : text;
  }
}

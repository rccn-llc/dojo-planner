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
 * - masked numbers (`426428******5555`) → last 4 only;
 * - a body that is not a JSON object/array (HTML error pages, plain text, a
 *   bare JSON string) → replaced entirely by a marker. It cannot be redacted by
 *   field, and gateway error pages can echo submitted fields.
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

/**
 * A body that cannot be redacted by field is never logged: only its kind and
 * length, which is what diagnosis can safely use (with the HTTP status the
 * caller logs alongside).
 */
function unstructuredMarker(text: string): string {
  const kind = /^\s*<(?:!doctype|html|\?xml|[a-z])/i.test(text) ? 'HTML/XML' : 'text';
  return `[non-JSON ${kind} body redacted, ${text.length} chars]`;
}

/**
 * Redact a raw body for logging (or for an error message). A JSON object or
 * array is redacted field by field and pretty-printed; anything else is
 * replaced by a marker (see `unstructuredMarker`).
 */
export function redactBodyForLog(text: string | null | undefined): string {
  if (!text) {
    return '(empty body)';
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return unstructuredMarker(text);
  }
  // A bare JSON string is free text in quotes; numbers, booleans and null
  // carry nothing sensitive.
  if (typeof parsed === 'string') {
    return unstructuredMarker(parsed);
  }
  return JSON.stringify(redactForLog(parsed), null, 2);
}

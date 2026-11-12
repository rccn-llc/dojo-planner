import * as z from 'zod';
import { slugify, validateEmail, validateSlug } from '@/scripts/onboarding/preflight';

/**
 * The JSON contract for `POST /api/signup` (see docs/SIGNUP-API.md).
 *
 * Every field is normalised before it is checked, and each failure is reported
 * as one of three codes the form can map to a message. The codes travel to a
 * public page, so they never carry the submitted value.
 */

export const SIGNUP_FIELDS = ['academyName', 'ownerName', 'ownerEmail', 'ownerPhone'] as const;
export type SignupField = (typeof SIGNUP_FIELDS)[number];
export type SignupFieldError = 'required' | 'invalid' | 'too_long';

/** The hidden field a person never sees. Anything in it means a bot. */
const HONEYPOT_FIELD = 'website';
const KNOWN_FIELDS = new Set<string>([...SIGNUP_FIELDS, HONEYPOT_FIELD]);

const collapseSpaces = (value: string) => value.trim().replace(/\s+/g, ' ');

const PHONE_CHARACTERS = /^[0-9 +().-]+$/;

function isValidPhone(value: string): boolean {
  if (!PHONE_CHARACTERS.test(value)) {
    return false;
  }
  const digits = value.replace(/\D/g, '').length;
  return digits >= 7 && digits <= 15; // E.164 allows at most 15 digits
}

// Names are put into an email sent to whatever address was typed in, so they
// must not be able to carry a link, markup, or text hidden by invisible or
// direction-changing characters (phishing through our own sender).
const HIDDEN_CHARACTERS = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}]/u;
const MARKUP_OR_LINK = /[<>@]|:\/\/|www\./i;
const DOMAIN_LABEL = /^[\p{L}\p{N}-]+$/u;
const TOP_LEVEL_LABEL = /^\p{L}{2,}$/u;
const TRAILING_PUNCTUATION = new Set(['.', ',', ';', ':', '!', '?', ')']);

/** One word shaped like a domain — `evil.com`, `a.b.example`, `evil.com.` — but not `B.J.J.` or `St.` */
function isDomainLikeWord(word: string): boolean {
  let end = word.length;
  while (end > 0 && TRAILING_PUNCTUATION.has(word[end - 1]!)) {
    end -= 1;
  }
  const labels = word.slice(0, end).split('.');
  return labels.length >= 2
    && labels.every(label => DOMAIN_LABEL.test(label))
    && TOP_LEVEL_LABEL.test(labels[labels.length - 1]!);
}

/** True when the text is safe to show in an email: no link, markup or hidden characters. */
export function isSafeDisplayName(value: string): boolean {
  if (HIDDEN_CHARACTERS.test(value) || MARKUP_OR_LINK.test(value)) {
    return false;
  }
  return !value.split(' ').some(isDomainLikeWord);
}

function isValidAcademyName(value: string): boolean {
  return value.length >= 2 && isSafeDisplayName(value) && validateSlug(slugify(value)) === null;
}

type FieldRule = {
  normalize: (value: string) => string;
  max: number;
  isValid?: (value: string) => boolean;
};

function stringField(rule: FieldRule) {
  return z.unknown().transform((raw, ctx) => {
    const fail = (code: SignupFieldError) => {
      ctx.addIssue({ code: 'custom', message: code });
      return z.NEVER;
    };
    if (raw === undefined || raw === '') {
      return fail('required');
    }
    if (typeof raw !== 'string') {
      return fail('invalid');
    }
    const value = rule.normalize(raw);
    if (value.length === 0) {
      return fail('required');
    }
    if (value.length > rule.max) {
      return fail('too_long');
    }
    if (rule.isValid && !rule.isValid(value)) {
      return fail('invalid');
    }
    return value;
  });
}

export const SignupValidation = z.object({
  academyName: stringField({ normalize: collapseSpaces, max: 120, isValid: isValidAcademyName }),
  ownerName: stringField({ normalize: collapseSpaces, max: 120, isValid: isSafeDisplayName }),
  ownerEmail: stringField({
    normalize: value => value.trim().toLowerCase(),
    max: 254,
    isValid: value => validateEmail(value) === null,
  }),
  // Kept as typed (trimmed): the digit rules only decide whether it is usable.
  ownerPhone: stringField({ normalize: value => value.trim(), max: 40, isValid: isValidPhone }),
});

export type SignupInput = z.output<typeof SignupValidation>;

export type ParsedSignup
  = | { kind: 'ok'; value: SignupInput; unknownFields: string[] }
    | { kind: 'honeypot'; unknownFields: string[] }
    | { kind: 'invalid'; fields: Partial<Record<SignupField, SignupFieldError>>; unknownFields: string[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse an already-decoded JSON body. Unknown fields are ignored but their
 * NAMES are returned, so a form built against the wrong field names shows up
 * in the logs instead of failing silently.
 */
export function parseSignupPayload(body: unknown): ParsedSignup {
  const input = isPlainObject(body) ? body : {};
  const unknownFields = Object.keys(input).filter(key => !KNOWN_FIELDS.has(key));

  const honeypot = input[HONEYPOT_FIELD];
  if (honeypot !== undefined && honeypot !== null && !(typeof honeypot === 'string' && honeypot.trim() === '')) {
    return { kind: 'honeypot', unknownFields };
  }

  const result = SignupValidation.safeParse(input);
  if (result.success) {
    return { kind: 'ok', value: result.data, unknownFields };
  }

  const fields: Partial<Record<SignupField, SignupFieldError>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && (SIGNUP_FIELDS as readonly string[]).includes(field)) {
      fields[field as SignupField] ??= issue.message as SignupFieldError;
    }
  }
  return { kind: 'invalid', fields, unknownFields };
}

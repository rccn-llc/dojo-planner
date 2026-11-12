import { describe, expect, it } from 'vitest';
import { parseSignupPayload } from './SignupValidation';

const VALID = {
  academyName: 'Riverside Jiu-Jitsu',
  ownerName: 'Jordan Rivera',
  ownerEmail: 'jordan@example.com',
  ownerPhone: '+1 (555) 010-0199',
};

function invalidFields(body: unknown) {
  const parsed = parseSignupPayload(body);
  if (parsed.kind !== 'invalid') {
    throw new Error(`expected invalid, got ${parsed.kind}`);
  }
  return parsed.fields;
}

describe('parseSignupPayload', () => {
  it('accepts the documented payload', () => {
    expect(parseSignupPayload({ ...VALID, website: '' })).toEqual({ kind: 'ok', value: VALID, unknownFields: [] });
  });

  it('normalises: trims and collapses spaces, lowercases the email, keeps the phone as typed', () => {
    const parsed = parseSignupPayload({
      academyName: '  Riverside   Jiu-Jitsu ',
      ownerName: ' Jordan\t Rivera ',
      ownerEmail: '  Jordan@Example.COM ',
      ownerPhone: ' (555) 010-0199 ',
    });

    expect(parsed).toMatchObject({
      kind: 'ok',
      value: {
        academyName: 'Riverside Jiu-Jitsu',
        ownerName: 'Jordan Rivera',
        ownerEmail: 'jordan@example.com',
        ownerPhone: '(555) 010-0199',
      },
    });
  });

  it('reports every missing field as required', () => {
    expect(invalidFields({})).toEqual({
      academyName: 'required',
      ownerName: 'required',
      ownerEmail: 'required',
      ownerPhone: 'required',
    });
    expect(invalidFields({ ...VALID, ownerName: '   ' })).toEqual({ ownerName: 'required' });
  });

  it('treats a non-object body as all fields missing', () => {
    expect(Object.keys(invalidFields([1, 2]))).toHaveLength(4);
    expect(Object.keys(invalidFields('text'))).toHaveLength(4);
    expect(Object.keys(invalidFields(null))).toHaveLength(4);
  });

  it.each([
    ['a number', 42],
    ['null', null],
    ['an array', ['x']],
    ['an object', { a: 1 }],
  ])('rejects %s as invalid', (_label, value) => {
    expect(invalidFields({ ...VALID, academyName: value })).toEqual({ academyName: 'invalid' });
  });

  it('enforces the length limits as too_long', () => {
    expect(invalidFields({ ...VALID, academyName: 'a'.repeat(121) })).toEqual({ academyName: 'too_long' });
    expect(invalidFields({ ...VALID, ownerName: 'a'.repeat(121) })).toEqual({ ownerName: 'too_long' });
    expect(invalidFields({ ...VALID, ownerEmail: `${'a'.repeat(250)}@example.com` })).toEqual({ ownerEmail: 'too_long' });
    expect(invalidFields({ ...VALID, ownerPhone: '1'.repeat(41) })).toEqual({ ownerPhone: 'too_long' });
  });

  it('rejects an academy name that makes no usable slug', () => {
    expect(invalidFields({ ...VALID, academyName: '!!!' })).toEqual({ academyName: 'invalid' });
    expect(invalidFields({ ...VALID, academyName: 'A' })).toEqual({ academyName: 'invalid' });
  });

  it.each([
    ['a link', 'Visit https://evil.example now'],
    ['a www address', 'Go to www.evil'],
    ['a bare domain', 'Confirm at evil-login.com'],
    ['a domain followed by punctuation', 'See evil.co.uk.'],
    ['markup', '<b>Riverside</b>'],
    ['an address', 'help@evil.example'],
    ['a direction override', 'Riverside ‮moc.live'],
    ['a zero-width character', 'River​side'],
    ['a control character', 'River\u0000side'],
  ])('rejects names carrying %s (they are put into an email)', (_label, name) => {
    expect(invalidFields({ ...VALID, academyName: name, ownerName: name })).toEqual({ academyName: 'invalid', ownerName: 'invalid' });
  });

  it.each(['St. Louis BJJ', 'B.J.J. Club', 'Gracie Barra (Downtown)', 'José Aldo Academy', 'Team 10th Planet!'])(
    'still accepts the ordinary name %s',
    (name) => {
      expect(parseSignupPayload({ ...VALID, academyName: name, ownerName: name }).kind).toBe('ok');
    },
  );

  it('rejects a malformed email', () => {
    expect(invalidFields({ ...VALID, ownerEmail: 'not-an-email' })).toEqual({ ownerEmail: 'invalid' });
  });

  it.each([
    ['too few digits', '555-01'],
    ['too many digits', '+1234567890123456'],
    ['letters', '555-0100-CALL'],
  ])('rejects a phone with %s', (_label, phone) => {
    expect(invalidFields({ ...VALID, ownerPhone: phone })).toEqual({ ownerPhone: 'invalid' });
  });

  it('flags a filled honeypot without validating anything else', () => {
    expect(parseSignupPayload({ website: 'http://spam.example' })).toEqual({ kind: 'honeypot', unknownFields: [] });
    expect(parseSignupPayload({ ...VALID, website: 123 })).toMatchObject({ kind: 'honeypot' });
    expect(parseSignupPayload({ ...VALID, website: '   ' }).kind).toBe('ok');
    expect(parseSignupPayload({ ...VALID, website: null }).kind).toBe('ok');
  });

  it('ignores unknown fields but names them', () => {
    expect(parseSignupPayload({ ...VALID, email: 'x@example.com', plan: 'gold' })).toMatchObject({
      kind: 'ok',
      unknownFields: ['email', 'plan'],
    });
  });
});

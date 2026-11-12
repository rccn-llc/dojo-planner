import { describe, expect, it } from 'vitest';
import { createFailingPrompter, githubRunUrl, maskForCi, MissingInputError, parseOnboardFlags, splitOwnerName } from './unattended';

const argv = (...flags: string[]) => ['node', 'onboardOrg.ts', ...flags];

describe('parseOnboardFlags', () => {
  it('defaults to an interactive, first-attempt run', () => {
    expect(parseOnboardFlags(argv())).toEqual({
      target: undefined,
      slug: undefined,
      name: undefined,
      ownerEmail: undefined,
      ownerName: undefined,
      provider: undefined,
      operator: undefined,
      fromRequest: undefined,
      attempt: 1,
      connectionString: undefined,
      dryRun: false,
      nonInteractive: false,
      envFromShell: false,
      ci: false,
    });
  });

  it('reads every value flag, keeping "=" inside values', () => {
    const flags = parseOnboardFlags(argv(
      '--target=preview',
      '--slug=riverside',
      '--name=Riverside Jiu-Jitsu',
      '--ownerEmail=jordan@example.com',
      '--ownerName=Jordan Rivera',
      '--provider=skip',
      '--operator=onboarding-bot',
      '--fromRequest=6f1c2b8e-0000-4000-8000-000000000001',
      '--attempt=2',
      '--connection-string=postgresql://u:p@h/db?a=b',
      '--dry-run',
    ));

    expect(flags).toMatchObject({
      target: 'preview',
      slug: 'riverside',
      name: 'Riverside Jiu-Jitsu',
      ownerEmail: 'jordan@example.com',
      ownerName: 'Jordan Rivera',
      provider: 'skip',
      operator: 'onboarding-bot',
      fromRequest: '6f1c2b8e-0000-4000-8000-000000000001',
      attempt: 2,
      connectionString: 'postgresql://u:p@h/db?a=b',
      dryRun: true,
    });
  });

  it('--ci implies --nonInteractive and --envFromShell', () => {
    expect(parseOnboardFlags(argv('--ci'))).toMatchObject({ ci: true, nonInteractive: true, envFromShell: true });
    expect(parseOnboardFlags(argv('--nonInteractive'))).toMatchObject({ ci: false, nonInteractive: true, envFromShell: false });
    expect(parseOnboardFlags(argv('--envFromShell'))).toMatchObject({ nonInteractive: false, envFromShell: true });
  });

  it.each([
    ['--target=staging', /--target/],
    ['--provider=stripe', /--provider/],
    ['--attempt=0', /--attempt/],
    ['--attempt=two', /--attempt/],
  ])('rejects %s', (flag, message) => {
    expect(() => parseOnboardFlags(argv(flag))).toThrow(message);
  });
});

describe('createFailingPrompter', () => {
  it('turns every question into a MissingInputError naming it', async () => {
    const prompt = createFailingPrompter();

    await expect(prompt.ask('Dojo name')).rejects.toThrow(MissingInputError);
    await expect(prompt.askValid('Academy owner email', () => null)).rejects.toThrow(/Academy owner email/);
    await expect(prompt.askSecret('IQPro Client Secret')).rejects.toThrow(/IQPro Client Secret/);
    await expect(prompt.choose('Payment provider', ['iqpro', 'skip'] as const, 'iqpro')).rejects.toThrow(/Payment provider/);
    // A safety confirm is never answered by default: unattended, it is a stop.
    await expect(prompt.confirm('   Use these shell values for a production run?', false)).rejects.toThrow(/Use these shell values/);
  });
});

describe('maskForCi', () => {
  it('writes nothing outside CI', () => {
    const lines: string[] = [];
    maskForCi(false, ['jordan@example.com'], l => lines.push(l));

    expect(lines).toEqual([]);
  });

  it('masks each value once, skipping empty, tiny and multi-line values', () => {
    const lines: string[] = [];
    maskForCi(true, ['jordan@example.com', 'jordan@example.com', '', null, undefined, 'ab', 'a\nb', 'abc\rdef', ' Riverside '], l => lines.push(l));

    expect(lines).toEqual(['::add-mask::jordan@example.com\n', '::add-mask::Riverside\n']);
  });

  it('also masks a connection string\'s user, password and host on their own', () => {
    const lines: string[] = [];
    maskForCi(true, ['postgresql://neondb_owner:s3cr%40t@ep-cool-123-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require'], l => lines.push(l));

    expect(lines).toEqual([
      // `%` escaped: GitHub decodes command values, so `%40` must be sent as `%2540`.
      '::add-mask::postgresql://neondb_owner:s3cr%2540t@ep-cool-123-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require\n',
      '::add-mask::neondb_owner\n',
      '::add-mask::s3cr@t\n',
      '::add-mask::ep-cool-123-pooler.us-east-2.aws.neon.tech\n',
    ]);
  });
});

describe('splitOwnerName', () => {
  it.each([
    ['Jordan Rivera', { firstName: 'Jordan', lastName: 'Rivera' }],
    ['  Mary  Ann   Smith ', { firstName: 'Mary', lastName: 'Ann Smith' }],
    ['Cher', { firstName: 'Cher' }],
  ])('splits %s', (name, expected) => {
    expect(splitOwnerName(name)).toEqual(expected);
  });
});

describe('githubRunUrl', () => {
  it('builds the run link inside Actions, null elsewhere', () => {
    expect(githubRunUrl({ GITHUB_SERVER_URL: 'https://github.com', GITHUB_REPOSITORY: 'rccn-llc/dojo-planner', GITHUB_RUN_ID: '42' }))
      .toBe('https://github.com/rccn-llc/dojo-planner/actions/runs/42');
    expect(githubRunUrl({})).toBeNull();
  });
});

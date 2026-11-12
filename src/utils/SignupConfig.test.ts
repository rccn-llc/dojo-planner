import { afterEach, describe, expect, it, vi } from 'vitest';

describe('SignupConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('in production: pins the app URL and allows only the www origins', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://dojo-planner-abc.vercel.app/');
    const config = await import('./SignupConfig');

    expect(config.isProductionDeployment()).toBe(true);
    expect(config.signupTarget()).toBe('production');
    expect(config.signupAppUrl()).toBe('https://app.dojoplanner.com');
    expect(config.signupAllowedOrigins()).toEqual(['https://www.dojoplanner.com', 'https://dojoplanner.com']);
  });

  it('elsewhere: targets preview, uses the deployment URL without a trailing slash, adds localhost origins', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://preview.example.test/');
    const config = await import('./SignupConfig');

    expect(config.isProductionDeployment()).toBe(false);
    expect(config.signupTarget()).toBe('preview');
    expect(config.signupAppUrl()).toBe('https://preview.example.test');
    expect(config.signupAllowedOrigins()).toEqual(expect.arrayContaining([
      'https://www.dojoplanner.com',
      'http://localhost:3000',
      'http://localhost:8080',
    ]));
  });
});

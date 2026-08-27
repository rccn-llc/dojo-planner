import { describe, expect, it } from 'vitest';
import { unpooledUri } from './exportTenant';

describe('unpooledUri', () => {
  it('strips Neon\'s -pooler suffix for dump/restore', () => {
    // Neon recommends an unpooled connection for dumps: transaction pooling
    // interferes with the long single session pg_dump holds open.
    expect(unpooledUri('postgresql://u:p@ep-x-pooler.us-east-1.aws.neon.tech/db?sslmode=require'))
      .toBe('postgresql://u:p@ep-x.us-east-1.aws.neon.tech/db?sslmode=require');
  });

  it('leaves an already-direct connection string untouched', () => {
    const direct = 'postgresql://u:p@ep-x.us-east-1.aws.neon.tech/db';

    expect(unpooledUri(direct)).toBe(direct);
  });
});

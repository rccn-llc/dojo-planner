import { createHash, timingSafeEqual } from 'node:crypto';
import { Env } from '@/libs/Env';

/**
 * Vercel Cron authenticates with `Authorization: Bearer $CRON_SECRET`. With no
 * secret configured every request is refused rather than the route running open.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = Env.CRON_SECRET;
  if (!secret) {
    return false;
  }
  // Compare fixed-length digests: constant time, and the comparison does not
  // reveal the secret's length either.
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(request.headers.get('authorization') ?? ''), digest(`Bearer ${secret}`));
}

import { ORPCError } from '@orpc/server';
import { ProgramNotFoundError } from '@/services/ProgramsService';
import { TagNotFoundError } from '@/services/TagsService';

/**
 * Map a cross-tenant "entity not found in org" service error to a 404 ORPCError
 * so a cross-tenant probe is indistinguishable from a genuine miss. Returns
 * `null` when the error is not one of the recognized tenancy errors, so callers
 * can fall through to their own handling / rethrow.
 *
 * Usage in a router catch block:
 *   const mapped = toTenancyOrpcError(error);
 *   if (mapped) { throw mapped; }
 *   // ... other error mappings ...
 *   throw error;
 */
export function toTenancyOrpcError(error: unknown): ORPCError<string, unknown> | null {
  if (error instanceof ProgramNotFoundError || error instanceof TagNotFoundError) {
    return new ORPCError('Not Found', { status: 404, message: error.message });
  }
  return null;
}

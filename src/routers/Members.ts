import { os } from '@orpc/server';
import { getOrganizationMembers } from '@/services/MembersService';
import { ORG_ROLE } from '@/types/Auth';
import { guardRole } from './AuthGuards';

export const list = os.handler(async () => {
  const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);

  const members = await getOrganizationMembers(orgId);

  return { members };
});

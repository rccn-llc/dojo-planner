import { redirect, unstable_rethrow } from 'next/navigation';
import { logger } from '@/libs/Logger';
import { createBillingPortal } from '@/services/BillingService';
import { getStripeCustomerId } from '@/services/OrganizationService';
import { ORG_ROLE } from '@/types/Auth';
import { requireOrganization } from '@/utils/Auth';

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      locale: string;
    }>;
  },
) {
  const { orgId, has } = await requireOrganization();
  const { locale } = await context.params;

  if (!has({ role: ORG_ROLE.ADMIN })) {
    redirect('/dashboard/billing');
  }

  const organization = await getStripeCustomerId(orgId);

  const customerId = organization?.stripeCustomerId;

  if (!customerId) {
    redirect('/dashboard/billing');
  }

  let portalUrl: string;
  try {
    const session = await createBillingPortal(customerId, locale);
    portalUrl = session.url;
  } catch (error) {
    // redirect() throws a control-flow signal — never swallow it.
    unstable_rethrow(error);
    logger.error('Failed to create Stripe billing portal session', {
      orgId,
      error: error instanceof Error ? error.message : String(error),
    });
    redirect('/dashboard/billing?error=portal');
  }

  redirect(portalUrl);
}

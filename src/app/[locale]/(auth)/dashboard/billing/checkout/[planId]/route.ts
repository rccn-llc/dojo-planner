import { redirect, unstable_rethrow } from 'next/navigation';
import { logger } from '@/libs/Logger';
import { createCheckoutSession, createOrRetrieveCustomer } from '@/services/BillingService';
import { ORG_ROLE } from '@/types/Auth';
import { PricingPlanList } from '@/utils/AppConfig';
import { requireOrganization } from '@/utils/Auth';

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      planId: string;
      locale: string;
    }>;
  },
) {
  const { orgId, has } = await requireOrganization();
  const { locale, planId } = await context.params;

  if (!has({ role: ORG_ROLE.ADMIN })) {
    redirect('/dashboard/billing');
  }

  const plan = PricingPlanList[planId];

  if (!plan) {
    redirect('/dashboard/billing');
  }

  let checkoutUrl: string | null;
  try {
    const customerId = await createOrRetrieveCustomer(orgId);
    const session = await createCheckoutSession(
      plan,
      customerId,
      locale,
    );
    checkoutUrl = session.url;
  } catch (error) {
    // redirect() throws a control-flow signal — never swallow it.
    unstable_rethrow(error);
    logger.error('Failed to create Stripe checkout session', {
      orgId,
      planId,
      error: error instanceof Error ? error.message : String(error),
    });
    redirect('/dashboard/billing?error=checkout');
  }

  if (!checkoutUrl) {
    redirect('/dashboard/billing');
  }

  redirect(checkoutUrl);
}

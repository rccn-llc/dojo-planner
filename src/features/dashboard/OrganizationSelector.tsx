'use client';

import { useClerk, useOrganization } from '@clerk/nextjs';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { client } from '@/libs/Orpc';

type OrgData = {
  id: string;
  name: string | null;
  image_url: string | null;
};

/**
 * Custom organization selector component that replaces Clerk's OrganizationSwitcher.
 * Displays organization logos and allows switching between organizations.
 */
export const OrganizationSelector = () => {
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const { user, setActive } = useClerk();
  const router = useRouter();
  const [isChanging, setIsChanging] = useState(false);
  const [organizations, setOrganizations] = useState<OrgData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Get user's organizations on mount
  useEffect(() => {
    const fetchOrganizations = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        const orgs = user.organizationMemberships?.map(membership => ({
          id: membership.organization.id,
          name: membership.organization.name,
          image_url: membership.organization.imageUrl,
        })) || [];

        // Clerk membership is not enough: an organization with no provisioned
        // database cannot be served — `resolveTenant` fails closed, so picking
        // one would 409 the whole dashboard. Hide those rather than offer a
        // dead end.
        //
        // On failure, fall back to the UNFILTERED list. A transient
        // control-plane blip should not make every organization vanish from
        // the switcher, which looks far more alarming than the 409 this
        // filtering exists to avoid.
        try {
          const { orgIds } = await client.organization.listProvisioned();
          const provisioned = new Set(orgIds);
          setOrganizations(orgs.filter(org => provisioned.has(org.id)));
        } catch (error) {
          console.error('Could not check which organizations are provisioned; showing all:', error);
          setOrganizations(orgs);
        }
      } catch (error) {
        console.error('Failed to fetch organizations:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrganizations();
  }, [user]);

  // Handle organization change
  const handleOrganizationChange = useCallback(
    async (organizationId: string) => {
      if (!organizations || !setActive) {
        return;
      }

      const selectedOrg = organizations.find(org => org.id === organizationId);
      if (!selectedOrg) {
        return;
      }

      setIsChanging(true);
      try {
        await setActive({ organization: selectedOrg.id });
        // Refresh the page to fetch new organization data
        router.refresh();
      } catch (error) {
        console.error('Failed to switch organization:', error);
      } finally {
        setIsChanging(false);
      }
    },
    [organizations, setActive, router],
  );

  if (!orgLoaded || !organization || isLoading || organizations.length === 0) {
    return null;
  }

  return (
    <Select value={organization.id} onValueChange={handleOrganizationChange} disabled={isChanging}>
      <SelectTrigger className="w-64 md:w-60" aria-label="Open organization switcher">
        {/*
          Rendered directly rather than through `<SelectValue asChild>`: Radix
          wraps SelectValue's children in a Fragment before handing them to the
          asChild Slot, so the Slot merges `style`/`data-slot` onto that
          Fragment and React warns. The trigger always shows the active
          organization, so it does not need SelectValue's placeholder handling.
        */}
        <div data-slot="select-value" className="flex items-center gap-2">
          {organization.imageUrl && (
            <Image
              src={organization.imageUrl}
              alt={organization.name || 'Organization'}
              width={20}
              height={20}
              className="rounded-sm object-cover"
            />
          )}
          <span className="truncate">{organization.name}</span>
        </div>
      </SelectTrigger>
      <SelectContent>
        {organizations.map(org => (
          <SelectItem key={org.id} value={org.id}>
            <div className="flex items-center gap-2">
              {org.image_url && (
                <Image
                  src={org.image_url}
                  alt={org.name || 'Organization'}
                  width={16}
                  height={16}
                  className="rounded-sm object-cover"
                />
              )}
              <span>{org.name}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

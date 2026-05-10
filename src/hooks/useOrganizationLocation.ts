import { useCallback, useEffect, useState } from 'react';
import { client } from '@/libs/Orpc';

export type OrganizationLocation = {
  address: string | null;
  phone: string | null;
  email: string | null;
  taxRate: number;
};

const EMPTY_LOCATION: OrganizationLocation = {
  address: null,
  phone: null,
  email: null,
  taxRate: 0,
};

export function useOrganizationLocation() {
  const [location, setLocation] = useState<OrganizationLocation>(EMPTY_LOCATION);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLocation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.organization.getLocation();
      setLocation(result.location);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load location');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocation();
  }, [fetchLocation]);

  return { location, loading, error, refetch: fetchLocation };
}

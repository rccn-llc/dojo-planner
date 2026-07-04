import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock database and schemas. `db.transaction(cb)` invokes the callback with
// the same `db` object as `tx` so existing tests keep asserting against
// `db.update` / `db.insert` / `db.select` regardless of whether the code
// under test runs inside a transaction.
vi.mock('@/libs/DB', () => {
  const db: Record<string, unknown> = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([])),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([])),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([])),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })),
  };
  db.transaction = vi.fn(async (cb: (tx: typeof db) => Promise<unknown>) => cb(db));
  return { db };
});

vi.mock('@/models/Schema', () => ({
  waiverTemplateSchema: { id: 'id', organizationId: 'organizationId', parentId: 'parentId', isDefault: 'isDefault', content: 'content' },
  signedWaiverSchema: { waiverTemplateId: 'waiverTemplateId', memberId: 'memberId' },
  membershipWaiverSchema: { waiverTemplateId: 'waiverTemplateId', membershipPlanId: 'membershipPlanId' },
  membershipPlanSchema: { id: 'id', name: 'name', organizationId: 'organizationId' },
  waiverMergeFieldSchema: { id: 'id', organizationId: 'organizationId' },
}));

const mockTemplate = {
  id: 'template-1',
  organizationId: 'test-org-123',
  name: 'Standard Adult Waiver',
  slug: 'standard-adult-waiver',
  version: 1,
  content: 'This is the waiver content for testing purposes that must be long enough.',
  description: 'Test description',
  isActive: true,
  isDefault: false,
  requiresGuardian: true,
  guardianAgeThreshold: 16,
  sortOrder: 0,
  parentId: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

describe('WaiversService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  // ===========================================================================
  // resolveWaiverPlaceholders
  // ===========================================================================

  describe('resolveWaiverPlaceholders', () => {
    it('should replace placeholders case-insensitively', async () => {
      const { resolveWaiverPlaceholders } = await import('./WaiversService');

      const content = 'Welcome to <DojoName>! Please review the rules at <dojoname>.';
      const mergeFields = [{ key: 'DojoName', value: 'Iron Fist Dojo' }];

      const result = resolveWaiverPlaceholders(content, mergeFields);

      expect(result).toBe('Welcome to Iron Fist Dojo! Please review the rules at Iron Fist Dojo.');
    });

    it('should return original content when no merge fields are provided', async () => {
      const { resolveWaiverPlaceholders } = await import('./WaiversService');

      const content = 'This content has no placeholders to replace.';
      const mergeFields: Array<{ key: string; value: string }> = [];

      const result = resolveWaiverPlaceholders(content, mergeFields);

      expect(result).toBe(content);
    });

    it('should handle multiple occurrences of the same placeholder', async () => {
      const { resolveWaiverPlaceholders } = await import('./WaiversService');

      const content = '<OrgName> waiver. By signing you agree to <OrgName> terms. Contact <orgname> for questions.';
      const mergeFields = [{ key: 'OrgName', value: 'Tiger Academy' }];

      const result = resolveWaiverPlaceholders(content, mergeFields);

      expect(result).toBe('Tiger Academy waiver. By signing you agree to Tiger Academy terms. Contact Tiger Academy for questions.');
    });

    it('should replace multiple different placeholders', async () => {
      const { resolveWaiverPlaceholders } = await import('./WaiversService');

      const content = 'Welcome to <DojoName>, located at <Address>. Call <Phone> for info.';
      const mergeFields = [
        { key: 'DojoName', value: 'Iron Fist Dojo' },
        { key: 'Address', value: '123 Main St' },
        { key: 'Phone', value: '555-1234' },
      ];

      const result = resolveWaiverPlaceholders(content, mergeFields);

      expect(result).toBe('Welcome to Iron Fist Dojo, located at 123 Main St. Call 555-1234 for info.');
    });

    it('should leave unmatched placeholders unchanged', async () => {
      const { resolveWaiverPlaceholders } = await import('./WaiversService');

      const content = 'Welcome to <DojoName>. See <UnknownField> for details.';
      const mergeFields = [{ key: 'DojoName', value: 'Iron Fist Dojo' }];

      const result = resolveWaiverPlaceholders(content, mergeFields);

      expect(result).toBe('Welcome to Iron Fist Dojo. See <UnknownField> for details.');
    });
  });

  // ===========================================================================
  // getOrganizationWaiverTemplates
  // ===========================================================================

  describe('getOrganizationWaiverTemplates', () => {
    it('should return empty array when no templates exist', async () => {
      const { db } = await import('@/libs/DB');
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const { getOrganizationWaiverTemplates } = await import('./WaiversService');
      const result = await getOrganizationWaiverTemplates('test-org-123');

      expect(result).toEqual([]);
    });

    it('should return templates with stats (signedCount, membershipCount)', async () => {
      const { db } = await import('@/libs/DB');

      const mockSignedWaiver = { waiverTemplateId: 'template-1' };
      const mockMembershipWaiver = { waiverTemplateId: 'template-1' };

      let callCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            // First call: templates (filtered by parentId IS NULL)
            if (callCount === 1) {
              return Promise.resolve([mockTemplate]);
            }
            // Second call: signed waivers
            if (callCount === 2) {
              return Promise.resolve([mockSignedWaiver, mockSignedWaiver]);
            }
            // Third call: membership waivers
            if (callCount === 3) {
              return Promise.resolve([mockMembershipWaiver]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any);

      const { getOrganizationWaiverTemplates } = await import('./WaiversService');
      const result = await getOrganizationWaiverTemplates('test-org-123');

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('template-1');
      expect(result[0]?.signedCount).toBe(2);
      expect(result[0]?.membershipCount).toBe(1);
    });

    it('should filter out archive rows (parentId is not null)', async () => {
      const { db } = await import('@/libs/DB');

      // The DB query uses isNull(waiverTemplateSchema.parentId) so archive rows
      // should never be returned. We verify that only root templates (parentId: null)
      // appear in results and the query is constructed with the parentId filter.
      const rootTemplate = { ...mockTemplate, parentId: null };

      let callCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              // Only root templates returned from DB (parentId IS NULL filter applied)
              return Promise.resolve([rootTemplate]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any);

      const { getOrganizationWaiverTemplates } = await import('./WaiversService');
      const result = await getOrganizationWaiverTemplates('test-org-123');

      expect(result).toHaveLength(1);
      expect(result[0]?.parentId).toBeNull();
      // Verify db.select was called (the where clause applies the parentId IS NULL filter)
      expect(db.select).toHaveBeenCalled();
    });

    it('should apply null-coalescing defaults for nullable boolean/number fields', async () => {
      const { db } = await import('@/libs/DB');

      const templateWithNulls = {
        ...mockTemplate,
        isActive: null,
        isDefault: null,
        requiresGuardian: null,
        guardianAgeThreshold: null,
        sortOrder: null,
      };

      let callCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([templateWithNulls]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any);

      const { getOrganizationWaiverTemplates } = await import('./WaiversService');
      const result = await getOrganizationWaiverTemplates('test-org-123');

      expect(result).toHaveLength(1);
      expect(result[0]?.isActive).toBe(true);
      expect(result[0]?.isDefault).toBe(false);
      expect(result[0]?.requiresGuardian).toBe(true);
      expect(result[0]?.guardianAgeThreshold).toBe(16);
      expect(result[0]?.sortOrder).toBe(0);
    });

    it('should return zero counts when no signed or membership waivers exist', async () => {
      const { db } = await import('@/libs/DB');

      let callCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([mockTemplate]);
            }
            // Signed waivers and membership waivers both empty
            return Promise.resolve([]);
          }),
        }),
      } as any);

      const { getOrganizationWaiverTemplates } = await import('./WaiversService');
      const result = await getOrganizationWaiverTemplates('test-org-123');

      expect(result).toHaveLength(1);
      expect(result[0]?.signedCount).toBe(0);
      expect(result[0]?.membershipCount).toBe(0);
    });
  });

  // ===========================================================================
  // updateWaiverTemplate
  // ===========================================================================

  describe('updateWaiverTemplate', () => {
    it('should perform settings-only update without creating archive row (versionCreated: false)', async () => {
      const { db } = await import('@/libs/DB');

      const updatedTemplate = {
        ...mockTemplate,
        name: 'Updated Name',
      };

      // First call (select): return existing template
      let selectCallCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([mockTemplate]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedTemplate]),
          }),
        }),
      } as any);

      const { updateWaiverTemplate } = await import('./WaiversService');
      const result = await updateWaiverTemplate(
        { id: 'template-1', name: 'Updated Name' },
        'test-org-123',
      );

      expect(result.versionCreated).toBe(false);
      expect(result.template.name).toBe('Updated Name');
      // insert should NOT have been called for archive row creation
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('should create archive row and increment version when content changes (versionCreated: true)', async () => {
      const { db } = await import('@/libs/DB');

      const updatedTemplate = {
        ...mockTemplate,
        content: 'New waiver content that is different from the original content.',
        version: 2,
      };

      // select: return existing template
      let selectCallCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([mockTemplate]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any);

      // insert: archive row creation (no returning needed for archive insert)
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      // update: root row update with new content and incremented version
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedTemplate]),
          }),
        }),
      } as any);

      const { updateWaiverTemplate } = await import('./WaiversService');
      const result = await updateWaiverTemplate(
        { id: 'template-1', content: 'New waiver content that is different from the original content.' },
        'test-org-123',
      );

      expect(result.versionCreated).toBe(true);
      expect(result.template.version).toBe(2);
      expect(result.template.content).toBe('New waiver content that is different from the original content.');
      // insert should have been called to create archive row
      expect(db.insert).toHaveBeenCalled();
    });

    it('should throw "Waiver template not found" when template does not exist', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const { updateWaiverTemplate } = await import('./WaiversService');

      await expect(
        updateWaiverTemplate({ id: 'nonexistent', name: 'Test' }, 'test-org-123'),
      ).rejects.toThrow('Waiver template not found');
    });

    it('should not create archive row when content is provided but unchanged', async () => {
      const { db } = await import('@/libs/DB');

      const updatedTemplate = { ...mockTemplate };

      let selectCallCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([mockTemplate]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedTemplate]),
          }),
        }),
      } as any);

      const { updateWaiverTemplate } = await import('./WaiversService');
      const result = await updateWaiverTemplate(
        { id: 'template-1', content: mockTemplate.content },
        'test-org-123',
      );

      expect(result.versionCreated).toBe(false);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('should unset other default templates when isDefault is true', async () => {
      const { db } = await import('@/libs/DB');

      const updatedTemplate = { ...mockTemplate, isDefault: true };

      let selectCallCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([mockTemplate]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any);

      let updateCallCount = 0;
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            updateCallCount++;
            // First update: unset other defaults
            if (updateCallCount === 1) {
              return Promise.resolve();
            }
            // Second update: actual template update (has returning)
            return {
              returning: vi.fn().mockResolvedValue([updatedTemplate]),
            };
          }),
        }),
      } as any);

      const { updateWaiverTemplate } = await import('./WaiversService');
      const result = await updateWaiverTemplate(
        { id: 'template-1', isDefault: true },
        'test-org-123',
      );

      expect(result.template.isDefault).toBe(true);
      // update called at least twice: once to unset others, once to update template
      expect(db.update).toHaveBeenCalledTimes(2);
    });

    it('should update the slug when the name changes (regression: previously dead code)', async () => {
      const { db } = await import('@/libs/DB');

      const updatedTemplate = {
        ...mockTemplate,
        name: 'Renamed Waiver',
        slug: 'renamed-waiver',
      };

      let selectCallCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([mockTemplate]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any);

      const setSpy = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updatedTemplate]),
        }),
      });
      vi.mocked(db.update).mockReturnValue({ set: setSpy } as any);

      const { updateWaiverTemplate } = await import('./WaiversService');
      const result = await updateWaiverTemplate(
        { id: 'template-1', name: 'Renamed Waiver' },
        'test-org-123',
      );

      expect(result.template.slug).toBe('renamed-waiver');
      // The set() payload must include slug derived from the new name.
      expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({
        slug: 'renamed-waiver',
        name: 'Renamed Waiver',
      }));
    });

    it('should NOT update the slug when only non-name fields change', async () => {
      const { db } = await import('@/libs/DB');

      const updatedTemplate = { ...mockTemplate, isActive: false };

      let selectCallCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([mockTemplate]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any);

      const setSpy = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updatedTemplate]),
        }),
      });
      vi.mocked(db.update).mockReturnValue({ set: setSpy } as any);

      const { updateWaiverTemplate } = await import('./WaiversService');
      await updateWaiverTemplate(
        { id: 'template-1', isActive: false },
        'test-org-123',
      );

      const setPayload = setSpy.mock.calls[0]?.[0] as Record<string, unknown>;

      expect(setPayload).not.toHaveProperty('slug');
    });

    it('should run inside a transaction (regression: prevents archive-vs-root unique-key collision)', async () => {
      const { db } = await import('@/libs/DB');

      let selectCallCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([mockTemplate]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ ...mockTemplate, name: 'X' }]),
          }),
        }),
      } as any);

      const { updateWaiverTemplate } = await import('./WaiversService');
      await updateWaiverTemplate({ id: 'template-1', name: 'X' }, 'test-org-123');

      // The mocked `db.transaction` is invoked with a callback that runs the
      // update — the test passes if the call count is non-zero.
      expect(db.transaction).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // deleteWaiverTemplate
  // ===========================================================================

  describe('deleteWaiverTemplate', () => {
    it('should soft-delete (deactivate) when template has signed waivers', async () => {
      const { db } = await import('@/libs/DB');

      // Signed waivers exist for this template.
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ waiverTemplateId: 'template-1', memberId: 'member-1' }]),
        }),
      } as any);

      const deleteWhere = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.delete).mockReturnValue({ where: deleteWhere } as any);

      const updateSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
      vi.mocked(db.update).mockReturnValue({ set: updateSet } as any);

      const { deleteWaiverTemplate } = await import('./WaiversService');

      // Does not throw — the template is deactivated instead of hard-deleted.
      await expect(deleteWaiverTemplate('template-1', 'test-org-123')).resolves.toBeUndefined();

      // Membership associations are removed (one delete), and the template rows
      // are soft-deleted via update({ isActive: false }) rather than hard-deleted.
      expect(db.delete).toHaveBeenCalledTimes(1);
      expect(db.update).toHaveBeenCalledTimes(1);
      expect(updateSet).toHaveBeenCalledWith({ isActive: false });
    });

    it('should delete membership associations, archive versions, and root template', async () => {
      const { db } = await import('@/libs/DB');

      // No signed waivers
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      } as any);

      const { deleteWaiverTemplate } = await import('./WaiversService');
      await deleteWaiverTemplate('template-1', 'test-org-123');

      // Two delete calls: 1) membership associations, 2) archive versions + root template
      expect(db.delete).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================================================
  // getWaiverTemplateVersionHistory
  // ===========================================================================

  describe('getWaiverTemplateVersionHistory', () => {
    it('should return root + archive rows sorted by version descending', async () => {
      const { db } = await import('@/libs/DB');

      const rootTemplate = { ...mockTemplate, version: 3 };
      const archiveV2 = { ...mockTemplate, id: 'archive-v2', version: 2, parentId: 'template-1' };
      const archiveV1 = { ...mockTemplate, id: 'archive-v1', version: 1, parentId: 'template-1' };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          // Return rows in arbitrary order; the function should sort them
          where: vi.fn().mockResolvedValue([archiveV1, rootTemplate, archiveV2]),
        }),
      } as any);

      const { getWaiverTemplateVersionHistory } = await import('./WaiversService');
      const result = await getWaiverTemplateVersionHistory('template-1', 'test-org-123');

      expect(result).toHaveLength(3);
      expect(result[0]?.version).toBe(3);
      expect(result[1]?.version).toBe(2);
      expect(result[2]?.version).toBe(1);
    });

    it('should return empty array when no matching templates exist', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const { getWaiverTemplateVersionHistory } = await import('./WaiversService');
      const result = await getWaiverTemplateVersionHistory('nonexistent', 'test-org-123');

      expect(result).toEqual([]);
    });

    it('should apply null-coalescing defaults for nullable fields in version history', async () => {
      const { db } = await import('@/libs/DB');

      const templateWithNulls = {
        ...mockTemplate,
        isActive: null,
        isDefault: null,
        requiresGuardian: null,
        guardianAgeThreshold: null,
        sortOrder: null,
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([templateWithNulls]),
        }),
      } as any);

      const { getWaiverTemplateVersionHistory } = await import('./WaiversService');
      const result = await getWaiverTemplateVersionHistory('template-1', 'test-org-123');

      expect(result).toHaveLength(1);
      expect(result[0]?.isActive).toBe(true);
      expect(result[0]?.isDefault).toBe(false);
      expect(result[0]?.requiresGuardian).toBe(true);
      expect(result[0]?.guardianAgeThreshold).toBe(16);
      expect(result[0]?.sortOrder).toBe(0);
    });

    it('should return single row when template has no archive versions', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockTemplate]),
        }),
      } as any);

      const { getWaiverTemplateVersionHistory } = await import('./WaiversService');
      const result = await getWaiverTemplateVersionHistory('template-1', 'test-org-123');

      expect(result).toHaveLength(1);
      expect(result[0]?.version).toBe(1);
      expect(result[0]?.parentId).toBeNull();
    });
  });

  // ===========================================================================
  // getWaiverTemplateVersion
  // ===========================================================================

  describe('getWaiverTemplateVersion', () => {
    it('should return template when found', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockTemplate]),
        }),
      } as any);

      const { getWaiverTemplateVersion } = await import('./WaiversService');
      const result = await getWaiverTemplateVersion('template-1', 'test-org-123');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('template-1');
      expect(result?.name).toBe('Standard Adult Waiver');
      expect(result?.version).toBe(1);
      expect(result?.content).toBe(mockTemplate.content);
    });

    it('should return null when not found', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const { getWaiverTemplateVersion } = await import('./WaiversService');
      const result = await getWaiverTemplateVersion('nonexistent', 'test-org-123');

      expect(result).toBeNull();
    });

    it('should return archive version when queried by archive ID', async () => {
      const { db } = await import('@/libs/DB');

      const archiveTemplate = {
        ...mockTemplate,
        id: 'archive-v1',
        version: 1,
        parentId: 'template-1',
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([archiveTemplate]),
        }),
      } as any);

      const { getWaiverTemplateVersion } = await import('./WaiversService');
      const result = await getWaiverTemplateVersion('archive-v1', 'test-org-123');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('archive-v1');
      expect(result?.parentId).toBe('template-1');
      expect(result?.version).toBe(1);
    });

    it('should apply null-coalescing defaults for nullable fields', async () => {
      const { db } = await import('@/libs/DB');

      const templateWithNulls = {
        ...mockTemplate,
        isActive: null,
        isDefault: null,
        requiresGuardian: null,
        guardianAgeThreshold: null,
        sortOrder: null,
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([templateWithNulls]),
        }),
      } as any);

      const { getWaiverTemplateVersion } = await import('./WaiversService');
      const result = await getWaiverTemplateVersion('template-1', 'test-org-123');

      expect(result).not.toBeNull();
      expect(result?.isActive).toBe(true);
      expect(result?.isDefault).toBe(false);
      expect(result?.requiresGuardian).toBe(true);
      expect(result?.guardianAgeThreshold).toBe(16);
      expect(result?.sortOrder).toBe(0);
    });
  });

  // ===========================================================================
  // getActiveWaiverTemplates
  // ===========================================================================

  describe('getActiveWaiverTemplates', () => {
    it('should return only active templates', async () => {
      const { db } = await import('@/libs/DB');

      const activeTemplate = { ...mockTemplate, isActive: true };
      const inactiveTemplate = { ...mockTemplate, id: 'template-2', isActive: false };

      let callCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([activeTemplate, inactiveTemplate]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any);

      const { getActiveWaiverTemplates } = await import('./WaiversService');
      const result = await getActiveWaiverTemplates('test-org-123');

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('template-1');
      expect(result[0]?.isActive).toBe(true);
    });

    it('should return empty array when no active templates exist', async () => {
      const { db } = await import('@/libs/DB');

      const inactiveTemplate = { ...mockTemplate, isActive: false };

      let callCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([inactiveTemplate]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any);

      const { getActiveWaiverTemplates } = await import('./WaiversService');
      const result = await getActiveWaiverTemplates('test-org-123');

      expect(result).toEqual([]);
    });

    it('should return empty array when no templates exist at all', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const { getActiveWaiverTemplates } = await import('./WaiversService');
      const result = await getActiveWaiverTemplates('test-org-123');

      expect(result).toEqual([]);
    });
  });

  // ===========================================================================
  // getWaiverTemplateById
  // ===========================================================================

  describe('getWaiverTemplateById', () => {
    it('should return a template when it exists', async () => {
      const { db } = await import('@/libs/DB');

      let callCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([mockTemplate]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any);

      const { getWaiverTemplateById } = await import('./WaiversService');
      const result = await getWaiverTemplateById('template-1', 'test-org-123');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('template-1');
      expect(result?.name).toBe('Standard Adult Waiver');
    });

    it('should return null when template does not exist', async () => {
      const { db } = await import('@/libs/DB');

      let callCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([mockTemplate]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any);

      const { getWaiverTemplateById } = await import('./WaiversService');
      const result = await getWaiverTemplateById('nonexistent', 'test-org-123');

      expect(result).toBeNull();
    });

    it('should return null when organization has no templates', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const { getWaiverTemplateById } = await import('./WaiversService');
      const result = await getWaiverTemplateById('template-1', 'test-org-123');

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // getDefaultWaiverTemplate
  // ===========================================================================

  describe('getDefaultWaiverTemplate', () => {
    it('should return the default active template', async () => {
      const { db } = await import('@/libs/DB');

      const defaultTemplate = { ...mockTemplate, isDefault: true, isActive: true };

      let callCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([defaultTemplate]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any);

      const { getDefaultWaiverTemplate } = await import('./WaiversService');
      const result = await getDefaultWaiverTemplate('test-org-123');

      expect(result).not.toBeNull();
      expect(result?.isDefault).toBe(true);
      expect(result?.isActive).toBe(true);
    });

    it('should return null when default template is inactive', async () => {
      const { db } = await import('@/libs/DB');

      const inactiveDefault = { ...mockTemplate, isDefault: true, isActive: false };

      let callCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([inactiveDefault]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any);

      const { getDefaultWaiverTemplate } = await import('./WaiversService');
      const result = await getDefaultWaiverTemplate('test-org-123');

      expect(result).toBeNull();
    });

    it('should return null when no default template exists', async () => {
      const { db } = await import('@/libs/DB');

      const nonDefaultTemplate = { ...mockTemplate, isDefault: false };

      let callCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([nonDefaultTemplate]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any);

      const { getDefaultWaiverTemplate } = await import('./WaiversService');
      const result = await getDefaultWaiverTemplate('test-org-123');

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // createWaiverTemplate
  // ===========================================================================

  describe('createWaiverTemplate', () => {
    it('should create a new template with default values', async () => {
      const { db } = await import('@/libs/DB');

      const createdTemplate = {
        ...mockTemplate,
        id: 'new-template-id',
        name: 'New Waiver',
        slug: 'new-waiver',
        version: 1,
        content: 'New waiver content.',
        description: undefined,
        isActive: true,
        isDefault: false,
        requiresGuardian: true,
        guardianAgeThreshold: 16,
        sortOrder: 0,
        parentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([createdTemplate]),
        }),
      } as any);

      const { createWaiverTemplate } = await import('./WaiversService');
      const result = await createWaiverTemplate(
        { name: 'New Waiver', content: 'New waiver content.' },
        'test-org-123',
      );

      expect(result.name).toBe('New Waiver');
      expect(result.content).toBe('New waiver content.');
      expect(result.isActive).toBe(true);
      expect(result.isDefault).toBe(false);
      expect(db.insert).toHaveBeenCalledTimes(1);
    });

    it('should use provided id and slug when given', async () => {
      const { db } = await import('@/libs/DB');

      const createdTemplate = {
        ...mockTemplate,
        id: 'custom-id',
        slug: 'custom-slug',
        name: 'Custom Waiver',
        content: 'Custom content.',
      };

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([createdTemplate]),
        }),
      } as any);

      const { createWaiverTemplate } = await import('./WaiversService');
      const result = await createWaiverTemplate(
        { id: 'custom-id', name: 'Custom Waiver', slug: 'custom-slug', content: 'Custom content.' },
        'test-org-123',
      );

      expect(result.id).toBe('custom-id');
      expect(result.slug).toBe('custom-slug');
    });

    it('should generate slug from name when slug is not provided', async () => {
      const { db } = await import('@/libs/DB');

      const createdTemplate = {
        ...mockTemplate,
        name: 'My Special Waiver!',
        slug: 'my-special-waiver',
      };

      // Capture what was passed to values to verify slug generation
      const mockValues = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([createdTemplate]),
      });
      vi.mocked(db.insert).mockReturnValue({
        values: mockValues,
      } as any);

      const { createWaiverTemplate } = await import('./WaiversService');
      await createWaiverTemplate(
        { name: 'My Special Waiver!', content: 'Content' },
        'test-org-123',
      );

      // Verify slug was generated from the name
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'my-special-waiver' }),
      );
    });

    it('should unset other default templates when isDefault is true', async () => {
      const { db } = await import('@/libs/DB');

      const createdTemplate = {
        ...mockTemplate,
        isDefault: true,
      };

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as any);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([createdTemplate]),
        }),
      } as any);

      const { createWaiverTemplate } = await import('./WaiversService');
      const result = await createWaiverTemplate(
        { name: 'Default Waiver', content: 'Content', isDefault: true },
        'test-org-123',
      );

      expect(result.isDefault).toBe(true);
      // update should be called to unset other defaults
      expect(db.update).toHaveBeenCalledTimes(1);
    });

    it('should not unset other defaults when isDefault is false', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockTemplate]),
        }),
      } as any);

      const { createWaiverTemplate } = await import('./WaiversService');
      await createWaiverTemplate(
        { name: 'Non-default Waiver', content: 'Content', isDefault: false },
        'test-org-123',
      );

      expect(db.update).not.toHaveBeenCalled();
    });

    it('should throw when insert returns empty result', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const { createWaiverTemplate } = await import('./WaiversService');

      await expect(
        createWaiverTemplate({ name: 'Fail Waiver', content: 'Content' }, 'test-org-123'),
      ).rejects.toThrow('Failed to create waiver template');
    });

    it('should apply null-coalescing defaults when DB returns null for optional fields', async () => {
      const { db } = await import('@/libs/DB');

      const createdTemplateWithNulls = {
        ...mockTemplate,
        isActive: null,
        isDefault: null,
        requiresGuardian: null,
        guardianAgeThreshold: null,
        sortOrder: null,
      };

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([createdTemplateWithNulls]),
        }),
      } as any);

      const { createWaiverTemplate } = await import('./WaiversService');
      const result = await createWaiverTemplate(
        { name: 'Null Fields Waiver', content: 'Content' },
        'test-org-123',
      );

      expect(result.isActive).toBe(true);
      expect(result.isDefault).toBe(false);
      expect(result.requiresGuardian).toBe(true);
      expect(result.guardianAgeThreshold).toBe(16);
      expect(result.sortOrder).toBe(0);
    });

    it('should apply custom optional fields (requiresGuardian, guardianAgeThreshold)', async () => {
      const { db } = await import('@/libs/DB');

      const createdTemplate = {
        ...mockTemplate,
        requiresGuardian: false,
        guardianAgeThreshold: 18,
        isActive: false,
      };

      const mockValues = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([createdTemplate]),
      });
      vi.mocked(db.insert).mockReturnValue({
        values: mockValues,
      } as any);

      const { createWaiverTemplate } = await import('./WaiversService');
      const result = await createWaiverTemplate(
        {
          name: 'Custom Waiver',
          content: 'Content',
          requiresGuardian: false,
          guardianAgeThreshold: 18,
          isActive: false,
        },
        'test-org-123',
      );

      expect(result.requiresGuardian).toBe(false);
      expect(result.guardianAgeThreshold).toBe(18);
      expect(result.isActive).toBe(false);
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          requiresGuardian: false,
          guardianAgeThreshold: 18,
          isActive: false,
        }),
      );
    });
  });

  // ===========================================================================
  // updateWaiverTemplate (additional edge cases)
  // ===========================================================================

  describe('updateWaiverTemplate - additional edge cases', () => {
    it('should apply null-coalescing defaults when DB returns null for optional fields on update', async () => {
      const { db } = await import('@/libs/DB');

      const updatedTemplateWithNulls = {
        ...mockTemplate,
        name: 'Updated',
        isActive: null,
        isDefault: null,
        requiresGuardian: null,
        guardianAgeThreshold: null,
        sortOrder: null,
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockTemplate]),
        }),
      } as any);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedTemplateWithNulls]),
          }),
        }),
      } as any);

      const { updateWaiverTemplate } = await import('./WaiversService');
      const result = await updateWaiverTemplate(
        { id: 'template-1', name: 'Updated' },
        'test-org-123',
      );

      expect(result.template.isActive).toBe(true);
      expect(result.template.isDefault).toBe(false);
      expect(result.template.requiresGuardian).toBe(true);
      expect(result.template.guardianAgeThreshold).toBe(16);
      expect(result.template.sortOrder).toBe(0);
    });

    it('should throw when update returns empty result', async () => {
      const { db } = await import('@/libs/DB');

      // select: return existing template
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockTemplate]),
        }),
      } as any);

      // update: return empty result
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      const { updateWaiverTemplate } = await import('./WaiversService');

      await expect(
        updateWaiverTemplate({ id: 'template-1', name: 'Updated' }, 'test-org-123'),
      ).rejects.toThrow('Failed to update waiver template');
    });
  });

  // ===========================================================================
  // getMemberSignedWaivers
  // ===========================================================================

  describe('getMemberSignedWaivers', () => {
    const mockSignedWaiver = {
      id: 'signed-1',
      organizationId: 'test-org-123',
      waiverTemplateId: 'template-1',
      waiverTemplateVersion: 1,
      memberId: 'member-1',
      memberMembershipId: 'membership-1',
      signatureDataUrl: 'data:image/png;base64,abc123',
      signedByName: 'John Doe',
      signedByEmail: 'john@example.com',
      signedByRelationship: null,
      memberFirstName: 'John',
      memberLastName: 'Doe',
      memberEmail: 'john@example.com',
      memberDateOfBirth: new Date('1990-01-01'),
      memberAgeAtSigning: 34,
      renderedContent: 'Rendered waiver content for John Doe.',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      signedAt: new Date('2024-06-01'),
      createdAt: new Date('2024-06-01'),
      membershipPlanName: null,
      membershipPlanPrice: null,
      membershipPlanFrequency: null,
      membershipPlanContractLength: null,
      membershipPlanSignupFee: null,
      membershipPlanIsTrial: null,
      couponCode: null,
      couponType: null,
      couponAmount: null,
      couponDiscountedPrice: null,
    };

    it('should return signed waivers with template name for a member', async () => {
      const { db } = await import('@/libs/DB');

      let callCount = 0;
      vi.mocked(db.select).mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            // First call: signed waivers
            if (callCount === 1) {
              return Promise.resolve([mockSignedWaiver]);
            }
            // Second call: template names
            if (callCount === 2) {
              return Promise.resolve([{ id: 'template-1', name: 'Standard Adult Waiver' }]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any));

      const { getMemberSignedWaivers } = await import('./WaiversService');
      const result = await getMemberSignedWaivers('member-1');

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('signed-1');
      expect(result[0]?.memberId).toBe('member-1');
      expect(result[0]?.signedByName).toBe('John Doe');
      expect(result[0]?.signatureDataUrl).toBe('data:image/png;base64,abc123');
      expect(result[0]?.renderedContent).toBe('Rendered waiver content for John Doe.');
      expect(result[0]?.ipAddress).toBe('192.168.1.1');
      expect(result[0]?.userAgent).toBe('Mozilla/5.0');
      expect(result[0]?.waiverName).toBe('Standard Adult Waiver');
      // Two DB calls: signed waivers + template names
      expect(callCount).toBe(2);
    });

    it('should return empty array when member has no signed waivers', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const { getMemberSignedWaivers } = await import('./WaiversService');
      const result = await getMemberSignedWaivers('member-no-waivers');

      expect(result).toEqual([]);
      // Only one DB call; no second call for template names
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('should return multiple signed waivers with correct template names', async () => {
      const { db } = await import('@/libs/DB');

      const secondSignedWaiver = {
        ...mockSignedWaiver,
        id: 'signed-2',
        waiverTemplateId: 'template-2',
        waiverTemplateVersion: 2,
      };

      let callCount = 0;
      vi.mocked(db.select).mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([mockSignedWaiver, secondSignedWaiver]);
            }
            if (callCount === 2) {
              return Promise.resolve([
                { id: 'template-1', name: 'Standard Adult Waiver' },
                { id: 'template-2', name: 'Kids Program Waiver' },
              ]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any));

      const { getMemberSignedWaivers } = await import('./WaiversService');
      const result = await getMemberSignedWaivers('member-1');

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('signed-1');
      expect(result[0]?.waiverName).toBe('Standard Adult Waiver');
      expect(result[1]?.id).toBe('signed-2');
      expect(result[1]?.waiverName).toBe('Kids Program Waiver');
    });

    it('should correctly map nullable fields', async () => {
      const { db } = await import('@/libs/DB');

      const waiverWithNulls = {
        ...mockSignedWaiver,
        signedByEmail: null,
        signedByRelationship: null,
        memberMembershipId: null,
        memberDateOfBirth: null,
        memberAgeAtSigning: null,
        ipAddress: null,
        userAgent: null,
      };

      let callCount = 0;
      vi.mocked(db.select).mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([waiverWithNulls]);
            }
            if (callCount === 2) {
              return Promise.resolve([{ id: 'template-1', name: 'Standard Adult Waiver' }]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any));

      const { getMemberSignedWaivers } = await import('./WaiversService');
      const result = await getMemberSignedWaivers('member-1');

      expect(result[0]?.signedByEmail).toBeNull();
      expect(result[0]?.signedByRelationship).toBeNull();
      expect(result[0]?.memberMembershipId).toBeNull();
      expect(result[0]?.memberDateOfBirth).toBeNull();
      expect(result[0]?.memberAgeAtSigning).toBeNull();
      expect(result[0]?.ipAddress).toBeNull();
      expect(result[0]?.userAgent).toBeNull();
      expect(result[0]?.waiverName).toBe('Standard Adult Waiver');
    });

    it('should fallback to "Unknown Waiver" when template is not found', async () => {
      const { db } = await import('@/libs/DB');

      let callCount = 0;
      vi.mocked(db.select).mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([mockSignedWaiver]);
            }
            // Second call: return empty array (template not found)
            if (callCount === 2) {
              return Promise.resolve([]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any));

      const { getMemberSignedWaivers } = await import('./WaiversService');
      const result = await getMemberSignedWaivers('member-1');

      expect(result).toHaveLength(1);
      expect(result[0]?.waiverName).toBe('Unknown Waiver');
    });

    it('should deduplicate template IDs when multiple waivers reference the same template', async () => {
      const { db } = await import('@/libs/DB');

      const secondSignedWaiver = {
        ...mockSignedWaiver,
        id: 'signed-2',
        // Same template as first waiver
        waiverTemplateId: 'template-1',
        waiverTemplateVersion: 1,
      };

      let callCount = 0;
      vi.mocked(db.select).mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([mockSignedWaiver, secondSignedWaiver]);
            }
            if (callCount === 2) {
              return Promise.resolve([{ id: 'template-1', name: 'Standard Adult Waiver' }]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any));

      const { getMemberSignedWaivers } = await import('./WaiversService');
      const result = await getMemberSignedWaivers('member-1');

      expect(result).toHaveLength(2);
      expect(result[0]?.waiverName).toBe('Standard Adult Waiver');
      expect(result[1]?.waiverName).toBe('Standard Adult Waiver');
      // Only two DB calls even though there are two waivers with the same template
      expect(callCount).toBe(2);
    });
  });

  // ===========================================================================
  // getSignedWaiverById
  // ===========================================================================

  describe('getSignedWaiverById', () => {
    const mockSignedWaiver = {
      id: 'signed-1',
      organizationId: 'test-org-123',
      waiverTemplateId: 'template-1',
      waiverTemplateVersion: 1,
      memberId: 'member-1',
      memberMembershipId: 'membership-1',
      signatureDataUrl: 'data:image/png;base64,abc123',
      signedByName: 'John Doe',
      signedByEmail: 'john@example.com',
      signedByRelationship: null,
      memberFirstName: 'John',
      memberLastName: 'Doe',
      memberEmail: 'john@example.com',
      memberDateOfBirth: new Date('1990-01-01'),
      memberAgeAtSigning: 34,
      renderedContent: 'Rendered waiver content.',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      signedAt: new Date('2024-06-01'),
      createdAt: new Date('2024-06-01'),
      membershipPlanName: null,
      membershipPlanPrice: null,
      membershipPlanFrequency: null,
      membershipPlanContractLength: null,
      membershipPlanSignupFee: null,
      membershipPlanIsTrial: null,
      couponCode: null,
      couponType: null,
      couponAmount: null,
      couponDiscountedPrice: null,
    };

    it('should return signed waiver when found', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockSignedWaiver]),
        }),
      } as any);

      const { getSignedWaiverById } = await import('./WaiversService');
      const result = await getSignedWaiverById('signed-1', 'test-org-123');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('signed-1');
      expect(result?.organizationId).toBe('test-org-123');
      expect(result?.signedByName).toBe('John Doe');
      expect(result?.memberFirstName).toBe('John');
      expect(result?.memberLastName).toBe('Doe');
    });

    it('should return null when signed waiver not found', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const { getSignedWaiverById } = await import('./WaiversService');
      const result = await getSignedWaiverById('nonexistent', 'test-org-123');

      expect(result).toBeNull();
    });

    it('should return null when waiver belongs to different organization', async () => {
      const { db } = await import('@/libs/DB');

      // Simulate the where clause filtering out the wrong org
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const { getSignedWaiverById } = await import('./WaiversService');
      const result = await getSignedWaiverById('signed-1', 'wrong-org');

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // createSignedWaiver
  // ===========================================================================

  describe('createSignedWaiver', () => {
    const mockCreatedSignedWaiver = {
      id: 'signed-new',
      organizationId: 'test-org-123',
      waiverTemplateId: 'template-1',
      waiverTemplateVersion: 2,
      memberId: 'member-1',
      memberMembershipId: 'membership-1',
      signatureDataUrl: 'data:image/png;base64,signature',
      signedByName: 'Jane Doe',
      signedByEmail: 'jane@example.com',
      signedByRelationship: 'parent',
      memberFirstName: 'Billy',
      memberLastName: 'Doe',
      memberEmail: 'billy@example.com',
      memberDateOfBirth: new Date('2010-05-15'),
      memberAgeAtSigning: 14,
      renderedContent: 'Full rendered waiver for Billy Doe.',
      ipAddress: '10.0.0.1',
      userAgent: 'TestAgent/1.0',
      signedAt: new Date('2024-07-01'),
      createdAt: new Date('2024-07-01'),
      membershipPlanName: null,
      membershipPlanPrice: null,
      membershipPlanFrequency: null,
      membershipPlanContractLength: null,
      membershipPlanSignupFee: null,
      membershipPlanIsTrial: null,
      couponCode: null,
      couponType: null,
      couponAmount: null,
      couponDiscountedPrice: null,
    };

    it('should create a signed waiver with template version lookup', async () => {
      const { db } = await import('@/libs/DB');

      // First select: get the template to fetch version
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ ...mockTemplate, version: 2 }]),
        }),
      } as any);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockCreatedSignedWaiver]),
        }),
      } as any);

      const { createSignedWaiver } = await import('./WaiversService');
      const result = await createSignedWaiver(
        {
          waiverTemplateId: 'template-1',
          memberId: 'member-1',
          memberMembershipId: 'membership-1',
          signatureDataUrl: 'data:image/png;base64,signature',
          signedByName: 'Jane Doe',
          signedByEmail: 'jane@example.com',
          signedByRelationship: 'parent',
          memberFirstName: 'Billy',
          memberLastName: 'Doe',
          memberEmail: 'billy@example.com',
          memberDateOfBirth: new Date('2010-05-15'),
          memberAgeAtSigning: 14,
          renderedContent: 'Full rendered waiver for Billy Doe.',
          ipAddress: '10.0.0.1',
          userAgent: 'TestAgent/1.0',
        },
        'test-org-123',
      );

      expect(result.id).toBe('signed-new');
      expect(result.waiverTemplateVersion).toBe(2);
      expect(result.signedByName).toBe('Jane Doe');
      expect(result.memberFirstName).toBe('Billy');
      expect(db.insert).toHaveBeenCalledTimes(1);
    });

    it('should throw when waiver template is not found', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const { createSignedWaiver } = await import('./WaiversService');

      await expect(
        createSignedWaiver(
          {
            waiverTemplateId: 'nonexistent',
            memberId: 'member-1',
            signatureDataUrl: 'data:image/png;base64,sig',
            signedByName: 'Signer',
            memberFirstName: 'First',
            memberLastName: 'Last',
            memberEmail: 'test@example.com',
            renderedContent: 'Content.',
          },
          'test-org-123',
        ),
      ).rejects.toThrow('Waiver template not found');
    });

    it('should throw when insert returns empty result', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ ...mockTemplate, version: 1 }]),
        }),
      } as any);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const { createSignedWaiver } = await import('./WaiversService');

      await expect(
        createSignedWaiver(
          {
            waiverTemplateId: 'template-1',
            memberId: 'member-1',
            signatureDataUrl: 'data:image/png;base64,sig',
            signedByName: 'Signer',
            memberFirstName: 'First',
            memberLastName: 'Last',
            memberEmail: 'test@example.com',
            renderedContent: 'Content.',
          },
          'test-org-123',
        ),
      ).rejects.toThrow('Failed to create signed waiver');
    });

    it('should use provided id when given', async () => {
      const { db } = await import('@/libs/DB');

      const customIdWaiver = { ...mockCreatedSignedWaiver, id: 'custom-signed-id' };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockTemplate]),
        }),
      } as any);

      const mockValues = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([customIdWaiver]),
      });
      vi.mocked(db.insert).mockReturnValue({
        values: mockValues,
      } as any);

      const { createSignedWaiver } = await import('./WaiversService');
      const result = await createSignedWaiver(
        {
          id: 'custom-signed-id',
          waiverTemplateId: 'template-1',
          memberId: 'member-1',
          signatureDataUrl: 'data:image/png;base64,sig',
          signedByName: 'Signer',
          memberFirstName: 'First',
          memberLastName: 'Last',
          memberEmail: 'test@example.com',
          renderedContent: 'Content.',
        },
        'test-org-123',
      );

      expect(result.id).toBe('custom-signed-id');
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'custom-signed-id' }),
      );
    });

    it('should pass through coupon fields when provided', async () => {
      const { db } = await import('@/libs/DB');

      const waiverWithCoupon = {
        ...mockCreatedSignedWaiver,
        id: 'signed-coupon',
        couponCode: 'SAVE15',
        couponType: 'Percentage',
        couponAmount: '15%',
        couponDiscountedPrice: 127.5,
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ ...mockTemplate, version: 2 }]),
        }),
      } as any);

      const mockValues = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([waiverWithCoupon]),
      });
      vi.mocked(db.insert).mockReturnValue({
        values: mockValues,
      } as any);

      const { createSignedWaiver } = await import('./WaiversService');
      const result = await createSignedWaiver(
        {
          waiverTemplateId: 'template-1',
          memberId: 'member-1',
          memberMembershipId: 'membership-1',
          signatureDataUrl: 'data:image/png;base64,signature',
          signedByName: 'Jane Doe',
          signedByEmail: 'jane@example.com',
          signedByRelationship: 'parent',
          memberFirstName: 'Billy',
          memberLastName: 'Doe',
          memberEmail: 'billy@example.com',
          memberDateOfBirth: new Date('2010-05-15'),
          memberAgeAtSigning: 14,
          renderedContent: 'Full rendered waiver for Billy Doe.',
          ipAddress: '10.0.0.1',
          userAgent: 'TestAgent/1.0',
          couponCode: 'SAVE15',
          couponType: 'Percentage',
          couponAmount: '15%',
          couponDiscountedPrice: 127.5,
        },
        'test-org-123',
      );

      expect(result.id).toBe('signed-coupon');
      expect(result.couponCode).toBe('SAVE15');
      expect(result.couponType).toBe('Percentage');
      expect(result.couponAmount).toBe('15%');
      expect(result.couponDiscountedPrice).toBe(127.5);
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          couponCode: 'SAVE15',
          couponType: 'Percentage',
          couponAmount: '15%',
          couponDiscountedPrice: 127.5,
        }),
      );
    });
  });

  // ===========================================================================
  // getWaiversForMembershipPlan
  // ===========================================================================

  describe('getWaiversForMembershipPlan', () => {
    it('should return empty array when no associations exist', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const { getWaiversForMembershipPlan } = await import('./WaiversService');
      const result = await getWaiversForMembershipPlan('plan-1');

      expect(result).toEqual([]);
    });

    it('should return waiver templates sorted by association sortOrder', async () => {
      const { db } = await import('@/libs/DB');

      const associations = [
        { waiverTemplateId: 'template-2', membershipPlanId: 'plan-1', sortOrder: 1 },
        { waiverTemplateId: 'template-1', membershipPlanId: 'plan-1', sortOrder: 0 },
      ];

      const waiver1 = { ...mockTemplate, id: 'template-1', name: 'Waiver A' };
      const waiver2 = { ...mockTemplate, id: 'template-2', name: 'Waiver B' };

      let callCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve(associations);
            }
            if (callCount === 2) {
              // Return in random order; function should sort by association sortOrder
              return Promise.resolve([waiver2, waiver1]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any);

      const { getWaiversForMembershipPlan } = await import('./WaiversService');
      const result = await getWaiversForMembershipPlan('plan-1');

      expect(result).toHaveLength(2);
      // Should be sorted by sortOrder: template-1 (0) first, template-2 (1) second
      expect(result[0]?.id).toBe('template-1');
      expect(result[0]?.sortOrder).toBe(0);
      expect(result[1]?.id).toBe('template-2');
      expect(result[1]?.sortOrder).toBe(1);
    });

    it('should handle null sortOrder in associations', async () => {
      const { db } = await import('@/libs/DB');

      const associations = [
        { waiverTemplateId: 'template-1', membershipPlanId: 'plan-1', sortOrder: null },
      ];

      let callCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve(associations);
            }
            if (callCount === 2) {
              return Promise.resolve([mockTemplate]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any);

      const { getWaiversForMembershipPlan } = await import('./WaiversService');
      const result = await getWaiversForMembershipPlan('plan-1');

      expect(result).toHaveLength(1);
      expect(result[0]?.sortOrder).toBe(0);
    });

    it('should apply null-coalescing defaults for nullable fields on waiver templates', async () => {
      const { db } = await import('@/libs/DB');

      const associations = [
        { waiverTemplateId: 'template-1', membershipPlanId: 'plan-1', sortOrder: 0 },
      ];

      const waiverWithNulls = {
        ...mockTemplate,
        isActive: null,
        isDefault: null,
        requiresGuardian: null,
        guardianAgeThreshold: null,
      };

      let callCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve(associations);
            }
            if (callCount === 2) {
              return Promise.resolve([waiverWithNulls]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any);

      const { getWaiversForMembershipPlan } = await import('./WaiversService');
      const result = await getWaiversForMembershipPlan('plan-1');

      expect(result).toHaveLength(1);
      expect(result[0]?.isActive).toBe(true);
      expect(result[0]?.isDefault).toBe(false);
      expect(result[0]?.requiresGuardian).toBe(true);
      expect(result[0]?.guardianAgeThreshold).toBe(16);
    });
  });

  // ===========================================================================
  // getMembershipsForWaiverTemplate
  // ===========================================================================

  describe('getMembershipsForWaiverTemplate', () => {
    it('should return membership plan IDs associated with a waiver template', async () => {
      const { db } = await import('@/libs/DB');

      const associations = [
        { membershipPlanId: 'plan-1', waiverTemplateId: 'template-1' },
        { membershipPlanId: 'plan-2', waiverTemplateId: 'template-1' },
      ];

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(associations),
        }),
      } as any);

      const { getMembershipsForWaiverTemplate } = await import('./WaiversService');
      const result = await getMembershipsForWaiverTemplate('template-1');

      expect(result).toEqual(['plan-1', 'plan-2']);
    });

    it('should return empty array when no associations exist', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const { getMembershipsForWaiverTemplate } = await import('./WaiversService');
      const result = await getMembershipsForWaiverTemplate('template-no-assoc');

      expect(result).toEqual([]);
    });
  });

  // ===========================================================================
  // setMembershipPlanWaivers
  // ===========================================================================

  describe('setMembershipPlanWaivers', () => {
    it('should remove existing associations and add new ones', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      } as any);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      } as any);

      const { setMembershipPlanWaivers } = await import('./WaiversService');
      await setMembershipPlanWaivers('plan-1', ['template-1', 'template-2']);

      expect(db.delete).toHaveBeenCalledTimes(1);
      expect(db.insert).toHaveBeenCalledTimes(1);
    });

    it('should only delete when waiverTemplateIds is empty', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      } as any);

      const { setMembershipPlanWaivers } = await import('./WaiversService');
      await setMembershipPlanWaivers('plan-1', []);

      expect(db.delete).toHaveBeenCalledTimes(1);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('should assign sortOrder based on array index', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      } as any);

      const mockValues = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.insert).mockReturnValue({
        values: mockValues,
      } as any);

      const { setMembershipPlanWaivers } = await import('./WaiversService');
      await setMembershipPlanWaivers('plan-1', ['template-a', 'template-b', 'template-c']);

      expect(mockValues).toHaveBeenCalledWith([
        { membershipPlanId: 'plan-1', waiverTemplateId: 'template-a', isRequired: true, sortOrder: 0 },
        { membershipPlanId: 'plan-1', waiverTemplateId: 'template-b', isRequired: true, sortOrder: 1 },
        { membershipPlanId: 'plan-1', waiverTemplateId: 'template-c', isRequired: true, sortOrder: 2 },
      ]);
    });
  });

  // ===========================================================================
  // addWaiverToMembershipPlan
  // ===========================================================================

  describe('addWaiverToMembershipPlan', () => {
    it('should add waiver with sortOrder one more than max existing', async () => {
      const { db } = await import('@/libs/DB');

      const existingAssociations = [
        { membershipPlanId: 'plan-1', waiverTemplateId: 'template-1', sortOrder: 0 },
        { membershipPlanId: 'plan-1', waiverTemplateId: 'template-2', sortOrder: 1 },
      ];

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(existingAssociations),
        }),
      } as any);

      const mockValues = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.insert).mockReturnValue({
        values: mockValues,
      } as any);

      const { addWaiverToMembershipPlan } = await import('./WaiversService');
      await addWaiverToMembershipPlan('plan-1', 'template-3');

      expect(mockValues).toHaveBeenCalledWith({
        membershipPlanId: 'plan-1',
        waiverTemplateId: 'template-3',
        isRequired: true,
        sortOrder: 2,
      });
    });

    it('should default isRequired to true', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const mockValues = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.insert).mockReturnValue({
        values: mockValues,
      } as any);

      const { addWaiverToMembershipPlan } = await import('./WaiversService');
      await addWaiverToMembershipPlan('plan-1', 'template-1');

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({ isRequired: true }),
      );
    });

    it('should accept custom isRequired parameter', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const mockValues = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.insert).mockReturnValue({
        values: mockValues,
      } as any);

      const { addWaiverToMembershipPlan } = await import('./WaiversService');
      await addWaiverToMembershipPlan('plan-1', 'template-1', false);

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({ isRequired: false }),
      );
    });

    it('should start sortOrder at 0 when no existing associations', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const mockValues = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.insert).mockReturnValue({
        values: mockValues,
      } as any);

      const { addWaiverToMembershipPlan } = await import('./WaiversService');
      await addWaiverToMembershipPlan('plan-1', 'template-1');

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({ sortOrder: 0 }),
      );
    });

    it('should handle null sortOrder in existing associations', async () => {
      const { db } = await import('@/libs/DB');

      const existingAssociations = [
        { membershipPlanId: 'plan-1', waiverTemplateId: 'template-1', sortOrder: null },
      ];

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(existingAssociations),
        }),
      } as any);

      const mockValues = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.insert).mockReturnValue({
        values: mockValues,
      } as any);

      const { addWaiverToMembershipPlan } = await import('./WaiversService');
      await addWaiverToMembershipPlan('plan-1', 'template-2');

      // null sortOrder treated as 0, so max is 0, new one is 1
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({ sortOrder: 1 }),
      );
    });
  });

  // ===========================================================================
  // removeWaiverFromMembershipPlan
  // ===========================================================================

  describe('removeWaiverFromMembershipPlan', () => {
    it('should delete the association between membership plan and waiver', async () => {
      const { db } = await import('@/libs/DB');

      const mockWhere = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.delete).mockReturnValue({
        where: mockWhere,
      } as any);

      const { removeWaiverFromMembershipPlan } = await import('./WaiversService');
      await removeWaiverFromMembershipPlan('plan-1', 'template-1');

      expect(db.delete).toHaveBeenCalledTimes(1);
      expect(mockWhere).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // getMembershipPlansWithWaiver
  // ===========================================================================

  describe('getMembershipPlansWithWaiver', () => {
    it('should return empty array when no associations exist', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const { getMembershipPlansWithWaiver } = await import('./WaiversService');
      const result = await getMembershipPlansWithWaiver('template-1', 'test-org-123');

      expect(result).toEqual([]);
    });

    it('should return membership plans associated with a waiver', async () => {
      const { db } = await import('@/libs/DB');

      const associations = [
        { membershipPlanId: 'plan-1', waiverTemplateId: 'template-1' },
        { membershipPlanId: 'plan-2', waiverTemplateId: 'template-1' },
      ];

      const memberships = [
        { id: 'plan-1', name: 'Basic Plan' },
        { id: 'plan-2', name: 'Premium Plan' },
      ];

      let callCount = 0;
      vi.mocked(db.select).mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve(associations);
            }
            if (callCount === 2) {
              return Promise.resolve(memberships);
            }
            return Promise.resolve([]);
          }),
        }),
      } as any));

      const { getMembershipPlansWithWaiver } = await import('./WaiversService');
      const result = await getMembershipPlansWithWaiver('template-1', 'test-org-123');

      expect(result).toHaveLength(2);
      expect(result).toEqual([
        { id: 'plan-1', name: 'Basic Plan' },
        { id: 'plan-2', name: 'Premium Plan' },
      ]);
    });
  });

  // ===========================================================================
  // getOrganizationMergeFields
  // ===========================================================================

  describe('getOrganizationMergeFields', () => {
    const mockMergeField = {
      id: 'field-1',
      organizationId: 'test-org-123',
      key: 'academy',
      label: 'Academy Name',
      defaultValue: 'My Dojo',
      description: 'The name of the academy',
      sortOrder: 0,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    it('should return merge fields for an organization', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockMergeField]),
        }),
      } as any);

      const { getOrganizationMergeFields } = await import('./WaiversService');
      const result = await getOrganizationMergeFields('test-org-123');

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('field-1');
      expect(result[0]?.key).toBe('academy');
      expect(result[0]?.label).toBe('Academy Name');
      expect(result[0]?.defaultValue).toBe('My Dojo');
      expect(result[0]?.description).toBe('The name of the academy');
    });

    it('should return empty array when no merge fields exist', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const { getOrganizationMergeFields } = await import('./WaiversService');
      const result = await getOrganizationMergeFields('test-org-123');

      expect(result).toEqual([]);
    });

    it('should handle null sortOrder by defaulting to 0', async () => {
      const { db } = await import('@/libs/DB');

      const fieldWithNullSort = { ...mockMergeField, sortOrder: null };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([fieldWithNullSort]),
        }),
      } as any);

      const { getOrganizationMergeFields } = await import('./WaiversService');
      const result = await getOrganizationMergeFields('test-org-123');

      expect(result[0]?.sortOrder).toBe(0);
    });

    it('should return multiple merge fields', async () => {
      const { db } = await import('@/libs/DB');

      const secondField = {
        ...mockMergeField,
        id: 'field-2',
        key: 'academy_owners',
        label: 'Academy Owners',
        defaultValue: 'John & Jane',
        description: null,
        sortOrder: 1,
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockMergeField, secondField]),
        }),
      } as any);

      const { getOrganizationMergeFields } = await import('./WaiversService');
      const result = await getOrganizationMergeFields('test-org-123');

      expect(result).toHaveLength(2);
      expect(result[0]?.key).toBe('academy');
      expect(result[1]?.key).toBe('academy_owners');
      expect(result[1]?.description).toBeNull();
    });
  });

  // ===========================================================================
  // createMergeField
  // ===========================================================================

  describe('createMergeField', () => {
    const mockCreatedField = {
      id: 'new-field-id',
      organizationId: 'test-org-123',
      key: 'phone',
      label: 'Phone Number',
      defaultValue: '555-0000',
      description: 'Main phone line',
      sortOrder: 0,
      createdAt: new Date('2024-06-01'),
      updatedAt: new Date('2024-06-01'),
    };

    it('should create a merge field and return it', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockCreatedField]),
        }),
      } as any);

      const { createMergeField } = await import('./WaiversService');
      const result = await createMergeField(
        { key: 'phone', label: 'Phone Number', defaultValue: '555-0000', description: 'Main phone line' },
        'test-org-123',
      );

      expect(result.key).toBe('phone');
      expect(result.label).toBe('Phone Number');
      expect(result.defaultValue).toBe('555-0000');
      expect(result.description).toBe('Main phone line');
      expect(db.insert).toHaveBeenCalledTimes(1);
    });

    it('should create a merge field without description', async () => {
      const { db } = await import('@/libs/DB');

      const fieldWithoutDesc = { ...mockCreatedField, description: null };

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([fieldWithoutDesc]),
        }),
      } as any);

      const { createMergeField } = await import('./WaiversService');
      const result = await createMergeField(
        { key: 'phone', label: 'Phone Number', defaultValue: '555-0000' },
        'test-org-123',
      );

      expect(result.description).toBeNull();
    });

    it('should throw when insert returns empty result', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const { createMergeField } = await import('./WaiversService');

      await expect(
        createMergeField(
          { key: 'fail', label: 'Fail', defaultValue: 'value' },
          'test-org-123',
        ),
      ).rejects.toThrow('Failed to create merge field');
    });
  });

  // ===========================================================================
  // updateMergeField
  // ===========================================================================

  describe('updateMergeField', () => {
    const mockUpdatedField = {
      id: 'field-1',
      organizationId: 'test-org-123',
      key: 'academy',
      label: 'Updated Academy',
      defaultValue: 'Updated Dojo',
      description: 'Updated description',
      sortOrder: 0,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-07-01'),
    };

    it('should update a merge field and return it', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockUpdatedField]),
          }),
        }),
      } as any);

      const { updateMergeField } = await import('./WaiversService');
      const result = await updateMergeField(
        'field-1',
        { label: 'Updated Academy', defaultValue: 'Updated Dojo', description: 'Updated description' },
        'test-org-123',
      );

      expect(result.label).toBe('Updated Academy');
      expect(result.defaultValue).toBe('Updated Dojo');
      expect(result.description).toBe('Updated description');
    });

    it('should throw when merge field is not found', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      const { updateMergeField } = await import('./WaiversService');

      await expect(
        updateMergeField('nonexistent', { label: 'Test' }, 'test-org-123'),
      ).rejects.toThrow('Merge field not found');
    });

    it('should allow setting description to null', async () => {
      const { db } = await import('@/libs/DB');

      const fieldWithNullDesc = { ...mockUpdatedField, description: null };

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([fieldWithNullDesc]),
          }),
        }),
      } as any);

      const { updateMergeField } = await import('./WaiversService');
      const result = await updateMergeField(
        'field-1',
        { description: null },
        'test-org-123',
      );

      expect(result.description).toBeNull();
    });

    it('should allow partial updates (only label)', async () => {
      const { db } = await import('@/libs/DB');

      const partialUpdate = { ...mockUpdatedField, label: 'Only Label Changed' };

      const mockSet = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([partialUpdate]),
        }),
      });
      vi.mocked(db.update).mockReturnValue({
        set: mockSet,
      } as any);

      const { updateMergeField } = await import('./WaiversService');
      const result = await updateMergeField(
        'field-1',
        { label: 'Only Label Changed' },
        'test-org-123',
      );

      expect(result.label).toBe('Only Label Changed');
      expect(mockSet).toHaveBeenCalledWith({ label: 'Only Label Changed' });
    });
  });

  // ===========================================================================
  // deleteMergeField
  // ===========================================================================

  describe('deleteMergeField', () => {
    it('should delete a merge field by id and organization', async () => {
      const { db } = await import('@/libs/DB');

      const mockWhere = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.delete).mockReturnValue({
        where: mockWhere,
      } as any);

      const { deleteMergeField } = await import('./WaiversService');
      await deleteMergeField('field-1', 'test-org-123');

      expect(db.delete).toHaveBeenCalledTimes(1);
      expect(mockWhere).toHaveBeenCalledTimes(1);
    });

    it('should not throw when deleting a non-existent merge field', async () => {
      const { db } = await import('@/libs/DB');

      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      } as any);

      const { deleteMergeField } = await import('./WaiversService');

      await expect(deleteMergeField('nonexistent', 'test-org-123')).resolves.toBeUndefined();
    });
  });
});

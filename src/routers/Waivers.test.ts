import type { AuditContext } from '@/types/Audit';
import { ORPCError } from '@orpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';

// =============================================================================
// MOCKS
// =============================================================================

vi.mock('@/libs/DB', () => ({
  db: {},
}));

vi.mock('@/libs/Logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@/services/AuditService', () => ({
  audit: vi.fn(),
}));

vi.mock('@/services/WaiversService', () => ({
  // Real error class so the router's `instanceof WaiverNotFoundError` check
  // (in toOrpcError) resolves to a 404 rather than throwing on an undefined.
  WaiverNotFoundError: class WaiverNotFoundError extends Error {
    constructor(message = 'Waiver resource not found') {
      super(message);
      this.name = 'WaiverNotFoundError';
    }
  },
  getOrganizationWaiverTemplates: vi.fn(),
  getActiveWaiverTemplates: vi.fn(),
  getWaiverTemplateById: vi.fn(),
  getMembershipPlansWithWaiver: vi.fn(),
  createWaiverTemplate: vi.fn(),
  updateWaiverTemplate: vi.fn(),
  deleteWaiverTemplate: vi.fn(),
  getWaiverTemplateVersionHistory: vi.fn(),
  getWaiverTemplateVersion: vi.fn(),
  getMemberSignedWaivers: vi.fn(),
  getSignedWaiverById: vi.fn(),
  createSignedWaiver: vi.fn(),
  getWaiversForMembershipPlan: vi.fn(),
  setMembershipPlanWaivers: vi.fn(),
  setWaiverMembershipPlans: vi.fn(),
  addWaiverToMembershipPlan: vi.fn(),
  removeWaiverFromMembershipPlan: vi.fn(),
  getOrganizationMergeFields: vi.fn(),
  createMergeField: vi.fn(),
  updateMergeField: vi.fn(),
  deleteMergeField: vi.fn(),
  resolveWaiverPlaceholders: vi.fn(),
}));

vi.mock('./AuthGuards', () => ({
  guardRole: vi.fn(),
}));

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Invokes an ORPC handler's internal function directly, bypassing
 * the ORPC middleware pipeline but executing the user-defined handler logic.
 */
function callHandler(handler: unknown, input?: unknown) {
  const h = handler as { '~orpc': { handler: (args: Record<string, unknown>) => unknown } };
  return h['~orpc'].handler({ input, context: undefined, errors: undefined });
}

const mockContext: AuditContext = {
  userId: 'test-user-123',
  orgId: 'test-org-456',
  role: ORG_ROLE.ACADEMY_OWNER,
};

const mockFrontDeskContext: AuditContext = {
  userId: 'test-user-123',
  orgId: 'test-org-456',
  role: ORG_ROLE.FRONT_DESK,
};

const mockTemplate = {
  id: 'template-1',
  organizationId: 'test-org-456',
  name: 'Standard Waiver',
  slug: 'standard-waiver',
  version: 1,
  content: 'This is the waiver content that is more than one hundred characters long so it passes the Zod validation for the minimum content length requirement.',
  description: 'Standard training waiver',
  isActive: true,
  isDefault: false,
  requiresGuardian: true,
  guardianAgeThreshold: 16,
  sortOrder: 0,
  parentId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  signedCount: 5,
  membershipCount: 2,
};

const mockSignedWaiver = {
  id: 'signed-waiver-1',
  organizationId: 'test-org-456',
  waiverTemplateId: 'template-1',
  waiverTemplateVersion: 1,
  memberId: 'member-1',
  memberMembershipId: null,
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
  signatureDataUrl: 'data:image/png;base64,abc123',
  signedByName: 'John Doe',
  signedByEmail: 'john@example.com',
  signedByRelationship: 'self',
  memberFirstName: 'John',
  memberLastName: 'Doe',
  memberEmail: 'john@example.com',
  memberDateOfBirth: null,
  memberAgeAtSigning: 25,
  renderedContent: 'Rendered waiver content here',
  ipAddress: '127.0.0.1',
  userAgent: 'Test Agent',
  signedAt: new Date(),
  createdAt: new Date(),
};

const mockMergeField = {
  id: 'merge-field-1',
  organizationId: 'test-org-456',
  key: 'dojo_name',
  label: 'Dojo Name',
  defaultValue: 'Test Dojo',
  description: 'The name of the dojo',
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// =============================================================================
// TESTS
// =============================================================================

describe('Waivers Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // WAIVER TEMPLATE HANDLERS
  // ===========================================================================

  describe('listTemplates', () => {
    it('should return templates on success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getOrganizationWaiverTemplates } = await import('@/services/WaiversService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getOrganizationWaiverTemplates).mockResolvedValue([mockTemplate]);

      const { listTemplates } = await import('./Waivers');
      const result = await callHandler(listTemplates);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(getOrganizationWaiverTemplates).toHaveBeenCalledWith('test-org-456');
      expect(result).toEqual({ templates: [mockTemplate] });
    });

    it('should re-throw ORPCError from service', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getOrganizationWaiverTemplates } = await import('@/services/WaiversService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getOrganizationWaiverTemplates).mockRejectedValue(
        new ORPCError('Service error', { status: 400 }),
      );

      const { listTemplates } = await import('./Waivers');

      await expect(callHandler(listTemplates)).rejects.toThrow(ORPCError);
      await expect(callHandler(listTemplates)).rejects.toMatchObject({
        message: 'Service error',
        status: 400,
      });
    });

    it('should wrap unknown errors in generic ORPCError', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getOrganizationWaiverTemplates } = await import('@/services/WaiversService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getOrganizationWaiverTemplates).mockRejectedValue(new Error('DB connection lost'));

      const { listTemplates } = await import('./Waivers');

      await expect(callHandler(listTemplates)).rejects.toMatchObject({
        message: 'Failed to fetch waiver templates.',
        status: 500,
      });
    });
  });

  describe('listActiveTemplates', () => {
    it('should return active templates on success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getActiveWaiverTemplates } = await import('@/services/WaiversService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getActiveWaiverTemplates).mockResolvedValue([mockTemplate]);

      const { listActiveTemplates } = await import('./Waivers');
      const result = await callHandler(listActiveTemplates);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(getActiveWaiverTemplates).toHaveBeenCalledWith('test-org-456');
      expect(result).toEqual({ templates: [mockTemplate] });
    });

    it('should re-throw ORPCError from service', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getActiveWaiverTemplates } = await import('@/services/WaiversService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getActiveWaiverTemplates).mockRejectedValue(
        new ORPCError('Not found', { status: 404 }),
      );

      const { listActiveTemplates } = await import('./Waivers');

      await expect(callHandler(listActiveTemplates)).rejects.toMatchObject({
        message: 'Not found',
        status: 404,
      });
    });

    it('should wrap unknown errors in generic ORPCError', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getActiveWaiverTemplates } = await import('@/services/WaiversService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getActiveWaiverTemplates).mockRejectedValue(new Error('Something went wrong'));

      const { listActiveTemplates } = await import('./Waivers');

      await expect(callHandler(listActiveTemplates)).rejects.toMatchObject({
        message: 'Failed to fetch waiver templates.',
        status: 500,
      });
    });
  });

  describe('getTemplate', () => {
    it('should return template with memberships on success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getWaiverTemplateById, getMembershipPlansWithWaiver } = await import('@/services/WaiversService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getWaiverTemplateById).mockResolvedValue(mockTemplate);
      vi.mocked(getMembershipPlansWithWaiver).mockResolvedValue([
        { id: 'plan-1', name: 'Basic Plan' },
      ]);

      const { getTemplate } = await import('./Waivers');
      const result = await callHandler(getTemplate, { id: 'template-1' });

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(getWaiverTemplateById).toHaveBeenCalledWith('template-1', 'test-org-456');
      expect(getMembershipPlansWithWaiver).toHaveBeenCalledWith('template-1', 'test-org-456');
      expect(result).toEqual({
        template: mockTemplate,
        memberships: [{ id: 'plan-1', name: 'Basic Plan' }],
      });
    });

    it('should throw 404 when template not found', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getWaiverTemplateById } = await import('@/services/WaiversService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getWaiverTemplateById).mockResolvedValue(null);

      const { getTemplate } = await import('./Waivers');

      await expect(callHandler(getTemplate, { id: 'nonexistent' })).rejects.toMatchObject({
        message: 'Waiver template not found',
        status: 404,
      });
    });

    it('should wrap unknown errors in generic ORPCError', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getWaiverTemplateById } = await import('@/services/WaiversService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getWaiverTemplateById).mockRejectedValue(new Error('DB error'));

      const { getTemplate } = await import('./Waivers');

      await expect(callHandler(getTemplate, { id: 'template-1' })).rejects.toMatchObject({
        message: 'Failed to fetch waiver template.',
        status: 500,
      });
    });
  });

  describe('createTemplate', () => {
    const createInput = {
      name: 'New Waiver',
      content: 'This is the waiver content that is more than one hundred characters long so it passes the Zod validation for the minimum content length requirement.',
      description: 'A new waiver',
      isActive: true,
      isDefault: false,
      requiresGuardian: true,
      guardianAgeThreshold: 16,
    };

    it('should create template and audit on success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { createWaiverTemplate } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(createWaiverTemplate).mockResolvedValue(mockTemplate);

      const { createTemplate } = await import('./Waivers');
      const result = await callHandler(createTemplate, createInput);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.ACADEMY_OWNER);
      expect(createWaiverTemplate).toHaveBeenCalledWith(createInput, 'test-org-456');
      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.WAIVER_TEMPLATE_CREATE,
        AUDIT_ENTITY_TYPE.WAIVER_TEMPLATE,
        { entityId: 'template-1', status: 'success' },
      );
      expect(result).toEqual({ template: mockTemplate });
    });

    it('should audit failure and re-throw ORPCError on error', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { createWaiverTemplate } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(createWaiverTemplate).mockRejectedValue(
        new ORPCError('Duplicate name', { status: 409 }),
      );

      const { createTemplate } = await import('./Waivers');

      await expect(callHandler(createTemplate, createInput)).rejects.toMatchObject({
        message: 'Duplicate name',
        status: 409,
      });

      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.WAIVER_TEMPLATE_CREATE,
        AUDIT_ENTITY_TYPE.WAIVER_TEMPLATE,
        { status: 'failure', error: 'Duplicate name' },
      );
    });

    it('should audit failure and wrap unknown errors in generic ORPCError', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { createWaiverTemplate } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(createWaiverTemplate).mockRejectedValue(new Error('DB connection failed'));

      const { createTemplate } = await import('./Waivers');

      await expect(callHandler(createTemplate, createInput)).rejects.toMatchObject({
        message: 'Failed to create waiver template.',
        status: 500,
      });

      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.WAIVER_TEMPLATE_CREATE,
        AUDIT_ENTITY_TYPE.WAIVER_TEMPLATE,
        { status: 'failure', error: 'DB connection failed' },
      );
    });
  });

  describe('updateTemplate', () => {
    const updateInput = { id: 'template-1', name: 'Updated Waiver' };

    it('should update template and audit on success (no version created)', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateWaiverTemplate } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(updateWaiverTemplate).mockResolvedValue({
        template: mockTemplate,
        versionCreated: false,
      });

      const { updateTemplate } = await import('./Waivers');
      const result = await callHandler(updateTemplate, updateInput);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.ACADEMY_OWNER);
      expect(updateWaiverTemplate).toHaveBeenCalledWith(updateInput, 'test-org-456');
      expect(audit).toHaveBeenCalledTimes(1);
      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.WAIVER_TEMPLATE_UPDATE,
        AUDIT_ENTITY_TYPE.WAIVER_TEMPLATE,
        { entityId: 'template-1', status: 'success' },
      );
      expect(result).toEqual({ template: mockTemplate });
    });

    it('should audit both update and version creation when content changes', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateWaiverTemplate } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(updateWaiverTemplate).mockResolvedValue({
        template: { ...mockTemplate, version: 2 },
        versionCreated: true,
      });

      const { updateTemplate } = await import('./Waivers');
      await callHandler(updateTemplate, updateInput);

      expect(audit).toHaveBeenCalledTimes(2);
      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.WAIVER_TEMPLATE_UPDATE,
        AUDIT_ENTITY_TYPE.WAIVER_TEMPLATE,
        { entityId: 'template-1', status: 'success' },
      );
      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.WAIVER_TEMPLATE_VERSION_CREATE,
        AUDIT_ENTITY_TYPE.WAIVER_TEMPLATE,
        { entityId: 'template-1', status: 'success' },
      );
    });

    it('should audit failure and re-throw ORPCError on error', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateWaiverTemplate } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(updateWaiverTemplate).mockRejectedValue(
        new ORPCError('Template not found', { status: 404 }),
      );

      const { updateTemplate } = await import('./Waivers');

      await expect(callHandler(updateTemplate, updateInput)).rejects.toMatchObject({
        message: 'Template not found',
        status: 404,
      });

      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.WAIVER_TEMPLATE_UPDATE,
        AUDIT_ENTITY_TYPE.WAIVER_TEMPLATE,
        { entityId: 'template-1', status: 'failure', error: 'Template not found' },
      );
    });

    it('should audit failure and wrap unknown errors in generic ORPCError', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateWaiverTemplate } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(updateWaiverTemplate).mockRejectedValue(new Error('Unexpected failure'));

      const { updateTemplate } = await import('./Waivers');

      await expect(callHandler(updateTemplate, updateInput)).rejects.toMatchObject({
        message: 'Failed to update waiver template.',
        status: 500,
      });

      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.WAIVER_TEMPLATE_UPDATE,
        AUDIT_ENTITY_TYPE.WAIVER_TEMPLATE,
        { entityId: 'template-1', status: 'failure', error: 'Unexpected failure' },
      );
    });
  });

  describe('deleteTemplate', () => {
    const deleteInput = { id: 'template-1' };

    it('should delete template and audit on success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { deleteWaiverTemplate } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(deleteWaiverTemplate).mockResolvedValue(undefined);

      const { deleteTemplate } = await import('./Waivers');
      const result = await callHandler(deleteTemplate, deleteInput);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.ACADEMY_OWNER);
      expect(deleteWaiverTemplate).toHaveBeenCalledWith('template-1', 'test-org-456');
      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.WAIVER_TEMPLATE_DELETE,
        AUDIT_ENTITY_TYPE.WAIVER_TEMPLATE,
        { entityId: 'template-1', status: 'success' },
      );
      expect(result).toEqual({});
    });

    it('should audit failure and re-throw ORPCError on error', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { deleteWaiverTemplate } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(deleteWaiverTemplate).mockRejectedValue(
        new ORPCError('Cannot delete', { status: 409 }),
      );

      const { deleteTemplate } = await import('./Waivers');

      await expect(callHandler(deleteTemplate, deleteInput)).rejects.toMatchObject({
        message: 'Cannot delete',
        status: 409,
      });

      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.WAIVER_TEMPLATE_DELETE,
        AUDIT_ENTITY_TYPE.WAIVER_TEMPLATE,
        { entityId: 'template-1', status: 'failure', error: 'Cannot delete' },
      );
    });

    it('should audit failure and wrap unknown errors in ORPCError with error message', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { deleteWaiverTemplate } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(deleteWaiverTemplate).mockRejectedValue(
        new Error('Cannot delete waiver template that has signed waivers. Deactivate it instead.'),
      );

      const { deleteTemplate } = await import('./Waivers');

      await expect(callHandler(deleteTemplate, deleteInput)).rejects.toMatchObject({
        message: 'Cannot delete waiver template that has signed waivers. Deactivate it instead.',
        status: 400,
      });

      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.WAIVER_TEMPLATE_DELETE,
        AUDIT_ENTITY_TYPE.WAIVER_TEMPLATE,
        {
          entityId: 'template-1',
          status: 'failure',
          error: 'Cannot delete waiver template that has signed waivers. Deactivate it instead.',
        },
      );
    });
  });

  // ===========================================================================
  // VERSION HISTORY HANDLERS
  // ===========================================================================

  describe('listTemplateVersions', () => {
    it('should return versions on success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getWaiverTemplateVersionHistory } = await import('@/services/WaiversService');

      const versions = [
        { ...mockTemplate, version: 2 },
        { ...mockTemplate, version: 1, parentId: 'template-1', id: 'archive-1' },
      ];

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getWaiverTemplateVersionHistory).mockResolvedValue(versions);

      const { listTemplateVersions } = await import('./Waivers');
      const result = await callHandler(listTemplateVersions, { id: 'template-1' });

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(getWaiverTemplateVersionHistory).toHaveBeenCalledWith('template-1', 'test-org-456');
      expect(result).toEqual({ versions });
    });

    it('should re-throw ORPCError from service', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getWaiverTemplateVersionHistory } = await import('@/services/WaiversService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getWaiverTemplateVersionHistory).mockRejectedValue(
        new ORPCError('Not found', { status: 404 }),
      );

      const { listTemplateVersions } = await import('./Waivers');

      await expect(callHandler(listTemplateVersions, { id: 'template-1' })).rejects.toMatchObject({
        message: 'Not found',
        status: 404,
      });
    });

    it('should wrap unknown errors in generic ORPCError', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getWaiverTemplateVersionHistory } = await import('@/services/WaiversService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getWaiverTemplateVersionHistory).mockRejectedValue(new Error('DB error'));

      const { listTemplateVersions } = await import('./Waivers');

      await expect(callHandler(listTemplateVersions, { id: 'template-1' })).rejects.toMatchObject({
        message: 'Failed to fetch version history.',
        status: 500,
      });
    });
  });

  describe('getTemplateVersion', () => {
    it('should return template version on success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getWaiverTemplateVersion } = await import('@/services/WaiversService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getWaiverTemplateVersion).mockResolvedValue(mockTemplate);

      const { getTemplateVersion } = await import('./Waivers');
      const result = await callHandler(getTemplateVersion, { id: 'template-1' });

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(getWaiverTemplateVersion).toHaveBeenCalledWith('template-1', 'test-org-456');
      expect(result).toEqual({ template: mockTemplate });
    });

    it('should throw 404 when version not found', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getWaiverTemplateVersion } = await import('@/services/WaiversService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getWaiverTemplateVersion).mockResolvedValue(null);

      const { getTemplateVersion } = await import('./Waivers');

      await expect(callHandler(getTemplateVersion, { id: 'nonexistent' })).rejects.toMatchObject({
        message: 'Waiver template version not found',
        status: 404,
      });
    });

    it('should wrap unknown errors in generic ORPCError', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getWaiverTemplateVersion } = await import('@/services/WaiversService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getWaiverTemplateVersion).mockRejectedValue(new Error('DB error'));

      const { getTemplateVersion } = await import('./Waivers');

      await expect(callHandler(getTemplateVersion, { id: 'template-1' })).rejects.toMatchObject({
        message: 'Failed to fetch version.',
        status: 500,
      });
    });
  });

  // ===========================================================================
  // SIGNED WAIVER HANDLERS
  // ===========================================================================

  describe('listMemberSignedWaivers', () => {
    it('should return signed waivers with template names for a member on success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getMemberSignedWaivers } = await import('@/services/WaiversService');

      const mockSignedWaiverWithName = {
        ...mockSignedWaiver,
        waiverName: 'Standard Adult Waiver',
      };

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getMemberSignedWaivers).mockResolvedValue([mockSignedWaiverWithName]);

      const { listMemberSignedWaivers } = await import('./Waivers');
      const result = await callHandler(listMemberSignedWaivers, { memberId: 'member-1' });

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(getMemberSignedWaivers).toHaveBeenCalledWith('member-1', 'test-org-456');
      expect(result).toEqual({ waivers: [mockSignedWaiverWithName] });
      expect((result as { waivers: Array<{ waiverName: string }> }).waivers[0]!.waiverName).toBe('Standard Adult Waiver');
    });

    it('should re-throw ORPCError from service', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getMemberSignedWaivers } = await import('@/services/WaiversService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getMemberSignedWaivers).mockRejectedValue(
        new ORPCError('Member not found', { status: 404 }),
      );

      const { listMemberSignedWaivers } = await import('./Waivers');

      await expect(callHandler(listMemberSignedWaivers, { memberId: 'member-1' })).rejects.toMatchObject({
        message: 'Member not found',
        status: 404,
      });
    });

    it('should wrap unknown errors in generic ORPCError', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getMemberSignedWaivers } = await import('@/services/WaiversService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getMemberSignedWaivers).mockRejectedValue(new Error('DB error'));

      const { listMemberSignedWaivers } = await import('./Waivers');

      await expect(callHandler(listMemberSignedWaivers, { memberId: 'member-1' })).rejects.toMatchObject({
        message: 'Failed to fetch signed waivers.',
        status: 500,
      });
    });
  });

  describe('getSignedWaiver', () => {
    it('should return signed waiver on success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getSignedWaiverById } = await import('@/services/WaiversService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getSignedWaiverById).mockResolvedValue(mockSignedWaiver);

      const { getSignedWaiver } = await import('./Waivers');
      const result = await callHandler(getSignedWaiver, { id: 'signed-waiver-1' });

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(getSignedWaiverById).toHaveBeenCalledWith('signed-waiver-1', 'test-org-456');
      expect(result).toEqual({ waiver: mockSignedWaiver });
    });

    it('should throw 404 when signed waiver not found', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getSignedWaiverById } = await import('@/services/WaiversService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getSignedWaiverById).mockResolvedValue(null);

      const { getSignedWaiver } = await import('./Waivers');

      await expect(callHandler(getSignedWaiver, { id: 'nonexistent' })).rejects.toMatchObject({
        message: 'Signed waiver not found',
        status: 404,
      });
    });

    it('should wrap unknown errors in generic ORPCError', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getSignedWaiverById } = await import('@/services/WaiversService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getSignedWaiverById).mockRejectedValue(new Error('DB error'));

      const { getSignedWaiver } = await import('./Waivers');

      await expect(callHandler(getSignedWaiver, { id: 'signed-waiver-1' })).rejects.toMatchObject({
        message: 'Failed to fetch signed waiver.',
        status: 500,
      });
    });
  });

  describe('createSignedWaiverRecord', () => {
    const signedWaiverInput = {
      waiverTemplateId: 'template-1',
      memberId: 'member-1',
      signatureDataUrl: 'data:image/png;base64,abc123',
      signedByName: 'John Doe',
      signedByEmail: 'john@example.com',
      memberFirstName: 'John',
      memberLastName: 'Doe',
      memberEmail: 'john@example.com',
      renderedContent: 'Rendered waiver content here',
    };

    it('should create signed waiver and audit on success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { createSignedWaiver } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(createSignedWaiver).mockResolvedValue(mockSignedWaiver);

      const { createSignedWaiverRecord } = await import('./Waivers');
      const result = await callHandler(createSignedWaiverRecord, signedWaiverInput);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(createSignedWaiver).toHaveBeenCalledWith(signedWaiverInput, 'test-org-456');
      expect(audit).toHaveBeenCalledWith(
        mockFrontDeskContext,
        AUDIT_ACTION.WAIVER_SIGNED,
        AUDIT_ENTITY_TYPE.SIGNED_WAIVER,
        { entityId: 'signed-waiver-1', status: 'success' },
      );
      expect(result).toEqual({ waiver: mockSignedWaiver });
    });

    it('should audit failure and re-throw ORPCError on error', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { createSignedWaiver } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(createSignedWaiver).mockRejectedValue(
        new ORPCError('Template not found', { status: 404 }),
      );

      const { createSignedWaiverRecord } = await import('./Waivers');

      await expect(callHandler(createSignedWaiverRecord, signedWaiverInput)).rejects.toMatchObject({
        message: 'Template not found',
        status: 404,
      });

      expect(audit).toHaveBeenCalledWith(
        mockFrontDeskContext,
        AUDIT_ACTION.WAIVER_SIGNED,
        AUDIT_ENTITY_TYPE.SIGNED_WAIVER,
        { status: 'failure', error: 'Template not found' },
      );
    });

    it('should audit failure and wrap unknown errors in generic ORPCError', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { createSignedWaiver } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(createSignedWaiver).mockRejectedValue(new Error('DB failure'));

      const { createSignedWaiverRecord } = await import('./Waivers');

      await expect(callHandler(createSignedWaiverRecord, signedWaiverInput)).rejects.toMatchObject({
        message: 'Failed to create signed waiver.',
        status: 500,
      });

      expect(audit).toHaveBeenCalledWith(
        mockFrontDeskContext,
        AUDIT_ACTION.WAIVER_SIGNED,
        AUDIT_ENTITY_TYPE.SIGNED_WAIVER,
        { status: 'failure', error: 'DB failure' },
      );
    });

    it('should pass coupon data to the service when provided', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { createSignedWaiver } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      const inputWithCoupon = {
        ...signedWaiverInput,
        membershipPlanName: 'Premium Plan',
        membershipPlanPrice: 99,
        membershipPlanFrequency: 'monthly',
        couponCode: 'SUMMER20',
        couponType: 'Percentage' as const,
        couponAmount: '20%',
        couponDiscountedPrice: 79.2,
      };

      const mockSignedWaiverWithCoupon = {
        ...mockSignedWaiver,
        membershipPlanName: 'Premium Plan',
        membershipPlanPrice: 99,
        membershipPlanFrequency: 'monthly',
        couponCode: 'SUMMER20',
        couponType: 'Percentage',
        couponAmount: '20%',
        couponDiscountedPrice: 79.2,
      };

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(createSignedWaiver).mockResolvedValue(mockSignedWaiverWithCoupon);

      const { createSignedWaiverRecord } = await import('./Waivers');
      const result = await callHandler(createSignedWaiverRecord, inputWithCoupon);

      expect(createSignedWaiver).toHaveBeenCalledWith(inputWithCoupon, 'test-org-456');
      expect(audit).toHaveBeenCalledWith(
        mockFrontDeskContext,
        AUDIT_ACTION.WAIVER_SIGNED,
        AUDIT_ENTITY_TYPE.SIGNED_WAIVER,
        { entityId: mockSignedWaiverWithCoupon.id, status: 'success' },
      );
      expect(result).toEqual({ waiver: mockSignedWaiverWithCoupon });
    });
  });

  // ===========================================================================
  // MEMBERSHIP-WAIVER ASSOCIATION HANDLERS
  // ===========================================================================

  describe('getWaiversForMembership', () => {
    it('should return waivers for a membership plan on success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getWaiversForMembershipPlan } = await import('@/services/WaiversService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getWaiversForMembershipPlan).mockResolvedValue([mockTemplate]);

      const { getWaiversForMembership } = await import('./Waivers');
      const result = await callHandler(getWaiversForMembership, { membershipPlanId: 'plan-1' });

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(getWaiversForMembershipPlan).toHaveBeenCalledWith('plan-1', 'test-org-456');
      expect(result).toEqual({ waivers: [mockTemplate] });
    });

    it('should re-throw ORPCError from service', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getWaiversForMembershipPlan } = await import('@/services/WaiversService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getWaiversForMembershipPlan).mockRejectedValue(
        new ORPCError('Plan not found', { status: 404 }),
      );

      const { getWaiversForMembership } = await import('./Waivers');

      await expect(callHandler(getWaiversForMembership, { membershipPlanId: 'plan-1' })).rejects.toMatchObject({
        message: 'Plan not found',
        status: 404,
      });
    });

    it('should wrap unknown errors in generic ORPCError', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getWaiversForMembershipPlan } = await import('@/services/WaiversService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getWaiversForMembershipPlan).mockRejectedValue(new Error('DB error'));

      const { getWaiversForMembership } = await import('./Waivers');

      await expect(callHandler(getWaiversForMembership, { membershipPlanId: 'plan-1' })).rejects.toMatchObject({
        message: 'Failed to fetch waivers.',
        status: 500,
      });
    });
  });

  describe('setMembershipWaiverAssociations', () => {
    const setInput = {
      membershipPlanId: 'plan-1',
      waiverTemplateIds: ['template-1', 'template-2'],
    };

    it('should set associations and audit on success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { setMembershipPlanWaivers } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(setMembershipPlanWaivers).mockResolvedValue(undefined);

      const { setMembershipWaiverAssociations } = await import('./Waivers');
      const result = await callHandler(setMembershipWaiverAssociations, setInput);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.ACADEMY_OWNER);
      expect(setMembershipPlanWaivers).toHaveBeenCalledWith('plan-1', ['template-1', 'template-2'], 'test-org-456');
      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.MEMBERSHIP_WAIVER_SET,
        AUDIT_ENTITY_TYPE.MEMBERSHIP_WAIVER,
        { entityId: 'plan-1', status: 'success' },
      );
      expect(result).toEqual({});
    });

    it('should audit failure and re-throw ORPCError on error', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { setMembershipPlanWaivers } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(setMembershipPlanWaivers).mockRejectedValue(
        new ORPCError('Invalid plan', { status: 400 }),
      );

      const { setMembershipWaiverAssociations } = await import('./Waivers');

      await expect(callHandler(setMembershipWaiverAssociations, setInput)).rejects.toMatchObject({
        message: 'Invalid plan',
        status: 400,
      });

      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.MEMBERSHIP_WAIVER_SET,
        AUDIT_ENTITY_TYPE.MEMBERSHIP_WAIVER,
        { entityId: 'plan-1', status: 'failure', error: 'Invalid plan' },
      );
    });

    it('should audit failure and wrap unknown errors in generic ORPCError', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { setMembershipPlanWaivers } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(setMembershipPlanWaivers).mockRejectedValue(new Error('DB failure'));

      const { setMembershipWaiverAssociations } = await import('./Waivers');

      await expect(callHandler(setMembershipWaiverAssociations, setInput)).rejects.toMatchObject({
        message: 'Failed to set membership waivers.',
        status: 500,
      });

      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.MEMBERSHIP_WAIVER_SET,
        AUDIT_ENTITY_TYPE.MEMBERSHIP_WAIVER,
        { entityId: 'plan-1', status: 'failure', error: 'DB failure' },
      );
    });
  });

  describe('addWaiverToMembership', () => {
    const addInput = {
      membershipPlanId: 'plan-1',
      waiverTemplateId: 'template-1',
      isRequired: true,
    };

    it('should add waiver to membership and audit on success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { addWaiverToMembershipPlan } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(addWaiverToMembershipPlan).mockResolvedValue(undefined);

      const { addWaiverToMembership } = await import('./Waivers');
      const result = await callHandler(addWaiverToMembership, addInput);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.ACADEMY_OWNER);
      expect(addWaiverToMembershipPlan).toHaveBeenCalledWith('plan-1', 'template-1', 'test-org-456', true);
      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.MEMBERSHIP_WAIVER_ADD,
        AUDIT_ENTITY_TYPE.MEMBERSHIP_WAIVER,
        { entityId: 'plan-1', status: 'success' },
      );
      expect(result).toEqual({});
    });

    it('should audit failure and re-throw ORPCError on error', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { addWaiverToMembershipPlan } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(addWaiverToMembershipPlan).mockRejectedValue(
        new ORPCError('Duplicate association', { status: 409 }),
      );

      const { addWaiverToMembership } = await import('./Waivers');

      await expect(callHandler(addWaiverToMembership, addInput)).rejects.toMatchObject({
        message: 'Duplicate association',
        status: 409,
      });

      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.MEMBERSHIP_WAIVER_ADD,
        AUDIT_ENTITY_TYPE.MEMBERSHIP_WAIVER,
        { entityId: 'plan-1', status: 'failure', error: 'Duplicate association' },
      );
    });

    it('should audit failure and wrap unknown errors in generic ORPCError', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { addWaiverToMembershipPlan } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(addWaiverToMembershipPlan).mockRejectedValue(new Error('DB failure'));

      const { addWaiverToMembership } = await import('./Waivers');

      await expect(callHandler(addWaiverToMembership, addInput)).rejects.toMatchObject({
        message: 'Failed to add waiver to membership.',
        status: 500,
      });

      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.MEMBERSHIP_WAIVER_ADD,
        AUDIT_ENTITY_TYPE.MEMBERSHIP_WAIVER,
        { entityId: 'plan-1', status: 'failure', error: 'DB failure' },
      );
    });
  });

  describe('removeWaiverFromMembership', () => {
    const removeInput = {
      membershipPlanId: 'plan-1',
      waiverTemplateId: 'template-1',
    };

    it('should remove waiver from membership and audit on success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { removeWaiverFromMembershipPlan } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(removeWaiverFromMembershipPlan).mockResolvedValue(undefined);

      const { removeWaiverFromMembership } = await import('./Waivers');
      const result = await callHandler(removeWaiverFromMembership, removeInput);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.ACADEMY_OWNER);
      expect(removeWaiverFromMembershipPlan).toHaveBeenCalledWith('plan-1', 'template-1', 'test-org-456');
      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.MEMBERSHIP_WAIVER_REMOVE,
        AUDIT_ENTITY_TYPE.MEMBERSHIP_WAIVER,
        { entityId: 'plan-1', status: 'success' },
      );
      expect(result).toEqual({});
    });

    it('should audit failure and re-throw ORPCError on error', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { removeWaiverFromMembershipPlan } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(removeWaiverFromMembershipPlan).mockRejectedValue(
        new ORPCError('Association not found', { status: 404 }),
      );

      const { removeWaiverFromMembership } = await import('./Waivers');

      await expect(callHandler(removeWaiverFromMembership, removeInput)).rejects.toMatchObject({
        message: 'Association not found',
        status: 404,
      });

      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.MEMBERSHIP_WAIVER_REMOVE,
        AUDIT_ENTITY_TYPE.MEMBERSHIP_WAIVER,
        { entityId: 'plan-1', status: 'failure', error: 'Association not found' },
      );
    });

    it('should audit failure and wrap unknown errors in generic ORPCError', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { removeWaiverFromMembershipPlan } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(removeWaiverFromMembershipPlan).mockRejectedValue(new Error('DB failure'));

      const { removeWaiverFromMembership } = await import('./Waivers');

      await expect(callHandler(removeWaiverFromMembership, removeInput)).rejects.toMatchObject({
        message: 'Failed to remove waiver from membership.',
        status: 500,
      });

      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.MEMBERSHIP_WAIVER_REMOVE,
        AUDIT_ENTITY_TYPE.MEMBERSHIP_WAIVER,
        { entityId: 'plan-1', status: 'failure', error: 'DB failure' },
      );
    });
  });

  // ===========================================================================
  // PLACEHOLDER RESOLUTION HANDLER
  // ===========================================================================

  describe('resolveTemplatePlaceholders', () => {
    it('should resolve placeholders with merge fields on success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const {
        getWaiverTemplateById,
        getOrganizationMergeFields,
        resolveWaiverPlaceholders,
      } = await import('@/services/WaiversService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getWaiverTemplateById).mockResolvedValue(mockTemplate);
      vi.mocked(getOrganizationMergeFields).mockResolvedValue([mockMergeField]);
      vi.mocked(resolveWaiverPlaceholders).mockReturnValue('Resolved content');

      const { resolveTemplatePlaceholders } = await import('./Waivers');
      const result = await callHandler(resolveTemplatePlaceholders, { templateId: 'template-1' });

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(getWaiverTemplateById).toHaveBeenCalledWith('template-1', 'test-org-456');
      expect(getOrganizationMergeFields).toHaveBeenCalledWith('test-org-456');
      expect(resolveWaiverPlaceholders).toHaveBeenCalledWith(
        mockTemplate.content,
        [{ key: 'dojo_name', value: 'Test Dojo' }],
      );
      expect(result).toEqual({
        templateId: 'template-1',
        templateVersion: 1,
        resolvedContent: 'Resolved content',
      });
    });

    it('should apply overrides to merge field values', async () => {
      const { guardRole } = await import('./AuthGuards');
      const {
        getWaiverTemplateById,
        getOrganizationMergeFields,
        resolveWaiverPlaceholders,
      } = await import('@/services/WaiversService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getWaiverTemplateById).mockResolvedValue(mockTemplate);
      vi.mocked(getOrganizationMergeFields).mockResolvedValue([mockMergeField]);
      vi.mocked(resolveWaiverPlaceholders).mockReturnValue('Overridden content');

      const { resolveTemplatePlaceholders } = await import('./Waivers');
      await callHandler(resolveTemplatePlaceholders, {
        templateId: 'template-1',
        overrides: { dojo_name: 'Custom Dojo' },
      });

      expect(resolveWaiverPlaceholders).toHaveBeenCalledWith(
        mockTemplate.content,
        [{ key: 'dojo_name', value: 'Custom Dojo' }],
      );
    });

    it('should throw 404 when template not found', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getWaiverTemplateById } = await import('@/services/WaiversService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getWaiverTemplateById).mockResolvedValue(null);

      const { resolveTemplatePlaceholders } = await import('./Waivers');

      await expect(
        callHandler(resolveTemplatePlaceholders, { templateId: 'nonexistent' }),
      ).rejects.toMatchObject({ message: 'Waiver template not found', status: 404 });
    });

    it('should wrap unknown errors in generic ORPCError', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getWaiverTemplateById } = await import('@/services/WaiversService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getWaiverTemplateById).mockRejectedValue(new Error('DB error'));

      const { resolveTemplatePlaceholders } = await import('./Waivers');

      await expect(
        callHandler(resolveTemplatePlaceholders, { templateId: 'template-1' }),
      ).rejects.toMatchObject({ message: 'Failed to resolve waiver placeholders.', status: 500 });
    });
  });

  // ===========================================================================
  // MERGE FIELD HANDLERS
  // ===========================================================================

  describe('listMergeFields', () => {
    it('should return merge fields on success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { getOrganizationMergeFields } = await import('@/services/WaiversService');

      vi.mocked(guardRole).mockResolvedValue(mockFrontDeskContext);
      vi.mocked(getOrganizationMergeFields).mockResolvedValue([mockMergeField]);

      const { listMergeFields } = await import('./Waivers');
      const result = await callHandler(listMergeFields);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.FRONT_DESK);
      expect(getOrganizationMergeFields).toHaveBeenCalledWith('test-org-456');
      expect(result).toEqual({ mergeFields: [mockMergeField] });
    });
  });

  describe('createMergeFieldHandler', () => {
    const createMergeFieldInput = {
      key: 'dojo_name',
      label: 'Dojo Name',
      defaultValue: 'Test Dojo',
      description: 'The name of the dojo',
    };

    it('should create merge field and audit on success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { createMergeField } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(createMergeField).mockResolvedValue(mockMergeField);

      const { createMergeFieldHandler } = await import('./Waivers');
      const result = await callHandler(createMergeFieldHandler, createMergeFieldInput);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.ACADEMY_OWNER);
      expect(createMergeField).toHaveBeenCalledWith(createMergeFieldInput, 'test-org-456');
      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.MERGE_FIELD_CREATE,
        AUDIT_ENTITY_TYPE.WAIVER_MERGE_FIELD,
        { entityId: 'merge-field-1', status: 'success' },
      );
      expect(result).toEqual({ mergeField: mockMergeField });
    });

    it('should audit failure and re-throw ORPCError on error', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { createMergeField } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(createMergeField).mockRejectedValue(
        new ORPCError('Duplicate key', { status: 409 }),
      );

      const { createMergeFieldHandler } = await import('./Waivers');

      await expect(callHandler(createMergeFieldHandler, createMergeFieldInput)).rejects.toMatchObject({
        message: 'Duplicate key',
        status: 409,
      });

      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.MERGE_FIELD_CREATE,
        AUDIT_ENTITY_TYPE.WAIVER_MERGE_FIELD,
        { status: 'failure', error: 'Duplicate key' },
      );
    });

    it('should audit failure and wrap unknown errors in generic ORPCError', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { createMergeField } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(createMergeField).mockRejectedValue(new Error('DB failure'));

      const { createMergeFieldHandler } = await import('./Waivers');

      await expect(callHandler(createMergeFieldHandler, createMergeFieldInput)).rejects.toMatchObject({
        message: 'Failed to create merge field.',
        status: 500,
      });

      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.MERGE_FIELD_CREATE,
        AUDIT_ENTITY_TYPE.WAIVER_MERGE_FIELD,
        { status: 'failure', error: 'DB failure' },
      );
    });
  });

  describe('updateMergeFieldHandler', () => {
    const updateMergeFieldInput = {
      id: 'merge-field-1',
      label: 'Updated Dojo Name',
      defaultValue: 'Updated Test Dojo',
    };

    it('should update merge field and audit on success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateMergeField } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      const updatedField = { ...mockMergeField, label: 'Updated Dojo Name', defaultValue: 'Updated Test Dojo' };
      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(updateMergeField).mockResolvedValue(updatedField);

      const { updateMergeFieldHandler } = await import('./Waivers');
      const result = await callHandler(updateMergeFieldHandler, updateMergeFieldInput);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.ACADEMY_OWNER);
      // The router destructures { id, ...updateData } and passes updateData
      expect(updateMergeField).toHaveBeenCalledWith(
        'merge-field-1',
        { label: 'Updated Dojo Name', defaultValue: 'Updated Test Dojo' },
        'test-org-456',
      );
      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.MERGE_FIELD_UPDATE,
        AUDIT_ENTITY_TYPE.WAIVER_MERGE_FIELD,
        { entityId: 'merge-field-1', status: 'success' },
      );
      expect(result).toEqual({ mergeField: updatedField });
    });

    it('should audit failure and re-throw ORPCError on error', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateMergeField } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(updateMergeField).mockRejectedValue(
        new ORPCError('Merge field not found', { status: 404 }),
      );

      const { updateMergeFieldHandler } = await import('./Waivers');

      await expect(callHandler(updateMergeFieldHandler, updateMergeFieldInput)).rejects.toMatchObject({
        message: 'Merge field not found',
        status: 404,
      });

      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.MERGE_FIELD_UPDATE,
        AUDIT_ENTITY_TYPE.WAIVER_MERGE_FIELD,
        { entityId: 'merge-field-1', status: 'failure', error: 'Merge field not found' },
      );
    });

    it('should audit failure and wrap unknown errors in generic ORPCError', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { updateMergeField } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(updateMergeField).mockRejectedValue(new Error('DB failure'));

      const { updateMergeFieldHandler } = await import('./Waivers');

      await expect(callHandler(updateMergeFieldHandler, updateMergeFieldInput)).rejects.toMatchObject({
        message: 'Failed to update merge field.',
        status: 500,
      });

      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.MERGE_FIELD_UPDATE,
        AUDIT_ENTITY_TYPE.WAIVER_MERGE_FIELD,
        { entityId: 'merge-field-1', status: 'failure', error: 'DB failure' },
      );
    });
  });

  describe('deleteMergeFieldHandler', () => {
    const deleteMergeFieldInput = { id: 'merge-field-1' };

    it('should delete merge field and audit on success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { deleteMergeField } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(deleteMergeField).mockResolvedValue(undefined);

      const { deleteMergeFieldHandler } = await import('./Waivers');
      const result = await callHandler(deleteMergeFieldHandler, deleteMergeFieldInput);

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.ACADEMY_OWNER);
      expect(deleteMergeField).toHaveBeenCalledWith('merge-field-1', 'test-org-456');
      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.MERGE_FIELD_DELETE,
        AUDIT_ENTITY_TYPE.WAIVER_MERGE_FIELD,
        { entityId: 'merge-field-1', status: 'success' },
      );
      expect(result).toEqual({ success: true });
    });

    it('should audit failure and re-throw ORPCError on error', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { deleteMergeField } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(deleteMergeField).mockRejectedValue(
        new ORPCError('Field in use', { status: 409 }),
      );

      const { deleteMergeFieldHandler } = await import('./Waivers');

      await expect(callHandler(deleteMergeFieldHandler, deleteMergeFieldInput)).rejects.toMatchObject({
        message: 'Field in use',
        status: 409,
      });

      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.MERGE_FIELD_DELETE,
        AUDIT_ENTITY_TYPE.WAIVER_MERGE_FIELD,
        { entityId: 'merge-field-1', status: 'failure', error: 'Field in use' },
      );
    });

    it('should audit failure and wrap unknown errors in generic ORPCError', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { deleteMergeField } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(deleteMergeField).mockRejectedValue(new Error('DB failure'));

      const { deleteMergeFieldHandler } = await import('./Waivers');

      await expect(callHandler(deleteMergeFieldHandler, deleteMergeFieldInput)).rejects.toMatchObject({
        message: 'Failed to delete merge field.',
        status: 500,
      });

      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.MERGE_FIELD_DELETE,
        AUDIT_ENTITY_TYPE.WAIVER_MERGE_FIELD,
        { entityId: 'merge-field-1', status: 'failure', error: 'DB failure' },
      );
    });
  });

  describe('setWaiverMemberships (#267)', () => {
    it('sets the membership plans for a waiver (ACADEMY_OWNER) and audits success', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { setWaiverMembershipPlans } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(setWaiverMembershipPlans).mockResolvedValue(undefined);

      const { setWaiverMemberships } = await import('./Waivers');
      const result = await callHandler(setWaiverMemberships, {
        waiverTemplateId: 'template-1',
        membershipPlanIds: ['plan-a', 'plan-b'],
      });

      expect(guardRole).toHaveBeenCalledWith(ORG_ROLE.ACADEMY_OWNER);
      expect(setWaiverMembershipPlans).toHaveBeenCalledWith('template-1', ['plan-a', 'plan-b'], 'test-org-456');
      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.MEMBERSHIP_WAIVER_SET,
        AUDIT_ENTITY_TYPE.MEMBERSHIP_WAIVER,
        { entityId: 'template-1', status: 'success' },
      );
      expect(result).toEqual({});
    });

    it('audits failure and wraps a thrown error as a 500', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { setWaiverMembershipPlans } = await import('@/services/WaiversService');
      const { audit } = await import('@/services/AuditService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(setWaiverMembershipPlans).mockRejectedValue(new Error('DB failure'));

      const { setWaiverMemberships } = await import('./Waivers');

      await expect(
        callHandler(setWaiverMemberships, { waiverTemplateId: 'template-1', membershipPlanIds: [] }),
      ).rejects.toMatchObject({ status: 500 });

      expect(audit).toHaveBeenCalledWith(
        mockContext,
        AUDIT_ACTION.MEMBERSHIP_WAIVER_SET,
        AUDIT_ENTITY_TYPE.MEMBERSHIP_WAIVER,
        { entityId: 'template-1', status: 'failure', error: 'DB failure' },
      );
    });

    it('maps a cross-tenant WaiverNotFoundError to a 404 ORPCError', async () => {
      const { guardRole } = await import('./AuthGuards');
      const { setWaiverMembershipPlans, WaiverNotFoundError } = await import('@/services/WaiversService');

      vi.mocked(guardRole).mockResolvedValue(mockContext);
      vi.mocked(setWaiverMembershipPlans).mockRejectedValue(new WaiverNotFoundError('Waiver template not found'));

      const { setWaiverMemberships } = await import('./Waivers');

      await expect(
        callHandler(setWaiverMemberships, { waiverTemplateId: 'template-x', membershipPlanIds: [] }),
      ).rejects.toMatchObject({ status: 404 });
    });
  });
});

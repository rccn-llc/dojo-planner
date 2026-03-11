import { ORPCError, os } from '@orpc/server';
import { logger } from '@/libs/Logger';
import { audit } from '@/services/AuditService';
import {
  addWaiverToMembershipPlan,
  createMergeField,
  createSignedWaiver,
  createWaiverTemplate,
  deleteMergeField,
  deleteWaiverTemplate,
  getActiveWaiverTemplates,
  getMembershipPlansWithWaiver,
  getMemberSignedWaivers,
  getOrganizationMergeFields,
  getOrganizationWaiverTemplates,
  getSignedWaiverById,
  getWaiversForMembershipPlan,
  getWaiverTemplateById,
  getWaiverTemplateVersion,
  getWaiverTemplateVersionHistory,
  removeWaiverFromMembershipPlan,
  resolveWaiverPlaceholders,
  setMembershipPlanWaivers,
  updateMergeField,
  updateWaiverTemplate,
} from '@/services/WaiversService';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE } from '@/types/Audit';
import { ORG_ROLE } from '@/types/Auth';
import {
  AddWaiverToMembershipValidation,
  CreateMergeFieldValidation,
  CreateSignedWaiverValidation,
  CreateWaiverTemplateValidation,
  DeleteMergeFieldValidation,
  DeleteWaiverTemplateValidation,
  GetSignedWaiverValidation,
  GetTemplateVersionValidation,
  GetWaiversForMembershipValidation,
  GetWaiverTemplateValidation,
  ListMemberSignedWaiversValidation,
  ListTemplateVersionsValidation,
  RemoveWaiverFromMembershipValidation,
  ResolveWaiverPlaceholdersValidation,
  SetMembershipWaiversValidation,
  UpdateMergeFieldValidation,
  UpdateWaiverTemplateValidation,
} from '@/validations/WaiverValidation';
import { guardRole } from './AuthGuards';

// =============================================================================
// WAIVER TEMPLATE HANDLERS
// =============================================================================

/**
 * List all waiver templates for the organization
 */
export const listTemplates = os.handler(async () => {
  const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);

  try {
    const templates = await getOrganizationWaiverTemplates(orgId);
    return { templates };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to fetch waiver templates: ${errorMessage}`);
    throw error instanceof ORPCError ? error : new ORPCError('Failed to fetch waiver templates.', { status: 500 });
  }
});

/**
 * List active waiver templates for the organization
 */
export const listActiveTemplates = os.handler(async () => {
  const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);

  try {
    const templates = await getActiveWaiverTemplates(orgId);
    return { templates };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to fetch active waiver templates: ${errorMessage}`);
    throw error instanceof ORPCError ? error : new ORPCError('Failed to fetch waiver templates.', { status: 500 });
  }
});

/**
 * Get a single waiver template by ID
 */
export const getTemplate = os
  .input(GetWaiverTemplateValidation)
  .handler(async ({ input }) => {
    const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);

    try {
      const template = await getWaiverTemplateById(input.id, orgId);
      if (!template) {
        throw new ORPCError('Waiver template not found', { status: 404 });
      }

      // Get associated membership plans
      const memberships = await getMembershipPlansWithWaiver(input.id, orgId);

      return { template, memberships };
    } catch (error) {
      if (error instanceof ORPCError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to fetch waiver template: ${errorMessage}`);
      throw new ORPCError('Failed to fetch waiver template.', { status: 500 });
    }
  });

/**
 * Create a new waiver template
 */
export const createTemplate = os
  .input(CreateWaiverTemplateValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

    try {
      logger.info(`[Waivers.createTemplate] Creating waiver template for organization: ${context.orgId}`, {
        name: input.name,
      });

      const template = await createWaiverTemplate(input, context.orgId);

      logger.info(`[Waivers.createTemplate] Waiver template created successfully: ${template.id}`);

      await audit(context, AUDIT_ACTION.WAIVER_TEMPLATE_CREATE, AUDIT_ENTITY_TYPE.WAIVER_TEMPLATE, {
        entityId: template.id,
        status: 'success',
      });

      return { template };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to create waiver template: ${errorMessage}`);

      await audit(context, AUDIT_ACTION.WAIVER_TEMPLATE_CREATE, AUDIT_ENTITY_TYPE.WAIVER_TEMPLATE, {
        status: 'failure',
        error: errorMessage,
      });

      throw error instanceof ORPCError ? error : new ORPCError('Failed to create waiver template.', { status: 500 });
    }
  });

/**
 * Update an existing waiver template
 */
export const updateTemplate = os
  .input(UpdateWaiverTemplateValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

    try {
      const { template, versionCreated } = await updateWaiverTemplate(input, context.orgId);

      logger.info(`[Waivers.updateTemplate] Waiver template updated: ${input.id}, version: ${template.version}${versionCreated ? ' (new version created)' : ''}`);

      await audit(context, AUDIT_ACTION.WAIVER_TEMPLATE_UPDATE, AUDIT_ENTITY_TYPE.WAIVER_TEMPLATE, {
        entityId: input.id,
        status: 'success',
      });

      if (versionCreated) {
        await audit(context, AUDIT_ACTION.WAIVER_TEMPLATE_VERSION_CREATE, AUDIT_ENTITY_TYPE.WAIVER_TEMPLATE, {
          entityId: input.id,
          status: 'success',
        });
      }

      return { template };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to update waiver template: ${errorMessage}`);

      await audit(context, AUDIT_ACTION.WAIVER_TEMPLATE_UPDATE, AUDIT_ENTITY_TYPE.WAIVER_TEMPLATE, {
        entityId: input.id,
        status: 'failure',
        error: errorMessage,
      });

      throw error instanceof ORPCError ? error : new ORPCError('Failed to update waiver template.', { status: 500 });
    }
  });

/**
 * Delete a waiver template
 */
export const deleteTemplate = os
  .input(DeleteWaiverTemplateValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

    try {
      await deleteWaiverTemplate(input.id, context.orgId);

      logger.info(`[Waivers.deleteTemplate] Waiver template deleted: ${input.id}`);

      await audit(context, AUDIT_ACTION.WAIVER_TEMPLATE_DELETE, AUDIT_ENTITY_TYPE.WAIVER_TEMPLATE, {
        entityId: input.id,
        status: 'success',
      });

      return {};
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to delete waiver template: ${errorMessage}`);

      await audit(context, AUDIT_ACTION.WAIVER_TEMPLATE_DELETE, AUDIT_ENTITY_TYPE.WAIVER_TEMPLATE, {
        entityId: input.id,
        status: 'failure',
        error: errorMessage,
      });

      throw error instanceof ORPCError ? error : new ORPCError(errorMessage, { status: 400 });
    }
  });

// =============================================================================
// VERSION HISTORY HANDLERS
// =============================================================================

/**
 * List all versions of a waiver template
 */
export const listTemplateVersions = os
  .input(ListTemplateVersionsValidation)
  .handler(async ({ input }) => {
    const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);

    try {
      const versions = await getWaiverTemplateVersionHistory(input.id, orgId);
      return { versions };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to fetch waiver template versions: ${errorMessage}`);
      throw error instanceof ORPCError ? error : new ORPCError('Failed to fetch version history.', { status: 500 });
    }
  });

/**
 * Get a single waiver template version
 */
export const getTemplateVersion = os
  .input(GetTemplateVersionValidation)
  .handler(async ({ input }) => {
    const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);

    try {
      const template = await getWaiverTemplateVersion(input.id, orgId);
      if (!template) {
        throw new ORPCError('Waiver template version not found', { status: 404 });
      }
      return { template };
    } catch (error) {
      if (error instanceof ORPCError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to fetch waiver template version: ${errorMessage}`);
      throw new ORPCError('Failed to fetch version.', { status: 500 });
    }
  });

// =============================================================================
// SIGNED WAIVER HANDLERS
// =============================================================================

/**
 * Get signed waivers for a member
 */
export const listMemberSignedWaivers = os
  .input(ListMemberSignedWaiversValidation)
  .handler(async ({ input }) => {
    await guardRole(ORG_ROLE.FRONT_DESK);

    try {
      const waivers = await getMemberSignedWaivers(input.memberId);
      return { waivers };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to fetch member's signed waivers: ${errorMessage}`);
      throw error instanceof ORPCError ? error : new ORPCError('Failed to fetch signed waivers.', { status: 500 });
    }
  });

/**
 * Get a single signed waiver by ID
 */
export const getSignedWaiver = os
  .input(GetSignedWaiverValidation)
  .handler(async ({ input }) => {
    const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);

    try {
      const waiver = await getSignedWaiverById(input.id, orgId);
      if (!waiver) {
        throw new ORPCError('Signed waiver not found', { status: 404 });
      }
      return { waiver };
    } catch (error) {
      if (error instanceof ORPCError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to fetch signed waiver: ${errorMessage}`);
      throw new ORPCError('Failed to fetch signed waiver.', { status: 500 });
    }
  });

/**
 * Create a signed waiver record
 */
export const createSignedWaiverRecord = os
  .input(CreateSignedWaiverValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.FRONT_DESK);

    try {
      logger.info(`[Waivers.createSignedWaiver] Creating signed waiver for member: ${input.memberId}, template: ${input.waiverTemplateId}`);

      const waiver = await createSignedWaiver(input, context.orgId);

      logger.info(`[Waivers.createSignedWaiver] Signed waiver created: ${waiver.id}`);

      await audit(context, AUDIT_ACTION.WAIVER_SIGNED, AUDIT_ENTITY_TYPE.SIGNED_WAIVER, {
        entityId: waiver.id,
        status: 'success',
      });

      return { waiver };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to create signed waiver: ${errorMessage}`);

      await audit(context, AUDIT_ACTION.WAIVER_SIGNED, AUDIT_ENTITY_TYPE.SIGNED_WAIVER, {
        status: 'failure',
        error: errorMessage,
      });

      throw error instanceof ORPCError ? error : new ORPCError('Failed to create signed waiver.', { status: 500 });
    }
  });

// =============================================================================
// MEMBERSHIP-WAIVER ASSOCIATION HANDLERS
// =============================================================================

/**
 * Get waivers associated with a membership plan
 */
export const getWaiversForMembership = os
  .input(GetWaiversForMembershipValidation)
  .handler(async ({ input }) => {
    await guardRole(ORG_ROLE.FRONT_DESK);

    try {
      const waivers = await getWaiversForMembershipPlan(input.membershipPlanId);
      return { waivers };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to fetch waivers for membership: ${errorMessage}`);
      throw error instanceof ORPCError ? error : new ORPCError('Failed to fetch waivers.', { status: 500 });
    }
  });

/**
 * Set waiver associations for a membership plan
 */
export const setMembershipWaiverAssociations = os
  .input(SetMembershipWaiversValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

    try {
      await setMembershipPlanWaivers(input.membershipPlanId, input.waiverTemplateIds);

      logger.info(`[Waivers.setMembershipWaivers] Updated waiver associations for membership: ${input.membershipPlanId}, waivers: ${input.waiverTemplateIds.join(', ')}`);

      await audit(context, AUDIT_ACTION.MEMBERSHIP_WAIVER_SET, AUDIT_ENTITY_TYPE.MEMBERSHIP_WAIVER, {
        entityId: input.membershipPlanId,
        status: 'success',
      });

      return {};
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to set membership waivers: ${errorMessage}`);

      await audit(context, AUDIT_ACTION.MEMBERSHIP_WAIVER_SET, AUDIT_ENTITY_TYPE.MEMBERSHIP_WAIVER, {
        entityId: input.membershipPlanId,
        status: 'failure',
        error: errorMessage,
      });

      throw error instanceof ORPCError ? error : new ORPCError('Failed to set membership waivers.', { status: 500 });
    }
  });

/**
 * Add a waiver to a membership plan
 */
export const addWaiverToMembership = os
  .input(AddWaiverToMembershipValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

    try {
      await addWaiverToMembershipPlan(input.membershipPlanId, input.waiverTemplateId, input.isRequired);

      logger.info(`[Waivers.addWaiverToMembership] Added waiver ${input.waiverTemplateId} to membership ${input.membershipPlanId}`);

      await audit(context, AUDIT_ACTION.MEMBERSHIP_WAIVER_ADD, AUDIT_ENTITY_TYPE.MEMBERSHIP_WAIVER, {
        entityId: input.membershipPlanId,
        status: 'success',
      });

      return {};
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to add waiver to membership: ${errorMessage}`);

      await audit(context, AUDIT_ACTION.MEMBERSHIP_WAIVER_ADD, AUDIT_ENTITY_TYPE.MEMBERSHIP_WAIVER, {
        entityId: input.membershipPlanId,
        status: 'failure',
        error: errorMessage,
      });

      throw error instanceof ORPCError ? error : new ORPCError('Failed to add waiver to membership.', { status: 500 });
    }
  });

/**
 * Remove a waiver from a membership plan
 */
export const removeWaiverFromMembership = os
  .input(RemoveWaiverFromMembershipValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

    try {
      await removeWaiverFromMembershipPlan(input.membershipPlanId, input.waiverTemplateId);

      logger.info(`[Waivers.removeWaiverFromMembership] Removed waiver ${input.waiverTemplateId} from membership ${input.membershipPlanId}`);

      await audit(context, AUDIT_ACTION.MEMBERSHIP_WAIVER_REMOVE, AUDIT_ENTITY_TYPE.MEMBERSHIP_WAIVER, {
        entityId: input.membershipPlanId,
        status: 'success',
      });

      return {};
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to remove waiver from membership: ${errorMessage}`);

      await audit(context, AUDIT_ACTION.MEMBERSHIP_WAIVER_REMOVE, AUDIT_ENTITY_TYPE.MEMBERSHIP_WAIVER, {
        entityId: input.membershipPlanId,
        status: 'failure',
        error: errorMessage,
      });

      throw error instanceof ORPCError ? error : new ORPCError('Failed to remove waiver from membership.', { status: 500 });
    }
  });

// =============================================================================
// PLACEHOLDER RESOLUTION HANDLER
// =============================================================================

/**
 * Resolve placeholders in a waiver template
 */
export const resolveTemplatePlaceholders = os
  .input(ResolveWaiverPlaceholdersValidation)
  .handler(async ({ input }) => {
    const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);

    try {
      const template = await getWaiverTemplateById(input.templateId, orgId);
      if (!template) {
        throw new ORPCError('Waiver template not found', { status: 404 });
      }

      // Fetch merge fields from database
      const mergeFields = await getOrganizationMergeFields(orgId);

      // Build merge field values, allowing overrides
      const fieldValues = mergeFields.map(f => ({
        key: f.key,
        value: input.overrides?.[f.key] ?? f.defaultValue,
      }));

      const resolvedContent = resolveWaiverPlaceholders(template.content, fieldValues);

      return {
        templateId: template.id,
        templateVersion: template.version,
        resolvedContent,
      };
    } catch (error) {
      if (error instanceof ORPCError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to resolve waiver placeholders: ${errorMessage}`);
      throw new ORPCError('Failed to resolve waiver placeholders.', { status: 500 });
    }
  });

// =============================================================================
// MERGE FIELD HANDLERS
// =============================================================================

/**
 * List all merge fields for the organization
 */
export const listMergeFields = os.handler(async () => {
  const { orgId } = await guardRole(ORG_ROLE.FRONT_DESK);
  const mergeFields = await getOrganizationMergeFields(orgId);
  return { mergeFields };
});

/**
 * Create a new merge field
 */
export const createMergeFieldHandler = os
  .input(CreateMergeFieldValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

    try {
      const mergeField = await createMergeField(input, context.orgId);

      await audit(context, AUDIT_ACTION.MERGE_FIELD_CREATE, AUDIT_ENTITY_TYPE.WAIVER_MERGE_FIELD, {
        entityId: mergeField.id,
        status: 'success',
      });

      return { mergeField };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await audit(context, AUDIT_ACTION.MERGE_FIELD_CREATE, AUDIT_ENTITY_TYPE.WAIVER_MERGE_FIELD, {
        status: 'failure',
        error: errorMessage,
      });

      throw error instanceof ORPCError ? error : new ORPCError('Failed to create merge field.', { status: 500 });
    }
  });

/**
 * Update an existing merge field
 */
export const updateMergeFieldHandler = os
  .input(UpdateMergeFieldValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

    try {
      const { id, ...updateData } = input;
      const mergeField = await updateMergeField(id, updateData, context.orgId);

      await audit(context, AUDIT_ACTION.MERGE_FIELD_UPDATE, AUDIT_ENTITY_TYPE.WAIVER_MERGE_FIELD, {
        entityId: mergeField.id,
        status: 'success',
      });

      return { mergeField };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await audit(context, AUDIT_ACTION.MERGE_FIELD_UPDATE, AUDIT_ENTITY_TYPE.WAIVER_MERGE_FIELD, {
        entityId: input.id,
        status: 'failure',
        error: errorMessage,
      });

      throw error instanceof ORPCError ? error : new ORPCError('Failed to update merge field.', { status: 500 });
    }
  });

/**
 * Delete a merge field
 */
export const deleteMergeFieldHandler = os
  .input(DeleteMergeFieldValidation)
  .handler(async ({ input }) => {
    const context = await guardRole(ORG_ROLE.ACADEMY_OWNER);

    try {
      await deleteMergeField(input.id, context.orgId);

      await audit(context, AUDIT_ACTION.MERGE_FIELD_DELETE, AUDIT_ENTITY_TYPE.WAIVER_MERGE_FIELD, {
        entityId: input.id,
        status: 'success',
      });

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await audit(context, AUDIT_ACTION.MERGE_FIELD_DELETE, AUDIT_ENTITY_TYPE.WAIVER_MERGE_FIELD, {
        entityId: input.id,
        status: 'failure',
        error: errorMessage,
      });

      throw error instanceof ORPCError ? error : new ORPCError('Failed to delete merge field.', { status: 500 });
    }
  });

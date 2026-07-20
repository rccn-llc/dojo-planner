import { randomUUID } from 'node:crypto';
import { and, count, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/libs/DB';
import {
  membershipPlanSchema,
  membershipWaiverSchema,
  signedWaiverSchema,
  waiverMergeFieldSchema,
  waiverTemplateSchema,
} from '@/models/Schema';

// =============================================================================
// TYPES
// =============================================================================

export type WaiverTemplate = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  version: number;
  content: string;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
  requiresGuardian: boolean;
  guardianAgeThreshold: number;
  sortOrder: number;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type WaiverTemplateWithStats = WaiverTemplate & {
  signedCount: number;
  membershipCount: number;
};

export type SignedWaiver = {
  id: string;
  organizationId: string;
  waiverTemplateId: string;
  waiverTemplateVersion: number;
  memberId: string;
  memberMembershipId: string | null;
  membershipPlanName: string | null;
  membershipPlanPrice: number | null;
  membershipPlanFrequency: string | null;
  membershipPlanContractLength: string | null;
  membershipPlanSignupFee: number | null;
  membershipPlanIsTrial: boolean | null;
  couponCode: string | null;
  couponType: string | null;
  couponAmount: string | null;
  couponDiscountedPrice: number | null;
  signatureDataUrl: string;
  signedByName: string;
  signedByEmail: string | null;
  signedByRelationship: string | null;
  memberSignatureDataUrl: string | null;
  memberSignedByName: string | null;
  memberFirstName: string;
  memberLastName: string;
  memberEmail: string;
  memberDateOfBirth: Date | null;
  memberAgeAtSigning: number | null;
  renderedContent: string;
  ipAddress: string | null;
  userAgent: string | null;
  signedAt: Date;
  createdAt: Date;
};

export type SignedWaiverWithTemplateName = SignedWaiver & {
  waiverName: string;
};

export type MembershipWaiverAssociation = {
  membershipPlanId: string;
  waiverTemplateId: string;
  isRequired: boolean;
  sortOrder: number;
  createdAt: Date;
};

type CreateWaiverTemplateInput = {
  id?: string;
  name: string;
  slug?: string;
  content: string;
  description?: string;
  isActive?: boolean;
  isDefault?: boolean;
  requiresGuardian?: boolean;
  guardianAgeThreshold?: number;
};

type UpdateWaiverTemplateInput = {
  id: string;
  name?: string;
  content?: string;
  description?: string | null;
  isActive?: boolean;
  isDefault?: boolean;
  requiresGuardian?: boolean;
  guardianAgeThreshold?: number;
};

type CreateSignedWaiverInput = {
  id?: string;
  waiverTemplateId: string;
  memberId: string;
  memberMembershipId?: string;
  membershipPlanName?: string;
  membershipPlanPrice?: number;
  membershipPlanFrequency?: string;
  membershipPlanContractLength?: string;
  membershipPlanSignupFee?: number;
  membershipPlanIsTrial?: boolean;
  couponCode?: string;
  couponType?: string;
  couponAmount?: string;
  couponDiscountedPrice?: number;
  signatureDataUrl: string;
  signedByName: string;
  signedByEmail?: string;
  signedByRelationship?: string;
  memberSignatureDataUrl?: string;
  memberSignedByName?: string;
  memberFirstName: string;
  memberLastName: string;
  memberEmail: string;
  memberDateOfBirth?: Date;
  memberAgeAtSigning?: number;
  renderedContent: string;
  ipAddress?: string;
  userAgent?: string;
};

export type WaiverMergeField = {
  id: string;
  organizationId: string;
  key: string;
  label: string;
  defaultValue: string;
  description: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Resolve waiver placeholders with dynamic merge field values.
 * Each merge field's key is matched case-insensitively as <key>.
 */
export function resolveWaiverPlaceholders(
  content: string,
  mergeFields: Array<{ key: string; value: string }>,
): string {
  let resolved = content;
  for (const field of mergeFields) {
    resolved = resolved.replace(new RegExp(`<${field.key}>`, 'gi'), field.value);
  }
  return resolved;
}

// =============================================================================
// WAIVER TEMPLATE SERVICE FUNCTIONS
// =============================================================================

/**
 * Get all waiver templates for an organization
 */
export async function getOrganizationWaiverTemplates(organizationId: string): Promise<WaiverTemplateWithStats[]> {
  const templates = await db
    .select()
    .from(waiverTemplateSchema)
    .where(and(
      eq(waiverTemplateSchema.organizationId, organizationId),
      isNull(waiverTemplateSchema.parentId),
      eq(waiverTemplateSchema.isActive, true),
    ));

  if (templates.length === 0) {
    return [];
  }

  const templateIds = templates.map(t => t.id);

  // Count signed waivers + membership associations per template via grouped
  // aggregates. Previously this loaded EVERY signed_waiver row (base64
  // signatures + full rendered content) just to count them in JS — potentially
  // megabytes transferred to compute integers. Now the DB returns one row per
  // template with its count.
  const [signedCounts, membershipCounts] = await Promise.all([
    db
      .select({ waiverTemplateId: signedWaiverSchema.waiverTemplateId, n: count() })
      .from(signedWaiverSchema)
      .where(inArray(signedWaiverSchema.waiverTemplateId, templateIds))
      .groupBy(signedWaiverSchema.waiverTemplateId),
    db
      .select({ waiverTemplateId: membershipWaiverSchema.waiverTemplateId, n: count() })
      .from(membershipWaiverSchema)
      .where(inArray(membershipWaiverSchema.waiverTemplateId, templateIds))
      .groupBy(membershipWaiverSchema.waiverTemplateId),
  ]);

  const signedCountMap = new Map<string, number>(signedCounts.map(r => [r.waiverTemplateId, r.n]));
  const membershipCountMap = new Map<string, number>(membershipCounts.map(r => [r.waiverTemplateId, r.n]));

  return templates.map(template => ({
    id: template.id,
    organizationId: template.organizationId,
    name: template.name,
    slug: template.slug,
    version: template.version,
    content: template.content,
    description: template.description,
    isActive: template.isActive ?? true,
    isDefault: template.isDefault ?? false,
    requiresGuardian: template.requiresGuardian ?? true,
    guardianAgeThreshold: template.guardianAgeThreshold ?? 16,
    sortOrder: template.sortOrder ?? 0,
    parentId: template.parentId,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    signedCount: signedCountMap.get(template.id) || 0,
    membershipCount: membershipCountMap.get(template.id) || 0,
  }));
}

/**
 * Get a single waiver template by ID
 */
export async function getWaiverTemplateById(templateId: string, organizationId: string): Promise<WaiverTemplateWithStats | null> {
  // Direct single-row fetch + two scalar counts, rather than materializing and
  // aggregating every template in the org just to `.find()` one.
  // Match getOrganizationWaiverTemplates' filter (active, non-archived parents)
  // so behavior is identical to the previous "aggregate all then .find()".
  const [template] = await db
    .select()
    .from(waiverTemplateSchema)
    .where(and(
      eq(waiverTemplateSchema.id, templateId),
      eq(waiverTemplateSchema.organizationId, organizationId),
      isNull(waiverTemplateSchema.parentId),
      eq(waiverTemplateSchema.isActive, true),
    ))
    .limit(1);

  if (!template) {
    return null;
  }

  const [[signed], [membership]] = await Promise.all([
    db.select({ n: count() }).from(signedWaiverSchema).where(eq(signedWaiverSchema.waiverTemplateId, templateId)),
    db.select({ n: count() }).from(membershipWaiverSchema).where(eq(membershipWaiverSchema.waiverTemplateId, templateId)),
  ]);

  return {
    id: template.id,
    organizationId: template.organizationId,
    name: template.name,
    slug: template.slug,
    version: template.version,
    content: template.content,
    description: template.description,
    isActive: template.isActive ?? true,
    isDefault: template.isDefault ?? false,
    requiresGuardian: template.requiresGuardian ?? true,
    guardianAgeThreshold: template.guardianAgeThreshold ?? 16,
    sortOrder: template.sortOrder ?? 0,
    parentId: template.parentId,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    signedCount: signed?.n ?? 0,
    membershipCount: membership?.n ?? 0,
  };
}

/**
 * Get active waiver templates for an organization
 */
export async function getActiveWaiverTemplates(organizationId: string): Promise<WaiverTemplateWithStats[]> {
  const templates = await getOrganizationWaiverTemplates(organizationId);
  return templates.filter(t => t.isActive);
}

/**
 * Get the default waiver template for an organization
 */
export async function getDefaultWaiverTemplate(organizationId: string): Promise<WaiverTemplateWithStats | null> {
  const templates = await getOrganizationWaiverTemplates(organizationId);
  return templates.find(t => t.isDefault && t.isActive) || null;
}

/**
 * Create a new waiver template
 */
export async function createWaiverTemplate(
  input: CreateWaiverTemplateInput,
  organizationId: string,
): Promise<WaiverTemplate> {
  const templateId = input.id || randomUUID();
  const slug = input.slug || generateSlug(input.name);

  // If this is set as default, unset other default templates
  if (input.isDefault) {
    await db
      .update(waiverTemplateSchema)
      .set({ isDefault: false })
      .where(eq(waiverTemplateSchema.organizationId, organizationId));
  }

  const result = await db
    .insert(waiverTemplateSchema)
    .values({
      id: templateId,
      organizationId,
      name: input.name,
      slug,
      version: 1,
      content: input.content,
      description: input.description,
      isActive: input.isActive ?? true,
      isDefault: input.isDefault ?? false,
      requiresGuardian: input.requiresGuardian ?? true,
      guardianAgeThreshold: input.guardianAgeThreshold ?? 16,
    })
    .returning();

  const template = result[0];
  if (!template) {
    throw new Error('Failed to create waiver template');
  }

  return {
    id: template.id,
    organizationId: template.organizationId,
    name: template.name,
    slug: template.slug,
    version: template.version,
    content: template.content,
    description: template.description,
    isActive: template.isActive ?? true,
    isDefault: template.isDefault ?? false,
    requiresGuardian: template.requiresGuardian ?? true,
    guardianAgeThreshold: template.guardianAgeThreshold ?? 16,
    sortOrder: template.sortOrder ?? 0,
    parentId: template.parentId,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

/**
 * Update an existing waiver template.
 * When content changes, an archive row is created to preserve the previous version,
 * and the root row is updated with the new content and incremented version.
 * Settings-only changes update the root row in-place without creating a new version.
 *
 * Returns `{ template, versionCreated }` where `versionCreated` indicates if an archive row was created.
 */
export async function updateWaiverTemplate(
  input: UpdateWaiverTemplateInput,
  organizationId: string,
): Promise<{ template: WaiverTemplate; versionCreated: boolean }> {
  const { id, ...updateData } = input;

  // Get current template to check if content is being updated
  const existing = await db
    .select()
    .from(waiverTemplateSchema)
    .where(and(eq(waiverTemplateSchema.id, id), eq(waiverTemplateSchema.organizationId, organizationId)));

  if (existing.length === 0) {
    throw new Error('Waiver template not found');
  }

  const currentTemplate = existing[0]!;
  const contentChanged = updateData.content !== undefined && updateData.content !== currentTemplate.content;

  // Build the partial set passed to the root update.
  const dataToUpdate: Record<string, unknown> = { ...updateData };
  if (contentChanged) {
    dataToUpdate.version = currentTemplate.version + 1;
  }
  // Re-derive the slug when the name changes so the URL slug stays in sync.
  if (updateData.name !== undefined && updateData.name !== currentTemplate.name) {
    dataToUpdate.slug = generateSlug(updateData.name);
  }

  // Run the entire update inside a transaction so:
  //   1) the unset-other-defaults, archive-insert, and root-update are atomic, and
  //   2) the root version bump happens BEFORE the archive insert. The archive
  //      copies the row at its OLD version; if we inserted it before bumping the
  //      root, both rows would briefly share (organization_id, slug, version) and
  //      hit the unique index violation.
  const updatedRow = await db.transaction(async (tx) => {
    if (updateData.isDefault) {
      await tx
        .update(waiverTemplateSchema)
        .set({ isDefault: false })
        .where(and(
          eq(waiverTemplateSchema.organizationId, organizationId),
          eq(waiverTemplateSchema.isDefault, true),
        ));
    }

    const updateResult = await tx
      .update(waiverTemplateSchema)
      .set(dataToUpdate)
      .where(and(eq(waiverTemplateSchema.id, id), eq(waiverTemplateSchema.organizationId, organizationId)))
      .returning();

    const updated = updateResult[0];
    if (!updated) {
      throw new Error('Failed to update waiver template');
    }

    if (contentChanged) {
      await tx.insert(waiverTemplateSchema).values({
        id: randomUUID(),
        organizationId: currentTemplate.organizationId,
        name: currentTemplate.name,
        slug: currentTemplate.slug,
        version: currentTemplate.version,
        content: currentTemplate.content,
        description: currentTemplate.description,
        isActive: currentTemplate.isActive,
        isDefault: currentTemplate.isDefault,
        requiresGuardian: currentTemplate.requiresGuardian,
        guardianAgeThreshold: currentTemplate.guardianAgeThreshold,
        sortOrder: currentTemplate.sortOrder,
        parentId: currentTemplate.id,
      });
    }

    return updated;
  });

  return {
    template: {
      id: updatedRow.id,
      organizationId: updatedRow.organizationId,
      name: updatedRow.name,
      slug: updatedRow.slug,
      version: updatedRow.version,
      content: updatedRow.content,
      description: updatedRow.description,
      isActive: updatedRow.isActive ?? true,
      isDefault: updatedRow.isDefault ?? false,
      requiresGuardian: updatedRow.requiresGuardian ?? true,
      guardianAgeThreshold: updatedRow.guardianAgeThreshold ?? 16,
      sortOrder: updatedRow.sortOrder ?? 0,
      parentId: updatedRow.parentId,
      createdAt: updatedRow.createdAt,
      updatedAt: updatedRow.updatedAt,
    },
    versionCreated: contentChanged,
  };
}

/**
 * Delete a waiver template (only if not in use)
 */
export async function deleteWaiverTemplate(templateId: string, organizationId: string): Promise<void> {
  // Check if template has any signed waivers
  const signedWaivers = await db
    .select()
    .from(signedWaiverSchema)
    .where(eq(signedWaiverSchema.waiverTemplateId, templateId));

  // Remove membership associations first — the template should no longer be
  // offered for new memberships regardless of which delete path we take.
  await db.delete(membershipWaiverSchema).where(eq(membershipWaiverSchema.waiverTemplateId, templateId));

  if (signedWaivers.length > 0) {
    // Signed waivers are legally immutable and reference this template, so we
    // cannot hard-delete it. Soft-delete instead: mark the root (and its
    // archive versions) inactive so it disappears from the templates list
    // while preserving the records the signed waivers point at.
    await db
      .update(waiverTemplateSchema)
      .set({ isActive: false })
      .where(and(
        eq(waiverTemplateSchema.organizationId, organizationId),
        or(eq(waiverTemplateSchema.id, templateId), eq(waiverTemplateSchema.parentId, templateId)),
      ));
    return;
  }

  // No signed waivers — safe to hard-delete archive versions and the root template.
  await db
    .delete(waiverTemplateSchema)
    .where(and(
      eq(waiverTemplateSchema.organizationId, organizationId),
      or(eq(waiverTemplateSchema.id, templateId), eq(waiverTemplateSchema.parentId, templateId)),
    ));
}

// =============================================================================
// VERSION HISTORY SERVICE FUNCTIONS
// =============================================================================

/**
 * Get the version history of a waiver template.
 * Returns the root (current) template plus all archived versions, sorted by version descending.
 */
export async function getWaiverTemplateVersionHistory(
  rootTemplateId: string,
  organizationId: string,
): Promise<WaiverTemplate[]> {
  const rows = await db
    .select()
    .from(waiverTemplateSchema)
    .where(and(
      eq(waiverTemplateSchema.organizationId, organizationId),
      or(eq(waiverTemplateSchema.id, rootTemplateId), eq(waiverTemplateSchema.parentId, rootTemplateId)),
    ));

  return rows
    .map(row => ({
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      slug: row.slug,
      version: row.version,
      content: row.content,
      description: row.description,
      isActive: row.isActive ?? true,
      isDefault: row.isDefault ?? false,
      requiresGuardian: row.requiresGuardian ?? true,
      guardianAgeThreshold: row.guardianAgeThreshold ?? 16,
      sortOrder: row.sortOrder ?? 0,
      parentId: row.parentId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }))
    .sort((a, b) => b.version - a.version);
}

/**
 * Get a single waiver template version by ID (archive or root).
 */
export async function getWaiverTemplateVersion(
  versionId: string,
  organizationId: string,
): Promise<WaiverTemplate | null> {
  const rows = await db
    .select()
    .from(waiverTemplateSchema)
    .where(and(
      eq(waiverTemplateSchema.id, versionId),
      eq(waiverTemplateSchema.organizationId, organizationId),
    ));

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    slug: row.slug,
    version: row.version,
    content: row.content,
    description: row.description,
    isActive: row.isActive ?? true,
    isDefault: row.isDefault ?? false,
    requiresGuardian: row.requiresGuardian ?? true,
    guardianAgeThreshold: row.guardianAgeThreshold ?? 16,
    sortOrder: row.sortOrder ?? 0,
    parentId: row.parentId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// =============================================================================
// SIGNED WAIVER SERVICE FUNCTIONS
// =============================================================================

/**
 * Get all signed waivers for a member, enriched with template name
 */
export async function getMemberSignedWaivers(memberId: string, organizationId: string): Promise<SignedWaiverWithTemplateName[]> {
  // Org-scope: signed waivers carry PII (name, DOB, email, signature, IP); only
  // return rows that belong to the caller's organization.
  const waivers = await db
    .select()
    .from(signedWaiverSchema)
    .where(and(eq(signedWaiverSchema.memberId, memberId), eq(signedWaiverSchema.organizationId, organizationId)));

  if (waivers.length === 0) {
    return [];
  }

  // Fetch template names for all referenced templates
  const templateIds = [...new Set(waivers.map(w => w.waiverTemplateId))];
  const templates = await db
    .select({ id: waiverTemplateSchema.id, name: waiverTemplateSchema.name })
    .from(waiverTemplateSchema)
    .where(inArray(waiverTemplateSchema.id, templateIds));

  const templateNameMap = new Map(templates.map(t => [t.id, t.name]));

  return waivers.map(w => ({
    id: w.id,
    organizationId: w.organizationId,
    waiverTemplateId: w.waiverTemplateId,
    waiverTemplateVersion: w.waiverTemplateVersion,
    memberId: w.memberId,
    memberMembershipId: w.memberMembershipId,
    membershipPlanName: w.membershipPlanName,
    membershipPlanPrice: w.membershipPlanPrice,
    membershipPlanFrequency: w.membershipPlanFrequency,
    membershipPlanContractLength: w.membershipPlanContractLength,
    membershipPlanSignupFee: w.membershipPlanSignupFee,
    membershipPlanIsTrial: w.membershipPlanIsTrial,
    couponCode: w.couponCode,
    couponType: w.couponType,
    couponAmount: w.couponAmount,
    couponDiscountedPrice: w.couponDiscountedPrice,
    signatureDataUrl: w.signatureDataUrl,
    signedByName: w.signedByName,
    signedByEmail: w.signedByEmail,
    signedByRelationship: w.signedByRelationship,
    memberSignatureDataUrl: w.memberSignatureDataUrl,
    memberSignedByName: w.memberSignedByName,
    memberFirstName: w.memberFirstName,
    memberLastName: w.memberLastName,
    memberEmail: w.memberEmail,
    memberDateOfBirth: w.memberDateOfBirth,
    memberAgeAtSigning: w.memberAgeAtSigning,
    renderedContent: w.renderedContent,
    ipAddress: w.ipAddress,
    userAgent: w.userAgent,
    signedAt: w.signedAt,
    createdAt: w.createdAt,
    waiverName: templateNameMap.get(w.waiverTemplateId) ?? 'Unknown Waiver',
  }));
}

/**
 * Get a signed waiver by ID
 */
export async function getSignedWaiverById(waiverId: string, organizationId: string): Promise<SignedWaiver | null> {
  const waivers = await db
    .select()
    .from(signedWaiverSchema)
    .where(and(eq(signedWaiverSchema.id, waiverId), eq(signedWaiverSchema.organizationId, organizationId)));

  const w = waivers[0];
  if (!w) {
    return null;
  }

  return {
    id: w.id,
    organizationId: w.organizationId,
    waiverTemplateId: w.waiverTemplateId,
    waiverTemplateVersion: w.waiverTemplateVersion,
    memberId: w.memberId,
    memberMembershipId: w.memberMembershipId,
    membershipPlanName: w.membershipPlanName,
    membershipPlanPrice: w.membershipPlanPrice,
    membershipPlanFrequency: w.membershipPlanFrequency,
    membershipPlanContractLength: w.membershipPlanContractLength,
    membershipPlanSignupFee: w.membershipPlanSignupFee,
    membershipPlanIsTrial: w.membershipPlanIsTrial,
    couponCode: w.couponCode,
    couponType: w.couponType,
    couponAmount: w.couponAmount,
    couponDiscountedPrice: w.couponDiscountedPrice,
    signatureDataUrl: w.signatureDataUrl,
    signedByName: w.signedByName,
    signedByEmail: w.signedByEmail,
    signedByRelationship: w.signedByRelationship,
    memberSignatureDataUrl: w.memberSignatureDataUrl,
    memberSignedByName: w.memberSignedByName,
    memberFirstName: w.memberFirstName,
    memberLastName: w.memberLastName,
    memberEmail: w.memberEmail,
    memberDateOfBirth: w.memberDateOfBirth,
    memberAgeAtSigning: w.memberAgeAtSigning,
    renderedContent: w.renderedContent,
    ipAddress: w.ipAddress,
    userAgent: w.userAgent,
    signedAt: w.signedAt,
    createdAt: w.createdAt,
  };
}

/**
 * Create a signed waiver record
 */
export async function createSignedWaiver(
  input: CreateSignedWaiverInput,
  organizationId: string,
): Promise<SignedWaiver> {
  const waiverId = input.id || randomUUID();

  // Get the template to record the version
  const template = await db
    .select()
    .from(waiverTemplateSchema)
    .where(eq(waiverTemplateSchema.id, input.waiverTemplateId));

  if (template.length === 0) {
    throw new Error('Waiver template not found');
  }

  const templateVersion = template[0]!.version;

  const result = await db
    .insert(signedWaiverSchema)
    .values({
      id: waiverId,
      organizationId,
      waiverTemplateId: input.waiverTemplateId,
      waiverTemplateVersion: templateVersion,
      memberId: input.memberId,
      memberMembershipId: input.memberMembershipId,
      membershipPlanName: input.membershipPlanName,
      membershipPlanPrice: input.membershipPlanPrice,
      membershipPlanFrequency: input.membershipPlanFrequency,
      membershipPlanContractLength: input.membershipPlanContractLength,
      membershipPlanSignupFee: input.membershipPlanSignupFee,
      membershipPlanIsTrial: input.membershipPlanIsTrial,
      couponCode: input.couponCode,
      couponType: input.couponType,
      couponAmount: input.couponAmount,
      couponDiscountedPrice: input.couponDiscountedPrice,
      signatureDataUrl: input.signatureDataUrl,
      signedByName: input.signedByName,
      signedByEmail: input.signedByEmail,
      signedByRelationship: input.signedByRelationship,
      memberSignatureDataUrl: input.memberSignatureDataUrl,
      memberSignedByName: input.memberSignedByName,
      memberFirstName: input.memberFirstName,
      memberLastName: input.memberLastName,
      memberEmail: input.memberEmail,
      memberDateOfBirth: input.memberDateOfBirth,
      memberAgeAtSigning: input.memberAgeAtSigning,
      renderedContent: input.renderedContent,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    })
    .returning();

  const w = result[0];
  if (!w) {
    throw new Error('Failed to create signed waiver');
  }

  return {
    id: w.id,
    organizationId: w.organizationId,
    waiverTemplateId: w.waiverTemplateId,
    waiverTemplateVersion: w.waiverTemplateVersion,
    memberId: w.memberId,
    memberMembershipId: w.memberMembershipId,
    membershipPlanName: w.membershipPlanName,
    membershipPlanPrice: w.membershipPlanPrice,
    membershipPlanFrequency: w.membershipPlanFrequency,
    membershipPlanContractLength: w.membershipPlanContractLength,
    membershipPlanSignupFee: w.membershipPlanSignupFee,
    membershipPlanIsTrial: w.membershipPlanIsTrial,
    couponCode: w.couponCode,
    couponType: w.couponType,
    couponAmount: w.couponAmount,
    couponDiscountedPrice: w.couponDiscountedPrice,
    signatureDataUrl: w.signatureDataUrl,
    signedByName: w.signedByName,
    signedByEmail: w.signedByEmail,
    signedByRelationship: w.signedByRelationship,
    memberSignatureDataUrl: w.memberSignatureDataUrl,
    memberSignedByName: w.memberSignedByName,
    memberFirstName: w.memberFirstName,
    memberLastName: w.memberLastName,
    memberEmail: w.memberEmail,
    memberDateOfBirth: w.memberDateOfBirth,
    memberAgeAtSigning: w.memberAgeAtSigning,
    renderedContent: w.renderedContent,
    ipAddress: w.ipAddress,
    userAgent: w.userAgent,
    signedAt: w.signedAt,
    createdAt: w.createdAt,
  };
}

// =============================================================================
// MEMBERSHIP-WAIVER ASSOCIATION SERVICE FUNCTIONS
// =============================================================================

/**
 * Thrown when a membership plan / waiver template / member referenced by an
 * association or read cannot be resolved within the caller's organization.
 * Routers map this to a 404 so a cross-tenant probe is indistinguishable from a
 * genuinely missing row.
 */
export class WaiverNotFoundError extends Error {
  constructor(message = 'Waiver resource not found') {
    super(message);
    this.name = 'WaiverNotFoundError';
  }
}

/**
 * Verify a membership plan belongs to the given organization. Throws
 * WaiverNotFoundError (→ 404) on miss.
 */
async function assertPlanInOrg(membershipPlanId: string, organizationId: string): Promise<void> {
  const rows = await db
    .select({ id: membershipPlanSchema.id })
    .from(membershipPlanSchema)
    .where(and(eq(membershipPlanSchema.id, membershipPlanId), eq(membershipPlanSchema.organizationId, organizationId)))
    .limit(1);

  if (rows.length === 0) {
    throw new WaiverNotFoundError('Membership plan not found');
  }
}

/**
 * Verify a waiver template belongs to the given organization. Throws
 * WaiverNotFoundError (→ 404) on miss.
 */
async function assertTemplateInOrg(waiverTemplateId: string, organizationId: string): Promise<void> {
  const rows = await db
    .select({ id: waiverTemplateSchema.id })
    .from(waiverTemplateSchema)
    .where(and(eq(waiverTemplateSchema.id, waiverTemplateId), eq(waiverTemplateSchema.organizationId, organizationId)))
    .limit(1);

  if (rows.length === 0) {
    throw new WaiverNotFoundError('Waiver template not found');
  }
}

/**
 * Get waiver templates associated with a membership plan
 */
export async function getWaiversForMembershipPlan(membershipPlanId: string, organizationId: string): Promise<WaiverTemplate[]> {
  // Org-scope: reject a cross-tenant plan id before reading its associations.
  await assertPlanInOrg(membershipPlanId, organizationId);

  const associations = await db
    .select()
    .from(membershipWaiverSchema)
    .where(eq(membershipWaiverSchema.membershipPlanId, membershipPlanId));

  if (associations.length === 0) {
    return [];
  }

  const waiverIds = associations.map(a => a.waiverTemplateId);
  const waivers = await db
    .select()
    .from(waiverTemplateSchema)
    .where(inArray(waiverTemplateSchema.id, waiverIds));

  // Sort by the sortOrder from the association
  const sortOrderMap = new Map(associations.map(a => [a.waiverTemplateId, a.sortOrder ?? 0]));

  return waivers
    .map(w => ({
      id: w.id,
      organizationId: w.organizationId,
      name: w.name,
      slug: w.slug,
      version: w.version,
      content: w.content,
      description: w.description,
      isActive: w.isActive ?? true,
      isDefault: w.isDefault ?? false,
      requiresGuardian: w.requiresGuardian ?? true,
      guardianAgeThreshold: w.guardianAgeThreshold ?? 16,
      sortOrder: sortOrderMap.get(w.id) ?? 0,
      parentId: w.parentId,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Get memberships associated with a waiver template
 */
export async function getMembershipsForWaiverTemplate(waiverTemplateId: string, organizationId: string): Promise<string[]> {
  // Org-scope: reject a cross-tenant template id before reading its associations.
  await assertTemplateInOrg(waiverTemplateId, organizationId);

  const associations = await db
    .select()
    .from(membershipWaiverSchema)
    .where(eq(membershipWaiverSchema.waiverTemplateId, waiverTemplateId));

  return associations.map(a => a.membershipPlanId);
}

/**
 * Set waiver associations for a membership plan
 */
export async function setMembershipPlanWaivers(
  membershipPlanId: string,
  waiverTemplateIds: string[],
  organizationId: string,
): Promise<void> {
  // Org-scope: the plan and every referenced template must belong to the org.
  await assertPlanInOrg(membershipPlanId, organizationId);
  await Promise.all(waiverTemplateIds.map(id => assertTemplateInOrg(id, organizationId)));

  // Remove existing associations
  await db.delete(membershipWaiverSchema).where(eq(membershipWaiverSchema.membershipPlanId, membershipPlanId));

  // Add new associations
  if (waiverTemplateIds.length > 0) {
    await db.insert(membershipWaiverSchema).values(
      waiverTemplateIds.map((waiverTemplateId, index) => ({
        membershipPlanId,
        waiverTemplateId,
        isRequired: true,
        sortOrder: index,
      })),
    );
  }
}

/**
 * Set the membership plans associated with a given waiver template — the
 * INVERSE of `setMembershipPlanWaivers`. Used by the waiver detail page's
 * "Associated Memberships" card. Previously that card mistakenly called
 * `setMembershipPlanWaivers` with the waiver id in the `membershipPlanId` slot,
 * so nothing ever saved (#267). This keys the junction rows on the waiver
 * template and replaces its full set of plan associations.
 */
export async function setWaiverMembershipPlans(
  waiverTemplateId: string,
  membershipPlanIds: string[],
  organizationId: string,
): Promise<void> {
  // Org-scope: the template and every referenced plan must belong to the org.
  await assertTemplateInOrg(waiverTemplateId, organizationId);
  await Promise.all(membershipPlanIds.map(id => assertPlanInOrg(id, organizationId)));

  // Remove existing associations for this waiver
  await db.delete(membershipWaiverSchema).where(eq(membershipWaiverSchema.waiverTemplateId, waiverTemplateId));

  // Add new associations, one row per selected membership plan
  if (membershipPlanIds.length > 0) {
    await db.insert(membershipWaiverSchema).values(
      membershipPlanIds.map((membershipPlanId, index) => ({
        membershipPlanId,
        waiverTemplateId,
        isRequired: true,
        sortOrder: index,
      })),
    );
  }
}

/**
 * Add a single waiver to a membership plan
 */
export async function addWaiverToMembershipPlan(
  membershipPlanId: string,
  waiverTemplateId: string,
  organizationId: string,
  isRequired: boolean = true,
): Promise<void> {
  // Org-scope: both the plan and the template must belong to the org.
  await assertPlanInOrg(membershipPlanId, organizationId);
  await assertTemplateInOrg(waiverTemplateId, organizationId);

  // Get current max sort order
  const existing = await db
    .select()
    .from(membershipWaiverSchema)
    .where(eq(membershipWaiverSchema.membershipPlanId, membershipPlanId));

  const maxSortOrder = existing.reduce((max, a) => Math.max(max, a.sortOrder ?? 0), -1);

  await db.insert(membershipWaiverSchema).values({
    membershipPlanId,
    waiverTemplateId,
    isRequired,
    sortOrder: maxSortOrder + 1,
  });
}

/**
 * Remove a waiver from a membership plan
 */
export async function removeWaiverFromMembershipPlan(
  membershipPlanId: string,
  waiverTemplateId: string,
  organizationId: string,
): Promise<void> {
  // Org-scope: the plan must belong to the org before altering its associations.
  await assertPlanInOrg(membershipPlanId, organizationId);

  await db
    .delete(membershipWaiverSchema)
    .where(
      and(
        eq(membershipWaiverSchema.membershipPlanId, membershipPlanId),
        eq(membershipWaiverSchema.waiverTemplateId, waiverTemplateId),
      ),
    );
}

/**
 * Get all membership plans that have a specific waiver associated
 */
export async function getMembershipPlansWithWaiver(
  waiverTemplateId: string,
  organizationId: string,
): Promise<Array<{ id: string; name: string }>> {
  const associations = await db
    .select()
    .from(membershipWaiverSchema)
    .where(eq(membershipWaiverSchema.waiverTemplateId, waiverTemplateId));

  if (associations.length === 0) {
    return [];
  }

  const membershipIds = associations.map(a => a.membershipPlanId);
  const memberships = await db
    .select({ id: membershipPlanSchema.id, name: membershipPlanSchema.name })
    .from(membershipPlanSchema)
    .where(
      and(
        inArray(membershipPlanSchema.id, membershipIds),
        eq(membershipPlanSchema.organizationId, organizationId),
      ),
    );

  return memberships;
}

// =============================================================================
// MERGE FIELD SERVICE FUNCTIONS
// =============================================================================

function mapMergeField(row: typeof waiverMergeFieldSchema.$inferSelect): WaiverMergeField {
  return {
    id: row.id,
    organizationId: row.organizationId,
    key: row.key,
    label: row.label,
    defaultValue: row.defaultValue,
    description: row.description,
    sortOrder: row.sortOrder ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Get all merge fields for an organization
 */
export async function getOrganizationMergeFields(organizationId: string): Promise<WaiverMergeField[]> {
  const fields = await db
    .select()
    .from(waiverMergeFieldSchema)
    .where(eq(waiverMergeFieldSchema.organizationId, organizationId));

  return fields.map(mapMergeField);
}

/**
 * Create a new merge field
 */
export async function createMergeField(
  input: { key: string; label: string; defaultValue: string; description?: string },
  organizationId: string,
): Promise<WaiverMergeField> {
  const fieldId = randomUUID();
  const result = await db
    .insert(waiverMergeFieldSchema)
    .values({
      id: fieldId,
      organizationId,
      key: input.key,
      label: input.label,
      defaultValue: input.defaultValue,
      description: input.description,
    })
    .returning();

  const field = result[0];
  if (!field) {
    throw new Error('Failed to create merge field');
  }

  return mapMergeField(field);
}

/**
 * Update an existing merge field
 */
export async function updateMergeField(
  id: string,
  input: { label?: string; defaultValue?: string; description?: string | null },
  organizationId: string,
): Promise<WaiverMergeField> {
  const result = await db
    .update(waiverMergeFieldSchema)
    .set(input)
    .where(
      and(
        eq(waiverMergeFieldSchema.id, id),
        eq(waiverMergeFieldSchema.organizationId, organizationId),
      ),
    )
    .returning();

  const field = result[0];
  if (!field) {
    throw new Error('Merge field not found');
  }

  return mapMergeField(field);
}

/**
 * Delete a merge field
 */
export async function deleteMergeField(id: string, organizationId: string): Promise<void> {
  await db
    .delete(waiverMergeFieldSchema)
    .where(
      and(
        eq(waiverMergeFieldSchema.id, id),
        eq(waiverMergeFieldSchema.organizationId, organizationId),
      ),
    );
}

// =============================================================================
// DASHBOARD STATS
// =============================================================================

/**
 * Count signed waivers in the current calendar month for the organization.
 * Used by the waivers dashboard "Signed This Month" stat card.
 */
export async function countSignedWaiversThisMonth(organizationId: string): Promise<number> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const rows = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(signedWaiverSchema)
    .where(
      and(
        eq(signedWaiverSchema.organizationId, organizationId),
        gte(signedWaiverSchema.signedAt, startOfMonth),
      ),
    );
  return rows[0]?.count ?? 0;
}

/**
 * Count distinct membership plans that have at least one waiver association
 * within the organization. Used by the waivers dashboard "Memberships Using"
 * stat card.
 */
export async function countMembershipsUsingWaivers(organizationId: string): Promise<number> {
  // Join through waiverTemplateSchema so the count is org-scoped.
  const rows = await db
    .select({
      count: sql<number>`cast(count(distinct ${membershipWaiverSchema.membershipPlanId}) as integer)`,
    })
    .from(membershipWaiverSchema)
    .innerJoin(
      waiverTemplateSchema,
      eq(membershipWaiverSchema.waiverTemplateId, waiverTemplateSchema.id),
    )
    .where(eq(waiverTemplateSchema.organizationId, organizationId));

  return rows[0]?.count ?? 0;
}

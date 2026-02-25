import {
  categoryCreate,
  categoryList,
  categoryRemove,
  categoryUpdate,
  create as createCatalogItem,
  get as getCatalogItem,
  imageCreate,
  imageRemove,
  list as listCatalogItems,
  listForKiosk as listCatalogItemsForKiosk,
  remove as removeCatalogItem,
  stockAdjust,
  update as updateCatalogItem,
  variantCreate,
  variantRemove,
  variantUpdate,
} from './Catalog';
import { tags as classTags, list as listClasses } from './Classes';
import { listActive as listActiveCoupons, list as listCoupons } from './Coupons';
import { earningsChart, financialStats, memberAverageChart, membershipStats } from './Dashboard';
import { list as listEvents } from './Events';
import { addMembership, changeMembership, create as createMember, listAllMembershipPlans, listMembershipPlans, listMemberTransactions, listPaymentMethods, remove as removeMember, restore as restoreMember, updateLastAccessed, update as updateMember, updateContactInfo as updateMemberContactInfo } from './Member';
import { list as listMembers } from './Members';
import { getTokenizationIframeConfig, processPayment } from './Payment';
import { chartData as reportChartData, currentValues as reportCurrentValues, insights as reportInsights } from './Reports';
import { listAll as listAllTags, listClassTags, listMembershipTags } from './Tags';
import { list as listTransactions } from './Transactions';
import {
  addWaiverToMembership,
  createMergeFieldHandler,
  createSignedWaiverRecord,
  createTemplate as createWaiverTemplate,
  deleteMergeFieldHandler,
  deleteTemplate as deleteWaiverTemplate,
  getSignedWaiver,
  getWaiversForMembership,
  getTemplate as getWaiverTemplate,
  getTemplateVersion as getWaiverTemplateVersion,
  listActiveTemplates as listActiveWaiverTemplates,
  listMemberSignedWaivers,
  listMergeFields,
  listTemplates as listWaiverTemplates,
  listTemplateVersions as listWaiverTemplateVersions,
  removeWaiverFromMembership,
  resolveTemplatePlaceholders,
  setMembershipWaiverAssociations,
  updateMergeFieldHandler,
  updateTemplate as updateWaiverTemplate,
} from './Waivers';

export const router = {
  members: {
    list: listMembers,
  },
  member: {
    create: createMember,
    update: updateMember,
    updateContactInfo: updateMemberContactInfo,
    addMembership,
    changeMembership,
    listMembershipPlans,
    listAllMembershipPlans,
    listPaymentMethods,
    listMemberTransactions,
    remove: removeMember,
    restore: restoreMember,
    updateLastAccessed,
  },
  classes: {
    list: listClasses,
    tags: classTags,
  },
  events: {
    list: listEvents,
  },
  tags: {
    listAll: listAllTags,
    listClassTags,
    listMembershipTags,
  },
  transactions: {
    list: listTransactions,
  },
  payment: {
    process: processPayment,
    getTokenizationConfig: getTokenizationIframeConfig,
  },
  dashboard: {
    membershipStats,
    financialStats,
    memberAverageChart,
    earningsChart,
  },
  reports: {
    currentValues: reportCurrentValues,
    chartData: reportChartData,
    insights: reportInsights,
  },
  coupons: {
    list: listCoupons,
    listActive: listActiveCoupons,
  },
  catalog: {
    list: listCatalogItems,
    listForKiosk: listCatalogItemsForKiosk,
    get: getCatalogItem,
    create: createCatalogItem,
    update: updateCatalogItem,
    remove: removeCatalogItem,
    variantCreate,
    variantUpdate,
    variantRemove,
    stockAdjust,
    categoryList,
    categoryCreate,
    categoryUpdate,
    categoryRemove,
    imageCreate,
    imageRemove,
  },
  waivers: {
    listTemplates: listWaiverTemplates,
    listActiveTemplates: listActiveWaiverTemplates,
    getTemplate: getWaiverTemplate,
    createTemplate: createWaiverTemplate,
    updateTemplate: updateWaiverTemplate,
    deleteTemplate: deleteWaiverTemplate,
    listMemberSignedWaivers,
    getSignedWaiver,
    createSignedWaiver: createSignedWaiverRecord,
    getWaiversForMembership,
    setMembershipWaivers: setMembershipWaiverAssociations,
    addWaiverToMembership,
    removeWaiverFromMembership,
    listTemplateVersions: listWaiverTemplateVersions,
    getTemplateVersion: getWaiverTemplateVersion,
    resolvePlaceholders: resolveTemplatePlaceholders,
    listMergeFields,
    createMergeField: createMergeFieldHandler,
    updateMergeField: updateMergeFieldHandler,
    deleteMergeField: deleteMergeFieldHandler,
  },
};

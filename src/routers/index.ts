import { list as listAttendance } from './Attendance';
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
import { tags as classTags, create as createClass, list as listClasses, remove as removeClass, removeException as removeClassException, update as updateClass, upsertException as upsertClassException } from './Classes';
import { create as createCoupon, getTotalSavings as getCouponTotalSavings, listActive as listActiveCoupons, list as listCoupons, remove as removeCoupon, update as updateCoupon } from './Coupons';
import { earningsChart, financialStats, memberAverageChart, membershipStats } from './Dashboard';
import { create as createEvent, list as listEvents, remove as removeEvent, update as updateEvent } from './Events';
import { addMembership, changeMembership, create as createMember, getHOHForMember, getHOHPaymentMethods, linkFamily, listAllMembershipPlans, listFamily, listMembershipPlans, listMemberTransactions, listPaymentMethods, removeFullyMember, remove as removeMember, restore as restoreMember, searchHOH, sendConfirmationEmail, unlinkFamily, updateLastAccessed, update as updateMember, updateContactInfo as updateMemberContactInfo, updatePhoto as updateMemberPhoto, updateMemberType } from './Member';
import { list as listMembers } from './Members';
import { create as createMembershipPlan, remove as removeMembershipPlan, update as updateMembershipPlan } from './MembershipPlans';
import { create as createNoteHandler, list as listNotes, remove as removeNoteHandler, update as updateNoteHandler } from './Notes';
import { getLocation as getOrganizationLocation, updateLocation as updateOrganizationLocation } from './Organization';
import { getTokenizationIframeConfig, processPayment, registerPaymentMethod } from './Payment';
import { create as createProgram, list as listPrograms, remove as removeProgram, update as updateProgram } from './Programs';
import { chartData as reportChartData, currentValues as reportCurrentValues, insights as reportInsights } from './Reports';
import { create as createRole, remove as removeRole, update as updateRole } from './Roles';
import { cancelSaasSubscription, changeSaasPlan, getCurrentPlan, getSaasBillingHistory, getSaasTokenizationConfig, subscribeToPlan } from './SaasSubscription';
import { create as createTagHandler, listAll as listAllTags, listClassTags, listMembershipTags, remove as removeTagHandler, update as updateTagHandler } from './Tags';
import { get as getTransaction, list as listTransactions, refund as refundTransaction } from './Transactions';
import {
  addWaiverToMembership,
  createMergeFieldHandler,
  createSignedWaiverRecord,
  createTemplate as createWaiverTemplate,
  deleteMergeFieldHandler,
  deleteTemplate as deleteWaiverTemplate,
  getSignedWaiver,
  getDashboardStats as getWaiverDashboardStats,
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
    updatePhoto: updateMemberPhoto,
    addMembership,
    changeMembership,
    listMembershipPlans,
    listAllMembershipPlans,
    listPaymentMethods,
    listMemberTransactions,
    remove: removeMember,
    removeFully: removeFullyMember,
    restore: restoreMember,
    updateLastAccessed,
    searchHOH,
    linkFamilyMember: linkFamily,
    listFamilyMembers: listFamily,
    getHOHPaymentMethods,
    unlinkFamilyMember: unlinkFamily,
    getHOHForMember,
    sendConfirmationEmail,
    updateMemberType,
  },
  classes: {
    list: listClasses,
    tags: classTags,
    create: createClass,
    update: updateClass,
    remove: removeClass,
    upsertException: upsertClassException,
    removeException: removeClassException,
  },
  events: {
    list: listEvents,
    create: createEvent,
    update: updateEvent,
    remove: removeEvent,
  },
  attendance: {
    list: listAttendance,
  },
  tags: {
    listAll: listAllTags,
    listClassTags,
    listMembershipTags,
    create: createTagHandler,
    update: updateTagHandler,
    remove: removeTagHandler,
  },
  transactions: {
    list: listTransactions,
    get: getTransaction,
    refund: refundTransaction,
  },
  payment: {
    process: processPayment,
    registerPaymentMethod,
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
    create: createCoupon,
    update: updateCoupon,
    remove: removeCoupon,
    getTotalSavings: getCouponTotalSavings,
  },
  membershipPlans: {
    create: createMembershipPlan,
    update: updateMembershipPlan,
    remove: removeMembershipPlan,
  },
  programs: {
    list: listPrograms,
    create: createProgram,
    update: updateProgram,
    remove: removeProgram,
  },
  notes: {
    list: listNotes,
    create: createNoteHandler,
    update: updateNoteHandler,
    remove: removeNoteHandler,
  },
  organization: {
    getLocation: getOrganizationLocation,
    updateLocation: updateOrganizationLocation,
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
  roles: {
    create: createRole,
    update: updateRole,
    remove: removeRole,
  },
  saasSubscription: {
    getCurrentPlan,
    subscribe: subscribeToPlan,
    changePlan: changeSaasPlan,
    cancel: cancelSaasSubscription,
    getBillingHistory: getSaasBillingHistory,
    getTokenizationConfig: getSaasTokenizationConfig,
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
    getDashboardStats: getWaiverDashboardStats,
  },
};

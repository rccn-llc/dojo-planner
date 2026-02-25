/**
 * Utility functions for the member detail page
 */

/**
 * Get initials from a full name
 */
export const getInitials = (name: string): string => {
  const parts = name.split(' ');
  return parts.map(part => part[0]).join('').toUpperCase();
};

/**
 * Format a number as US currency
 */
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

/**
 * Get the icon for a payment method type
 */
export const getPaymentTypeIcon = (type: string): string => {
  const iconMap: Record<string, string> = {
    card: '💳',
    bank_transfer: '🏦',
    cash: '💵',
    check: '📝',
  };
  return iconMap[type.toLowerCase()] || '💳';
};

/**
 * Get a human-readable label for a payment method type
 */
export const getPaymentTypeLabel = (type: string): string => {
  const labelMap: Record<string, string> = {
    card: 'Card',
    bank_transfer: 'Bank Transfer',
    cash: 'Cash',
    check: 'Check',
  };
  return labelMap[type.toLowerCase()] || type;
};

/**
 * Format a transaction type to a human-readable label
 */
export const formatTransactionType = (type: string): string => {
  const map: Record<string, string> = {
    membership_payment: 'Membership Payment',
    event_registration: 'Event Registration',
    signup_fee: 'Signup Fee',
    refund: 'Refund',
    adjustment: 'Adjustment',
  };
  return map[type] || type;
};

/**
 * Get the badge variant color for a membership status
 */
export const getStatusColor = (status: 'active' | 'on-hold' | 'cancelled'): 'default' | 'secondary' | 'destructive' => {
  if (status === 'active') {
    return 'default';
  }
  if (status === 'on-hold') {
    return 'secondary';
  }
  return 'destructive';
};

/**
 * Get a human-readable label for a membership status
 */
export const getStatusLabel = (status: 'active' | 'on-hold' | 'cancelled'): string => {
  if (status === 'on-hold') {
    return 'On Hold';
  }
  return status.charAt(0).toUpperCase() + status.slice(1);
};

/**
 * Determine which tab to show based on URL parameter
 * Handles backwards compatibility for removed 'financial' tab
 */
export const resolveTabFromUrl = (tabParam: string | null): 'overview' | 'attendance' | 'notes' => {
  if (tabParam === 'attendance') {
    return 'attendance';
  }
  if (tabParam === 'notes') {
    return 'notes';
  }
  // 'overview', 'financial', or any other value defaults to overview
  return 'overview';
};

export const ROLES = Object.freeze({
    ADMIN: 'admin',
    EMPLOYEE: 'employee',
    MANAGER: 'manager'
});

export const APPROVAL_STATUS = Object.freeze({
    PENDING_MANAGER: 'pending_manager',
    PENDING_ADMIN: 'pending_admin',
    APPROVED: 'approved',
    REJECTED: 'rejected'
});

export const ACCOUNT_TYPES = ['Private', 'UPA', 'Military'];

export const ENTITY_TYPES = Object.freeze({
    DOCTOR: 'doctor',
    ACCOUNT: 'account',
    CASE: 'case',
    PRODUCT: 'product',
    EMPLOYEE: 'employee'
});

export const NOTIFICATION_TYPES = Object.freeze({
    APPROVAL: 'approval',
    INFO: 'info'
});

export const LOCAL_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const MAX_PRODUCTS_PER_CASE = 7;

export const STATUS_LABELS = {
    [APPROVAL_STATUS.PENDING_MANAGER]: 'Pending Manager',
    [APPROVAL_STATUS.PENDING_ADMIN]: 'Pending Admin',
    [APPROVAL_STATUS.APPROVED]: 'Approved',
    [APPROVAL_STATUS.REJECTED]: 'Rejected'
};

export const COLORS = {
    company: '#22d3ee',
    competitor: '#ec4899',
    cases: '#6366f1',
    accounts: '#f59e0b',
    doctors: '#38bdf8'
};

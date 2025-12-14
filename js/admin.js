import { supabase, handleSupabase } from './supabaseClient.js';
import { requireAuth, logout, updatePassword, hydrateSession } from './session.js';
import { ROLES, APPROVAL_STATUS, ACCOUNT_TYPES } from './constants.js';
import { showWelcomePopup } from './welcomePopup.js';
import {
    formatDate,
    formatNumber,
    showAlert,
    hideAlert,
    setActiveSection,
    initTabNavigation,
    initAutocomplete,
    setLoadingState,
    handleError,
    distinct,
    formatMonth,
    downloadAsExcel,
    readExcelFile,
    initThemeToggle,
    ensureThemeApplied,
    makeSelectSearchable,
    addEnglishOnlyValidation,
    validateFormEnglishOnly
} from './utils.js';
import { createTable, tableFormatters, bindTableActions, exportTableToExcel, ensureTabulator } from './tables.js';
import { applyChartDefaults, resetChartDefaults, buildLineChart, buildBarChart, buildDoughnutChart, buildPieChart, destroyChart } from './charts.js';
import { fetchNotifications, markNotificationsRead, createNotification } from './notifications.js';
import { initFormModal, openFormModal, refreshFormHosts, closeFormModal } from './formModal.js';
import {
    groupCaseProducts,
    computeCaseMetrics,
    computeCaseMetricsWithSubcategoryFilter,
    buildCaseTableRow,
    buildCaseTableColumns,
    buildCaseExportRows,
    CASE_EXPORT_HEADERS,
    collectCaseFilterOptions,
    collectDualRowFilterOptions,
    aggregateCasesByMonthDual,
    aggregateUnitsByMonthDual,
    calculateCasesMarketShare,
    calculateUnitsMarketShare,
    calculateUPAvsPrivateCases,
    calculateUnitsPerCategory,
    calculateUnitsPerCompanyStacked,
    calculateCasesByProductSpecialist,
    calculateCasesByProduct,
    calculateUnitsByProductSpecialist,
    calculateUnitsByProduct,
    attachProductsToggle
} from './caseAnalytics.js';

ensureThemeApplied();

const state = {
    session: null,
    lines: [],
    companies: [],
    employees: [],
    users: [],
    products: [],
    doctors: [],
    accounts: [],
    cases: [],
    caseProducts: [],
    caseProductsByCase: new Map(),
    approvals: [],
    tables: {},
    charts: {},
    filters: {
        cases: {},
        approvals: {},
        dashboard: {},
        products: {
            company: '',
            category: '',
            type: ''
        },
        doctors: {
            specialist: ''
        },
        accounts: {
            specialist: '',
            accountType: ''
        }
    },
    autocompletes: {}
};

const elements = {
    sidebar: document.getElementById('sidebar'),
    navLinks: Array.from(document.querySelectorAll('.nav-link')),
    sections: Array.from(document.querySelectorAll('.page-section')),
    accountName: document.getElementById('account-name'),
    accountRole: document.getElementById('account-role'),
    notificationsIndicator: document.getElementById('notifications-indicator'),
    notificationsContainer: document.getElementById('notifications-container'),
    markNotificationsBtn: document.getElementById('mark-notifications-read'),
    btnNotifications: document.getElementById('btnNotifications'),
    btnToggleSidebar: document.getElementById('btnToggleSidebar'),
    btnToggleSidebarDesktop: document.getElementById('btnToggleSidebarDesktop'),
    btnLogout: document.getElementById('actionLogout'),
    btnChangePassword: document.getElementById('actionChangePassword'),
    passwordModal: document.getElementById('modalPassword'),
    passwordSaveBtn: document.getElementById('save-password-btn'),
    themeToggle: document.getElementById('themeToggle'),
    themeToggleIcon: document.getElementById('themeToggleIcon')
};

const bootstrapComponents = {
    notificationsOffcanvas: null,
    passwordModal: null
};

const approvalsOffcanvasId = 'offcanvasNotifications';

applyChartDefaults();

document.addEventListener('DOMContentLoaded', init);

async function init() {
    state.session = await requireAuth([ROLES.ADMIN]);
    if (!state.session) return;

    state.session = await hydrateSession(state.session, { force: true });

    initThemeToggle(elements.themeToggle, { iconElement: elements.themeToggleIcon, onThemeChange: resetChartDefaults });

    // Listen for theme changes and re-render dashboard
    window.addEventListener('themeChanged', () => {
        renderDashboard();
    });

    setupHeader();
    setupSidebar();
    setupModals();
    setupSectionNavigation();
    initFilterPanels();
    setupDatabaseTabs();
    initFormModal({ hostSelector: '.modal-form-host[data-form-id]' });

    await loadInitialData();
    await ensureTabulator();
    refreshSharedDatalists();
    initializeForms();
    refreshFormHosts();
    renderAll();
    await refreshNotifications();

    // Show welcome popup after everything is loaded
    showWelcomePopup(state.session, 3000);
}

function setupHeader() {
    const { employee } = state.session;
    if (employee) {
        elements.accountName.textContent = employee.fullName;
        elements.accountRole.textContent = employee.position || 'Admin';
    } else {
        elements.accountName.textContent = state.session.username;
        elements.accountRole.textContent = state.session.role || 'Administrator';
    }
}

function initFilterPanels() {
    const panels = document.querySelectorAll('.filters-panel');
    panels.forEach((panel) => {
        const toggle = panel.querySelector('.filters-panel-toggle');
        if (!toggle) return;
        const label = panel.querySelector('.filters-panel-toggle-label');
        const icon = panel.querySelector('.filters-panel-toggle-icon');

        const updateState = () => {
            const collapsed = panel.classList.contains('collapsed');
            toggle.setAttribute('aria-expanded', (!collapsed).toString());
            if (label) label.textContent = collapsed ? 'Show Filters' : 'Hide Filters';
            if (icon) icon.textContent = collapsed ? '\u25B6' : '\u25BC';
        };

        toggle.addEventListener('click', () => {
            panel.classList.toggle('collapsed');
            updateState();
        });

        updateState();
    });
}

function setupSidebar() {
    // Mobile toggle button
    elements.btnToggleSidebar?.addEventListener('click', () => {
        elements.sidebar?.classList.toggle('open');
    });

    // Desktop toggle button
    elements.btnToggleSidebarDesktop?.addEventListener('click', () => {
        elements.sidebar?.classList.toggle('collapsed');
    });

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
        const isMobile = window.innerWidth <= 1024;
        if (isMobile && elements.sidebar?.classList.contains('open')) {
            const clickedInsideSidebar = elements.sidebar.contains(e.target);
            const clickedToggleButton = elements.btnToggleSidebar?.contains(e.target);
            if (!clickedInsideSidebar && !clickedToggleButton) {
                elements.sidebar.classList.remove('open');
            }
        }
    });

    elements.btnLogout?.addEventListener('click', (event) => {
        event.preventDefault();
        logout();
    });

    elements.btnNotifications?.addEventListener('click', () => {
        bootstrapComponents.notificationsOffcanvas?.show();
    });
}

function setupModals() {
    if (window.bootstrap) {
        const offcanvasEl = document.getElementById(approvalsOffcanvasId);
        bootstrapComponents.notificationsOffcanvas = offcanvasEl
            ? new window.bootstrap.Offcanvas(offcanvasEl)
            : null;
        bootstrapComponents.passwordModal = elements.passwordModal
            ? new window.bootstrap.Modal(elements.passwordModal)
            : null;
    }

    elements.btnChangePassword?.addEventListener('click', (event) => {
        event.preventDefault();
        bootstrapComponents.passwordModal?.show();
    });

    elements.passwordSaveBtn?.addEventListener('click', handlePasswordUpdate);
    elements.markNotificationsBtn?.addEventListener('click', handleMarkNotificationsRead);
}

function setupSectionNavigation() {
    elements.navLinks.forEach((link) => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const target = link.dataset.sectionTarget;
            elements.navLinks.forEach((lnk) => lnk.classList.toggle('active', lnk === link));
            setActiveSection(elements.sections, target);
        });
    });
}

function setupDatabaseTabs() {
    const tabButtons = Array.from(document.querySelectorAll('#database-tabs button'));
    const panels = Array.from(document.querySelectorAll('.database-panel'));
    initTabNavigation(tabButtons, panels, 'databaseTab', 'products');
}

async function loadInitialData() {
    await Promise.all([
        loadLines(),
        loadCompanies()
    ]);

    await loadEmployees();
    await Promise.all([
        loadProducts(),
        loadDoctors(),
        loadAccounts(),
        loadCases()
    ]);
    buildApprovalsDataset();
}

function initializeForms() {
    setupEmployeeForm();
    setupProductForm();
    setupDoctorForm();
    setupAccountForm();
    setupCaseFilters();
    setupApprovalsFilters();
    setupDashboardFilters();
    setupExportButtons();
    setupProductBulkUpload();
    setupDoctorBulkUpload();
    setupAccountBulkUpload();
}

function renderAll() {
    renderEmployeeStats();
    renderEmployeesTable();
    renderProductsSection({ refreshFilters: true });
    renderDoctorsSection({ refreshFilters: true });
    renderAccountsSection({ refreshFilters: true });
    renderCasesSection();
    renderApprovalsTable();
    renderDashboard();
}

async function refreshNotifications() {
    const notifications = await fetchNotifications(state.session.userId, { includeRead: false });
    updateNotificationsUI(notifications);
}

async function handlePasswordUpdate() {
    const currentInput = document.getElementById('current-password');
    const newInput = document.getElementById('new-password');
    const confirmInput = document.getElementById('confirm-password');

    const current = currentInput.value.trim();
    const next = newInput.value.trim();
    const confirm = confirmInput.value.trim();

    if (!next || next !== confirm) {
        alert('New passwords do not match.');
        return;
    }

    if (!current) {
        alert('Please provide current password.');
        return;
    }

    try {
        const userRecord = state.users.find((user) => user.id === state.session.userId);
        if (userRecord && userRecord.password && userRecord.password !== current) {
            alert('Current password is incorrect.');
            return;
        }
        await updatePassword(state.session.userId, next);
        await loadUsers();
        alert('Password updated successfully.');
        elements.passwordModal?.querySelector('form')?.reset();
        bootstrapComponents.passwordModal?.hide();
    } catch (error) {
        alert(handleError(error));
    }
}

async function handleMarkNotificationsRead() {
    await markNotificationsRead(state.session.userId);
    await refreshNotifications();
}

function updateNotificationsUI(notifications = []) {
    if (!elements.notificationsIndicator || !elements.notificationsContainer) return;

    // Trigger bell ringing animation if there are new notifications
    if (notifications.length) {
        elements.notificationsIndicator.classList.remove('d-none');

        // Add ringing animation to bell icon
        const bellButton = document.getElementById('btnNotifications');
        if (bellButton && !bellButton.classList.contains('ring')) {
            bellButton.classList.add('ring');
            setTimeout(() => bellButton.classList.remove('ring'), 1500);
        }

        elements.notificationsContainer.innerHTML = notifications
            .map(
                (item) => `
                <div class="notification-item ${item.is_read ? '' : 'unread'}" style="position: relative;">
                    <div class="d-flex flex-column gap-2">
                        <span style="font-size: 0.95rem; line-height: 1.5;">${item.message}</span>
                        <small class="text-secondary" style="font-size: 0.8rem;">
                            <i class="bi bi-clock me-1"></i>${formatDate(item.created_at)}
                        </small>
                    </div>
                </div>`
            )
            .join('');
    } else {
        elements.notificationsIndicator.classList.add('d-none');
        elements.notificationsContainer.innerHTML = `
            <div class="text-center py-5">
                <i class="bi bi-bell-slash" style="font-size: 3rem; opacity: 0.3;"></i>
                <p class="text-secondary mt-3 mb-0">No new notifications</p>
            </div>`;
    }
}

async function loadLines() {
    const data = await handleSupabase(
        supabase
            .from('lines')
            .select('id, name, description')
            .order('name', { ascending: true }),
        'load lines'
    );
    state.lines = data || [];
    refreshSharedDatalists();
}

async function loadCompanies() {
    const data = await handleSupabase(
        supabase
            .from('companies')
            .select('id, name, is_company, created_at')
            .order('name', { ascending: true }),
        'load companies'
    );
    state.companies = data || [];
    refreshSharedDatalists();
}

async function loadUsers() {
    const data = await handleSupabase(
        supabase
            .from('users')
            .select('id, username, role, employee_id, password'),
        'load users'
    );
    state.users = data || [];
}

async function loadEmployees() {
    await loadUsers();
    const data = await handleSupabase(
        supabase
            .from('employees')
            .select(
                `id, code, first_name, last_name, position, role, manager_level, line_id, area, direct_manager_id, line_manager_id, is_active, email, phone, created_at, updated_at`
            )
            .order('first_name', { ascending: true }),
        'load employees'
    );

    state.employees = (data || []).map((item) => {
        const line = state.lines.find((ln) => ln.id === item.line_id);
        const user = state.users.find((usr) => usr.employee_id === item.id);
        return {
            ...item,
            full_name: `${item.first_name} ${item.last_name}`.trim(),
            line_name: line?.name,
            username: user?.username || '',
            userId: user?.id || null,
            password: user?.password || ''
        };
    });
    state.employeeById = new Map(state.employees.map((employee) => [String(employee.id), employee]));
}

async function loadProducts() {
    const data = await handleSupabase(
        supabase
            .from('products')
            .select('id, name, category, sub_category, company_id, line_id, is_company_product, is_active, created_at, updated_at')
            .order('name', { ascending: true }),
        'load products'
    );

    state.products = (data || []).map((product) => {
        const company = state.companies.find((cmp) => cmp.id === product.company_id);
        const line = state.lines.find((ln) => ln.id === product.line_id);
        return {
            ...product,
            company_name: company?.name,
            line_name: line?.name
        };
    });
}

async function loadDoctors() {
    const data = await handleSupabase(
        supabase
            .from('doctors')
            .select(
                'id, name, specialty, phone, email_address, owner_employee_id, secondary_employee_id, tertiary_employee_id, quaternary_employee_id, quinary_employee_id, line_id, secondary_line_id, tertiary_line_id, quaternary_line_id, quinary_line_id, line:line_id(name), secondary_line:secondary_line_id(name), tertiary_line:tertiary_line_id(name), quaternary_line:quaternary_line_id(name), quinary_line:quinary_line_id(name), status, created_at, updated_at'
            )
            .neq('status', APPROVAL_STATUS.REJECTED)
            .order('name', { ascending: true }),
        'load doctors'
    );
    state.doctors = (data || []).map((doctor) => {
        const { line: primaryLine, secondary_line: secondaryLine, tertiary_line: tertiaryLine, quaternary_line: quaternaryLine, quinary_line: quinaryLine, ...rest } = doctor;
        const owner = state.employees.find((emp) => emp.id === rest.owner_employee_id);
        const secondary = rest.secondary_employee_id
            ? state.employees.find((emp) => emp.id === rest.secondary_employee_id)
            : null;
        const tertiary = rest.tertiary_employee_id
            ? state.employees.find((emp) => emp.id === rest.tertiary_employee_id)
            : null;
        const quaternary = rest.quaternary_employee_id
            ? state.employees.find((emp) => emp.id === rest.quaternary_employee_id)
            : null;
        const quinary = rest.quinary_employee_id
            ? state.employees.find((emp) => emp.id === rest.quinary_employee_id)
            : null;
        const line = state.lines.find((ln) => ln.id === rest.line_id);
        const secondaryLineRef = rest.secondary_line_id
            ? state.lines.find((ln) => ln.id === rest.secondary_line_id)
            : null;
        const tertiaryLineRef = rest.tertiary_line_id
            ? state.lines.find((ln) => ln.id === rest.tertiary_line_id)
            : null;
        const quaternaryLineRef = rest.quaternary_line_id
            ? state.lines.find((ln) => ln.id === rest.quaternary_line_id)
            : null;
        const quinaryLineRef = rest.quinary_line_id
            ? state.lines.find((ln) => ln.id === rest.quinary_line_id)
            : null;
        return {
            ...rest,
            owner_name: owner?.full_name,
            owner_code: owner?.code,
            line_name: primaryLine?.name || owner?.line_name || line?.name || null,
            owner_line: primaryLine?.name || owner?.line_name || line?.name || null,
            secondary_owner_name: secondary?.full_name || null,
            tertiary_owner_name: tertiary?.full_name || null,
            quaternary_owner_name: quaternary?.full_name || null,
            quinary_owner_name: quinary?.full_name || null,
            secondary_line_name: secondaryLine?.name || secondary?.line_name || secondaryLineRef?.name || null,
            tertiary_line_name: tertiaryLine?.name || tertiary?.line_name || tertiaryLineRef?.name || null,
            quaternary_line_name: quaternaryLine?.name || quaternary?.line_name || quaternaryLineRef?.name || null,
            quinary_line_name: quinaryLine?.name || quinary?.line_name || quinaryLineRef?.name || null
        };
    });
}

async function loadAccounts() {
    const data = await handleSupabase(
        supabase
            .from('accounts')
            .select(
                'id, name, account_type, owner_employee_id, secondary_employee_id, tertiary_employee_id, line_id, secondary_line_id, tertiary_line_id, line:line_id(name), secondary_line:secondary_line_id(name), tertiary_line:tertiary_line_id(name), status, address, governorate, created_at, updated_at'
            )
            .neq('status', APPROVAL_STATUS.REJECTED)
            .order('name', { ascending: true }),
        'load accounts'
    );
    state.accounts = (data || []).map((account) => {
        const { line: primaryLine, secondary_line: secondaryLine, tertiary_line: tertiaryLine, ...rest } = account;
        const owner = state.employees.find((emp) => emp.id === rest.owner_employee_id);
        const secondary = rest.secondary_employee_id
            ? state.employees.find((emp) => emp.id === rest.secondary_employee_id)
            : null;
        const tertiary = rest.tertiary_employee_id
            ? state.employees.find((emp) => emp.id === rest.tertiary_employee_id)
            : null;
        const line = state.lines.find((ln) => ln.id === rest.line_id);
        const secondaryLineRef = rest.secondary_line_id
            ? state.lines.find((ln) => ln.id === rest.secondary_line_id)
            : null;
        const tertiaryLineRef = rest.tertiary_line_id
            ? state.lines.find((ln) => ln.id === rest.tertiary_line_id)
            : null;
        return {
            ...rest,
            owner_name: owner?.full_name,
            owner_code: owner?.code,
            line_name: primaryLine?.name || line?.name || owner?.line_name || null,
            secondary_owner_name: secondary?.full_name || null,
            tertiary_owner_name: tertiary?.full_name || null,
            secondary_line_name: secondaryLine?.name || secondary?.line_name || secondaryLineRef?.name || null,
            tertiary_line_name: tertiaryLine?.name || tertiary?.line_name || tertiaryLineRef?.name || null
        };
    });
}
async function loadCases() {
    const [cases, products] = await Promise.all([
        handleSupabase(
            supabase
                .from('v_case_details')
                .select('*')
                .neq('status', APPROVAL_STATUS.REJECTED)
                .order('case_date', { ascending: false }),
            'load cases'
        ),
        handleSupabase(
            supabase
                .from('case_products')
                .select('case_id, product_id, product_name, company_name, category, sub_category, is_company_product, units, sequence'),
            'load case products'
        )
    ]);

    state.cases = cases || [];
    state.caseProducts = products || [];
    state.caseProductsByCase = groupCaseProducts(state.caseProducts);
}

function buildApprovalsDataset() {
    const pendingDoctors = state.doctors.filter((doctor) => doctor.status !== APPROVAL_STATUS.APPROVED && doctor.status !== APPROVAL_STATUS.REJECTED);
    const pendingAccounts = state.accounts.filter((account) => account.status !== APPROVAL_STATUS.APPROVED && account.status !== APPROVAL_STATUS.REJECTED);
    const pendingCases = state.cases.filter((item) => item.status !== APPROVAL_STATUS.APPROVED && item.status !== APPROVAL_STATUS.REJECTED);

    state.approvals = [
        ...pendingDoctors.map((doctor) => ({
            id: doctor.id,
            type: 'doctor',
            name: doctor.name,
            ownerName: doctor.owner_name,
            submittedBy: doctor.owner_name,
            status: doctor.status,
            created_at: doctor.created_at,
            payload: doctor
        })),
        ...pendingAccounts.map((account) => ({
            id: account.id,
            type: 'account',
            name: account.name,
            ownerName: account.owner_name,
            submittedBy: account.owner_name,
            status: account.status,
            created_at: account.created_at,
            payload: account
        })),
        ...pendingCases.map((caseItem) => ({
            id: caseItem.id,
            type: 'case',
            name: caseItem.case_code || `Case ${caseItem.id.slice(0, 6)}`,
            ownerName: caseItem.submitted_by_name,
            submittedBy: caseItem.submitted_by_name,
            status: caseItem.status,
            created_at: caseItem.created_at,
            payload: caseItem
        }))
    ];
}
function setupEmployeeForm() {
    const container = document.querySelector('#employee-form .row');
    if (!container) return;
    container.innerHTML = `
        <input type="hidden" name="employee_id">
        <input type="hidden" name="user_id">
        <div class="col-12">
            <div id="employee-form-feedback" class="alert-feedback d-none"></div>
        </div>
        <div class="col-md-6">
            <label class="form-label">Code Number</label>
            <input type="text" class="form-control" name="code" required>
        </div>
        <div class="col-md-6">
            <label class="form-label">Position</label>
            <input type="text" class="form-control" name="position" required>
        </div>
        <div class="col-md-6">
            <label class="form-label">First Name</label>
            <input type="text" class="form-control" name="first_name" dir="auto" required>
        </div>
        <div class="col-md-6">
            <label class="form-label">Last Name</label>
            <input type="text" class="form-control" name="last_name" dir="auto" required>
        </div>
        <div class="col-md-6">
            <label class="form-label">Role</label>
            <select class="form-select" name="role" required>
                <option value="employee">Product Specialist</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
            </select>
        </div>
        <div class="col-md-6">
            <label class="form-label">Manager Level</label>
            <select class="form-select" name="manager_level">
                <option value="">Not Applicable</option>
                <option value="district">District Manager</option>
                <option value="line">Line Manager</option>
            </select>
        </div>
        <div class="col-md-6">
            <label class="form-label">Line</label>
            <input type="text" class="form-control" name="line_name" list="lines-list" placeholder="Type to search or add">
        </div>
        <div class="col-md-6">
            <label class="form-label">Area</label>
            <input type="text" class="form-control" name="area">
        </div>
        <div class="col-md-6">
            <label class="form-label">Direct Manager</label>
            <input type="text" class="form-control" name="direct_manager_name" placeholder="Type to search">
            <input type="hidden" name="direct_manager_id">
        </div>
        <div class="col-md-6">
            <label class="form-label">Line Manager</label>
            <input type="text" class="form-control" name="line_manager_name" placeholder="Type to search">
            <input type="hidden" name="line_manager_id">
        </div>
        <div class="col-md-6">
            <label class="form-label">Email</label>
            <input type="email" class="form-control" name="email">
        </div>
        <div class="col-md-6">
            <label class="form-label">Phone</label>
            <input type="tel" class="form-control" name="phone">
        </div>
        <div class="col-md-6">
            <label class="form-label">Username</label>
            <input type="text" class="form-control" name="username" autocomplete="off">
        </div>
        <div class="col-md-6">
            <label class="form-label">Password</label>
            <input type="text" class="form-control" name="password" autocomplete="off" placeholder="Leave blank to keep current">
        </div>
        <div class="col-md-6">
            <label class="form-label">Status</label>
            <select class="form-select" name="is_active">
                <option value="true">Active</option>
                <option value="false">Inactive</option>
            </select>
        </div>
        <div class="col-12 d-flex justify-content-end gap-2">
            <button type="button" class="btn btn-outline-ghost" id="reset-employee-form">Reset</button>
            <button type="submit" class="btn btn-gradient">Save Employee</button>
        </div>
    `;

    const form = document.getElementById('employee-form');
    const feedback = document.getElementById('employee-form-feedback');
    const resetEmployeeForm = () => {
        form.reset();
        form.employee_id.value = '';
        form.user_id.value = '';
        state.autocompletes.directManager?.clear();
        state.autocompletes.lineManager?.clear();
        hideAlert(feedback);
    };
    form.addEventListener('submit', handleEmployeeSubmit);
    form.addEventListener('mts:form-open', (event) => {
        const mode = event.detail?.mode || 'create';
        if (mode === 'create') {
            resetEmployeeForm();
        } else {
            hideAlert(feedback);
        }
    });
    form.addEventListener('mts:form-close', () => {
        hideAlert(feedback);
    });
    form.querySelector('#reset-employee-form').addEventListener('click', resetEmployeeForm);

    state.autocompletes.directManager = initAutocomplete({
        input: form.querySelector('input[name="direct_manager_name"]'),
        hiddenInput: form.querySelector('input[name="direct_manager_id"]'),
        items: state.employees.filter((emp) => emp.role !== ROLES.EMPLOYEE),
        labelSelector: (emp) => `${emp.full_name} (${emp.code})`,
        valueSelector: (emp) => emp.id
    });

    state.autocompletes.lineManager = initAutocomplete({
        input: form.querySelector('input[name="line_manager_name"]'),
        hiddenInput: form.querySelector('input[name="line_manager_id"]'),
        items: state.employees.filter((emp) => emp.role !== ROLES.EMPLOYEE),
        labelSelector: (emp) => `${emp.full_name} (${emp.code})`,
        valueSelector: (emp) => emp.id
    });
}

async function handleEmployeeSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
    const feedback = document.getElementById('employee-form-feedback');
    hideAlert(feedback);

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    const isUpdate = Boolean(payload.employee_id);

    if (!payload.code || !payload.first_name || !payload.last_name || !payload.position) {
        showAlert(feedback, 'Please fill in all required fields.');
        return;
    }

    try {
        setLoadingState(submitButton, true);

        let lineId = null;
        if (payload.line_name) {
            lineId = await ensureLine(payload.line_name.trim());
        }

        const employeeRecord = {
            code: payload.code.trim(),
            first_name: payload.first_name.trim(),
            last_name: payload.last_name.trim(),
            position: payload.position.trim(),
            role: payload.role,
            manager_level: payload.manager_level || null,
            line_id: lineId,
            area: payload.area || null,
            direct_manager_id: payload.direct_manager_id || null,
            line_manager_id: payload.line_manager_id || null,
            email: payload.email || null,
            phone: payload.phone || null,
            is_active: payload.is_active !== 'false'
        };

        if (isUpdate) {
            await handleSupabase(
                supabase
                    .from('employees')
                    .update(employeeRecord)
                    .eq('id', payload.employee_id),
                'update employee'
            );
        } else {
            const inserted = await handleSupabase(
                supabase
                    .from('employees')
                    .insert([{ ...employeeRecord }])
                    .select('id')
                    .single(),
                'insert employee'
            );
            payload.employee_id = inserted?.id;
        }

        if (payload.username) {
            if (payload.user_id) {
                await handleSupabase(
                    supabase
                        .from('users')
                        .update({
                            username: payload.username.trim(),
                            role: payload.role,
                            password: payload.password ? payload.password.trim() : undefined
                        })
                        .eq('id', payload.user_id),
                    'update user'
                );
            } else {
                await handleSupabase(
                    supabase
                        .from('users')
                        .insert({
                            username: payload.username.trim(),
                            password: payload.password?.trim() || '123456',
                            role: payload.role,
                            employee_id: payload.employee_id
                        }),
                    'create user'
                );
            }
        }

        await loadEmployees();
        form.reset();
        state.autocompletes.directManager.update(state.employees.filter((emp) => emp.role !== ROLES.EMPLOYEE));
        state.autocompletes.lineManager.update(state.employees.filter((emp) => emp.role !== ROLES.EMPLOYEE));
        renderEmployeeStats();
        renderEmployeesTable();
        showAlert(feedback, 'Employee saved successfully.', 'success');
        closeFormModal();
    } catch (error) {
        showAlert(feedback, handleError(error));
    } finally {
        setLoadingState(submitButton, false, 'Save Employee');
    }
}

async function ensureLine(name) {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = state.lines.find((line) => line.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing.id;
    const inserted = await handleSupabase(
        supabase
            .from('lines')
            .insert({ name: trimmed, created_by: state.session.employeeId })
            .select('id, name')
            .single(),
        'create line'
    );
    state.lines.push(inserted);
    state.lines.sort((a, b) => a.name.localeCompare(b.name));
    refreshSharedDatalists();
    return inserted.id;
}

function renderEmployeeStats() {
    const container = document.getElementById('employee-stat-cards');
    if (!container) return;
    const total = state.employees.length;
    const specialists = state.employees.filter((emp) => emp.role === ROLES.EMPLOYEE).length;
    const managers = state.employees.filter((emp) => emp.role === ROLES.MANAGER).length;
    const lines = distinct(state.employees.map((emp) => emp.line_name)).length;

    container.innerHTML = `
        <div class="stat-card">
            <h4>Total Employees</h4>
            <div class="value">${formatNumber(total)}</div>
        </div>
        <div class="stat-card">
            <h4>Product Specialists</h4>
            <div class="value">${formatNumber(specialists)}</div>
        </div>
        <div class="stat-card">
            <h4>Managers</h4>
            <div class="value">${formatNumber(managers)}</div>
        </div>
        <div class="stat-card">
            <h4>Active Lines</h4>
            <div class="value">${formatNumber(lines)}</div>
        </div>
    `;
}

function renderEmployeesTable() {
    const tableData = state.employees.map((emp) => ({
        id: emp.id,
        code: emp.code,
        name: emp.full_name,
        position: emp.position,
        role: emp.role,
        manager_level: emp.manager_level,
        line: emp.line_name,
        area: emp.area,
        direct_manager: getEmployeeName(emp.direct_manager_id),
        line_manager: getEmployeeName(emp.line_manager_id),
        username: emp.username,
        status: emp.is_active ? 'Active' : 'Inactive',
        created_at: emp.created_at
    }));

    const columns = [
        { title: 'Code', field: 'code', width: 120, headerFilter: 'input' },
        { title: 'Name', field: 'name', minWidth: 180, headerFilter: 'input' },
        { title: 'Position', field: 'position', minWidth: 140, headerFilter: 'input' },
        { title: 'Role', field: 'role', width: 120, headerFilter: 'input' },
        { title: 'Line', field: 'line', width: 150, headerFilter: 'input' },
        { title: 'Area', field: 'area', width: 150, headerFilter: 'input' },
        { title: 'Direct Manager', field: 'direct_manager', minWidth: 180, headerFilter: 'input' },
        { title: 'Username', field: 'username', width: 150, headerFilter: 'input' },
        { title: 'Status', field: 'status', width: 110 },
        { title: 'Created', field: 'created_at', formatter: tableFormatters.date, width: 140 },
        {
            title: 'Actions',
            field: 'actions',
            hozAlign: 'center',
            width: 180,
            formatter: tableFormatters.actions([
                { name: 'edit', label: 'Edit', icon: 'bi bi-pencil', variant: 'btn-gradient' },
                { name: 'delete', label: 'Delete', icon: 'bi bi-trash', variant: 'btn-outline-ghost' }
            ]),
            headerSort: false
        }
    ];

    state.tables.employees = createTable('employees-table', columns, tableData, { height: 520 });
    bindTableActions(state.tables.employees, {
        edit: (rowData) => populateEmployeeForm(rowData.id),
        delete: (rowData) => deleteEmployee(rowData.id)
    });
}

function getEmployeeName(id) {
    if (!id) return '';
    const employee = state.employees.find((emp) => emp.id === id);
    return employee ? employee.full_name : '';
}

function populateEmployeeForm(id) {
    const employee = state.employees.find((emp) => emp.id === id);
    if (!employee) return;
    const form = document.getElementById('employee-form');
    form.employee_id.value = employee.id;
    form.user_id.value = employee.userId || '';
    form.code.value = employee.code;
    form.position.value = employee.position || '';
    form.first_name.value = employee.first_name;
    form.last_name.value = employee.last_name;
    form.role.value = employee.role;
    form.manager_level.value = employee.manager_level || '';
    form.line_name.value = employee.line_name || '';
    form.area.value = employee.area || '';
    form.direct_manager_name.value = getEmployeeName(employee.direct_manager_id);
    form.direct_manager_id.value = employee.direct_manager_id || '';
    form.line_manager_name.value = getEmployeeName(employee.line_manager_id);
    form.line_manager_id.value = employee.line_manager_id || '';
    form.email.value = employee.email || '';
   form.phone.value = employee.phone || '';
   form.username.value = employee.username || '';
   form.password.value = '';
   form.is_active.value = employee.is_active ? 'true' : 'false';
    openFormModal('#employee-form', { title: 'Edit Employee', mode: 'edit', focusSelector: 'input[name="first_name"]' });
}

async function deleteEmployee(id) {
    if (!window.confirm('Are you sure you want to remove this employee?')) return;
    try {
        const user = state.users.find((usr) => usr.employee_id === id);
        if (user) {
            await handleSupabase(supabase.from('users').delete().eq('id', user.id), 'delete user');
        }
        await handleSupabase(supabase.from('employees').delete().eq('id', id), 'delete employee');
        await loadEmployees();
        renderEmployeeStats();
        renderEmployeesTable();
    } catch (error) {
        alert(handleError(error));
    }
}
function setupProductForm() {
    const container = document.querySelector('#product-form .row');
    if (!container) return;
    container.innerHTML = `
        <input type="hidden" name="product_id">
        <div class="col-12">
            <div id="product-form-feedback" class="alert-feedback d-none"></div>
        </div>
        <div class="col-12">
            <label class="form-label">Product Name</label>
            <input type="text" class="form-control" name="name" required>
        </div>
        <div class="col-12">
            <label class="form-label">Category</label>
            <input type="text" class="form-control" name="category" required>
        </div>
        <div class="col-12">
            <label class="form-label">Sub-category</label>
            <input type="text" class="form-control" name="sub_category" placeholder="Optional">
        </div>
        <div class="col-12">
            <label class="form-label">Company</label>
            <input type="text" class="form-control" name="company_name" list="company-list" placeholder="Type to search or add" required>
        </div>
        <div class="col-12">
            <label class="form-label">Line</label>
            <input type="text" class="form-control" name="line_name" list="lines-list" required>
        </div>
        <div class="col-12">
            <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" role="switch" name="is_company_product" id="is-company-product">
                <label class="form-check-label" for="is-company-product">Is Company Product</label>
            </div>
        </div>
        <div class="col-12 d-flex justify-content-end gap-2">
            <button type="button" class="btn btn-outline-ghost" id="reset-product-form">Reset</button>
            <button type="submit" class="btn btn-gradient">Save Product</button>
        </div>
    `;

    const form = document.getElementById('product-form');
    const feedback = document.getElementById('product-form-feedback');
    const resetProductForm = () => {
        form.reset();
        form.product_id.value = '';
        hideAlert(feedback);
    };
    form.addEventListener('submit', handleProductSubmit);
    form.addEventListener('mts:form-open', (event) => {
        const mode = event.detail?.mode || 'create';
        if (mode === 'create') {
            resetProductForm();
        } else {
            hideAlert(feedback);
        }
    });
    form.addEventListener('mts:form-close', () => {
        hideAlert(feedback);
    });
    form.querySelector('#reset-product-form').addEventListener('click', resetProductForm);
}

async function handleProductSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = document.getElementById('product-form-feedback');
    hideAlert(feedback);
    const submitButton = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    if (!payload.name || !payload.category || !payload.company_name || !payload.line_name) {
        showAlert(feedback, 'Please complete all product fields.');
        return;
    }

    try {
        setLoadingState(submitButton, true);
        const trimmedCompanyName = payload.company_name.trim();
        const isCompanyProduct = payload.is_company_product === 'on';
        const isUpdate = Boolean(payload.product_id);
        const existingProduct = isUpdate ? state.products.find((prod) => prod.id === payload.product_id) : null;
        let companyId = null;

        if (isUpdate && existingProduct?.company_id) {
            const originalCompanyId = existingProduct.company_id;
            const originalCompanyName = existingProduct.company_name || '';
            const nameChanged =
                trimmedCompanyName &&
                originalCompanyName &&
                trimmedCompanyName.toLowerCase() !== originalCompanyName.toLowerCase();
            const matchedCompany = state.companies.find(
                (company) => company.name.toLowerCase() === trimmedCompanyName.toLowerCase()
            );

            if (nameChanged) {
                if (matchedCompany && matchedCompany.id !== originalCompanyId) {
                    companyId = matchedCompany.id;
                } else {
                    await handleSupabase(
                        supabase
                            .from('companies')
                            .update({ name: trimmedCompanyName, is_company: isCompanyProduct })
                            .eq('id', originalCompanyId),
                        'rename company'
                    );
                    companyId = originalCompanyId;
                }
            } else {
                companyId = originalCompanyId;
                const companyRecord = state.companies.find((company) => company.id === originalCompanyId);
                if (companyRecord && Boolean(companyRecord.is_company) !== isCompanyProduct) {
                    await handleSupabase(
                        supabase
                            .from('companies')
                            .update({ is_company: isCompanyProduct })
                            .eq('id', originalCompanyId),
                        'update company type'
                    );
                }
            }
        }

        if (!companyId) {
            const existingByName = state.companies.find(
                (company) => company.name.toLowerCase() === trimmedCompanyName.toLowerCase()
            );
            if (existingByName) {
                companyId = existingByName.id;
                if (Boolean(existingByName.is_company) !== isCompanyProduct) {
                    await handleSupabase(
                        supabase
                            .from('companies')
                            .update({ is_company: isCompanyProduct })
                            .eq('id', existingByName.id),
                        'update company type'
                    );
                }
            } else {
                companyId = await ensureCompany(trimmedCompanyName, isCompanyProduct);
            }
        }
        const lineId = await ensureLine(payload.line_name.trim());
        const subCategory = payload.sub_category ? payload.sub_category.trim() : null;
        const record = {
            name: payload.name.trim(),
            category: payload.category.trim(),
            sub_category: subCategory,
            company_id: companyId,
            line_id: lineId,
            is_company_product: isCompanyProduct
        };

        if (isUpdate) {
            await handleSupabase(
                supabase
                    .from('products')
                    .update(record)
                    .eq('id', payload.product_id),
                'update product'
            );
            await syncCaseProductsForProduct(payload.product_id, {
                name: record.name,
                companyName: trimmedCompanyName,
                category: record.category,
                subCategory,
                isCompanyProduct
            });
        } else {
            await handleSupabase(
                supabase
                    .from('products')
                    .insert({ ...record, created_by: state.session.employeeId }),
                'insert product'
            );
        }

        await loadCompanies();
        await loadProducts();
        if (isUpdate) {
            await loadCases();
            buildApprovalsDataset();
            setupCaseFilters();
            renderCasesSection();
            renderApprovalsTable();
            setupDashboardFilters();
            renderDashboard();
        }
        form.reset();
        renderProductsSection({ refreshFilters: true });
        showAlert(feedback, 'Product saved successfully.', 'success');
        closeFormModal();
    } catch (error) {
        showAlert(feedback, handleError(error));
    } finally {
        setLoadingState(submitButton, false, 'Save Product');
    }
}

async function ensureCompany(name, isCompany = false) {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = state.companies.find((company) => company.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing.id;
    const inserted = await handleSupabase(
        supabase
            .from('companies')
            .insert({ name: trimmed, is_company: isCompany, created_by: state.session.employeeId })
            .select('id, name, is_company')
            .single(),
        'create company'
    );
    state.companies.push(inserted);
    return inserted.id;
}

async function syncCaseProductsForProduct(productId, details) {
    if (!productId) return;
    const updatePayload = {
        product_name: details.name,
        company_name: details.companyName,
        category: details.category,
        sub_category: details.subCategory || null,
        is_company_product: details.isCompanyProduct
    };
    await handleSupabase(
        supabase.from('case_products').update(updatePayload).eq('product_id', productId),
        'sync case product details'
    );
}

function renderProductsSection(options = {}) {
    const { refreshFilters = false } = options;
    if (refreshFilters) {
        renderProductFilters();
    }
    const filtered = getFilteredProducts();
    renderCompanyStats(filtered);
    renderProductTable(filtered);
}

function renderProductFilters() {
    const container = document.getElementById('product-filters');
    if (!container) return;
    const { company, category, type } = state.filters.products;
    const companies = distinct(state.products.map((product) => product.company_name).filter(Boolean)).sort((a, b) =>
        a.localeCompare(b)
    );
    const categories = distinct(state.products.map((product) => product.category).filter(Boolean)).sort((a, b) =>
        a.localeCompare(b)
    );
    const types = ['Company', 'Competitor'];

    if (company && !companies.includes(company)) {
        state.filters.products.company = '';
    }
    if (category && !categories.includes(category)) {
        state.filters.products.category = '';
    }
    if (type && !types.includes(type)) {
        state.filters.products.type = '';
    }
    const selectedCompany = state.filters.products.company;
    const selectedCategory = state.filters.products.category;
    const selectedType = state.filters.products.type;

    container.innerHTML = `
        <div class="filters-row">
            <select class="form-select form-select-sm" id="admin-filter-product-company" aria-label="Filter products by company">
                <option value="">All Companies</option>
                ${companies
                    .map(
                        (item) =>
                            `<option value="${item}"${item === selectedCompany ? ' selected' : ''}>${item}</option>`
                    )
                    .join('')}
            </select>
            <select class="form-select form-select-sm" id="admin-filter-product-category" aria-label="Filter products by category">
                <option value="">All Categories</option>
                ${categories
                    .map(
                        (item) =>
                            `<option value="${item}"${item === selectedCategory ? ' selected' : ''}>${item}</option>`
                    )
                    .join('')}
            </select>
            <select class="form-select form-select-sm" id="admin-filter-product-type" aria-label="Filter products by type">
                <option value="">All Types</option>
                ${types
                    .map(
                        (item) =>
                            `<option value="${item}"${item === selectedType ? ' selected' : ''}>${item}</option>`
                    )
                    .join('')}
            </select>
        </div>
    `;

    const handleChange = (event) => {
        const { id, value } = event.target;
        if (id === 'admin-filter-product-company') {
            state.filters.products.company = value;
        } else if (id === 'admin-filter-product-category') {
            state.filters.products.category = value;
        } else if (id === 'admin-filter-product-type') {
            state.filters.products.type = value;
        }
        renderProductsSection();
    };

    container.querySelectorAll('select').forEach((select) => {
        select.addEventListener('change', handleChange);
    });
}

function getFilteredProducts() {
    const { company, category, type } = state.filters.products;
    return state.products.filter((product) => {
        if (company && (product.company_name || '') !== company) return false;
        if (category && (product.category || '') !== category) return false;
        if (type) {
            const productType = product.is_company_product ? 'Company' : 'Competitor';
            if (productType !== type) return false;
        }
        return true;
    });
}

function renderCompanyStats(products = state.products) {
    const container = document.getElementById('product-stat-cards');
    if (!container) return;
    const totalProducts = products.length;
    const companyProducts = products.filter((product) => product.is_company_product).length;
    const competitorProducts = totalProducts - companyProducts;
    const uniqueCompanies = distinct(products.map((product) => product.company_name).filter(Boolean)).length;

    container.innerHTML = `
        <div class="stat-card">
            <h4>Total Products</h4>
            <div class="value">${formatNumber(totalProducts)}</div>
        </div>
        <div class="stat-card">
            <h4>Company Products</h4>
            <div class="value">${formatNumber(companyProducts)}</div>
        </div>
        <div class="stat-card">
            <h4>Competitor Products</h4>
            <div class="value">${formatNumber(competitorProducts)}</div>
        </div>
        <div class="stat-card">
            <h4>Companies</h4>
            <div class="value">${formatNumber(uniqueCompanies)}</div>
        </div>
    `;
}

function renderProductTable(products = state.products) {
    const tableData = products.map((product) => ({
        id: product.id,
        name: product.name,
        category: product.category,
        sub_category: product.sub_category,
        company: product.company_name,
        line: product.line_name,
        type: product.is_company_product ? 'Company' : 'Competitor',
        created_at: product.created_at
    }));

    const columns = [
        { title: 'Product', field: 'name', minWidth: 180, headerFilter: 'input' },
        { title: 'Category', field: 'category', minWidth: 140, headerFilter: 'input' },
        { title: 'Sub-category', field: 'sub_category', minWidth: 160, headerFilter: 'input' },
        { title: 'Company', field: 'company', minWidth: 180, headerFilter: 'input' },
        { title: 'Line', field: 'line', width: 140, headerFilter: 'input' },
        { title: 'Type', field: 'type', width: 120 },
        { title: 'Created', field: 'created_at', formatter: tableFormatters.date, width: 140 },
        {
            title: 'Actions',
            field: 'actions',
            hozAlign: 'center',
            width: 150,
            formatter: tableFormatters.actions([
                { name: 'edit', label: 'Edit', icon: 'bi bi-pencil', variant: 'btn-gradient' },
                { name: 'delete', label: 'Delete', icon: 'bi bi-trash', variant: 'btn-outline-ghost' }
            ]),
            headerSort: false
        }
    ];

    state.tables.products = createTable('products-table', columns, tableData, { height: 500 });
    bindTableActions(state.tables.products, {
        edit: (rowData) => populateProductForm(rowData.id),
        delete: (rowData) => deleteProduct(rowData.id)
    });
}

function populateProductForm(id) {
    const product = state.products.find((prod) => prod.id === id);
    if (!product) return;
    const form = document.getElementById('product-form');
    form.product_id.value = product.id;
    form.name.value = product.name;
    form.category.value = product.category;
    if (form.sub_category) {
        form.sub_category.value = product.sub_category || '';
    }
    form.company_name.value = product.company_name || '';
    form.line_name.value = product.line_name || '';
    form.is_company_product.checked = product.is_company_product;
    openFormModal('#product-form', { title: 'Edit Product', mode: 'edit', focusSelector: 'input[name="name"]' });
}

async function deleteProduct(id) {
    if (!window.confirm('Delete this product?')) return;
    try {
        await handleSupabase(supabase.from('products').delete().eq('id', id), 'delete product');
        await loadProducts();
        renderProductsSection({ refreshFilters: true });
    } catch (error) {
        alert(handleError(error));
    }
}
function setupDoctorForm() {
    const container = document.querySelector('#doctor-form .row');
    if (!container) return;
    container.innerHTML = `
        <input type="hidden" name="doctor_id">
        <div class="col-12">
            <div id="doctor-form-feedback" class="alert-feedback d-none"></div>
        </div>
        <div class="col-12">
            <label class="form-label">Doctor Name</label>
            <input type="text" class="form-control" name="name" dir="auto" required>
        </div>
        <div class="col-12">
            <label class="form-label">Product Specialist</label>
            <input type="text" class="form-control" name="owner_name" placeholder="Type to search" required>
            <input type="hidden" name="owner_id">
        </div>
        <div class="col-12">
            <label class="form-label">Line</label>
            <input type="text" class="form-control" name="line_name" list="lines-list" placeholder="Type to search" required>
        </div>
        <div class="col-12" id="doctor-add-secondary">
            <button type="button" class="btn btn-outline-ghost w-100" id="doctor-add-secondary-btn">Assign another Product Specialist</button>
        </div>
        <div class="col-12 d-none" data-section="doctor-secondary">
            <label class="form-label">Product Specialist 2 (Optional)</label>
            <input type="text" class="form-control" name="secondary_owner_name" placeholder="Type to search">
            <input type="hidden" name="secondary_owner_id">
        </div>
        <div class="col-12 d-none" data-section="doctor-secondary-line">
            <label class="form-label">PS 2 Line</label>
            <input type="text" class="form-control" name="secondary_line_name" list="lines-list" placeholder="Type to search">
        </div>
        <div class="col-12 d-none" id="doctor-add-tertiary">
            <button type="button" class="btn btn-outline-ghost w-100" id="doctor-add-tertiary-btn">Assign third Product Specialist</button>
        </div>
        <div class="col-12 d-none" data-section="doctor-tertiary">
            <label class="form-label">Product Specialist 3 (Optional)</label>
            <input type="text" class="form-control" name="tertiary_owner_name" placeholder="Type to search">
            <input type="hidden" name="tertiary_owner_id">
        </div>
        <div class="col-12 d-none" data-section="doctor-tertiary-line">
            <label class="form-label">PS 3 Line</label>
            <input type="text" class="form-control" name="tertiary_line_name" list="lines-list" placeholder="Type to search">
        </div>
        <div class="col-12 d-none" id="doctor-add-quaternary">
            <button type="button" class="btn btn-outline-ghost w-100" id="doctor-add-quaternary-btn">Assign fourth Product Specialist</button>
        </div>
        <div class="col-12 d-none" data-section="doctor-quaternary">
            <label class="form-label">Product Specialist 4 (Optional)</label>
            <input type="text" class="form-control" name="quaternary_owner_name" placeholder="Type to search">
            <input type="hidden" name="quaternary_owner_id">
        </div>
        <div class="col-12 d-none" data-section="doctor-quaternary-line">
            <label class="form-label">PS 4 Line</label>
            <input type="text" class="form-control" name="quaternary_line_name" list="lines-list" placeholder="Type to search">
        </div>
        <div class="col-12 d-none" id="doctor-add-quinary">
            <button type="button" class="btn btn-outline-ghost w-100" id="doctor-add-quinary-btn">Assign fifth Product Specialist</button>
        </div>
        <div class="col-12 d-none" data-section="doctor-quinary">
            <label class="form-label">Product Specialist 5 (Optional)</label>
            <input type="text" class="form-control" name="quinary_owner_name" placeholder="Type to search">
            <input type="hidden" name="quinary_owner_id">
        </div>
        <div class="col-12 d-none" data-section="doctor-quinary-line">
            <label class="form-label">PS 5 Line</label>
            <input type="text" class="form-control" name="quinary_line_name" list="lines-list" placeholder="Type to search">
        </div>
        <div class="col-12">
            <label class="form-label">Specialty</label>
            <input type="text" class="form-control" name="specialty">
        </div>
        <div class="col-12">
            <label class="form-label">Phone</label>
            <input type="tel" class="form-control" name="phone">
        </div>
        <div class="col-12">
            <label class="form-label">Email Address</label>
            <input type="email" class="form-control" name="email_address" placeholder="doctor@example.com">
        </div>
        <div class="col-12 d-flex justify-content-end gap-2">
            <button type="button" class="btn btn-outline-ghost" id="reset-doctor-form">Reset</button>
            <button type="submit" class="btn btn-gradient">Save Doctor</button>
        </div>
    `;

    const form = document.getElementById('doctor-form');
    const feedback = document.getElementById('doctor-form-feedback');
    const secondarySection = form.querySelector('[data-section="doctor-secondary"]');
    const secondaryLineSection = form.querySelector('[data-section="doctor-secondary-line"]');
    const tertiarySection = form.querySelector('[data-section="doctor-tertiary"]');
    const tertiaryLineSection = form.querySelector('[data-section="doctor-tertiary-line"]');
    const quaternarySection = form.querySelector('[data-section="doctor-quaternary"]');
    const quaternaryLineSection = form.querySelector('[data-section="doctor-quaternary-line"]');
    const quinarySection = form.querySelector('[data-section="doctor-quinary"]');
    const quinaryLineSection = form.querySelector('[data-section="doctor-quinary-line"]');
    const addSecondaryContainer = form.querySelector('#doctor-add-secondary');
    const addTertiaryContainer = form.querySelector('#doctor-add-tertiary');
    const addQuaternaryContainer = form.querySelector('#doctor-add-quaternary');
    const addQuinaryContainer = form.querySelector('#doctor-add-quinary');
    const addSecondaryBtn = form.querySelector('#doctor-add-secondary-btn');
    const addTertiaryBtn = form.querySelector('#doctor-add-tertiary-btn');
    const addQuaternaryBtn = form.querySelector('#doctor-add-quaternary-btn');
    const addQuinaryBtn = form.querySelector('#doctor-add-quinary-btn');

    const toggleDoctorTertiary = (show) => {
        if (show) {
            tertiarySection?.classList.remove('d-none');
            tertiaryLineSection?.classList.remove('d-none');
            addTertiaryContainer?.classList.add('d-none');
            if (!quaternarySection || quaternarySection.classList.contains('d-none')) {
                addQuaternaryContainer?.classList.remove('d-none');
            }
        } else {
            tertiarySection?.classList.add('d-none');
            tertiaryLineSection?.classList.add('d-none');
            if (secondarySection && !secondarySection.classList.contains('d-none')) {
                addTertiaryContainer?.classList.remove('d-none');
            } else {
                addTertiaryContainer?.classList.add('d-none');
            }
            addQuaternaryContainer?.classList.add('d-none');
            toggleDoctorQuaternary(false);
            form.tertiary_owner_name.value = '';
            form.tertiary_owner_id.value = '';
            form.tertiary_line_name.value = '';
            if (state.autocompletes.doctorTertiary) {
                state.autocompletes.doctorTertiary.clear();
            }
        }
    };

    const toggleDoctorQuaternary = (show) => {
        if (show) {
            quaternarySection?.classList.remove('d-none');
            quaternaryLineSection?.classList.remove('d-none');
            addQuaternaryContainer?.classList.add('d-none');
            if (!quinarySection || quinarySection.classList.contains('d-none')) {
                addQuinaryContainer?.classList.remove('d-none');
            }
        } else {
            quaternarySection?.classList.add('d-none');
            quaternaryLineSection?.classList.add('d-none');
            if (tertiarySection && !tertiarySection.classList.contains('d-none')) {
                addQuaternaryContainer?.classList.remove('d-none');
            } else {
                addQuaternaryContainer?.classList.add('d-none');
            }
            addQuinaryContainer?.classList.add('d-none');
            toggleDoctorQuinary(false);
            form.quaternary_owner_name.value = '';
            form.quaternary_owner_id.value = '';
            form.quaternary_line_name.value = '';
            if (state.autocompletes.doctorQuaternary) {
                state.autocompletes.doctorQuaternary.clear();
            }
        }
    };

    const toggleDoctorQuinary = (show) => {
        if (show) {
            quinarySection?.classList.remove('d-none');
            quinaryLineSection?.classList.remove('d-none');
            addQuinaryContainer?.classList.add('d-none');
        } else {
            quinarySection?.classList.add('d-none');
            quinaryLineSection?.classList.add('d-none');
            if (quaternarySection && !quaternarySection.classList.contains('d-none')) {
                addQuinaryContainer?.classList.remove('d-none');
            } else {
                addQuinaryContainer?.classList.add('d-none');
            }
            form.quinary_owner_name.value = '';
            form.quinary_owner_id.value = '';
            form.quinary_line_name.value = '';
            if (state.autocompletes.doctorQuinary) {
                state.autocompletes.doctorQuinary.clear();
            }
        }
    };

    const toggleDoctorSecondary = (show) => {
        if (show) {
            secondarySection?.classList.remove('d-none');
            secondaryLineSection?.classList.remove('d-none');
            addSecondaryContainer?.classList.add('d-none');
            if (!tertiarySection || tertiarySection.classList.contains('d-none')) {
                addTertiaryContainer?.classList.remove('d-none');
            }
        } else {
            secondarySection?.classList.add('d-none');
            secondaryLineSection?.classList.add('d-none');
            addSecondaryContainer?.classList.remove('d-none');
            addTertiaryContainer?.classList.add('d-none');
            addQuaternaryContainer?.classList.add('d-none');
            addQuinaryContainer?.classList.add('d-none');
            form.secondary_owner_name.value = '';
            form.secondary_owner_id.value = '';
            form.secondary_line_name.value = '';
            if (state.autocompletes.doctorSecondary) {
                state.autocompletes.doctorSecondary.clear();
            }
            toggleDoctorTertiary(false);
        }
    };

    addSecondaryBtn?.addEventListener('click', () => toggleDoctorSecondary(true));
    addTertiaryBtn?.addEventListener('click', () => toggleDoctorTertiary(true));
    addQuaternaryBtn?.addEventListener('click', () => toggleDoctorQuaternary(true));
    addQuinaryBtn?.addEventListener('click', () => toggleDoctorQuinary(true));

    form._toggleDoctorSecondary = toggleDoctorSecondary;
    form._toggleDoctorTertiary = toggleDoctorTertiary;
    form._toggleDoctorQuaternary = toggleDoctorQuaternary;
    form._toggleDoctorQuinary = toggleDoctorQuinary;
    const resetDoctorForm = () => {
        form.reset();
        form.doctor_id.value = '';
        state.autocompletes.doctorOwner?.clear();
        state.autocompletes.doctorSecondary?.clear();
        state.autocompletes.doctorTertiary?.clear();
        state.autocompletes.doctorQuaternary?.clear();
        state.autocompletes.doctorQuinary?.clear();
        toggleDoctorSecondary(false);
        toggleDoctorTertiary(false);
        toggleDoctorQuaternary(false);
        toggleDoctorQuinary(false);
        hideAlert(feedback);
    };

    // Add English-only validation to all text inputs
    addEnglishOnlyValidation(form);

    form.addEventListener('submit', handleDoctorSubmit);
    form.addEventListener('mts:form-open', (event) => {
        const mode = event.detail?.mode || 'create';
        if (mode === 'create') {
            resetDoctorForm();
        } else {
            hideAlert(feedback);
        }
    });
    form.addEventListener('mts:form-close', () => {
        toggleFormReadOnly(form, false);
        hideAlert(feedback);
    });
    form.querySelector('#reset-doctor-form').addEventListener('click', resetDoctorForm);

    state.autocompletes.doctorOwner = initAutocomplete({
        input: form.querySelector('input[name="owner_name"]'),
        hiddenInput: form.querySelector('input[name="owner_id"]'),
        items: state.employees.filter((emp) => emp.role === ROLES.EMPLOYEE),
        labelSelector: (emp) => `${emp.full_name} (${emp.code})`,
        valueSelector: (emp) => emp.id
    });
    state.autocompletes.doctorSecondary = initAutocomplete({
        input: form.querySelector('input[name="secondary_owner_name"]'),
        hiddenInput: form.querySelector('input[name="secondary_owner_id"]'),
        items: state.employees.filter((emp) => emp.role === ROLES.EMPLOYEE),
        labelSelector: (emp) => `${emp.full_name} (${emp.code})`,
        valueSelector: (emp) => emp.id
    });
    state.autocompletes.doctorTertiary = initAutocomplete({
        input: form.querySelector('input[name="tertiary_owner_name"]'),
        hiddenInput: form.querySelector('input[name="tertiary_owner_id"]'),
        items: state.employees.filter((emp) => emp.role === ROLES.EMPLOYEE),
        labelSelector: (emp) => `${emp.full_name} (${emp.code})`,
        valueSelector: (emp) => emp.id
    });
    state.autocompletes.doctorQuaternary = initAutocomplete({
        input: form.querySelector('input[name="quaternary_owner_name"]'),
        hiddenInput: form.querySelector('input[name="quaternary_owner_id"]'),
        items: state.employees.filter((emp) => emp.role === ROLES.EMPLOYEE),
        labelSelector: (emp) => `${emp.full_name} (${emp.code})`,
        valueSelector: (emp) => emp.id
    });
    state.autocompletes.doctorQuinary = initAutocomplete({
        input: form.querySelector('input[name="quinary_owner_name"]'),
        hiddenInput: form.querySelector('input[name="quinary_owner_id"]'),
        items: state.employees.filter((emp) => emp.role === ROLES.EMPLOYEE),
        labelSelector: (emp) => `${emp.full_name} (${emp.code})`,
        valueSelector: (emp) => emp.id
    });
}

async function handleDoctorSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = document.getElementById('doctor-form-feedback');
    hideAlert(feedback);
    const submitButton = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    const trimmedName = payload.name ? payload.name.trim() : '';
    if (!trimmedName || !payload.owner_id || !payload.line_name) {
        showAlert(feedback, 'Please fill required doctor fields.');
        return;
    }

    // Validate English-only input
    if (!validateFormEnglishOnly(form)) {
        showAlert(feedback, 'Only English characters are allowed in all fields.');
        return;
    }

    const normalizedName = trimmedName.toLowerCase();
    const duplicate = state.doctors.find(
        (doctor) => doctor.name?.trim().toLowerCase() === normalizedName && (!payload.doctor_id || doctor.id !== payload.doctor_id)
    );
    if (duplicate) {
        showAlert(
            feedback,
            'A doctor with this name already exists. Please edit the existing record to assign additional product specialists.'
        );
        return;
    }

    const isUpdate = Boolean(payload.doctor_id);
    const existingDoctor = isUpdate ? state.doctors.find((doc) => doc.id === payload.doctor_id) : null;
    const primaryLineName = payload.line_name ? payload.line_name.trim() : '';
    const secondaryId = payload.secondary_owner_id || null;
    const tertiaryId = payload.tertiary_owner_id || null;
    const quaternaryId = payload.quaternary_owner_id || null;
    const quinaryId = payload.quinary_owner_id || null;
    const secondaryLineName = payload.secondary_line_name ? payload.secondary_line_name.trim() : '';
    const tertiaryLineName = payload.tertiary_line_name ? payload.tertiary_line_name.trim() : '';
    const quaternaryLineName = payload.quaternary_line_name ? payload.quaternary_line_name.trim() : '';
    const quinaryLineName = payload.quinary_line_name ? payload.quinary_line_name.trim() : '';
    const assignedIds = [payload.owner_id, secondaryId, tertiaryId, quaternaryId, quinaryId].filter(Boolean);
    const uniqueIds = new Set(assignedIds);
    if (uniqueIds.size !== assignedIds.length) {
        showAlert(feedback, 'Product specialists must be unique.');
        return;
    }
    if (secondaryId && !secondaryLineName && !(isUpdate && existingDoctor?.secondary_line_id)) {
        showAlert(feedback, 'Please select a line for Product Specialist 2.');
        return;
    }
    if (tertiaryId && !tertiaryLineName && !(isUpdate && existingDoctor?.tertiary_line_id)) {
        showAlert(feedback, 'Please select a line for Product Specialist 3.');
        return;
    }
    if (quaternaryId && !quaternaryLineName && !(isUpdate && existingDoctor?.quaternary_line_id)) {
        showAlert(feedback, 'Please select a line for Product Specialist 4.');
        return;
    }
    if (quinaryId && !quinaryLineName && !(isUpdate && existingDoctor?.quinary_line_id)) {
        showAlert(feedback, 'Please select a line for Product Specialist 5.');
        return;
    }

    try {
        setLoadingState(submitButton, true);
        const lineId = primaryLineName ? await ensureLine(primaryLineName) : existingDoctor?.line_id || null;
        let secondaryLineId = null;
        if (secondaryId) {
            if (secondaryLineName) {
                secondaryLineId = await ensureLine(secondaryLineName);
            } else if (isUpdate) {
                secondaryLineId = existingDoctor?.secondary_line_id || null;
            }
        }
        let tertiaryLineId = null;
        if (tertiaryId) {
            if (tertiaryLineName) {
                tertiaryLineId = await ensureLine(tertiaryLineName);
            } else if (isUpdate) {
                tertiaryLineId = existingDoctor?.tertiary_line_id || null;
            }
        }
        let quaternaryLineId = null;
        if (quaternaryId) {
            if (quaternaryLineName) {
                quaternaryLineId = await ensureLine(quaternaryLineName);
            } else if (isUpdate) {
                quaternaryLineId = existingDoctor?.quaternary_line_id || null;
            }
        }
        let quinaryLineId = null;
        if (quinaryId) {
            if (quinaryLineName) {
                quinaryLineId = await ensureLine(quinaryLineName);
            } else if (isUpdate) {
                quinaryLineId = existingDoctor?.quinary_line_id || null;
            }
        }
        const record = {
            name: trimmedName,
            specialty: payload.specialty?.trim() || null,
            phone: payload.phone?.trim() || null,
            email_address: payload.email_address?.trim() || null,
            owner_employee_id: payload.owner_id,
            secondary_employee_id: secondaryId,
            tertiary_employee_id: tertiaryId,
            quaternary_employee_id: quaternaryId,
            quinary_employee_id: quinaryId,
            line_id: lineId,
            secondary_line_id: secondaryId ? secondaryLineId : null,
            tertiary_line_id: tertiaryId ? tertiaryLineId : null,
            quaternary_line_id: quaternaryId ? quaternaryLineId : null,
            quinary_line_id: quinaryId ? quinaryLineId : null,
            status: APPROVAL_STATUS.APPROVED,
            admin_id: state.session.employeeId,
            created_by: state.session.employeeId,
            approved_at: new Date().toISOString()
        };

        if (payload.doctor_id) {
            await handleSupabase(
                supabase
                    .from('doctors')
                    .update(record)
                    .eq('id', payload.doctor_id),
                'update doctor'
            );
        } else {
            await handleSupabase(
                supabase
                    .from('doctors')
                    .insert(record),
                'insert doctor'
            );
        }

        await loadDoctors();
        form.reset();
        form._toggleDoctorSecondary?.(false);
        form._toggleDoctorTertiary?.(false);
        const specialistItems = state.employees.filter((emp) => emp.role === ROLES.EMPLOYEE);
        state.autocompletes.doctorOwner?.update(specialistItems);
        state.autocompletes.doctorSecondary?.update(specialistItems);
        state.autocompletes.doctorTertiary?.update(specialistItems);
        renderDoctorsSection({ refreshFilters: true });
        showAlert(feedback, 'Doctor saved successfully.', 'success');
        closeFormModal();
    } catch (error) {
        showAlert(feedback, handleError(error));
    } finally {
        setLoadingState(submitButton, false, 'Save Doctor');
    }
}

function renderDoctorsSection(options = {}) {
    const { refreshFilters = false } = options;
    if (refreshFilters) {
        renderDoctorFilters();
    }
    const filtered = getFilteredDoctors();
    renderDoctorStats(filtered);
    renderDoctorTable(filtered);
}

function renderDoctorFilters() {
    const container = document.getElementById('doctor-filters');
    if (!container) return;
    const { specialist } = state.filters.doctors;
    const specialists = state.employees
        .filter((emp) => emp.role === ROLES.EMPLOYEE && emp.full_name)
        .map((emp) => ({ value: String(emp.id), label: emp.full_name }))
        .sort((a, b) => a.label.localeCompare(b.label));

    if (specialist && !specialists.some((option) => option.value === specialist)) {
        state.filters.doctors.specialist = '';
    }
    const selectedSpecialist = state.filters.doctors.specialist;

    container.innerHTML = `
        <div class="filters-row">
            <select class="form-select form-select-sm" id="admin-filter-doctor-specialist" aria-label="Filter doctors by product specialist">
                <option value="">All Product Specialists</option>
                ${specialists
                    .map(
                        (option) =>
                            `<option value="${option.value}"${
                                option.value === selectedSpecialist ? ' selected' : ''
                            }>${option.label}</option>`
                    )
                    .join('')}
            </select>
        </div>
    `;

    const select = container.querySelector('#admin-filter-doctor-specialist');
    select?.addEventListener('change', (event) => {
        state.filters.doctors.specialist = event.target.value;
        renderDoctorsSection();
    });
}

function getFilteredDoctors() {
    const { specialist } = state.filters.doctors;
    if (!specialist) return state.doctors.slice();
    const specialistEmployee = state.employeeById?.get(String(specialist));
    const normalizedName = specialistEmployee?.full_name?.toLowerCase();

    return state.doctors.filter((doctor) => {
        const assignedIds = [
            doctor.owner_employee_id,
            doctor.secondary_employee_id,
            doctor.tertiary_employee_id,
            doctor.quaternary_employee_id,
            doctor.quinary_employee_id
        ].filter(Boolean);
        if (assignedIds.some((id) => String(id) === String(specialist))) return true;
        if (!normalizedName) return false;
        return [doctor.owner_name, doctor.secondary_owner_name, doctor.tertiary_owner_name, doctor.quaternary_owner_name, doctor.quinary_owner_name]
            .filter(Boolean)
            .some((name) => name.toLowerCase() === normalizedName);
    });
}

function renderDoctorTable(doctors = state.doctors) {
    const tableData = doctors.map((doctor) => ({
        id: doctor.id,
        name: doctor.name,
        owner: doctor.owner_name,
        owner2: doctor.secondary_owner_name,
        owner3: doctor.tertiary_owner_name,
        owner4: doctor.quaternary_owner_name,
        owner5: doctor.quinary_owner_name,
        line: doctor.line_name || doctor.owner_line,
        line2: doctor.secondary_line_name || '',
        line3: doctor.tertiary_line_name || '',
        line4: doctor.quaternary_line_name || '',
        line5: doctor.quinary_line_name || '',
        specialty: doctor.specialty,
        phone: doctor.phone,
        email_address: doctor.email_address,
        status: doctor.status,
        created_at: doctor.created_at
    }));

    const columns = [
        { title: 'Doctor', field: 'name', minWidth: 200, headerFilter: 'input' },
        { title: 'Product Specialist', field: 'owner', minWidth: 200, headerFilter: 'input' },
        { title: 'Line', field: 'line', width: 140, headerFilter: 'input' },
        { title: 'Product Specialist 2', field: 'owner2', minWidth: 200, headerFilter: 'input', visible: false },
        { title: 'PS 2 Line', field: 'line2', width: 140, headerFilter: 'input', visible: false },
        { title: 'Product Specialist 3', field: 'owner3', minWidth: 200, headerFilter: 'input', visible: false },
        { title: 'PS 3 Line', field: 'line3', width: 140, headerFilter: 'input', visible: false },
        { title: 'Product Specialist 4', field: 'owner4', minWidth: 200, headerFilter: 'input', visible: false },
        { title: 'PS 4 Line', field: 'line4', width: 140, headerFilter: 'input', visible: false },
        { title: 'Product Specialist 5', field: 'owner5', minWidth: 200, headerFilter: 'input', visible: false },
        { title: 'PS 5 Line', field: 'line5', width: 140, headerFilter: 'input', visible: false },
        { title: 'Specialty', field: 'specialty', width: 160, headerFilter: 'input' },
        { title: 'Phone', field: 'phone', width: 140, headerFilter: 'input' },
        { title: 'Email', field: 'email_address', width: 180, headerFilter: 'input' },
        { title: 'Status', field: 'status', formatter: tableFormatters.status, width: 140 },
        { title: 'Created', field: 'created_at', formatter: tableFormatters.date, width: 140 },
        {
            title: 'Actions',
            field: 'actions',
            hozAlign: 'center',
            width: 150,
            formatter: tableFormatters.actions([
                { name: 'edit', label: 'Edit', icon: 'bi bi-pencil', variant: 'btn-gradient' },
                { name: 'delete', label: 'Delete', icon: 'bi bi-trash', variant: 'btn-outline-ghost' }
            ]),
            headerSort: false
        }
    ];

    state.tables.doctors = createTable('doctors-table', columns, tableData, { height: 500 });
    bindTableActions(state.tables.doctors, {
        edit: (rowData) => populateDoctorForm(rowData.id),
        delete: (rowData) => deleteDoctor(rowData.id)
    });
    attachProductSpecialistToggle(state.tables.doctors, {
        lineField: 'line',
        toggleFields: ['owner2', 'line2', 'owner3', 'line3', 'owner4', 'line4', 'owner5', 'line5'],
        storageKey: 'admin_doctors_ps_toggle'
    });
}

function toggleFormReadOnly(form, readonly) {
    if (!form) return;
    const elements = Array.from(form.querySelectorAll('input, select, textarea, button'));
    elements.forEach((element) => {
        if (element.type === 'hidden') return;
        if (readonly) {
            if (element.tagName === 'BUTTON') {
                element.disabled = true;
                element.dataset.originalDisplay = element.style.display;
                if (!element.classList.contains('btn-close')) {
                    element.style.display = 'none';
                }
            } else {
                element.dataset.originalReadonly = element.readOnly ? 'true' : 'false';
                element.readOnly = true;
                if (element.tagName === 'SELECT') {
                    element.dataset.originalDisabled = element.disabled ? 'true' : 'false';
                    element.disabled = true;
                }
            }
        } else {
            if (element.tagName === 'BUTTON') {
                element.disabled = false;
                if (Object.prototype.hasOwnProperty.call(element.dataset, 'originalDisplay')) {
                    element.style.display = element.dataset.originalDisplay || '';
                    delete element.dataset.originalDisplay;
                }
            } else {
                if (element.dataset.originalReadonly !== undefined) {
                    element.readOnly = element.dataset.originalReadonly === 'true';
                    delete element.dataset.originalReadonly;
                } else {
                    element.readOnly = false;
                }
                if (element.tagName === 'SELECT') {
                    if (element.dataset.originalDisabled !== undefined) {
                        element.disabled = element.dataset.originalDisabled === 'true';
                        delete element.dataset.originalDisabled;
                    } else {
                        element.disabled = false;
                    }
                }
            }
        }
    });
}

function showReviewModal(title, content, options = {}) {
    const modalEl = document.getElementById('modalEntityForm');
    if (!modalEl || !window.bootstrap) return;
    const modalTitle = modalEl.querySelector('#modalEntityFormTitle');
    const modalBody = modalEl.querySelector('#modalEntityFormBody');
    const modalFooter = modalEl.querySelector('.modal-footer');
    if (modalTitle) modalTitle.textContent = title;
    if (modalBody) modalBody.innerHTML = content;

    // Handle footer buttons for case review
    if (options.showCaseActions && options.caseRecord) {
        if (modalFooter) {
            modalFooter.classList.remove('d-none');
            modalFooter.innerHTML = `
                <button type="button" class="btn btn-outline-ghost" data-bs-dismiss="modal">Close</button>
                <button type="button" class="btn btn-negative" id="modalRejectCase">
                    <i class="bi bi-x"></i> Reject
                </button>
                <button type="button" class="btn btn-gradient" id="modalApproveCase">
                    <i class="bi bi-check2"></i> Approve
                </button>
            `;

            // Attach event listeners
            const approveBtn = modalFooter.querySelector('#modalApproveCase');
            const rejectBtn = modalFooter.querySelector('#modalRejectCase');

            if (approveBtn) {
                approveBtn.addEventListener('click', async () => {
                    await processApproval(options.caseRecord, true);
                    window.bootstrap.Modal.getInstance(modalEl)?.hide();
                });
            }

            if (rejectBtn) {
                rejectBtn.addEventListener('click', async () => {
                    await processApproval(options.caseRecord, false);
                    window.bootstrap.Modal.getInstance(modalEl)?.hide();
                });
            }
        }
    } else {
        if (modalFooter) modalFooter.classList.add('d-none');
    }

    modalEl.setAttribute('data-current-form', '');
    const modalInstance = window.bootstrap.Modal.getOrCreateInstance(modalEl);
    const cleanup = () => {
        if (modalBody) modalBody.innerHTML = '';
        if (modalFooter) {
            modalFooter.classList.remove('d-none');
            modalFooter.innerHTML = '<button type="button" class="btn btn-outline-ghost" data-bs-dismiss="modal">Close</button>';
        }
        modalEl.removeEventListener('hidden.bs.modal', cleanup);
    };
    modalEl.addEventListener('hidden.bs.modal', cleanup, { once: true });
    modalInstance.show();
}

function populateDoctorForm(id, options = {}) {
    const doctor = state.doctors.find((doc) => doc.id === id);
    if (!doctor) return;
    const form = document.getElementById('doctor-form');
    form.doctor_id.value = doctor.id;
    form.name.value = doctor.name;
    form.owner_name.value = doctor.owner_name || '';
    form.owner_id.value = doctor.owner_employee_id;
    form.line_name.value = doctor.line_name || doctor.owner_line || '';
    const hasSecondary =
        Boolean(doctor.secondary_employee_id) || Boolean(doctor.secondary_owner_name) || Boolean(doctor.secondary_line_name);
    const hasTertiary =
        Boolean(doctor.tertiary_employee_id) || Boolean(doctor.tertiary_owner_name) || Boolean(doctor.tertiary_line_name);
    const hasQuaternary =
        Boolean(doctor.quaternary_employee_id) || Boolean(doctor.quaternary_owner_name) || Boolean(doctor.quaternary_line_name);
    const hasQuinary =
        Boolean(doctor.quinary_employee_id) || Boolean(doctor.quinary_owner_name) || Boolean(doctor.quinary_line_name);
    form._toggleDoctorSecondary?.(hasSecondary);
    form._toggleDoctorTertiary?.(hasTertiary);
    form._toggleDoctorQuaternary?.(hasQuaternary);
    form._toggleDoctorQuinary?.(hasQuinary);
    form.secondary_owner_name.value = doctor.secondary_owner_name || '';
    form.secondary_owner_id.value = doctor.secondary_employee_id || '';
    form.secondary_line_name.value = doctor.secondary_line_name || '';
    form.tertiary_owner_name.value = doctor.tertiary_owner_name || '';
    form.tertiary_owner_id.value = doctor.tertiary_employee_id || '';
    form.tertiary_line_name.value = doctor.tertiary_line_name || '';
    form.quaternary_owner_name.value = doctor.quaternary_owner_name || '';
    form.quaternary_owner_id.value = doctor.quaternary_employee_id || '';
    form.quaternary_line_name.value = doctor.quaternary_line_name || '';
    form.quinary_owner_name.value = doctor.quinary_owner_name || '';
    form.quinary_owner_id.value = doctor.quinary_employee_id || '';
    form.quinary_line_name.value = doctor.quinary_line_name || '';
    form.specialty.value = doctor.specialty || '';
    form.phone.value = doctor.phone || '';
    form.email_address.value = doctor.email_address || '';
    const mode = options.readonly ? 'review' : 'edit';
    openFormModal('#doctor-form', {
        title: options.readonly ? 'Review Doctor' : 'Edit Doctor',
        mode,
        focusSelector: options.readonly ? '' : 'input[name="name"]'
    });

    toggleFormReadOnly(form, Boolean(options.readonly));
}

async function deleteDoctor(id) {
    if (!window.confirm('Delete this doctor?')) return;
    try {
        await handleSupabase(supabase.from('doctors').delete().eq('id', id), 'delete doctor');
        await loadDoctors();
        renderDoctorsSection({ refreshFilters: true });
    } catch (error) {
        alert(handleError(error));
    }
}

function setupAccountForm() {
    const container = document.querySelector('#account-form .row');
    if (!container) return;
    container.innerHTML = `
        <input type="hidden" name="account_id">
        <div class="col-12">
            <div id="account-form-feedback" class="alert-feedback d-none"></div>
        </div>
        <div class="col-12">
            <label class="form-label">Account Name</label>
            <input type="text" class="form-control" name="name" dir="auto" required>
        </div>
        <div class="col-12">
            <label class="form-label">Product Specialist</label>
            <input type="text" class="form-control" name="owner_name" placeholder="Type to search" required>
            <input type="hidden" name="owner_id">
        </div>
        <div class="col-12">
            <label class="form-label">Line</label>
            <input type="text" class="form-control" name="line_name" list="lines-list" required>
        </div>
        <div class="col-12" id="account-add-secondary">
            <button type="button" class="btn btn-outline-ghost w-100" id="account-add-secondary-btn">Assign another Product Specialist</button>
        </div>
        <div class="col-12 d-none" data-section="account-secondary">
            <label class="form-label">Product Specialist 2 (Optional)</label>
            <input type="text" class="form-control" name="secondary_owner_name" placeholder="Type to search">
            <input type="hidden" name="secondary_owner_id">
        </div>
        <div class="col-12 d-none" data-section="account-secondary-line">
            <label class="form-label">PS 2 Line</label>
            <input type="text" class="form-control" name="secondary_line_name" list="lines-list">
        </div>
        <div class="col-12 d-none" id="account-add-tertiary">
            <button type="button" class="btn btn-outline-ghost w-100" id="account-add-tertiary-btn">Assign third Product Specialist</button>
        </div>
        <div class="col-12 d-none" data-section="account-tertiary">
            <label class="form-label">Product Specialist 3 (Optional)</label>
            <input type="text" class="form-control" name="tertiary_owner_name" placeholder="Type to search">
            <input type="hidden" name="tertiary_owner_id">
        </div>
        <div class="col-12 d-none" data-section="account-tertiary-line">
            <label class="form-label">PS 3 Line</label>
            <input type="text" class="form-control" name="tertiary_line_name" list="lines-list">
        </div>
        <div class="col-12">
            <label class="form-label">Account Type</label>
            <select class="form-select" name="account_type" required>
                ${ACCOUNT_TYPES.map((type) => `<option value="${type}">${type}</option>`).join('')}
            </select>
        </div>
        <div class="col-12">
            <label class="form-label">Address</label>
            <textarea class="form-control" name="address" rows="2"></textarea>
        </div>
        <div class="col-12">
            <label class="form-label">Governorate</label>
            <input type="text" class="form-control" name="governorate">
        </div>
        <div class="col-12 d-flex justify-content-end gap-2">
            <button type="button" class="btn btn-outline-ghost" id="reset-account-form">Reset</button>
            <button type="submit" class="btn btn-gradient">Save Account</button>
        </div>
    `;

    const form = document.getElementById('account-form');
    const feedback = document.getElementById('account-form-feedback');
    const accountSecondarySection = form.querySelector('[data-section="account-secondary"]');
    const accountSecondaryLineSection = form.querySelector('[data-section="account-secondary-line"]');
    const accountTertiarySection = form.querySelector('[data-section="account-tertiary"]');
    const accountTertiaryLineSection = form.querySelector('[data-section="account-tertiary-line"]');
    const accountAddSecondaryContainer = form.querySelector('#account-add-secondary');
    const accountAddTertiaryContainer = form.querySelector('#account-add-tertiary');
    const accountAddSecondaryBtn = form.querySelector('#account-add-secondary-btn');
    const accountAddTertiaryBtn = form.querySelector('#account-add-tertiary-btn');

    const toggleAccountTertiary = (show) => {
        if (show) {
            accountTertiarySection?.classList.remove('d-none');
            accountTertiaryLineSection?.classList.remove('d-none');
            accountAddTertiaryContainer?.classList.add('d-none');
        } else {
            accountTertiarySection?.classList.add('d-none');
            accountTertiaryLineSection?.classList.add('d-none');
            if (accountSecondarySection && !accountSecondarySection.classList.contains('d-none')) {
                accountAddTertiaryContainer?.classList.remove('d-none');
            } else {
                accountAddTertiaryContainer?.classList.add('d-none');
            }
            form.tertiary_owner_name.value = '';
            form.tertiary_owner_id.value = '';
            form.tertiary_line_name.value = '';
            if (state.autocompletes.accountTertiary) {
                state.autocompletes.accountTertiary.clear();
            }
        }
    };

    const toggleAccountSecondary = (show) => {
        if (show) {
            accountSecondarySection?.classList.remove('d-none');
            accountSecondaryLineSection?.classList.remove('d-none');
            accountAddSecondaryContainer?.classList.add('d-none');
            if (!accountTertiarySection || accountTertiarySection.classList.contains('d-none')) {
                accountAddTertiaryContainer?.classList.remove('d-none');
            }
        } else {
            accountSecondarySection?.classList.add('d-none');
            accountSecondaryLineSection?.classList.add('d-none');
            accountAddSecondaryContainer?.classList.remove('d-none');
            accountAddTertiaryContainer?.classList.add('d-none');
            form.secondary_owner_name.value = '';
            form.secondary_owner_id.value = '';
            form.secondary_line_name.value = '';
            if (state.autocompletes.accountSecondary) {
                state.autocompletes.accountSecondary.clear();
            }
            toggleAccountTertiary(false);
        }
    };

    accountAddSecondaryBtn?.addEventListener('click', () => toggleAccountSecondary(true));
    accountAddTertiaryBtn?.addEventListener('click', () => toggleAccountTertiary(true));

    form._toggleAccountSecondary = toggleAccountSecondary;
    form._toggleAccountTertiary = toggleAccountTertiary;

    const resetAccountForm = () => {
        form.reset();
        form.account_id.value = '';
        state.autocompletes.accountOwner?.clear();
        state.autocompletes.accountSecondary?.clear();
        state.autocompletes.accountTertiary?.clear();
        toggleAccountSecondary(false);
        toggleAccountTertiary(false);
        hideAlert(feedback);
    };

    // Add English-only validation to all text inputs
    addEnglishOnlyValidation(form);

    form.addEventListener('submit', handleAccountSubmit);
    form.addEventListener('mts:form-open', (event) => {
        const mode = event.detail?.mode || 'create';
        if (mode === 'create') {
            resetAccountForm();
        } else {
            hideAlert(feedback);
        }
    });
    form.addEventListener('mts:form-close', () => {
        toggleFormReadOnly(form, false);
        hideAlert(feedback);
    });
    form.querySelector('#reset-account-form').addEventListener('click', resetAccountForm);

    state.autocompletes.accountOwner = initAutocomplete({
        input: form.querySelector('input[name="owner_name"]'),
        hiddenInput: form.querySelector('input[name="owner_id"]'),
        items: state.employees.filter((emp) => emp.role === ROLES.EMPLOYEE),
        labelSelector: (emp) => `${emp.full_name} (${emp.code})`,
        valueSelector: (emp) => emp.id
    });
    state.autocompletes.accountSecondary = initAutocomplete({
        input: form.querySelector('input[name="secondary_owner_name"]'),
        hiddenInput: form.querySelector('input[name="secondary_owner_id"]'),
        items: state.employees.filter((emp) => emp.role === ROLES.EMPLOYEE),
        labelSelector: (emp) => `${emp.full_name} (${emp.code})`,
        valueSelector: (emp) => emp.id
    });
    state.autocompletes.accountTertiary = initAutocomplete({
        input: form.querySelector('input[name="tertiary_owner_name"]'),
        hiddenInput: form.querySelector('input[name="tertiary_owner_id"]'),
        items: state.employees.filter((emp) => emp.role === ROLES.EMPLOYEE),
        labelSelector: (emp) => `${emp.full_name} (${emp.code})`,
        valueSelector: (emp) => emp.id
    });
}

async function handleAccountSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = document.getElementById('account-form-feedback');
    hideAlert(feedback);
    const submitButton = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    const trimmedName = payload.name ? payload.name.trim() : '';
    if (!trimmedName || !payload.owner_id || !payload.account_type || !payload.line_name) {
        showAlert(feedback, 'Please complete account details.');
        return;
    }

    // Validate English-only input
    if (!validateFormEnglishOnly(form)) {
        showAlert(feedback, 'Only English characters are allowed in all fields.');
        return;
    }

    const normalizedName = trimmedName.toLowerCase();
    const duplicate = state.accounts.find(
        (account) =>
            account.name?.trim().toLowerCase() === normalizedName && (!payload.account_id || account.id !== payload.account_id)
    );
    if (duplicate) {
        showAlert(
            feedback,
            'An account with this name already exists. Please edit the existing record to attach additional product specialists.'
        );
        return;
    }

    const secondaryId = payload.secondary_owner_id || null;
    const tertiaryId = payload.tertiary_owner_id || null;
    const assignedIds = [payload.owner_id, secondaryId, tertiaryId].filter(Boolean);
    const uniqueIds = new Set(assignedIds);
    if (uniqueIds.size !== assignedIds.length) {
        showAlert(feedback, 'Product specialists must be unique.');
        return;
    }
    const isUpdate = Boolean(payload.account_id);
    const existingAccount = isUpdate ? state.accounts.find((acc) => acc.id === payload.account_id) : null;
    const primaryLineName = payload.line_name ? payload.line_name.trim() : '';
    const secondaryLineName = payload.secondary_line_name ? payload.secondary_line_name.trim() : '';
    const tertiaryLineName = payload.tertiary_line_name ? payload.tertiary_line_name.trim() : '';
    if (secondaryId && !secondaryLineName && !(isUpdate && existingAccount?.secondary_line_id)) {
        showAlert(feedback, 'Please select a line for Product Specialist 2.');
        return;
    }
    if (tertiaryId && !tertiaryLineName && !(isUpdate && existingAccount?.tertiary_line_id)) {
        showAlert(feedback, 'Please select a line for Product Specialist 3.');
        return;
    }

    try {
        setLoadingState(submitButton, true);
        const lineId = primaryLineName ? await ensureLine(primaryLineName) : existingAccount?.line_id || null;
        let secondaryLineId = null;
        if (secondaryId) {
            if (secondaryLineName) {
                secondaryLineId = await ensureLine(secondaryLineName);
            } else if (isUpdate) {
                secondaryLineId = existingAccount?.secondary_line_id || null;
            }
        }
        let tertiaryLineId = null;
        if (tertiaryId) {
            if (tertiaryLineName) {
                tertiaryLineId = await ensureLine(tertiaryLineName);
            } else if (isUpdate) {
                tertiaryLineId = existingAccount?.tertiary_line_id || null;
            }
        }
        const record = {
            name: trimmedName,
            owner_employee_id: payload.owner_id,
            secondary_employee_id: secondaryId,
            tertiary_employee_id: tertiaryId,
            account_type: payload.account_type,
            line_id: lineId,
            secondary_line_id: secondaryId ? secondaryLineId : null,
            tertiary_line_id: tertiaryId ? tertiaryLineId : null,
            address: payload.address?.trim() || null,
            governorate: payload.governorate?.trim() || null,
            status: APPROVAL_STATUS.APPROVED,
            admin_id: state.session.employeeId,
            created_by: state.session.employeeId,
            approved_at: new Date().toISOString()
        };

        if (payload.account_id) {
            await handleSupabase(
                supabase
                    .from('accounts')
                    .update(record)
                    .eq('id', payload.account_id),
                'update account'
            );
        } else {
            await handleSupabase(
                supabase
                    .from('accounts')
                    .insert(record),
                'insert account'
            );
        }

        await loadAccounts();
        form.reset();
        form._toggleAccountSecondary?.(false);
        form._toggleAccountTertiary?.(false);
        const specialistItems = state.employees.filter((emp) => emp.role === ROLES.EMPLOYEE);
        state.autocompletes.accountOwner?.update(specialistItems);
        state.autocompletes.accountSecondary?.update(specialistItems);
        state.autocompletes.accountTertiary?.update(specialistItems);
        renderAccountsSection({ refreshFilters: true });
        showAlert(feedback, 'Account saved successfully.', 'success');
        closeFormModal();
    } catch (error) {
        showAlert(feedback, handleError(error));
    } finally {
        setLoadingState(submitButton, false, 'Save Account');
    }
}

function renderAccountsSection(options = {}) {
    const { refreshFilters = false } = options;
    if (refreshFilters) {
        renderAccountFilters();
    }
    const filtered = getFilteredAccounts();
    renderAccountStats(filtered);
    renderAccountTable(filtered);
}

function renderAccountFilters() {
    const container = document.getElementById('account-filters');
    if (!container) return;
    const { specialist, accountType } = state.filters.accounts;
    const specialists = state.employees
        .filter((emp) => emp.role === ROLES.EMPLOYEE && emp.full_name)
        .map((emp) => ({ value: String(emp.id), label: emp.full_name }))
        .sort((a, b) => a.label.localeCompare(b.label));

    if (specialist && !specialists.some((option) => option.value === specialist)) {
        state.filters.accounts.specialist = '';
    }
    if (accountType && !ACCOUNT_TYPES.includes(accountType)) {
        state.filters.accounts.accountType = '';
    }
    const selectedSpecialist = state.filters.accounts.specialist;
    const selectedAccountType = state.filters.accounts.accountType;

    container.innerHTML = `
        <div class="filters-row">
            <select class="form-select form-select-sm" id="admin-filter-account-specialist" aria-label="Filter accounts by product specialist">
                <option value="">All Product Specialists</option>
                ${specialists
                    .map(
                        (option) =>
                            `<option value="${option.value}"${
                                option.value === selectedSpecialist ? ' selected' : ''
                            }>${option.label}</option>`
                    )
                    .join('')}
            </select>
            <select class="form-select form-select-sm" id="admin-filter-account-type" aria-label="Filter accounts by account type">
                <option value="">All Account Types</option>
                ${ACCOUNT_TYPES.map(
                    (typeOption) =>
                        `<option value="${typeOption}"${
                            typeOption === selectedAccountType ? ' selected' : ''
                        }>${typeOption}</option>`
                ).join('')}
            </select>
        </div>
    `;

    container.querySelector('#admin-filter-account-specialist')?.addEventListener('change', (event) => {
        state.filters.accounts.specialist = event.target.value;
        renderAccountsSection();
    });

    container.querySelector('#admin-filter-account-type')?.addEventListener('change', (event) => {
        state.filters.accounts.accountType = event.target.value;
        renderAccountsSection();
    });
}

function getFilteredAccounts() {
    const { specialist, accountType } = state.filters.accounts;
    const specialistEmployee = specialist ? state.employeeById?.get(String(specialist)) : null;
    const normalizedName = specialistEmployee?.full_name?.toLowerCase();

    return state.accounts.filter((account) => {
        if (specialist) {
            const assignedIds = [
                account.owner_employee_id,
                account.secondary_employee_id,
                account.tertiary_employee_id
            ].filter(Boolean);
            const matchesId = assignedIds.some((id) => String(id) === String(specialist));
            const matchesName = normalizedName
                ? [account.owner_name, account.secondary_owner_name, account.tertiary_owner_name]
                      .filter(Boolean)
                      .some((name) => name.toLowerCase() === normalizedName)
                : false;
            if (!matchesId && !matchesName) return false;
        }
        if (accountType && (account.account_type || '') !== accountType) return false;
        return true;
    });
}

function renderAccountTable(accounts = state.accounts) {
    const tableData = accounts.map((account) => ({
        id: account.id,
        name: account.name,
        owner: account.owner_name,
        owner2: account.secondary_owner_name,
        owner3: account.tertiary_owner_name,
        account_type: account.account_type,
        line: account.line_name,
        line2: account.secondary_line_name || '',
        line3: account.tertiary_line_name || '',
        governorate: account.governorate,
        status: account.status,
        created_at: account.created_at
    }));

    const columns = [
        { title: 'Account', field: 'name', minWidth: 180, headerFilter: 'input' },
        { title: 'Product Specialist', field: 'owner', minWidth: 200, headerFilter: 'input' },
        { title: 'Line', field: 'line', width: 140, headerFilter: 'input' },
        { title: 'Product Specialist 2', field: 'owner2', minWidth: 200, headerFilter: 'input', visible: false },
        { title: 'PS 2 Line', field: 'line2', width: 140, headerFilter: 'input', visible: false },
        { title: 'Product Specialist 3', field: 'owner3', minWidth: 200, headerFilter: 'input', visible: false },
        { title: 'PS 3 Line', field: 'line3', width: 140, headerFilter: 'input', visible: false },
        { title: 'Type', field: 'account_type', width: 120 },
        { title: 'Governorate', field: 'governorate', width: 140, headerFilter: 'input' },
        { title: 'Status', field: 'status', formatter: tableFormatters.status, width: 140 },
        { title: 'Created', field: 'created_at', formatter: tableFormatters.date, width: 140 },
        {
            title: 'Actions',
            field: 'actions',
            hozAlign: 'center',
            width: 150,
            formatter: tableFormatters.actions([
                { name: 'edit', label: 'Edit', icon: 'bi bi-pencil', variant: 'btn-gradient' },
                { name: 'delete', label: 'Delete', icon: 'bi bi-trash', variant: 'btn-outline-ghost' }
            ]),
            headerSort: false
        }
    ];

    state.tables.accounts = createTable('accounts-table', columns, tableData, { height: 500 });
    bindTableActions(state.tables.accounts, {
        edit: (rowData) => populateAccountForm(rowData.id),
        delete: (rowData) => deleteAccount(rowData.id)
    });
    attachProductSpecialistToggle(state.tables.accounts, {
        lineField: 'line',
        toggleFields: ['owner2', 'line2', 'owner3', 'line3'],
        storageKey: 'admin_accounts_ps_toggle'
    });
}

function populateAccountForm(id, options = {}) {
    const account = state.accounts.find((acc) => acc.id === id);
    if (!account) return;
    const form = document.getElementById('account-form');
    form.account_id.value = account.id;
    form.name.value = account.name;
    form.owner_name.value = account.owner_name || '';
    form.owner_id.value = account.owner_employee_id;
    form.line_name.value = account.line_name || '';
    const accountHasSecondary =
        Boolean(account.secondary_employee_id) ||
        Boolean(account.secondary_owner_name) ||
        Boolean(account.secondary_line_name);
    const accountHasTertiary =
        Boolean(account.tertiary_employee_id) ||
        Boolean(account.tertiary_owner_name) ||
        Boolean(account.tertiary_line_name);
    form._toggleAccountSecondary?.(accountHasSecondary);
    form._toggleAccountTertiary?.(accountHasTertiary);
    form.secondary_owner_name.value = account.secondary_owner_name || '';
    form.secondary_owner_id.value = account.secondary_employee_id || '';
    form.secondary_line_name.value = account.secondary_line_name || '';
    form.tertiary_owner_name.value = account.tertiary_owner_name || '';
    form.tertiary_owner_id.value = account.tertiary_employee_id || '';
    form.tertiary_line_name.value = account.tertiary_line_name || '';
    form.account_type.value = account.account_type;
    form.address.value = account.address || '';
    form.governorate.value = account.governorate || '';
    const mode = options.readonly ? 'review' : 'edit';
    openFormModal('#account-form', {
        title: options.readonly ? 'Review Account' : 'Edit Account',
        mode,
        focusSelector: options.readonly ? '' : 'input[name="name"]'
    });

    toggleFormReadOnly(form, Boolean(options.readonly));
}

function populateCaseReview(id, payload = {}) {
    const caseRecord = state.cases.find((item) => item.id === id) || payload || {};
    const products = state.caseProductsByCase.get(id) || [];
    const specialist = caseRecord.submitted_by_name || caseRecord.owner_name || 'N/A';
    const doctor = caseRecord.doctor_name || 'N/A';
    const account = caseRecord.account_name || 'N/A';
    const accountType = caseRecord.account_type || 'N/A';
    const status = caseRecord.status || 'Pending';
    const caseDate = caseRecord.case_date ? formatDate(caseRecord.case_date) : 'N/A';
    const notes = caseRecord.notes || 'No additional notes provided.';

    const productsBody = products.length
        ? products
              .map(
                  (product, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${product.product_name || 'Unnamed Product'}</td>
                <td>${product.company_name || (product.is_company_product ? 'Company' : 'Competitor')}</td>
                <td>${product.is_company_product ? 'Company' : 'Competitor'}</td>
                <td>${product.category || 'N/A'}</td>
                <td>${formatNumber(product.units || 0)}</td>
            </tr>`
              )
              .join('')
        : `<tr><td colspan="6" class="text-center text-secondary">No products attached.</td></tr>`;

    const content = `
        <div class="case-review">
            <div class="row g-3">
                <div class="col-md-6">
                    <div class="review-field">
                        <span>Case Code</span>
                        <strong>${caseRecord.case_code || 'N/A'}</strong>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="review-field">
                        <span>Submission Date</span>
                        <strong>${caseDate}</strong>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="review-field">
                        <span>Product Specialist</span>
                        <strong>${specialist}</strong>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="review-field">
                        <span>Status</span>
                        <strong>${status}</strong>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="review-field">
                        <span>Doctor</span>
                        <strong>${doctor}</strong>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="review-field">
                        <span>Account</span>
                        <strong>${account} <small class="text-secondary">(${accountType})</small></strong>
                    </div>
                </div>
            </div>
            <div class="mt-4">
                <h6 class="text-secondary text-uppercase mb-2">Products Used</h6>
                <div class="table-responsive rounded">
                    <table class="table table-dark table-sm align-middle mb-0">
                        <thead>
                            <tr class="text-secondary">
                                <th>#</th>
                                <th>Product</th>
                                <th>Company</th>
                                <th>Type</th>
                                <th>Category</th>
                                <th class="text-end">Units</th>
                            </tr>
                        </thead>
                        <tbody>${productsBody}</tbody>
                    </table>
                </div>
            </div>
            <div class="mt-4">
                <h6 class="text-secondary text-uppercase mb-2">Notes</h6>
                <p class="mb-0">${notes}</p>
            </div>
        </div>
    `;

    // Create record object for approval actions
    const recordForApproval = {
        id: id,
        type: 'case',
        name: caseRecord.case_code || `Case ${id.slice(0, 6)}`,
        payload: caseRecord
    };

    showReviewModal(`Review Case ${caseRecord.case_code || ''}`, content, {
        showCaseActions: true,
        caseRecord: recordForApproval
    });
}

async function deleteAccount(id) {
    if (!window.confirm('Delete this account?')) return;
    try {
        await handleSupabase(supabase.from('accounts').delete().eq('id', id), 'delete account');
        await loadAccounts();
        renderAccountsSection({ refreshFilters: true });
    } catch (error) {
        alert(handleError(error));
    }
}
function setupCaseFilters() {
    const container = document.getElementById('cases-filters');
    if (!container) return;
    const previousSelections = {
        specialist: container.querySelector('#filter-case-specialist')?.value || '',
        manager: container.querySelector('#filter-case-manager')?.value || '',
        accountType: container.querySelector('#filter-case-account-type')?.value || '',
        companyType: container.querySelector('#filter-case-company-type')?.value || '',

        // Dual-row filter values
        companyCompany: container.querySelector('#filter-case-company-company')?.value || '',
        companyCategory: container.querySelector('#filter-case-company-category')?.value || '',
        companySubCategory: container.querySelector('#filter-case-company-sub-category')?.value || '',
        companyProduct: container.querySelector('#filter-case-company-product')?.value || '',

        competitorCompany: container.querySelector('#filter-case-competitor-company')?.value || '',
        competitorCategory: container.querySelector('#filter-case-competitor-category')?.value || '',
        competitorSubCategory: container.querySelector('#filter-case-competitor-sub-category')?.value || '',
        competitorProduct: container.querySelector('#filter-case-competitor-product')?.value || '',

        month: container.querySelector('#filter-case-month')?.value || '',
        from: container.querySelector('#filter-case-from')?.value || '',
        to: container.querySelector('#filter-case-to')?.value || ''
    };
    const specialists = state.employees
        .filter((emp) => emp.role === ROLES.EMPLOYEE)
        .map((emp) => ({ value: emp.id, label: emp.full_name }));
    const managers = state.employees
        .filter((emp) => emp.role === ROLES.MANAGER)
        .map((emp) => ({ value: emp.id, label: emp.full_name }));
    const { company, competitor } = collectDualRowFilterOptions(state.caseProducts, state.products);

    container.innerHTML = `
        <div class="filters-row">
            <select class="form-select" id="filter-case-specialist">
                <option value="">All Specialists</option>
                ${specialists.map((item) => `<option value="${item.value}">${item.label}</option>`).join('')}
            </select>
            <select class="form-select" id="filter-case-manager">
                <option value="">All Managers</option>
                ${managers.map((manager) => `<option value="${manager.value}">${manager.label}</option>`).join('')}
            </select>
            <select class="form-select" id="filter-case-account-type">
                <option value="">All Account Types</option>
                ${ACCOUNT_TYPES.map((type) => `<option value="${type}">${type}</option>`).join('')}
            </select>
            <select class="form-select" id="filter-case-company-type">
                <option value="">All Company Types</option>
                <option value="company">Company</option>
                <option value="competitor">Competitor</option>
            </select>
        </div>

        <!-- Company Filters Row -->
        <div class="filters-row">
            <select class="form-select" id="filter-case-company-company">
                <option value="">All Companies</option>
                ${company.companies.map((comp) => `<option value="${comp}">${comp}</option>`).join('')}
            </select>
            <select class="form-select" id="filter-case-company-category">
                <option value="">All Categories</option>
                ${company.categories.map((cat) => `<option value="${cat}">${cat}</option>`).join('')}
            </select>
            <select class="form-select" id="filter-case-company-sub-category">
                <option value="">All Sub Categories</option>
                ${company.subCategories.map((sub) => `<option value="${sub}">${sub}</option>`).join('')}
            </select>
            <select class="form-select" id="filter-case-company-product">
                <option value="">All Products</option>
                ${company.productOptions.map((option) => `<option value="${option.value}">${option.label}</option>`).join('')}
            </select>
        </div>

        <!-- Competitor Filters Row -->
        <div class="filters-row">
            <select class="form-select" id="filter-case-competitor-company">
                <option value="">All Companies</option>
                ${competitor.companies.map((comp) => `<option value="${comp}">${comp}</option>`).join('')}
            </select>
            <select class="form-select" id="filter-case-competitor-category">
                <option value="">All Categories</option>
                ${competitor.categories.map((cat) => `<option value="${cat}">${cat}</option>`).join('')}
            </select>
            <select class="form-select" id="filter-case-competitor-sub-category">
                <option value="">All Sub Categories</option>
                ${competitor.subCategories.map((sub) => `<option value="${sub}">${sub}</option>`).join('')}
            </select>
            <select class="form-select" id="filter-case-competitor-product">
                <option value="">All Products</option>
                ${competitor.productOptions.map((option) => `<option value="${option.value}">${option.label}</option>`).join('')}
            </select>
        </div>
        <div class="filters-row">
            <select class="form-select" id="filter-case-month">
                <option value="">Any Month</option>
                ${Array.from({ length: 12 }, (_, index) => {
                    const month = index + 1;
                    const label = new Date(2000, index).toLocaleString(undefined, { month: 'long' });
                    return `<option value="${month}">${label}</option>`;
                }).join('')}
            </select>
            <input type="date" class="form-control" id="filter-case-from">
            <input type="date" class="form-control" id="filter-case-to">
            <div class="filters-actions" style="justify-self: end;">
                <button class="btn btn-outline-ghost" id="cases-filter-reset">Reset</button>
                <button class="btn btn-outline-ghost" id="cases-export"><i class="bi bi-download me-2"></i>Export</button>
            </div>
        </div>
    `;

    const handleFiltersChange = () => {
        const filtered = getFilteredCases();
        renderCaseStats(filtered);
        renderCasesTable(filtered);
    };



    // Setup dual-row cascading filters
    const setupDualRowFilters = () => {
        // Company row cascading
        const companyCompanySelect = container.querySelector('#filter-case-company-company');
        const companyCategorySelect = container.querySelector('#filter-case-company-category');
        const companySubCategorySelect = container.querySelector('#filter-case-company-sub-category');
        const companyProductSelect = container.querySelector('#filter-case-company-product');

        // Competitor row cascading
        const competitorCompanySelect = container.querySelector('#filter-case-competitor-company');
        const competitorCategorySelect = container.querySelector('#filter-case-competitor-category');
        const competitorSubCategorySelect = container.querySelector('#filter-case-competitor-sub-category');
        const competitorProductSelect = container.querySelector('#filter-case-competitor-product');

        // Company row cascading logic
        const updateCompanyCascading = () => {
            const selectedCompany = companyCompanySelect.value;
            const selectedCategory = companyCategorySelect.value;
            const selectedSubCategory = companySubCategorySelect.value;

            // Update categories based on company (or show all if no company selected)
            if (selectedCompany) {
                const filteredCategories = [...new Set(
                    state.caseProducts
                        .filter(p => p.is_company_product && (p.company_name || '') === selectedCompany)
                        .map(p => p.category)
                        .filter(Boolean)
                )].sort();
                companyCategorySelect.innerHTML = '<option value="">All Categories</option>' +
                    filteredCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
                if (filteredCategories.includes(selectedCategory)) {
                    companyCategorySelect.value = selectedCategory;
                }
            } else {
                // No company selected - show all company categories
                companyCategorySelect.innerHTML = '<option value="">All Categories</option>' +
                    company.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
                if (company.categories.includes(selectedCategory)) {
                    companyCategorySelect.value = selectedCategory;
                }
            }

            // Update subcategories based on company + category (independent filtering)
            const companyFilter = selectedCompany || '';
            const categoryFilter = companyCategorySelect.value || '';

            const filteredSubCategories = [...new Set(
                state.caseProducts
                    .filter(p => {
                        if (!p.is_company_product) return false;
                        if (companyFilter && (p.company_name || '') !== companyFilter) return false;
                        if (categoryFilter && (p.category || '') !== categoryFilter) return false;
                        return true;
                    })
                    .map(p => p.sub_category)
                    .filter(Boolean)
            )].sort();

            companySubCategorySelect.innerHTML = '<option value="">All Sub Categories</option>' +
                filteredSubCategories.map(sub => `<option value="${sub}">${sub}</option>`).join('');
            if (filteredSubCategories.includes(selectedSubCategory)) {
                companySubCategorySelect.value = selectedSubCategory;
            }

            // Update products based on company + category + subcategory (independent filtering)
            const subCategoryFilter = companySubCategorySelect.value || '';

            const filteredProducts = state.caseProducts
                .filter(p => {
                    if (!p.is_company_product) return false;
                    if (companyFilter && (p.company_name || '') !== companyFilter) return false;
                    if (categoryFilter && (p.category || '') !== categoryFilter) return false;
                    if (subCategoryFilter && (p.sub_category || '') !== subCategoryFilter) return false;
                    return true;
                });

            const uniqueProducts = [];
            const seen = new Set();
            filteredProducts.forEach(p => {
                const key = p.product_id ? String(p.product_id) : p.product_name;
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueProducts.push({ value: key, label: p.product_name || 'Unknown Product' });
                }
            });

            companyProductSelect.innerHTML = '<option value="">All Products</option>' +
                uniqueProducts.map(prod => `<option value="${prod.value}">${prod.label}</option>`).join('');
        };

        // Competitor row cascading logic
        const updateCompetitorCascading = () => {
            const selectedCompany = competitorCompanySelect.value;
            const selectedCategory = competitorCategorySelect.value;
            const selectedSubCategory = competitorSubCategorySelect.value;

            // Update categories based on company (or show all if no company selected)
            if (selectedCompany) {
                const filteredCategories = [...new Set(
                    state.caseProducts
                        .filter(p => !p.is_company_product && (p.company_name || '') === selectedCompany)
                        .map(p => p.category)
                        .filter(Boolean)
                )].sort();
                competitorCategorySelect.innerHTML = '<option value="">All Categories</option>' +
                    filteredCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
                if (filteredCategories.includes(selectedCategory)) {
                    competitorCategorySelect.value = selectedCategory;
                }
            } else {
                // No company selected - show all competitor categories
                competitorCategorySelect.innerHTML = '<option value="">All Categories</option>' +
                    competitor.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
                if (competitor.categories.includes(selectedCategory)) {
                    competitorCategorySelect.value = selectedCategory;
                }
            }

            // Update subcategories based on company + category (independent filtering)
            const companyFilter = selectedCompany || '';
            const categoryFilter = competitorCategorySelect.value || '';

            const filteredSubCategories = [...new Set(
                state.caseProducts
                    .filter(p => {
                        if (p.is_company_product) return false;
                        if (companyFilter && (p.company_name || '') !== companyFilter) return false;
                        if (categoryFilter && (p.category || '') !== categoryFilter) return false;
                        return true;
                    })
                    .map(p => p.sub_category)
                    .filter(Boolean)
            )].sort();

            competitorSubCategorySelect.innerHTML = '<option value="">All Sub Categories</option>' +
                filteredSubCategories.map(sub => `<option value="${sub}">${sub}</option>`).join('');
            if (filteredSubCategories.includes(selectedSubCategory)) {
                competitorSubCategorySelect.value = selectedSubCategory;
            }

            // Update products based on company + category + subcategory (independent filtering)
            const subCategoryFilter = competitorSubCategorySelect.value || '';

            const filteredProducts = state.caseProducts
                .filter(p => {
                    if (p.is_company_product) return false;
                    if (companyFilter && (p.company_name || '') !== companyFilter) return false;
                    if (categoryFilter && (p.category || '') !== categoryFilter) return false;
                    if (subCategoryFilter && (p.sub_category || '') !== subCategoryFilter) return false;
                    return true;
                });

            const uniqueProducts = [];
            const seen = new Set();
            filteredProducts.forEach(p => {
                const key = p.product_id ? String(p.product_id) : p.product_name;
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueProducts.push({ value: key, label: p.product_name || 'Unknown Product' });
                }
            });

            competitorProductSelect.innerHTML = '<option value="">All Products</option>' +
                uniqueProducts.map(prod => `<option value="${prod.value}">${prod.label}</option>`).join('');
        };

        // Company row event listeners
        companyCompanySelect?.addEventListener('change', () => { updateCompanyCascading(); handleFiltersChange(); });
        companyCategorySelect?.addEventListener('change', () => { updateCompanyCascading(); handleFiltersChange(); });
        companySubCategorySelect?.addEventListener('change', () => { updateCompanyCascading(); handleFiltersChange(); });
        companyProductSelect?.addEventListener('change', handleFiltersChange);

        // Competitor row event listeners
        competitorCompanySelect?.addEventListener('change', () => { updateCompetitorCascading(); handleFiltersChange(); });
        competitorCategorySelect?.addEventListener('change', () => { updateCompetitorCascading(); handleFiltersChange(); });
        competitorSubCategorySelect?.addEventListener('change', () => { updateCompetitorCascading(); handleFiltersChange(); });
        competitorProductSelect?.addEventListener('change', handleFiltersChange);
    };

    // Setup other filter event listeners
    container.querySelectorAll('select:not([id*="company-"]):not([id*="competitor-"]), input').forEach((input) => {
        input.addEventListener('change', handleFiltersChange);
    });

    setupDualRowFilters();
    container.querySelector('#cases-filter-reset').addEventListener('click', () => {
        container.querySelectorAll('select, input').forEach((input) => (input.value = ''));

        // Reset dual-row filter options to show all options
        // Company row
        const companyCategorySelect = container.querySelector('#filter-case-company-category');
        const companySubCategorySelect = container.querySelector('#filter-case-company-sub-category');
        const companyProductSelect = container.querySelector('#filter-case-company-product');

        if (companyCategorySelect) {
            companyCategorySelect.innerHTML = '<option value="">All Categories</option>' +
                company.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
        }
        if (companySubCategorySelect) {
            companySubCategorySelect.innerHTML = '<option value="">All Sub Categories</option>' +
                company.subCategories.map(sub => `<option value="${sub}">${sub}</option>`).join('');
        }
        if (companyProductSelect) {
            companyProductSelect.innerHTML = '<option value="">All Products</option>' +
                company.productOptions.map(prod => `<option value="${prod.value}">${prod.label}</option>`).join('');
        }

        // Competitor row
        const competitorCategorySelect = container.querySelector('#filter-case-competitor-category');
        const competitorSubCategorySelect = container.querySelector('#filter-case-competitor-sub-category');
        const competitorProductSelect = container.querySelector('#filter-case-competitor-product');

        if (competitorCategorySelect) {
            competitorCategorySelect.innerHTML = '<option value="">All Categories</option>' +
                competitor.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
        }
        if (competitorSubCategorySelect) {
            competitorSubCategorySelect.innerHTML = '<option value="">All Sub Categories</option>' +
                competitor.subCategories.map(sub => `<option value="${sub}">${sub}</option>`).join('');
        }
        if (competitorProductSelect) {
            competitorProductSelect.innerHTML = '<option value="">All Products</option>' +
                competitor.productOptions.map(prod => `<option value="${prod.value}">${prod.label}</option>`).join('');
        }

        handleFiltersChange();
    });
    container.querySelector('#cases-export').addEventListener('click', exportCases);

    const setSelectValue = (selector, value) => {
        const select = container.querySelector(selector);
        if (!select) return;
        if (!value) {
            select.value = '';
            return;
        }
        const hasValue = Array.from(select.options).some((option) => option.value === value);
        select.value = hasValue ? value : '';
    };

    setSelectValue('#filter-case-specialist', previousSelections.specialist);
    setSelectValue('#filter-case-manager', previousSelections.manager);
    setSelectValue('#filter-case-account-type', previousSelections.accountType);
    setSelectValue('#filter-case-company-type', previousSelections.companyType);

    // Dual-row filter preservation
    setSelectValue('#filter-case-company-company', previousSelections.companyCompany);
    setSelectValue('#filter-case-company-category', previousSelections.companyCategory);
    setSelectValue('#filter-case-company-sub-category', previousSelections.companySubCategory);
    setSelectValue('#filter-case-company-product', previousSelections.companyProduct);

    setSelectValue('#filter-case-competitor-company', previousSelections.competitorCompany);
    setSelectValue('#filter-case-competitor-category', previousSelections.competitorCategory);
    setSelectValue('#filter-case-competitor-sub-category', previousSelections.competitorSubCategory);
    setSelectValue('#filter-case-competitor-product', previousSelections.competitorProduct);

    setSelectValue('#filter-case-month', previousSelections.month);

    const fromInput = container.querySelector('#filter-case-from');
    if (fromInput) fromInput.value = previousSelections.from || '';
    const toInput = container.querySelector('#filter-case-to');
    if (toInput) toInput.value = previousSelections.to || '';

    handleFiltersChange();
}

function getFilteredCases() {
    const specialist = document.getElementById('filter-case-specialist')?.value;
    const accountType = document.getElementById('filter-case-account-type')?.value;
    const companyType = document.getElementById('filter-case-company-type')?.value;
    const managerValue = document.getElementById('filter-case-manager')?.value;
    const monthValue = document.getElementById('filter-case-month')?.value;
    const periodFrom = document.getElementById('filter-case-from')?.value;
    const periodTo = document.getElementById('filter-case-to')?.value;

    // Dual-row filter values
    const companyCompany = document.getElementById('filter-case-company-company')?.value;
    const companyCategory = document.getElementById('filter-case-company-category')?.value;
    const companySubCategory = document.getElementById('filter-case-company-sub-category')?.value;
    const companyProduct = document.getElementById('filter-case-company-product')?.value;

    const competitorCompany = document.getElementById('filter-case-competitor-company')?.value;
    const competitorCategory = document.getElementById('filter-case-competitor-category')?.value;
    const competitorSubCategory = document.getElementById('filter-case-competitor-sub-category')?.value;
    const competitorProduct = document.getElementById('filter-case-competitor-product')?.value;

    const monthNumber = monthValue ? Number(monthValue) : null;
    const fromDate = periodFrom ? new Date(periodFrom) : null;
    const toDate = periodTo ? new Date(periodTo) : null;

    return state.cases.filter((caseItem) => {
        if (specialist && caseItem.submitted_by_id !== specialist) return false;
        if (accountType && caseItem.account_type !== accountType) return false;
        if (managerValue) {
            const submitter =
                state.employeeById?.get(String(caseItem.submitted_by_id)) ||
                state.employees.find((emp) => String(emp.id) === String(caseItem.submitted_by_id));
            const directManagerId = submitter?.direct_manager_id ? String(submitter.direct_manager_id) : '';
            const lineManagerId = submitter?.line_manager_id ? String(submitter.line_manager_id) : '';
            if (managerValue !== directManagerId && managerValue !== lineManagerId) {
                return false;
            }
        }

        const products = state.caseProductsByCase.get(caseItem.id) || [];

        // Company Type filter (Company/Competitor/All)
        if (companyType === 'company') {
            // Show only cases with company products
            if (!products.some(product => product.is_company_product)) {
                return false;
            }
        } else if (companyType === 'competitor') {
            // Show only cases with competitor products
            if (!products.some(product => !product.is_company_product)) {
                return false;
            }
        }

        // NEW DUAL-ROW MULTI-SELECTION FILTER LOGIC:
        // Case matches if it has products matching company row OR competitor row selections
        const hasCompanyFilters = companyCompany || companyCategory || companySubCategory || companyProduct;
        const hasCompetitorFilters = competitorCompany || competitorCategory || competitorSubCategory || competitorProduct;

        if (hasCompanyFilters || hasCompetitorFilters) {
            let matchesCompanySelection = false;
            let matchesCompetitorSelection = false;

            // Check company row filters
            if (hasCompanyFilters) {
                matchesCompanySelection = products.some(product => {
                    if (!product.is_company_product) return false; // Only check company products
                    if (companyCompany && (product.company_name || '') !== companyCompany) return false;
                    if (companyCategory && (product.category || '') !== companyCategory) return false;
                    if (companySubCategory && (product.sub_category || '') !== companySubCategory) return false;
                    if (companyProduct && String(product.product_id) !== companyProduct && product.product_name !== companyProduct) return false;
                    return true;
                });
            } else {
                // No company filters = include all company products
                matchesCompanySelection = products.some(product => product.is_company_product);
            }

            // Check competitor row filters
            if (hasCompetitorFilters) {
                matchesCompetitorSelection = products.some(product => {
                    if (product.is_company_product) return false; // Only check competitor products
                    if (competitorCompany && (product.company_name || '') !== competitorCompany) return false;
                    if (competitorCategory && (product.category || '') !== competitorCategory) return false;
                    if (competitorSubCategory && (product.sub_category || '') !== competitorSubCategory) return false;
                    if (competitorProduct && String(product.product_id) !== competitorProduct && product.product_name !== competitorProduct) return false;
                    return true;
                });
            } else {
                // No competitor filters = include all competitor products
                matchesCompetitorSelection = products.some(product => !product.is_company_product);
            }

            // Case must match company selection OR competitor selection
            if (!matchesCompanySelection && !matchesCompetitorSelection) {
                return false;
            }
        }

        const caseDate = new Date(caseItem.case_date);
        if (monthNumber && caseDate.getMonth() + 1 !== monthNumber) return false;
        if (fromDate && caseDate < fromDate) return false;
        if (toDate && caseDate > toDate) return false;
        return true;
    });
}

function renderCasesSection() {
    const filtered = getFilteredCases();
    renderCaseStats(filtered);
    renderCasesTable(filtered);
}

function renderCaseStats(cases) {
    const container = document.getElementById('cases-stat-cards');
    if (!container) return;

    // Get dual-row filter selections
    const companyType = document.getElementById('filter-case-company-type')?.value;
    const companyCompany = document.getElementById('filter-case-company-company')?.value;
    const companyCategory = document.getElementById('filter-case-company-category')?.value;
    const companySubCategory = document.getElementById('filter-case-company-sub-category')?.value;
    const companyProduct = document.getElementById('filter-case-company-product')?.value;

    const competitorCompany = document.getElementById('filter-case-competitor-company')?.value;
    const competitorCategory = document.getElementById('filter-case-competitor-category')?.value;
    const competitorSubCategory = document.getElementById('filter-case-competitor-sub-category')?.value;
    const competitorProduct = document.getElementById('filter-case-competitor-product')?.value;

    let metrics;
    if (companyType === 'company') {
        // Show only company stats, set competitor to 0
        metrics = computeCaseMetrics(cases, state.caseProductsByCase);
        metrics.competitorCaseCount = 0;
        metrics.competitorUnits = 0;
    } else if (companyType === 'competitor') {
        // Show only competitor stats, set company to 0
        metrics = computeCaseMetrics(cases, state.caseProductsByCase);
        metrics.companyCaseCount = 0;
        metrics.companyUnits = 0;
    } else {
        // DUAL-ROW SPECIFIC STATS CALCULATION
        // Calculate company stats based on Row 1 selections only
        const hasCompanyFilters = companyCompany || companyCategory || companySubCategory || companyProduct;
        const hasCompetitorFilters = competitorCompany || competitorCategory || competitorSubCategory || competitorProduct;

        if (hasCompanyFilters || hasCompetitorFilters) {
            // Filter cases for company stats (Row 1 selections)
            let companyCases = state.cases;
            if (hasCompanyFilters) {
                companyCases = state.cases.filter(caseItem => {
                    const products = state.caseProductsByCase.get(caseItem.id) || [];
                    return products.some(product => {
                        if (!product.is_company_product) return false;
                        if (companyCompany && (product.company_name || '') !== companyCompany) return false;
                        if (companyCategory && (product.category || '') !== companyCategory) return false;
                        if (companySubCategory && (product.sub_category || '') !== companySubCategory) return false;
                        if (companyProduct && String(product.product_id) !== companyProduct && product.product_name !== companyProduct) return false;
                        return true;
                    });
                });
            }

            // Filter cases for competitor stats (Row 2 selections)
            let competitorCases = state.cases;
            if (hasCompetitorFilters) {
                competitorCases = state.cases.filter(caseItem => {
                    const products = state.caseProductsByCase.get(caseItem.id) || [];
                    return products.some(product => {
                        if (product.is_company_product) return false;
                        if (competitorCompany && (product.company_name || '') !== competitorCompany) return false;
                        if (competitorCategory && (product.category || '') !== competitorCategory) return false;
                        if (competitorSubCategory && (product.sub_category || '') !== competitorSubCategory) return false;
                        if (competitorProduct && String(product.product_id) !== competitorProduct && product.product_name !== competitorProduct) return false;
                        return true;
                    });
                });
            }

            // Calculate metrics for each selection
            const companyMetrics = computeCaseMetrics(companyCases, state.caseProductsByCase);
            const competitorMetrics = computeCaseMetrics(competitorCases, state.caseProductsByCase);

            // Calculate mixed cases between Row 1 and Row 2 selections specifically
            let mixedCaseCount = 0;
            if (hasCompanyFilters && hasCompetitorFilters) {
                // Mixed cases = cases that match BOTH Row 1 AND Row 2 selections
                mixedCaseCount = state.cases.filter(caseItem => {
                    const products = state.caseProductsByCase.get(caseItem.id) || [];

                    // Check if case has products matching Row 1 (company) selection
                    const hasCompanyMatch = products.some(product => {
                        if (!product.is_company_product) return false;
                        if (companyCompany && (product.company_name || '') !== companyCompany) return false;
                        if (companyCategory && (product.category || '') !== companyCategory) return false;
                        if (companySubCategory && (product.sub_category || '') !== companySubCategory) return false;
                        if (companyProduct && String(product.product_id) !== companyProduct && product.product_name !== companyProduct) return false;
                        return true;
                    });

                    // Check if case has products matching Row 2 (competitor) selection
                    const hasCompetitorMatch = products.some(product => {
                        if (product.is_company_product) return false;
                        if (competitorCompany && (product.company_name || '') !== competitorCompany) return false;
                        if (competitorCategory && (product.category || '') !== competitorCategory) return false;
                        if (competitorSubCategory && (product.sub_category || '') !== competitorSubCategory) return false;
                        if (competitorProduct && String(product.product_id) !== competitorProduct && product.product_name !== competitorProduct) return false;
                        return true;
                    });

                    // Mixed case = has both company and competitor matches
                    return hasCompanyMatch && hasCompetitorMatch;
                }).length;
            } else {
                // If only one row has filters, use general mixed calculation from filtered cases
                mixedCaseCount = computeCaseMetrics(cases, state.caseProductsByCase).mixedCaseCount;
            }

            // Combine metrics with specific company/competitor counts
            metrics = {
                companyCaseCount: companyMetrics.companyCaseCount,
                companyUnits: companyMetrics.companyUnits,
                competitorCaseCount: competitorMetrics.competitorCaseCount,
                competitorUnits: competitorMetrics.competitorUnits,
                mixedCaseCount: mixedCaseCount,
                totalCaseCount: cases.length,
                activeDoctors: companyMetrics.activeDoctors,
                activeAccounts: companyMetrics.activeAccounts
            };
        } else {
            // No dual-row filters - use general filtered data
            metrics = computeCaseMetrics(cases, state.caseProductsByCase);
        }
    }

    container.innerHTML = `
        <div class="stat-card">
            <h4>Company Cases</h4>
            <div class="value">${formatNumber(metrics.companyCaseCount)}</div>
        </div>
        <div class="stat-card">
            <h4>Competitor Cases</h4>
            <div class="value">${formatNumber(metrics.competitorCaseCount)}</div>
        </div>
        <div class="stat-card">
            <h4>Mixed Cases</h4>
            <div class="value">${formatNumber(metrics.mixedCaseCount)}</div>
        </div>
        <div class="stat-card">
            <h4>Total Cases</h4>
            <div class="value">${formatNumber(metrics.totalCaseCount)}</div>
        </div>
        <div class="stat-card">
            <h4>Company Units</h4>
            <div class="value">${formatNumber(metrics.companyUnits)}</div>
        </div>
        <div class="stat-card">
            <h4>Competitor Units</h4>
            <div class="value">${formatNumber(metrics.competitorUnits)}</div>
        </div>
        <div class="stat-card">
            <h4>Active Doctors</h4>
            <div class="value">${formatNumber(metrics.activeDoctors)}</div>
        </div>
        <div class="stat-card">
            <h4>Active Accounts</h4>
            <div class="value">${formatNumber(metrics.activeAccounts)}</div>
        </div>
    `;
}

function renderCasesTable(cases) {
    const tableData = cases.map((caseItem) => buildCaseTableRow(caseItem, state.caseProductsByCase));
    const columns = buildCaseTableColumns(tableFormatters);
    if (!columns.some((column) => column.field === 'actions')) {
        columns.push({
            title: 'Actions',
            field: 'actions',
            width: 140,
            hozAlign: 'center',
            formatter: tableFormatters.actions([
                {
                    name: 'delete',
                    label: 'Delete',
                    icon: 'bi bi-trash',
                variant: 'btn-outline-ghost'
                }
            ]),
            headerSort: false
        });
    }

    state.tables.cases = createTable('cases-table', columns, tableData, {
        height: 520,
        initialSort: [{ column: 'created_at', dir: 'desc' }]
    });
    bindTableActions(state.tables.cases, {
        delete: (rowData) => deleteCase(rowData.id)
    });
    attachProductsToggle(state.tables.cases, {
        anchorField: 'product3_units',
        storageKey: 'admin_cases_products_toggle'
    });
}

function exportCases() {
    const filtered = getFilteredCases();
    const rows = buildCaseExportRows(filtered, state.caseProductsByCase);
    downloadAsExcel('mts_cases', rows, CASE_EXPORT_HEADERS);
}

function exportDashboardCases() {
    const { cases, caseProductsMap } = getDashboardFilteredData();
    const rows = buildCaseExportRows(cases, caseProductsMap);
    downloadAsExcel('dashboard_cases', rows, CASE_EXPORT_HEADERS);
}

async function deleteCase(caseId) {
    if (!caseId) return;
    const confirmed = window.confirm('Delete this case permanently?');
    if (!confirmed) return;
    try {
        await handleSupabase(supabase.from('case_products').delete().eq('case_id', caseId), 'delete case products');
        await handleSupabase(supabase.from('cases').delete().eq('id', caseId), 'delete case');
        await loadCases();
        const filtered = getFilteredCases();
        renderCaseStats(filtered);
        renderCasesTable(filtered);
        buildApprovalsDataset();
        renderApprovalsTable();
        setupDashboardFilters();
        renderDashboard();
        alert('Case deleted successfully.');
    } catch (error) {
        alert(handleError(error));
    }
}
function renderApprovalsTable() {
    const filtered = state.approvals.filter((item) => item.status !== APPROVAL_STATUS.REJECTED && item.status !== APPROVAL_STATUS.APPROVED);

    const columns = [
        { title: 'Type', field: 'type', width: 110, headerFilter: 'input' },
        { title: 'Name / Code', field: 'name', minWidth: 200, headerFilter: 'input' },
        { title: 'Product Specialist', field: 'ownerName', minWidth: 200, headerFilter: 'input' },
        { title: 'Status', field: 'status', formatter: tableFormatters.status, width: 150 },
        { title: 'Submitted On', field: 'created_at', formatter: tableFormatters.date, width: 150 },
        {
            title: 'Actions',
            field: 'actions',
            hozAlign: 'center',
            width: 320,
            formatter: tableFormatters.actions([
                { name: 'review', label: 'Review', icon: 'bi bi-box-arrow-up-right', variant: 'btn-positive' },
                { name: 'approve', label: 'Approve', icon: 'bi bi-check2', variant: 'btn-gradient' },
                { name: 'reject', label: 'Reject', icon: 'bi bi-x', variant: 'btn-negative' }
            ]),
            headerSort: false
        }
    ];

    state.tables.approvals = createTable('approvals-table', columns, filtered, {
        height: 520,
        initialSort: [{ column: 'created_at', dir: 'desc' }]
    });

    bindTableActions(state.tables.approvals, {
        review: (rowData) => reviewApproval(rowData),
        approve: (rowData) => processApproval(rowData, true),
        reject: (rowData) => processApproval(rowData, false)
    });
}

function reviewApproval(record) {
    if (record.type === 'doctor') {
        populateDoctorForm(record.id);
    } else if (record.type === 'account') {
        populateAccountForm(record.id);
    } else if (record.type === 'case') {
        populateCaseReview(record.id, record.payload);
    }
}

async function processApproval(record, approve = true) {
    const payload = record.payload || {};

    try {
        let comment = null;
        if (!approve) {
            comment = prompt('Reason for rejection?') || null;
        }

        if (record.type === 'doctor') {
            if (approve) {
                await handleSupabase(
                    supabase
                        .from('doctors')
                        .update({
                            status: APPROVAL_STATUS.APPROVED,
                            admin_id: state.session.employeeId,
                            admin_comment: comment,
                            approved_at: new Date().toISOString(),
                            rejected_at: null
                        })
                        .eq('id', record.id),
                    'update doctor approval'
                );
            } else {
                await handleSupabase(
                    supabase
                        .from('doctors')
                        .delete()
                        .eq('id', record.id),
                    'delete rejected doctor'
                );
            }
            await removeAdminNotification('doctor', record.id);
        }

        if (record.type === 'account') {
            if (approve) {
                await handleSupabase(
                    supabase
                        .from('accounts')
                        .update({
                            status: APPROVAL_STATUS.APPROVED,
                            admin_id: state.session.employeeId,
                            admin_comment: comment,
                            approved_at: new Date().toISOString(),
                            rejected_at: null
                        })
                        .eq('id', record.id),
                    'update account approval'
                );
            } else {
                await handleSupabase(
                    supabase
                        .from('accounts')
                        .delete()
                        .eq('id', record.id),
                    'delete rejected account'
                );
            }
            await removeAdminNotification('account', record.id);
        }

        if (record.type === 'case') {
            if (approve) {
                await handleSupabase(
                    supabase
                        .from('cases')
                        .update({
                            status: APPROVAL_STATUS.APPROVED,
                            admin_id: state.session.employeeId,
                            admin_comment: comment,
                            approved_at: new Date().toISOString(),
                            rejected_at: null
                        })
                        .eq('id', record.id),
                    'update case approval'
                );
            } else {
                await handleSupabase(
                    supabase
                        .from('case_products')
                        .delete()
                        .eq('case_id', record.id),
                    'delete rejected case products'
                );
                await handleSupabase(
                    supabase
                        .from('cases')
                        .delete()
                        .eq('id', record.id),
                    'delete rejected case'
                );
            }
            await removeAdminNotification('case', record.id);
        }

        const targetEmployeeId = payload.owner_employee_id || payload.submitted_by_id;
        if (targetEmployeeId) {
            const entityLabel = record.type.charAt(0).toUpperCase() + record.type.slice(1);
            if (approve) {
                await notifyEmployee(
                    targetEmployeeId,
                    `${entityLabel} request approved: ${record.name}`,
                    record.type,
                    record.id
                );
            } else {
                const reason = comment ? ` Reason: ${comment}` : '';
                await notifyEmployee(
                    targetEmployeeId,
                    `${entityLabel} request rejected: ${record.name}.${reason}`,
                    record.type,
                    record.id
                );
            }
        }

        await loadDoctors();
        await loadAccounts();
        await loadCases();
        buildApprovalsDataset();
        renderApprovalsTable();
        renderDoctorsSection({ refreshFilters: true });
        renderAccountsSection({ refreshFilters: true });
        renderCasesSection();
        setupDashboardFilters();
        renderDashboard();
    } catch (error) {
        alert(handleError(error));
    }
}
function setupApprovalsFilters() {
    const container = document.getElementById('approvals-filters');
    if (!container) return;
    container.innerHTML = `
        <select class="form-select" id="filter-approval-type">
            <option value="">All Types</option>
            <option value="doctor">Doctor</option>
            <option value="account">Account</option>
            <option value="case">Case</option>
        </select>
        <select class="form-select" id="filter-approval-status">
            <option value="">All Status</option>
            ${Object.values(APPROVAL_STATUS)
                .map((status) => `<option value="${status}">${status.replace('_', ' ')}</option>`)
                .join('')}
        </select>
        <button class="btn btn-outline-ghost" id="approvals-export"><i class="bi bi-download me-2"></i>Export</button>
    `;

    container.querySelectorAll('select').forEach((input) => input.addEventListener('change', filterApprovals));
    container.querySelector('#approvals-export').addEventListener('click', exportApprovals);
}

function filterApprovals() {
    const type = document.getElementById('filter-approval-type').value;
    const status = document.getElementById('filter-approval-status').value;

    const filtered = state.approvals.filter((item) => {
        if (type && item.type !== type) return false;
        if (status && item.status !== status) return false;
        return true;
    });

    state.tables.approvals?.setData(filtered);
}

function exportApprovals() {
    downloadAsExcel('mts_approvals', state.approvals, {
        type: 'Type',
        name: 'Name',
        ownerName: 'Product Specialist',
        status: 'Status',
        created_at: 'Submitted On'
    });
}
function setupDashboardFilters() {
    const container = document.getElementById('dashboard-filters');
    if (!container) return;

    const previousSelections = {
        specialist: container.querySelector('#dashboard-filter-specialist')?.value || '',
        manager: container.querySelector('#dashboard-filter-manager')?.value || '',
        accountType: container.querySelector('#dashboard-filter-account-type')?.value || '',

        companyType: container.querySelector('#dashboard-filter-company-type')?.value || '',

        // Dual-row filter values
        companyCompany: container.querySelector('#dashboard-filter-company-company')?.value || '',
        companyCategory: container.querySelector('#dashboard-filter-company-category')?.value || '',
        companySubCategory: container.querySelector('#dashboard-filter-company-sub-category')?.value || '',
        companyProduct: container.querySelector('#dashboard-filter-company-product')?.value || '',

        competitorCompany: container.querySelector('#dashboard-filter-competitor-company')?.value || '',
        competitorCategory: container.querySelector('#dashboard-filter-competitor-category')?.value || '',
        competitorSubCategory: container.querySelector('#dashboard-filter-competitor-sub-category')?.value || '',
        competitorProduct: container.querySelector('#dashboard-filter-competitor-product')?.value || '',

        month: container.querySelector('#dashboard-filter-month')?.value || '',
        from: container.querySelector('#dashboard-filter-from')?.value || '',
        to: container.querySelector('#dashboard-filter-to')?.value || ''
    };

    const specialists = state.employees
        .filter((emp) => emp.role === ROLES.EMPLOYEE)
        .map((emp) => ({ value: emp.id, label: emp.full_name }));
    const managers = state.employees
        .filter((emp) => emp.role === ROLES.MANAGER)
        .map((emp) => ({ value: emp.id, label: emp.full_name }));
    const { company, competitor } = collectDualRowFilterOptions(state.caseProducts, state.products);

    container.innerHTML = `
        <div class="filters-row">
            <select class="form-select" id="dashboard-filter-specialist">
                <option value="">All Specialists</option>
                ${specialists.map((item) => `<option value="${item.value}">${item.label}</option>`).join('')}
            </select>
            <select class="form-select" id="dashboard-filter-manager">
                <option value="">All Managers</option>
                ${managers.map((manager) => `<option value="${manager.value}">${manager.label}</option>`).join('')}
            </select>
            <select class="form-select" id="dashboard-filter-account-type">
                <option value="">All Account Types</option>
                ${ACCOUNT_TYPES.map((type) => `<option value="${type}">${type}</option>`).join('')}
            </select>
            <select class="form-select" id="dashboard-filter-company-type">
                <option value="">All Company Types</option>
                <option value="company">Company</option>
                <option value="competitor">Competitor</option>
            </select>
        </div>

        <!-- Company Filters Row -->
        <div class="filters-row">
            <select class="form-select" id="dashboard-filter-company-company">
                <option value="">All Companies</option>
                ${company.companies.map(comp => `<option value="${comp}">${comp}</option>`).join('')}
            </select>
            <select class="form-select" id="dashboard-filter-company-category">
                <option value="">All Categories</option>
                ${company.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
            </select>
            <select class="form-select" id="dashboard-filter-company-sub-category">
                <option value="">All Sub Categories</option>
                ${company.subCategories.map(sub => `<option value="${sub}">${sub}</option>`).join('')}
            </select>
            <select class="form-select" id="dashboard-filter-company-product">
                <option value="">All Products</option>
                ${company.productOptions.map(option => `<option value="${option.value}">${option.label}</option>`).join('')}
            </select>
        </div>

        <!-- Competitor Filters Row -->
        <div class="filters-row">
            <select class="form-select" id="dashboard-filter-competitor-company">
                <option value="">All Companies</option>
                ${competitor.companies.map(comp => `<option value="${comp}">${comp}</option>`).join('')}
            </select>
            <select class="form-select" id="dashboard-filter-competitor-category">
                <option value="">All Categories</option>
                ${competitor.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
            </select>
            <select class="form-select" id="dashboard-filter-competitor-sub-category">
                <option value="">All Sub Categories</option>
                ${competitor.subCategories.map(sub => `<option value="${sub}">${sub}</option>`).join('')}
            </select>
            <select class="form-select" id="dashboard-filter-competitor-product">
                <option value="">All Products</option>
                ${competitor.productOptions.map(option => `<option value="${option.value}">${option.label}</option>`).join('')}
            </select>
        </div>

        <div class="filters-row">
            <select class="form-select" id="dashboard-filter-month">
                <option value="">Any Month</option>
                ${Array.from({ length: 12 }, (_, index) => {
                    const month = index + 1;
                    const label = new Date(2000, index).toLocaleString(undefined, { month: 'long' });
                    return `<option value="${month}">${label}</option>`;
                }).join('')}
            </select>
            <input type="date" class="form-control" id="dashboard-filter-from">
            <input type="date" class="form-control" id="dashboard-filter-to">
            <div class="filters-actions" style="justify-self: end;">
                <button class="btn btn-outline-ghost" id="dashboard-filter-reset">Reset</button>
                <button class="btn btn-outline-ghost" id="dashboard-export"><i class="bi bi-download me-2"></i>Export</button>
            </div>
        </div>
    `;

    const handleFiltersChange = () => renderDashboard();

    // Restore previous selections
    const setSelectValue = (selector, value) => {
        const select = container.querySelector(selector);
        if (!select) return;
        if (!value) {
            select.value = '';
            return;
        }
        const hasValue = Array.from(select.options).some((option) => option.value === value);
        select.value = hasValue ? value : '';
    };

    setSelectValue('#dashboard-filter-specialist', previousSelections.specialist);
    setSelectValue('#dashboard-filter-manager', previousSelections.manager);
    setSelectValue('#dashboard-filter-account-type', previousSelections.accountType);
    setSelectValue('#dashboard-filter-company-type', previousSelections.companyType);

    // Dual-row filter preservation
    setSelectValue('#dashboard-filter-company-company', previousSelections.companyCompany);
    setSelectValue('#dashboard-filter-company-category', previousSelections.companyCategory);
    setSelectValue('#dashboard-filter-company-sub-category', previousSelections.companySubCategory);
    setSelectValue('#dashboard-filter-company-product', previousSelections.companyProduct);

    setSelectValue('#dashboard-filter-competitor-company', previousSelections.competitorCompany);
    setSelectValue('#dashboard-filter-competitor-category', previousSelections.competitorCategory);
    setSelectValue('#dashboard-filter-competitor-sub-category', previousSelections.competitorSubCategory);
    setSelectValue('#dashboard-filter-competitor-product', previousSelections.competitorProduct);

    setSelectValue('#dashboard-filter-month', previousSelections.month);

    const fromInput = container.querySelector('#dashboard-filter-from');
    if (fromInput) fromInput.value = previousSelections.from || '';
    const toInput = container.querySelector('#dashboard-filter-to');
    if (toInput) toInput.value = previousSelections.to || '';

    // Setup dual-row cascading filters (FULL CASCADING LOGIC FROM CASES PAGE)
    const setupDualRowFilters = () => {
        // Company row cascading
        const companyCompanySelect = container.querySelector('#dashboard-filter-company-company');
        const companyCategorySelect = container.querySelector('#dashboard-filter-company-category');
        const companySubCategorySelect = container.querySelector('#dashboard-filter-company-sub-category');
        const companyProductSelect = container.querySelector('#dashboard-filter-company-product');

        // Competitor row cascading
        const competitorCompanySelect = container.querySelector('#dashboard-filter-competitor-company');
        const competitorCategorySelect = container.querySelector('#dashboard-filter-competitor-category');
        const competitorSubCategorySelect = container.querySelector('#dashboard-filter-competitor-sub-category');
        const competitorProductSelect = container.querySelector('#dashboard-filter-competitor-product');

        // Company row cascading logic
        const updateCompanyCascading = () => {
            const selectedCompany = companyCompanySelect.value;
            const selectedCategory = companyCategorySelect.value;
            const selectedSubCategory = companySubCategorySelect.value;

            // Update categories based on company (or show all if no company selected)
            if (selectedCompany) {
                const filteredCategories = [...new Set(
                    state.caseProducts
                        .filter(p => p.is_company_product && (p.company_name || '') === selectedCompany)
                        .map(p => p.category)
                        .filter(Boolean)
                )].sort();
                companyCategorySelect.innerHTML = '<option value="">All Categories</option>' +
                    filteredCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
                if (filteredCategories.includes(selectedCategory)) {
                    companyCategorySelect.value = selectedCategory;
                }
            } else {
                // No company selected - show all company categories
                companyCategorySelect.innerHTML = '<option value="">All Categories</option>' +
                    company.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
                if (company.categories.includes(selectedCategory)) {
                    companyCategorySelect.value = selectedCategory;
                }
            }

            // Update subcategories based on company + category (independent filtering)
            const companyFilter = selectedCompany || '';
            const categoryFilter = companyCategorySelect.value || '';

            const filteredSubCategories = [...new Set(
                state.caseProducts
                    .filter(p => {
                        if (!p.is_company_product) return false;
                        if (companyFilter && (p.company_name || '') !== companyFilter) return false;
                        if (categoryFilter && (p.category || '') !== categoryFilter) return false;
                        return true;
                    })
                    .map(p => p.sub_category)
                    .filter(Boolean)
            )].sort();

            companySubCategorySelect.innerHTML = '<option value="">All Sub Categories</option>' +
                filteredSubCategories.map(sub => `<option value="${sub}">${sub}</option>`).join('');
            if (filteredSubCategories.includes(selectedSubCategory)) {
                companySubCategorySelect.value = selectedSubCategory;
            }

            // Update products based on company + category + subcategory (independent filtering)
            const subCategoryFilter = companySubCategorySelect.value || '';

            const filteredProducts = state.caseProducts
                .filter(p => {
                    if (!p.is_company_product) return false;
                    if (companyFilter && (p.company_name || '') !== companyFilter) return false;
                    if (categoryFilter && (p.category || '') !== categoryFilter) return false;
                    if (subCategoryFilter && (p.sub_category || '') !== subCategoryFilter) return false;
                    return true;
                });

            const uniqueProducts = [];
            const seen = new Set();
            filteredProducts.forEach(p => {
                const key = p.product_id ? String(p.product_id) : p.product_name;
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueProducts.push({ value: key, label: p.product_name || 'Unknown Product' });
                }
            });

            companyProductSelect.innerHTML = '<option value="">All Products</option>' +
                uniqueProducts.map(prod => `<option value="${prod.value}">${prod.label}</option>`).join('');
        };

        // Competitor row cascading logic
        const updateCompetitorCascading = () => {
            const selectedCompany = competitorCompanySelect.value;
            const selectedCategory = competitorCategorySelect.value;
            const selectedSubCategory = competitorSubCategorySelect.value;

            // Update categories based on company (or show all if no company selected)
            if (selectedCompany) {
                const filteredCategories = [...new Set(
                    state.caseProducts
                        .filter(p => !p.is_company_product && (p.company_name || '') === selectedCompany)
                        .map(p => p.category)
                        .filter(Boolean)
                )].sort();
                competitorCategorySelect.innerHTML = '<option value="">All Categories</option>' +
                    filteredCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
                if (filteredCategories.includes(selectedCategory)) {
                    competitorCategorySelect.value = selectedCategory;
                }
            } else {
                // No company selected - show all competitor categories
                competitorCategorySelect.innerHTML = '<option value="">All Categories</option>' +
                    competitor.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
                if (competitor.categories.includes(selectedCategory)) {
                    competitorCategorySelect.value = selectedCategory;
                }
            }

            // Update subcategories based on company + category (independent filtering)
            const companyFilter = selectedCompany || '';
            const categoryFilter = competitorCategorySelect.value || '';

            const filteredSubCategories = [...new Set(
                state.caseProducts
                    .filter(p => {
                        if (p.is_company_product) return false;
                        if (companyFilter && (p.company_name || '') !== companyFilter) return false;
                        if (categoryFilter && (p.category || '') !== categoryFilter) return false;
                        return true;
                    })
                    .map(p => p.sub_category)
                    .filter(Boolean)
            )].sort();

            competitorSubCategorySelect.innerHTML = '<option value="">All Sub Categories</option>' +
                filteredSubCategories.map(sub => `<option value="${sub}">${sub}</option>`).join('');
            if (filteredSubCategories.includes(selectedSubCategory)) {
                competitorSubCategorySelect.value = selectedSubCategory;
            }

            // Update products based on company + category + subcategory (independent filtering)
            const subCategoryFilter = competitorSubCategorySelect.value || '';

            const filteredProducts = state.caseProducts
                .filter(p => {
                    if (p.is_company_product) return false;
                    if (companyFilter && (p.company_name || '') !== companyFilter) return false;
                    if (categoryFilter && (p.category || '') !== categoryFilter) return false;
                    if (subCategoryFilter && (p.sub_category || '') !== subCategoryFilter) return false;
                    return true;
                });

            const uniqueProducts = [];
            const seen = new Set();
            filteredProducts.forEach(p => {
                const key = p.product_id ? String(p.product_id) : p.product_name;
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueProducts.push({ value: key, label: p.product_name || 'Unknown Product' });
                }
            });

            competitorProductSelect.innerHTML = '<option value="">All Products</option>' +
                uniqueProducts.map(prod => `<option value="${prod.value}">${prod.label}</option>`).join('');
        };

        // Company row event listeners
        companyCompanySelect?.addEventListener('change', () => { updateCompanyCascading(); handleFiltersChange(); });
        companyCategorySelect?.addEventListener('change', () => { updateCompanyCascading(); handleFiltersChange(); });
        companySubCategorySelect?.addEventListener('change', () => { updateCompanyCascading(); handleFiltersChange(); });
        companyProductSelect?.addEventListener('change', handleFiltersChange);

        // Competitor row event listeners
        competitorCompanySelect?.addEventListener('change', () => { updateCompetitorCascading(); handleFiltersChange(); });
        competitorCategorySelect?.addEventListener('change', () => { updateCompetitorCascading(); handleFiltersChange(); });
        competitorSubCategorySelect?.addEventListener('change', () => { updateCompetitorCascading(); handleFiltersChange(); });
        competitorProductSelect?.addEventListener('change', handleFiltersChange);
    };

    // Setup event listeners for non-cascading filters
    container.querySelector('#dashboard-filter-specialist')?.addEventListener('change', handleFiltersChange);
    container.querySelector('#dashboard-filter-manager')?.addEventListener('change', handleFiltersChange);
    container.querySelector('#dashboard-filter-account-type')?.addEventListener('change', handleFiltersChange);
    container.querySelector('#dashboard-filter-company-type')?.addEventListener('change', handleFiltersChange);
    container.querySelector('#dashboard-filter-month')?.addEventListener('change', handleFiltersChange);
    container.querySelector('#dashboard-filter-from')?.addEventListener('change', handleFiltersChange);
    container.querySelector('#dashboard-filter-to')?.addEventListener('change', handleFiltersChange);

    setupDualRowFilters();

    // Reset button - reset both rows to show all options
    container.querySelector('#dashboard-filter-reset')?.addEventListener('click', (event) => {
        event.preventDefault();
        container.querySelectorAll('select').forEach((select) => (select.value = ''));
        container.querySelectorAll('input').forEach((input) => (input.value = ''));

        // Reset company row options
        const companyCompanySelect = container.querySelector('#dashboard-filter-company-company');
        const companyCategorySelect = container.querySelector('#dashboard-filter-company-category');
        const companySubCategorySelect = container.querySelector('#dashboard-filter-company-sub-category');
        const companyProductSelect = container.querySelector('#dashboard-filter-company-product');

        if (companyCompanySelect) {
            companyCompanySelect.innerHTML = '<option value="">All Companies</option>' +
                company.companies.map(comp => `<option value="${comp}">${comp}</option>`).join('');
        }
        if (companyCategorySelect) {
            companyCategorySelect.innerHTML = '<option value="">All Categories</option>' +
                company.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
        }
        if (companySubCategorySelect) {
            companySubCategorySelect.innerHTML = '<option value="">All Sub Categories</option>' +
                company.subCategories.map(sub => `<option value="${sub}">${sub}</option>`).join('');
        }
        if (companyProductSelect) {
            companyProductSelect.innerHTML = '<option value="">All Products</option>' +
                company.productOptions.map(option => `<option value="${option.value}">${option.label}</option>`).join('');
        }

        // Reset competitor row options
        const competitorCompanySelect = container.querySelector('#dashboard-filter-competitor-company');
        const competitorCategorySelect = container.querySelector('#dashboard-filter-competitor-category');
        const competitorSubCategorySelect = container.querySelector('#dashboard-filter-competitor-sub-category');
        const competitorProductSelect = container.querySelector('#dashboard-filter-competitor-product');

        if (competitorCompanySelect) {
            competitorCompanySelect.innerHTML = '<option value="">All Companies</option>' +
                competitor.companies.map(comp => `<option value="${comp}">${comp}</option>`).join('');
        }
        if (competitorCategorySelect) {
            competitorCategorySelect.innerHTML = '<option value="">All Categories</option>' +
                competitor.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
        }
        if (competitorSubCategorySelect) {
            competitorSubCategorySelect.innerHTML = '<option value="">All Sub Categories</option>' +
                competitor.subCategories.map(sub => `<option value="${sub}">${sub}</option>`).join('');
        }
        if (competitorProductSelect) {
            competitorProductSelect.innerHTML = '<option value="">All Products</option>' +
                competitor.productOptions.map(option => `<option value="${option.value}">${option.label}</option>`).join('');
        }

        handleFiltersChange();
    });

    container.querySelector('#dashboard-export')?.addEventListener('click', exportDashboardCases);

    // Initial render
    handleFiltersChange();
}

function getDashboardFilteredData() {
    const filteredCases = getFilteredDashboardCases();
    const idSet = new Set(filteredCases.map((caseItem) => caseItem.id));
    const filteredCaseProducts = state.caseProducts.filter((product) => idSet.has(product.case_id));
    const caseProductsMap = groupCaseProducts(filteredCaseProducts);
    return {
        cases: filteredCases,
        caseProducts: filteredCaseProducts,
        caseProductsMap
    };
}

function getFilteredDashboardCases() {
    const specialist = document.getElementById('dashboard-filter-specialist')?.value;
    const accountType = document.getElementById('dashboard-filter-account-type')?.value;
    const companyType = document.getElementById('dashboard-filter-company-type')?.value;
    const managerValue = document.getElementById('dashboard-filter-manager')?.value;

    // Dual-row filter values
    const companyCompany = document.getElementById('dashboard-filter-company-company')?.value;
    const companyCategory = document.getElementById('dashboard-filter-company-category')?.value;
    const companySubCategory = document.getElementById('dashboard-filter-company-sub-category')?.value;
    const companyProduct = document.getElementById('dashboard-filter-company-product')?.value;

    const competitorCompany = document.getElementById('dashboard-filter-competitor-company')?.value;
    const competitorCategory = document.getElementById('dashboard-filter-competitor-category')?.value;
    const competitorSubCategory = document.getElementById('dashboard-filter-competitor-sub-category')?.value;
    const competitorProduct = document.getElementById('dashboard-filter-competitor-product')?.value;

    const monthValue = document.getElementById('dashboard-filter-month')?.value;
    const periodFrom = document.getElementById('dashboard-filter-from')?.value;
    const periodTo = document.getElementById('dashboard-filter-to')?.value;

    const monthNumber = monthValue ? Number(monthValue) : null;
    const fromDate = periodFrom ? new Date(periodFrom) : null;
    const toDate = periodTo ? new Date(periodTo) : null;

    return state.cases.filter((caseItem) => {
        if (specialist && String(caseItem.submitted_by_id) !== String(specialist)) return false;
        if (accountType && caseItem.account_type !== accountType) return false;

        if (managerValue) {
            const submitter =
                state.employeeById?.get(String(caseItem.submitted_by_id)) ||
                state.employees.find((emp) => String(emp.id) === String(caseItem.submitted_by_id));
            const directManagerId = submitter?.direct_manager_id ? String(submitter.direct_manager_id) : '';
            const lineManagerId = submitter?.line_manager_id ? String(submitter.line_manager_id) : '';
            if (managerValue !== directManagerId && managerValue !== lineManagerId) {
                return false;
            }
        }

        const products = state.caseProductsByCase.get(caseItem.id) || [];

        // Company Type filter (Company/Competitor/All)
        if (companyType === 'company') {
            if (!products.some(product => product.is_company_product)) {
                return false;
            }
        } else if (companyType === 'competitor') {
            if (!products.some(product => !product.is_company_product)) {
                return false;
            }
        }

        // DUAL-ROW MULTI-SELECTION FILTER LOGIC (same as other pages)
        const hasCompanyFilters = companyCompany || companyCategory || companySubCategory || companyProduct;
        const hasCompetitorFilters = competitorCompany || competitorCategory || competitorSubCategory || competitorProduct;

        if (hasCompanyFilters || hasCompetitorFilters) {
            let matchesCompanySelection = false;
            let matchesCompetitorSelection = false;

            // Check company row filters
            if (hasCompanyFilters) {
                matchesCompanySelection = products.some(product => {
                    if (!product.is_company_product) return false; // Only check company products
                    if (companyCompany && (product.company_name || '') !== companyCompany) return false;
                    if (companyCategory && (product.category || '') !== companyCategory) return false;
                    if (companySubCategory && (product.sub_category || '') !== companySubCategory) return false;
                    if (companyProduct && String(product.product_id) !== companyProduct && product.product_name !== companyProduct) return false;
                    return true;
                });
            } else {
                // No company filters = include all company products
                matchesCompanySelection = products.some(product => product.is_company_product);
            }

            // Check competitor row filters
            if (hasCompetitorFilters) {
                matchesCompetitorSelection = products.some(product => {
                    if (product.is_company_product) return false; // Only check competitor products
                    if (competitorCompany && (product.company_name || '') !== competitorCompany) return false;
                    if (competitorCategory && (product.category || '') !== competitorCategory) return false;
                    if (competitorSubCategory && (product.sub_category || '') !== competitorSubCategory) return false;
                    if (competitorProduct && String(product.product_id) !== competitorProduct && product.product_name !== competitorProduct) return false;
                    return true;
                });
            } else {
                // No competitor filters = include all competitor products
                matchesCompetitorSelection = products.some(product => !product.is_company_product);
            }

            // Case must match company selection OR competitor selection
            if (!matchesCompanySelection && !matchesCompetitorSelection) {
                return false;
            }
        }

        const caseDate = new Date(caseItem.case_date);
        if (monthNumber && caseDate.getMonth() + 1 !== monthNumber) return false;
        if (fromDate && caseDate < fromDate) return false;
        if (toDate && caseDate > toDate) return false;
        return true;
    });
}

function renderDashboard() {
    const { cases, caseProducts, caseProductsMap } = getDashboardFilteredData();
    renderDashboardStats(cases, caseProductsMap);
    renderDashboardCharts(cases, caseProductsMap, caseProducts);
}

// Helper function to get filtered case sets based on dual-row filter selections
function getDualRowCaseSets(cases, caseProductsMap) {
    // Get dual-row filter values
    const companyCompany = document.getElementById('dashboard-filter-company-company')?.value || '';
    const companyCategory = document.getElementById('dashboard-filter-company-category')?.value || '';
    const companySubCategory = document.getElementById('dashboard-filter-company-sub-category')?.value || '';
    const companyProduct = document.getElementById('dashboard-filter-company-product')?.value || '';

    const competitorCompany = document.getElementById('dashboard-filter-competitor-company')?.value || '';
    const competitorCategory = document.getElementById('dashboard-filter-competitor-category')?.value || '';
    const competitorSubCategory = document.getElementById('dashboard-filter-competitor-sub-category')?.value || '';
    const competitorProduct = document.getElementById('dashboard-filter-competitor-product')?.value || '';

    const hasCompanyFilters = companyCompany || companyCategory || companySubCategory || companyProduct;
    const hasCompetitorFilters = competitorCompany || competitorCategory || competitorSubCategory || competitorProduct;

    // Filter cases for company (Row 1 selections)
    let companyCases;
    if (hasCompanyFilters) {
        companyCases = cases.filter(caseItem => {
            const products = caseProductsMap.get(caseItem.id) || [];
            return products.some(product => {
                if (!product.is_company_product) return false;
                if (companyCompany && (product.company_name || '') !== companyCompany) return false;
                if (companyCategory && (product.category || '') !== companyCategory) return false;
                if (companySubCategory && (product.sub_category || '') !== companySubCategory) return false;
                if (companyProduct && String(product.product_id) !== companyProduct && product.product_name !== companyProduct) return false;
                return true;
            });
        });
    } else {
        // No filters - return all cases with company products
        companyCases = cases.filter(caseItem => {
            const products = caseProductsMap.get(caseItem.id) || [];
            return products.some(product => product.is_company_product);
        });
    }

    // Filter cases for competitor (Row 2 selections)
    let competitorCases;
    if (hasCompetitorFilters) {
        competitorCases = cases.filter(caseItem => {
            const products = caseProductsMap.get(caseItem.id) || [];
            return products.some(product => {
                if (product.is_company_product) return false;
                if (competitorCompany && (product.company_name || '') !== competitorCompany) return false;
                if (competitorCategory && (product.category || '') !== competitorCategory) return false;
                if (competitorSubCategory && (product.sub_category || '') !== competitorSubCategory) return false;
                if (competitorProduct && String(product.product_id) !== competitorProduct && product.product_name !== competitorProduct) return false;
                return true;
            });
        });
    } else {
        // No filters - return all cases with competitor products
        competitorCases = cases.filter(caseItem => {
            const products = caseProductsMap.get(caseItem.id) || [];
            return products.some(product => !product.is_company_product);
        });
    }

    return {
        companyCases,
        competitorCases,
        hasCompanyFilters,
        hasCompetitorFilters
    };
}

// Helper function to get metrics based on dual-row filter selections
function getDualRowMetrics(cases, caseProductsMap) {
    // Get dual-row filter values
    const companyCompany = document.getElementById('dashboard-filter-company-company')?.value || '';
    const companyCategory = document.getElementById('dashboard-filter-company-category')?.value || '';
    const companySubCategory = document.getElementById('dashboard-filter-company-sub-category')?.value || '';
    const companyProduct = document.getElementById('dashboard-filter-company-product')?.value || '';

    const competitorCompany = document.getElementById('dashboard-filter-competitor-company')?.value || '';
    const competitorCategory = document.getElementById('dashboard-filter-competitor-category')?.value || '';
    const competitorSubCategory = document.getElementById('dashboard-filter-competitor-sub-category')?.value || '';
    const competitorProduct = document.getElementById('dashboard-filter-competitor-product')?.value || '';

    const companyType = document.getElementById('dashboard-filter-company-type')?.value || '';

    let metrics;

    if (companyType === 'company') {
        // Show only company stats, set competitor to 0
        metrics = computeCaseMetrics(cases, caseProductsMap);
        metrics.competitorCaseCount = 0;
        metrics.competitorUnits = 0;
    } else if (companyType === 'competitor') {
        // Show only competitor stats, set company to 0
        metrics = computeCaseMetrics(cases, caseProductsMap);
        metrics.companyCaseCount = 0;
        metrics.companyUnits = 0;
    } else {
        // DUAL-ROW SPECIFIC STATS CALCULATION
        const hasCompanyFilters = companyCompany || companyCategory || companySubCategory || companyProduct;
        const hasCompetitorFilters = competitorCompany || competitorCategory || competitorSubCategory || competitorProduct;

        if (hasCompanyFilters || hasCompetitorFilters) {
            // Filter cases for company stats (Row 1 selections only)
            let companyCases = cases;
            if (hasCompanyFilters) {
                companyCases = cases.filter(caseItem => {
                    const products = caseProductsMap.get(caseItem.id) || [];
                    return products.some(product => {
                        if (!product.is_company_product) return false;
                        if (companyCompany && (product.company_name || '') !== companyCompany) return false;
                        if (companyCategory && (product.category || '') !== companyCategory) return false;
                        if (companySubCategory && (product.sub_category || '') !== companySubCategory) return false;
                        if (companyProduct && String(product.product_id) !== companyProduct && product.product_name !== companyProduct) return false;
                        return true;
                    });
                });
            }

            // Filter cases for competitor stats (Row 2 selections only)
            let competitorCases = cases;
            if (hasCompetitorFilters) {
                competitorCases = cases.filter(caseItem => {
                    const products = caseProductsMap.get(caseItem.id) || [];
                    return products.some(product => {
                        if (product.is_company_product) return false;
                        if (competitorCompany && (product.company_name || '') !== competitorCompany) return false;
                        if (competitorCategory && (product.category || '') !== competitorCategory) return false;
                        if (competitorSubCategory && (product.sub_category || '') !== competitorSubCategory) return false;
                        if (competitorProduct && String(product.product_id) !== competitorProduct && product.product_name !== competitorProduct) return false;
                        return true;
                    });
                });
            }

            // Calculate metrics for each selection
            const companyMetrics = computeCaseMetrics(companyCases, caseProductsMap);
            const competitorMetrics = computeCaseMetrics(competitorCases, caseProductsMap);

            // Calculate mixed cases between Row 1 and Row 2 selections specifically
            let mixedCaseCount = 0;
            if (hasCompanyFilters && hasCompetitorFilters) {
                // Mixed cases = cases that match BOTH Row 1 AND Row 2 selections
                mixedCaseCount = cases.filter(caseItem => {
                    const products = caseProductsMap.get(caseItem.id) || [];

                    // Check if case has products matching Row 1 (company) selection
                    const hasCompanyMatch = products.some(product => {
                        if (!product.is_company_product) return false;
                        if (companyCompany && (product.company_name || '') !== companyCompany) return false;
                        if (companyCategory && (product.category || '') !== companyCategory) return false;
                        if (companySubCategory && (product.sub_category || '') !== companySubCategory) return false;
                        if (companyProduct && String(product.product_id) !== companyProduct && product.product_name !== companyProduct) return false;
                        return true;
                    });

                    // Check if case has products matching Row 2 (competitor) selection
                    const hasCompetitorMatch = products.some(product => {
                        if (product.is_company_product) return false;
                        if (competitorCompany && (product.company_name || '') !== competitorCompany) return false;
                        if (competitorCategory && (product.category || '') !== competitorCategory) return false;
                        if (competitorSubCategory && (product.sub_category || '') !== competitorSubCategory) return false;
                        if (competitorProduct && String(product.product_id) !== competitorProduct && product.product_name !== competitorProduct) return false;
                        return true;
                    });

                    return hasCompanyMatch && hasCompetitorMatch;
                }).length;
            } else {
                // If only one row has filters, use general mixed calculation from filtered cases
                mixedCaseCount = computeCaseMetrics(cases, caseProductsMap).mixedCaseCount;
            }

            // Combine metrics
            metrics = {
                companyCaseCount: companyMetrics.companyCaseCount,
                companyUnits: companyMetrics.companyUnits,
                competitorCaseCount: competitorMetrics.competitorCaseCount,
                competitorUnits: competitorMetrics.competitorUnits,
                mixedCaseCount: mixedCaseCount,
                totalCaseCount: cases.length,
                activeDoctors: companyMetrics.activeDoctors,
                activeAccounts: companyMetrics.activeAccounts
            };
        } else {
            // No dual-row filters - use general filtered data
            metrics = computeCaseMetrics(cases, caseProductsMap);
        }
    }

    return metrics;
}

function renderDashboardStats(cases, caseProductsMap) {
    const container = document.getElementById('dashboard-stat-cards');
    if (!container) return;

    // Use the helper function to get metrics
    const metrics = getDualRowMetrics(cases, caseProductsMap);

    container.innerHTML = `
        <div class="stat-card">
            <h4>Company Cases</h4>
            <div class="value">${formatNumber(metrics.companyCaseCount)}</div>
        </div>
        <div class="stat-card">
            <h4>Competitor Cases</h4>
            <div class="value">${formatNumber(metrics.competitorCaseCount)}</div>
        </div>
        <div class="stat-card">
            <h4>Mixed Cases</h4>
            <div class="value">${formatNumber(metrics.mixedCaseCount)}</div>
        </div>
        <div class="stat-card">
            <h4>Total Cases</h4>
            <div class="value">${formatNumber(metrics.totalCaseCount)}</div>
        </div>
        <div class="stat-card">
            <h4>Company Units</h4>
            <div class="value">${formatNumber(metrics.companyUnits)}</div>
        </div>
        <div class="stat-card">
            <h4>Competitor Units</h4>
            <div class="value">${formatNumber(metrics.competitorUnits)}</div>
        </div>
        <div class="stat-card">
            <h4>Active Doctors</h4>
            <div class="value">${formatNumber(metrics.activeDoctors)}</div>
        </div>
        <div class="stat-card">
            <h4>Active Accounts</h4>
            <div class="value">${formatNumber(metrics.activeAccounts)}</div>
        </div>
    `;
}

function renderDashboardCharts(cases, caseProductsMap, caseProducts) {
    // Cases Analysis Section
    renderNumberOfCasesChart(cases, caseProductsMap);
    renderCasesMarketShareChart(cases, caseProductsMap);
    renderMonthlyTrendChart(cases, caseProductsMap);
    renderUPAvsPrivateCasesChart(cases);
    renderCasesByPSChart(cases);
    renderCasesByProductChart(cases, caseProductsMap);

    // Units Analysis Section
    renderUnitsMarketShareChart(cases, caseProductsMap);
    renderUnitsPerCategoryChart(caseProducts, cases, caseProductsMap);
    renderUnitsPerCompanyChart(cases, caseProductsMap);
    renderMonthlyUnitsTrendChart(cases, caseProductsMap);
    renderUnitsByPSChart(cases);
    renderUnitsByProductChart(caseProducts, cases, caseProductsMap);

    // Setup collapse button
    setupChartSectionToggle();
}

function renderCasesTrendChart(cases) {
    const canvas = document.getElementById('chartCasesTrend');
    if (!canvas) return;
    const monthly = aggregateCasesByMonth(cases);
    const labels = monthly.map((item) => item.label);
    const values = monthly.map((item) => item.value);

    destroyChart(state.charts.casesTrend);
    state.charts.casesTrend = buildLineChart(canvas, {
        labels,
        datasets: [
            {
                label: 'Cases',
                data: values,
                borderColor: '#22d3ee',
                backgroundColor: 'rgba(34, 211, 238, 0.25)',
                fill: true
            }
        ]
    });
}

function aggregateCasesByMonth(cases) {
    const map = new Map();
    cases.forEach((caseItem) => {
        const month = formatMonth(caseItem.case_date);
        map.set(month, (map.get(month) || 0) + 1);
    });
    return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
}

function renderUnitsSplitChart(cases) {
    const canvas = document.getElementById('chartUnitsSplit');
    if (!canvas) return;
    const company = cases.reduce((sum, caseItem) => sum + (caseItem.total_company_units || 0), 0);
    const competitor = cases.reduce((sum, caseItem) => sum + (caseItem.total_competitor_units || 0), 0);
    destroyChart(state.charts.unitsSplit);
    state.charts.unitsSplit = buildDoughnutChart(canvas, {
        labels: ['Company Units', 'Competitor Units'],
        data: [company, competitor],
        backgroundColor: ['rgba(99,102,241,0.9)', 'rgba(236,72,153,0.85)']
    });
}

function renderCasesByEmployeeChart(cases) {
    const canvas = document.getElementById('chartCasesByEmployee');
    if (!canvas) return;
    const map = new Map();
    cases.forEach((caseItem) => {
        map.set(caseItem.submitted_by_name, (map.get(caseItem.submitted_by_name) || 0) + 1);
    });
    const labels = Array.from(map.keys());
    const values = Array.from(map.values());
    destroyChart(state.charts.casesByEmployee);
    state.charts.casesByEmployee = buildBarChart(canvas, {
        labels,
        datasets: [
            {
                label: 'Cases',
                data: values,
                backgroundColor: 'rgba(14,165,233,0.8)'
            }
        ]
    });
}

function renderCasesSplitChart(cases, caseProductsMap) {
    const canvas = document.getElementById('chartCasesSplit');
    if (!canvas) return;
    let companyOnly = 0;
    let competitorOnly = 0;
    let mixed = 0;
    cases.forEach((caseItem) => {
        const products = caseProductsMap.get(caseItem.id) || [];
        const hasCompany = products.some((product) => product.is_company_product);
        const hasCompetitor = products.some((product) => !product.is_company_product);
        if (hasCompany && hasCompetitor) mixed += 1;
        else if (hasCompany) companyOnly += 1;
        else if (hasCompetitor) competitorOnly += 1;
    });
    destroyChart(state.charts.casesSplit);
    state.charts.casesSplit = buildBarChart(canvas, {
        labels: ['Company Only', 'Competitor Only', 'Mixed'],
        datasets: [
            {
                label: 'Cases',
                data: [companyOnly, competitorOnly, mixed],
                backgroundColor: ['rgba(99,102,241,0.85)', 'rgba(236,72,153,0.85)', 'rgba(45,212,191,0.8)']
            }
        ]
    });
}

function renderCompanyCasesByCategoryChart(cases, caseProductsMap) {
    const canvas = document.getElementById('chartCompanyCasesByCategory');
    if (!canvas) return;
    const map = new Map();
    cases.forEach((caseItem) => {
        const products = caseProductsMap.get(caseItem.id) || [];
        const categories = new Set(
            products.filter((product) => product.is_company_product).map((product) => product.category || 'Uncategorized')
        );
        categories.forEach((category) => {
            map.set(category, (map.get(category) || 0) + 1);
        });
    });
    const sorted = Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    const labels = sorted.map(([category]) => category);
    const values = sorted.map(([, count]) => count);
    destroyChart(state.charts.companyCasesByCategory);
    state.charts.companyCasesByCategory = buildBarChart(canvas, {
        labels,
        datasets: [
            {
                label: 'Company Cases',
                data: values,
                backgroundColor: 'rgba(129,140,248,0.85)'
            }
        ]
    });
}

function renderCompanyCasesByProductChart(cases, caseProductsMap) {
    const canvas = document.getElementById('chartCompanyCasesByProduct');
    if (!canvas) return;
    const map = new Map();
    cases.forEach((caseItem) => {
        const products = caseProductsMap.get(caseItem.id) || [];
        const companyProducts = new Set(
            products.filter((product) => product.is_company_product).map((product) => product.product_name || 'Unnamed Product')
        );
        companyProducts.forEach((productName) => {
            map.set(productName, (map.get(productName) || 0) + 1);
        });
    });
    const sorted = Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    const labels = sorted.map(([product]) => product);
    const values = sorted.map(([, count]) => count);
    destroyChart(state.charts.companyCasesByProduct);
    state.charts.companyCasesByProduct = buildBarChart(canvas, {
        labels,
        datasets: [
            {
                label: 'Company Cases',
                data: values,
                backgroundColor: 'rgba(251,191,36,0.85)'
            }
        ]
    });
}

function renderCasesByLineChart() {
    const canvas = document.getElementById('chartCasesByLine');
    if (!canvas) return;
    const map = new Map();
    state.cases.forEach((caseItem) => {
        const employee = state.employees.find((emp) => emp.id === caseItem.submitted_by_id);
        const lineName = employee?.line_name || caseItem.line_name || 'Unassigned';
        map.set(lineName, (map.get(lineName) || 0) + 1);
    });
    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    const labels = sorted.map(([line]) => line);
    const values = sorted.map(([, count]) => count);
    destroyChart(state.charts.casesByLine);
    state.charts.casesByLine = buildBarChart(canvas, {
        labels,
        datasets: [
            {
                label: 'Cases',
                data: values,
                backgroundColor: 'rgba(59,130,246,0.85)'
            }
        ]
    });
}

// NEW CHART RENDERING FUNCTIONS FOR REDESIGNED DASHBOARD

function renderNumberOfCasesChart(cases, caseProductsMap) {
    const canvas = document.getElementById('chartNumberOfCases');
    if (!canvas) return;

    // Use dual-row aware metrics calculation
    const metrics = getDualRowMetrics(cases, caseProductsMap);

    destroyChart(state.charts.numberOfCases);
    state.charts.numberOfCases = buildBarChart(canvas, {
        labels: ['Company', 'Competitor', 'Mixed'],
        datasets: [{
            label: 'Cases',
            data: [metrics.companyCaseCount, metrics.competitorCaseCount, metrics.mixedCaseCount],
            backgroundColor: ['rgba(99,102,241,0.85)', 'rgba(236,72,153,0.85)', 'rgba(45,212,191,0.8)']
        }]
    });
}

function renderCasesMarketShareChart(cases, caseProductsMap) {
    const canvas = document.getElementById('chartCasesMarketShare');
    if (!canvas) return;

    // Get dual-row aware case sets
    const { companyCases, competitorCases, hasCompanyFilters, hasCompetitorFilters } = getDualRowCaseSets(cases, caseProductsMap);

    // Calculate market share based on dual-row filters
    let labels, data;
    if (hasCompanyFilters && hasCompetitorFilters) {
        // Both rows have filters - show company cases vs competitor cases
        const companyCount = companyCases.length;
        const competitorCount = competitorCases.length;
        labels = ['Company', 'Competitor'];
        data = [companyCount, competitorCount];
    } else if (hasCompanyFilters) {
        // Only company row has filters - show company cases
        labels = ['Company'];
        data = [companyCases.length];
    } else if (hasCompetitorFilters) {
        // Only competitor row has filters - show competitor cases
        labels = ['Competitor'];
        data = [competitorCases.length];
    } else {
        // No dual-row filters - use standard calculation
        const result = calculateCasesMarketShare(cases, caseProductsMap);
        labels = result.labels;
        data = result.data;
    }

    const colors = [
        'rgba(99,102,241,0.9)',
        'rgba(236,72,153,0.9)',
        'rgba(34,197,94,0.9)',
        'rgba(251,191,36,0.9)',
        'rgba(14,165,233,0.9)',
        'rgba(168,85,247,0.9)',
        'rgba(236,72,153,0.9)',
        'rgba(59,130,246,0.9)',
        'rgba(16,185,129,0.9)',
        'rgba(245,158,11,0.9)',
        'rgba(107,114,128,0.9)'
    ];

    destroyChart(state.charts.casesMarketShare);
    state.charts.casesMarketShare = buildPieChart(canvas, {
        labels,
        data,
        backgroundColor: colors.slice(0, labels.length)
    });
}

function renderMonthlyTrendChart(cases, caseProductsMap) {
    const canvas = document.getElementById('chartMonthlyTrend');
    if (!canvas) return;

    // Get dual-row aware case sets
    const { companyCases, competitorCases } = getDualRowCaseSets(cases, caseProductsMap);

    // Aggregate company cases by month
    const companyMonthMap = new Map();
    companyCases.forEach(caseItem => {
        const month = formatMonth(caseItem.case_date);
        companyMonthMap.set(month, (companyMonthMap.get(month) || 0) + 1);
    });

    // Aggregate competitor cases by month
    const competitorMonthMap = new Map();
    competitorCases.forEach(caseItem => {
        const month = formatMonth(caseItem.case_date);
        competitorMonthMap.set(month, (competitorMonthMap.get(month) || 0) + 1);
    });

    // Get all unique months and sort chronologically (earliest to latest)
    const allMonths = new Set([...companyMonthMap.keys(), ...competitorMonthMap.keys()]);
    const labels = Array.from(allMonths).sort((a, b) => {
        // Parse dates from formatted strings like "Jul 2025"
        const dateA = new Date(a);
        const dateB = new Date(b);
        return dateA - dateB;
    });
    const companyData = labels.map(month => companyMonthMap.get(month) || 0);
    const competitorData = labels.map(month => competitorMonthMap.get(month) || 0);

    destroyChart(state.charts.monthlyTrend);
    state.charts.monthlyTrend = buildLineChart(canvas, {
        labels,
        datasets: [
            {
                label: 'Company Cases',
                data: companyData,
                borderColor: '#22d3ee',
                backgroundColor: 'rgba(34, 211, 238, 0.25)',
                fill: true
            },
            {
                label: 'Competitor Cases',
                data: competitorData,
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.25)',
                fill: true
            }
        ]
    });
}

function renderUPAvsPrivateCasesChart(cases) {
    const canvas = document.getElementById('chartUPAvsPrivate');
    if (!canvas) return;

    const { labels, data } = calculateUPAvsPrivateCases(cases);

    destroyChart(state.charts.upaVsPrivate);
    state.charts.upaVsPrivate = buildPieChart(canvas, {
        labels,
        data,
        backgroundColor: ['rgba(99,102,241,0.9)', 'rgba(236,72,153,0.9)', 'rgba(34,197,94,0.9)']
    });
}

function renderCasesByPSChart(cases) {
    const canvas = document.getElementById('chartCasesByPS');
    if (!canvas) return;

    const { labels, data } = calculateCasesByProductSpecialist(cases);

    destroyChart(state.charts.casesByPS);
    state.charts.casesByPS = buildBarChart(canvas, {
        labels,
        datasets: [{
            label: 'Cases',
            data,
            backgroundColor: 'rgba(14,165,233,0.8)'
        }]
    });
}

function renderCasesByProductChart(cases, caseProductsMap) {
    const canvas = document.getElementById('chartCasesByProduct');
    if (!canvas) return;

    // Get dual-row aware case sets
    const { companyCases, competitorCases, hasCompanyFilters, hasCompetitorFilters } = getDualRowCaseSets(cases, caseProductsMap);

    // Use filtered cases if dual-row filters are active
    let filteredCases = cases;
    if (hasCompanyFilters || hasCompetitorFilters) {
        // Combine company and competitor cases (union)
        const caseIds = new Set([...companyCases.map(c => c.id), ...competitorCases.map(c => c.id)]);
        filteredCases = cases.filter(c => caseIds.has(c.id));
    }

    const { labels, data } = calculateCasesByProduct(filteredCases, caseProductsMap);

    destroyChart(state.charts.casesByProduct);
    state.charts.casesByProduct = buildBarChart(canvas, {
        labels,
        datasets: [{
            label: 'Cases',
            data,
            backgroundColor: 'rgba(251,191,36,0.85)'
        }]
    });
}

function renderUnitsMarketShareChart(cases, caseProductsMap) {
    const canvas = document.getElementById('chartUnitsMarketShare');
    if (!canvas) return;

    // Get dual-row aware case sets
    const { companyCases, competitorCases, hasCompanyFilters, hasCompetitorFilters } = getDualRowCaseSets(cases, caseProductsMap);

    // Calculate market share based on dual-row filters
    let labels, data;
    if (hasCompanyFilters && hasCompetitorFilters) {
        // Both rows have filters - show company units vs competitor units
        const companyUnits = companyCases.reduce((sum, c) => sum + (c.total_company_units || 0), 0);
        const competitorUnits = competitorCases.reduce((sum, c) => sum + (c.total_competitor_units || 0), 0);
        labels = ['Company', 'Competitor'];
        data = [companyUnits, competitorUnits];
    } else if (hasCompanyFilters) {
        // Only company row has filters - show company units
        const companyUnits = companyCases.reduce((sum, c) => sum + (c.total_company_units || 0), 0);
        labels = ['Company'];
        data = [companyUnits];
    } else if (hasCompetitorFilters) {
        // Only competitor row has filters - show competitor units
        const competitorUnits = competitorCases.reduce((sum, c) => sum + (c.total_competitor_units || 0), 0);
        labels = ['Competitor'];
        data = [competitorUnits];
    } else {
        // No dual-row filters - use standard calculation
        const result = calculateUnitsMarketShare(cases, caseProductsMap);
        labels = result.labels;
        data = result.data;
    }

    const colors = [
        'rgba(99,102,241,0.9)',
        'rgba(236,72,153,0.9)',
        'rgba(34,197,94,0.9)',
        'rgba(251,191,36,0.9)',
        'rgba(14,165,233,0.9)',
        'rgba(168,85,247,0.9)',
        'rgba(236,72,153,0.9)',
        'rgba(59,130,246,0.9)',
        'rgba(16,185,129,0.9)',
        'rgba(245,158,11,0.9)',
        'rgba(107,114,128,0.9)'
    ];

    destroyChart(state.charts.unitsMarketShare);
    state.charts.unitsMarketShare = buildPieChart(canvas, {
        labels,
        data,
        backgroundColor: colors.slice(0, labels.length)
    });
}

function renderUnitsPerCategoryChart(caseProducts, cases, caseProductsMap) {
    const canvas = document.getElementById('chartUnitsPerCategory');
    if (!canvas) return;

    // Get dual-row filter values to filter products
    const companyCompany = document.getElementById('dashboard-filter-company-company')?.value || '';
    const companyCategory = document.getElementById('dashboard-filter-company-category')?.value || '';
    const companySubCategory = document.getElementById('dashboard-filter-company-sub-category')?.value || '';
    const companyProduct = document.getElementById('dashboard-filter-company-product')?.value || '';

    const competitorCompany = document.getElementById('dashboard-filter-competitor-company')?.value || '';
    const competitorCategory = document.getElementById('dashboard-filter-competitor-category')?.value || '';
    const competitorSubCategory = document.getElementById('dashboard-filter-competitor-sub-category')?.value || '';
    const competitorProduct = document.getElementById('dashboard-filter-competitor-product')?.value || '';

    const hasCompanyFilters = companyCompany || companyCategory || companySubCategory || companyProduct;
    const hasCompetitorFilters = competitorCompany || competitorCategory || competitorSubCategory || competitorProduct;

    // Filter products based on dual-row selections
    let filteredProducts = caseProducts;
    if (hasCompanyFilters || hasCompetitorFilters) {
        // Get case IDs that match the filters
        const { companyCases, competitorCases } = getDualRowCaseSets(cases, caseProductsMap);
        const validCaseIds = new Set([...companyCases.map(c => c.id), ...competitorCases.map(c => c.id)]);

        // Filter products to only those in valid cases
        filteredProducts = caseProducts.filter(p => validCaseIds.has(p.case_id));
    }

    const { labels, data } = calculateUnitsPerCategory(filteredProducts);

    destroyChart(state.charts.unitsPerCategory);
    state.charts.unitsPerCategory = buildBarChart(canvas, {
        labels,
        datasets: [{
            label: 'Units',
            data,
            backgroundColor: 'rgba(34,197,94,0.8)'
        }]
    });
}

function renderUnitsPerCompanyChart(cases, caseProductsMap) {
    const canvas = document.getElementById('chartUnitsPerCompany');
    if (!canvas) return;

    // Get dual-row aware case sets
    const { companyCases, competitorCases, hasCompanyFilters, hasCompetitorFilters } = getDualRowCaseSets(cases, caseProductsMap);

    // Use filtered cases if dual-row filters are active
    let filteredCases = cases;
    if (hasCompanyFilters || hasCompetitorFilters) {
        // Combine company and competitor cases (union)
        const caseIds = new Set([...companyCases.map(c => c.id), ...competitorCases.map(c => c.id)]);
        filteredCases = cases.filter(c => caseIds.has(c.id));
    }

    const { labels, datasets } = calculateUnitsPerCompanyStacked(filteredCases, caseProductsMap);

    destroyChart(state.charts.unitsPerCompany);
    state.charts.unitsPerCompany = buildBarChart(canvas, {
        labels,
        datasets,
        stacked: true,
        options: {
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

function renderMonthlyUnitsTrendChart(cases, caseProductsMap) {
    const canvas = document.getElementById('chartMonthlyUnitsTrend');
    if (!canvas) return;

    // Get dual-row aware case sets
    const { companyCases, competitorCases } = getDualRowCaseSets(cases, caseProductsMap);

    // Aggregate company units by month
    const companyMonthMap = new Map();
    companyCases.forEach(caseItem => {
        const month = formatMonth(caseItem.case_date);
        companyMonthMap.set(month, (companyMonthMap.get(month) || 0) + (caseItem.total_company_units || 0));
    });

    // Aggregate competitor units by month
    const competitorMonthMap = new Map();
    competitorCases.forEach(caseItem => {
        const month = formatMonth(caseItem.case_date);
        competitorMonthMap.set(month, (competitorMonthMap.get(month) || 0) + (caseItem.total_competitor_units || 0));
    });

    // Get all unique months and sort chronologically (earliest to latest)
    const allMonths = new Set([...companyMonthMap.keys(), ...competitorMonthMap.keys()]);
    const labels = Array.from(allMonths).sort((a, b) => {
        // Parse dates from formatted strings like "Jul 2025"
        const dateA = new Date(a);
        const dateB = new Date(b);
        return dateA - dateB;
    });
    const companyData = labels.map(month => companyMonthMap.get(month) || 0);
    const competitorData = labels.map(month => competitorMonthMap.get(month) || 0);

    destroyChart(state.charts.monthlyUnitsTrend);
    state.charts.monthlyUnitsTrend = buildLineChart(canvas, {
        labels,
        datasets: [
            {
                label: 'Company Units',
                data: companyData,
                borderColor: '#22d3ee',
                backgroundColor: 'rgba(34, 211, 238, 0.25)',
                fill: true
            },
            {
                label: 'Competitor Units',
                data: competitorData,
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.25)',
                fill: true
            }
        ]
    });
}

function renderUnitsByPSChart(cases) {
    const canvas = document.getElementById('chartUnitsPerPS');
    if (!canvas) return;

    const { labels, data } = calculateUnitsByProductSpecialist(cases);

    destroyChart(state.charts.unitsByPS);
    state.charts.unitsByPS = buildBarChart(canvas, {
        labels,
        datasets: [{
            label: 'Units',
            data,
            backgroundColor: 'rgba(168,85,247,0.8)'
        }]
    });
}

function renderUnitsByProductChart(caseProducts, cases, caseProductsMap) {
    const canvas = document.getElementById('chartUnitsPerProduct');
    if (!canvas) return;

    // Get dual-row filter values to filter products
    const companyCompany = document.getElementById('dashboard-filter-company-company')?.value || '';
    const companyCategory = document.getElementById('dashboard-filter-company-category')?.value || '';
    const companySubCategory = document.getElementById('dashboard-filter-company-sub-category')?.value || '';
    const companyProduct = document.getElementById('dashboard-filter-company-product')?.value || '';

    const competitorCompany = document.getElementById('dashboard-filter-competitor-company')?.value || '';
    const competitorCategory = document.getElementById('dashboard-filter-competitor-category')?.value || '';
    const competitorSubCategory = document.getElementById('dashboard-filter-competitor-sub-category')?.value || '';
    const competitorProduct = document.getElementById('dashboard-filter-competitor-product')?.value || '';

    const hasCompanyFilters = companyCompany || companyCategory || companySubCategory || companyProduct;
    const hasCompetitorFilters = competitorCompany || competitorCategory || competitorSubCategory || competitorProduct;

    // Filter products based on dual-row selections
    let filteredProducts = caseProducts;
    if (hasCompanyFilters || hasCompetitorFilters) {
        // Get case IDs that match the filters
        const { companyCases, competitorCases } = getDualRowCaseSets(cases, caseProductsMap);
        const validCaseIds = new Set([...companyCases.map(c => c.id), ...competitorCases.map(c => c.id)]);

        // Filter products to only those in valid cases
        filteredProducts = caseProducts.filter(p => validCaseIds.has(p.case_id));
    }

    const { labels, data } = calculateUnitsByProduct(filteredProducts);

    destroyChart(state.charts.unitsByProduct);
    state.charts.unitsByProduct = buildBarChart(canvas, {
        labels,
        datasets: [{
            label: 'Units',
            data,
            backgroundColor: 'rgba(34,197,94,0.8)'
        }]
    });
}

function setupChartSectionToggle() {
    const toggleBtn = document.getElementById('toggleUnitsSection');
    if (!toggleBtn) {
        console.warn('Toggle button not found');
        return;
    }

    // Find the Cases Analysis section (the first .chart-section before the button)
    const casesSection = toggleBtn.parentElement?.previousElementSibling;
    if (!casesSection || !casesSection.classList.contains('chart-section')) {
        console.warn('Cases section not found or invalid structure');
        return;
    }

    // Remove any existing listeners to prevent duplicates
    const newToggleBtn = toggleBtn.cloneNode(true);
    toggleBtn.parentElement.replaceChild(newToggleBtn, toggleBtn);

    newToggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const isCollapsed = casesSection.classList.contains('collapsed');

        if (isCollapsed) {
            // Expand
            casesSection.classList.remove('collapsed');
            newToggleBtn.classList.remove('collapsed');
            newToggleBtn.setAttribute('data-collapsed', 'false');
            newToggleBtn.innerHTML = '<i class="bi bi-chevron-up me-2"></i>Collapse Cases Analysis';
        } else {
            // Collapse
            casesSection.classList.add('collapsed');
            newToggleBtn.classList.add('collapsed');
            newToggleBtn.setAttribute('data-collapsed', 'true');
            newToggleBtn.innerHTML = '<i class="bi bi-chevron-down me-2"></i>Expand Cases Analysis';
        }
    });
}

function ensureDatalistElement(id) {
    let element = document.getElementById(id);
    if (!element) {
        element = document.createElement('datalist');
        element.id = id;
        document.body.appendChild(element);
    }
    return element;
}

function refreshSharedDatalists() {
    const lineList = ensureDatalistElement('lines-list');
    lineList.innerHTML = state.lines
        .map((line) => `<option value="${line.name}"></option>`)
        .join('');

    const companyList = ensureDatalistElement('company-list');
    companyList.innerHTML = state.companies
        .map((company) => `<option value="${company.name}"></option>`)
        .join('');
}

function attachProductSpecialistToggle(table, { lineField, toggleFields = [], storageKey = '' } = {}) {
    if (!table || !table.getColumn || !lineField || !toggleFields.length) return;
    if (table._psToggleInitialized?.[lineField]) return;

    const initialize = () => {
        const lineColumn = table.getColumn(lineField);
        if (!lineColumn || !lineColumn.getElement) return;
        const headerEl = lineColumn.getElement();
        const titleEl = headerEl?.querySelector('.tabulator-col-title');
        if (!titleEl || titleEl.querySelector('.ps-toggle-btn')) return;

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'btn btn-sm btn-outline-ghost ps-toggle-btn';
        toggleBtn.textContent = '+';
        toggleBtn.setAttribute('aria-expanded', 'false');
        toggleBtn.setAttribute('aria-label', 'Show additional product specialist columns');
        toggleBtn.style.marginLeft = '0.5rem';

        titleEl.classList.add('ps-toggle-title');
        titleEl.appendChild(toggleBtn);

        const getStoredState = () => {
            if (!storageKey || !window.localStorage) return null;
            try {
                return window.localStorage.getItem(storageKey);
            } catch (error) {
                console.warn('Unable to read column toggle state', error);
                return null;
            }
        };

        const setStoredState = (expanded) => {
            if (!storageKey || !window.localStorage) return;
            try {
                window.localStorage.setItem(storageKey, expanded ? '1' : '0');
            } catch (error) {
                console.warn('Unable to persist column toggle state', error);
            }
        };

        const applyState = (expanded) => {
            toggleFields.forEach((field) => {
                const column = table.getColumn(field);
                if (!column) return;
                if (expanded) {
                    column.show();
                } else {
                    column.hide();
                }
            });
            toggleBtn.textContent = expanded ? '−' : '+';
            toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            toggleBtn.setAttribute(
                'aria-label',
                expanded ? 'Hide additional product specialist columns' : 'Show additional product specialist columns'
            );
            setStoredState(expanded);
        };

        const stored = getStoredState();
        let expanded =
            stored !== null
                ? stored === '1'
                : toggleFields.some((field) => {
                      const column = table.getColumn(field);
                      return column?.isVisible?.();
                  });

        applyState(expanded);

        toggleBtn.addEventListener('click', () => {
            expanded = !expanded;
            applyState(expanded);
        });

        table._psToggleInitialized = {
            ...(table._psToggleInitialized || {}),
            [lineField]: true
        };
    };

    if (!table.getColumn(lineField)) {
        table.on('tableBuilt', () => {
            if (table._psToggleInitialized?.[lineField]) return;
            initialize();
        });
        return;
    }

    initialize();
}

// ============================================================================
// BULK UPLOAD & TEMPLATE DOWNLOAD FUNCTIONS
// ============================================================================

function openBulkImportModal(type, config) {
    const modal = new bootstrap.Modal(document.getElementById('bulkImportModal'));
    const modalTitle = document.getElementById('bulkImportModalLabel');
    const modalDescription = document.getElementById('import-modal-description');
    const downloadBtn = document.getElementById('import-modal-download-btn');
    const fileInput = document.getElementById('import-modal-file-input');
    const uploadBtn = document.getElementById('import-modal-upload-btn');

    // Set modal content
    modalTitle.textContent = config.title;
    modalDescription.textContent = config.description;

    // Clear previous file selection
    fileInput.value = '';

    // Remove old event listeners by cloning and replacing
    const newDownloadBtn = downloadBtn.cloneNode(true);
    downloadBtn.parentNode.replaceChild(newDownloadBtn, downloadBtn);
    const newUploadBtn = uploadBtn.cloneNode(true);
    uploadBtn.parentNode.replaceChild(newUploadBtn, uploadBtn);

    // Add download template handler
    newDownloadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        config.downloadTemplate();
    });

    // Add upload handler
    newUploadBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const file = fileInput.files[0];
        if (!file) {
            alert('Please select a file first.');
            return;
        }

        // Disable button during upload
        newUploadBtn.disabled = true;
        newUploadBtn.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Uploading...';

        try {
            const result = await config.processUpload(file);
            modal.hide();
            alert(result.message);
        } catch (error) {
            alert(`Upload failed: ${handleError(error)}`);
        } finally {
            newUploadBtn.disabled = false;
            newUploadBtn.innerHTML = '<i class="bi bi-upload me-2"></i>Upload & Import';
        }
    });

    modal.show();
}

function downloadProductTemplate() {
    const template = [
        {
            'Product Name': 'Example Product 1',
            'Category': 'Catheters',
            'Sub Category': 'Diagnostic',
            'Company': 'Medtronic',
            'Line': 'Vascular'
        },
        {
            'Product Name': 'Example Product 2',
            'Category': 'Wires',
            'Sub Category': '',
            'Company': 'Boston Scientific',
            'Line': 'Cardiac'
        }
    ];
    downloadAsExcel('Product_Upload_Template', template, {
        'Product Name': 'Product Name',
        'Category': 'Category',
        'Sub Category': 'Sub Category',
        'Company': 'Company',
        'Line': 'Line'
    });
}

function downloadDoctorTemplate() {
    const template = [
        {
            'Doctor Name': 'Dr. John Smith',
            'Product Specialist Name': 'Ahmed Ali',
            'Line': 'Vascular',
            'Product Specialist 2 Name': '',
            'PS 2 Line': '',
            'Product Specialist 3 Name': '',
            'PS 3 Line': '',
            'Product Specialist 4 Name': '',
            'PS 4 Line': '',
            'Product Specialist 5 Name': '',
            'PS 5 Line': '',
            'Specialty': 'Cardiology',
            'Phone': '01234567890',
            'Email Address': 'doctor@hospital.com'
        }
    ];
    downloadAsExcel('Doctor_Upload_Template', template, {
        'Doctor Name': 'Doctor Name',
        'Product Specialist Name': 'Product Specialist Name',
        'Line': 'Line',
        'Product Specialist 2 Name': 'Product Specialist 2 Name',
        'PS 2 Line': 'PS 2 Line',
        'Product Specialist 3 Name': 'Product Specialist 3 Name',
        'PS 3 Line': 'PS 3 Line',
        'Product Specialist 4 Name': 'Product Specialist 4 Name',
        'PS 4 Line': 'PS 4 Line',
        'Product Specialist 5 Name': 'Product Specialist 5 Name',
        'PS 5 Line': 'PS 5 Line',
        'Specialty': 'Specialty',
        'Phone': 'Phone',
        'Email Address': 'Email Address'
    });
}

function downloadAccountTemplate() {
    const template = [
        {
            'Account Name': 'Cairo Hospital',
            'Product Specialist Name': 'Ahmed Ali',
            'Line': 'Vascular',
            'Account Type': 'Private',
            'Product Specialist 2 Name': '',
            'PS 2 Line': '',
            'Product Specialist 3 Name': '',
            'PS 3 Line': '',
            'Address': '123 Main Street',
            'Governorate': 'Cairo'
        }
    ];
    downloadAsExcel('Account_Upload_Template', template, {
        'Account Name': 'Account Name',
        'Product Specialist Name': 'Product Specialist Name',
        'Line': 'Line',
        'Account Type': 'Account Type',
        'Product Specialist 2 Name': 'Product Specialist 2 Name',
        'PS 2 Line': 'PS 2 Line',
        'Product Specialist 3 Name': 'Product Specialist 3 Name',
        'PS 3 Line': 'PS 3 Line',
        'Address': 'Address',
        'Governorate': 'Governorate'
    });
}

function setupProductBulkUpload() {
    const importButton = document.getElementById('import-products-btn');
    if (!importButton) return;

    importButton.addEventListener('click', (event) => {
        event.preventDefault();
        openBulkImportModal('product', {
            title: 'Bulk Import Products',
            description: 'Import multiple products at once. Required: Product Name, Category, Company, Line. Optional: Sub Category.',
            downloadTemplate: downloadProductTemplate,
            processUpload: processProductUpload
        });
    });
}

async function processProductUpload(file) {
    try {
        const rows = await readExcelFile(file);
        const failures = [];
        let successCount = 0;

        for (const row of rows) {
            const productName = (row['Product Name'] || '').trim();
            const category = (row['Category'] || '').trim();
            const subCategory = (row['Sub Category'] || '').trim();
            const companyName = (row['Company'] || '').trim();
            const lineName = (row['Line'] || '').trim();

            // Validate required fields
            if (!productName || !category || !companyName || !lineName) {
                failures.push({ row, reason: 'Missing required fields (Product Name, Category, Company, Line)' });
                continue;
            }

            try {
                // Ensure company exists
                const companyId = await ensureCompany(companyName);
                if (!companyId) {
                    failures.push({ row, reason: `Failed to create/find company: ${companyName}` });
                    continue;
                }

                // Ensure line exists
                const lineId = await ensureLine(lineName);
                if (!lineId) {
                    failures.push({ row, reason: `Failed to create/find line: ${lineName}` });
                    continue;
                }

                // Check if company is marked as company product
                const company = state.companies.find(c => c.id === companyId);
                const isCompanyProduct = company ? company.is_company : false;

                // Insert product
                await handleSupabase(
                    supabase
                        .from('products')
                        .insert({
                            name: productName,
                            category: category,
                            sub_category: subCategory || null,
                            company_id: companyId,
                            line_id: lineId,
                            is_company_product: isCompanyProduct,
                            created_by: state.session.employeeId
                        }),
                    'bulk insert product'
                );
                successCount++;
            } catch (err) {
                failures.push({ row, reason: `Error: ${err.message}` });
            }
        }

        await loadProducts();
        renderProductsSection({ refreshFilters: true });

        if (failures.length > 0) {
            return { success: false, message: `Upload completed: ${successCount} products uploaded successfully, ${failures.length} rows skipped.\n\nFirst few errors:\n${failures.slice(0, 3).map(f => f.reason).join('\n')}` };
        } else {
            return { success: true, message: `✓ All ${successCount} products uploaded successfully!` };
        }
    } catch (error) {
        return { success: false, message: `Upload failed: ${handleError(error)}` };
    }
}

function setupDoctorBulkUpload() {
    const importButton = document.getElementById('import-doctors-btn');
    if (!importButton) return;

    importButton.addEventListener('click', (event) => {
        event.preventDefault();
        openBulkImportModal('doctor', {
            title: 'Bulk Import Doctors',
            description: 'Import/Update doctors. NEW doctors require: Doctor Name, Product Specialist Name, Line. UPDATES require only: Doctor Name + fields to update (Phone, Email, etc.). System auto-detects existing doctors.',
            downloadTemplate: downloadDoctorTemplate,
            processUpload: processDoctorUpload
        });
    });
}

async function processDoctorUpload(file) {
    try {
        const rows = await readExcelFile(file);
        const failures = [];
        let insertCount = 0;
        let updateCount = 0;

        for (const row of rows) {
            const name = (row['Doctor Name'] || '').trim();

            // Doctor name is always required
            if (!name) {
                failures.push({ row, reason: 'Missing required field: Doctor Name' });
                continue;
            }

            try {
                // Check if doctor already exists (case-insensitive)
                const existingDoctor = await handleSupabase(
                    supabase
                        .from('doctors')
                        .select('id, name')
                        .ilike('name', name)
                        .single(),
                    'check existing doctor',
                    { suppressError: true }
                );

                const isUpdate = !!existingDoctor;

                // For NEW doctors: PS Name and Line are required
                // For UPDATES: PS Name and Line are optional (will keep existing if not provided)
                const specialistName = (row['Product Specialist Name'] || '').trim();
                const lineName = (row['Line'] || '').trim();

                if (!isUpdate && (!specialistName || !lineName)) {
                    failures.push({ row, reason: 'New doctor requires: Product Specialist Name and Line' });
                    continue;
                }

                // Build update object with only provided fields
                const updateData = {};

                // Handle primary specialist and line (only if provided)
                if (specialistName) {
                    const specialist = state.employees.find((emp) => emp.full_name?.toLowerCase() === specialistName.toLowerCase());
                    if (!specialist) {
                        failures.push({ row, reason: `Product Specialist not found: ${specialistName}` });
                        continue;
                    }
                    updateData.owner_employee_id = specialist.id;

                    if (lineName) {
                        updateData.line_id = await ensureLine(lineName);
                    }
                }

                // Process secondary specialist (PS 2)
                const specialist2Name = (row['Product Specialist 2 Name'] || '').trim();
                const line2Name = (row['PS 2 Line'] || '').trim();
                if (specialist2Name) {
                    const specialist2 = state.employees.find((emp) => emp.full_name?.toLowerCase() === specialist2Name.toLowerCase());
                    if (specialist2) {
                        updateData.secondary_employee_id = specialist2.id;
                        updateData.secondary_line_id = line2Name ? await ensureLine(line2Name) : specialist2.line_id;
                    }
                }

                // Process tertiary specialist (PS 3)
                const specialist3Name = (row['Product Specialist 3 Name'] || '').trim();
                const line3Name = (row['PS 3 Line'] || '').trim();
                if (specialist3Name) {
                    const specialist3 = state.employees.find((emp) => emp.full_name?.toLowerCase() === specialist3Name.toLowerCase());
                    if (specialist3) {
                        updateData.tertiary_employee_id = specialist3.id;
                        updateData.tertiary_line_id = line3Name ? await ensureLine(line3Name) : specialist3.line_id;
                    }
                }

                // Process quaternary specialist (PS 4)
                const specialist4Name = (row['Product Specialist 4 Name'] || '').trim();
                const line4Name = (row['PS 4 Line'] || '').trim();
                if (specialist4Name) {
                    const specialist4 = state.employees.find((emp) => emp.full_name?.toLowerCase() === specialist4Name.toLowerCase());
                    if (specialist4) {
                        updateData.quaternary_employee_id = specialist4.id;
                        updateData.quaternary_line_id = line4Name ? await ensureLine(line4Name) : specialist4.line_id;
                    }
                }

                // Process quinary specialist (PS 5)
                const specialist5Name = (row['Product Specialist 5 Name'] || '').trim();
                const line5Name = (row['PS 5 Line'] || '').trim();
                if (specialist5Name) {
                    const specialist5 = state.employees.find((emp) => emp.full_name?.toLowerCase() === specialist5Name.toLowerCase());
                    if (specialist5) {
                        updateData.quinary_employee_id = specialist5.id;
                        updateData.quinary_line_id = line5Name ? await ensureLine(line5Name) : specialist5.line_id;
                    }
                }

                // Handle optional fields (only update if provided)
                const specialty = (row['Specialty'] || '').trim();
                const phone = (row['Phone'] || '').trim();
                const email = (row['Email Address'] || '').trim();

                if (specialty) updateData.specialty = specialty;
                if (phone) updateData.phone = phone;
                if (email) updateData.email_address = email;

                if (isUpdate) {
                    // UPDATE existing doctor
                    updateData.updated_at = new Date().toISOString();

                    await handleSupabase(
                        supabase
                            .from('doctors')
                            .update(updateData)
                            .eq('id', existingDoctor.id),
                        'bulk update doctor'
                    );
                    updateCount++;
                } else {
                    // INSERT new doctor
                    await handleSupabase(
                        supabase
                            .from('doctors')
                            .insert({
                                name,
                                ...updateData,
                                status: APPROVAL_STATUS.APPROVED,
                                admin_id: state.session.employeeId,
                                created_by: state.session.employeeId,
                                approved_at: new Date().toISOString()
                            }),
                        'bulk insert doctor'
                    );
                    insertCount++;
                }
            } catch (err) {
                failures.push({ row, reason: `Error: ${err.message}` });
            }
        }

        await loadDoctors();
        renderDoctorsSection({ refreshFilters: true });

        const successCount = insertCount + updateCount;
        let message = '';

        if (insertCount > 0 && updateCount > 0) {
            message = `✓ ${insertCount} doctors added, ${updateCount} doctors updated`;
        } else if (insertCount > 0) {
            message = `✓ ${insertCount} doctors added`;
        } else if (updateCount > 0) {
            message = `✓ ${updateCount} doctors updated`;
        }

        if (failures.length > 0) {
            return { success: false, message: `Upload completed: ${message}. ${failures.length} rows skipped.\n\nFirst few errors:\n${failures.slice(0, 3).map(f => f.reason).join('\n')}` };
        } else {
            return { success: true, message: `${message} successfully!` };
        }
    } catch (error) {
        return { success: false, message: `Upload failed: ${handleError(error)}` };
    }
}

function setupAccountBulkUpload() {
    const importButton = document.getElementById('import-accounts-btn');
    if (!importButton) return;

    importButton.addEventListener('click', (event) => {
        event.preventDefault();
        openBulkImportModal('account', {
            title: 'Bulk Import Accounts',
            description: 'Import multiple accounts at once. Required: Account Name, Product Specialist Name, Line, Account Type (Private/UPA/Military). Optional: PS 2-3 Names/Lines, Address, Governorate.',
            downloadTemplate: downloadAccountTemplate,
            processUpload: processAccountUpload
        });
    });
}

async function processAccountUpload(file) {
    try {
        const rows = await readExcelFile(file);
        const failures = [];
        let successCount = 0;

        for (const row of rows) {
            const name = (row['Account Name'] || '').trim();
            const specialistName = (row['Product Specialist Name'] || '').trim();
            const accountType = (row['Account Type'] || '').trim();
            const lineName = (row['Line'] || '').trim();

            // Validate required fields
            if (!name || !specialistName || !accountType || !lineName) {
                failures.push({ row, reason: 'Missing required fields (Account Name, Product Specialist Name, Account Type, Line)' });
                continue;
            }

            try {
                // Find primary specialist
                const specialist = state.employees.find((emp) => emp.full_name?.toLowerCase() === specialistName.toLowerCase());
                if (!specialist) {
                    failures.push({ row, reason: `Product Specialist not found: ${specialistName}` });
                    continue;
                }

                // Validate account type
                if (!ACCOUNT_TYPES.includes(accountType)) {
                    failures.push({ row, reason: `Invalid account type: ${accountType}. Must be one of: ${ACCOUNT_TYPES.join(', ')}` });
                    continue;
                }

                // Ensure primary line
                const lineId = await ensureLine(lineName);

                // Process secondary specialist (PS 2)
                const specialist2Name = (row['Product Specialist 2 Name'] || '').trim();
                const line2Name = (row['PS 2 Line'] || '').trim();
                let specialist2Id = null;
                let line2Id = null;
                if (specialist2Name) {
                    const specialist2 = state.employees.find((emp) => emp.full_name?.toLowerCase() === specialist2Name.toLowerCase());
                    if (specialist2) {
                        specialist2Id = specialist2.id;
                        line2Id = line2Name ? await ensureLine(line2Name) : specialist2.line_id;
                    }
                }

                // Process tertiary specialist (PS 3)
                const specialist3Name = (row['Product Specialist 3 Name'] || '').trim();
                const line3Name = (row['PS 3 Line'] || '').trim();
                let specialist3Id = null;
                let line3Id = null;
                if (specialist3Name) {
                    const specialist3 = state.employees.find((emp) => emp.full_name?.toLowerCase() === specialist3Name.toLowerCase());
                    if (specialist3) {
                        specialist3Id = specialist3.id;
                        line3Id = line3Name ? await ensureLine(line3Name) : specialist3.line_id;
                    }
                }

                // Insert account with all specialists
                await handleSupabase(
                    supabase
                        .from('accounts')
                        .insert({
                            name,
                            owner_employee_id: specialist.id,
                            account_type: accountType,
                            line_id: lineId,
                            secondary_employee_id: specialist2Id,
                            secondary_line_id: line2Id,
                            tertiary_employee_id: specialist3Id,
                            tertiary_line_id: line3Id,
                            address: (row['Address'] || '').trim() || null,
                            governorate: (row['Governorate'] || '').trim() || null,
                            status: APPROVAL_STATUS.APPROVED,
                            admin_id: state.session.employeeId,
                            created_by: state.session.employeeId,
                            approved_at: new Date().toISOString()
                        }),
                    'bulk insert account'
                );
                successCount++;
            } catch (err) {
                failures.push({ row, reason: `Error: ${err.message}` });
            }
        }

        await loadAccounts();
        renderAccountsSection({ refreshFilters: true });

        if (failures.length > 0) {
            return { success: false, message: `Upload completed: ${successCount} accounts uploaded successfully, ${failures.length} rows skipped.\n\nFirst few errors:\n${failures.slice(0, 3).map(f => f.reason).join('\n')}` };
        } else {
            return { success: true, message: `✓ All ${successCount} accounts uploaded successfully!` };
        }
    } catch (error) {
        return { success: false, message: `Upload failed: ${handleError(error)}` };
    }
}
function setupExportButtons() {
    document.getElementById('export-products')?.addEventListener('click', (event) => {
        event.preventDefault();
        downloadAsExcel('mts_products', state.products, {
            name: 'Product',
            category: 'Category',
            company_name: 'Company',
            line_name: 'Line',
            is_company_product: 'Is Company Product'
        });
    });

    document.getElementById('export-doctors')?.addEventListener('click', (event) => {
        event.preventDefault();
        downloadAsExcel('mts_doctors', state.doctors, {
            name: 'Doctor',
            owner_name: 'Product Specialist',
            secondary_owner_name: 'Product Specialist 2',
            tertiary_owner_name: 'Product Specialist 3',
            quaternary_owner_name: 'Product Specialist 4',
            quinary_owner_name: 'Product Specialist 5',
            line_name: 'Line',
            secondary_line_name: 'PS 2 Line',
            tertiary_line_name: 'PS 3 Line',
            quaternary_line_name: 'PS 4 Line',
            quinary_line_name: 'PS 5 Line',
            specialty: 'Specialty',
            phone: 'Phone',
            email_address: 'Email Address',
            status: 'Status'
        });
    });

    document.getElementById('export-accounts')?.addEventListener('click', (event) => {
        event.preventDefault();
        downloadAsExcel('mts_accounts', state.accounts, {
            name: 'Account',
            owner_name: 'Product Specialist',
            secondary_owner_name: 'Product Specialist 2',
            tertiary_owner_name: 'Product Specialist 3',
            account_type: 'Account Type',
            line_name: 'Line',
            secondary_line_name: 'PS 2 Line',
            tertiary_line_name: 'PS 3 Line',
            governorate: 'Governorate',
            status: 'Status'
        });
    });
}
function refreshEmployeeAutocompletes() {
    const managers = state.employees.filter((emp) => emp.role !== ROLES.EMPLOYEE);
    const specialistEmployees = state.employees.filter((emp) => emp.role === ROLES.EMPLOYEE);
    state.autocompletes.directManager?.update(managers);
    state.autocompletes.lineManager?.update(managers);
    state.autocompletes.doctorOwner?.update(specialistEmployees);
    state.autocompletes.doctorSecondary?.update(specialistEmployees);
    state.autocompletes.doctorTertiary?.update(specialistEmployees);
    state.autocompletes.accountOwner?.update(specialistEmployees);
    state.autocompletes.accountSecondary?.update(specialistEmployees);
    state.autocompletes.accountTertiary?.update(specialistEmployees);
}
function renderDoctorStats(doctors = state.doctors) {
    const container = document.getElementById('doctor-stat-cards');
    if (!container) return;
    const approvedDoctors = doctors.filter((doctor) => doctor.status === APPROVAL_STATUS.APPROVED);
    const approved = approvedDoctors.length;
    const pending = doctors.filter(
        (doctor) => doctor.status === APPROVAL_STATUS.PENDING_MANAGER || doctor.status === APPROVAL_STATUS.PENDING_ADMIN
    ).length;
    const specialistNames = approvedDoctors
        .flatMap((doctor) => [doctor.owner_name, doctor.secondary_owner_name, doctor.tertiary_owner_name, doctor.quaternary_owner_name, doctor.quinary_owner_name])
        .filter(Boolean);
    const specialists = distinct(specialistNames).length;

    container.innerHTML = `
        <div class="stat-card">
            <h4>Approved Doctors</h4>
            <div class="value">${formatNumber(approved)}</div>
        </div>
        <div class="stat-card">
            <h4>Pending</h4>
            <div class="value">${formatNumber(pending)}</div>
        </div>
        <div class="stat-card">
            <h4>Product Specialists</h4>
            <div class="value">${formatNumber(specialists)}</div>
        </div>
    `;
}

function renderAccountStats(accounts = state.accounts) {
    const container = document.getElementById('account-stat-cards');
    if (!container) return;
    const approvedAccounts = accounts.filter((account) => account.status === APPROVAL_STATUS.APPROVED);
    const approved = approvedAccounts.length;

    // Generate stat cards for each account type dynamically
    const accountTypeCards = ACCOUNT_TYPES.map(type => {
        const count = approvedAccounts.filter((account) => account.account_type === type).length;
        return `
            <div class="stat-card">
                <h4>${type}</h4>
                <div class="value">${formatNumber(count)}</div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="stat-card">
            <h4>Approved Accounts</h4>
            <div class="value">${formatNumber(approved)}</div>
        </div>
        ${accountTypeCards}
    `;
}
async function removeAdminNotification(entityType, entityId) {
    try {
        await handleSupabase(
            supabase
                .from('notifications')
                .delete()
                .eq('user_id', state.session.userId)
                .eq('entity_type', entityType)
                .eq('entity_id', entityId),
            'remove admin notification'
        );
        await refreshNotifications();
    } catch (error) {
        console.error('Error removing admin notification:', error);
    }
}

async function notifyEmployee(employeeId, message, entityType, entityId) {
    if (!employeeId) return;
    const user = state.users.find((usr) => usr.employee_id === employeeId);
    if (!user) return;
    await createNotification({
        userId: user.id,
        entityType,
        entityId,
        message
    });
}





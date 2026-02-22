import { supabase, handleSupabase } from './supabaseClient.js';
import { requireAuth, logout, updatePassword, hydrateSession } from './session.js';
import { ROLES, APPROVAL_STATUS, ACCOUNT_TYPES, MAX_PRODUCTS_PER_CASE } from './constants.js';
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
    generateCaseCode,
    formatMonth,
    downloadAsExcel,
    initThemeToggle,
    ensureThemeApplied,
    makeSelectSearchable,
    addEnglishOnlyValidation,
    validateFormEnglishOnly
} from './utils.js';
import { createTable, tableFormatters, bindTableActions, ensureTabulator } from './tables.js';
import { applyChartDefaults, resetChartDefaults, buildBarChart, buildLineChart, buildDoughnutChart, buildPieChart, destroyChart } from './charts.js';
import { fetchNotifications, markNotificationsRead, createNotification } from './notifications.js';
import { fetchReceivedMessages, getUnreadMessageCount, markMessageAsRead } from './messages.js';
import { initFormModal, refreshFormHosts, openFormModal, closeFormModal } from './formModal.js';
import {
    groupCaseProducts,
    computeCaseMetrics,
    computeCaseMetricsWithSubcategoryFilter,
    computeDualRowCaseMetrics,
    buildCaseTableRow,
    buildCaseTableColumns,
    buildCaseExportRows,
    CASE_EXPORT_HEADERS,
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
    attachProductsToggle,
    calculateDMCCasesByProduct,
    calculateCompetitorCasesByProduct,
    calculateDMCUnitsByProduct,
    calculateCompetitorUnitsByProduct,
    calculateCasesByCategory,
    calculateUnitsByCategory
} from './caseAnalytics.js';

ensureThemeApplied();

const state = {
    session: null,
    products: [],
    lines: [],
    teamMembers: [],
    specialists: [],
    doctors: [],
    accounts: [],
    teamCases: [],
    teamCaseProducts: [],
    teamCaseProductsByCase: new Map(),
    myCases: [],
    myCaseProducts: [],
    myCaseProductsByCase: new Map(),
    approvals: [],
    myApprovals: [],
    tables: {},
    charts: {},
    autocompletes: {},
    caseFormRows: 1,
    teamCaseFormRows: 1,
    companyProductsMap: new Map(),
    chartPagination: {
        dmcCasesPage: 0,
        competitorCasesPage: 0,
        dmcUnitsPage: 0,
        competitorUnitsPage: 0
    },
    filters: {
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
        },
        dashboard: {}
    }
};

const elements = {
    sidebar: document.getElementById('sidebar'),
    navLinks: Array.from(document.querySelectorAll('.nav-link')),
    sections: Array.from(document.querySelectorAll('.page-section')),
    accountName: document.getElementById('account-name'),
    accountRole: document.getElementById('account-role'),
    btnToggleSidebar: document.getElementById('btnToggleSidebar'),
    btnToggleSidebarDesktop: document.getElementById('btnToggleSidebarDesktop'),
    btnLogout: document.getElementById('actionLogout'),
    btnNotifications: document.getElementById('btnNotifications'),
    btnMessages: document.getElementById('btnMessages'),
    messagesCounter: document.getElementById('messages-counter'),
    messagesContainer: document.getElementById('messages-container'),
    markNotificationsBtn: document.getElementById('mark-notifications-read'),
    notificationsIndicator: document.getElementById('notifications-indicator'),
    notificationsContainer: document.getElementById('notifications-container'),
    btnChangePassword: document.getElementById('actionChangePassword'),
    passwordModal: document.getElementById('modalPassword'),
    messageViewModal: document.getElementById('modalMessageView'),
    passwordSaveBtn: document.getElementById('save-password-btn'),
    themeToggle: document.getElementById('themeToggle'),
    themeToggleIcon: document.getElementById('themeToggleIcon')
};

const bootstrapComponents = {
    notificationsOffcanvas: null,
    messagesOffcanvas: null,
    passwordModal: null,
    messageViewModal: null
};

applyChartDefaults();

document.addEventListener('DOMContentLoaded', init);

async function init() {
    state.session = await requireAuth([ROLES.MANAGER]);
    if (!state.session) return;

    state.session = await hydrateSession(state.session, { force: true });

    initThemeToggle(elements.themeToggle, { iconElement: elements.themeToggleIcon, onThemeChange: resetChartDefaults });

    // Listen for theme changes and re-render dashboard
    window.addEventListener('themeChanged', () => {
        renderDashboard();
    });

    setupHeader();
    setupSidebar();
    setupSectionNavigation();
    setupModals();
    initFilterPanels();
    setupTeamTabs();
    initFormModal({ hostSelector: '.modal-form-host[data-form-id]' });

    await loadInitialData();
    await ensureTabulator();
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
        elements.accountRole.textContent = employee.position || 'Manager';
    } else {
        elements.accountName.textContent = state.session.username;
        elements.accountRole.textContent = state.session.role || 'Manager';
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
        // Toggle rotation class on mobile button
        elements.btnToggleSidebar?.classList.toggle('rotated');
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
                // Remove rotation class when closing sidebar
                elements.btnToggleSidebar?.classList.remove('rotated');
            }
        }
    });

    elements.btnLogout?.addEventListener('click', (event) => {
        event.preventDefault();
        logout();
    });
}

function setupModals() {
    if (window.bootstrap) {
        const offcanvasEl = document.getElementById('offcanvasNotifications');
        bootstrapComponents.notificationsOffcanvas = offcanvasEl
            ? new window.bootstrap.Offcanvas(offcanvasEl)
            : null;

        const messagesOffcanvasEl = document.getElementById('offcanvasMessages');
        bootstrapComponents.messagesOffcanvas = messagesOffcanvasEl
            ? new window.bootstrap.Offcanvas(messagesOffcanvasEl)
            : null;

        bootstrapComponents.passwordModal = elements.passwordModal
            ? new window.bootstrap.Modal(elements.passwordModal)
            : null;

        bootstrapComponents.messageViewModal = elements.messageViewModal
            ? new window.bootstrap.Modal(elements.messageViewModal)
            : null;
    }

    elements.btnNotifications?.addEventListener('click', () => {
        // Add ringing animation on click
        const bellButton = elements.btnNotifications;
        if (bellButton) {
            bellButton.classList.add('ring');
            setTimeout(() => bellButton.classList.remove('ring'), 1500);
        }
        bootstrapComponents.notificationsOffcanvas?.show();
    });

    elements.btnChangePassword?.addEventListener('click', (event) => {
        event.preventDefault();
        bootstrapComponents.passwordModal?.show();
    });

    elements.passwordSaveBtn?.addEventListener('click', handlePasswordUpdate);
    elements.markNotificationsBtn?.addEventListener('click', handleMarkNotificationsRead);

    // Message-related event listeners
    elements.btnMessages?.addEventListener('click', handleMessagesClick);

    // Start periodic refresh for unread message count
    refreshUnreadMessageCount();
    setInterval(refreshUnreadMessageCount, 30000); // Refresh every 30 seconds
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

function setupTeamTabs() {
    const buttons = Array.from(document.querySelectorAll('#team-data-tabs button'));
    const panels = Array.from(document.querySelectorAll('.team-data-panel'));
    initTabNavigation(buttons, panels, 'teamDataTab', 'products');
}

async function loadInitialData() {
    await Promise.all([
        loadLines(),
        loadProducts(),
        loadTeamMembers()
    ]);
    await Promise.all([
        loadTeamDoctors(),
        loadTeamAccounts(),
        loadTeamCases(),
        loadMyCases()
    ]);
    buildApprovalDatasets();
    ensureLineDatalist();
}

function setupDashboardFilters() {
    const container = document.getElementById('manager-dashboard-filters');
    if (!container) return;

    // Save previous selections
    const previousSelections = {
        specialist: container.querySelector('#manager-dashboard-filter-specialist')?.value || '',
        manager: container.querySelector('#manager-dashboard-filter-manager')?.value || '',
        accountType: container.querySelector('#manager-dashboard-filter-account-type')?.value || '',
        companyType: container.querySelector('#manager-dashboard-filter-company-type')?.value || '',

        // Dual-row filter values
        companyCompany: container.querySelector('#manager-dashboard-filter-company-company')?.value || '',
        companyCategory: container.querySelector('#manager-dashboard-filter-company-category')?.value || '',
        companySubCategory: container.querySelector('#manager-dashboard-filter-company-sub-category')?.value || '',
        companyProduct: container.querySelector('#manager-dashboard-filter-company-product')?.value || '',

        competitorCompany: container.querySelector('#manager-dashboard-filter-competitor-company')?.value || '',
        competitorCategory: container.querySelector('#manager-dashboard-filter-competitor-category')?.value || '',
        competitorSubCategory: container.querySelector('#manager-dashboard-filter-competitor-sub-category')?.value || '',
        competitorProduct: container.querySelector('#manager-dashboard-filter-competitor-product')?.value || '',

        month: container.querySelector('#manager-dashboard-filter-month')?.value || '',
        from: container.querySelector('#manager-dashboard-filter-from')?.value || '',
        to: container.querySelector('#manager-dashboard-filter-to')?.value || '',

        // Text search filters
        doctorName: container.querySelector('#manager-dashboard-filter-doctor-name')?.value || '',
        accountName: container.querySelector('#manager-dashboard-filter-account-name')?.value || ''
    };

    // Build specialist and manager options (same as Team Cases)
    const specialistOptions = state.specialists
        .map((member) => {
            const label = `${member.first_name} ${member.last_name}`.trim() || member.code || 'Specialist';
            return `<option value="${member.id}">${label}</option>`;
        })
        .join('');

    const managerOptions = state.teamMembers
        .filter((member) => member.role === ROLES.MANAGER)
        .map((member) => {
            const label = `${member.first_name} ${member.last_name}`.trim() || member.code || 'Manager';
            return `<option value="${member.id}">${label}</option>`;
        })
        .join('');

    const { company, competitor } = collectDualRowFilterOptions(state.teamCaseProducts, state.products);

    container.innerHTML = `
        <div class="filters-row">
            <select class="form-select" id="manager-dashboard-filter-specialist">
                <option value="">All Specialists</option>
                ${specialistOptions}
            </select>
            <select class="form-select" id="manager-dashboard-filter-manager">
                <option value="">All Managers</option>
                ${managerOptions}
            </select>
            <select class="form-select" id="manager-dashboard-filter-account-type">
                <option value="">All Account Types</option>
                ${ACCOUNT_TYPES.map((type) => `<option value="${type}">${type}</option>`).join('')}
            </select>
            <select class="form-select" id="manager-dashboard-filter-company-type">
                <option value="">All Company Types</option>
                <option value="company">Company</option>
                <option value="competitor">Competitor</option>
            </select>
        </div>

        <!-- Company Filters Row -->
        <div class="filters-row">
            <select class="form-select" id="manager-dashboard-filter-company-company">
                <option value="">All Companies</option>
                ${company.companies.map((comp) => `<option value="${comp}">${comp}</option>`).join('')}
            </select>
            <select class="form-select" id="manager-dashboard-filter-company-category">
                <option value="">All Categories</option>
                ${company.categories.map((cat) => `<option value="${cat}">${cat}</option>`).join('')}
            </select>
            <select class="form-select" id="manager-dashboard-filter-company-sub-category">
                <option value="">All Sub Categories</option>
                ${company.subCategories.map((sub) => `<option value="${sub}">${sub}</option>`).join('')}
            </select>
            <select class="form-select" id="manager-dashboard-filter-company-product">
                <option value="">All Products</option>
                ${company.productOptions.map((option) => `<option value="${option.value}">${option.label}</option>`).join('')}
            </select>
        </div>

        <!-- Competitor Filters Row -->
        <div class="filters-row">
            <select class="form-select" id="manager-dashboard-filter-competitor-company">
                <option value="">All Companies</option>
                ${competitor.companies.map((comp) => `<option value="${comp}">${comp}</option>`).join('')}
            </select>
            <select class="form-select" id="manager-dashboard-filter-competitor-category">
                <option value="">All Categories</option>
                ${competitor.categories.map((cat) => `<option value="${cat}">${cat}</option>`).join('')}
            </select>
            <select class="form-select" id="manager-dashboard-filter-competitor-sub-category">
                <option value="">All Sub Categories</option>
                ${competitor.subCategories.map((sub) => `<option value="${sub}">${sub}</option>`).join('')}
            </select>
            <select class="form-select" id="manager-dashboard-filter-competitor-product">
                <option value="">All Products</option>
                ${competitor.productOptions.map((option) => `<option value="${option.value}">${option.label}</option>`).join('')}
            </select>
        </div>

        <!-- Date Filters Row -->
        <div class="filters-row">
            <select class="form-select" id="manager-dashboard-filter-month">
                <option value="">Any Month</option>
                ${Array.from({ length: 12 }, (_, index) => {
                    const month = index + 1;
                    const label = new Date(2000, index).toLocaleString(undefined, { month: 'long' });
                    return `<option value="${month}">${label}</option>`;
                }).join('')}
            </select>
            <input type="date" class="form-control" id="manager-dashboard-filter-from" placeholder="From Date">
            <input type="date" class="form-control" id="manager-dashboard-filter-to" placeholder="To Date">
            <div></div>
        </div>

        <!-- Doctor and Account Name Filters Row -->
        <div class="filters-row" style="grid-template-columns: 1fr 1fr 1fr 1fr;">
            <input type="text" class="form-control" id="manager-dashboard-filter-doctor-name" placeholder="Search Doctor Name...">
            <input type="text" class="form-control" id="manager-dashboard-filter-account-name" placeholder="Search Account Name...">
            <div></div>
            <div></div>
        </div>

        <!-- Reset and Export Buttons Row -->
        <div class="filters-row" style="grid-template-columns: 1fr;">
            <div class="filters-actions" style="justify-self: end;">
                <button class="btn btn-outline-ghost" id="manager-dashboard-filter-reset">Reset</button>
                <button class="btn btn-outline-ghost" id="manager-dashboard-export"><i class="bi bi-download me-2"></i>Export</button>
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

    setSelectValue('#manager-dashboard-filter-specialist', previousSelections.specialist);
    setSelectValue('#manager-dashboard-filter-manager', previousSelections.manager);
    setSelectValue('#manager-dashboard-filter-account-type', previousSelections.accountType);
    setSelectValue('#manager-dashboard-filter-company-type', previousSelections.companyType);

    // Dual-row filter preservation
    setSelectValue('#manager-dashboard-filter-company-company', previousSelections.companyCompany);
    setSelectValue('#manager-dashboard-filter-company-category', previousSelections.companyCategory);
    setSelectValue('#manager-dashboard-filter-company-sub-category', previousSelections.companySubCategory);
    setSelectValue('#manager-dashboard-filter-company-product', previousSelections.companyProduct);

    setSelectValue('#manager-dashboard-filter-competitor-company', previousSelections.competitorCompany);
    setSelectValue('#manager-dashboard-filter-competitor-category', previousSelections.competitorCategory);
    setSelectValue('#manager-dashboard-filter-competitor-sub-category', previousSelections.competitorSubCategory);
    setSelectValue('#manager-dashboard-filter-competitor-product', previousSelections.competitorProduct);

    setSelectValue('#manager-dashboard-filter-month', previousSelections.month);

    const fromInput = container.querySelector('#manager-dashboard-filter-from');
    if (fromInput) fromInput.value = previousSelections.from || '';
    const toInput = container.querySelector('#manager-dashboard-filter-to');
    if (toInput) toInput.value = previousSelections.to || '';

    // Restore text search filters
    const doctorNameInput = container.querySelector('#manager-dashboard-filter-doctor-name');
    if (doctorNameInput) doctorNameInput.value = previousSelections.doctorName || '';
    const accountNameInput = container.querySelector('#manager-dashboard-filter-account-name');
    if (accountNameInput) accountNameInput.value = previousSelections.accountName || '';

    // Setup dual-row cascading filters (EXACT COPY FROM ADMIN)
    const setupDualRowFilters = () => {
        // Company row cascading
        const companyCompanySelect = container.querySelector('#manager-dashboard-filter-company-company');
        const companyCategorySelect = container.querySelector('#manager-dashboard-filter-company-category');
        const companySubCategorySelect = container.querySelector('#manager-dashboard-filter-company-sub-category');
        const companyProductSelect = container.querySelector('#manager-dashboard-filter-company-product');

        // Competitor row cascading
        const competitorCompanySelect = container.querySelector('#manager-dashboard-filter-competitor-company');
        const competitorCategorySelect = container.querySelector('#manager-dashboard-filter-competitor-category');
        const competitorSubCategorySelect = container.querySelector('#manager-dashboard-filter-competitor-sub-category');
        const competitorProductSelect = container.querySelector('#manager-dashboard-filter-competitor-product');

        // Company row cascading logic (EXACT COPY FROM ADMIN)
        const updateCompanyCascading = () => {
            const selectedCompany = companyCompanySelect.value;
            const selectedCategory = companyCategorySelect.value;
            const selectedSubCategory = companySubCategorySelect.value;

            // Update categories based on company (or show all if no company selected)
            if (selectedCompany) {
                const filteredCategories = [...new Set(
                    state.teamCaseProducts
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
                state.teamCaseProducts
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

            const filteredProducts = state.teamCaseProducts
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

        // Competitor row cascading logic (EXACT COPY FROM ADMIN)
        const updateCompetitorCascading = () => {
            const selectedCompany = competitorCompanySelect.value;
            const selectedCategory = competitorCategorySelect.value;
            const selectedSubCategory = competitorSubCategorySelect.value;

            // Update categories based on company (or show all if no company selected)
            if (selectedCompany) {
                const filteredCategories = [...new Set(
                    state.teamCaseProducts
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
                state.teamCaseProducts
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

            const filteredProducts = state.teamCaseProducts
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
    container.querySelector('#manager-dashboard-filter-specialist')?.addEventListener('change', handleFiltersChange);
    container.querySelector('#manager-dashboard-filter-manager')?.addEventListener('change', handleFiltersChange);
    container.querySelector('#manager-dashboard-filter-account-type')?.addEventListener('change', handleFiltersChange);
    container.querySelector('#manager-dashboard-filter-company-type')?.addEventListener('change', handleFiltersChange);
    container.querySelector('#manager-dashboard-filter-month')?.addEventListener('change', handleFiltersChange);
    container.querySelector('#manager-dashboard-filter-from')?.addEventListener('change', handleFiltersChange);
    container.querySelector('#manager-dashboard-filter-to')?.addEventListener('change', handleFiltersChange);

    // Text search filters with input event for real-time filtering
    container.querySelector('#manager-dashboard-filter-doctor-name')?.addEventListener('input', handleFiltersChange);
    container.querySelector('#manager-dashboard-filter-account-name')?.addEventListener('input', handleFiltersChange);

    setupDualRowFilters();

    // Reset button - reset both rows to show all options
    container.querySelector('#manager-dashboard-filter-reset')?.addEventListener('click', (event) => {
        event.preventDefault();
        container.querySelectorAll('select').forEach((select) => (select.value = ''));
        container.querySelectorAll('input').forEach((input) => (input.value = ''));

        // Reset company row options
        const companyCompanySelect = container.querySelector('#manager-dashboard-filter-company-company');
        const companyCategorySelect = container.querySelector('#manager-dashboard-filter-company-category');
        const companySubCategorySelect = container.querySelector('#manager-dashboard-filter-company-sub-category');
        const companyProductSelect = container.querySelector('#manager-dashboard-filter-company-product');

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
        const competitorCompanySelect = container.querySelector('#manager-dashboard-filter-competitor-company');
        const competitorCategorySelect = container.querySelector('#manager-dashboard-filter-competitor-category');
        const competitorSubCategorySelect = container.querySelector('#manager-dashboard-filter-competitor-sub-category');
        const competitorProductSelect = container.querySelector('#manager-dashboard-filter-competitor-product');

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

    container.querySelector('#manager-dashboard-export')?.addEventListener('click', exportManagerDashboardCases);

    // Initial render
    handleFiltersChange();
}

function getManagerDashboardFilteredData() {
    const cases = getManagerDashboardFilteredCases();
    const idSet = new Set(cases.map((caseItem) => caseItem.id));
    const filteredProducts = state.teamCaseProducts.filter((product) => idSet.has(product.case_id));
    const caseProductsMap = groupCaseProducts(filteredProducts);
    return {
        cases,
        caseProducts: filteredProducts,
        caseProductsMap
    };
}

function getManagerDashboardFilteredCases() {
    // Row 1 filters
    const specialist = document.getElementById('manager-dashboard-filter-specialist')?.value;
    const manager = document.getElementById('manager-dashboard-filter-manager')?.value;
    const accountType = document.getElementById('manager-dashboard-filter-account-type')?.value;
    const companyType = document.getElementById('manager-dashboard-filter-company-type')?.value;

    // Text search filters
    const doctorNameSearch = document.getElementById('manager-dashboard-filter-doctor-name')?.value.trim().toLowerCase() || '';
    const accountNameSearch = document.getElementById('manager-dashboard-filter-account-name')?.value.trim().toLowerCase() || '';

    // Dual-row filter values
    const companyCompany = document.getElementById('manager-dashboard-filter-company-company')?.value;
    const companyCategory = document.getElementById('manager-dashboard-filter-company-category')?.value;
    const companySubCategory = document.getElementById('manager-dashboard-filter-company-sub-category')?.value;
    const companyProduct = document.getElementById('manager-dashboard-filter-company-product')?.value;

    const competitorCompany = document.getElementById('manager-dashboard-filter-competitor-company')?.value;
    const competitorCategory = document.getElementById('manager-dashboard-filter-competitor-category')?.value;
    const competitorSubCategory = document.getElementById('manager-dashboard-filter-competitor-sub-category')?.value;
    const competitorProduct = document.getElementById('manager-dashboard-filter-competitor-product')?.value;

    const monthValue = document.getElementById('manager-dashboard-filter-month')?.value;
    const fromValue = document.getElementById('manager-dashboard-filter-from')?.value;
    const toValue = document.getElementById('manager-dashboard-filter-to')?.value;

    const monthNumber = monthValue ? Number(monthValue) : null;
    const fromDate = fromValue ? new Date(fromValue) : null;
    const toDate = toValue ? new Date(toValue) : null;

    return state.teamCases.filter((caseItem) => {
        // Row 1 filters
        if (specialist && caseItem.submitted_by_id !== specialist) return false;
        if (accountType && caseItem.account_type !== accountType) return false;
        if (manager) {
            const submitter =
                state.teamMembersById?.get(String(caseItem.submitted_by_id)) ||
                state.teamMembers.find((member) => String(member.id) === String(caseItem.submitted_by_id));
            const directManagerId = submitter?.direct_manager_id ? String(submitter.direct_manager_id) : '';
            const lineManagerId = submitter?.line_manager_id ? String(submitter.line_manager_id) : '';
            if (manager !== directManagerId && manager !== lineManagerId) {
                return false;
            }
        }

        // Text search filters
        if (doctorNameSearch && !(caseItem.doctor_name || '').toLowerCase().includes(doctorNameSearch)) {
            return false;
        }
        if (accountNameSearch && !(caseItem.account_name || '').toLowerCase().includes(accountNameSearch)) {
            return false;
        }

        const products = state.teamCaseProductsByCase.get(caseItem.id) || [];

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

function exportManagerDashboardCases() {
    const { cases, caseProductsMap } = getManagerDashboardFilteredData();
    const rows = buildCaseExportRows(cases, caseProductsMap);
    downloadAsExcel('team_dashboard_cases', rows, CASE_EXPORT_HEADERS);
}

function setupExportButtons() {
    document.getElementById('manager-export-doctors')?.addEventListener('click', (event) => {
        event.preventDefault();
        downloadAsExcel('team_doctors', state.doctors, {
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
            status: 'Status',
            created_at: 'Created On'
        });
    });

    document.getElementById('manager-export-accounts')?.addEventListener('click', (event) => {
        event.preventDefault();
        downloadAsExcel('team_accounts', state.accounts, {
            name: 'Account',
            account_type: 'Account Type',
            owner_name: 'Product Specialist',
            secondary_owner_name: 'Product Specialist 2',
            tertiary_owner_name: 'Product Specialist 3',
            line_name: 'Line',
            secondary_line_name: 'PS 2 Line',
            tertiary_line_name: 'PS 3 Line',
            governorate: 'Governorate',
            address: 'Address',
            status: 'Status',
            created_at: 'Created On'
        });
    });
}

function initializeForms() {
    setupTeamDoctorForm();
    setupTeamAccountForm();
    setupTeamFilters();
    setupTeamApprovalsFilters();
    setupManagerCaseFilters();
    setupMyCaseForm();
    setupDashboardFilters();
    setupExportButtons();
}

function renderAll() {
    renderTeamProducts({ refreshFilters: true });
    renderTeamDoctors({ refreshFilters: true });
    renderTeamAccounts({ refreshFilters: true });
    renderTeamCases();
    renderMyCases();
    renderMyApprovalsTable();
    renderTeamApprovalsTable();
    renderDashboard();
}

async function refreshNotifications() {
    const allNotifications = await fetchNotifications(state.session.userId, { includeRead: false });

    // Filter out notifications for entities that are no longer pending manager approval
    const validNotifications = [];
    for (const notif of allNotifications) {
        let isValid = true;

        if (notif.entity_type === 'doctor') {
            const doctor = state.doctors.find(d => d.id === notif.entity_id);
            if (!doctor || doctor.status !== APPROVAL_STATUS.PENDING_MANAGER) {
                isValid = false;
                // Remove invalid notification
                await handleSupabase(
                    supabase.from('notifications').delete().eq('id', notif.id),
                    'remove invalid doctor notification'
                );
            }
        } else if (notif.entity_type === 'account') {
            const account = state.accounts.find(a => a.id === notif.entity_id);
            if (!account || account.status !== APPROVAL_STATUS.PENDING_MANAGER) {
                isValid = false;
                // Remove invalid notification
                await handleSupabase(
                    supabase.from('notifications').delete().eq('id', notif.id),
                    'remove invalid account notification'
                );
            }
        } else if (notif.entity_type === 'case') {
            const caseItem = state.teamCases.find(c => c.id === notif.entity_id);
            if (!caseItem || caseItem.status !== APPROVAL_STATUS.PENDING_MANAGER) {
                isValid = false;
                // Remove invalid notification
                await handleSupabase(
                    supabase.from('notifications').delete().eq('id', notif.id),
                    'remove invalid case notification'
                );
            }
        }

        if (isValid) {
            validNotifications.push(notif);
        }
    }

    updateNotificationsUI(validNotifications);
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
        const { data, error } = await supabase
            .from('users')
            .select('password')
            .eq('id', state.session.userId)
            .single();
        if (error) throw error;
        if (data.password !== current) {
            alert('Current password is incorrect.');
            return;
        }
        await updatePassword(state.session.userId, next);
        elements.passwordModal?.querySelector('form')?.reset();
        bootstrapComponents.passwordModal?.hide();
        alert('Password updated successfully.');
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
            .select('id, name')
            .order('name', { ascending: true }),
        'load lines'
    );
    state.lines = data || [];
}

async function loadProducts() {
    const managerLineId = state.session.employee?.lineId;

    const data = await handleSupabase(
        supabase
            .from('products')
            .select('id, name, category, sub_category, company_id, line_id, is_company_product, company:company_id(name), line:line_id(name)')
            .eq('line_id', managerLineId)
            .order('name', { ascending: true }),
        'load products'
    );
    state.products = (data || []).map((product) => ({
        ...product,
        company_name: product.company?.name,
        line_name: product.line?.name
    }));
    state.companyProductsMap = new Map();
    state.products.forEach((product) => {
        if (!state.companyProductsMap.has(product.company_name)) {
            state.companyProductsMap.set(product.company_name, []);
        }
        state.companyProductsMap.get(product.company_name).push(product);
    });
}

async function loadTeamMembers() {
    const managerId = state.session.employeeId;
    const data = await handleSupabase(
        supabase
            .from('employees')
            .select(
                'id, code, first_name, last_name, position, role, manager_level, line_id, area, direct_manager_id, line_manager_id, email, phone'
            )
            .or(`direct_manager_id.eq.${managerId},line_manager_id.eq.${managerId}`),
        'load team members'
    );
    state.teamMembers = data || [];
    state.specialists = state.teamMembers.filter((member) => member.role === ROLES.EMPLOYEE);
    state.teamMembersById = new Map(state.teamMembers.map((member) => [String(member.id), member]));
    const specialistList = state.specialists;
    state.autocompletes.teamDoctorOwner?.update(specialistList);
    state.autocompletes.teamDoctorSecondary?.update(specialistList);
    state.autocompletes.teamDoctorTertiary?.update(specialistList);
    state.autocompletes.teamDoctorQuaternary?.update(specialistList);
    state.autocompletes.teamDoctorQuinary?.update(specialistList);
    state.autocompletes.teamAccountOwner?.update(specialistList);
    state.autocompletes.teamAccountSecondary?.update(specialistList);
    state.autocompletes.teamAccountTertiary?.update(specialistList);
}

async function loadTeamDoctors() {
    if (!state.specialists.length) {
        state.doctors = [];
        return;
    }
    const specialistIds = state.specialists.map((member) => member.id);
    let data = [];
    if (specialistIds.length) {
        const idList = specialistIds.join(',');
        const query = supabase
            .from('v_doctor_details')
            .select('*')
            .neq('status', APPROVAL_STATUS.REJECTED)
            .order('created_at', { ascending: false })
            .or(
                `owner_employee_id.in.(${idList}),secondary_employee_id.in.(${idList}),tertiary_employee_id.in.(${idList}),quaternary_employee_id.in.(${idList}),quinary_employee_id.in.(${idList})`
            );
        data = (await handleSupabase(query, 'load team doctors')) || [];
    }
    state.doctors = data.map((doctor) => {
        const line =
            doctor.line_name ||
            state.lines.find((ln) => ln.id === doctor.line_id)?.name ||
            state.specialists.find((member) => member.id === doctor.owner_employee_id)?.line_name ||
            '';
        const secondaryLine =
            doctor.secondary_line_name ||
            state.lines.find((ln) => ln.id === doctor.secondary_line_id)?.name ||
            state.specialists.find((member) => member.id === doctor.secondary_employee_id)?.line_name ||
            '';
        const tertiaryLine =
            doctor.tertiary_line_name ||
            state.lines.find((ln) => ln.id === doctor.tertiary_line_id)?.name ||
            state.specialists.find((member) => member.id === doctor.tertiary_employee_id)?.line_name ||
            '';
        return {
            ...doctor,
            line_name: line,
            secondary_line_name: secondaryLine,
            tertiary_line_name: tertiaryLine
        };
    });
    refreshManagerCaseFormOptions();
    state.autocompletes.teamDoctorOwner?.update(state.specialists);
    state.autocompletes.teamDoctorSecondary?.update(state.specialists);
    state.autocompletes.teamDoctorTertiary?.update(state.specialists);
}

async function loadTeamAccounts() {
    if (!state.specialists.length) {
        state.accounts = [];
        return;
    }
    const specialistIds = state.specialists.map((member) => member.id);
    let data = [];
    if (specialistIds.length) {
        const idList = specialistIds.join(',');
        const query = supabase
            .from('v_account_details')
            .select('*')
            .neq('status', APPROVAL_STATUS.REJECTED)
            .order('created_at', { ascending: false })
            .or(
                `owner_employee_id.in.(${idList}),secondary_employee_id.in.(${idList}),tertiary_employee_id.in.(${idList})`
            );
        data = (await handleSupabase(query, 'load team accounts')) || [];
    }
    state.accounts = data.map((account) => {
        const line =
            account.line_name ||
            state.lines.find((ln) => ln.id === account.line_id)?.name ||
            state.specialists.find((member) => member.id === account.owner_employee_id)?.line_name ||
            '';
        const secondaryLine =
            account.secondary_line_name ||
            state.lines.find((ln) => ln.id === account.secondary_line_id)?.name ||
            state.specialists.find((member) => member.id === account.secondary_employee_id)?.line_name ||
            '';
        const tertiaryLine =
            account.tertiary_line_name ||
            state.lines.find((ln) => ln.id === account.tertiary_line_id)?.name ||
            state.specialists.find((member) => member.id === account.tertiary_employee_id)?.line_name ||
            '';
        return {
            ...account,
            line_name: line,
            secondary_line_name: secondaryLine,
            tertiary_line_name: tertiaryLine
        };
    });
    refreshManagerCaseFormOptions();
    state.autocompletes.teamAccountOwner?.update(state.specialists);
    state.autocompletes.teamAccountSecondary?.update(state.specialists);
    state.autocompletes.teamAccountTertiary?.update(state.specialists);
}

async function loadTeamCases() {
    const participantIds = state.specialists.map((member) => member.id);
    if (!participantIds.length) {
        state.teamCases = [];
        state.teamCaseProducts = [];
        state.teamCaseProductsByCase = new Map();
        return;
    }

    // First load cases
    const cases = await handleSupabase(
        supabase
            .from('v_case_details')
            .select('*')
            .in('submitted_by_id', participantIds)
            .neq('status', APPROVAL_STATUS.REJECTED)
            .order('case_date', { ascending: false }),
        'load team cases'
    );

    state.teamCases = cases || [];

    // Then load products only for those cases (batch if needed)
    const allProducts = [];
    if (state.teamCases.length > 0) {
        const caseIds = state.teamCases.map(c => c.id);
        const CASE_ID_BATCH_SIZE = 500; // Supabase .in() limit is ~1000, use 500 to be safe
        const PRODUCT_BATCH_SIZE = 1000;

        for (let i = 0; i < caseIds.length; i += CASE_ID_BATCH_SIZE) {
            const batchIds = caseIds.slice(i, i + CASE_ID_BATCH_SIZE);

            // For each batch of case IDs, load ALL products using .range() pagination
            // IMPORTANT: Reset offset for each new batch of case IDs!
            let offset = 0;
            let hasMore = true;

            while (hasMore) {
                const products = await handleSupabase(
                    supabase
                        .from('case_products')
                        .select('case_id, product_id, product_name, company_name, category, sub_category, is_company_product, units, sequence')
                        .in('case_id', batchIds)
                        .order('case_id', { ascending: true })
                        .order('sequence', { ascending: true })
                        .range(offset, offset + PRODUCT_BATCH_SIZE - 1),
                    `load team case products for case batch ${Math.floor(i / CASE_ID_BATCH_SIZE) + 1}, product page ${offset / PRODUCT_BATCH_SIZE + 1}`
                );

                if (products && products.length > 0) {
                    allProducts.push(...products);
                    offset += PRODUCT_BATCH_SIZE;
                    hasMore = products.length === PRODUCT_BATCH_SIZE;
                } else {
                    hasMore = false;
                }
            }
        }
    }

    state.teamCaseProducts = allProducts;
    state.teamCaseProductsByCase = groupCaseProducts(state.teamCaseProducts);

    // Debug logging
    console.log('📊 loadTeamCases() completed:');
    console.log('  - Team cases loaded:', state.teamCases.length);
    console.log('  - Team case products loaded:', state.teamCaseProducts.length);
    console.log('  - Team case products map size:', state.teamCaseProductsByCase.size);
    console.log('  - Unique case IDs in products:', new Set(state.teamCaseProducts.map(p => p.case_id)).size);
    console.log('  - Cases without products:', state.teamCases.filter(c => !state.teamCaseProductsByCase.has(c.id)).length);
}

async function loadMyCases() {
    // First load cases
    const cases = await handleSupabase(
        supabase
            .from('v_case_details')
            .select('*')
            .eq('submitted_by_id', state.session.employeeId)
            .neq('status', APPROVAL_STATUS.REJECTED)
            .order('case_date', { ascending: false }),
        'load manager cases'
    );

    state.myCases = cases || [];

    // Then load products only for those cases (batch if needed)
    const allProducts = [];
    if (state.myCases.length > 0) {
        const caseIds = state.myCases.map(c => c.id);
        const BATCH_SIZE = 500; // Supabase .in() limit is ~1000, use 500 to be safe

        for (let i = 0; i < caseIds.length; i += BATCH_SIZE) {
            const batchIds = caseIds.slice(i, i + BATCH_SIZE);
            const products = await handleSupabase(
                supabase
                    .from('case_products')
                    .select('case_id, product_id, product_name, company_name, category, sub_category, is_company_product, units, sequence')
                    .in('case_id', batchIds),
                `load manager case products batch ${Math.floor(i / BATCH_SIZE) + 1}`
            );
            if (products && products.length > 0) {
                allProducts.push(...products);
            }
        }
    }

    state.myCaseProducts = allProducts;
    state.myCaseProductsByCase = groupCaseProducts(state.myCaseProducts);

    // Debug logging
    console.log('📊 loadMyCases() completed:');
    console.log('  - My cases loaded:', state.myCases.length);
    console.log('  - My case products loaded:', state.myCaseProducts.length);
    console.log('  - My case products map size:', state.myCaseProductsByCase.size);
}

function buildApprovalDatasets() {
    const ownerNameLookup = new Map();
    state.teamMembers.forEach((member) => {
        const fullName = [member.first_name, member.last_name].filter(Boolean).join(' ').trim();
        ownerNameLookup.set(member.id, fullName || member.code || 'Product Specialist');
    });
    const fallbackOwnerName = state.session.employee?.fullName || state.session.username || 'Product Specialist';

    const pending = state.doctors
        .filter((doctor) => doctor.status === APPROVAL_STATUS.PENDING_MANAGER)
        .map((doctor) => ({
            id: doctor.id,
            type: 'doctor',
            name: doctor.name,
            owner_id: doctor.owner_employee_id,
            ownerName: ownerNameLookup.get(doctor.owner_employee_id) || 'Product Specialist',
            status: doctor.status,
            created_at: doctor.created_at,
            payload: doctor
        }));

    const accountPending = state.accounts
        .filter((account) => account.status === APPROVAL_STATUS.PENDING_MANAGER)
        .map((account) => ({
            id: account.id,
            type: 'account',
            name: account.name,
            owner_id: account.owner_employee_id,
            ownerName: ownerNameLookup.get(account.owner_employee_id) || 'Product Specialist',
            status: account.status,
            created_at: account.created_at,
            payload: account
        }));

    const casePending = state.teamCases
        .filter((caseItem) => caseItem.status === APPROVAL_STATUS.PENDING_MANAGER)
        .map((caseItem) => ({
            id: caseItem.id,
            type: 'case',
            name: caseItem.case_code,
            owner_id: caseItem.submitted_by_id,
            ownerName: ownerNameLookup.get(caseItem.submitted_by_id) || caseItem.submitted_by_name || 'Product Specialist',
            status: caseItem.status,
            created_at: caseItem.created_at,
            payload: caseItem
        }));

    state.approvals = [...pending, ...accountPending, ...casePending];

    state.myApprovals = [
        ...state.doctors
            .filter((doctor) => doctor.created_by === state.session.employeeId)
            .map((doctor) => ({
                id: doctor.id,
                type: 'doctor',
                name: doctor.name,
                ownerName: fallbackOwnerName,
                status: doctor.status,
                created_at: doctor.created_at
            })),
        ...state.accounts
            .filter((account) => account.created_by === state.session.employeeId)
            .map((account) => ({
                id: account.id,
                type: 'account',
                name: account.name,
                ownerName: fallbackOwnerName,
                status: account.status,
                created_at: account.created_at
            })),
        ...state.myCases.map((caseItem) => ({
            id: caseItem.id,
            type: 'case',
            name: caseItem.case_code,
            ownerName: fallbackOwnerName,
            status: caseItem.status,
            created_at: caseItem.created_at
        }))
    ];
}

function ensureLineDatalist() {
    let element = document.getElementById('lines-list');
    if (!element) {
        element = document.createElement('datalist');
        element.id = 'lines-list';
        document.body.appendChild(element);
    }
    const values = distinct([
        state.session.employee?.lineName,
        ...state.lines.map((line) => line.name)
    ].filter(Boolean));
    element.innerHTML = values.map((value) => `<option value="${value}"></option>`).join('');
}

function renderTeamProducts(options = {}) {
    const { refreshFilters = false } = options;
    if (refreshFilters) {
        renderTeamProductFilters();
    }
    const filtered = getFilteredTeamProducts();
    renderTeamProductsTable(filtered);
    renderTeamProductStats(filtered);
}

function getTeamProductPool() {
    const lineIds = distinct(state.teamMembers.map((member) => member.line_id).filter(Boolean));
    if (!lineIds.length) {
        return state.products.slice();
    }
    return state.products.filter((product) => lineIds.includes(product.line_id));
}

function getFilteredTeamProducts() {
    const baseProducts = getTeamProductPool();
    const { company, category, type } = state.filters.products;
    return baseProducts.filter((product) => {
        if (company && (product.company_name || '') !== company) return false;
        if (category && (product.category || '') !== category) return false;
        if (type) {
            const productType = product.is_company_product ? 'Company' : 'Competitor';
            if (productType !== type) return false;
        }
        return true;
    });
}

function renderTeamProductFilters() {
    const container = document.getElementById('team-product-filters');
    if (!container) return;
    const baseProducts = getTeamProductPool();
    const { company, category, type } = state.filters.products;
    const companies = distinct(baseProducts.map((product) => product.company_name).filter(Boolean)).sort((a, b) =>
        a.localeCompare(b)
    );
    const categories = distinct(baseProducts.map((product) => product.category).filter(Boolean)).sort((a, b) =>
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
            <select class="form-select form-select-sm" id="manager-filter-product-company" aria-label="Filter products by company">
                <option value="">All Companies</option>
                ${companies
                    .map(
                        (value) =>
                            `<option value="${value}"${value === selectedCompany ? ' selected' : ''}>${value}</option>`
                    )
                    .join('')}
            </select>
            <select class="form-select form-select-sm" id="manager-filter-product-category" aria-label="Filter products by category">
                <option value="">All Categories</option>
                ${categories
                    .map(
                        (value) =>
                            `<option value="${value}"${value === selectedCategory ? ' selected' : ''}>${value}</option>`
                    )
                    .join('')}
            </select>
            <select class="form-select form-select-sm" id="manager-filter-product-type" aria-label="Filter products by type">
                <option value="">All Types</option>
                ${types
                    .map(
                        (value) =>
                            `<option value="${value}"${value === selectedType ? ' selected' : ''}>${value}</option>`
                    )
                    .join('')}
            </select>
        </div>
    `;

    container.querySelector('#manager-filter-product-company')?.addEventListener('change', (event) => {
        state.filters.products.company = event.target.value;
        renderTeamProducts();
    });
    container.querySelector('#manager-filter-product-category')?.addEventListener('change', (event) => {
        state.filters.products.category = event.target.value;
        renderTeamProducts();
    });
    container.querySelector('#manager-filter-product-type')?.addEventListener('change', (event) => {
        state.filters.products.type = event.target.value;
        renderTeamProducts();
    });
}

function renderTeamProductsTable(products) {
    const tableData = products.map((product) => ({
        id: product.id,
        name: product.name,
        category: product.category,
        sub_category: product.sub_category,
        company: product.company_name,
        line: product.line_name,
        type: product.is_company_product ? 'Company' : 'Competitor'
    }));

    const columns = [
        { title: 'Product', field: 'name', minWidth: 180, headerFilter: 'input' },
        { title: 'Category', field: 'category', minWidth: 140, headerFilter: 'input' },
        { title: 'Sub-category', field: 'sub_category', minWidth: 160, headerFilter: 'input' },
        { title: 'Company', field: 'company', minWidth: 180, headerFilter: 'input' },
        { title: 'Line', field: 'line', width: 140, headerFilter: 'input' },
        { title: 'Type', field: 'type', width: 120 }
    ];

    state.tables.teamProducts = createTable('team-products-table', columns, tableData, {
        height: 420
    });
}

function renderTeamProductStats(products) {
    const container = document.getElementById('team-products-stats');
    if (!container) return;
    const total = products.length;
    const companyProducts = products.filter((product) => product.is_company_product).length;
    const competitorProducts = total - companyProducts;
    const companies = distinct(products.map((product) => product.company_name).filter(Boolean)).length;
    container.innerHTML = `
        <div class="stat-card">
            <h4>Total Products</h4>
            <div class="value">${formatNumber(total)}</div>
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
            <div class="value">${formatNumber(companies)}</div>
        </div>
    `;
}
function renderTeamDoctors(options = {}) {
    const { refreshFilters = false } = options;
    if (refreshFilters) {
        renderTeamDoctorFilters();
    }
    const filtered = getFilteredTeamDoctors();
    renderTeamDoctorTable(filtered);
    renderTeamDoctorStats(filtered);
}

function renderTeamDoctorFilters() {
    const container = document.getElementById('team-doctor-filters');
    if (!container) return;
    const { specialist } = state.filters.doctors;
    const options = state.specialists
        .map((member) => ({
            value: String(member.id),
            label: `${member.first_name} ${member.last_name}`.trim() || member.code || 'Specialist'
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

    if (specialist && !options.some((option) => option.value === specialist)) {
        state.filters.doctors.specialist = '';
    }
    const selectedSpecialist = state.filters.doctors.specialist;

    container.innerHTML = `
        <div class="filters-row">
            <select class="form-select form-select-sm" id="manager-filter-doctor-specialist" aria-label="Filter doctors by product specialist">
                <option value="">All Product Specialists</option>
                ${options
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

    container.querySelector('#manager-filter-doctor-specialist')?.addEventListener('change', (event) => {
        state.filters.doctors.specialist = event.target.value;
        renderTeamDoctors();
    });
}

function getFilteredTeamDoctors() {
    const { specialist } = state.filters.doctors;
    if (!specialist) return state.doctors.slice();
    const target = state.specialists.find((member) => String(member.id) === String(specialist));
    const normalizedName = target ? `${target.first_name} ${target.last_name}`.trim().toLowerCase() : '';
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

function renderTeamDoctorTable(doctors) {
    const tableData = doctors.map((doctor) => {
        const getMemberName = (employeeId, fallback) => {
            if (!employeeId) return fallback || '';
            const member = state.teamMembersById?.get(String(employeeId)) || state.teamMembers.find((m) => m.id === employeeId);
            if (member) {
                const full = `${member.first_name} ${member.last_name}`.trim();
                return full || member.code || fallback || '';
            }
            return fallback || '';
        };
        const ownerName = getMemberName(doctor.owner_employee_id, doctor.owner_name || 'Unknown');
        const secondaryName = getMemberName(doctor.secondary_employee_id, doctor.secondary_owner_name || '');
        const tertiaryName = getMemberName(doctor.tertiary_employee_id, doctor.tertiary_owner_name || '');
        const quaternaryName = getMemberName(doctor.quaternary_employee_id, doctor.quaternary_owner_name || '');
        const quinaryName = getMemberName(doctor.quinary_employee_id, doctor.quinary_owner_name || '');
        const lineRecord = state.lines.find((line) => line.id === doctor.line_id);
        const lineName = lineRecord?.name || doctor.line_name || '';
        return {
            id: doctor.id,
            name: doctor.name,
            specialist: ownerName || 'Unknown',
            specialist2: secondaryName,
            specialist3: tertiaryName,
            specialist4: quaternaryName,
            specialist5: quinaryName,
            line: lineName,
            line2: doctor.secondary_line_name || '',
            line3: doctor.tertiary_line_name || '',
            line4: doctor.quaternary_line_name || '',
            line5: doctor.quinary_line_name || '',
            specialty: doctor.specialty,
            phone: doctor.phone,
            email_address: doctor.email_address,
            status: doctor.status,
            created_at: doctor.created_at
        };
    });

    const columns = [
        { title: 'Doctor', field: 'name', minWidth: 200, headerFilter: 'input' },
        { title: 'Product Specialist', field: 'specialist', minWidth: 200, headerFilter: 'input' },
        { title: 'Line', field: 'line', width: 140, headerFilter: 'input' },
        { title: 'Product Specialist 2', field: 'specialist2', minWidth: 200, headerFilter: 'input', visible: false },
        { title: 'PS 2 Line', field: 'line2', width: 140, headerFilter: 'input', visible: false },
        { title: 'Product Specialist 3', field: 'specialist3', minWidth: 200, headerFilter: 'input', visible: false },
        { title: 'PS 3 Line', field: 'line3', width: 140, headerFilter: 'input', visible: false },
        { title: 'Product Specialist 4', field: 'specialist4', minWidth: 200, headerFilter: 'input', visible: false },
        { title: 'PS 4 Line', field: 'line4', width: 140, headerFilter: 'input', visible: false },
        { title: 'Product Specialist 5', field: 'specialist5', minWidth: 200, headerFilter: 'input', visible: false },
        { title: 'PS 5 Line', field: 'line5', width: 140, headerFilter: 'input', visible: false },
        { title: 'Specialty', field: 'specialty', width: 160, headerFilter: 'input' },
        { title: 'Phone', field: 'phone', width: 140, headerFilter: 'input' },
        { title: 'Email', field: 'email_address', width: 180, headerFilter: 'input' },
        { title: 'Status', field: 'status', formatter: tableFormatters.status, width: 140 },
        { title: 'Submitted', field: 'created_at', formatter: tableFormatters.date, width: 140 }
    ];

    state.tables.teamDoctors = createTable('team-doctor-table', columns, tableData, {
        height: 420
    });
    attachProductSpecialistToggle(state.tables.teamDoctors, {
        lineField: 'line',
        toggleFields: ['specialist2', 'line2', 'specialist3', 'line3', 'specialist4', 'line4', 'specialist5', 'line5'],
        storageKey: 'manager_team_doctors_ps_toggle'
    });
}

function renderTeamDoctorStats(doctors) {
    const container = document.getElementById('team-doctor-stats');
    if (!container) return;
    const approvedDoctors = doctors.filter((doctor) => doctor.status === APPROVAL_STATUS.APPROVED);
    const approved = approvedDoctors.length;
    const pending = doctors.filter(
        (doctor) => doctor.status === APPROVAL_STATUS.PENDING_MANAGER || doctor.status === APPROVAL_STATUS.PENDING_ADMIN
    ).length;
    const specialistCount = distinct(
        approvedDoctors
            .flatMap((doctor) => [
                doctor.owner_employee_id,
                doctor.secondary_employee_id,
                doctor.tertiary_employee_id,
                doctor.quaternary_employee_id,
                doctor.quinary_employee_id
            ])
            .filter(Boolean)
            .map((id) => String(id))
    ).length;

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
            <div class="value">${formatNumber(specialistCount)}</div>
        </div>
    `;
}

function renderTeamAccounts(options = {}) {
    const { refreshFilters = false } = options;
    if (refreshFilters) {
        renderTeamAccountFilters();
    }
    const filtered = getFilteredTeamAccounts();
    renderTeamAccountTable(filtered);
    renderTeamAccountStats(filtered);
}

function renderTeamAccountFilters() {
    const container = document.getElementById('team-account-filters');
    if (!container) return;
    const { specialist, accountType } = state.filters.accounts;
    const specialistOptions = state.specialists
        .map((member) => ({
            value: String(member.id),
            label: `${member.first_name} ${member.last_name}`.trim() || member.code || 'Specialist'
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

    if (specialist && !specialistOptions.some((option) => option.value === specialist)) {
        state.filters.accounts.specialist = '';
    }
    if (accountType && !ACCOUNT_TYPES.includes(accountType)) {
        state.filters.accounts.accountType = '';
    }
    const selectedSpecialist = state.filters.accounts.specialist;
    const selectedAccountType = state.filters.accounts.accountType;

    container.innerHTML = `
        <div class="filters-row">
            <select class="form-select form-select-sm" id="manager-filter-account-specialist" aria-label="Filter accounts by product specialist">
                <option value="">All Product Specialists</option>
                ${specialistOptions
                    .map(
                        (option) =>
                            `<option value="${option.value}"${
                                option.value === selectedSpecialist ? ' selected' : ''
                            }>${option.label}</option>`
                    )
                    .join('')}
            </select>
            <select class="form-select form-select-sm" id="manager-filter-account-type" aria-label="Filter accounts by account type">
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

    container.querySelector('#manager-filter-account-specialist')?.addEventListener('change', (event) => {
        state.filters.accounts.specialist = event.target.value;
        renderTeamAccounts();
    });
    container.querySelector('#manager-filter-account-type')?.addEventListener('change', (event) => {
        state.filters.accounts.accountType = event.target.value;
        renderTeamAccounts();
    });
}

function getFilteredTeamAccounts() {
    const { specialist, accountType } = state.filters.accounts;
    return state.accounts.filter((account) => {
        if (specialist) {
            const assignedIds = [
                account.owner_employee_id,
                account.secondary_employee_id,
                account.tertiary_employee_id
            ].filter(Boolean);
            if (!assignedIds.some((id) => String(id) === String(specialist))) return false;
        }
        if (accountType && (account.account_type || '') !== accountType) return false;
        return true;
    });
}

function renderTeamAccountTable(accounts) {
    const tableData = accounts.map((account) => {
        const getMemberName = (employeeId, fallback) => {
            if (!employeeId) return fallback || '';
            const member = state.teamMembersById?.get(String(employeeId)) || state.teamMembers.find((m) => m.id === employeeId);
            if (member) {
                const full = `${member.first_name} ${member.last_name}`.trim();
                return full || member.code || fallback || '';
            }
            return fallback || '';
        };
        const ownerName = getMemberName(account.owner_employee_id, account.owner_name || 'Unknown');
        const secondaryName = getMemberName(account.secondary_employee_id, account.secondary_owner_name || '');
        const tertiaryName = getMemberName(account.tertiary_employee_id, account.tertiary_owner_name || '');
        return {
            id: account.id,
            name: account.name,
            account_type: account.account_type,
            line: account.line_name || '',
            line2: account.secondary_line_name || '',
            line3: account.tertiary_line_name || '',
            specialist: ownerName || 'Unknown',
            specialist2: secondaryName,
            specialist3: tertiaryName,
            governorate: account.governorate,
            status: account.status,
            created_at: account.created_at
        };
    });

    const columns = [
        { title: 'Account', field: 'name', minWidth: 200, headerFilter: 'input' },
        { title: 'Product Specialist', field: 'specialist', minWidth: 200, headerFilter: 'input' },
        { title: 'Line', field: 'line', width: 140, headerFilter: 'input' },
        { title: 'Product Specialist 2', field: 'specialist2', minWidth: 200, headerFilter: 'input', visible: false },
        { title: 'PS 2 Line', field: 'line2', width: 140, headerFilter: 'input', visible: false },
        { title: 'Product Specialist 3', field: 'specialist3', minWidth: 200, headerFilter: 'input', visible: false },
        { title: 'PS 3 Line', field: 'line3', width: 140, headerFilter: 'input', visible: false },
        { title: 'Type', field: 'account_type', width: 130 },
        { title: 'Governorate', field: 'governorate', width: 150, headerFilter: 'input' },
        { title: 'Status', field: 'status', formatter: tableFormatters.status, width: 140 },
        { title: 'Submitted', field: 'created_at', formatter: tableFormatters.date, width: 140 }
    ];

    state.tables.teamAccounts = createTable('team-account-table', columns, tableData, {
        height: 420
    });
    attachProductSpecialistToggle(state.tables.teamAccounts, {
        lineField: 'line',
        toggleFields: ['specialist2', 'line2', 'specialist3', 'line3'],
        storageKey: 'manager_team_accounts_ps_toggle'
    });
}

function renderTeamAccountStats(accounts) {
    const container = document.getElementById('team-account-stats');
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
function renderTeamCases() {
    const filtered = getTeamFilteredCases();
    renderTeamCaseStats(filtered);
    renderTeamCasesTable(filtered);
}
function renderTeamCasesTable(cases = []) {
    const tableData = cases.map((caseItem) => buildCaseTableRow(caseItem, state.teamCaseProductsByCase));
    const columns = buildCaseTableColumns(tableFormatters);

    // Find case_code column index and insert actions after it
    const caseCodeIndex = columns.findIndex(col => col.field === 'case_code');
    if (caseCodeIndex !== -1 && !columns.some((column) => column.field === 'actions')) {
        columns.splice(caseCodeIndex + 1, 0, {
            title: 'Actions',
            field: 'actions',
            width: 120,
            hozAlign: 'center',
            formatter: tableFormatters.actions([
                {
                    name: 'view',
                    label: 'View',
                    icon: 'bi bi-eye',
                    variant: 'btn-gradient'
                }
            ]),
            headerSort: false
        });
    }

    state.tables.teamCases = createTable('team-cases-table', columns, tableData, {
        height: 520,
        initialSort: [{ column: 'created_at', dir: 'desc' }]
    });

    bindTableActions(state.tables.teamCases, {
        view: (rowData) => viewTeamCaseDetails(rowData.id)
    });

    attachProductsToggle(state.tables.teamCases, {
        anchorField: 'actions',
        storageKey: 'manager_team_cases_products_toggle'
    });
}

function viewTeamCaseDetails(id) {
    populateTeamCaseReview(id, {}, false);
}

function renderTeamCaseStats(cases = []) {
    const container = document.getElementById('team-cases-stats');
    if (!container) return;

    // Get dual-row filter values (EXACT COPY FROM ADMIN)
    const companyCompany = document.getElementById('team-filter-company-company')?.value || '';
    const companyCategory = document.getElementById('team-filter-company-category')?.value || '';
    const companySubCategory = document.getElementById('team-filter-company-sub-category')?.value || '';
    const companyProduct = document.getElementById('team-filter-company-product')?.value || '';

    const competitorCompany = document.getElementById('team-filter-competitor-company')?.value || '';
    const competitorCategory = document.getElementById('team-filter-competitor-category')?.value || '';
    const competitorSubCategory = document.getElementById('team-filter-competitor-sub-category')?.value || '';
    const competitorProduct = document.getElementById('team-filter-competitor-product')?.value || '';

    const companyType = document.getElementById('team-filter-company-type')?.value || '';

    let metrics;

    // EXACT COPY FROM ADMIN STATS CALCULATION LOGIC
    if (companyType === 'company') {
        // Show only company stats, set competitor to 0
        metrics = computeCaseMetrics(cases, state.teamCaseProductsByCase);
        metrics.competitorCaseCount = 0;
        metrics.competitorUnits = 0;
    } else if (companyType === 'competitor') {
        // Show only competitor stats, set company to 0
        metrics = computeCaseMetrics(cases, state.teamCaseProductsByCase);
        metrics.companyCaseCount = 0;
        metrics.companyUnits = 0;
    } else {
        // DUAL-ROW SPECIFIC STATS CALCULATION (EXACT COPY FROM ADMIN)
        const hasCompanyFilters = companyCompany || companyCategory || companySubCategory || companyProduct;
        const hasCompetitorFilters = competitorCompany || competitorCategory || competitorSubCategory || competitorProduct;

        if (hasCompanyFilters || hasCompetitorFilters) {
            // Filter cases for company stats (Row 2 selections only)
            let companyCases = cases;
            if (hasCompanyFilters) {
                companyCases = cases.filter(caseItem => {
                    const products = state.teamCaseProductsByCase.get(caseItem.id) || [];
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

            // Filter cases for competitor stats (Row 3 selections only)
            let competitorCases = cases;
            if (hasCompetitorFilters) {
                competitorCases = cases.filter(caseItem => {
                    const products = state.teamCaseProductsByCase.get(caseItem.id) || [];
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
            let companyMetrics;
            if (hasCompanyFilters) {
                // Calculate company units from individual products matching ALL company filters
                let companyUnitsFromProducts = 0;
                let companyCaseCount = 0;
                companyCases.forEach(caseItem => {
                    const products = state.teamCaseProductsByCase.get(caseItem.id) || [];
                    const matchingProducts = products.filter(product => {
                        if (!product.is_company_product) return false;
                        if (companyCompany && (product.company_name || '') !== companyCompany) return false;
                        if (companyCategory && (product.category || '') !== companyCategory) return false;
                        if (companySubCategory && (product.sub_category || '') !== companySubCategory) return false;
                        if (companyProduct && String(product.product_id) !== companyProduct && product.product_name !== companyProduct) return false;
                        return true;
                    });
                    if (matchingProducts.length > 0) {
                        companyCaseCount++;
                        matchingProducts.forEach(p => companyUnitsFromProducts += p.units || 0);
                    }
                });
                companyMetrics = computeCaseMetrics(companyCases, state.teamCaseProductsByCase);
                companyMetrics.companyUnits = companyUnitsFromProducts;
                companyMetrics.companyCaseCount = companyCaseCount;
            } else {
                companyMetrics = computeCaseMetrics(companyCases, state.teamCaseProductsByCase);
            }

            // FIX: When filtering by ANY competitor filter, calculate units from individual products
            let competitorMetrics;
            if (hasCompetitorFilters) {
                // Calculate competitor units from individual products matching ALL competitor filters
                let competitorUnitsFromProducts = 0;
                let competitorCaseCount = 0;
                competitorCases.forEach(caseItem => {
                    const products = state.teamCaseProductsByCase.get(caseItem.id) || [];
                    const matchingProducts = products.filter(product => {
                        if (product.is_company_product) return false;
                        if (competitorCompany && (product.company_name || '') !== competitorCompany) return false;
                        if (competitorCategory && (product.category || '') !== competitorCategory) return false;
                        if (competitorSubCategory && (product.sub_category || '') !== competitorSubCategory) return false;
                        if (competitorProduct && String(product.product_id) !== competitorProduct && product.product_name !== competitorProduct) return false;
                        return true;
                    });
                    if (matchingProducts.length > 0) {
                        competitorCaseCount++;
                        matchingProducts.forEach(p => competitorUnitsFromProducts += p.units || 0);
                    }
                });
                competitorMetrics = computeCaseMetrics(competitorCases, state.teamCaseProductsByCase);
                competitorMetrics.competitorUnits = competitorUnitsFromProducts;
                competitorMetrics.competitorCaseCount = competitorCaseCount;
            } else {
                competitorMetrics = computeCaseMetrics(competitorCases, state.teamCaseProductsByCase);
            }

            // Calculate mixed cases between Row 2 and Row 3 selections specifically
            let mixedCaseCount = 0;
            if (hasCompanyFilters && hasCompetitorFilters) {
                // Mixed cases = cases that match BOTH Row 2 AND Row 3 selections
                mixedCaseCount = cases.filter(caseItem => {
                    const products = state.teamCaseProductsByCase.get(caseItem.id) || [];

                    // Check if case has products matching Row 2 (company) selection
                    const hasCompanyMatch = products.some(product => {
                        if (!product.is_company_product) return false;
                        if (companyCompany && (product.company_name || '') !== companyCompany) return false;
                        if (companyCategory && (product.category || '') !== companyCategory) return false;
                        if (companySubCategory && (product.sub_category || '') !== companySubCategory) return false;
                        if (companyProduct && String(product.product_id) !== companyProduct && product.product_name !== companyProduct) return false;
                        return true;
                    });

                    // Check if case has products matching Row 3 (competitor) selection
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
                mixedCaseCount = computeCaseMetrics(cases, state.teamCaseProductsByCase).mixedCaseCount;
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
            metrics = computeCaseMetrics(cases, state.teamCaseProductsByCase);
        }
    }

    container.innerHTML = `
        <div class="stat-card">
            <h4>DMC Cases</h4>
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
            <h4>DMC Units</h4>
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

function getTeamFilteredCases() {
    // Row 1 filters
    const specialist = document.getElementById('team-filter-specialist')?.value;
    const manager = document.getElementById('team-filter-manager')?.value;
    const accountType = document.getElementById('team-filter-account-type')?.value;
    const companyType = document.getElementById('team-filter-company-type')?.value;

    // Text search filters
    const doctorNameSearch = document.getElementById('team-filter-doctor-name')?.value.trim().toLowerCase() || '';
    const accountNameSearch = document.getElementById('team-filter-account-name')?.value.trim().toLowerCase() || '';

    // Company row filters (Row 2)
    const companyCompany = document.getElementById('team-filter-company-company')?.value;
    const companyCategory = document.getElementById('team-filter-company-category')?.value;
    const companySubCategory = document.getElementById('team-filter-company-sub-category')?.value;
    const companyProduct = document.getElementById('team-filter-company-product')?.value;

    // Competitor row filters (Row 3)
    const competitorCompany = document.getElementById('team-filter-competitor-company')?.value;
    const competitorCategory = document.getElementById('team-filter-competitor-category')?.value;
    const competitorSubCategory = document.getElementById('team-filter-competitor-sub-category')?.value;
    const competitorProduct = document.getElementById('team-filter-competitor-product')?.value;

    // Date filters (Row 4)
    const monthValue = document.getElementById('team-filter-month')?.value;
    const fromValue = document.getElementById('team-filter-from')?.value;
    const toValue = document.getElementById('team-filter-to')?.value;

    const monthNumber = monthValue ? Number(monthValue) : null;
    const fromDate = fromValue ? new Date(fromValue) : null;
    const toDate = toValue ? new Date(toValue) : null;

    // Check if any company row filters are selected
    const hasCompanyFilters = companyCompany || companyCategory || companySubCategory || companyProduct;
    // Check if any competitor row filters are selected
    const hasCompetitorFilters = competitorCompany || competitorCategory || competitorSubCategory || competitorProduct;

    return state.teamCases.filter((caseItem) => {
        // Row 1 filters
        if (specialist && caseItem.submitted_by_id !== specialist) return false;
        if (accountType && caseItem.account_type !== accountType) return false;
        if (manager) {
            const submitter =
                state.teamMembersById?.get(String(caseItem.submitted_by_id)) ||
                state.teamMembers.find((member) => String(member.id) === String(caseItem.submitted_by_id));
            const directManagerId = submitter?.direct_manager_id ? String(submitter.direct_manager_id) : '';
            const lineManagerId = submitter?.line_manager_id ? String(submitter.line_manager_id) : '';
            if (manager !== directManagerId && manager !== lineManagerId) {
                return false;
            }
        }

        // Text search filters
        if (doctorNameSearch && !(caseItem.doctor_name || '').toLowerCase().includes(doctorNameSearch)) {
            return false;
        }
        if (accountNameSearch && !(caseItem.account_name || '').toLowerCase().includes(accountNameSearch)) {
            return false;
        }

        const products = state.teamCaseProductsByCase.get(caseItem.id) || [];

        // Company Type filter
        if (companyType === 'company') {
            if (!products.some(product => product.is_company_product)) return false;
        } else if (companyType === 'competitor') {
            if (!products.some(product => !product.is_company_product)) return false;
        }

        // Dual-row filter logic: OR condition between company and competitor rows
        if (hasCompanyFilters || hasCompetitorFilters) {
            let matchesCompanyRow = false;
            let matchesCompetitorRow = false;

            // Check company row match
            if (hasCompanyFilters) {
                matchesCompanyRow = products.some(product => {
                    if (!product.is_company_product) return false;
                    if (companyCompany && product.company_name !== companyCompany) return false;
                    if (companyCategory && product.category !== companyCategory) return false;
                    if (companySubCategory && product.sub_category !== companySubCategory) return false;
                    if (companyProduct && String(product.product_id) !== companyProduct) return false;
                    return true;
                });
            }

            // Check competitor row match
            if (hasCompetitorFilters) {
                matchesCompetitorRow = products.some(product => {
                    if (product.is_company_product) return false;
                    if (competitorCompany && product.company_name !== competitorCompany) return false;
                    if (competitorCategory && product.category !== competitorCategory) return false;
                    if (competitorSubCategory && product.sub_category !== competitorSubCategory) return false;
                    if (competitorProduct && String(product.product_id) !== competitorProduct) return false;
                    return true;
                });
            }

            // OR logic: case must match at least one row that has filters
            if (hasCompanyFilters && hasCompetitorFilters) {
                if (!matchesCompanyRow && !matchesCompetitorRow) return false;
            } else if (hasCompanyFilters && !matchesCompanyRow) {
                return false;
            } else if (hasCompetitorFilters && !matchesCompetitorRow) {
                return false;
            }
        }

        // Date filters
        const caseDate = new Date(caseItem.case_date);
        if (monthNumber && caseDate.getMonth() + 1 !== monthNumber) return false;
        if (fromDate && caseDate < fromDate) return false;
        if (toDate && caseDate > toDate) return false;
        return true;
    });
}
function setupTeamFilters() {
    const casesFilters = document.getElementById('team-cases-filters');
    if (!casesFilters) return;

    const specialistOptions = state.specialists
        .map((member) => `<option value="${member.id}">${member.first_name} ${member.last_name}</option>`)
        .join('');
    const managerMap = new Map();
    const sessionManagerLabel =
        (state.session.employee?.fullName || state.session.username || 'My Direct Reports').trim();
    managerMap.set(String(state.session.employeeId), sessionManagerLabel);
    state.teamMembers
        .filter((member) => member.role === ROLES.MANAGER)
        .forEach((member) => {
            const label = `${member.first_name} ${member.last_name}`.trim() || member.code || 'Manager';
            managerMap.set(String(member.id), label);
        });
    const managerOptions = Array.from(managerMap.entries())
        .map(([value, label]) => `<option value="${value}">${label}</option>`)
        .join('');
    const { company, competitor } = collectDualRowFilterOptions(state.teamCaseProducts, state.products);

    casesFilters.innerHTML = `
        <div class="filters-row">
            <select class="form-select" id="team-filter-specialist">
                <option value="">All Specialists</option>
                ${specialistOptions}
            </select>
            <select class="form-select" id="team-filter-manager">
                <option value="">All Managers</option>
                ${managerOptions}
            </select>
            <select class="form-select" id="team-filter-account-type">
                <option value="">All Account Types</option>
                ${ACCOUNT_TYPES.map((type) => `<option value="${type}">${type}</option>`).join('')}
            </select>
            <select class="form-select" id="team-filter-company-type">
                <option value="">All Company Types</option>
                <option value="company">Company</option>
                <option value="competitor">Competitor</option>
            </select>
        </div>

        <!-- Company Filters Row -->
        <div class="filters-row">
            <select class="form-select" id="team-filter-company-company">
                <option value="">All Companies</option>
                ${company.companies.map(comp => `<option value="${comp}">${comp}</option>`).join('')}
            </select>
            <select class="form-select" id="team-filter-company-category">
                <option value="">All Categories</option>
                ${company.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
            </select>
            <select class="form-select" id="team-filter-company-sub-category">
                <option value="">All Sub Categories</option>
                ${company.subCategories.map(sub => `<option value="${sub}">${sub}</option>`).join('')}
            </select>
            <select class="form-select" id="team-filter-company-product">
                <option value="">All Products</option>
                ${company.productOptions.map(option => `<option value="${option.value}">${option.label}</option>`).join('')}
            </select>
        </div>

        <!-- Competitor Filters Row -->
        <div class="filters-row">
            <select class="form-select" id="team-filter-competitor-company">
                <option value="">All Companies</option>
                ${competitor.companies.map(comp => `<option value="${comp}">${comp}</option>`).join('')}
            </select>
            <select class="form-select" id="team-filter-competitor-category">
                <option value="">All Categories</option>
                ${competitor.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
            </select>
            <select class="form-select" id="team-filter-competitor-sub-category">
                <option value="">All Sub Categories</option>
                ${competitor.subCategories.map(sub => `<option value="${sub}">${sub}</option>`).join('')}
            </select>
            <select class="form-select" id="team-filter-competitor-product">
                <option value="">All Products</option>
                ${competitor.productOptions.map(option => `<option value="${option.value}">${option.label}</option>`).join('')}
            </select>
        </div>

        <div class="filters-row">
            <select class="form-select" id="team-filter-month">
                <option value="">Any Month</option>
                ${Array.from({ length: 12 }, (_, index) => {
                    const month = index + 1;
                    const label = new Date(2000, index).toLocaleString(undefined, { month: 'long' });
                    return `<option value="${month}">${label}</option>`;
                }).join('')}
            </select>
            <input type="date" class="form-control" id="team-filter-from">
            <input type="date" class="form-control" id="team-filter-to">
            <div></div>
        </div>

        <!-- Doctor and Account Name Filters Row -->
        <div class="filters-row" style="grid-template-columns: 1fr 1fr 1fr 1fr;">
            <input type="text" class="form-control" id="team-filter-doctor-name" placeholder="Search Doctor Name...">
            <input type="text" class="form-control" id="team-filter-account-name" placeholder="Search Account Name...">
            <div></div>
            <div></div>
        </div>

        <!-- Reset and Export Buttons Row -->
        <div class="filters-row" style="grid-template-columns: 1fr;">
            <div class="filters-actions" style="justify-self: end;">
                <button class="btn btn-outline-ghost" id="team-filter-reset">Reset</button>
                <button class="btn btn-outline-ghost" id="team-cases-export"><i class="bi bi-download me-2"></i>Export</button>
            </div>
        </div>
    `;

    // Dual-row cascading filter logic (EXACT COPY FROM ADMIN)
    const setupDualRowCascadingFilters = () => {
        // Company row cascading filters
        const companyCompanySelect = casesFilters.querySelector('#team-filter-company-company');
        const companyCategorySelect = casesFilters.querySelector('#team-filter-company-category');
        const companySubCategorySelect = casesFilters.querySelector('#team-filter-company-sub-category');
        const companyProductSelect = casesFilters.querySelector('#team-filter-company-product');

        // Competitor row cascading filters
        const competitorCompanySelect = casesFilters.querySelector('#team-filter-competitor-company');
        const competitorCategorySelect = casesFilters.querySelector('#team-filter-competitor-category');
        const competitorSubCategorySelect = casesFilters.querySelector('#team-filter-competitor-sub-category');
        const competitorProductSelect = casesFilters.querySelector('#team-filter-competitor-product');

        // Company row cascading logic (EXACT COPY FROM ADMIN)
        const updateCompanyCascading = () => {
            const selectedCompany = companyCompanySelect.value;
            const selectedCategory = companyCategorySelect.value;
            const selectedSubCategory = companySubCategorySelect.value;

            // Update categories based on company (or show all if no company selected)
            if (selectedCompany) {
                const filteredCategories = [...new Set(
                    state.teamCaseProducts
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
                state.teamCaseProducts
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

            const filteredProducts = state.teamCaseProducts
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

        // Competitor row cascading logic (EXACT COPY FROM ADMIN)
        const updateCompetitorCascading = () => {
            const selectedCompany = competitorCompanySelect.value;
            const selectedCategory = competitorCategorySelect.value;
            const selectedSubCategory = competitorSubCategorySelect.value;

            // Update categories based on company (or show all if no company selected)
            if (selectedCompany) {
                const filteredCategories = [...new Set(
                    state.teamCaseProducts
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
                state.teamCaseProducts
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

            const filteredProducts = state.teamCaseProducts
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
        companyCompanySelect?.addEventListener('change', () => { updateCompanyCascading(); handleChange(); });
        companyCategorySelect?.addEventListener('change', () => { updateCompanyCascading(); handleChange(); });
        companySubCategorySelect?.addEventListener('change', () => { updateCompanyCascading(); handleChange(); });
        companyProductSelect?.addEventListener('change', handleChange);

        // Competitor row event listeners
        competitorCompanySelect?.addEventListener('change', () => { updateCompetitorCascading(); handleChange(); });
        competitorCategorySelect?.addEventListener('change', () => { updateCompetitorCascading(); handleChange(); });
        competitorSubCategorySelect?.addEventListener('change', () => { updateCompetitorCascading(); handleChange(); });
        competitorProductSelect?.addEventListener('change', handleChange);


    };

    const handleChange = () => renderTeamCases();

    // Setup non-cascading filter event listeners (EXACT COPY FROM ADMIN)
    casesFilters.querySelector('#team-filter-specialist')?.addEventListener('change', handleChange);
    casesFilters.querySelector('#team-filter-manager')?.addEventListener('change', handleChange);
    casesFilters.querySelector('#team-filter-account-type')?.addEventListener('change', handleChange);
    casesFilters.querySelector('#team-filter-company-type')?.addEventListener('change', handleChange);
    casesFilters.querySelector('#team-filter-month')?.addEventListener('change', handleChange);
    casesFilters.querySelector('#team-filter-from')?.addEventListener('change', handleChange);
    casesFilters.querySelector('#team-filter-to')?.addEventListener('change', handleChange);

    // Text search filters with input event for real-time filtering
    casesFilters.querySelector('#team-filter-doctor-name')?.addEventListener('input', handleChange);
    casesFilters.querySelector('#team-filter-account-name')?.addEventListener('input', handleChange);

    setupDualRowCascadingFilters();
    casesFilters.querySelector('#team-filter-reset').addEventListener('click', () => {
        casesFilters.querySelectorAll('select, input').forEach((input) => (input.value = ''));

        // Reset dual-row filter options to show all options
        // Company row
        const companyCategorySelect = casesFilters.querySelector('#team-filter-company-category');
        const companySubCategorySelect = casesFilters.querySelector('#team-filter-company-sub-category');
        const companyProductSelect = casesFilters.querySelector('#team-filter-company-product');

        if (companyCategorySelect) {
            companyCategorySelect.innerHTML = `
                <option value="">All Categories</option>
                ${company.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
            `;
        }

        if (companySubCategorySelect) {
            companySubCategorySelect.innerHTML = `
                <option value="">All Sub Categories</option>
                ${company.subCategories.map(sub => `<option value="${sub}">${sub}</option>`).join('')}
            `;
        }

        if (companyProductSelect) {
            companyProductSelect.innerHTML = `
                <option value="">All Products</option>
                ${company.productOptions.map(option => `<option value="${option.value}">${option.label}</option>`).join('')}
            `;
        }

        // Competitor row
        const competitorCategorySelect = casesFilters.querySelector('#team-filter-competitor-category');
        const competitorSubCategorySelect = casesFilters.querySelector('#team-filter-competitor-sub-category');
        const competitorProductSelect = casesFilters.querySelector('#team-filter-competitor-product');

        if (competitorCategorySelect) {
            competitorCategorySelect.innerHTML = `
                <option value="">All Categories</option>
                ${competitor.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
            `;
        }

        if (competitorSubCategorySelect) {
            competitorSubCategorySelect.innerHTML = `
                <option value="">All Sub Categories</option>
                ${competitor.subCategories.map(sub => `<option value="${sub}">${sub}</option>`).join('')}
            `;
        }

        if (competitorProductSelect) {
            competitorProductSelect.innerHTML = `
                <option value="">All Products</option>
                ${competitor.productOptions.map(option => `<option value="${option.value}">${option.label}</option>`).join('')}
            `;
        }

        handleChange();
    });
    casesFilters.querySelector('#team-cases-export').addEventListener('click', () => {
        const filtered = getTeamFilteredCases();
        const rows = buildCaseExportRows(filtered, state.teamCaseProductsByCase);
        downloadAsExcel('team_cases', rows, CASE_EXPORT_HEADERS);
    });

    // Export button above stats cards
    document.getElementById('team-cases-export-table')?.addEventListener('click', () => {
        const filtered = getTeamFilteredCases();
        const rows = buildCaseExportRows(filtered, state.teamCaseProductsByCase);
        downloadAsExcel('team_cases', rows, CASE_EXPORT_HEADERS);
    });

    handleChange();
}

function setupManagerCaseFilters() {
    const container = document.getElementById('manager-cases-filters');
    if (!container) return;

    // Store previous selections before re-rendering
    const previousSelections = {
        status: document.getElementById('manager-filter-status')?.value || '',
        accountType: document.getElementById('manager-filter-account-type')?.value || '',
        companyType: document.getElementById('manager-filter-company-type')?.value || '',
        companyCompany: document.getElementById('manager-filter-company-company')?.value || '',
        companyCategory: document.getElementById('manager-filter-company-category')?.value || '',
        companySubCategory: document.getElementById('manager-filter-company-sub-category')?.value || '',
        companyProduct: document.getElementById('manager-filter-company-product')?.value || '',
        competitorCompany: document.getElementById('manager-filter-competitor-company')?.value || '',
        competitorCategory: document.getElementById('manager-filter-competitor-category')?.value || '',
        competitorSubCategory: document.getElementById('manager-filter-competitor-sub-category')?.value || '',
        competitorProduct: document.getElementById('manager-filter-competitor-product')?.value || '',
        month: document.getElementById('manager-filter-month')?.value || '',
        from: document.getElementById('manager-filter-from')?.value || '',
        to: document.getElementById('manager-filter-to')?.value || ''
    };

    const { company, competitor } = collectDualRowFilterOptions(state.myCaseProducts, state.products);

    container.innerHTML = `
        <div class="filters-row">
            <select class="form-select" id="manager-filter-status">
                <option value="">All Status</option>
                ${Object.values(APPROVAL_STATUS)
                    .map((status) => `<option value="${status}">${status.replace('_', ' ')}</option>`)
                    .join('')}
            </select>
            <div style="grid-column: span 1;"></div>
            <select class="form-select" id="manager-filter-account-type">
                <option value="">All Account Types</option>
                ${ACCOUNT_TYPES.map((type) => `<option value="${type}">${type}</option>`).join('')}
            </select>
            <select class="form-select" id="manager-filter-company-type">
                <option value="">All Company Types</option>
                <option value="company">Company</option>
                <option value="competitor">Competitor</option>
            </select>
        </div>

        <!-- Company Filters Row -->
        <div class="filters-row">
            <select class="form-select" id="manager-filter-company-company">
                <option value="">All Companies</option>
                ${company.companies.map(comp => `<option value="${comp}">${comp}</option>`).join('')}
            </select>
            <select class="form-select" id="manager-filter-company-category">
                <option value="">All Categories</option>
                ${company.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
            </select>
            <select class="form-select" id="manager-filter-company-sub-category">
                <option value="">All Sub Categories</option>
                ${company.subCategories.map(sub => `<option value="${sub}">${sub}</option>`).join('')}
            </select>
            <select class="form-select" id="manager-filter-company-product">
                <option value="">All Products</option>
                ${company.productOptions.map(option => `<option value="${option.value}">${option.label}</option>`).join('')}
            </select>
        </div>

        <!-- Competitor Filters Row -->
        <div class="filters-row">
            <select class="form-select" id="manager-filter-competitor-company">
                <option value="">All Companies</option>
                ${competitor.companies.map(comp => `<option value="${comp}">${comp}</option>`).join('')}
            </select>
            <select class="form-select" id="manager-filter-competitor-category">
                <option value="">All Categories</option>
                ${competitor.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
            </select>
            <select class="form-select" id="manager-filter-competitor-sub-category">
                <option value="">All Sub Categories</option>
                ${competitor.subCategories.map(sub => `<option value="${sub}">${sub}</option>`).join('')}
            </select>
            <select class="form-select" id="manager-filter-competitor-product">
                <option value="">All Products</option>
                ${competitor.productOptions.map(option => `<option value="${option.value}">${option.label}</option>`).join('')}
            </select>
        </div>

        <div class="filters-row">
            <select class="form-select" id="manager-filter-month">
                <option value="">Any Month</option>
                ${Array.from({ length: 12 }, (_, index) => {
                    const month = index + 1;
                    const label = new Date(2000, index).toLocaleString(undefined, { month: 'long' });
                    return `<option value="${month}">${label}</option>`;
                }).join('')}
            </select>
            <input type="date" class="form-control" id="manager-filter-from">
            <input type="date" class="form-control" id="manager-filter-to">
            <div class="filters-actions" style="justify-self: end;">
                <button class="btn btn-outline-ghost" id="manager-filter-reset">Reset</button>
                <button class="btn btn-outline-ghost" id="manager-cases-export"><i class="bi bi-download me-2"></i>Export</button>
            </div>
        </div>
    `;

    // Dual-row cascading filter logic
    const setupDualRowCascadingFilters = () => {
        // Company row cascading filters
        const companyCompanySelect = container.querySelector('#manager-filter-company-company');
        const companyCategorySelect = container.querySelector('#manager-filter-company-category');
        const companySubCategorySelect = container.querySelector('#manager-filter-company-sub-category');
        const companyProductSelect = container.querySelector('#manager-filter-company-product');

        // Competitor row cascading filters
        const competitorCompanySelect = container.querySelector('#manager-filter-competitor-company');
        const competitorCategorySelect = container.querySelector('#manager-filter-competitor-category');
        const competitorSubCategorySelect = container.querySelector('#manager-filter-competitor-sub-category');
        const competitorProductSelect = container.querySelector('#manager-filter-competitor-product');

        // Company row cascading logic (EXACT COPY FROM ADMIN)
        const updateCompanyCascading = () => {
            const selectedCompany = companyCompanySelect.value;
            const selectedCategory = companyCategorySelect.value;
            const selectedSubCategory = companySubCategorySelect.value;

            // Update categories based on company (or show all if no company selected)
            if (selectedCompany) {
                const filteredCategories = [...new Set(
                    state.myCaseProducts
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
                state.myCaseProducts
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

            const filteredProducts = state.myCaseProducts
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

        // Company row event listeners
        companyCompanySelect?.addEventListener('change', () => { updateCompanyCascading(); handleChange(); });
        companyCategorySelect?.addEventListener('change', () => { updateCompanyCascading(); handleChange(); });
        companySubCategorySelect?.addEventListener('change', () => { updateCompanyCascading(); handleChange(); });
        companyProductSelect?.addEventListener('change', handleChange);

        // Competitor row cascading logic (EXACT COPY FROM ADMIN)
        const updateCompetitorCascading = () => {
            const selectedCompany = competitorCompanySelect.value;
            const selectedCategory = competitorCategorySelect.value;
            const selectedSubCategory = competitorSubCategorySelect.value;

            // Update categories based on company (or show all if no company selected)
            if (selectedCompany) {
                const filteredCategories = [...new Set(
                    state.myCaseProducts
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
                state.myCaseProducts
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

            const filteredProducts = state.myCaseProducts
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

        // Competitor row event listeners
        competitorCompanySelect?.addEventListener('change', () => { updateCompetitorCascading(); handleChange(); });
        competitorCategorySelect?.addEventListener('change', () => { updateCompetitorCascading(); handleChange(); });
        competitorSubCategorySelect?.addEventListener('change', () => { updateCompetitorCascading(); handleChange(); });
        competitorProductSelect?.addEventListener('change', handleChange);
    };

    const handleChange = () => {
        const filtered = getManagerFilteredCases();
        renderMyCaseStats(filtered);
        renderMyCasesTable(filtered);
    };

    // Setup other filter event listeners (non-cascading)
    container.querySelector('#manager-filter-status')?.addEventListener('change', handleChange);
    container.querySelector('#manager-filter-account-type')?.addEventListener('change', handleChange);
    container.querySelector('#manager-filter-company-type')?.addEventListener('change', handleChange);
    container.querySelector('#manager-filter-month')?.addEventListener('change', handleChange);
    container.querySelector('#manager-filter-from')?.addEventListener('change', handleChange);
    container.querySelector('#manager-filter-to')?.addEventListener('change', handleChange);

    setupDualRowCascadingFilters();
    container.querySelector('#manager-filter-reset').addEventListener('click', () => {
        container.querySelectorAll('select, input').forEach((input) => (input.value = ''));

        // Reset dual-row filter options to show all options
        // Company row
        const companyCategorySelect = container.querySelector('#manager-filter-company-category');
        const companySubCategorySelect = container.querySelector('#manager-filter-company-sub-category');
        const companyProductSelect = container.querySelector('#manager-filter-company-product');

        if (companyCategorySelect) {
            companyCategorySelect.innerHTML = `
                <option value="">All Categories</option>
                ${company.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
            `;
        }

        if (companySubCategorySelect) {
            companySubCategorySelect.innerHTML = `
                <option value="">All Sub Categories</option>
                ${company.subCategories.map(sub => `<option value="${sub}">${sub}</option>`).join('')}
            `;
        }

        if (companyProductSelect) {
            companyProductSelect.innerHTML = `
                <option value="">All Products</option>
                ${company.productOptions.map(option => `<option value="${option.value}">${option.label}</option>`).join('')}
            `;
        }

        // Competitor row
        const competitorCategorySelect = container.querySelector('#manager-filter-competitor-category');
        const competitorSubCategorySelect = container.querySelector('#manager-filter-competitor-sub-category');
        const competitorProductSelect = container.querySelector('#manager-filter-competitor-product');

        if (competitorCategorySelect) {
            competitorCategorySelect.innerHTML = `
                <option value="">All Categories</option>
                ${competitor.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
            `;
        }

        if (competitorSubCategorySelect) {
            competitorSubCategorySelect.innerHTML = `
                <option value="">All Sub Categories</option>
                ${competitor.subCategories.map(sub => `<option value="${sub}">${sub}</option>`).join('')}
            `;
        }

        if (competitorProductSelect) {
            competitorProductSelect.innerHTML = `
                <option value="">All Products</option>
                ${competitor.productOptions.map(option => `<option value="${option.value}">${option.label}</option>`).join('')}
            `;
        }

        handleChange();
    });
    container.querySelector('#manager-cases-export').addEventListener('click', () => {
        const filtered = getManagerFilteredCases();
        const rows = buildCaseExportRows(filtered, state.myCaseProductsByCase);
        downloadAsExcel('manager_cases', rows, CASE_EXPORT_HEADERS);
    });

    // Export button above stats cards
    document.getElementById('manager-cases-export-table')?.addEventListener('click', () => {
        const filtered = getManagerFilteredCases();
        const rows = buildCaseExportRows(filtered, state.myCaseProductsByCase);
        downloadAsExcel('manager_cases', rows, CASE_EXPORT_HEADERS);
    });

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

    setSelectValue('#manager-filter-status', previousSelections.status);
    setSelectValue('#manager-filter-account-type', previousSelections.accountType);
    setSelectValue('#manager-filter-company-type', previousSelections.companyType);

    // Dual-row filter preservation
    setSelectValue('#manager-filter-company-company', previousSelections.companyCompany);
    setSelectValue('#manager-filter-company-category', previousSelections.companyCategory);
    setSelectValue('#manager-filter-company-sub-category', previousSelections.companySubCategory);
    setSelectValue('#manager-filter-company-product', previousSelections.companyProduct);

    setSelectValue('#manager-filter-competitor-company', previousSelections.competitorCompany);
    setSelectValue('#manager-filter-competitor-category', previousSelections.competitorCategory);
    setSelectValue('#manager-filter-competitor-sub-category', previousSelections.competitorSubCategory);
    setSelectValue('#manager-filter-competitor-product', previousSelections.competitorProduct);

    setSelectValue('#manager-filter-month', previousSelections.month);

    const fromInput = container.querySelector('#manager-filter-from');
    if (fromInput) fromInput.value = previousSelections.from || '';
    const toInput = container.querySelector('#manager-filter-to');
    if (toInput) toInput.value = previousSelections.to || '';

    handleChange();
}

function getManagerFilteredCases() {
    const status = document.getElementById('manager-filter-status')?.value;
    const accountType = document.getElementById('manager-filter-account-type')?.value;
    const companyType = document.getElementById('manager-filter-company-type')?.value;
    const monthValue = document.getElementById('manager-filter-month')?.value;
    const periodFrom = document.getElementById('manager-filter-from')?.value;
    const periodTo = document.getElementById('manager-filter-to')?.value;

    // Dual-row filter values
    const companyCompany = document.getElementById('manager-filter-company-company')?.value;
    const companyCategory = document.getElementById('manager-filter-company-category')?.value;
    const companySubCategory = document.getElementById('manager-filter-company-sub-category')?.value;
    const companyProduct = document.getElementById('manager-filter-company-product')?.value;

    const competitorCompany = document.getElementById('manager-filter-competitor-company')?.value;
    const competitorCategory = document.getElementById('manager-filter-competitor-category')?.value;
    const competitorSubCategory = document.getElementById('manager-filter-competitor-sub-category')?.value;
    const competitorProduct = document.getElementById('manager-filter-competitor-product')?.value;

    const monthNumber = monthValue ? Number(monthValue) : null;
    const fromDate = periodFrom ? new Date(periodFrom) : null;
    const toDate = periodTo ? new Date(periodTo) : null;

    return state.myCases.filter((caseItem) => {
        if (status && caseItem.status !== status) return false;
        if (accountType && caseItem.account_type !== accountType) return false;

        const products = state.myCaseProductsByCase.get(caseItem.id) || [];

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

        // DUAL-ROW MULTI-SELECTION FILTER LOGIC (EXACT COPY FROM ADMIN):
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
function setupTeamApprovalsFilters() {
    const container = document.getElementById('team-approvals-filters');
    if (!container) return;

    container.innerHTML = `
        <div class="filters-row">
            <select class="form-select" id="team-approvals-filter-type">
                <option value="">All Types</option>
                <option value="doctor">Doctor</option>
                <option value="account">Account</option>
                <option value="case">Case</option>
            </select>
            <select class="form-select" id="team-approvals-filter-status">
                <option value="">All Status</option>
                ${Object.values(APPROVAL_STATUS)
                    .map((status) => `<option value="${status}">${status.replace('_', ' ')}</option>`)
                    .join('')}
            </select>
        </div>
    `;

    container.querySelector('#team-approvals-filter-type')?.addEventListener('change', renderTeamApprovalsTable);
    container.querySelector('#team-approvals-filter-status')?.addEventListener('change', renderTeamApprovalsTable);
}

function renderTeamApprovalsTable() {
    const typeFilter = document.getElementById('team-approvals-filter-type')?.value;
    const statusFilter = document.getElementById('team-approvals-filter-status')?.value;

    let filteredData = state.approvals;
    if (typeFilter) {
        filteredData = filteredData.filter((item) => item.type === typeFilter);
    }
    if (statusFilter) {
        filteredData = filteredData.filter((item) => item.status === statusFilter);
    }

    const columns = [
        { title: 'Type', field: 'type', width: 120 },
        { title: 'Name', field: 'name', minWidth: 200, headerFilter: 'input' },
        { title: 'Product Specialist', field: 'ownerName', minWidth: 200, headerFilter: 'input' },
        { title: 'Status', field: 'status', formatter: tableFormatters.status, width: 140 },
        { title: 'Submitted', field: 'created_at', formatter: tableFormatters.date, width: 140 },
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

    state.tables.teamApprovals = createTable('team-approvals-table', columns, filteredData, {
        height: 420,
        initialSort: [{ column: 'created_at', dir: 'desc' }]
    });
    bindTableActions(state.tables.teamApprovals, {
        review: (rowData) => reviewTeamApproval(rowData),
        approve: (rowData) => handleTeamApproval(rowData, true),
        reject: (rowData) => handleTeamApproval(rowData, false)
    });
}

async function handleTeamApproval(record, approve = true) {
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
                            status: APPROVAL_STATUS.PENDING_ADMIN,
                            manager_id: state.session.employeeId,
                            manager_comment: comment,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', record.id),
                    'manager doctor approval'
                );
                await removeManagerNotification('doctor', record.id);
                await notifyAdminUsers('doctor', record.id, record.name);
            } else {
                await handleSupabase(
                    supabase
                        .from('doctors')
                        .delete()
                        .eq('id', record.id),
                    'delete rejected doctor'
                );
                await removeManagerNotification('doctor', record.id);
            }
        }

        if (record.type === 'account') {
            if (approve) {
                await handleSupabase(
                    supabase
                        .from('accounts')
                        .update({
                            status: APPROVAL_STATUS.PENDING_ADMIN,
                            manager_id: state.session.employeeId,
                            manager_comment: comment,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', record.id),
                    'manager account approval'
                );
                await removeManagerNotification('account', record.id);
                await notifyAdminUsers('account', record.id, record.name);
            } else {
                await handleSupabase(
                    supabase
                        .from('accounts')
                        .delete()
                        .eq('id', record.id),
                    'delete rejected account'
                );
                await removeManagerNotification('account', record.id);
            }
        }

        if (record.type === 'case') {
            if (approve) {
                await handleSupabase(
                    supabase
                        .from('cases')
                        .update({
                            status: APPROVAL_STATUS.PENDING_ADMIN,
                            manager_id: state.session.employeeId,
                            manager_comment: comment,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', record.id),
                    'manager case approval'
                );
                await removeManagerNotification('case', record.id);

                // Admin is NOT notified for cases - only for doctors and accounts
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
                await removeManagerNotification('case', record.id);
            }
        }

        if (record.owner_id) {
            const entityLabel = record.type.charAt(0).toUpperCase() + record.type.slice(1);
            if (approve) {
                let message;
                if (record.type === 'case') {
                    const doctorName = record.payload?.doctor_name || 'Unknown';
                    message = `Case request of operator Dr. "${doctorName}" approved`;
                } else {
                    message = `${entityLabel} request approved by manager`;
                }
                await notifyEmployee(record.owner_id, message, record.type, record.id);
            } else {
                const reason = comment ? ` Reason: ${comment}` : '';
                let message;
                if (record.type === 'case') {
                    const doctorName = record.payload?.doctor_name || 'Unknown';
                    message = `Case request of operator Dr. "${doctorName}" rejected.${reason}`;
                } else {
                    message = `${entityLabel} request rejected by manager.${reason}`;
                }
                await notifyEmployee(record.owner_id, message, record.type, record.id);
            }
        }

        await Promise.all([loadTeamDoctors(), loadTeamAccounts(), loadTeamCases()]);
        buildApprovalDatasets();
        renderTeamDoctors({ refreshFilters: true });
        renderTeamAccounts({ refreshFilters: true });
        setupTeamFilters();
        renderTeamApprovalsTable();
        renderMyApprovalsTable();
        setupDashboardFilters();
        renderDashboard();
    } catch (error) {
        alert(handleError(error));
    }
}

function renderMyApprovalsTable() {
    const columns = [
        { title: 'Type', field: 'type', width: 120 },
        { title: 'Name', field: 'name', minWidth: 200, headerFilter: 'input' },
        { title: 'Status', field: 'status', formatter: tableFormatters.status, width: 140 },
        { title: 'Submitted', field: 'created_at', formatter: tableFormatters.date, width: 140 }
    ];

    state.tables.myApprovals = createTable('manager-approvals-table', columns, state.myApprovals, {
        height: 400,
        initialSort: [{ column: 'created_at', dir: 'desc' }]
    });
}
async function removeManagerNotification(entityType, entityId) {
    try {
        await handleSupabase(
            supabase
                .from('notifications')
                .delete()
                .eq('user_id', state.session.userId)
                .eq('entity_type', entityType)
                .eq('entity_id', entityId),
            'remove manager notification'
        );
        await refreshNotifications();
    } catch (error) {
        console.error('Error removing manager notification:', error);
    }
}

async function notifyAdminUsers(entityType, entityId, entityName, doctorName = null, psName = null) {
    try {
        const { data: adminUsers, error } = await supabase
            .from('users')
            .select('id, username')
            .eq('role', 'admin');

        if (error || !adminUsers || adminUsers.length === 0) {
            console.warn('No admin users found to notify');
            return;
        }

        let message;
        if (entityType === 'case' && doctorName && psName) {
            message = `New case by "${psName}" with operator Dr. "${doctorName}" pending your approval`;
        } else {
            const entityLabel = entityType.charAt(0).toUpperCase() + entityType.slice(1);
            message = `New ${entityLabel} "${entityName}" pending your approval`;
        }

        for (const admin of adminUsers) {
            await createNotification({
                userId: admin.id,
                entityType,
                entityId,
                message
            });
        }
    } catch (error) {
        console.error('Error notifying admin users:', error);
    }
}

async function notifyEmployee(employeeId, message, entityType, entityId) {
    if (!employeeId) return;
    const { data, error } = await supabase
        .from('users')
        .select('id')
        .eq('employee_id', employeeId)
        .maybeSingle();
    if (error || !data) return;
    await createNotification({
        userId: data.id,
        entityType,
        entityId,
        message
    });
}
function setupTeamDoctorForm() {
    const container = document.querySelector('#manager-doctor-form .row');
    if (!container) return;
    container.innerHTML = `
        <div class="col-12">
            <div id="manager-doctor-feedback" class="alert-feedback d-none"></div>
        </div>
        <input type="hidden" name="doctor_id">
        <div class="col-12">
            <label class="form-label">Doctor Name</label>
            <input type="text" class="form-control" name="name" dir="auto" required>
        </div>
        <div class="col-12">
            <label class="form-label">Assign Product Specialist</label>
            <input type="text" class="form-control" name="specialist_name" placeholder="Type to search" required>
            <input type="hidden" name="specialist_id">
        </div>
        <div class="col-12">
            <label class="form-label">Line</label>
            <input type="text" class="form-control" name="line_name" list="lines-list">
        </div>
        <div class="col-12" id="manager-doctor-add-secondary">
            <button type="button" class="btn btn-outline-ghost w-100" id="manager-doctor-add-secondary-btn">Assign another Product Specialist</button>
        </div>
        <div class="col-12 d-none" data-section="manager-doctor-secondary">
            <label class="form-label">Product Specialist 2 (Optional)</label>
            <input type="text" class="form-control" name="secondary_specialist_name" placeholder="Type to search">
            <input type="hidden" name="secondary_specialist_id">
        </div>
        <div class="col-12 d-none" data-section="manager-doctor-secondary-line">
            <label class="form-label">PS 2 Line</label>
            <input type="text" class="form-control" name="secondary_line_name" list="lines-list">
        </div>
        <div class="col-12 d-none" id="manager-doctor-add-tertiary">
            <button type="button" class="btn btn-outline-ghost w-100" id="manager-doctor-add-tertiary-btn">Assign third Product Specialist</button>
        </div>
        <div class="col-12 d-none" data-section="manager-doctor-tertiary">
            <label class="form-label">Product Specialist 3 (Optional)</label>
            <input type="text" class="form-control" name="tertiary_specialist_name" placeholder="Type to search">
            <input type="hidden" name="tertiary_specialist_id">
        </div>
        <div class="col-12 d-none" data-section="manager-doctor-tertiary-line">
            <label class="form-label">PS 3 Line</label>
            <input type="text" class="form-control" name="tertiary_line_name" list="lines-list">
        </div>
        <div class="col-12 d-none" id="manager-doctor-add-quaternary">
            <button type="button" class="btn btn-outline-ghost w-100" id="manager-doctor-add-quaternary-btn">Assign fourth Product Specialist</button>
        </div>
        <div class="col-12 d-none" data-section="manager-doctor-quaternary">
            <label class="form-label">Product Specialist 4 (Optional)</label>
            <input type="text" class="form-control" name="quaternary_specialist_name" placeholder="Type to search">
            <input type="hidden" name="quaternary_specialist_id">
        </div>
        <div class="col-12 d-none" data-section="manager-doctor-quaternary-line">
            <label class="form-label">PS 4 Line</label>
            <input type="text" class="form-control" name="quaternary_line_name" list="lines-list">
        </div>
        <div class="col-12 d-none" id="manager-doctor-add-quinary">
            <button type="button" class="btn btn-outline-ghost w-100" id="manager-doctor-add-quinary-btn">Assign fifth Product Specialist</button>
        </div>
        <div class="col-12 d-none" data-section="manager-doctor-quinary">
            <label class="form-label">Product Specialist 5 (Optional)</label>
            <input type="text" class="form-control" name="quinary_specialist_name" placeholder="Type to search">
            <input type="hidden" name="quinary_specialist_id">
        </div>
        <div class="col-12 d-none" data-section="manager-doctor-quinary-line">
            <label class="form-label">PS 5 Line</label>
            <input type="text" class="form-control" name="quinary_line_name" list="lines-list">
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
            <button type="button" class="btn btn-outline-ghost" id="manager-doctor-reset">Reset</button>
            <button type="submit" class="btn btn-gradient">Save Doctor</button>
        </div>
    `;

    const form = document.getElementById('manager-doctor-form');
    const feedback = document.getElementById('manager-doctor-feedback');
    const teamDoctorSecondarySection = form.querySelector('[data-section="manager-doctor-secondary"]');
    const teamDoctorSecondaryLineSection = form.querySelector('[data-section="manager-doctor-secondary-line"]');
    const teamDoctorTertiarySection = form.querySelector('[data-section="manager-doctor-tertiary"]');
    const teamDoctorTertiaryLineSection = form.querySelector('[data-section="manager-doctor-tertiary-line"]');
    const teamDoctorQuaternarySection = form.querySelector('[data-section="manager-doctor-quaternary"]');
    const teamDoctorQuaternaryLineSection = form.querySelector('[data-section="manager-doctor-quaternary-line"]');
    const teamDoctorQuinarySection = form.querySelector('[data-section="manager-doctor-quinary"]');
    const teamDoctorQuinaryLineSection = form.querySelector('[data-section="manager-doctor-quinary-line"]');
    const teamDoctorAddSecondaryContainer = form.querySelector('#manager-doctor-add-secondary');
    const teamDoctorAddTertiaryContainer = form.querySelector('#manager-doctor-add-tertiary');
    const teamDoctorAddQuaternaryContainer = form.querySelector('#manager-doctor-add-quaternary');
    const teamDoctorAddQuinaryContainer = form.querySelector('#manager-doctor-add-quinary');
    const teamDoctorAddSecondaryBtn = form.querySelector('#manager-doctor-add-secondary-btn');
    const teamDoctorAddTertiaryBtn = form.querySelector('#manager-doctor-add-tertiary-btn');
    const teamDoctorAddQuaternaryBtn = form.querySelector('#manager-doctor-add-quaternary-btn');
    const teamDoctorAddQuinaryBtn = form.querySelector('#manager-doctor-add-quinary-btn');

    const toggleTeamDoctorTertiary = (show) => {
        if (show) {
            teamDoctorTertiarySection?.classList.remove('d-none');
            teamDoctorTertiaryLineSection?.classList.remove('d-none');
            teamDoctorAddTertiaryContainer?.classList.add('d-none');
            teamDoctorAddQuaternaryContainer?.classList.remove('d-none');
        } else {
            teamDoctorTertiarySection?.classList.add('d-none');
            teamDoctorTertiaryLineSection?.classList.add('d-none');
            teamDoctorAddQuaternaryContainer?.classList.add('d-none');
            teamDoctorAddQuinaryContainer?.classList.add('d-none');
            toggleTeamDoctorQuaternary(false);
            toggleTeamDoctorQuinary(false);
            if (teamDoctorSecondarySection && !teamDoctorSecondarySection.classList.contains('d-none')) {
                teamDoctorAddTertiaryContainer?.classList.remove('d-none');
            } else {
                teamDoctorAddTertiaryContainer?.classList.add('d-none');
            }
            form.querySelector('input[name="tertiary_specialist_name"]').value = '';
            form.querySelector('input[name="tertiary_specialist_id"]').value = '';
            form.querySelector('input[name="tertiary_line_name"]').value = '';
            if (state.autocompletes.teamDoctorTertiary) {
                state.autocompletes.teamDoctorTertiary.clear();
            }
        }
    };

    const toggleTeamDoctorSecondary = (show) => {
        if (show) {
            teamDoctorSecondarySection?.classList.remove('d-none');
            teamDoctorSecondaryLineSection?.classList.remove('d-none');
            teamDoctorAddSecondaryContainer?.classList.add('d-none');
            if (!teamDoctorTertiarySection || teamDoctorTertiarySection.classList.contains('d-none')) {
                teamDoctorAddTertiaryContainer?.classList.remove('d-none');
            }
        } else {
            teamDoctorSecondarySection?.classList.add('d-none');
            teamDoctorSecondaryLineSection?.classList.add('d-none');
            teamDoctorAddSecondaryContainer?.classList.remove('d-none');
            teamDoctorAddTertiaryContainer?.classList.add('d-none');
            teamDoctorAddQuaternaryContainer?.classList.add('d-none');
            teamDoctorAddQuinaryContainer?.classList.add('d-none');
            form.querySelector('input[name="secondary_specialist_name"]').value = '';
            form.querySelector('input[name="secondary_specialist_id"]').value = '';
            form.querySelector('input[name="secondary_line_name"]').value = '';
            if (state.autocompletes.teamDoctorSecondary) {
                state.autocompletes.teamDoctorSecondary.clear();
            }
            toggleTeamDoctorTertiary(false);
        }
    };

    const toggleTeamDoctorQuaternary = (show) => {
        if (show) {
            teamDoctorQuaternarySection?.classList.remove('d-none');
            teamDoctorQuaternaryLineSection?.classList.remove('d-none');
            teamDoctorAddQuaternaryContainer?.classList.add('d-none');
            teamDoctorAddQuinaryContainer?.classList.remove('d-none');
        } else {
            teamDoctorQuaternarySection?.classList.add('d-none');
            teamDoctorQuaternaryLineSection?.classList.add('d-none');
            teamDoctorAddQuinaryContainer?.classList.add('d-none');
            toggleTeamDoctorQuinary(false);
            if (teamDoctorTertiarySection && !teamDoctorTertiarySection.classList.contains('d-none')) {
                teamDoctorAddQuaternaryContainer?.classList.remove('d-none');
            } else {
                teamDoctorAddQuaternaryContainer?.classList.add('d-none');
            }
            form.querySelector('input[name="quaternary_specialist_name"]').value = '';
            form.querySelector('input[name="quaternary_specialist_id"]').value = '';
            form.querySelector('input[name="quaternary_line_name"]').value = '';
            if (state.autocompletes.teamDoctorQuaternary) {
                state.autocompletes.teamDoctorQuaternary.clear();
            }
        }
    };

    const toggleTeamDoctorQuinary = (show) => {
        if (show) {
            teamDoctorQuinarySection?.classList.remove('d-none');
            teamDoctorQuinaryLineSection?.classList.remove('d-none');
            teamDoctorAddQuinaryContainer?.classList.add('d-none');
        } else {
            teamDoctorQuinarySection?.classList.add('d-none');
            teamDoctorQuinaryLineSection?.classList.add('d-none');
            if (teamDoctorQuaternarySection && !teamDoctorQuaternarySection.classList.contains('d-none')) {
                teamDoctorAddQuinaryContainer?.classList.remove('d-none');
            } else {
                teamDoctorAddQuinaryContainer?.classList.add('d-none');
            }
            form.querySelector('input[name="quinary_specialist_name"]').value = '';
            form.querySelector('input[name="quinary_specialist_id"]').value = '';
            form.querySelector('input[name="quinary_line_name"]').value = '';
            if (state.autocompletes.teamDoctorQuinary) {
                state.autocompletes.teamDoctorQuinary.clear();
            }
        }
    };

    teamDoctorAddSecondaryBtn?.addEventListener('click', () => toggleTeamDoctorSecondary(true));
    teamDoctorAddTertiaryBtn?.addEventListener('click', () => toggleTeamDoctorTertiary(true));
    teamDoctorAddQuaternaryBtn?.addEventListener('click', () => toggleTeamDoctorQuaternary(true));
    teamDoctorAddQuinaryBtn?.addEventListener('click', () => toggleTeamDoctorQuinary(true));

    form._toggleTeamDoctorSecondary = toggleTeamDoctorSecondary;
    form._toggleTeamDoctorTertiary = toggleTeamDoctorTertiary;
    form._toggleTeamDoctorQuaternary = toggleTeamDoctorQuaternary;
    form._toggleTeamDoctorQuinary = toggleTeamDoctorQuinary;

    const resetTeamDoctorForm = () => {
        form.reset();
        form.querySelector('input[name="doctor_id"]').value = '';
        state.autocompletes.teamDoctorOwner?.clear();
        state.autocompletes.teamDoctorSecondary?.clear();
        state.autocompletes.teamDoctorTertiary?.clear();
        state.autocompletes.teamDoctorQuaternary?.clear();
        state.autocompletes.teamDoctorQuinary?.clear();
        toggleTeamDoctorSecondary(false);
        toggleTeamDoctorTertiary(false);
        toggleTeamDoctorQuaternary(false);
        toggleTeamDoctorQuinary(false);
        hideAlert(feedback);
    };

    // Add English-only validation to all text inputs
    addEnglishOnlyValidation(form);

    form.addEventListener('submit', handleTeamDoctorSubmit);
    form.addEventListener('mts:form-open', (event) => {
        const mode = event.detail?.mode || 'create';
        if (mode === 'create') {
            resetTeamDoctorForm();
        } else {
            hideAlert(feedback);
        }
    });
    form.addEventListener('mts:form-close', () => hideAlert(feedback));
    form.querySelector('#manager-doctor-reset').addEventListener('click', resetTeamDoctorForm);

    state.autocompletes.teamDoctorOwner = initAutocomplete({
        input: form.querySelector('input[name="specialist_name"]'),
        hiddenInput: form.querySelector('input[name="specialist_id"]'),
        items: state.specialists,
        labelSelector: (member) => `${member.first_name} ${member.last_name} (${member.code})`,
        valueSelector: (member) => member.id
    });
    state.autocompletes.teamDoctorSecondary = initAutocomplete({
        input: form.querySelector('input[name="secondary_specialist_name"]'),
        hiddenInput: form.querySelector('input[name="secondary_specialist_id"]'),
        items: state.specialists,
        labelSelector: (member) => `${member.first_name} ${member.last_name} (${member.code})`,
        valueSelector: (member) => member.id
    });
    state.autocompletes.teamDoctorTertiary = initAutocomplete({
        input: form.querySelector('input[name="tertiary_specialist_name"]'),
        hiddenInput: form.querySelector('input[name="tertiary_specialist_id"]'),
        items: state.specialists,
        labelSelector: (member) => `${member.first_name} ${member.last_name} (${member.code})`,
        valueSelector: (member) => member.id
    });
    state.autocompletes.teamDoctorQuaternary = initAutocomplete({
        input: form.querySelector('input[name="quaternary_specialist_name"]'),
        hiddenInput: form.querySelector('input[name="quaternary_specialist_id"]'),
        items: state.specialists,
        labelSelector: (member) => `${member.first_name} ${member.last_name} (${member.code})`,
        valueSelector: (member) => member.id
    });
    state.autocompletes.teamDoctorQuinary = initAutocomplete({
        input: form.querySelector('input[name="quinary_specialist_name"]'),
        hiddenInput: form.querySelector('input[name="quinary_specialist_id"]'),
        items: state.specialists,
        labelSelector: (member) => `${member.first_name} ${member.last_name} (${member.code})`,
        valueSelector: (member) => member.id
    });
}

async function handleTeamDoctorSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = document.getElementById('manager-doctor-feedback');
    hideAlert(feedback);
    const submitButton = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    if (!payload.name || !payload.specialist_id) {
        showAlert(feedback, 'Doctor name and specialist are required.');
        return;
    }

    // Validate English-only input
    if (!validateFormEnglishOnly(form)) {
        showAlert(feedback, 'Only English characters are allowed in all fields.');
        return;
    }

    const secondaryId = payload.secondary_specialist_id || null;
    const tertiaryId = payload.tertiary_specialist_id || null;
    const quaternaryId = payload.quaternary_specialist_id || null;
    const quinaryId = payload.quinary_specialist_id || null;
    const assignedIds = [payload.specialist_id, secondaryId, tertiaryId, quaternaryId, quinaryId].filter(Boolean);
    const uniqueIds = new Set(assignedIds);
    if (uniqueIds.size !== assignedIds.length) {
        showAlert(feedback, 'Product specialists must be unique.');
        return;
    }
    const teamIdSet = new Set(state.specialists.map((member) => String(member.id)));
    if (assignedIds.some((id) => !teamIdSet.has(String(id)))) {
        showAlert(feedback, 'You can only assign specialists from your team.');
        return;
    }

    const isUpdate = Boolean(payload.doctor_id);
    const existing = isUpdate ? state.doctors.find((doctor) => doctor.id === payload.doctor_id) : null;
    const secondaryLineName = payload.secondary_line_name ? payload.secondary_line_name.trim() : '';
    const tertiaryLineName = payload.tertiary_line_name ? payload.tertiary_line_name.trim() : '';
    const quaternaryLineName = payload.quaternary_line_name ? payload.quaternary_line_name.trim() : '';
    const quinaryLineName = payload.quinary_line_name ? payload.quinary_line_name.trim() : '';
    if (secondaryId && !secondaryLineName && !(isUpdate && existing?.secondary_line_id)) {
        showAlert(feedback, 'Please select a line for Product Specialist 2.');
        return;
    }
    if (tertiaryId && !tertiaryLineName && !(isUpdate && existing?.tertiary_line_id)) {
        showAlert(feedback, 'Please select a line for Product Specialist 3.');
        return;
    }
    if (quaternaryId && !quaternaryLineName && !(isUpdate && existing?.quaternary_line_id)) {
        showAlert(feedback, 'Please select a line for Product Specialist 4.');
        return;
    }
    if (quinaryId && !quinaryLineName && !(isUpdate && existing?.quinary_line_id)) {
        showAlert(feedback, 'Please select a line for Product Specialist 5.');
        return;
    }

    try {
        setLoadingState(submitButton, true, 'Saving...');
        let lineId = null;
        if (payload.line_name) {
            lineId = await ensureLineForManager(payload.line_name.trim());
        } else if (isUpdate) {
            lineId = existing?.line_id || null;
        }
        let secondaryLineId = null;
        if (secondaryId) {
            if (secondaryLineName) {
                secondaryLineId = await ensureLineForManager(secondaryLineName);
            } else if (isUpdate) {
                secondaryLineId = existing?.secondary_line_id || null;
            }
        }
        let tertiaryLineId = null;
        if (tertiaryId) {
            if (tertiaryLineName) {
                tertiaryLineId = await ensureLineForManager(tertiaryLineName);
            } else if (isUpdate) {
                tertiaryLineId = existing?.tertiary_line_id || null;
            }
        }
        let quaternaryLineId = null;
        if (quaternaryId) {
            if (quaternaryLineName) {
                quaternaryLineId = await ensureLineForManager(quaternaryLineName);
            } else if (isUpdate) {
                quaternaryLineId = existing?.quaternary_line_id || null;
            }
        }
        let quinaryLineId = null;
        if (quinaryId) {
            if (quinaryLineName) {
                quinaryLineId = await ensureLineForManager(quinaryLineName);
            } else if (isUpdate) {
                quinaryLineId = existing?.quinary_line_id || null;
            }
        }
        const record = {
            name: payload.name.trim(),
            owner_employee_id: payload.specialist_id,
            secondary_employee_id: secondaryId,
            tertiary_employee_id: tertiaryId,
            quaternary_employee_id: quaternaryId,
            quinary_employee_id: quinaryId,
            line_id: lineId,
            secondary_line_id: secondaryId ? secondaryLineId : null,
            tertiary_line_id: tertiaryId ? tertiaryLineId : null,
            quaternary_line_id: quaternaryId ? quaternaryLineId : null,
            quinary_line_id: quinaryId ? quinaryLineId : null,
            specialty: payload.specialty || null,
            phone: payload.phone || null,
            email_address: payload.email_address || null
        };

        if (isUpdate) {
            await handleSupabase(
                supabase
                    .from('doctors')
                    .update({
                        ...record,
                        status: APPROVAL_STATUS.PENDING_ADMIN,
                        manager_id: state.session.employeeId,
                        admin_id: null,
                        approved_at: null,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', payload.doctor_id),
                'update pending doctor'
            );
            // Remove manager notification and notify admin
            await removeManagerNotification('doctor', payload.doctor_id);
            await notifyAdminUsers('doctor', payload.doctor_id, payload.name.trim());
        } else {
            const inserted = await handleSupabase(
                supabase
                    .from('doctors')
                    .insert({
                        ...record,
                        status: APPROVAL_STATUS.PENDING_ADMIN,
                        manager_id: state.session.employeeId,
                        admin_id: null,
                        created_by: state.session.employeeId
                    })
                    .select('id')
                    .single(),
                'manager add doctor'
            );
            // Notify admin for new doctor
            await notifyAdminUsers('doctor', inserted.id, payload.name.trim());
        }

        await loadTeamDoctors();
        buildApprovalDatasets();
        renderTeamDoctors({ refreshFilters: true });
        renderTeamApprovalsTable();
        renderDashboard();
        form.reset();
        form.querySelector('input[name="doctor_id"]').value = '';
        form._toggleTeamDoctorSecondary?.(false);
        form._toggleTeamDoctorTertiary?.(false);
        state.autocompletes.teamDoctorOwner?.update(state.specialists);
        state.autocompletes.teamDoctorSecondary?.update(state.specialists);
        state.autocompletes.teamDoctorTertiary?.update(state.specialists);
        const message = isUpdate ? 'Doctor request updated.' : 'Doctor added and awaiting admin approval.';
        showAlert(feedback, message, 'success');
        closeFormModal();
    } catch (error) {
        showAlert(feedback, handleError(error));
    } finally {
        setLoadingState(submitButton, false, 'Save Doctor');
    }
}

function populateTeamDoctorForm(id) {
    const doctor = state.doctors.find((doc) => doc.id === id);
    if (!doctor) return;
    const form = document.getElementById('manager-doctor-form');
    if (!form) return;

    state.autocompletes.teamDoctorOwner?.update(state.specialists);
    state.autocompletes.teamDoctorSecondary?.update(state.specialists);
    state.autocompletes.teamDoctorTertiary?.update(state.specialists);
    state.autocompletes.teamDoctorQuaternary?.update(state.specialists);
    state.autocompletes.teamDoctorQuinary?.update(state.specialists);
    form.querySelector('input[name="doctor_id"]').value = doctor.id;
    form.querySelector('input[name="name"]').value = doctor.name || '';
    const specialist = state.specialists.find((member) => member.id === doctor.owner_employee_id);
    const specialistLabel = specialist
        ? `${specialist.first_name} ${specialist.last_name}`.trim() || specialist.code || 'Product Specialist'
        : doctor.owner_name || 'Product Specialist';
    form.querySelector('input[name="specialist_name"]').value = specialistLabel;
    form.querySelector('input[name="specialist_id"]').value = doctor.owner_employee_id || '';
    const secondary = doctor.secondary_employee_id
        ? state.specialists.find((member) => member.id === doctor.secondary_employee_id)
        : null;
    const secondaryLabel = secondary
        ? `${secondary.first_name} ${secondary.last_name}`.trim() || secondary.code || 'Product Specialist'
        : doctor.secondary_owner_name || '';
    const tertiary = doctor.tertiary_employee_id
        ? state.specialists.find((member) => member.id === doctor.tertiary_employee_id)
        : null;
    const tertiaryLabel = tertiary
        ? `${tertiary.first_name} ${tertiary.last_name}`.trim() || tertiary.code || 'Product Specialist'
        : doctor.tertiary_owner_name || '';
    const quaternary = doctor.quaternary_employee_id
        ? state.specialists.find((member) => member.id === doctor.quaternary_employee_id)
        : null;
    const quaternaryLabel = quaternary
        ? `${quaternary.first_name} ${quaternary.last_name}`.trim() || quaternary.code || 'Product Specialist'
        : doctor.quaternary_owner_name || '';
    const quinary = doctor.quinary_employee_id
        ? state.specialists.find((member) => member.id === doctor.quinary_employee_id)
        : null;
    const quinaryLabel = quinary
        ? `${quinary.first_name} ${quinary.last_name}`.trim() || quinary.code || 'Product Specialist'
        : doctor.quinary_owner_name || '';
    const line = state.lines.find((ln) => ln.id === doctor.line_id);
    form.querySelector('input[name="line_name"]').value = doctor.line_name || doctor.owner_line || line?.name || '';
    const showSecondary =
        Boolean(doctor.secondary_employee_id) ||
        Boolean(doctor.secondary_owner_name) ||
        Boolean(doctor.secondary_line_name);
    const showTertiary =
        Boolean(doctor.tertiary_employee_id) ||
        Boolean(doctor.tertiary_owner_name) ||
        Boolean(doctor.tertiary_line_name);
    const showQuaternary =
        Boolean(doctor.quaternary_employee_id) ||
        Boolean(doctor.quaternary_owner_name) ||
        Boolean(doctor.quaternary_line_name);
    const showQuinary =
        Boolean(doctor.quinary_employee_id) ||
        Boolean(doctor.quinary_owner_name) ||
        Boolean(doctor.quinary_line_name);
    form._toggleTeamDoctorSecondary?.(showSecondary);
    form._toggleTeamDoctorTertiary?.(showTertiary);
    form._toggleTeamDoctorQuaternary?.(showQuaternary);
    form._toggleTeamDoctorQuinary?.(showQuinary);
    form.querySelector('input[name="secondary_specialist_name"]').value = secondaryLabel || '';
    form.querySelector('input[name="secondary_specialist_id"]').value = doctor.secondary_employee_id || '';
    form.querySelector('input[name="secondary_line_name"]').value = doctor.secondary_line_name || '';
    form.querySelector('input[name="tertiary_specialist_name"]').value = tertiaryLabel || '';
    form.querySelector('input[name="tertiary_specialist_id"]').value = doctor.tertiary_employee_id || '';
    form.querySelector('input[name="tertiary_line_name"]').value = doctor.tertiary_line_name || '';
    form.querySelector('input[name="quaternary_specialist_name"]').value = quaternaryLabel || '';
    form.querySelector('input[name="quaternary_specialist_id"]').value = doctor.quaternary_employee_id || '';
    form.querySelector('input[name="quaternary_line_name"]').value = doctor.quaternary_line_name || '';
    form.querySelector('input[name="quinary_specialist_name"]').value = quinaryLabel || '';
    form.querySelector('input[name="quinary_specialist_id"]').value = doctor.quinary_employee_id || '';
    form.querySelector('input[name="quinary_line_name"]').value = doctor.quinary_line_name || '';
    form.querySelector('input[name="specialty"]').value = doctor.specialty || '';
    form.querySelector('input[name="phone"]').value = doctor.phone || '';
    form.querySelector('input[name="email_address"]').value = doctor.email_address || '';

    openFormModal('#manager-doctor-form', { title: 'Review Doctor', mode: 'edit', focusSelector: 'input[name="name"]' });
}

async function ensureLineForManager(name) {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const { data } = await supabase
        .from('lines')
        .select('id')
        .ilike('name', trimmed)
        .maybeSingle();
    if (data) return data.id;
    const inserted = await handleSupabase(
        supabase
            .from('lines')
            .insert({ name: trimmed, created_by: state.session.employeeId })
            .select('id')
            .single(),
        'create line'
    );
    ensureLineDatalist();
    return inserted.id;
}
function setupTeamAccountForm() {
    const container = document.querySelector('#manager-account-form .row');
    if (!container) return;
    container.innerHTML = `
        <div class="col-12">
            <div id="manager-account-feedback" class="alert-feedback d-none"></div>
        </div>
        <input type="hidden" name="account_id">
        <div class="col-12">
            <label class="form-label">Account Name</label>
            <input type="text" class="form-control" name="name" dir="auto" required>
        </div>
        <div class="col-12">
            <label class="form-label">Assign Product Specialist</label>
            <input type="text" class="form-control" name="specialist_name" placeholder="Type to search" required>
            <input type="hidden" name="specialist_id">
        </div>
        <div class="col-12">
            <label class="form-label">Line</label>
            <input type="text" class="form-control" name="line_name" list="lines-list">
        </div>
        <div class="col-12" id="manager-account-add-secondary">
            <button type="button" class="btn btn-outline-ghost w-100" id="manager-account-add-secondary-btn">Assign another Product Specialist</button>
        </div>
        <div class="col-12 d-none" data-section="manager-account-secondary">
            <label class="form-label">Product Specialist 2 (Optional)</label>
            <input type="text" class="form-control" name="secondary_specialist_name" placeholder="Type to search">
            <input type="hidden" name="secondary_specialist_id">
        </div>
        <div class="col-12 d-none" data-section="manager-account-secondary-line">
            <label class="form-label">PS 2 Line</label>
            <input type="text" class="form-control" name="secondary_line_name" list="lines-list">
        </div>
        <div class="col-12 d-none" id="manager-account-add-tertiary">
            <button type="button" class="btn btn-outline-ghost w-100" id="manager-account-add-tertiary-btn">Assign third Product Specialist</button>
        </div>
        <div class="col-12 d-none" data-section="manager-account-tertiary">
            <label class="form-label">Product Specialist 3 (Optional)</label>
            <input type="text" class="form-control" name="tertiary_specialist_name" placeholder="Type to search">
            <input type="hidden" name="tertiary_specialist_id">
        </div>
        <div class="col-12 d-none" data-section="manager-account-tertiary-line">
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
            <button type="button" class="btn btn-outline-ghost" id="manager-account-reset">Reset</button>
            <button type="submit" class="btn btn-gradient">Save Account</button>
        </div>
    `;

    const form = document.getElementById('manager-account-form');
    const feedback = document.getElementById('manager-account-feedback');
    const teamAccountSecondarySection = form.querySelector('[data-section="manager-account-secondary"]');
    const teamAccountSecondaryLineSection = form.querySelector('[data-section="manager-account-secondary-line"]');
    const teamAccountTertiarySection = form.querySelector('[data-section="manager-account-tertiary"]');
    const teamAccountTertiaryLineSection = form.querySelector('[data-section="manager-account-tertiary-line"]');
    const teamAccountAddSecondaryContainer = form.querySelector('#manager-account-add-secondary');
    const teamAccountAddTertiaryContainer = form.querySelector('#manager-account-add-tertiary');
    const teamAccountAddSecondaryBtn = form.querySelector('#manager-account-add-secondary-btn');
    const teamAccountAddTertiaryBtn = form.querySelector('#manager-account-add-tertiary-btn');

    const toggleTeamAccountTertiary = (show) => {
        if (show) {
            teamAccountTertiarySection?.classList.remove('d-none');
            teamAccountTertiaryLineSection?.classList.remove('d-none');
            teamAccountAddTertiaryContainer?.classList.add('d-none');
        } else {
            teamAccountTertiarySection?.classList.add('d-none');
            teamAccountTertiaryLineSection?.classList.add('d-none');
            if (teamAccountSecondarySection && !teamAccountSecondarySection.classList.contains('d-none')) {
                teamAccountAddTertiaryContainer?.classList.remove('d-none');
            } else {
                teamAccountAddTertiaryContainer?.classList.add('d-none');
            }
            form.querySelector('input[name="tertiary_specialist_name"]').value = '';
            form.querySelector('input[name="tertiary_specialist_id"]').value = '';
            form.querySelector('input[name="tertiary_line_name"]').value = '';
            if (state.autocompletes.teamAccountTertiary) {
                state.autocompletes.teamAccountTertiary.clear();
            }
        }
    };

    const toggleTeamAccountSecondary = (show) => {
        if (show) {
            teamAccountSecondarySection?.classList.remove('d-none');
            teamAccountSecondaryLineSection?.classList.remove('d-none');
            teamAccountAddSecondaryContainer?.classList.add('d-none');
            if (!teamAccountTertiarySection || teamAccountTertiarySection.classList.contains('d-none')) {
                teamAccountAddTertiaryContainer?.classList.remove('d-none');
            }
        } else {
            teamAccountSecondarySection?.classList.add('d-none');
            teamAccountSecondaryLineSection?.classList.add('d-none');
            teamAccountAddSecondaryContainer?.classList.remove('d-none');
            teamAccountAddTertiaryContainer?.classList.add('d-none');
            form.querySelector('input[name="secondary_specialist_name"]').value = '';
            form.querySelector('input[name="secondary_specialist_id"]').value = '';
            form.querySelector('input[name="secondary_line_name"]').value = '';
            if (state.autocompletes.teamAccountSecondary) {
                state.autocompletes.teamAccountSecondary.clear();
            }
            toggleTeamAccountTertiary(false);
        }
    };

    teamAccountAddSecondaryBtn?.addEventListener('click', () => toggleTeamAccountSecondary(true));
    teamAccountAddTertiaryBtn?.addEventListener('click', () => toggleTeamAccountTertiary(true));

    form._toggleTeamAccountSecondary = toggleTeamAccountSecondary;
    form._toggleTeamAccountTertiary = toggleTeamAccountTertiary;

    const resetTeamAccountForm = () => {
        form.reset();
        form.querySelector('input[name="account_id"]').value = '';
        state.autocompletes.teamAccountOwner?.clear();
        state.autocompletes.teamAccountSecondary?.clear();
        state.autocompletes.teamAccountTertiary?.clear();
        toggleTeamAccountSecondary(false);
        toggleTeamAccountTertiary(false);
        hideAlert(feedback);
    };
    form.addEventListener('submit', handleTeamAccountSubmit);
    form.addEventListener('mts:form-open', (event) => {
        const mode = event.detail?.mode || 'create';
        if (mode === 'create') {
            resetTeamAccountForm();
        } else {
            hideAlert(feedback);
        }
    });
    form.addEventListener('mts:form-close', () => hideAlert(feedback));
    form.querySelector('#manager-account-reset').addEventListener('click', resetTeamAccountForm);

    state.autocompletes.teamAccountOwner = initAutocomplete({
        input: form.querySelector('input[name="specialist_name"]'),
        hiddenInput: form.querySelector('input[name="specialist_id"]'),
        items: state.specialists,
        labelSelector: (member) => `${member.first_name} ${member.last_name} (${member.code})`,
        valueSelector: (member) => member.id
    });
    state.autocompletes.teamAccountSecondary = initAutocomplete({
        input: form.querySelector('input[name="secondary_specialist_name"]'),
        hiddenInput: form.querySelector('input[name="secondary_specialist_id"]'),
        items: state.specialists,
        labelSelector: (member) => `${member.first_name} ${member.last_name} (${member.code})`,
        valueSelector: (member) => member.id
    });
    state.autocompletes.teamAccountTertiary = initAutocomplete({
        input: form.querySelector('input[name="tertiary_specialist_name"]'),
        hiddenInput: form.querySelector('input[name="tertiary_specialist_id"]'),
        items: state.specialists,
        labelSelector: (member) => `${member.first_name} ${member.last_name} (${member.code})`,
        valueSelector: (member) => member.id
    });
}

async function handleTeamAccountSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = document.getElementById('manager-account-feedback');
    hideAlert(feedback);
    const submitButton = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    if (!payload.name || !payload.specialist_id || !payload.account_type) {
        showAlert(feedback, 'Account name, specialist, and type are required.');
        return;
    }

    const secondaryId = payload.secondary_specialist_id || null;
    const tertiaryId = payload.tertiary_specialist_id || null;
    const assignedIds = [payload.specialist_id, secondaryId, tertiaryId].filter(Boolean);
    const uniqueIds = new Set(assignedIds);
    if (uniqueIds.size !== assignedIds.length) {
        showAlert(feedback, 'Product specialists must be unique.');
        return;
    }
    const teamIdSet = new Set(state.specialists.map((member) => String(member.id)));
    if (assignedIds.some((id) => !teamIdSet.has(String(id)))) {
        showAlert(feedback, 'You can only assign specialists from your team.');
        return;
    }

    const isUpdate = Boolean(payload.account_id);
    const existing = isUpdate ? state.accounts.find((account) => account.id === payload.account_id) : null;
    const secondaryLineName = payload.secondary_line_name ? payload.secondary_line_name.trim() : '';
    const tertiaryLineName = payload.tertiary_line_name ? payload.tertiary_line_name.trim() : '';
    if (secondaryId && !secondaryLineName && !(isUpdate && existing?.secondary_line_id)) {
        showAlert(feedback, 'Please select a line for Product Specialist 2.');
        return;
    }
    if (tertiaryId && !tertiaryLineName && !(isUpdate && existing?.tertiary_line_id)) {
        showAlert(feedback, 'Please select a line for Product Specialist 3.');
        return;
    }

    try {
        setLoadingState(submitButton, true, 'Saving...');
        let lineId = null;
        if (payload.line_name) {
            lineId = await ensureLineForManager(payload.line_name.trim());
        } else if (isUpdate) {
            lineId = existing?.line_id || null;
        }
        let secondaryLineId = null;
        if (secondaryId) {
            if (secondaryLineName) {
                secondaryLineId = await ensureLineForManager(secondaryLineName);
            } else if (isUpdate) {
                secondaryLineId = existing?.secondary_line_id || null;
            }
        }
        let tertiaryLineId = null;
        if (tertiaryId) {
            if (tertiaryLineName) {
                tertiaryLineId = await ensureLineForManager(tertiaryLineName);
            } else if (isUpdate) {
                tertiaryLineId = existing?.tertiary_line_id || null;
            }
        }
        const record = {
            name: payload.name.trim(),
            owner_employee_id: payload.specialist_id,
            secondary_employee_id: secondaryId,
            tertiary_employee_id: tertiaryId,
            account_type: payload.account_type,
            line_id: lineId,
            secondary_line_id: secondaryId ? secondaryLineId : null,
            tertiary_line_id: tertiaryId ? tertiaryLineId : null,
            address: payload.address || null,
            governorate: payload.governorate || null
        };

        if (isUpdate) {
            await handleSupabase(
                supabase
                    .from('accounts')
                    .update({
                        ...record,
                        status: APPROVAL_STATUS.PENDING_ADMIN,
                        manager_id: state.session.employeeId,
                        admin_id: null,
                        approved_at: null,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', payload.account_id),
                'update pending account'
            );
            // Remove manager notification and notify admin
            await removeManagerNotification('account', payload.account_id);
            await notifyAdminUsers('account', payload.account_id, payload.name.trim());
        } else {
            const inserted = await handleSupabase(
                supabase
                    .from('accounts')
                    .insert({
                        ...record,
                        status: APPROVAL_STATUS.PENDING_ADMIN,
                        manager_id: state.session.employeeId,
                        admin_id: null,
                        created_by: state.session.employeeId
                    })
                    .select('id')
                    .single(),
                'manager add account'
            );
            // Notify admin for new account
            await notifyAdminUsers('account', inserted.id, payload.name.trim());
        }

        await loadTeamAccounts();
        buildApprovalDatasets();
        renderTeamAccounts({ refreshFilters: true });
        renderTeamApprovalsTable();
        renderDashboard();
        form.reset();
        form.querySelector('input[name="account_id"]').value = '';
        form._toggleTeamAccountSecondary?.(false);
        form._toggleTeamAccountTertiary?.(false);
        state.autocompletes.teamAccountOwner?.update(state.specialists);
        state.autocompletes.teamAccountSecondary?.update(state.specialists);
        state.autocompletes.teamAccountTertiary?.update(state.specialists);
        const message = isUpdate ? 'Account request updated.' : 'Account added and awaiting admin approval.';
        showAlert(feedback, message, 'success');
        closeFormModal();
    } catch (error) {
        showAlert(feedback, handleError(error));
    } finally {
        setLoadingState(submitButton, false, 'Save Account');
    }
}

function populateTeamAccountForm(id) {
    const account = state.accounts.find((acc) => acc.id === id);
    if (!account) return;
    const form = document.getElementById('manager-account-form');
    if (!form) return;

    state.autocompletes.teamAccountOwner?.update(state.specialists);
    state.autocompletes.teamAccountSecondary?.update(state.specialists);
    state.autocompletes.teamAccountTertiary?.update(state.specialists);
    form.querySelector('input[name="account_id"]').value = account.id;
    form.querySelector('input[name="name"]').value = account.name || '';
    const specialist = state.specialists.find((member) => member.id === account.owner_employee_id);
    const specialistLabel = specialist
        ? `${specialist.first_name} ${specialist.last_name}`.trim() || specialist.code || 'Product Specialist'
        : account.owner_name || 'Product Specialist';
    form.querySelector('input[name="specialist_name"]').value = specialistLabel;
    form.querySelector('input[name="specialist_id"]').value = account.owner_employee_id || '';
    const secondary = account.secondary_employee_id
        ? state.specialists.find((member) => member.id === account.secondary_employee_id)
        : null;
    const secondaryLabel = secondary
        ? `${secondary.first_name} ${secondary.last_name}`.trim() || secondary.code || 'Product Specialist'
        : account.secondary_owner_name || '';
    const tertiary = account.tertiary_employee_id
        ? state.specialists.find((member) => member.id === account.tertiary_employee_id)
        : null;
    const tertiaryLabel = tertiary
        ? `${tertiary.first_name} ${tertiary.last_name}`.trim() || tertiary.code || 'Product Specialist'
        : account.tertiary_owner_name || '';
    const showSecondary =
        Boolean(account.secondary_employee_id) ||
        Boolean(account.secondary_owner_name) ||
        Boolean(account.secondary_line_name);
    const showTertiary =
        Boolean(account.tertiary_employee_id) ||
        Boolean(account.tertiary_owner_name) ||
        Boolean(account.tertiary_line_name);
    form._toggleTeamAccountSecondary?.(showSecondary);
    form._toggleTeamAccountTertiary?.(showTertiary);
    form.querySelector('input[name="secondary_specialist_name"]').value = secondaryLabel || '';
    form.querySelector('input[name="secondary_specialist_id"]').value = account.secondary_employee_id || '';
    form.querySelector('input[name="secondary_line_name"]').value = account.secondary_line_name || '';
    form.querySelector('input[name="tertiary_specialist_name"]').value = tertiaryLabel || '';
    form.querySelector('input[name="tertiary_specialist_id"]').value = account.tertiary_employee_id || '';
    form.querySelector('input[name="tertiary_line_name"]').value = account.tertiary_line_name || '';
    form.querySelector('select[name="account_type"]').value = account.account_type || ACCOUNT_TYPES[0];
    const line = state.lines.find((ln) => ln.id === account.line_id);
    form.querySelector('input[name="line_name"]').value = account.line_name || line?.name || '';
    form.querySelector('textarea[name="address"]').value = account.address || '';
    form.querySelector('input[name="governorate"]').value = account.governorate || '';

    openFormModal('#manager-account-form', { title: 'Review Account', mode: 'edit', focusSelector: 'input[name="name"]' });
}

function showManagerReviewModal(title, content, options = {}) {
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
                <button type="button" class="btn btn-sm btn-negative" id="modalRejectCase">
                    <i class="bi bi-x"></i> Reject
                </button>
                <button type="button" class="btn btn-sm btn-gradient" id="modalApproveCase">
                    <i class="bi bi-check2"></i> Approve
                </button>
            `;

            // Attach event listeners
            const approveBtn = modalFooter.querySelector('#modalApproveCase');
            const rejectBtn = modalFooter.querySelector('#modalRejectCase');

            if (approveBtn) {
                approveBtn.addEventListener('click', async () => {
                    await handleTeamApproval(options.caseRecord, true);
                    window.bootstrap.Modal.getInstance(modalEl)?.hide();
                });
            }

            if (rejectBtn) {
                rejectBtn.addEventListener('click', async () => {
                    await handleTeamApproval(options.caseRecord, false);
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

function populateTeamCaseReview(id, payload = {}, showActions = false) {
    const caseRecord = state.teamCases.find((item) => item.id === id) || payload || {};
    const products = state.teamCaseProductsByCase.get(id) || [];
    const specialist = caseRecord.submitted_by_name || payload.submitted_by_name || 'N/A';
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
                <td class="text-end">${formatNumber(product.units || 0)}</td>
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

    showManagerReviewModal(`Review Case ${caseRecord.case_code || ''}`, content, {
        showCaseActions: showActions,
        caseRecord: recordForApproval
    });
}

function reviewTeamApproval(record) {
    if (record.type === 'doctor') {
        populateTeamDoctorForm(record.id);
    } else if (record.type === 'account') {
        populateTeamAccountForm(record.id);
    } else if (record.type === 'case') {
        populateTeamCaseReview(record.id, record.payload, true);
    }
}
function setupMyCaseForm() {
    const container = document.querySelector('#manager-case-form .row');
    if (!container) return;
    const approvedDoctors = state.doctors.filter((doctor) => doctor.status === APPROVAL_STATUS.APPROVED);
    const approvedAccounts = state.accounts.filter((account) => account.status === APPROVAL_STATUS.APPROVED);
    const doctorOptions = approvedDoctors.map((doctor) => `<option value="${doctor.id}">${doctor.name}</option>`).join('');
    const accountOptions = approvedAccounts.map((account) => `<option value="${account.id}">${account.name}</option>`).join('');

    container.innerHTML = `
        <div class="col-12">
            <div id="manager-case-feedback" class="alert-feedback d-none"></div>
        </div>
        <div class="col-12">
            <label class="form-label">Doctor</label>
            <select class="form-select" name="doctor_id" id="manager-case-doctor" required>
                <option value="">Select doctor</option>
                ${doctorOptions}
            </select>
        </div>
        <div class="col-12">
            <label class="form-label">Account</label>
            <select class="form-select" name="account_id" id="manager-case-account" required>
                <option value="">Select account</option>
                ${accountOptions}
            </select>
        </div>
        <div class="col-12">
            <label class="form-label">Case Date</label>
            <input type="date" class="form-control" name="case_date" required>
        </div>
        <div class="col-12">
            <label class="form-label">Products Used</label>
            <div id="manager-case-products" class="d-grid gap-3"></div>
            <div class="d-flex justify-content-between mt-2">
                <button type="button" class="btn btn-outline-ghost" id="manager-add-product">Add Product</button>
                <button type="button" class="btn btn-outline-ghost" id="manager-remove-product">Remove Product</button>
            </div>
        </div>
        <div class="col-12">
            <label class="form-label">Comments</label>
            <textarea class="form-control" name="notes" rows="2"></textarea>
        </div>
        <div class="col-12 d-flex justify-content-end gap-2">
            <button type="button" class="btn btn-outline-ghost" id="manager-case-reset">Reset</button>
            <button type="submit" class="btn btn-gradient">Submit Case</button>
        </div>
    `;

    const form = document.getElementById('manager-case-form');
    const feedback = document.getElementById('manager-case-feedback');
    const resetManagerCaseForm = () => {
        form.reset();
        state.caseFormRows = 1;
        renderManagerCaseProductRows();
        hideAlert(feedback);
    };
    form.addEventListener('submit', handleManagerCaseSubmit);
    form.addEventListener('mts:form-open', () => resetManagerCaseForm());
    form.addEventListener('mts:form-close', () => hideAlert(feedback));
    form.querySelector('#manager-case-reset').addEventListener('click', resetManagerCaseForm);

    form.querySelector('#manager-add-product').addEventListener('click', () => {
        if (state.caseFormRows < MAX_PRODUCTS_PER_CASE) {
            state.caseFormRows += 1;
            renderManagerCaseProductRows();
        }
    });
    form.querySelector('#manager-remove-product').addEventListener('click', () => {
        if (state.caseFormRows > 1) {
            state.caseFormRows -= 1;
            renderManagerCaseProductRows();
        }
    });
    renderManagerCaseProductRows();
}

function renderManagerCaseProductRows() {
    const container = document.getElementById('manager-case-products');
    if (!container) return;
    const preserved = new Map();
    container.querySelectorAll('[data-manager-product-row]').forEach((select) => {
        const row = Number(select.dataset.managerProductRow);
        const productSelect = container.querySelector(`[data-manager-product-select="${row}"]`);
        const unitsInput = container.querySelector(`[name="product_units_${row}"]`);
        preserved.set(row, {
            company: select.value,
            product: productSelect?.value || '',
            units: unitsInput?.value || '0'
        });
    });
    container.innerHTML = '';
    const companies = Array.from(state.companyProductsMap.keys());
    for (let index = 1; index <= state.caseFormRows; index += 1) {
        const wrapper = document.createElement('div');
        wrapper.className = 'row g-3 align-items-end';
        wrapper.innerHTML = `
            <div class="col-md-4">
                <label class="form-label">Company</label>
                <select class="form-select" data-manager-product-row="${index}" name="product_company_${index}">
                    <option value="">Select company</option>
                    ${companies.map((company) => `<option value="${company}">${company}</option>`).join('')}
                </select>
            </div>
            <div class="col-md-4">
                <label class="form-label">Product</label>
                <select class="form-select" data-manager-product-select="${index}" name="product_id_${index}">
                    <option value="">Select product</option>
                </select>
            </div>
            <div class="col-md-4">
                <label class="form-label">Units</label>
                <input type="number" class="form-control" name="product_units_${index}" min="0" value="0">
            </div>
        `;
        container.appendChild(wrapper);
        const saved = preserved.get(index) || {};
        const companyField = wrapper.querySelector(`[name="product_company_${index}"]`);
        const unitsField = wrapper.querySelector(`[name="product_units_${index}"]`);
        if (saved.company) {
            companyField.value = saved.company;
            populateManagerProductOptions(index, saved.company, saved.product);
        } else {
            populateManagerProductOptions(index, '', undefined);
        }
        if (unitsField) {
            unitsField.value = saved.units ?? '0';
        }
    }

    container.querySelectorAll('[data-manager-product-row]').forEach((select) => {
        select.addEventListener('change', (event) => {
            const row = Number(event.target.dataset.managerProductRow);
            populateManagerProductOptions(row, event.target.value);
        });
    });
}

function populateManagerProductOptions(rowIndex, companyName, selectedProductId) {
    const productSelect = document.querySelector(`[data-manager-product-select="${rowIndex}"]`);
    if (!productSelect) return;
    productSelect.innerHTML = '<option value="">Select product</option>';
    if (!companyName) return;
    const products = state.companyProductsMap.get(companyName) || [];
    products.forEach((product) => {
        const option = document.createElement('option');
        option.value = product.id;
        option.textContent = product.name;
        option.dataset.isCompany = product.is_company_product ? 'true' : 'false';
        productSelect.appendChild(option);
    });
    if (selectedProductId) {
        productSelect.value = selectedProductId;
    }
}

async function handleManagerCaseSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = document.getElementById('manager-case-feedback');
    hideAlert(feedback);
    const submitButton = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    if (!payload.doctor_id || !payload.account_id || !payload.case_date) {
        showAlert(feedback, 'Doctor, account, and date are required.');
        return;
    }

    const selectedDoctor = state.doctors.find((doctor) => String(doctor.id) === String(payload.doctor_id));
    if (!selectedDoctor || selectedDoctor.status !== APPROVAL_STATUS.APPROVED) {
        showAlert(feedback, 'Unable to save case. Doctor approval is pending.');
        return;
    }

    const selectedAccount = state.accounts.find((account) => String(account.id) === String(payload.account_id));
    if (!selectedAccount || selectedAccount.status !== APPROVAL_STATUS.APPROVED) {
        showAlert(feedback, 'Unable to save case. Account approval is pending.');
        return;
    }

    const products = [];
    for (let index = 1; index <= state.caseFormRows; index += 1) {
        const productId = payload[`product_id_${index}`];
        const units = Number(payload[`product_units_${index}`]);
        if (productId && units > 0) {
            const product = state.products.find((item) => item.id === productId);
            if (product) {
                products.push({
                    product_id: product.id,
                    product_name: product.name,
                    company_name: product.company_name,
                    category: product.category,
                    sub_category: product.sub_category,
                    is_company_product: product.is_company_product,
                    units
                });
            }
        }
    }

    if (!products.length) {
        showAlert(feedback, 'Please add at least one product with units.');
        return;
    }

    try {
        setLoadingState(submitButton, true, 'Submitting...');
        const caseRecord = {
            case_code: generateCaseCode(),
            submitted_by: state.session.employeeId,
            doctor_id: payload.doctor_id,
            account_id: payload.account_id,
            case_date: payload.case_date,
            notes: payload.notes || null,
            status: APPROVAL_STATUS.PENDING_ADMIN,
            manager_id: state.session.employeeId
        };

        const inserted = await handleSupabase(
            supabase
                .from('cases')
                .insert(caseRecord)
                .select('id')
                .single(),
            'manager submit case'
        );
        const caseId = inserted.id;
        const caseProducts = products.map((product, sequence) => ({
            case_id: caseId,
            product_id: product.product_id,
            product_name: product.product_name,
            company_name: product.company_name,
            category: product.category,
            sub_category: product.sub_category,
            is_company_product: product.is_company_product,
            units: product.units,
            sequence: sequence + 1
        }));
        await handleSupabase(
            supabase
                .from('case_products')
                .insert(caseProducts),
            'manager case products'
        );

        await loadMyCases();
        buildApprovalDatasets();
        setupManagerCaseFilters();
        renderMyApprovalsTable();
        renderDashboard();
        form.reset();
        state.caseFormRows = 1;
        renderManagerCaseProductRows();
        showAlert(feedback, 'Case submitted for admin approval.', 'success');
        closeFormModal();
    } catch (error) {
        showAlert(feedback, handleError(error));
    } finally {
        setLoadingState(submitButton, false, 'Submit Case');
    }
}
function renderMyCases() {
    const filtered = getManagerFilteredCases();
    renderMyCaseStats(filtered);
    renderMyCasesTable(filtered);
}
function renderMyCasesTable(cases = []) {
    const tableData = cases.map((caseItem) => buildCaseTableRow(caseItem, state.myCaseProductsByCase));
    const columns = buildCaseTableColumns(tableFormatters);

    // Find case_code column index and insert actions after it
    const caseCodeIndex = columns.findIndex(col => col.field === 'case_code');
    if (caseCodeIndex !== -1 && !columns.some((column) => column.field === 'actions')) {
        columns.splice(caseCodeIndex + 1, 0, {
            title: 'Actions',
            field: 'actions',
            width: 120,
            hozAlign: 'center',
            formatter: tableFormatters.actions([
                {
                    name: 'view',
                    label: 'View',
                    icon: 'bi bi-eye',
                    variant: 'btn-gradient'
                }
            ]),
            headerSort: false
        });
    }

    state.tables.myCases = createTable('manager-cases-table', columns, tableData, {
        height: 520,
        initialSort: [{ column: 'created_at', dir: 'desc' }]
    });

    bindTableActions(state.tables.myCases, {
        view: (rowData) => viewMyCaseDetails(rowData.id)
    });

    attachProductsToggle(state.tables.myCases, {
        anchorField: 'actions',
        storageKey: 'manager_my_cases_products_toggle'
    });
}

function viewMyCaseDetails(id) {
    const caseRecord = state.myCases.find((item) => item.id === id) || {};
    const products = state.myCaseProductsByCase.get(id) || [];
    const specialist = caseRecord.submitted_by_name || 'N/A';
    const doctor = caseRecord.doctor_name || 'N/A';
    const account = caseRecord.account_name || 'N/A';
    const accountType = caseRecord.account_type || 'N/A';
    const status = caseRecord.status || 'Pending';
    const caseDate = caseRecord.case_date ? formatDate(caseRecord.case_date) : 'N/A';
    const notes = caseRecord.notes || 'No additional notes provided.';

    let companyUnits = 0;
    let competitorUnits = 0;
    products.forEach((p) => {
        if (p.is_company_product) {
            companyUnits += p.units || 0;
        } else {
            competitorUnits += p.units || 0;
        }
    });

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
                        <strong>${account}</strong>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="review-field">
                        <span>Account Type</span>
                        <strong>${accountType}</strong>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="review-field">
                        <span>Total DMC Units</span>
                        <strong>${formatNumber(companyUnits)}</strong>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="review-field">
                        <span>Total Competitor Units</span>
                        <strong>${formatNumber(competitorUnits)}</strong>
                    </div>
                </div>
                <div class="col-12">
                    <div class="review-field">
                        <span>Notes</span>
                        <p>${notes}</p>
                    </div>
                </div>
                <div class="col-12">
                    <h6 class="mb-2">Products (${products.length})</h6>
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>Company</th>
                                    <th>Category</th>
                                    <th>Sub-Category</th>
                                    <th>Type</th>
                                    <th>Units</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${products.map((p) => `
                                    <tr>
                                        <td>${p.product_name || 'N/A'}</td>
                                        <td>${p.company_name || 'N/A'}</td>
                                        <td>${p.category || 'N/A'}</td>
                                        <td>${p.sub_category || 'N/A'}</td>
                                        <td>${p.is_company_product ? 'Company' : 'Competitor'}</td>
                                        <td>${formatNumber(p.units || 0)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;

    showManagerReviewModal(`View Case ${caseRecord.case_code || ''}`, content, {
        showCaseActions: false
    });
}

function renderMyCaseStats(cases) {
    const container = document.getElementById('manager-cases-stats');
    if (!container) return;

    // Get dual-row filter selections (EXACT COPY FROM ADMIN)
    const companyType = document.getElementById('manager-filter-company-type')?.value;
    const companyCompany = document.getElementById('manager-filter-company-company')?.value;
    const companyCategory = document.getElementById('manager-filter-company-category')?.value;
    const companySubCategory = document.getElementById('manager-filter-company-sub-category')?.value;
    const companyProduct = document.getElementById('manager-filter-company-product')?.value;

    const competitorCompany = document.getElementById('manager-filter-competitor-company')?.value;
    const competitorCategory = document.getElementById('manager-filter-competitor-category')?.value;
    const competitorSubCategory = document.getElementById('manager-filter-competitor-sub-category')?.value;
    const competitorProduct = document.getElementById('manager-filter-competitor-product')?.value;

    let metrics;
    if (companyType === 'company') {
        // Show only company stats, set competitor to 0
        metrics = computeCaseMetrics(cases, state.myCaseProductsByCase);
        metrics.competitorCaseCount = 0;
        metrics.competitorUnits = 0;
    } else if (companyType === 'competitor') {
        // Show only competitor stats, set company to 0
        metrics = computeCaseMetrics(cases, state.myCaseProductsByCase);
        metrics.companyCaseCount = 0;
        metrics.companyUnits = 0;
    } else {
        // DUAL-ROW SPECIFIC STATS CALCULATION (EXACT COPY FROM ADMIN)
        // Calculate company stats based on Row 1 selections only
        const hasCompanyFilters = companyCompany || companyCategory || companySubCategory || companyProduct;
        const hasCompetitorFilters = competitorCompany || competitorCategory || competitorSubCategory || competitorProduct;

        if (hasCompanyFilters || hasCompetitorFilters) {
            // Filter cases for company stats (Row 1 selections)
            let companyCases = cases;
            if (hasCompanyFilters) {
                companyCases = cases.filter(caseItem => {
                    const products = state.myCaseProductsByCase.get(caseItem.id) || [];
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
            let competitorCases = cases;
            if (hasCompetitorFilters) {
                competitorCases = cases.filter(caseItem => {
                    const products = state.myCaseProductsByCase.get(caseItem.id) || [];
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
            const companyMetrics = computeCaseMetrics(companyCases, state.myCaseProductsByCase);
            const competitorMetrics = computeCaseMetrics(competitorCases, state.myCaseProductsByCase);

            // Calculate mixed cases between Row 1 and Row 2 selections specifically
            let mixedCaseCount = 0;
            if (hasCompanyFilters && hasCompetitorFilters) {
                // Mixed cases = cases that match BOTH Row 1 AND Row 2 selections
                mixedCaseCount = cases.filter(caseItem => {
                    const products = state.myCaseProductsByCase.get(caseItem.id) || [];

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
                mixedCaseCount = computeCaseMetrics(cases, state.myCaseProductsByCase).mixedCaseCount;
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
            metrics = computeCaseMetrics(cases, state.myCaseProductsByCase);
        }
    }

    container.innerHTML = `
        <div class="stat-card">
            <h4>DMC Cases</h4>
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
            <h4>DMC Units</h4>
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
function renderDashboard() {
    const { cases, caseProducts, caseProductsMap } = getManagerDashboardFilteredData();
    renderDashboardStats(cases, caseProductsMap);
    renderDashboardCharts(cases, caseProductsMap, caseProducts);
}

// Helper function to get filtered case sets based on dual-row filter selections
function getDualRowCaseSets(cases, caseProductsMap) {
    // Get dual-row filter values
    const companyCompany = document.getElementById('manager-dashboard-filter-company-company')?.value || '';
    const companyCategory = document.getElementById('manager-dashboard-filter-company-category')?.value || '';
    const companySubCategory = document.getElementById('manager-dashboard-filter-company-sub-category')?.value || '';
    const companyProduct = document.getElementById('manager-dashboard-filter-company-product')?.value || '';

    const competitorCompany = document.getElementById('manager-dashboard-filter-competitor-company')?.value || '';
    const competitorCategory = document.getElementById('manager-dashboard-filter-competitor-category')?.value || '';
    const competitorSubCategory = document.getElementById('manager-dashboard-filter-competitor-sub-category')?.value || '';
    const competitorProduct = document.getElementById('manager-dashboard-filter-competitor-product')?.value || '';

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

function getDashboardDualRowFilterContext() {
    const companyCompany = document.getElementById('manager-dashboard-filter-company-company')?.value || '';
    const companyCategory = document.getElementById('manager-dashboard-filter-company-category')?.value || '';
    const companySubCategory = document.getElementById('manager-dashboard-filter-company-sub-category')?.value || '';
    const companyProduct = document.getElementById('manager-dashboard-filter-company-product')?.value || '';

    const competitorCompany = document.getElementById('manager-dashboard-filter-competitor-company')?.value || '';
    const competitorCategory = document.getElementById('manager-dashboard-filter-competitor-category')?.value || '';
    const competitorSubCategory = document.getElementById('manager-dashboard-filter-competitor-sub-category')?.value || '';
    const competitorProduct = document.getElementById('manager-dashboard-filter-competitor-product')?.value || '';

    const companyType = document.getElementById('manager-dashboard-filter-company-type')?.value || '';

    const hasCompanyFilters = Boolean(companyCompany || companyCategory || companySubCategory || companyProduct);
    const hasCompetitorFilters = Boolean(competitorCompany || competitorCategory || competitorSubCategory || competitorProduct);

    return {
        companyCompany,
        companyCategory,
        companySubCategory,
        companyProduct,
        competitorCompany,
        competitorCategory,
        competitorSubCategory,
        competitorProduct,
        companyType,
        hasCompanyFilters,
        hasCompetitorFilters
    };
}

function getDashboardFilteredProducts(cases, caseProductsMap) {
    const ctx = getDashboardDualRowFilterContext();
    const products = [];

    cases.forEach((caseItem) => {
        const caseId = caseItem.id;
        const caseProducts = caseProductsMap.get(caseId) || [];
        caseProducts.forEach((product) => {
            products.push({ ...product, case_id: product.case_id || caseId });
        });
    });

    const matchesCompanyRow = (product) => {
        if (!product.is_company_product) return false;
        if (ctx.companyCompany && (product.company_name || '') !== ctx.companyCompany) return false;
        if (ctx.companyCategory && (product.category || '') !== ctx.companyCategory) return false;
        if (ctx.companySubCategory && (product.sub_category || '') !== ctx.companySubCategory) return false;
        if (ctx.companyProduct && String(product.product_id) !== ctx.companyProduct && product.product_name !== ctx.companyProduct) return false;
        return true;
    };

    const matchesCompetitorRow = (product) => {
        if (product.is_company_product) return false;
        if (ctx.competitorCompany && (product.company_name || '') !== ctx.competitorCompany) return false;
        if (ctx.competitorCategory && (product.category || '') !== ctx.competitorCategory) return false;
        if (ctx.competitorSubCategory && (product.sub_category || '') !== ctx.competitorSubCategory) return false;
        if (ctx.competitorProduct && String(product.product_id) !== ctx.competitorProduct && product.product_name !== ctx.competitorProduct) return false;
        return true;
    };

    let filteredProducts = products.filter((product) => {
        if (ctx.hasCompanyFilters && ctx.hasCompetitorFilters) {
            return matchesCompanyRow(product) || matchesCompetitorRow(product);
        }
        if (ctx.hasCompanyFilters) {
            return matchesCompanyRow(product);
        }
        if (ctx.hasCompetitorFilters) {
            return matchesCompetitorRow(product);
        }
        return true;
    });

    if (ctx.companyType === 'company') {
        filteredProducts = filteredProducts.filter((product) => product.is_company_product);
    } else if (ctx.companyType === 'competitor') {
        filteredProducts = filteredProducts.filter((product) => !product.is_company_product);
    }

    return filteredProducts;
}

function buildCaseProductsMapFromProducts(products = []) {
    const map = new Map();
    products.forEach((product) => {
        const caseId = product.case_id;
        if (!caseId) return;
        if (!map.has(caseId)) map.set(caseId, []);
        map.get(caseId).push(product);
    });
    return map;
}

function calculateUnitsByProductSpecialistFromProducts(cases, products = []) {
    const caseSpecialistMap = new Map(cases.map((caseItem) => [caseItem.id, caseItem.submitted_by_name || 'Unknown']));
    const specialistUnitsMap = new Map();

    products.forEach((product) => {
        const specialist = caseSpecialistMap.get(product.case_id) || 'Unknown';
        specialistUnitsMap.set(specialist, (specialistUnitsMap.get(specialist) || 0) + (product.units || 0));
    });

    const sorted = Array.from(specialistUnitsMap.entries()).sort((a, b) => b[1] - a[1]);
    return {
        labels: sorted.map(([name]) => name),
        data: sorted.map(([, units]) => units)
    };
}

// Helper function to get metrics based on dual-row filter selections
function getDualRowMetrics(cases, caseProductsMap) {
    // Get dual-row filter values
    const companyCompany = document.getElementById('manager-dashboard-filter-company-company')?.value || '';
    const companyCategory = document.getElementById('manager-dashboard-filter-company-category')?.value || '';
    const companySubCategory = document.getElementById('manager-dashboard-filter-company-sub-category')?.value || '';
    const companyProduct = document.getElementById('manager-dashboard-filter-company-product')?.value || '';

    const competitorCompany = document.getElementById('manager-dashboard-filter-competitor-company')?.value || '';
    const competitorCategory = document.getElementById('manager-dashboard-filter-competitor-category')?.value || '';
    const competitorSubCategory = document.getElementById('manager-dashboard-filter-competitor-sub-category')?.value || '';
    const competitorProduct = document.getElementById('manager-dashboard-filter-competitor-product')?.value || '';

    const companyType = document.getElementById('manager-dashboard-filter-company-type')?.value || '';

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
            let companyMetrics;
            if (hasCompanyFilters) {
                // Calculate company units from individual products matching ALL company filters
                let companyUnitsFromProducts = 0;
                let companyCaseCount = 0;
                companyCases.forEach(caseItem => {
                    const products = caseProductsMap.get(caseItem.id) || [];
                    const matchingProducts = products.filter(product => {
                        if (!product.is_company_product) return false;
                        if (companyCompany && (product.company_name || '') !== companyCompany) return false;
                        if (companyCategory && (product.category || '') !== companyCategory) return false;
                        if (companySubCategory && (product.sub_category || '') !== companySubCategory) return false;
                        if (companyProduct && String(product.product_id) !== companyProduct && product.product_name !== companyProduct) return false;
                        return true;
                    });
                    if (matchingProducts.length > 0) {
                        companyCaseCount++;
                        matchingProducts.forEach(p => companyUnitsFromProducts += p.units || 0);
                    }
                });
                companyMetrics = computeCaseMetrics(companyCases, caseProductsMap);
                companyMetrics.companyUnits = companyUnitsFromProducts;
                companyMetrics.companyCaseCount = companyCaseCount;
            } else {
                companyMetrics = computeCaseMetrics(companyCases, caseProductsMap);
            }

            // FIX: When filtering by ANY competitor filter, calculate units from individual products
            let competitorMetrics;
            if (hasCompetitorFilters) {
                // Calculate competitor units from individual products matching ALL competitor filters
                let competitorUnitsFromProducts = 0;
                let competitorCaseCount = 0;
                competitorCases.forEach(caseItem => {
                    const products = caseProductsMap.get(caseItem.id) || [];
                    const matchingProducts = products.filter(product => {
                        if (product.is_company_product) return false;
                        if (competitorCompany && (product.company_name || '') !== competitorCompany) return false;
                        if (competitorCategory && (product.category || '') !== competitorCategory) return false;
                        if (competitorSubCategory && (product.sub_category || '') !== competitorSubCategory) return false;
                        if (competitorProduct && String(product.product_id) !== competitorProduct && product.product_name !== competitorProduct) return false;
                        return true;
                    });
                    if (matchingProducts.length > 0) {
                        competitorCaseCount++;
                        matchingProducts.forEach(p => competitorUnitsFromProducts += p.units || 0);
                    }
                });
                competitorMetrics = computeCaseMetrics(competitorCases, caseProductsMap);
                competitorMetrics.competitorUnits = competitorUnitsFromProducts;
                competitorMetrics.competitorCaseCount = competitorCaseCount;
            } else {
                competitorMetrics = computeCaseMetrics(competitorCases, caseProductsMap);
            }

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
    const container = document.getElementById('manager-dashboard-stats');
    if (!container) return;

    // Use the helper function to get metrics
    const metrics = getDualRowMetrics(cases, caseProductsMap);

    container.innerHTML = `
        <div class="stat-card">
            <h4>DMC Cases</h4>
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
            <h4>DMC Units</h4>
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
    renderCasesByCategoryChart(cases, caseProductsMap);
    renderMonthlyTrendChart(cases, caseProductsMap);
    renderUPAvsPrivateCasesChart(cases);
    renderCasesByPSChart(cases);
    renderCasesByProductChart(cases, caseProductsMap);
    renderDMCCasesByProductChart(cases, caseProductsMap);
    renderCompetitorCasesByProductChart(cases, caseProductsMap);

    // Units Analysis Section
    renderUnitsMarketShareChart(cases, caseProductsMap);
    renderUnitsPerCategoryChart(caseProducts, cases, caseProductsMap);
    renderUnitsPerCompanyChart(cases, caseProductsMap);
    renderDMCUnitsByProductChart(caseProducts, cases, caseProductsMap);
    renderCompetitorUnitsByProductChart(caseProducts, cases, caseProductsMap);
    renderMonthlyUnitsTrendChart(cases, caseProductsMap);
    renderUnitsByPSChart(cases, caseProductsMap);
    renderUnitsByProductChart(caseProducts, cases, caseProductsMap);

    // Setup collapse button
    setupChartSectionToggle();
}

function renderCasesTrendChart(cases) {
    const canvas = document.getElementById('mgrChartCasesTrend');
    if (!canvas) return;
    const monthly = aggregateTeamCasesByMonth(cases);
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

function aggregateTeamCasesByMonth(cases) {
    const map = new Map();
    cases.forEach((caseItem) => {
        const month = formatMonth(caseItem.case_date);
        map.set(month, (map.get(month) || 0) + 1);
    });
    return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
}

function renderUnitsSplitChart(cases) {
    const canvas = document.getElementById('mgrChartUnitsSplit');
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

function renderCasesSplitChart(cases, caseProductsMap) {
    const canvas = document.getElementById('mgrChartCasesSplit');
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

function renderCasesBySpecialistChart(cases) {
    const canvas = document.getElementById('mgrChartCasesBySpecialist');
    if (!canvas) return;
    const map = new Map();
    cases.forEach((caseItem) => {
        map.set(caseItem.submitted_by_name, (map.get(caseItem.submitted_by_name) || 0) + 1);
    });
    const labels = Array.from(map.keys());
    const values = Array.from(map.values());
    destroyChart(state.charts.casesBySpecialist);
    state.charts.casesBySpecialist = buildBarChart(canvas, {
        labels,
        datasets: [
            {
                label: 'Cases',
                data: values,
                backgroundColor: 'rgba(34,211,238,0.8)'
            }
        ]
    });
}

function renderCompanyCasesByCategoryChart(cases, caseProductsMap) {
    const canvas = document.getElementById('mgrChartCompanyCasesByCategory');
    if (!canvas) return;
    const map = new Map();
    cases.forEach((caseItem) => {
        const products = caseProductsMap.get(caseItem.id) || [];
        const categories = new Set(
            products
                .filter((product) => product.is_company_product)
                .map((product) => product.category || 'Uncategorized')
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
    const canvas = document.getElementById('mgrChartCompanyCasesByProduct');
    if (!canvas) return;
    const map = new Map();
    cases.forEach((caseItem) => {
        const products = caseProductsMap.get(caseItem.id) || [];
        const companyProducts = new Set(
            products
                .filter((product) => product.is_company_product)
                .map((product) => product.product_name || 'Unnamed Product')
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

function renderCasesByLineChart(cases) {
    const canvas = document.getElementById('mgrChartCasesByLine');
    if (!canvas) return;
    const map = new Map();
    cases.forEach((caseItem) => {
        const lineName = caseItem.line_name || 'Unassigned';
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
    const canvas = document.getElementById('mgrChartNumberOfCases');
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
    const canvas = document.getElementById('mgrChartCasesMarketShare');
    if (!canvas) return;

    const ctx = getDashboardDualRowFilterContext();
    const filteredProducts = getDashboardFilteredProducts(cases, caseProductsMap);

    let labels, data;
    if (ctx.hasCompanyFilters || ctx.hasCompetitorFilters || ctx.companyType) {
        const companyCaseIds = new Set(filteredProducts.filter((p) => p.is_company_product).map((p) => p.case_id));
        const competitorCaseIds = new Set(filteredProducts.filter((p) => !p.is_company_product).map((p) => p.case_id));

        if (ctx.companyType === 'company') {
            labels = ['Company'];
            data = [companyCaseIds.size];
        } else if (ctx.companyType === 'competitor') {
            labels = ['Competitor'];
            data = [competitorCaseIds.size];
        } else if (ctx.hasCompanyFilters && ctx.hasCompetitorFilters) {
            labels = ['Company', 'Competitor'];
            data = [companyCaseIds.size, competitorCaseIds.size];
        } else if (ctx.hasCompanyFilters) {
            labels = ['Company'];
            data = [companyCaseIds.size];
        } else if (ctx.hasCompetitorFilters) {
            labels = ['Competitor'];
            data = [competitorCaseIds.size];
        } else {
            labels = ['Company', 'Competitor'];
            data = [companyCaseIds.size, competitorCaseIds.size];
        }
    } else {
        // No dual-row/company-type filters - standard calculation
        const result = calculateCasesMarketShare(cases, caseProductsMap);
        labels = result.labels;
        data = result.data;
    }

    const baseColors = [
        'rgba(99,102,241,0.9)',
        'rgba(236,72,153,0.9)',
        'rgba(34,197,94,0.9)',
        'rgba(251,191,36,0.9)',
        'rgba(14,165,233,0.9)',
        'rgba(168,85,247,0.9)',
        'rgba(236,72,153,0.9)',
        'rgba(59,130,246,0.9)',
        'rgba(16,185,129,0.9)',
        'rgba(245,158,11,0.9)'
    ];

    // Build colors array - ensure "Other Companies" gets red color
    const colors = [];
    for (let i = 0; i < labels.length; i++) {
        if (i === labels.length - 1 && (labels[i] === 'Other Companies' || labels[i] === 'Others')) {
            colors.push('rgba(220,38,38,0.9)'); // Red for Others
        } else {
            colors.push(baseColors[i % baseColors.length]);
        }
    }

    destroyChart(state.charts.casesMarketShare);
    state.charts.casesMarketShare = buildPieChart(canvas, {
        labels,
        data,
        backgroundColor: colors
    });
}

function renderMonthlyTrendChart(cases, caseProductsMap) {
    const canvas = document.getElementById('mgrChartMonthlyTrend');
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
    const canvas = document.getElementById('mgrChartUPAvsPrivate');
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
    const canvas = document.getElementById('mgrChartCasesByPS');
    if (!canvas) return;

    const { labels, data } = calculateCasesByProductSpecialist(cases);

    destroyChart(state.charts.casesByPS);
    state.charts.casesByPS = buildBarChart(canvas, {
        labels,
        datasets: [{
            label: 'Cases',
            data,
            backgroundColor: 'rgba(14,165,233,0.8)'
        }],
        options: {
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

function renderCasesByProductChart(cases, caseProductsMap) {
    const canvas = document.getElementById('mgrChartCasesByProduct');
    if (!canvas) return;

    // Get dual-row aware case sets
    const { companyCases, competitorCases, hasCompanyFilters, hasCompetitorFilters } = getDualRowCaseSets(cases, caseProductsMap);

    // Use filtered cases if dual-row filters are active
    let filteredCases = cases;
    if (hasCompanyFilters || hasCompetitorFilters) {
        const validCaseIds = new Set([...companyCases.map(c => c.id), ...competitorCases.map(c => c.id)]);
        filteredCases = cases.filter(c => validCaseIds.has(c.id));
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
    const canvas = document.getElementById('mgrChartUnitsMarketShare');
    if (!canvas) return;

    const ctx = getDashboardDualRowFilterContext();
    const filteredProducts = getDashboardFilteredProducts(cases, caseProductsMap);

    let labels, data;
    if (ctx.hasCompanyFilters || ctx.hasCompetitorFilters || ctx.companyType) {
        const companyUnits = filteredProducts
            .filter((p) => p.is_company_product)
            .reduce((sum, p) => sum + (p.units || 0), 0);
        const competitorUnits = filteredProducts
            .filter((p) => !p.is_company_product)
            .reduce((sum, p) => sum + (p.units || 0), 0);

        if (ctx.companyType === 'company') {
            labels = ['Company'];
            data = [companyUnits];
        } else if (ctx.companyType === 'competitor') {
            labels = ['Competitor'];
            data = [competitorUnits];
        } else if (ctx.hasCompanyFilters && ctx.hasCompetitorFilters) {
            labels = ['Company', 'Competitor'];
            data = [companyUnits, competitorUnits];
        } else if (ctx.hasCompanyFilters) {
            labels = ['Company'];
            data = [companyUnits];
        } else if (ctx.hasCompetitorFilters) {
            labels = ['Competitor'];
            data = [competitorUnits];
        } else {
            labels = ['Company', 'Competitor'];
            data = [companyUnits, competitorUnits];
        }
    } else {
        // No dual-row/company-type filters - standard calculation
        const result = calculateUnitsMarketShare(cases, caseProductsMap);
        labels = result.labels;
        data = result.data;
    }

    const baseColors = [
        'rgba(99,102,241,0.9)',
        'rgba(236,72,153,0.9)',
        'rgba(34,197,94,0.9)',
        'rgba(251,191,36,0.9)',
        'rgba(14,165,233,0.9)',
        'rgba(168,85,247,0.9)',
        'rgba(59,130,246,0.9)',
        'rgba(16,185,129,0.9)',
        'rgba(245,158,11,0.9)'
    ];

    // Build colors array - ensure "Other Companies" gets red color
    const colors = [];
    for (let i = 0; i < labels.length; i++) {
        if (i === labels.length - 1 && (labels[i] === 'Other Companies' || labels[i] === 'Others')) {
            colors.push('rgba(220,38,38,0.9)'); // Red for Others
        } else {
            colors.push(baseColors[i % baseColors.length]);
        }
    }

    destroyChart(state.charts.unitsMarketShare);
    state.charts.unitsMarketShare = buildPieChart(canvas, {
        labels,
        data,
        backgroundColor: colors
    });
}

function renderUnitsPerCategoryChart(caseProducts, cases, caseProductsMap) {
    const canvas = document.getElementById('mgrChartUnitsPerCategory');
    if (!canvas) return;

    const filteredProducts = getDashboardFilteredProducts(cases, caseProductsMap);

    const { labels, data, counts } = calculateUnitsByCategory(filteredProducts);

    const baseColors = [
        'rgba(99,102,241,0.85)',
        'rgba(236,72,153,0.85)',
        'rgba(34,197,94,0.85)',
        'rgba(251,191,36,0.85)',
        'rgba(168,85,247,0.85)',
        'rgba(59,130,246,0.85)',
        'rgba(249,115,22,0.85)',
        'rgba(20,184,166,0.85)',
        'rgba(244,63,94,0.85)',
        'rgba(139,92,246,0.85)'
    ];

    // Build colors array - ensure "Others" gets red color
    const colors = [];
    for (let i = 0; i < labels.length; i++) {
        if (i === labels.length - 1 && (labels[i] === 'Other Companies' || labels[i] === 'Others')) {
            colors.push('rgba(220,38,38,0.9)'); // Red for Others
        } else {
            colors.push(baseColors[i % baseColors.length]);
        }
    }

    destroyChart(state.charts.unitsPerCategory);
    state.charts.unitsPerCategory = buildPieChart(canvas, {
        labels,
        data,
        backgroundColor: colors,
        options: {
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const count = counts[context.dataIndex] || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
                            return `${label}: ${value} units (${count} cases, ${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function renderUnitsPerCompanyChart(cases, caseProductsMap) {
    const canvas = document.getElementById('mgrChartUnitsPerCompany');
    if (!canvas) return;

    const filteredProducts = getDashboardFilteredProducts(cases, caseProductsMap);
    const filteredCaseProductsMap = buildCaseProductsMapFromProducts(filteredProducts);
    const filteredCases = cases.filter((caseItem) => filteredCaseProductsMap.has(caseItem.id));

    const { labels, fullLabels, datasets } = calculateUnitsPerCompanyStacked(filteredCases, filteredCaseProductsMap);

    destroyChart(state.charts.unitsPerCompany);
    state.charts.unitsPerCompany = buildBarChart(canvas, {
        labels,
        datasets,
        stacked: true,
        options: {
            plugins: {
                legend: {
                    display: false // Hide legend to increase chart area
                },
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            // Show full sub-category name in tooltip
                            const index = context[0].dataIndex;
                            return fullLabels[index] || context[0].label;
                        },
                        label: function(context) {
                            const companyName = context.dataset.label;
                            const units = context.parsed.y;
                            return `${companyName}: ${units} units`;
                        }
                    }
                }
            }
        }
    });
}

function renderCasesByCategoryChart(cases, caseProductsMap) {
    const canvas = document.getElementById('mgrChartCasesByCategory');
    if (!canvas) return;

    const filteredProducts = getDashboardFilteredProducts(cases, caseProductsMap);
    const filteredCaseProductsMap = buildCaseProductsMapFromProducts(filteredProducts);
    const filteredCases = cases.filter((caseItem) => filteredCaseProductsMap.has(caseItem.id));

    const { labels, data, counts } = calculateCasesByCategory(filteredCases, filteredCaseProductsMap);

    const baseColors = [
        'rgba(99,102,241,0.85)',
        'rgba(236,72,153,0.85)',
        'rgba(34,197,94,0.85)',
        'rgba(251,191,36,0.85)',
        'rgba(168,85,247,0.85)',
        'rgba(59,130,246,0.85)',
        'rgba(249,115,22,0.85)',
        'rgba(20,184,166,0.85)',
        'rgba(244,63,94,0.85)',
        'rgba(139,92,246,0.85)'
    ];

    // Build colors array - ensure "Others" gets red color
    const colors = [];
    for (let i = 0; i < labels.length; i++) {
        if (i === labels.length - 1 && (labels[i] === 'Other Companies' || labels[i] === 'Others')) {
            colors.push('rgba(220,38,38,0.9)'); // Red for Others
        } else {
            colors.push(baseColors[i % baseColors.length]);
        }
    }

    destroyChart(state.charts.casesByCategory);
    state.charts.casesByCategory = buildPieChart(canvas, {
        labels,
        data,
        backgroundColor: colors,
        options: {
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const count = counts[context.dataIndex] || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
                            return `${label}: ${value} cases (${count} products, ${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function renderDMCCasesByProductChart(cases, caseProductsMap) {
    const canvas = document.getElementById('mgrChartDMCCasesByProduct');
    if (!canvas) return;

    const filteredProducts = getDashboardFilteredProducts(cases, caseProductsMap);
    const filteredCaseProductsMap = buildCaseProductsMapFromProducts(filteredProducts);
    const filteredCases = cases.filter((caseItem) => filteredCaseProductsMap.has(caseItem.id));

    const { allLabels, allData, totalProducts } = calculateDMCCasesByProduct(filteredCases, filteredCaseProductsMap);

    // Pagination
    const page = state.chartPagination.dmcCasesPage;
    const pageSize = 10;
    const start = page * pageSize;
    const end = start + pageSize;
    const labels = allLabels.slice(start, end);
    const data = allData.slice(start, end);

    // Update page info
    const pageInfo = document.getElementById('mgrDmcCasesPageInfo');
    if (pageInfo) {
        if (totalProducts === 0) {
            pageInfo.textContent = '0';
        } else {
            pageInfo.textContent = `${start + 1}-${Math.min(end, totalProducts)} of ${totalProducts}`;
        }
    }

    // Update button states
    const prevBtn = document.getElementById('btnMgrDMCCasesPrev');
    const nextBtn = document.getElementById('btnMgrDMCCasesNext');
    if (prevBtn) prevBtn.disabled = page === 0;
    if (nextBtn) nextBtn.disabled = end >= totalProducts;

    destroyChart(state.charts.dmcCasesByProduct);
    state.charts.dmcCasesByProduct = buildBarChart(canvas, {
        labels,
        datasets: [{
            label: 'Cases',
            data,
            backgroundColor: 'rgba(99,102,241,0.85)' // Blue for DMC
        }],
        options: {
            plugins: {
                legend: {
                    display: false // Hide legend for better sizing
                }
            }
        }
    });
}

function renderCompetitorCasesByProductChart(cases, caseProductsMap) {
    const canvas = document.getElementById('mgrChartCompetitorCasesByProduct');
    if (!canvas) return;

    const filteredProducts = getDashboardFilteredProducts(cases, caseProductsMap);
    const filteredCaseProductsMap = buildCaseProductsMapFromProducts(filteredProducts);
    const filteredCases = cases.filter((caseItem) => filteredCaseProductsMap.has(caseItem.id));

    const { allLabels, allData, totalProducts } = calculateCompetitorCasesByProduct(filteredCases, filteredCaseProductsMap);

    // Pagination
    const page = state.chartPagination.competitorCasesPage;
    const pageSize = 10;
    const start = page * pageSize;
    const end = start + pageSize;
    const labels = allLabels.slice(start, end);
    const data = allData.slice(start, end);

    // Update page info
    const pageInfo = document.getElementById('mgrCompetitorCasesPageInfo');
    if (pageInfo) {
        if (totalProducts === 0) {
            pageInfo.textContent = '0';
        } else {
            pageInfo.textContent = `${start + 1}-${Math.min(end, totalProducts)} of ${totalProducts}`;
        }
    }

    // Update button states
    const prevBtn = document.getElementById('btnMgrCompetitorCasesPrev');
    const nextBtn = document.getElementById('btnMgrCompetitorCasesNext');
    if (prevBtn) prevBtn.disabled = page === 0;
    if (nextBtn) nextBtn.disabled = end >= totalProducts;

    destroyChart(state.charts.competitorCasesByProduct);
    state.charts.competitorCasesByProduct = buildBarChart(canvas, {
        labels,
        datasets: [{
            label: 'Cases',
            data,
            backgroundColor: 'rgba(236,72,153,0.85)' // Pink for competitor
        }],
        options: {
            plugins: {
                legend: {
                    display: false // Hide legend for better sizing
                }
            }
        }
    });
}

function renderDMCUnitsByProductChart(caseProducts, cases, caseProductsMap) {
    const canvas = document.getElementById('mgrChartDMCUnitsByProduct');
    if (!canvas) return;

    const filteredProducts = getDashboardFilteredProducts(cases, caseProductsMap);

    const { allLabels, allData, totalProducts } = calculateDMCUnitsByProduct(filteredProducts);

    // Pagination
    const page = state.chartPagination.dmcUnitsPage;
    const pageSize = 10;
    const start = page * pageSize;
    const end = start + pageSize;
    const labels = allLabels.slice(start, end);
    const data = allData.slice(start, end);

    // Update page info
    const pageInfo = document.getElementById('mgrDmcUnitsPageInfo');
    if (pageInfo) {
        if (totalProducts === 0) {
            pageInfo.textContent = '0';
        } else {
            pageInfo.textContent = `${start + 1}-${Math.min(end, totalProducts)} of ${totalProducts}`;
        }
    }

    // Update button states
    const prevBtn = document.getElementById('btnMgrDMCUnitsPrev');
    const nextBtn = document.getElementById('btnMgrDMCUnitsNext');
    if (prevBtn) prevBtn.disabled = page === 0;
    if (nextBtn) nextBtn.disabled = end >= totalProducts;

    destroyChart(state.charts.dmcUnitsByProduct);
    state.charts.dmcUnitsByProduct = buildBarChart(canvas, {
        labels,
        datasets: [{
            label: 'Units',
            data,
            backgroundColor: 'rgba(99,102,241,0.85)' // Blue for DMC
        }],
        options: {
            plugins: {
                legend: {
                    display: false // Hide legend for better sizing
                }
            }
        }
    });
}

function renderCompetitorUnitsByProductChart(caseProducts, cases, caseProductsMap) {
    const canvas = document.getElementById('mgrChartCompetitorUnitsByProduct');
    if (!canvas) return;

    const filteredProducts = getDashboardFilteredProducts(cases, caseProductsMap);

    const { allLabels, allData, totalProducts } = calculateCompetitorUnitsByProduct(filteredProducts);

    // Pagination
    const page = state.chartPagination.competitorUnitsPage;
    const pageSize = 10;
    const start = page * pageSize;
    const end = start + pageSize;
    const labels = allLabels.slice(start, end);
    const data = allData.slice(start, end);

    // Update page info
    const pageInfo = document.getElementById('mgrCompetitorUnitsPageInfo');
    if (pageInfo) {
        if (totalProducts === 0) {
            pageInfo.textContent = '0';
        } else {
            pageInfo.textContent = `${start + 1}-${Math.min(end, totalProducts)} of ${totalProducts}`;
        }
    }

    // Update button states
    const prevBtn = document.getElementById('btnMgrCompetitorUnitsPrev');
    const nextBtn = document.getElementById('btnMgrCompetitorUnitsNext');
    if (prevBtn) prevBtn.disabled = page === 0;
    if (nextBtn) nextBtn.disabled = end >= totalProducts;

    destroyChart(state.charts.competitorUnitsByProduct);
    state.charts.competitorUnitsByProduct = buildBarChart(canvas, {
        labels,
        datasets: [{
            label: 'Units',
            data,
            backgroundColor: 'rgba(236,72,153,0.85)' // Pink for competitor
        }],
        options: {
            plugins: {
                legend: {
                    display: false // Hide legend for better sizing
                }
            }
        }
    });
}

function renderMonthlyUnitsTrendChart(cases, caseProductsMap) {
    const canvas = document.getElementById('mgrChartMonthlyUnitsTrend');
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

function renderUnitsByPSChart(cases, caseProductsMap) {
    const canvas = document.getElementById('mgrChartUnitsPerPS');
    if (!canvas) return;

    const filteredProducts = getDashboardFilteredProducts(cases, caseProductsMap);
    const { labels, data } = calculateUnitsByProductSpecialistFromProducts(cases, filteredProducts);

    destroyChart(state.charts.unitsByPS);
    state.charts.unitsByPS = buildBarChart(canvas, {
        labels,
        datasets: [{
            label: 'Units',
            data,
            backgroundColor: 'rgba(168,85,247,0.8)'
        }],
        options: {
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

function renderUnitsByProductChart(caseProducts, cases, caseProductsMap) {
    const canvas = document.getElementById('mgrChartUnitsPerProduct');
    if (!canvas) return;

    // Get dual-row filter values to filter products
    const companyCompany = document.getElementById('manager-dashboard-filter-company-company')?.value || '';
    const competitorCompany = document.getElementById('manager-dashboard-filter-competitor-company')?.value || '';
    const hasCompanyFilters = companyCompany || document.getElementById('manager-dashboard-filter-company-category')?.value ||
                              document.getElementById('manager-dashboard-filter-company-sub-category')?.value ||
                              document.getElementById('manager-dashboard-filter-company-product')?.value;
    const hasCompetitorFilters = competitorCompany || document.getElementById('manager-dashboard-filter-competitor-category')?.value ||
                                 document.getElementById('manager-dashboard-filter-competitor-sub-category')?.value ||
                                 document.getElementById('manager-dashboard-filter-competitor-product')?.value;

    // Filter products based on dual-row selections
    let filteredProducts = caseProducts;
    if (hasCompanyFilters || hasCompetitorFilters) {
        const { companyCases, competitorCases } = getDualRowCaseSets(cases, caseProductsMap);
        const validCaseIds = new Set([...companyCases.map(c => c.id), ...competitorCases.map(c => c.id)]);
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

    // Setup navigation buttons for paginated charts
    setupChartNavigationButtons();
}

function setupChartNavigationButtons() {
    // DMC Cases navigation
    const btnDMCCasesPrev = document.getElementById('btnMgrDMCCasesPrev');
    const btnDMCCasesNext = document.getElementById('btnMgrDMCCasesNext');
    if (btnDMCCasesPrev && btnDMCCasesNext) {
        // Clone to remove old listeners
        const newPrev = btnDMCCasesPrev.cloneNode(true);
        const newNext = btnDMCCasesNext.cloneNode(true);
        btnDMCCasesPrev.parentNode.replaceChild(newPrev, btnDMCCasesPrev);
        btnDMCCasesNext.parentNode.replaceChild(newNext, btnDMCCasesNext);

        newPrev.addEventListener('click', () => {
            if (state.chartPagination.dmcCasesPage > 0) {
                state.chartPagination.dmcCasesPage--;
                renderDashboard();
            }
        });
        newNext.addEventListener('click', () => {
            state.chartPagination.dmcCasesPage++;
            renderDashboard();
        });
    }

    // Competitor Cases navigation
    const btnCompetitorCasesPrev = document.getElementById('btnMgrCompetitorCasesPrev');
    const btnCompetitorCasesNext = document.getElementById('btnMgrCompetitorCasesNext');
    if (btnCompetitorCasesPrev && btnCompetitorCasesNext) {
        const newPrev = btnCompetitorCasesPrev.cloneNode(true);
        const newNext = btnCompetitorCasesNext.cloneNode(true);
        btnCompetitorCasesPrev.parentNode.replaceChild(newPrev, btnCompetitorCasesPrev);
        btnCompetitorCasesNext.parentNode.replaceChild(newNext, btnCompetitorCasesNext);

        newPrev.addEventListener('click', () => {
            if (state.chartPagination.competitorCasesPage > 0) {
                state.chartPagination.competitorCasesPage--;
                renderDashboard();
            }
        });
        newNext.addEventListener('click', () => {
            state.chartPagination.competitorCasesPage++;
            renderDashboard();
        });
    }

    // DMC Units navigation
    const btnDMCUnitsPrev = document.getElementById('btnMgrDMCUnitsPrev');
    const btnDMCUnitsNext = document.getElementById('btnMgrDMCUnitsNext');
    if (btnDMCUnitsPrev && btnDMCUnitsNext) {
        const newPrev = btnDMCUnitsPrev.cloneNode(true);
        const newNext = btnDMCUnitsNext.cloneNode(true);
        btnDMCUnitsPrev.parentNode.replaceChild(newPrev, btnDMCUnitsPrev);
        btnDMCUnitsNext.parentNode.replaceChild(newNext, btnDMCUnitsNext);

        newPrev.addEventListener('click', () => {
            if (state.chartPagination.dmcUnitsPage > 0) {
                state.chartPagination.dmcUnitsPage--;
                renderDashboard();
            }
        });
        newNext.addEventListener('click', () => {
            state.chartPagination.dmcUnitsPage++;
            renderDashboard();
        });
    }

    // Competitor Units navigation
    const btnCompetitorUnitsPrev = document.getElementById('btnMgrCompetitorUnitsPrev');
    const btnCompetitorUnitsNext = document.getElementById('btnMgrCompetitorUnitsNext');
    if (btnCompetitorUnitsPrev && btnCompetitorUnitsNext) {
        const newPrev = btnCompetitorUnitsPrev.cloneNode(true);
        const newNext = btnCompetitorUnitsNext.cloneNode(true);
        btnCompetitorUnitsPrev.parentNode.replaceChild(newPrev, btnCompetitorUnitsPrev);
        btnCompetitorUnitsNext.parentNode.replaceChild(newNext, btnCompetitorUnitsNext);

        newPrev.addEventListener('click', () => {
            if (state.chartPagination.competitorUnitsPage > 0) {
                state.chartPagination.competitorUnitsPage--;
                renderDashboard();
            }
        });
        newNext.addEventListener('click', () => {
            state.chartPagination.competitorUnitsPage++;
            renderDashboard();
        });
    }
}

function refreshManagerCaseFormOptions() {
    const doctorSelect = document.getElementById('manager-case-doctor');
    if (doctorSelect) {
        const approvedDoctors = state.doctors.filter((doctor) => doctor.status === APPROVAL_STATUS.APPROVED);
        const options = approvedDoctors.map((doctor) => `<option value="${doctor.id}">${doctor.name}</option>`).join('');
        doctorSelect.innerHTML = '<option value="">Select doctor</option>' + options;
    }
    const accountSelect = document.getElementById('manager-case-account');
    if (accountSelect) {
        const approvedAccounts = state.accounts.filter((account) => account.status === APPROVAL_STATUS.APPROVED);
        const options = approvedAccounts.map((account) => `<option value="${account.id}">${account.name}</option>`).join('');
        accountSelect.innerHTML = '<option value="">Select account</option>' + options;
    }
}

// ============================================================================
// MESSAGE SYSTEM
// ============================================================================

async function handleMessagesClick() {
    bootstrapComponents.messagesOffcanvas?.show();
    await loadReceivedMessages();
}

async function loadReceivedMessages() {
    try {
        const messages = await fetchReceivedMessages(state.session.userId);
        renderManagerMessages(messages);
    } catch (error) {
        console.error('Error loading received messages:', error);
        if (elements.messagesContainer) {
            elements.messagesContainer.innerHTML = '<div class="text-center text-secondary p-4">Failed to load messages</div>';
        }
    }
}

function renderManagerMessages(messages) {
    if (!elements.messagesContainer) return;

    if (!messages || messages.length === 0) {
        elements.messagesContainer.innerHTML = '<div class="text-center text-secondary p-4">No messages yet</div>';
        return;
    }

    elements.messagesContainer.innerHTML = messages.map(msg => {
        return `
            <div class="message-item ${!msg.is_read ? 'unread' : ''}" data-message-id="${msg.id}">
                <div class="message-header">
                    <span class="message-sender">${msg.sender_full_name || msg.sender_username}</span>
                    <span class="message-date">${formatDate(msg.created_at)}</span>
                </div>
                ${msg.subject ? `<div class="message-subject">${msg.subject}</div>` : ''}
                <div class="message-preview">${msg.message_text.substring(0, 100)}${msg.message_text.length > 100 ? '...' : ''}</div>
            </div>
        `;
    }).join('');

    // Add click handlers to open full message
    elements.messagesContainer.querySelectorAll('.message-item').forEach(item => {
        item.addEventListener('click', () => {
            const messageId = item.dataset.messageId;
            const message = messages.find(m => m.id === messageId);
            if (message) {
                showMessageView(message);
            }
        });
    });
}

async function showMessageView(message) {
    const modalBody = document.getElementById('message-view-body');
    if (!modalBody) return;

    modalBody.innerHTML = `
        <div class="mb-3">
            <strong>From:</strong> ${message.sender_full_name || message.sender_username}
        </div>
        ${message.subject ? `
        <div class="mb-3">
            <strong>Subject:</strong> ${message.subject}
        </div>
        ` : ''}
        <div class="mb-3">
            <strong>Date:</strong> ${formatDate(message.created_at)}
        </div>
        <hr>
        <div style="white-space: pre-wrap;">${message.message_text}</div>
    `;

    bootstrapComponents.messageViewModal?.show();

    // Mark as read if unread
    if (!message.is_read) {
        try {
            await markMessageAsRead(message.id, state.session.userId);
            await loadReceivedMessages();
            await refreshUnreadMessageCount();
        } catch (error) {
            console.error('Error marking message as read:', error);
        }
    }
}

async function refreshUnreadMessageCount() {
    try {
        const count = await getUnreadMessageCount(state.session.userId);
        if (elements.messagesCounter) {
            if (count > 0) {
                elements.messagesCounter.textContent = count;
                elements.messagesCounter.classList.remove('d-none');
            } else {
                elements.messagesCounter.classList.add('d-none');
            }
        }
    } catch (error) {
        console.error('Error refreshing unread message count:', error);
    }
}



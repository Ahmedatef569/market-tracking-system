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
    formatMonth,
    generateCaseCode,
    downloadAsExcel,
    initThemeToggle,
    ensureThemeApplied,
    makeSelectSearchable,
    addEnglishOnlyValidation,
    validateFormEnglishOnly
} from './utils.js';
import { createTable, tableFormatters, bindTableActions, ensureTabulator } from './tables.js';
import { applyChartDefaults, resetChartDefaults, buildLineChart, buildBarChart, buildDoughnutChart, buildPieChart, destroyChart } from './charts.js';
import { fetchNotifications, markNotificationsRead, createNotification } from './notifications.js';
import { initFormModal, refreshFormHosts, closeFormModal } from './formModal.js';
import {
    groupCaseProducts,
    computeCaseMetrics,
    computeCaseMetricsWithSubcategoryFilter,
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
    attachProductsToggle
} from './caseAnalytics.js';

ensureThemeApplied();


const state = {
    session: null,
    products: [],
    doctors: [],
    accounts: [],
    cases: [],
    caseProducts: [],
    caseProductsByCase: new Map(),
    approvals: [],
    tables: {},
    charts: {},
    autocompletes: {},
    companyProductsMap: new Map(),
    caseFormRows: 1,
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
    markNotificationsBtn: document.getElementById('mark-notifications-read'),
    notificationsIndicator: document.getElementById('notifications-indicator'),
    notificationsContainer: document.getElementById('notifications-container'),
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

applyChartDefaults();

document.addEventListener('DOMContentLoaded', init);

async function init() {
    state.session = await requireAuth([ROLES.EMPLOYEE]);
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
    setupMyDataTabs();
    initFilterPanels();
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
        elements.accountRole.textContent = employee.position || 'Product Specialist';
    } else {
        elements.accountName.textContent = state.session.username;
        elements.accountRole.textContent = state.session.role || 'Product Specialist';
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

    if (window.bootstrap) {
        const offcanvasEl = document.getElementById('offcanvasNotifications');
        bootstrapComponents.notificationsOffcanvas = offcanvasEl
            ? new window.bootstrap.Offcanvas(offcanvasEl)
            : null;
        bootstrapComponents.passwordModal = elements.passwordModal
            ? new window.bootstrap.Modal(elements.passwordModal)
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

function setupMyDataTabs() {
    const buttons = Array.from(document.querySelectorAll('#my-data-tabs button'));
    const panels = Array.from(document.querySelectorAll('.my-data-panel'));
    initTabNavigation(buttons, panels, 'myDataTab', 'products');
}

async function loadInitialData() {
    await Promise.all([
        loadProducts(),
        loadDoctors(),
        loadAccounts(),
        loadCases()
    ]);
    buildApprovalDataset();
    ensureLineDatalist();
}

function initializeForms() {
    setupDoctorForm();
    setupAccountForm();
    setupCaseForm();
    setupCaseFilters();
    setupDashboardFilters();
    setupApprovalsFilters();
    setupExportButtons();
}


function renderAll() {
    renderProductsSection({ refreshFilters: true });
    renderDoctorSection({ refreshFilters: true });
    renderAccountSection({ refreshFilters: true });
    renderCasesSection();
    renderApprovalsTable();
    renderDashboard();
}

function setupCaseFilters() {
    const container = document.getElementById('ps-cases-filters');
    if (!container) return;

    // Save previous selections for dual-row filters
    const previousSelections = {
        status: container.querySelector('#ps-filter-status')?.value || '',
        accountType: container.querySelector('#ps-filter-account-type')?.value || '',
        companyType: container.querySelector('#ps-filter-company-type')?.value || '',

        // Dual-row filter values
        companyCompany: container.querySelector('#ps-filter-company-company')?.value || '',
        companyCategory: container.querySelector('#ps-filter-company-category')?.value || '',
        companySubCategory: container.querySelector('#ps-filter-company-sub-category')?.value || '',
        companyProduct: container.querySelector('#ps-filter-company-product')?.value || '',

        competitorCompany: container.querySelector('#ps-filter-competitor-company')?.value || '',
        competitorCategory: container.querySelector('#ps-filter-competitor-category')?.value || '',
        competitorSubCategory: container.querySelector('#ps-filter-competitor-sub-category')?.value || '',
        competitorProduct: container.querySelector('#ps-filter-competitor-product')?.value || '',

        month: container.querySelector('#ps-filter-month')?.value || '',
        from: container.querySelector('#ps-filter-from')?.value || '',
        to: container.querySelector('#ps-filter-to')?.value || ''
    };

    const { company, competitor } = collectDualRowFilterOptions(state.caseProducts, state.products);
    container.innerHTML = `
        <div class="filters-row">
            <select class="form-select" id="ps-filter-status">
                <option value="">All Status</option>
                ${Object.values(APPROVAL_STATUS)
                    .map((status) => `<option value="${status}">${status.replace('_', ' ')}</option>`)
                    .join('')}
            </select>
            <select class="form-select" id="ps-filter-account-type">
                <option value="">All Account Types</option>
                ${ACCOUNT_TYPES.map((type) => `<option value="${type}">${type}</option>`).join('')}
            </select>
            <select class="form-select" id="ps-filter-company-type">
                <option value="">All Company Types</option>
                <option value="company">Company</option>
                <option value="competitor">Competitor</option>
            </select>
            <div style="grid-column: span 1;"></div>
        </div>

        <!-- Company Filters Row -->
        <div class="filters-row">
            <select class="form-select" id="ps-filter-company-company">
                <option value="">All Companies</option>
                ${company.companies.map((comp) => `<option value="${comp}">${comp}</option>`).join('')}
            </select>
            <select class="form-select" id="ps-filter-company-category">
                <option value="">All Categories</option>
                ${company.categories.map((cat) => `<option value="${cat}">${cat}</option>`).join('')}
            </select>
            <select class="form-select" id="ps-filter-company-sub-category">
                <option value="">All Sub Categories</option>
                ${company.subCategories.map((sub) => `<option value="${sub}">${sub}</option>`).join('')}
            </select>
            <select class="form-select" id="ps-filter-company-product">
                <option value="">All Products</option>
                ${company.productOptions.map((option) => `<option value="${option.value}">${option.label}</option>`).join('')}
            </select>
        </div>

        <!-- Competitor Filters Row -->
        <div class="filters-row">
            <select class="form-select" id="ps-filter-competitor-company">
                <option value="">All Companies</option>
                ${competitor.companies.map((comp) => `<option value="${comp}">${comp}</option>`).join('')}
            </select>
            <select class="form-select" id="ps-filter-competitor-category">
                <option value="">All Categories</option>
                ${competitor.categories.map((cat) => `<option value="${cat}">${cat}</option>`).join('')}
            </select>
            <select class="form-select" id="ps-filter-competitor-sub-category">
                <option value="">All Sub Categories</option>
                ${competitor.subCategories.map((sub) => `<option value="${sub}">${sub}</option>`).join('')}
            </select>
            <select class="form-select" id="ps-filter-competitor-product">
                <option value="">All Products</option>
                ${competitor.productOptions.map((option) => `<option value="${option.value}">${option.label}</option>`).join('')}
            </select>
        </div>

        <div class="filters-row">
            <select class="form-select" id="ps-filter-month">
                <option value="">Any Month</option>
                ${Array.from({ length: 12 }, (_, index) => {
                    const month = index + 1;
                    const label = new Date(2000, index).toLocaleString(undefined, { month: 'long' });
                    return `<option value="${month}">${label}</option>`;
                }).join('')}
            </select>
            <input type="date" class="form-control" id="ps-filter-from" placeholder="From Date">
            <input type="date" class="form-control" id="ps-filter-to" placeholder="To Date">
            <div class="filters-actions" style="justify-self: end;">
                <button class="btn btn-outline-ghost" id="ps-filter-reset">Reset</button>
                <button class="btn btn-outline-ghost" id="ps-cases-export"><i class="bi bi-download me-2"></i>Export</button>
            </div>
        </div>
    `;

    const handleFiltersChange = () => {
        const filtered = getFilteredCases();
        renderCaseStats(filtered);
        renderCasesTable(filtered);
    };

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

    setSelectValue('#ps-filter-status', previousSelections.status);
    setSelectValue('#ps-filter-account-type', previousSelections.accountType);
    setSelectValue('#ps-filter-company-type', previousSelections.companyType);

    // Dual-row filter preservation
    setSelectValue('#ps-filter-company-company', previousSelections.companyCompany);
    setSelectValue('#ps-filter-company-category', previousSelections.companyCategory);
    setSelectValue('#ps-filter-company-sub-category', previousSelections.companySubCategory);
    setSelectValue('#ps-filter-company-product', previousSelections.companyProduct);

    setSelectValue('#ps-filter-competitor-company', previousSelections.competitorCompany);
    setSelectValue('#ps-filter-competitor-category', previousSelections.competitorCategory);
    setSelectValue('#ps-filter-competitor-sub-category', previousSelections.competitorSubCategory);
    setSelectValue('#ps-filter-competitor-product', previousSelections.competitorProduct);

    setSelectValue('#ps-filter-month', previousSelections.month);

    const fromInput = container.querySelector('#ps-filter-from');
    if (fromInput) fromInput.value = previousSelections.from || '';
    const toInput = container.querySelector('#ps-filter-to');
    if (toInput) toInput.value = previousSelections.to || '';

    // Setup dual-row cascading filters (EXACT COPY FROM ADMIN)
    const setupDualRowFilters = () => {
        // Company row cascading
        const companyCompanySelect = container.querySelector('#ps-filter-company-company');
        const companyCategorySelect = container.querySelector('#ps-filter-company-category');
        const companySubCategorySelect = container.querySelector('#ps-filter-company-sub-category');
        const companyProductSelect = container.querySelector('#ps-filter-company-product');

        // Competitor row cascading
        const competitorCompanySelect = container.querySelector('#ps-filter-competitor-company');
        const competitorCategorySelect = container.querySelector('#ps-filter-competitor-category');
        const competitorSubCategorySelect = container.querySelector('#ps-filter-competitor-sub-category');
        const competitorProductSelect = container.querySelector('#ps-filter-competitor-product');

        // Company row cascading logic (EXACT COPY FROM ADMIN)
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
                const { company } = collectDualRowFilterOptions(state.caseProducts, state.products);
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

        // Competitor row cascading logic (EXACT COPY FROM ADMIN)
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
                const { competitor } = collectDualRowFilterOptions(state.caseProducts, state.products);
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
    container.querySelector('#ps-filter-status')?.addEventListener('change', handleFiltersChange);
    container.querySelector('#ps-filter-account-type')?.addEventListener('change', handleFiltersChange);
    container.querySelector('#ps-filter-company-type')?.addEventListener('change', handleFiltersChange);
    container.querySelector('#ps-filter-month')?.addEventListener('change', handleFiltersChange);
    container.querySelector('#ps-filter-from')?.addEventListener('change', handleFiltersChange);
    container.querySelector('#ps-filter-to')?.addEventListener('change', handleFiltersChange);

    setupDualRowFilters();
    // Reset button
    container.querySelector('#ps-filter-reset').addEventListener('click', () => {
        container.querySelectorAll('select, input').forEach((input) => (input.value = ''));

        // Reset dual-row filter options to show all options
        const companyCompanySelect = container.querySelector('#ps-filter-company-company');
        const companyCategorySelect = container.querySelector('#ps-filter-company-category');
        const companySubCategorySelect = container.querySelector('#ps-filter-company-sub-category');
        const companyProductSelect = container.querySelector('#ps-filter-company-product');

        const competitorCompanySelect = container.querySelector('#ps-filter-competitor-company');
        const competitorCategorySelect = container.querySelector('#ps-filter-competitor-category');
        const competitorSubCategorySelect = container.querySelector('#ps-filter-competitor-sub-category');
        const competitorProductSelect = container.querySelector('#ps-filter-competitor-product');

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
    container.querySelector('#ps-cases-export').addEventListener('click', exportCases);

    handleFiltersChange();
}

function setupExportButtons() {
    document.getElementById('ps-cases-export-table')?.addEventListener('click', (event) => {
        event.preventDefault();
        exportCases();
    });

    document.getElementById('ps-export-doctors')?.addEventListener('click', (event) => {
        event.preventDefault();
        downloadAsExcel('my_doctors', state.doctors, {
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

    document.getElementById('ps-export-accounts')?.addEventListener('click', (event) => {
        event.preventDefault();
        downloadAsExcel('my_accounts', state.accounts, {
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

function setupApprovalsFilters() {
    const approvalsFilters = document.getElementById('ps-approvals-filters');
    if (!approvalsFilters) return;
    approvalsFilters.innerHTML = `
        <select class="form-select" id="ps-approvals-status">
            <option value="">All Status</option>
            ${Object.values(APPROVAL_STATUS)
                .map((status) => `<option value="${status}">${status.replace('_', ' ')}</option>`)
                .join('')}
        </select>
    `;
    approvalsFilters.querySelector('select').addEventListener('change', renderApprovalsTable);
}

function getFilteredCases() {
    const status = document.getElementById('ps-filter-status')?.value;
    const accountType = document.getElementById('ps-filter-account-type')?.value;
    const companyType = document.getElementById('ps-filter-company-type')?.value;

    // Dual-row filter values
    const companyCompany = document.getElementById('ps-filter-company-company')?.value;
    const companyCategory = document.getElementById('ps-filter-company-category')?.value;
    const companySubCategory = document.getElementById('ps-filter-company-sub-category')?.value;
    const companyProduct = document.getElementById('ps-filter-company-product')?.value;

    const competitorCompany = document.getElementById('ps-filter-competitor-company')?.value;
    const competitorCategory = document.getElementById('ps-filter-competitor-category')?.value;
    const competitorSubCategory = document.getElementById('ps-filter-competitor-sub-category')?.value;
    const competitorProduct = document.getElementById('ps-filter-competitor-product')?.value;

    const monthValue = document.getElementById('ps-filter-month')?.value;
    const fromValue = document.getElementById('ps-filter-from')?.value;
    const toValue = document.getElementById('ps-filter-to')?.value;

    const monthNumber = monthValue ? Number(monthValue) : null;
    const fromDate = fromValue ? new Date(fromValue) : null;
    const toDate = toValue ? new Date(toValue) : null;

    return state.cases.filter((caseItem) => {
        if (status && caseItem.status !== status) return false;
        if (accountType && caseItem.account_type !== accountType) return false;

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

        // DUAL-ROW MULTI-SELECTION FILTER LOGIC (same as admin.js)
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

function setupDashboardFilters() {
    const container = document.getElementById('ps-dashboard-filters');
    if (!container) return;

    // Save previous selections for dual-row filters
    const previousSelections = {
        status: container.querySelector('#ps-dashboard-filter-status')?.value || '',
        accountType: container.querySelector('#ps-dashboard-filter-account-type')?.value || '',
        companyType: container.querySelector('#ps-dashboard-filter-company-type')?.value || '',

        // Dual-row filter values
        companyCompany: container.querySelector('#ps-dashboard-filter-company-company')?.value || '',
        companyCategory: container.querySelector('#ps-dashboard-filter-company-category')?.value || '',
        companySubCategory: container.querySelector('#ps-dashboard-filter-company-sub-category')?.value || '',
        companyProduct: container.querySelector('#ps-dashboard-filter-company-product')?.value || '',

        competitorCompany: container.querySelector('#ps-dashboard-filter-competitor-company')?.value || '',
        competitorCategory: container.querySelector('#ps-dashboard-filter-competitor-category')?.value || '',
        competitorSubCategory: container.querySelector('#ps-dashboard-filter-competitor-sub-category')?.value || '',
        competitorProduct: container.querySelector('#ps-dashboard-filter-competitor-product')?.value || '',

        month: container.querySelector('#ps-dashboard-filter-month')?.value || '',
        from: container.querySelector('#ps-dashboard-filter-from')?.value || '',
        to: container.querySelector('#ps-dashboard-filter-to')?.value || ''
    };

    const { company, competitor } = collectDualRowFilterOptions(state.caseProducts, state.products);

    container.innerHTML = `
        <div class="filters-row">
            <select class="form-select" id="ps-dashboard-filter-status">
                <option value="">All Status</option>
                ${Object.values(APPROVAL_STATUS)
                    .map((status) => `<option value="${status}">${status.replace('_', ' ')}</option>`)
                    .join('')}
            </select>
            <select class="form-select" id="ps-dashboard-filter-account-type">
                <option value="">All Account Types</option>
                ${ACCOUNT_TYPES.map((type) => `<option value="${type}">${type}</option>`).join('')}
            </select>
            <select class="form-select" id="ps-dashboard-filter-company-type">
                <option value="">All Company Types</option>
                <option value="company">Company</option>
                <option value="competitor">Competitor</option>
            </select>
            <div style="grid-column: span 1;"></div>
        </div>

        <!-- Company Filters Row -->
        <div class="filters-row">
            <select class="form-select" id="ps-dashboard-filter-company-company">
                <option value="">All Companies</option>
                ${company.companies.map((comp) => `<option value="${comp}">${comp}</option>`).join('')}
            </select>
            <select class="form-select" id="ps-dashboard-filter-company-category">
                <option value="">All Categories</option>
                ${company.categories.map((cat) => `<option value="${cat}">${cat}</option>`).join('')}
            </select>
            <select class="form-select" id="ps-dashboard-filter-company-sub-category">
                <option value="">All Sub Categories</option>
                ${company.subCategories.map((sub) => `<option value="${sub}">${sub}</option>`).join('')}
            </select>
            <select class="form-select" id="ps-dashboard-filter-company-product">
                <option value="">All Products</option>
                ${company.productOptions.map((option) => `<option value="${option.value}">${option.label}</option>`).join('')}
            </select>
        </div>

        <!-- Competitor Filters Row -->
        <div class="filters-row">
            <select class="form-select" id="ps-dashboard-filter-competitor-company">
                <option value="">All Companies</option>
                ${competitor.companies.map((comp) => `<option value="${comp}">${comp}</option>`).join('')}
            </select>
            <select class="form-select" id="ps-dashboard-filter-competitor-category">
                <option value="">All Categories</option>
                ${competitor.categories.map((cat) => `<option value="${cat}">${cat}</option>`).join('')}
            </select>
            <select class="form-select" id="ps-dashboard-filter-competitor-sub-category">
                <option value="">All Sub Categories</option>
                ${competitor.subCategories.map((sub) => `<option value="${sub}">${sub}</option>`).join('')}
            </select>
            <select class="form-select" id="ps-dashboard-filter-competitor-product">
                <option value="">All Products</option>
                ${competitor.productOptions.map((option) => `<option value="${option.value}">${option.label}</option>`).join('')}
            </select>
        </div>

        <div class="filters-row">
            <select class="form-select" id="ps-dashboard-filter-month">
                <option value="">Any Month</option>
                ${Array.from({ length: 12 }, (_, index) => {
                    const month = index + 1;
                    const label = new Date(2000, index).toLocaleString(undefined, { month: 'long' });
                    return `<option value="${month}">${label}</option>`;
                }).join('')}
            </select>
            <input type="date" class="form-control" id="ps-dashboard-filter-from" placeholder="From Date">
            <input type="date" class="form-control" id="ps-dashboard-filter-to" placeholder="To Date">
            <div class="filters-actions" style="justify-self: end;">
                <button class="btn btn-outline-ghost" id="ps-dashboard-filter-reset">Reset</button>
                <button class="btn btn-outline-ghost" id="ps-dashboard-export"><i class="bi bi-download me-2"></i>Export</button>
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

    setSelectValue('#ps-dashboard-filter-status', previousSelections.status);
    setSelectValue('#ps-dashboard-filter-account-type', previousSelections.accountType);
    setSelectValue('#ps-dashboard-filter-company-type', previousSelections.companyType);

    // Dual-row filter preservation
    setSelectValue('#ps-dashboard-filter-company-company', previousSelections.companyCompany);
    setSelectValue('#ps-dashboard-filter-company-category', previousSelections.companyCategory);
    setSelectValue('#ps-dashboard-filter-company-sub-category', previousSelections.companySubCategory);
    setSelectValue('#ps-dashboard-filter-company-product', previousSelections.companyProduct);

    setSelectValue('#ps-dashboard-filter-competitor-company', previousSelections.competitorCompany);
    setSelectValue('#ps-dashboard-filter-competitor-category', previousSelections.competitorCategory);
    setSelectValue('#ps-dashboard-filter-competitor-sub-category', previousSelections.competitorSubCategory);
    setSelectValue('#ps-dashboard-filter-competitor-product', previousSelections.competitorProduct);

    setSelectValue('#ps-dashboard-filter-month', previousSelections.month);

    const fromInput = container.querySelector('#ps-dashboard-filter-from');
    if (fromInput) fromInput.value = previousSelections.from || '';
    const toInput = container.querySelector('#ps-dashboard-filter-to');
    if (toInput) toInput.value = previousSelections.to || '';

    // Setup dual-row cascading filters (EXACT COPY FROM ADMIN)
    const setupDualRowFilters = () => {
        // Company row cascading
        const companyCompanySelect = container.querySelector('#ps-dashboard-filter-company-company');
        const companyCategorySelect = container.querySelector('#ps-dashboard-filter-company-category');
        const companySubCategorySelect = container.querySelector('#ps-dashboard-filter-company-sub-category');
        const companyProductSelect = container.querySelector('#ps-dashboard-filter-company-product');

        // Competitor row cascading
        const competitorCompanySelect = container.querySelector('#ps-dashboard-filter-competitor-company');
        const competitorCategorySelect = container.querySelector('#ps-dashboard-filter-competitor-category');
        const competitorSubCategorySelect = container.querySelector('#ps-dashboard-filter-competitor-sub-category');
        const competitorProductSelect = container.querySelector('#ps-dashboard-filter-competitor-product');

        // Company row cascading logic (EXACT COPY FROM ADMIN)
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
                const { company } = collectDualRowFilterOptions(state.caseProducts, state.products);
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

        // Competitor row cascading logic (EXACT COPY FROM ADMIN)
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
                const { competitor } = collectDualRowFilterOptions(state.caseProducts, state.products);
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
    container.querySelector('#ps-dashboard-filter-status')?.addEventListener('change', handleFiltersChange);
    container.querySelector('#ps-dashboard-filter-account-type')?.addEventListener('change', handleFiltersChange);
    container.querySelector('#ps-dashboard-filter-company-type')?.addEventListener('change', handleFiltersChange);
    container.querySelector('#ps-dashboard-filter-month')?.addEventListener('change', handleFiltersChange);
    container.querySelector('#ps-dashboard-filter-from')?.addEventListener('change', handleFiltersChange);
    container.querySelector('#ps-dashboard-filter-to')?.addEventListener('change', handleFiltersChange);

    setupDualRowFilters();

    // Reset button - reset both rows to show all options
    container.querySelector('#ps-dashboard-filter-reset')?.addEventListener('click', (event) => {
        event.preventDefault();
        container.querySelectorAll('select').forEach((select) => (select.value = ''));
        container.querySelectorAll('input').forEach((input) => (input.value = ''));

        // Reset company row options
        const companyCompanySelect = container.querySelector('#ps-dashboard-filter-company-company');
        const companyCategorySelect = container.querySelector('#ps-dashboard-filter-company-category');
        const companySubCategorySelect = container.querySelector('#ps-dashboard-filter-company-sub-category');
        const companyProductSelect = container.querySelector('#ps-dashboard-filter-company-product');

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
        const competitorCompanySelect = container.querySelector('#ps-dashboard-filter-competitor-company');
        const competitorCategorySelect = container.querySelector('#ps-dashboard-filter-competitor-category');
        const competitorSubCategorySelect = container.querySelector('#ps-dashboard-filter-competitor-sub-category');
        const competitorProductSelect = container.querySelector('#ps-dashboard-filter-competitor-product');

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

    container.querySelector('#ps-dashboard-export')?.addEventListener('click', exportDashboardCases);

    // Initial render
    handleFiltersChange();
}

function getDashboardFilteredData() {
    const cases = getDashboardFilteredCases();
    const idSet = new Set(cases.map((caseItem) => caseItem.id));
    const filteredProducts = state.caseProducts.filter((product) => idSet.has(product.case_id));
    const caseProductsMap = groupCaseProducts(filteredProducts);
    return {
        cases,
        caseProducts: filteredProducts,
        caseProductsMap
    };
}

function getDashboardFilteredCases() {
    const status = document.getElementById('ps-dashboard-filter-status')?.value;
    const accountType = document.getElementById('ps-dashboard-filter-account-type')?.value;
    const companyType = document.getElementById('ps-dashboard-filter-company-type')?.value;

    // Dual-row filter values
    const companyCompany = document.getElementById('ps-dashboard-filter-company-company')?.value;
    const companyCategory = document.getElementById('ps-dashboard-filter-company-category')?.value;
    const companySubCategory = document.getElementById('ps-dashboard-filter-company-sub-category')?.value;
    const companyProduct = document.getElementById('ps-dashboard-filter-company-product')?.value;

    const competitorCompany = document.getElementById('ps-dashboard-filter-competitor-company')?.value;
    const competitorCategory = document.getElementById('ps-dashboard-filter-competitor-category')?.value;
    const competitorSubCategory = document.getElementById('ps-dashboard-filter-competitor-sub-category')?.value;
    const competitorProduct = document.getElementById('ps-dashboard-filter-competitor-product')?.value;

    const monthValue = document.getElementById('ps-dashboard-filter-month')?.value;
    const fromValue = document.getElementById('ps-dashboard-filter-from')?.value;
    const toValue = document.getElementById('ps-dashboard-filter-to')?.value;

    const monthNumber = monthValue ? Number(monthValue) : null;
    const fromDate = fromValue ? new Date(fromValue) : null;
    const toDate = toValue ? new Date(toValue) : null;

    return state.cases.filter((caseItem) => {
        if (status && caseItem.status !== status) return false;
        if (accountType && caseItem.account_type !== accountType) return false;

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

        // DUAL-ROW MULTI-SELECTION FILTER LOGIC (same as cases page)
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
    const container = document.getElementById('ps-cases-stats');
    if (!container) return;

    // Get dual-row filter selections (same logic as admin.js)
    const companyType = document.getElementById('ps-filter-company-type')?.value;
    const companyCompany = document.getElementById('ps-filter-company-company')?.value;
    const companyCategory = document.getElementById('ps-filter-company-category')?.value;
    const companySubCategory = document.getElementById('ps-filter-company-sub-category')?.value;
    const companyProduct = document.getElementById('ps-filter-company-product')?.value;

    const competitorCompany = document.getElementById('ps-filter-competitor-company')?.value;
    const competitorCategory = document.getElementById('ps-filter-competitor-category')?.value;
    const competitorSubCategory = document.getElementById('ps-filter-competitor-sub-category')?.value;
    const competitorProduct = document.getElementById('ps-filter-competitor-product')?.value;

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
        // DUAL-ROW SPECIFIC STATS CALCULATION (same logic as admin.js)
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
    state.tables.cases = createTable('ps-cases-table', columns, tableData, {
        height: 520,
        initialSort: [{ column: 'created_at', dir: 'desc' }]
    });
    attachProductsToggle(state.tables.cases, {
        anchorField: 'product3_units',
        storageKey: 'employee_cases_products_toggle'
    });
}

function exportCases() {
    const filtered = getFilteredCases();
    const rows = buildCaseExportRows(filtered, state.caseProductsByCase);
    downloadAsExcel('my_cases', rows, CASE_EXPORT_HEADERS);
}

function exportDashboardCases() {
    const { cases, caseProductsMap } = getDashboardFilteredData();
    const rows = buildCaseExportRows(cases, caseProductsMap);
    downloadAsExcel('my_dashboard_cases', rows, CASE_EXPORT_HEADERS);
}

function renderApprovalsTable() {
    const statusFilter = document.getElementById('ps-approvals-status')?.value;
    const dataset = statusFilter
        ? state.approvals.filter((item) => item.status === statusFilter)
        : state.approvals;

    const tableData = dataset.map((item) => ({
        ...item,
        type_label: formatApprovalType(item.type)
    }));

    const columns = [
        { title: 'Type', field: 'type_label', width: 140 },
        { title: 'Name / Code', field: 'name', minWidth: 200, headerFilter: 'input' },
        { title: 'Status', field: 'status', formatter: tableFormatters.status, width: 140 },
        { title: 'Submitted', field: 'created_at', formatter: tableFormatters.date, width: 150 }
    ];

    state.tables.approvals = createTable('ps-approvals-table', columns, tableData, {
        height: 420,
        initialSort: [{ column: 'created_at', dir: 'desc' }]
    });
}

function formatApprovalType(type = '') {
    if (!type) return 'Record';
    return type.charAt(0).toUpperCase() + type.slice(1);
}

function renderDashboard() {
    const { cases, caseProducts, caseProductsMap } = getDashboardFilteredData();
    renderDashboardStats(cases, caseProductsMap);
    renderDashboardCharts(cases, caseProductsMap, caseProducts);
}

// Helper function to get filtered case sets based on dual-row filter selections
function getDualRowCaseSets(cases, caseProductsMap) {
    // Get dual-row filter values
    const companyCompany = document.getElementById('ps-dashboard-filter-company-company')?.value || '';
    const companyCategory = document.getElementById('ps-dashboard-filter-company-category')?.value || '';
    const companySubCategory = document.getElementById('ps-dashboard-filter-company-sub-category')?.value || '';
    const companyProduct = document.getElementById('ps-dashboard-filter-company-product')?.value || '';

    const competitorCompany = document.getElementById('ps-dashboard-filter-competitor-company')?.value || '';
    const competitorCategory = document.getElementById('ps-dashboard-filter-competitor-category')?.value || '';
    const competitorSubCategory = document.getElementById('ps-dashboard-filter-competitor-sub-category')?.value || '';
    const competitorProduct = document.getElementById('ps-dashboard-filter-competitor-product')?.value || '';

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
    const companyCompany = document.getElementById('ps-dashboard-filter-company-company')?.value || '';
    const companyCategory = document.getElementById('ps-dashboard-filter-company-category')?.value || '';
    const companySubCategory = document.getElementById('ps-dashboard-filter-company-sub-category')?.value || '';
    const companyProduct = document.getElementById('ps-dashboard-filter-company-product')?.value || '';

    const competitorCompany = document.getElementById('ps-dashboard-filter-competitor-company')?.value || '';
    const competitorCategory = document.getElementById('ps-dashboard-filter-competitor-category')?.value || '';
    const competitorSubCategory = document.getElementById('ps-dashboard-filter-competitor-sub-category')?.value || '';
    const competitorProduct = document.getElementById('ps-dashboard-filter-competitor-product')?.value || '';

    const companyType = document.getElementById('ps-dashboard-filter-company-type')?.value || '';

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
    const container = document.getElementById('ps-dashboard-stats');
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
    const canvas = document.getElementById('psChartCasesTrend');
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
    const canvas = document.getElementById('psChartUnitsSplit');
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
    const canvas = document.getElementById('psChartCasesByEmployee');
    if (!canvas) return;
    const map = new Map();
    cases.forEach((caseItem) => {
        const owner =
            caseItem.submitted_by_name ||
            state.session.employee?.fullName ||
            state.session.username ||
            'Specialist';
        map.set(owner, (map.get(owner) || 0) + 1);
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
    const canvas = document.getElementById('psChartCasesSplit');
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
    const canvas = document.getElementById('psChartCompanyCasesByCategory');
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
    const canvas = document.getElementById('psChartCompanyCasesByProduct');
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
    const canvas = document.getElementById('psChartCasesByLine');
    if (!canvas) return;
    const map = new Map();
    cases.forEach((caseItem) => {
        const lineName = caseItem.line_name || state.session.employee?.lineName || 'Unassigned';
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
    const canvas = document.getElementById('psChartNumberOfCases');
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
    const canvas = document.getElementById('psChartCasesMarketShare');
    if (!canvas) return;

    // Get dual-row aware case sets
    const { companyCases, competitorCases, hasCompanyFilters, hasCompetitorFilters } = getDualRowCaseSets(cases, caseProductsMap);

    // Calculate market share based on dual-row filters
    let labels, data;
    if (hasCompanyFilters && hasCompetitorFilters) {
        const companyCount = companyCases.length;
        const competitorCount = competitorCases.length;
        labels = ['Company', 'Competitor'];
        data = [companyCount, competitorCount];
    } else if (hasCompanyFilters) {
        labels = ['Company'];
        data = [companyCases.length];
    } else if (hasCompetitorFilters) {
        labels = ['Competitor'];
        data = [competitorCases.length];
    } else {
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
    const canvas = document.getElementById('psChartMonthlyTrend');
    if (!canvas) return;

    // Get dual-row aware case sets
    const { companyCases, competitorCases } = getDualRowCaseSets(cases, caseProductsMap);

    console.log('[Employee Monthly Trend] Total cases:', cases.length);
    console.log('[Employee Monthly Trend] Company cases:', companyCases.length);
    console.log('[Employee Monthly Trend] Competitor cases:', competitorCases.length);

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

    console.log('[Employee Monthly Trend] Company data:', companyData);
    console.log('[Employee Monthly Trend] Competitor data:', competitorData);

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
    const canvas = document.getElementById('psChartUPAvsPrivate');
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
    const canvas = document.getElementById('psChartCasesByPS');
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
    const canvas = document.getElementById('psChartCasesByProduct');
    if (!canvas) return;

    // Get dual-row aware case sets
    const { companyCases, competitorCases, hasCompanyFilters, hasCompetitorFilters } = getDualRowCaseSets(cases, caseProductsMap);

    // Use filtered cases if dual-row filters are active
    let filteredCases = cases;
    if (hasCompanyFilters || hasCompetitorFilters) {
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
    const canvas = document.getElementById('psChartUnitsMarketShare');
    if (!canvas) return;

    // Get dual-row aware case sets
    const { companyCases, competitorCases, hasCompanyFilters, hasCompetitorFilters } = getDualRowCaseSets(cases, caseProductsMap);

    // Calculate market share based on dual-row filters
    let labels, data;
    if (hasCompanyFilters && hasCompetitorFilters) {
        const companyUnits = companyCases.reduce((sum, c) => sum + (c.total_company_units || 0), 0);
        const competitorUnits = competitorCases.reduce((sum, c) => sum + (c.total_competitor_units || 0), 0);
        labels = ['Company', 'Competitor'];
        data = [companyUnits, competitorUnits];
    } else if (hasCompanyFilters) {
        const companyUnits = companyCases.reduce((sum, c) => sum + (c.total_company_units || 0), 0);
        labels = ['Company'];
        data = [companyUnits];
    } else if (hasCompetitorFilters) {
        const competitorUnits = competitorCases.reduce((sum, c) => sum + (c.total_competitor_units || 0), 0);
        labels = ['Competitor'];
        data = [competitorUnits];
    } else {
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
    const canvas = document.getElementById('psChartUnitsPerCategory');
    if (!canvas) return;

    // Get dual-row filter values to filter products
    const companyCompany = document.getElementById('ps-dashboard-filter-company-company')?.value || '';
    const companyCategory = document.getElementById('ps-dashboard-filter-company-category')?.value || '';
    const companySubCategory = document.getElementById('ps-dashboard-filter-company-sub-category')?.value || '';
    const companyProduct = document.getElementById('ps-dashboard-filter-company-product')?.value || '';

    const competitorCompany = document.getElementById('ps-dashboard-filter-competitor-company')?.value || '';
    const competitorCategory = document.getElementById('ps-dashboard-filter-competitor-category')?.value || '';
    const competitorSubCategory = document.getElementById('ps-dashboard-filter-competitor-sub-category')?.value || '';
    const competitorProduct = document.getElementById('ps-dashboard-filter-competitor-product')?.value || '';

    const hasCompanyFilters = companyCompany || companyCategory || companySubCategory || companyProduct;
    const hasCompetitorFilters = competitorCompany || competitorCategory || competitorSubCategory || competitorProduct;

    // Filter products based on dual-row selections
    let filteredProducts = caseProducts;
    if (hasCompanyFilters || hasCompetitorFilters) {
        const { companyCases, competitorCases } = getDualRowCaseSets(cases, caseProductsMap);
        const validCaseIds = new Set([...companyCases.map(c => c.id), ...competitorCases.map(c => c.id)]);
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
    const canvas = document.getElementById('psChartUnitsPerCompany');
    if (!canvas) return;

    // Get dual-row aware case sets
    const { companyCases, competitorCases, hasCompanyFilters, hasCompetitorFilters } = getDualRowCaseSets(cases, caseProductsMap);

    // Use filtered cases if dual-row filters are active
    let filteredCases = cases;
    if (hasCompanyFilters || hasCompetitorFilters) {
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
    const canvas = document.getElementById('psChartMonthlyUnitsTrend');
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
    const canvas = document.getElementById('psChartUnitsPerPS');
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
    const canvas = document.getElementById('psChartUnitsPerProduct');
    if (!canvas) return;

    // Get dual-row filter values to filter products
    const companyCompany = document.getElementById('ps-dashboard-filter-company-company')?.value || '';
    const companyCategory = document.getElementById('ps-dashboard-filter-company-category')?.value || '';
    const companySubCategory = document.getElementById('ps-dashboard-filter-company-sub-category')?.value || '';
    const companyProduct = document.getElementById('ps-dashboard-filter-company-product')?.value || '';

    const competitorCompany = document.getElementById('ps-dashboard-filter-competitor-company')?.value || '';
    const competitorCategory = document.getElementById('ps-dashboard-filter-competitor-category')?.value || '';
    const competitorSubCategory = document.getElementById('ps-dashboard-filter-competitor-sub-category')?.value || '';
    const competitorProduct = document.getElementById('ps-dashboard-filter-competitor-product')?.value || '';

    const hasCompanyFilters = companyCompany || companyCategory || companySubCategory || companyProduct;
    const hasCompetitorFilters = competitorCompany || competitorCategory || competitorSubCategory || competitorProduct;

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

async function notifyManagerUsers(entityType, entityId, entityName) {
    try {
        // Get the employee's direct manager and line manager IDs
        const directManagerId = state.session.employee?.directManagerId;
        const lineManagerId = state.session.employee?.lineManagerId;

        // Collect unique manager IDs (could be same person or different)
        const managerIds = new Set();
        if (directManagerId) managerIds.add(directManagerId);
        if (lineManagerId) managerIds.add(lineManagerId);

        if (managerIds.size === 0) {
            console.warn('No manager assigned to this employee');
            return;
        }

        // Get user IDs for these manager employees
        const { data: managerUsers, error } = await supabase
            .from('users')
            .select('id, username, employee_id')
            .eq('role', 'manager')
            .in('employee_id', Array.from(managerIds));

        if (error || !managerUsers || managerUsers.length === 0) {
            console.warn('No manager users found to notify');
            return;
        }

        const entityLabel = entityType.charAt(0).toUpperCase() + entityType.slice(1);
        const message = `New ${entityLabel} "${entityName}" pending your approval`;

        for (const manager of managerUsers) {
            await createNotification({
                userId: manager.id,
                entityType,
                entityId,
                message
            });
        }
    } catch (error) {
        console.error('Error notifying manager users:', error);
    }
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
async function loadProducts() {
    const employeeLineId = state.session.employee?.lineId;

    const data = await handleSupabase(
        supabase
            .from('products')
            .select('id, name, category, sub_category, company_id, line_id, is_company_product, company:company_id(name), line:line_id(name)')
            .eq('line_id', employeeLineId)
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

async function loadDoctors() {
    const employeeId = state.session.employeeId;
    const data = await handleSupabase(
        supabase
            .from('v_doctor_details')
            .select('*')
            .or(
                `owner_employee_id.eq.${employeeId},secondary_employee_id.eq.${employeeId},tertiary_employee_id.eq.${employeeId},quaternary_employee_id.eq.${employeeId},quinary_employee_id.eq.${employeeId}`
            )
            .neq('status', APPROVAL_STATUS.REJECTED)
            .order('created_at', { ascending: false }),
        'load my doctors'
    );

    state.doctors = (data || []).map((doctor) => ({
        ...doctor,
        line_name: doctor.line_name || state.session.employee?.lineName || ''
    }));
    refreshCaseFormOptions();
}

async function loadAccounts() {
    const employeeId = state.session.employeeId;
    const data = await handleSupabase(
        supabase
            .from('v_account_details')
            .select('*')
            .or(
                `owner_employee_id.eq.${employeeId},secondary_employee_id.eq.${employeeId},tertiary_employee_id.eq.${employeeId}`
            )
            .neq('status', APPROVAL_STATUS.REJECTED)
            .order('created_at', { ascending: false }),
        'load my accounts'
    );

    state.accounts = (data || []).map((account) => ({
        ...account,
        line_name: account.line_name || state.session.employee?.lineName || ''
    }));
    refreshCaseFormOptions();
}

async function loadCases() {
    const [cases, products] = await Promise.all([
        handleSupabase(
            supabase
                .from('v_case_details')
                .select('*')
                .eq('submitted_by_id', state.session.employeeId)
                .neq('status', APPROVAL_STATUS.REJECTED)
                .order('case_date', { ascending: false }),
            'load my cases'
        ),
        handleSupabase(
            supabase
                .from('case_products')
                .select('case_id, product_id, product_name, company_name, category, sub_category, is_company_product, units, sequence'),
            'load my case products'
        )
    ]);

    state.cases = cases || [];
    state.caseProducts = products || [];
    state.caseProductsByCase = groupCaseProducts(state.caseProducts);
}

function buildApprovalDataset() {
    state.approvals = [
        // Only show doctors that are NOT approved (pending or rejected)
        ...state.doctors
            .filter((doctor) => doctor.status !== APPROVAL_STATUS.APPROVED)
            .map((doctor) => ({
                id: doctor.id,
                type: 'doctor',
                name: doctor.name,
                status: doctor.status,
                created_at: doctor.created_at
            })),
        // Only show accounts that are NOT approved (pending or rejected)
        ...state.accounts
            .filter((account) => account.status !== APPROVAL_STATUS.APPROVED)
            .map((account) => ({
                id: account.id,
                type: 'account',
                name: account.name,
                status: account.status,
                created_at: account.created_at
            })),
        // Only show cases that are NOT approved (pending or rejected)
        ...state.cases
            .filter((caseItem) => caseItem.status !== APPROVAL_STATUS.APPROVED)
            .map((caseItem) => ({
                id: caseItem.id,
                type: 'case',
                name: caseItem.case_code,
                status: caseItem.status,
                created_at: caseItem.created_at
            }))
    ];
}
function renderProductsSection(options = {}) {
    const { refreshFilters = false } = options;
    if (refreshFilters) {
        renderProductFilters();
    }
    const filtered = getFilteredProducts();
    renderProductsTable(filtered);
    renderProductStats(filtered);
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

function renderProductFilters() {
    const container = document.getElementById('my-product-filters');
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
            <select class="form-select form-select-sm" id="employee-filter-product-company" aria-label="Filter products by company">
                <option value="">All Companies</option>
                ${companies
                    .map(
                        (value) =>
                            `<option value="${value}"${value === selectedCompany ? ' selected' : ''}>${value}</option>`
                    )
                    .join('')}
            </select>
            <select class="form-select form-select-sm" id="employee-filter-product-category" aria-label="Filter products by category">
                <option value="">All Categories</option>
                ${categories
                    .map(
                        (value) =>
                            `<option value="${value}"${value === selectedCategory ? ' selected' : ''}>${value}</option>`
                    )
                    .join('')}
            </select>
            <select class="form-select form-select-sm" id="employee-filter-product-type" aria-label="Filter products by type">
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

    container.querySelector('#employee-filter-product-company')?.addEventListener('change', (event) => {
        state.filters.products.company = event.target.value;
        renderProductsSection();
    });
    container.querySelector('#employee-filter-product-category')?.addEventListener('change', (event) => {
        state.filters.products.category = event.target.value;
        renderProductsSection();
    });
    container.querySelector('#employee-filter-product-type')?.addEventListener('change', (event) => {
        state.filters.products.type = event.target.value;
        renderProductsSection();
    });
}

function renderProductsTable(products) {
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

    state.tables.products = createTable('my-products-table', columns, tableData, {
        height: 420
    });
}

function renderProductStats(products) {
    const container = document.getElementById('my-products-stats');
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
function setupDoctorForm() {
    const container = document.querySelector('#ps-doctor-form .row');
    if (!container) return;
    container.innerHTML = `
        <div class="col-12">
            <div id="ps-doctor-feedback" class="alert-feedback d-none"></div>
        </div>
        <div class="col-12">
            <label class="form-label">Doctor Name</label>
            <input type="text" class="form-control" name="name" dir="auto" required>
        </div>
        <div class="col-12">
            <label class="form-label">Line</label>
            <input type="text" class="form-control" name="line_name" value="${state.session.employee?.lineName || ''}" list="lines-list">
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
            <button type="button" class="btn btn-outline-ghost" id="ps-doctor-reset">Reset</button>
            <button type="submit" class="btn btn-gradient">Submit</button>
        </div>
    `;

    const form = document.getElementById('ps-doctor-form');
    const feedback = document.getElementById('ps-doctor-feedback');

    // Add English-only validation to all text inputs
    addEnglishOnlyValidation(form);

    const resetDoctorForm = () => {
        form.reset();
        hideAlert(feedback);
    };
    form.addEventListener('submit', handleDoctorSubmit);
    form.addEventListener('mts:form-open', (event) => {
        const mode = event.detail?.mode || 'create';
        if (mode === 'create') {
            resetDoctorForm();
        } else {
            hideAlert(feedback);
        }
    });
    form.addEventListener('mts:form-close', () => hideAlert(feedback));
    form.querySelector('#ps-doctor-reset').addEventListener('click', resetDoctorForm);
}

async function handleDoctorSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = document.getElementById('ps-doctor-feedback');
    hideAlert(feedback);
    const submitButton = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    if (!payload.name) {
        showAlert(feedback, 'Doctor name is required.');
        return;
    }

    // Validate English-only input
    if (!validateFormEnglishOnly(form)) {
        showAlert(feedback, 'Only English characters are allowed in all fields.');
        return;
    }

    try {
        setLoadingState(submitButton, true, 'Submitting...');
        const lineId = payload.line_name ? await ensureLineForSpecialist(payload.line_name.trim()) : state.session.employee?.lineId;
        const inserted = await handleSupabase(
            supabase
                .from('doctors')
                .insert({
                    name: payload.name.trim(),
                    owner_employee_id: state.session.employeeId,
                    line_id: lineId,
                    specialty: payload.specialty || null,
                    phone: payload.phone || null,
                    email_address: payload.email_address || null,
                    status: APPROVAL_STATUS.PENDING_MANAGER,
                    created_by: state.session.employeeId
                })
                .select('id')
                .single(),
            'submit doctor'
        );

        await notifyManagerUsers('doctor', inserted.id, payload.name.trim());
        await loadDoctors();
        buildApprovalDataset();
        renderDoctorSection({ refreshFilters: true });
        renderApprovalsTable();
        form.reset();
        showAlert(feedback, 'Doctor submitted for approval.', 'success');
        closeFormModal();
    } catch (error) {
        showAlert(feedback, handleError(error));
    } finally {
        setLoadingState(submitButton, false, 'Submit');
    }
}

async function ensureLineForSpecialist(name) {
    const trimmed = name.trim();
    if (!trimmed) return state.session.employee?.lineId || null;
    const { data, error } = await supabase
        .from('lines')
        .select('id, name')
        .ilike('name', trimmed)
        .maybeSingle();
    if (!error && data) {
        return data.id;
    }
    const inserted = await handleSupabase(
        supabase
            .from('lines')
            .insert({ name: trimmed, created_by: state.session.employeeId })
            .select('id')
            .single(),
        'create line'
    );
    return inserted.id;
}

function renderDoctorSection(options = {}) {
    // No filters needed for employee view - show all their doctors
    renderDoctorTable(state.doctors);
    renderDoctorStats(state.doctors);
}

function renderDoctorTable(doctors = state.doctors) {
    const tableData = doctors.map((doctor) => ({
        id: doctor.id,
        name: doctor.name,
        specialist: doctor.owner_name || 'Unknown',
        line: doctor.line_name || state.session.employee?.lineName,
        specialist2: doctor.secondary_owner_name || '',
        line2: doctor.secondary_line_name || '',
        specialist3: doctor.tertiary_owner_name || '',
        line3: doctor.tertiary_line_name || '',
        specialist4: doctor.quaternary_owner_name || '',
        line4: doctor.quaternary_line_name || '',
        specialist5: doctor.quinary_owner_name || '',
        line5: doctor.quinary_line_name || '',
        specialty: doctor.specialty,
        phone: doctor.phone,
        email_address: doctor.email_address,
        status: doctor.status,
        created_at: doctor.created_at
    }));

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
        { title: 'Created', field: 'created_at', formatter: tableFormatters.date, width: 140 }
    ];

    state.tables.doctors = createTable('ps-doctor-table', columns, tableData, { height: 420 });
    attachProductSpecialistToggle(state.tables.doctors, {
        lineField: 'line',
        toggleFields: ['specialist2', 'line2', 'specialist3', 'line3', 'specialist4', 'line4', 'specialist5', 'line5'],
        storageKey: 'employee_doctors_ps_toggle'
    });
}

function renderDoctorStats(doctors = state.doctors) {
    const container = document.getElementById('ps-doctor-stats');
    if (!container) return;
    const approvedDoctors = doctors.filter((doctor) => doctor.status === APPROVAL_STATUS.APPROVED);
    const approved = approvedDoctors.length;
    const pending = doctors.filter(
        (doctor) => doctor.status === APPROVAL_STATUS.PENDING_MANAGER || doctor.status === APPROVAL_STATUS.PENDING_ADMIN
    ).length;
    const specialists = approvedDoctors.length
        ? distinct(
              approvedDoctors
                  .flatMap((doctor) => [
                      doctor.owner_employee_id,
                      doctor.secondary_employee_id,
                      doctor.tertiary_employee_id
                  ])
                  .filter(Boolean)
                  .map((id) => String(id))
          ).length
        : 0;

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
function setupAccountForm() {
    const container = document.querySelector('#ps-account-form .row');
    if (!container) return;
    container.innerHTML = `
        <div class="col-12">
            <div id="ps-account-feedback" class="alert-feedback d-none"></div>
        </div>
        <div class="col-12">
            <label class="form-label">Account Name</label>
            <input type="text" class="form-control" name="name" dir="auto" required>
        </div>
        <div class="col-12">
            <label class="form-label">Account Type</label>
            <select class="form-select" name="account_type" required>
                ${ACCOUNT_TYPES.map((type) => `<option value="${type}">${type}</option>`).join('')}
            </select>
        </div>
        <div class="col-12">
            <label class="form-label">Line</label>
            <input type="text" class="form-control" name="line_name" value="${state.session.employee?.lineName || ''}" list="lines-list">
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
            <button type="button" class="btn btn-outline-ghost" id="ps-account-reset">Reset</button>
            <button type="submit" class="btn btn-gradient">Submit</button>
        </div>
    `;

    const form = document.getElementById('ps-account-form');
    const feedback = document.getElementById('ps-account-feedback');

    // Add English-only validation to all text inputs
    addEnglishOnlyValidation(form);

    const resetAccountForm = () => {
        form.reset();
        hideAlert(feedback);
    };
    form.addEventListener('submit', handleAccountSubmit);
    form.addEventListener('mts:form-open', (event) => {
        const mode = event.detail?.mode || 'create';
        if (mode === 'create') {
            resetAccountForm();
        } else {
            hideAlert(feedback);
        }
    });
    form.addEventListener('mts:form-close', () => hideAlert(feedback));
    form.querySelector('#ps-account-reset').addEventListener('click', resetAccountForm);
}

async function handleAccountSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = document.getElementById('ps-account-feedback');
    hideAlert(feedback);
    const submitButton = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    if (!payload.name || !payload.account_type) {
        showAlert(feedback, 'Account name and type are required.');
        return;
    }

    // Validate English-only input
    if (!validateFormEnglishOnly(form)) {
        showAlert(feedback, 'Only English characters are allowed in all fields.');
        return;
    }

    try{
        setLoadingState(submitButton, true, 'Submitting...');
        const lineId = payload.line_name ? await ensureLineForSpecialist(payload.line_name.trim()) : state.session.employee?.lineId;
        const inserted = await handleSupabase(
            supabase
                .from('accounts')
                .insert({
                    name: payload.name.trim(),
                    owner_employee_id: state.session.employeeId,
                    account_type: payload.account_type,
                    line_id: lineId,
                    address: payload.address || null,
                    governorate: payload.governorate || null,
                    status: APPROVAL_STATUS.PENDING_MANAGER,
                    created_by: state.session.employeeId
                })
                .select('id')
                .single(),
            'submit account'
        );

        await notifyManagerUsers('account', inserted.id, payload.name.trim());
        await loadAccounts();
        buildApprovalDataset();
        renderAccountSection({ refreshFilters: true });
        renderApprovalsTable();
        form.reset();
        showAlert(feedback, 'Account submitted for approval.', 'success');
        closeFormModal();
    } catch (error) {
        showAlert(feedback, handleError(error));
    } finally {
        setLoadingState(submitButton, false, 'Submit');
    }
}

function renderAccountSection(options = {}) {
    // No filters needed for employee view - show all their accounts
    renderAccountTable(state.accounts);
    renderAccountStats(state.accounts);
}

function renderAccountTable(accounts = state.accounts) {
    const tableData = accounts.map((account) => ({
        id: account.id,
        name: account.name,
        specialist: account.owner_name || 'Unknown',
        line: account.line_name || state.session.employee?.lineName,
        specialist2: account.secondary_owner_name || '',
        line2: account.secondary_line_name || '',
        specialist3: account.tertiary_owner_name || '',
        line3: account.tertiary_line_name || '',
        account_type: account.account_type,
        governorate: account.governorate,
        status: account.status,
        created_at: account.created_at
    }));

    const columns = [
        { title: 'Account', field: 'name', minWidth: 200, headerFilter: 'input' },
        { title: 'Product Specialist', field: 'specialist', minWidth: 200, headerFilter: 'input' },
        { title: 'Line', field: 'line', width: 140, headerFilter: 'input' },
        { title: 'Product Specialist 2', field: 'specialist2', minWidth: 200, headerFilter: 'input', visible: false },
        { title: 'PS 2 Line', field: 'line2', width: 140, headerFilter: 'input', visible: false },
        { title: 'Product Specialist 3', field: 'specialist3', minWidth: 200, headerFilter: 'input', visible: false },
        { title: 'PS 3 Line', field: 'line3', width: 140, headerFilter: 'input', visible: false },
        { title: 'Type', field: 'account_type', width: 130 },
        { title: 'Governorate', field: 'governorate', width: 160, headerFilter: 'input' },
        { title: 'Status', field: 'status', formatter: tableFormatters.status, width: 140 },
        { title: 'Created', field: 'created_at', formatter: tableFormatters.date, width: 140 }
    ];

    state.tables.accounts = createTable('ps-account-table', columns, tableData, { height: 420 });
    attachProductSpecialistToggle(state.tables.accounts, {
        lineField: 'line',
        toggleFields: ['specialist2', 'line2', 'specialist3', 'line3'],
        storageKey: 'employee_accounts_ps_toggle'
    });
}

function renderAccountStats(accounts = state.accounts) {
    const container = document.getElementById('ps-account-stats');
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

function setupDatalistToHidden(inputId, hiddenId, dataArray) {
    const input = document.getElementById(inputId);
    const hidden = document.getElementById(hiddenId);

    if (!input || !hidden) return;

    input.addEventListener('input', (e) => {
        const selectedName = e.target.value.trim();
        hidden.value = ''; // Clear hidden field

        if (selectedName) {
            // Find matching item by name
            const matchedItem = dataArray.find(item => item.name === selectedName);
            if (matchedItem) {
                hidden.value = matchedItem.id;
            }
        }
    });

    // Clear both fields when input is cleared
    input.addEventListener('blur', () => {
        if (!input.value.trim()) {
            hidden.value = '';
        }
    });
}

function setupCaseForm() {
    const container = document.querySelector('#ps-case-form .row');
    if (!container) return;
    const approvedDoctors = state.doctors.filter((doctor) => doctor.status === APPROVAL_STATUS.APPROVED);
    const approvedAccounts = state.accounts.filter((account) => account.status === APPROVAL_STATUS.APPROVED);
    const doctorOptions = approvedDoctors.map((doctor) => `<option value="${doctor.id}">${doctor.name}</option>`).join('');
    const accountOptions = approvedAccounts.map((account) => `<option value="${account.id}">${account.name}</option>`).join('');

    container.innerHTML = `
        <div class="col-12">
            <div id="ps-case-feedback" class="alert-feedback d-none"></div>
        </div>
        <div class="col-12">
            <label class="form-label">Doctor</label>
            <input type="text" class="form-control" name="doctor_name" id="case-doctor-input" list="doctors-list" placeholder="Search and select doctor..." autocomplete="off" required>
            <datalist id="doctors-list">
                ${approvedDoctors.map(doctor => `<option value="${doctor.name}"></option>`).join('')}
            </datalist>
            <input type="hidden" name="doctor_id" id="case-doctor-id">
        </div>
        <div class="col-12">
            <label class="form-label">Account</label>
            <input type="text" class="form-control" name="account_name" id="case-account-input" list="accounts-list" placeholder="Search and select account..." autocomplete="off" required>
            <datalist id="accounts-list">
                ${approvedAccounts.map(account => `<option value="${account.name}"></option>`).join('')}
            </datalist>
            <input type="hidden" name="account_id" id="case-account-id">
        </div>
        <div class="col-12">
            <label class="form-label">Case Date</label>
            <input type="date" class="form-control" name="case_date" required>
        </div>
        <div class="col-12">
            <label class="form-label">Products Used</label>
            <div id="case-products-container" class="d-grid gap-3"></div>
            <div class="d-flex justify-content-between mt-2">
                <button type="button" class="btn btn-outline-ghost" id="add-case-product">Add Product</button>
                <button type="button" class="btn btn-outline-ghost" id="remove-case-product">Remove Product</button>
            </div>
        </div>
        <div class="col-12">
            <label class="form-label">Comments</label>
            <textarea class="form-control" name="notes" rows="2"></textarea>
        </div>
        <div class="col-12 d-flex justify-content-end gap-2">
            <button type="button" class="btn btn-outline-ghost" id="ps-case-reset">Reset</button>
            <button type="submit" class="btn btn-gradient">Submit Case</button>
        </div>
    `;

    const form = document.getElementById('ps-case-form');
    const feedback = document.getElementById('ps-case-feedback');

    // Add English-only validation to all text inputs (including comments field)
    addEnglishOnlyValidation(form);

    const resetCaseForm = () => {
        form.reset();
        state.caseFormRows = 1;
        renderCaseProductRows();
        hideAlert(feedback);
    };
    form.addEventListener('submit', handleCaseSubmit);
    form.addEventListener('mts:form-open', () => resetCaseForm());
    form.addEventListener('mts:form-close', () => hideAlert(feedback));
    form.querySelector('#ps-case-reset').addEventListener('click', resetCaseForm);

    form.querySelector('#add-case-product').addEventListener('click', () => {
        if (state.caseFormRows < MAX_PRODUCTS_PER_CASE) {
            state.caseFormRows += 1;
            renderCaseProductRows();
        }
    });

    form.querySelector('#remove-case-product').addEventListener('click', () => {
        if (state.caseFormRows > 1) {
            state.caseFormRows -= 1;
            renderCaseProductRows();
        }
    });

    // Setup datalist inputs to populate hidden ID fields
    setupDatalistToHidden('case-doctor-input', 'case-doctor-id', approvedDoctors);
    setupDatalistToHidden('case-account-input', 'case-account-id', approvedAccounts);

    renderCaseProductRows();
}

function renderCaseProductRows() {
    const container = document.getElementById('case-products-container');
    if (!container) return;
    const preserved = new Map();
    container.querySelectorAll('[data-product-row]').forEach((select) => {
        const row = Number(select.dataset.productRow);
        const productSelect = container.querySelector(`[data-product-select="${row}"]`);
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
                <select class="form-select" name="product_company_${index}" data-product-row="${index}">
                    <option value="">Select company</option>
                    ${companies.map((company) => `<option value="${company}">${company}</option>`).join('')}
                </select>
            </div>
            <div class="col-md-4">
                <label class="form-label">Product</label>
                <select class="form-select" name="product_id_${index}" data-product-select="${index}">
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
            populateProductOptions(index, saved.company, saved.product);
        } else {
            populateProductOptions(index, '', undefined);
        }
        if (unitsField) {
            unitsField.value = saved.units ?? '0';
        }
    }

    container.querySelectorAll('[data-product-row]').forEach((select) => {
        select.addEventListener('change', (event) => {
            const row = Number(event.target.dataset.productRow);
            populateProductOptions(row, event.target.value);
        });
    });
}

function populateProductOptions(rowIndex, companyName, selectedProductId) {
    const productSelect = document.querySelector(`[data-product-select="${rowIndex}"]`);
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

async function handleCaseSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = document.getElementById('ps-case-feedback');
    hideAlert(feedback);
    const submitButton = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    if (!payload.doctor_id || !payload.account_id || !payload.case_date) {
        showAlert(feedback, 'Doctor, account, and date are required.');
        return;
    }

    // Validate English-only input (especially comments field)
    if (!validateFormEnglishOnly(form)) {
        showAlert(feedback, 'Only English characters are allowed in all fields including comments.');
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
            status: APPROVAL_STATUS.PENDING_MANAGER,
            created_at: new Date().toISOString()
        };

        const inserted = await handleSupabase(
            supabase
                .from('cases')
                .insert(caseRecord)
                .select('id')
                .single(),
            'submit case'
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
            'insert case products'
        );

        await notifyManagerUsers('case', caseId, caseRecord.case_code);
        await loadCases();
        buildApprovalDataset();
        renderCasesSection();
        renderApprovalsTable();
        setupDashboardFilters();
        renderDashboard();
        form.reset();
        state.caseFormRows = 1;
        renderCaseProductRows();
        showAlert(feedback, 'Case submitted for approval.', 'success');
        closeFormModal();
    } catch (error) {
        showAlert(feedback, handleError(error));
    } finally {
        setLoadingState(submitButton, false, 'Submit Case');
    }
}

function ensureLineDatalist() {
    let element = document.getElementById('lines-list');
    if (!element) {
        element = document.createElement('datalist');
        element.id = 'lines-list';
        document.body.appendChild(element);
    }
    element.innerHTML = distinct(state.products.map((product) => product.line_name))
        .filter(Boolean)
        .map((line) => `<option value="${line}"></option>`)
        .join('');
}


function refreshCaseFormOptions() {
    const doctorsList = document.getElementById('doctors-list');
    if (doctorsList) {
        const approvedDoctors = state.doctors.filter((doctor) => doctor.status === APPROVAL_STATUS.APPROVED);
        const options = approvedDoctors.map((doctor) => `<option value="${doctor.name}"></option>`).join('');
        doctorsList.innerHTML = options;
    }
    const accountsList = document.getElementById('accounts-list');
    if (accountsList) {
        const approvedAccounts = state.accounts.filter((account) => account.status === APPROVAL_STATUS.APPROVED);
        const options = approvedAccounts.map((account) => `<option value="${account.name}"></option>`).join('');
        accountsList.innerHTML = options;
    }
}




function setupModals() { /* handled in setupSidebar for employee */ }

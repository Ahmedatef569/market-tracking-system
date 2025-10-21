import { distinct } from './utils.js';

/**
 * Setup cascading filter logic for company → category → subcategory → product
 * @param {Object} params - Configuration object
 * @param {HTMLElement} params.companySelect - Company select element
 * @param {HTMLElement} params.categorySelect - Category select element
 * @param {HTMLElement} params.subCategorySelect - SubCategory select element
 * @param {HTMLElement} params.productSelect - Product select element
 * @param {Array} params.caseProducts - Array of all case products
 * @param {Object} params.filterOptions - Object with all filter options {categories, subCategories, products}
 * @param {Function} params.onChange - Callback function to call when filters change
 */
export function setupCascadingFilters({ companySelect, categorySelect, subCategorySelect, productSelect, caseProducts, filterOptions, onChange }) {
    const updateCategoryOptions = () => {
        const selectedCompany = companySelect.value;
        const allCategories = filterOptions.categories;

        if (!selectedCompany) {
            categorySelect.innerHTML = '<option value="">All Categories</option>' +
                allCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
        } else {
            const filteredCategories = [...new Set(
                caseProducts
                    .filter(p => (p.company_name || '') === selectedCompany)
                    .map(p => p.category)
                    .filter(Boolean)
            )].sort();
            categorySelect.innerHTML = '<option value="">All Categories</option>' +
                filteredCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
        }
        categorySelect.value = '';
        updateSubCategoryOptions();
    };

    const updateSubCategoryOptions = () => {
        const selectedCompany = companySelect.value;
        const selectedCategory = categorySelect.value;
        const allSubCategories = filterOptions.subCategories;

        if (!selectedCompany && !selectedCategory) {
            subCategorySelect.innerHTML = '<option value="">All Sub Categories</option>' +
                allSubCategories.map(sub => `<option value="${sub}">${sub}</option>`).join('');
        } else {
            const filteredSubCategories = [...new Set(
                caseProducts
                    .filter(p => {
                        if (selectedCompany && (p.company_name || '') !== selectedCompany) return false;
                        if (selectedCategory && (p.category || '') !== selectedCategory) return false;
                        return true;
                    })
                    .map(p => p.sub_category)
                    .filter(Boolean)
            )].sort();
            subCategorySelect.innerHTML = '<option value="">All Sub Categories</option>' +
                filteredSubCategories.map(sub => `<option value="${sub}">${sub}</option>`).join('');
        }
        subCategorySelect.value = '';
        updateProductOptions();
    };

    const updateProductOptions = () => {
        const selectedCompany = companySelect.value;
        const selectedCategory = categorySelect.value;
        const selectedSubCategory = subCategorySelect.value;
        const allProducts = filterOptions.products;

        if (!selectedCompany && !selectedCategory && !selectedSubCategory) {
            productSelect.innerHTML = '<option value="">All Products</option>' +
                allProducts.map(p => `<option value="${p.value}">${p.label}</option>`).join('');
        } else {
            const filteredProducts = [...new Set(
                caseProducts
                    .filter(p => {
                        if (selectedCompany && (p.company_name || '') !== selectedCompany) return false;
                        if (selectedCategory && (p.category || '') !== selectedCategory) return false;
                        if (selectedSubCategory && (p.sub_category || '') !== selectedSubCategory) return false;
                        return true;
                    })
                    .map(p => ({
                        value: p.product_id ? String(p.product_id) : p.product_name,
                        label: p.product_name || 'Unknown'
                    }))
            )].sort((a, b) => a.label.localeCompare(b.label));
            productSelect.innerHTML = '<option value="">All Products</option>' +
                filteredProducts.map(p => `<option value="${p.value}">${p.label}</option>`).join('');
        }
        productSelect.value = '';
    };

    companySelect.addEventListener('change', () => {
        updateCategoryOptions();
        if (onChange) onChange();
    });
    categorySelect.addEventListener('change', () => {
        updateSubCategoryOptions();
        if (onChange) onChange();
    });
    subCategorySelect.addEventListener('change', () => {
        updateProductOptions();
        if (onChange) onChange();
    });
    productSelect.addEventListener('change', () => {
        if (onChange) onChange();
    });
}

export function groupCaseProducts(caseProducts = []) {
    const map = new Map();
    caseProducts.forEach((item) => {
        if (!item?.case_id) return;
        const bucket = map.get(item.case_id) || [];
        bucket.push(item);
        map.set(item.case_id, bucket);
    });
    map.forEach((list, key, source) => {
        list.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
        source.set(key, list);
    });
    return map;
}

export function mapCaseProductColumns(caseProductsMap, caseId, limit = 3) {
    const products = [...(caseProductsMap.get(caseId) || [])].slice(0, limit);
    const filler = { name: '', type: '', company: '', category: '', sub_category: '', units: 0 };
    const padded = [...products, filler, filler, filler].slice(0, limit);
    return padded.map((product) => {
        if (!product?.product_name) return { ...filler };
        return {
            name: product.product_name || '',
            type: product.is_company_product ? 'Company' : 'Competitor',
            company: product.company_name || (product.is_company_product ? 'Company' : 'Competitor'),
            category: product.category || '',
            sub_category: product.sub_category || '',
            units: product.units || 0
        };
    });
}

export function buildCaseTableRow(caseItem, caseProductsMap) {
    const [product1, product2, product3] = mapCaseProductColumns(caseProductsMap, caseItem.id);
    return {
        id: caseItem.id,
        specialist: caseItem.submitted_by_name,
        status: caseItem.status,
        account: caseItem.account_name,
        account_type: caseItem.account_type,
        doctor: caseItem.doctor_name,
        case_date: caseItem.case_date,
        case_code: caseItem.case_code,
        company_units: caseItem.total_company_units || 0,
        competitor_units: caseItem.total_competitor_units || 0,
        product1_name: product1.name,
        product1_type: product1.type,
        product1_company: product1.company,
        product1_category: product1.category,
        product1_sub_category: product1.sub_category,
        product1_units: product1.units,
        product2_name: product2.name,
        product2_type: product2.type,
        product2_company: product2.company,
        product2_category: product2.category,
        product2_sub_category: product2.sub_category,
        product2_units: product2.units,
        product3_name: product3.name,
        product3_type: product3.type,
        product3_company: product3.company,
        product3_category: product3.category,
        product3_sub_category: product3.sub_category,
        product3_units: product3.units
    };
}

export function computeCaseMetrics(cases = [], caseProductsMap = new Map()) {
    const metrics = {
        companyCaseCount: 0,
        competitorCaseCount: 0,
        mixedCaseCount: 0,
        companyUnits: 0,
        competitorUnits: 0,
        activeDoctors: new Set(),
        activeAccounts: new Set()
    };

    cases.forEach((caseItem) => {
        const products = caseProductsMap.get(caseItem.id) || [];
        const hasCompany = products.some((product) => product.is_company_product);
        const hasCompetitor = products.some((product) => !product.is_company_product);

        if (hasCompany) {
            metrics.companyCaseCount += 1;
            if (caseItem.doctor_name) metrics.activeDoctors.add(caseItem.doctor_name);
            if (caseItem.account_name) metrics.activeAccounts.add(caseItem.account_name);
        }
        if (hasCompetitor) {
            metrics.competitorCaseCount += 1;
        }
        if (hasCompany && hasCompetitor) {
            metrics.mixedCaseCount += 1;
        }

        metrics.companyUnits += caseItem.total_company_units || 0;
        metrics.competitorUnits += caseItem.total_competitor_units || 0;
    });

    const totalCaseCount = Math.max(
        metrics.companyCaseCount + metrics.competitorCaseCount - metrics.mixedCaseCount,
        0
    );

    return {
        companyCaseCount: metrics.companyCaseCount,
        competitorCaseCount: metrics.competitorCaseCount,
        mixedCaseCount: metrics.mixedCaseCount,
        totalCaseCount,
        companyUnits: metrics.companyUnits,
        competitorUnits: metrics.competitorUnits,
        activeDoctors: metrics.activeDoctors.size,
        activeAccounts: metrics.activeAccounts.size
    };
}

/**
 * Compute case metrics with proper company vs competitor comparison
 * CORRECT LOGIC:
 * - When filtering by OUR COMPANY: Company = ALL our company cases, Competitor = ALL competitor cases (excluding mixed)
 * - When filtering by COMPETITOR: Competitor = ALL that competitor's cases, Company = ALL our company cases (excluding mixed)
 * - When filtering by category/subcategory: Apply same logic but only for products in that category/subcategory
 * @param {Array} cases - All cases to consider
 * @param {Map} caseProductsMap - Map of case_id to products array
 * @param {Object} filters - Filter values {company, category, subCategory, product}
 * @returns {Object} Metrics object
 */
export function computeCaseMetricsWithSubcategoryFilter(cases = [], caseProductsMap = new Map(), filters = {}) {
    const { company, category, subCategory, product } = filters;

    // Determine filter criteria
    let filterCompanyName = null;
    let isFilteringByCompanyProduct = null;
    let filterCategory = category ? category.toLowerCase() : null;
    let filterSubCategory = subCategory ? subCategory.toLowerCase() : null;

    // If company filter is applied, determine if it's our company or competitor
    if (company) {
        filterCompanyName = company.toLowerCase();
        // Check if this company is our company or competitor
        for (const products of caseProductsMap.values()) {
            for (const prod of products) {
                if ((prod.company_name || '').toLowerCase() === filterCompanyName) {
                    isFilteringByCompanyProduct = prod.is_company_product;
                    break;
                }
            }
            if (isFilteringByCompanyProduct !== null) break;
        }
    }

    // If product filter is applied, find its company and type
    if (product) {
        for (const products of caseProductsMap.values()) {
            for (const prod of products) {
                const prodKey = prod.product_id ? String(prod.product_id) : prod.product_name;
                if (prodKey === product) {
                    filterCompanyName = (prod.company_name || '').toLowerCase();
                    isFilteringByCompanyProduct = prod.is_company_product;
                    if (!filterCategory && prod.category) filterCategory = prod.category.toLowerCase();
                    if (!filterSubCategory && prod.sub_category) filterSubCategory = prod.sub_category.toLowerCase();
                    break;
                }
            }
            if (filterCompanyName) break;
        }
    }

    const metrics = {
        companyCaseCount: 0,
        competitorCaseCount: 0,
        mixedCaseCount: 0,
        companyUnits: 0,
        competitorUnits: 0,
        activeDoctors: new Set(),
        activeAccounts: new Set()
    };

    cases.forEach((caseItem) => {
        const products = caseProductsMap.get(caseItem.id) || [];

        // Filter products based on category/subcategory if specified
        let relevantProducts = products;
        if (filterCategory || filterSubCategory) {
            relevantProducts = products.filter(prod => {
                if (filterCategory && (prod.category || '').toLowerCase() !== filterCategory) return false;
                if (filterSubCategory && (prod.sub_category || '').toLowerCase() !== filterSubCategory) return false;
                return true;
            });
        }

        // Skip if no relevant products
        if (relevantProducts.length === 0) return;

        const hasCompany = relevantProducts.some((p) => p.is_company_product);
        const hasCompetitor = relevantProducts.some((p) => !p.is_company_product);
        const isMixed = hasCompany && hasCompetitor;

        // NEW CORRECT LOGIC:
        if (filterCompanyName && isFilteringByCompanyProduct !== null) {
            // Filtering by specific company
            if (isFilteringByCompanyProduct) {
                // Filtering by OUR COMPANY:
                // Company Cases = ALL our company cases in system
                // Competitor Cases = ALL competitor cases in system (excluding mixed)
                if (hasCompany) {
                    metrics.companyCaseCount += 1;
                    if (caseItem.doctor_name) metrics.activeDoctors.add(caseItem.doctor_name);
                    if (caseItem.account_name) metrics.activeAccounts.add(caseItem.account_name);
                }
                if (hasCompetitor && !isMixed) {
                    metrics.competitorCaseCount += 1;
                }
                if (isMixed) {
                    metrics.mixedCaseCount += 1;
                }
            } else {
                // Filtering by COMPETITOR COMPANY:
                // Competitor Cases = ALL that competitor's cases
                // Company Cases = ALL our company cases in system (excluding mixed)
                if (hasCompetitor) {
                    metrics.competitorCaseCount += 1;
                }
                if (hasCompany && !isMixed) {
                    metrics.companyCaseCount += 1;
                    if (caseItem.doctor_name) metrics.activeDoctors.add(caseItem.doctor_name);
                    if (caseItem.account_name) metrics.activeAccounts.add(caseItem.account_name);
                }
                if (isMixed) {
                    metrics.mixedCaseCount += 1;
                }
            }
        } else {
            // No company filter - count all cases normally
            if (hasCompany) {
                metrics.companyCaseCount += 1;
                if (caseItem.doctor_name) metrics.activeDoctors.add(caseItem.doctor_name);
                if (caseItem.account_name) metrics.activeAccounts.add(caseItem.account_name);
            }
            if (hasCompetitor) {
                metrics.competitorCaseCount += 1;
            }
            if (isMixed) {
                metrics.mixedCaseCount += 1;
            }
        }

        // Count units - ALL units from relevant products
        relevantProducts.forEach(prod => {
            if (prod.is_company_product) {
                metrics.companyUnits += prod.units || 0;
            } else {
                metrics.competitorUnits += prod.units || 0;
            }
        });
    });

    const totalCaseCount = Math.max(
        metrics.companyCaseCount + metrics.competitorCaseCount - metrics.mixedCaseCount,
        0
    );

    return {
        companyCaseCount: metrics.companyCaseCount,
        competitorCaseCount: metrics.competitorCaseCount,
        mixedCaseCount: metrics.mixedCaseCount,
        totalCaseCount,
        companyUnits: metrics.companyUnits,
        competitorUnits: metrics.competitorUnits,
        activeDoctors: metrics.activeDoctors.size,
        activeAccounts: metrics.activeAccounts.size
    };
}

/**
 * Compute case metrics with dual-row filter logic
 * @param {Array} cases - All cases to consider
 * @param {Map} caseProductsMap - Map of case_id to products array
 * @param {Object} companyFilters - Company row filter values {company, category, subCategory, product}
 * @param {Object} competitorFilters - Competitor row filter values {company, category, subCategory, product}
 * @returns {Object} Metrics object
 */
export function computeDualRowCaseMetrics(cases = [], caseProductsMap = new Map(), companyFilters = {}, competitorFilters = {}) {
    const metrics = {
        companyCaseCount: 0,
        competitorCaseCount: 0,
        mixedCaseCount: 0,
        companyUnits: 0,
        competitorUnits: 0,
        activeDoctors: new Set(),
        activeAccounts: new Set()
    };

    // Check if any filters are applied
    const hasCompanyFilters = companyFilters.company || companyFilters.category || companyFilters.subCategory || companyFilters.product;
    const hasCompetitorFilters = competitorFilters.company || competitorFilters.category || competitorFilters.subCategory || competitorFilters.product;

    cases.forEach((caseItem) => {
        const products = caseProductsMap.get(caseItem.id) || [];

        // Filter products for company row (only company products)
        let companyRowProducts = products.filter(p => p.is_company_product);
        if (hasCompanyFilters) {
            companyRowProducts = companyRowProducts.filter(prod => {
                if (companyFilters.company && prod.company_name !== companyFilters.company) return false;
                if (companyFilters.category && prod.category !== companyFilters.category) return false;
                if (companyFilters.subCategory && prod.sub_category !== companyFilters.subCategory) return false;
                if (companyFilters.product && String(prod.product_id) !== companyFilters.product) return false;
                return true;
            });
        }

        // Filter products for competitor row (only competitor products)
        let competitorRowProducts = products.filter(p => !p.is_company_product);
        if (hasCompetitorFilters) {
            competitorRowProducts = competitorRowProducts.filter(prod => {
                if (competitorFilters.company && prod.company_name !== competitorFilters.company) return false;
                if (competitorFilters.category && prod.category !== competitorFilters.category) return false;
                if (competitorFilters.subCategory && prod.sub_category !== competitorFilters.subCategory) return false;
                if (competitorFilters.product && String(prod.product_id) !== competitorFilters.product) return false;
                return true;
            });
        }

        const hasMatchingCompanyProducts = companyRowProducts.length > 0;
        const hasMatchingCompetitorProducts = competitorRowProducts.length > 0;

        // Company Cases: Cases with matching company row products
        if (hasMatchingCompanyProducts) {
            metrics.companyCaseCount += 1;
            if (caseItem.doctor_name) metrics.activeDoctors.add(caseItem.doctor_name);
            if (caseItem.account_name) metrics.activeAccounts.add(caseItem.account_name);
        }

        // Competitor Cases: Cases with matching competitor row products
        if (hasMatchingCompetitorProducts) {
            metrics.competitorCaseCount += 1;
        }

        // Mixed Cases: Cases with BOTH matching company AND competitor products
        if (hasMatchingCompanyProducts && hasMatchingCompetitorProducts) {
            metrics.mixedCaseCount += 1;
        }

        // Count units from matching products only
        companyRowProducts.forEach(prod => {
            metrics.companyUnits += prod.units || 0;
        });

        competitorRowProducts.forEach(prod => {
            metrics.competitorUnits += prod.units || 0;
        });
    });

    const totalCaseCount = Math.max(
        metrics.companyCaseCount + metrics.competitorCaseCount - metrics.mixedCaseCount,
        0
    );

    return {
        companyCaseCount: metrics.companyCaseCount,
        competitorCaseCount: metrics.competitorCaseCount,
        mixedCaseCount: metrics.mixedCaseCount,
        totalCaseCount,
        companyUnits: metrics.companyUnits,
        competitorUnits: metrics.competitorUnits,
        activeDoctors: metrics.activeDoctors.size,
        activeAccounts: metrics.activeAccounts.size
    };
}

export function buildCaseTableColumns(tableFormatters) {
    return [
        { title: 'Product Specialist', field: 'specialist', minWidth: 200, headerFilter: 'input', frozen: true },
        { title: 'Status', field: 'status', formatter: tableFormatters.status, width: 140 },
        { title: 'Account', field: 'account', minWidth: 180, headerFilter: 'input' },
        { title: 'Account Type', field: 'account_type', width: 140 },
        { title: 'Doctor', field: 'doctor', minWidth: 180, headerFilter: 'input' },
        { title: 'Date', field: 'case_date', formatter: tableFormatters.date, width: 140 },
        { title: 'Case Code', field: 'case_code', width: 150, headerFilter: 'input' },
        { title: 'Product 1', field: 'product1_name', minWidth: 180, headerFilter: 'input' },
        { title: 'P1 Type', field: 'product1_type', width: 130 },
        { title: 'P1 Company', field: 'product1_company', minWidth: 160, headerFilter: 'input' },
        { title: 'P1 Category', field: 'product1_category', minWidth: 160, headerFilter: 'input' },
        { title: 'P1 Sub-category', field: 'product1_sub_category', minWidth: 180, headerFilter: 'input' },
        { title: 'P1 Units', field: 'product1_units', formatter: tableFormatters.number(), width: 140 },
        { title: 'Product 2', field: 'product2_name', minWidth: 180, headerFilter: 'input' },
        { title: 'P2 Type', field: 'product2_type', width: 130 },
        { title: 'P2 Company', field: 'product2_company', minWidth: 160, headerFilter: 'input' },
        { title: 'P2 Category', field: 'product2_category', minWidth: 160, headerFilter: 'input' },
        { title: 'P2 Sub-category', field: 'product2_sub_category', minWidth: 180, headerFilter: 'input' },
        { title: 'P2 Units', field: 'product2_units', formatter: tableFormatters.number(), width: 140 },
        { title: 'Product 3', field: 'product3_name', minWidth: 180, headerFilter: 'input' },
        { title: 'P3 Type', field: 'product3_type', width: 130 },
        { title: 'P3 Company', field: 'product3_company', minWidth: 160, headerFilter: 'input' },
        { title: 'P3 Category', field: 'product3_category', minWidth: 160, headerFilter: 'input' },
        { title: 'P3 Sub-category', field: 'product3_sub_category', minWidth: 180, headerFilter: 'input' },
        { title: 'P3 Units', field: 'product3_units', formatter: tableFormatters.number(), width: 140 },
        { title: 'Company Units', field: 'company_units', formatter: tableFormatters.number(), width: 150, visible: false },
        { title: 'Competitor Units', field: 'competitor_units', formatter: tableFormatters.number(), width: 160, visible: false },
    ];
}

export function buildCaseExportRows(cases = [], caseProductsMap = new Map()) {
    return cases.map((caseItem) => {
        const row = buildCaseTableRow(caseItem, caseProductsMap);
        return {
            case_code: row.case_code,
            case_date: row.case_date,
            specialist: row.specialist,
            status: row.status,
            account: row.account,
            account_type: row.account_type,
            company_units: row.company_units,
            competitor_units: row.competitor_units,
            doctor: row.doctor,
            product1_name: row.product1_name,
            product1_type: row.product1_type,
            product1_company: row.product1_company,
            product1_category: row.product1_category,
            product1_sub_category: row.product1_sub_category,
            product1_units: row.product1_units,
            product2_name: row.product2_name,
            product2_type: row.product2_type,
            product2_company: row.product2_company,
            product2_category: row.product2_category,
            product2_sub_category: row.product2_sub_category,
            product2_units: row.product2_units,
            product3_name: row.product3_name,
            product3_type: row.product3_type,
            product3_company: row.product3_company,
            product3_category: row.product3_category,
            product3_sub_category: row.product3_sub_category,
            product3_units: row.product3_units
        };
    });
}

export const CASE_EXPORT_HEADERS = {
    case_code: 'Case Code',
    case_date: 'Case Date',
    specialist: 'Product Specialist',
    status: 'Status',
    account: 'Account',
    account_type: 'Account Type',
    doctor: 'Doctor',
    product1_name: 'Product 1',
    product1_type: 'P1 Type',
    product1_company: 'P1 Company',
    product1_category: 'P1 Category',
    product1_sub_category: 'P1 Sub-category',
    product1_units: 'P1 Units',
    product2_name: 'Product 2',
    product2_type: 'P2 Type',
    product2_company: 'P2 Company',
    product2_category: 'P2 Category',
    product2_sub_category: 'P2 Sub-category',
    product2_units: 'P2 Units',
    product3_name: 'Product 3',
    product3_type: 'P3 Type',
    product3_company: 'P3 Company',
    product3_category: 'P3 Category',
    product3_sub_category: 'P3 Sub-category',
    product3_units: 'P3 Units',
    company_units: 'Company Units',
    competitor_units: 'Competitor Units'
};

export function collectCaseFilterOptions(caseProducts = [], products = []) {
    const companies = distinct(caseProducts.map((item) => item.company_name).filter(Boolean)).sort((a, b) =>
        a.localeCompare(b)
    );
    const categories = distinct(caseProducts.map((item) => item.category).filter(Boolean)).sort((a, b) =>
        a.localeCompare(b)
    );
    const subCategories = distinct(caseProducts.map((item) => item.sub_category).filter(Boolean)).sort((a, b) =>
        a.localeCompare(b)
    );
    const productOptions = [];
    const seen = new Set();
    caseProducts.forEach((item) => {
        const key = item.product_id ? String(item.product_id) : item.product_name;
        if (!key || seen.has(key)) return;
        seen.add(key);
        productOptions.push({ value: key, label: item.product_name || 'Unknown Product' });
    });
    if (!productOptions.length) {
        products.forEach((product) => {
            const key = String(product.id);
            if (seen.has(key)) return;
            seen.add(key);
            productOptions.push({ value: key, label: product.name });
        });
    }
    return { companies, categories, subCategories, productOptions };
}

export function collectDualRowFilterOptions(caseProducts = [], products = []) {
    // Separate company and competitor data
    const companyCaseProducts = caseProducts.filter(cp => cp.is_company_product);
    const competitorCaseProducts = caseProducts.filter(cp => !cp.is_company_product);

    // Company filter options
    const companyCompanies = distinct(companyCaseProducts.map(item => item.company_name).filter(Boolean)).sort((a, b) => a.localeCompare(b));
    const companyCategories = distinct(companyCaseProducts.map(item => item.category).filter(Boolean)).sort((a, b) => a.localeCompare(b));
    const companySubCategories = distinct(companyCaseProducts.map(item => item.sub_category).filter(Boolean)).sort((a, b) => a.localeCompare(b));

    const companyProductOptions = [];
    const companySeen = new Set();
    companyCaseProducts.forEach((item) => {
        const key = item.product_id ? String(item.product_id) : item.product_name;
        if (!key || companySeen.has(key)) return;
        companySeen.add(key);
        companyProductOptions.push({ value: key, label: item.product_name || 'Unknown Product' });
    });

    // Add products not in case products but are company products
    products.filter(p => p.is_company_product).forEach((product) => {
        const key = String(product.id);
        if (companySeen.has(key)) return;
        companySeen.add(key);
        companyProductOptions.push({ value: key, label: product.name });
    });

    // Competitor filter options
    const competitorCompanies = distinct(competitorCaseProducts.map(item => item.company_name).filter(Boolean)).sort((a, b) => a.localeCompare(b));
    const competitorCategories = distinct(competitorCaseProducts.map(item => item.category).filter(Boolean)).sort((a, b) => a.localeCompare(b));
    const competitorSubCategories = distinct(competitorCaseProducts.map(item => item.sub_category).filter(Boolean)).sort((a, b) => a.localeCompare(b));

    const competitorProductOptions = [];
    const competitorSeen = new Set();
    competitorCaseProducts.forEach((item) => {
        const key = item.product_id ? String(item.product_id) : item.product_name;
        if (!key || competitorSeen.has(key)) return;
        competitorSeen.add(key);
        competitorProductOptions.push({ value: key, label: item.product_name || 'Unknown Product' });
    });

    // Add products not in case products but are competitor products
    products.filter(p => !p.is_company_product).forEach((product) => {
        const key = String(product.id);
        if (competitorSeen.has(key)) return;
        competitorSeen.add(key);
        competitorProductOptions.push({ value: key, label: product.name });
    });

    return {
        company: {
            companies: companyCompanies,
            categories: companyCategories,
            subCategories: companySubCategories,
            productOptions: companyProductOptions
        },
        competitor: {
            companies: competitorCompanies,
            categories: competitorCategories,
            subCategories: competitorSubCategories,
            productOptions: competitorProductOptions
        }
    };
}

/**
 * Aggregate cases by month for trend analysis
 * Returns array of {month, companyCases, competitorCases}
 * MATCHES STAT CARD LOGIC: Company cases = all cases with company products (alone or mixed)
 * Competitor cases = all cases with competitor products (alone or mixed)
 */
export function aggregateCasesByMonthDual(cases = [], caseProductsMap = new Map()) {
    const map = new Map();
    cases.forEach((caseItem) => {
        const month = formatMonth(caseItem.case_date);
        const products = caseProductsMap.get(caseItem.id) || [];
        const hasCompany = products.some(p => p.is_company_product);
        const hasCompetitor = products.some(p => !p.is_company_product);

        if (!map.has(month)) {
            map.set(month, { companyCases: 0, competitorCases: 0 });
        }
        const data = map.get(month);
        // Count case in company if it has any company product
        if (hasCompany) data.companyCases += 1;
        // Count case in competitor if it has any competitor product
        if (hasCompetitor) data.competitorCases += 1;
    });
    return Array.from(map.entries()).map(([month, data]) => ({ month, ...data }));
}

/**
 * Aggregate units by month for trend analysis
 * Returns array of {month, companyUnits, competitorUnits}
 * MATCHES STAT CARD LOGIC: Uses total_company_units and total_competitor_units from case record
 */
export function aggregateUnitsByMonthDual(cases = []) {
    const map = new Map();
    cases.forEach((caseItem) => {
        const month = formatMonth(caseItem.case_date);
        if (!map.has(month)) {
            map.set(month, { companyUnits: 0, competitorUnits: 0 });
        }
        const data = map.get(month);
        // Use case-level totals (same as stat cards)
        data.companyUnits += caseItem.total_company_units || 0;
        data.competitorUnits += caseItem.total_competitor_units || 0;
    });
    return Array.from(map.entries()).map(([month, data]) => ({ month, ...data }));
}

/**
 * Calculate cases market share: company vs top 10 competitors vs others
 * MATCHES STAT CARD LOGIC: Company cases = all cases with ANY company product
 * Competitor cases = all cases with ANY competitor product (counted per company)
 */
export function calculateCasesMarketShare(cases = [], caseProductsMap = new Map()) {
    const companyCount = new Set();
    const competitorCounts = new Map();

    cases.forEach((caseItem) => {
        const products = caseProductsMap.get(caseItem.id) || [];
        const hasCompany = products.some(p => p.is_company_product);

        // Get unique competitor companies in this case
        const competitors = new Set(
            products.filter(p => !p.is_company_product).map(p => p.company_name).filter(Boolean)
        );

        // Count case for company if it has any company product
        if (hasCompany) companyCount.add(caseItem.id);

        // Count case for each competitor company that appears in this case
        competitors.forEach(comp => {
            competitorCounts.set(comp, (competitorCounts.get(comp) || 0) + 1);
        });
    });

    const sorted = Array.from(competitorCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    const labels = ['Company', ...sorted.map(([name]) => name)];
    const data = [companyCount.size, ...sorted.map(([, count]) => count)];

    // Calculate "Other" companies
    const otherCount = Array.from(competitorCounts.values()).reduce((sum, count) => sum + count, 0) -
                       sorted.reduce((sum, [, count]) => sum + count, 0);
    if (otherCount > 0) {
        labels.push('Other Companies');
        data.push(otherCount);
    }

    return { labels, data };
}

/**
 * Calculate units market share: company vs top 10 competitors vs others
 * MATCHES STAT CARD LOGIC: Uses total_company_units and total_competitor_units from cases
 * NOT from individual product units
 */
export function calculateUnitsMarketShare(cases = [], caseProductsMap = new Map()) {
    let companyUnits = 0;
    const competitorUnits = new Map();

    cases.forEach((caseItem) => {
        const products = caseProductsMap.get(caseItem.id) || [];

        // Add company units from case total
        companyUnits += caseItem.total_company_units || 0;

        // Get unique competitor companies and their units from this case
        const competitors = new Set(
            products.filter(p => !p.is_company_product).map(p => p.company_name).filter(Boolean)
        );

        // Distribute competitor units equally among companies in this case
        // OR count the case's total_competitor_units per company
        competitors.forEach(comp => {
            competitorUnits.set(comp, (competitorUnits.get(comp) || 0) + (caseItem.total_competitor_units || 0));
        });
    });

    const sorted = Array.from(competitorUnits.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    const labels = ['Company', ...sorted.map(([name]) => name)];
    const data = [companyUnits, ...sorted.map(([, units]) => units)];

    // Calculate "Other" companies
    const otherUnits = Array.from(competitorUnits.values()).reduce((sum, units) => sum + units, 0) -
                       sorted.reduce((sum, [, units]) => sum + units, 0);
    if (otherUnits > 0) {
        labels.push('Other Companies');
        data.push(otherUnits);
    }

    return { labels, data };
}

/**
 * Calculate UPA vs Private cases
 */
export function calculateUPAvsPrivateCases(cases = []) {
    let upaCount = 0;
    let privateCount = 0;

    cases.forEach((caseItem) => {
        if (caseItem.account_type === 'UPA') {
            upaCount += 1;
        } else if (caseItem.account_type === 'Private') {
            privateCount += 1;
        }
    });

    return {
        labels: ['UPA Cases', 'Private Cases'],
        data: [upaCount, privateCount]
    };
}

/**
 * Calculate units per category
 */
export function calculateUnitsPerCategory(caseProducts = []) {
    const map = new Map();
    caseProducts.forEach((product) => {
        const category = product.category || 'Uncategorized';
        map.set(category, (map.get(category) || 0) + (product.units || 0));
    });

    const sorted = Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    return {
        labels: sorted.map(([cat]) => cat),
        data: sorted.map(([, units]) => units)
    };
}

/**
 * Calculate units per company (stacked by top 10 competitors + company + others)
 */
export function calculateUnitsPerCompanyStacked(cases = [], caseProductsMap = new Map()) {
    const categoryCompanyMap = new Map(); // category -> {company -> units}

    cases.forEach((caseItem) => {
        const products = caseProductsMap.get(caseItem.id) || [];
        const categories = new Set(products.map(p => p.sub_category || p.category || 'Uncategorized'));

        categories.forEach((category) => {
            if (!categoryCompanyMap.has(category)) {
                categoryCompanyMap.set(category, new Map());
            }
            const companyMap = categoryCompanyMap.get(category);

            products
                .filter(p => (p.sub_category || p.category || 'Uncategorized') === category)
                .forEach(p => {
                    const company = p.company_name || (p.is_company_product ? 'Company' : 'Unknown');
                    companyMap.set(company, (companyMap.get(company) || 0) + (p.units || 0));
                });
        });
    });

    // Get all companies and sort by total units
    const allCompanies = new Map();
    categoryCompanyMap.forEach((companyMap) => {
        companyMap.forEach((units, company) => {
            allCompanies.set(company, (allCompanies.get(company) || 0) + units);
        });
    });

    const topCompanies = Array.from(allCompanies.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name]) => name);

    const categories = Array.from(categoryCompanyMap.keys()).sort();
    const datasets = [];

    // Add datasets for each company
    topCompanies.forEach((company, idx) => {
        const colors = [
            'rgba(99,102,241,0.8)',
            'rgba(236,72,153,0.8)',
            'rgba(34,197,94,0.8)',
            'rgba(251,191,36,0.8)',
            'rgba(14,165,233,0.8)',
            'rgba(168,85,247,0.8)',
            'rgba(236,72,153,0.8)',
            'rgba(59,130,246,0.8)',
            'rgba(16,185,129,0.8)',
            'rgba(245,158,11,0.8)'
        ];
        datasets.push({
            label: company,
            data: categories.map(cat => categoryCompanyMap.get(cat)?.get(company) || 0),
            backgroundColor: colors[idx % colors.length]
        });
    });

    // Add "Other" if needed
    const otherData = categories.map(cat => {
        const companyMap = categoryCompanyMap.get(cat);
        let otherUnits = 0;
        companyMap.forEach((units, company) => {
            if (!topCompanies.includes(company)) {
                otherUnits += units;
            }
        });
        return otherUnits;
    });

    if (otherData.some(v => v > 0)) {
        datasets.push({
            label: 'Other Companies',
            data: otherData,
            backgroundColor: 'rgba(107,114,128,0.8)'
        });
    }

    return {
        labels: categories,
        datasets
    };
}

/**
 * Calculate cases by product specialist
 */
export function calculateCasesByProductSpecialist(cases = []) {
    const map = new Map();
    cases.forEach((caseItem) => {
        const specialist = caseItem.submitted_by_name || 'Unknown';
        map.set(specialist, (map.get(specialist) || 0) + 1);
    });

    const sorted = Array.from(map.entries())
        .sort((a, b) => b[1] - a[1]);

    return {
        labels: sorted.map(([name]) => name),
        data: sorted.map(([, count]) => count)
    };
}

/**
 * Calculate cases by product
 */
export function calculateCasesByProduct(cases = [], caseProductsMap = new Map()) {
    const map = new Map();
    cases.forEach((caseItem) => {
        const products = caseProductsMap.get(caseItem.id) || [];
        const productNames = new Set(products.map(p => p.product_name || 'Unknown').filter(Boolean));
        productNames.forEach((productName) => {
            map.set(productName, (map.get(productName) || 0) + 1);
        });
    });

    const sorted = Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    return {
        labels: sorted.map(([name]) => name),
        data: sorted.map(([, count]) => count)
    };
}

/**
 * Calculate units per product specialist
 */
export function calculateUnitsByProductSpecialist(cases = []) {
    const map = new Map();
    cases.forEach((caseItem) => {
        const specialist = caseItem.submitted_by_name || 'Unknown';
        const totalUnits = (caseItem.total_company_units || 0) + (caseItem.total_competitor_units || 0);
        map.set(specialist, (map.get(specialist) || 0) + totalUnits);
    });

    const sorted = Array.from(map.entries())
        .sort((a, b) => b[1] - a[1]);

    return {
        labels: sorted.map(([name]) => name),
        data: sorted.map(([, units]) => units)
    };
}

/**
 * Calculate units by product
 */
export function calculateUnitsByProduct(caseProducts = []) {
    const map = new Map();
    caseProducts.forEach((product) => {
        const productName = product.product_name || 'Unknown';
        map.set(productName, (map.get(productName) || 0) + (product.units || 0));
    });

    const sorted = Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    return {
        labels: sorted.map(([name]) => name),
        data: sorted.map(([, units]) => units)
    };
}

// Helper function to format month
function formatMonth(dateStr) {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
}


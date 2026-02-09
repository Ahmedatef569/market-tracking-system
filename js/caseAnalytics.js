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

export function mapCaseProductColumns(caseProductsMap, caseId, limit = 12) {
    const products = [...(caseProductsMap.get(caseId) || [])].slice(0, limit);
    const filler = { name: '', type: '', company: '', category: '', sub_category: '', units: 0 };
    const padded = [...products, filler, filler, filler, filler, filler, filler, filler, filler, filler, filler, filler, filler].slice(0, limit);
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
    const [product1, product2, product3, product4, product5, product6, product7, product8, product9, product10, product11, product12] = mapCaseProductColumns(caseProductsMap, caseItem.id);
    return {
        id: caseItem.id,
        specialist: caseItem.submitted_by_name,
        line: caseItem.line_name || '',
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
        product3_units: product3.units,
        product4_name: product4.name,
        product4_type: product4.type,
        product4_company: product4.company,
        product4_category: product4.category,
        product4_sub_category: product4.sub_category,
        product4_units: product4.units,
        product5_name: product5.name,
        product5_type: product5.type,
        product5_company: product5.company,
        product5_category: product5.category,
        product5_sub_category: product5.sub_category,
        product5_units: product5.units,
        product6_name: product6.name,
        product6_type: product6.type,
        product6_company: product6.company,
        product6_category: product6.category,
        product6_sub_category: product6.sub_category,
        product6_units: product6.units,
        product7_name: product7.name,
        product7_type: product7.type,
        product7_company: product7.company,
        product7_category: product7.category,
        product7_sub_category: product7.sub_category,
        product7_units: product7.units,
        product8_name: product8.name,
        product8_type: product8.type,
        product8_company: product8.company,
        product8_category: product8.category,
        product8_sub_category: product8.sub_category,
        product8_units: product8.units,
        product9_name: product9.name,
        product9_type: product9.type,
        product9_company: product9.company,
        product9_category: product9.category,
        product9_sub_category: product9.sub_category,
        product9_units: product9.units,
        product10_name: product10.name,
        product10_type: product10.type,
        product10_company: product10.company,
        product10_category: product10.category,
        product10_sub_category: product10.sub_category,
        product10_units: product10.units,
        product11_name: product11.name,
        product11_type: product11.type,
        product11_company: product11.company,
        product11_category: product11.category,
        product11_sub_category: product11.sub_category,
        product11_units: product11.units,
        product12_name: product12.name,
        product12_type: product12.type,
        product12_company: product12.company,
        product12_category: product12.category,
        product12_sub_category: product12.sub_category,
        product12_units: product12.units
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
        { title: 'Line', field: 'line', width: 150, headerFilter: 'input' },
        { title: 'Status', field: 'status', formatter: tableFormatters.status, width: 140 },
        { title: 'Account', field: 'account', minWidth: 180, headerFilter: 'input' },
        { title: 'Account Type', field: 'account_type', width: 140 },
        { title: 'Doctor', field: 'doctor', minWidth: 180, headerFilter: 'input' },
        { title: 'Date', field: 'case_date', formatter: tableFormatters.date, width: 140 },
        { title: 'Case Code', field: 'case_code', width: 150, headerFilter: 'input' },
        { title: 'Product 1', field: 'product1_name', minWidth: 180, headerFilter: 'input', visible: false },
        { title: 'P1 Type', field: 'product1_type', width: 130, visible: false },
        { title: 'P1 Company', field: 'product1_company', minWidth: 160, headerFilter: 'input', visible: false },
        { title: 'P1 Category', field: 'product1_category', minWidth: 160, headerFilter: 'input', visible: false },
        { title: 'P1 Sub-category', field: 'product1_sub_category', minWidth: 180, headerFilter: 'input', visible: false },
        { title: 'P1 Units', field: 'product1_units', formatter: tableFormatters.number(), width: 140, visible: false },
        { title: 'Product 2', field: 'product2_name', minWidth: 180, headerFilter: 'input', visible: false },
        { title: 'P2 Type', field: 'product2_type', width: 130, visible: false },
        { title: 'P2 Company', field: 'product2_company', minWidth: 160, headerFilter: 'input', visible: false },
        { title: 'P2 Category', field: 'product2_category', minWidth: 160, headerFilter: 'input', visible: false },
        { title: 'P2 Sub-category', field: 'product2_sub_category', minWidth: 180, headerFilter: 'input', visible: false },
        { title: 'P2 Units', field: 'product2_units', formatter: tableFormatters.number(), width: 140, visible: false },
        { title: 'Product 3', field: 'product3_name', minWidth: 180, headerFilter: 'input', visible: false },
        { title: 'P3 Type', field: 'product3_type', width: 130, visible: false },
        { title: 'P3 Company', field: 'product3_company', minWidth: 160, headerFilter: 'input', visible: false },
        { title: 'P3 Category', field: 'product3_category', minWidth: 160, headerFilter: 'input', visible: false },
        { title: 'P3 Sub-category', field: 'product3_sub_category', minWidth: 180, headerFilter: 'input', visible: false },
        { title: 'P3 Units', field: 'product3_units', formatter: tableFormatters.number(), width: 140, visible: false },
        { title: 'Product 4', field: 'product4_name', minWidth: 180, headerFilter: 'input', visible: false },
        { title: 'P4 Type', field: 'product4_type', width: 130, visible: false },
        { title: 'P4 Company', field: 'product4_company', minWidth: 160, headerFilter: 'input', visible: false },
        { title: 'P4 Category', field: 'product4_category', minWidth: 160, headerFilter: 'input', visible: false },
        { title: 'P4 Sub-category', field: 'product4_sub_category', minWidth: 180, headerFilter: 'input', visible: false },
        { title: 'P4 Units', field: 'product4_units', formatter: tableFormatters.number(), width: 140, visible: false },
        { title: 'Product 5', field: 'product5_name', minWidth: 180, headerFilter: 'input', visible: false },
        { title: 'P5 Type', field: 'product5_type', width: 130, visible: false },
        { title: 'P5 Company', field: 'product5_company', minWidth: 160, headerFilter: 'input', visible: false },
        { title: 'P5 Category', field: 'product5_category', minWidth: 160, headerFilter: 'input', visible: false },
        { title: 'P5 Sub-category', field: 'product5_sub_category', minWidth: 180, headerFilter: 'input', visible: false },
        { title: 'P5 Units', field: 'product5_units', formatter: tableFormatters.number(), width: 140, visible: false },
        { title: 'Product 6', field: 'product6_name', minWidth: 180, headerFilter: 'input', visible: false },
        { title: 'P6 Type', field: 'product6_type', width: 130, visible: false },
        { title: 'P6 Company', field: 'product6_company', minWidth: 160, headerFilter: 'input', visible: false },
        { title: 'P6 Category', field: 'product6_category', minWidth: 160, headerFilter: 'input', visible: false },
        { title: 'P6 Sub-category', field: 'product6_sub_category', minWidth: 180, headerFilter: 'input', visible: false },
        { title: 'P6 Units', field: 'product6_units', formatter: tableFormatters.number(), width: 140, visible: false },
        { title: 'Product 7', field: 'product7_name', minWidth: 180, headerFilter: 'input', visible: false },
        { title: 'P7 Type', field: 'product7_type', width: 130, visible: false },
        { title: 'P7 Company', field: 'product7_company', minWidth: 160, headerFilter: 'input', visible: false },
        { title: 'P7 Category', field: 'product7_category', minWidth: 160, headerFilter: 'input', visible: false },
        { title: 'P7 Sub-category', field: 'product7_sub_category', minWidth: 180, headerFilter: 'input', visible: false },
        { title: 'P7 Units', field: 'product7_units', formatter: tableFormatters.number(), width: 140, visible: false },
        { title: 'Product 8', field: 'product8_name', minWidth: 180, headerFilter: 'input', visible: false },
        { title: 'P8 Type', field: 'product8_type', width: 130, visible: false },
        { title: 'P8 Company', field: 'product8_company', minWidth: 160, headerFilter: 'input', visible: false },
        { title: 'P8 Category', field: 'product8_category', minWidth: 160, headerFilter: 'input', visible: false },
        { title: 'P8 Sub-category', field: 'product8_sub_category', minWidth: 180, headerFilter: 'input', visible: false },
        { title: 'P8 Units', field: 'product8_units', formatter: tableFormatters.number(), width: 140, visible: false },
        { title: 'Product 9', field: 'product9_name', minWidth: 180, headerFilter: 'input', visible: false },
        { title: 'P9 Type', field: 'product9_type', width: 130, visible: false },
        { title: 'P9 Company', field: 'product9_company', minWidth: 160, headerFilter: 'input', visible: false },
        { title: 'P9 Category', field: 'product9_category', minWidth: 160, headerFilter: 'input', visible: false },
        { title: 'P9 Sub-category', field: 'product9_sub_category', minWidth: 180, headerFilter: 'input', visible: false },
        { title: 'P9 Units', field: 'product9_units', formatter: tableFormatters.number(), width: 140, visible: false },
        { title: 'Product 10', field: 'product10_name', minWidth: 180, headerFilter: 'input', visible: false },
        { title: 'P10 Type', field: 'product10_type', width: 130, visible: false },
        { title: 'P10 Company', field: 'product10_company', minWidth: 160, headerFilter: 'input', visible: false },
        { title: 'P10 Category', field: 'product10_category', minWidth: 160, headerFilter: 'input', visible: false },
        { title: 'P10 Sub-category', field: 'product10_sub_category', minWidth: 180, headerFilter: 'input', visible: false },
        { title: 'P10 Units', field: 'product10_units', formatter: tableFormatters.number(), width: 140, visible: false },
        { title: 'Product 11', field: 'product11_name', minWidth: 180, headerFilter: 'input', visible: false },
        { title: 'P11 Type', field: 'product11_type', width: 130, visible: false },
        { title: 'P11 Company', field: 'product11_company', minWidth: 160, headerFilter: 'input', visible: false },
        { title: 'P11 Category', field: 'product11_category', minWidth: 160, headerFilter: 'input', visible: false },
        { title: 'P11 Sub-category', field: 'product11_sub_category', minWidth: 180, headerFilter: 'input', visible: false },
        { title: 'P11 Units', field: 'product11_units', formatter: tableFormatters.number(), width: 140, visible: false },
        { title: 'Product 12', field: 'product12_name', minWidth: 180, headerFilter: 'input', visible: false },
        { title: 'P12 Type', field: 'product12_type', width: 130, visible: false },
        { title: 'P12 Company', field: 'product12_company', minWidth: 160, headerFilter: 'input', visible: false },
        { title: 'P12 Category', field: 'product12_category', minWidth: 160, headerFilter: 'input', visible: false },
        { title: 'P12 Sub-category', field: 'product12_sub_category', minWidth: 180, headerFilter: 'input', visible: false },
        { title: 'P12 Units', field: 'product12_units', formatter: tableFormatters.number(), width: 140, visible: false },
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
            line: row.line,
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
            product3_units: row.product3_units,
            product4_name: row.product4_name,
            product4_type: row.product4_type,
            product4_company: row.product4_company,
            product4_category: row.product4_category,
            product4_sub_category: row.product4_sub_category,
            product4_units: row.product4_units,
            product5_name: row.product5_name,
            product5_type: row.product5_type,
            product5_company: row.product5_company,
            product5_category: row.product5_category,
            product5_sub_category: row.product5_sub_category,
            product5_units: row.product5_units,
            product6_name: row.product6_name,
            product6_type: row.product6_type,
            product6_company: row.product6_company,
            product6_category: row.product6_category,
            product6_sub_category: row.product6_sub_category,
            product6_units: row.product6_units,
            product7_name: row.product7_name,
            product7_type: row.product7_type,
            product7_company: row.product7_company,
            product7_category: row.product7_category,
            product7_sub_category: row.product7_sub_category,
            product7_units: row.product7_units,
            product8_name: row.product8_name,
            product8_type: row.product8_type,
            product8_company: row.product8_company,
            product8_category: row.product8_category,
            product8_sub_category: row.product8_sub_category,
            product8_units: row.product8_units,
            product9_name: row.product9_name,
            product9_type: row.product9_type,
            product9_company: row.product9_company,
            product9_category: row.product9_category,
            product9_sub_category: row.product9_sub_category,
            product9_units: row.product9_units,
            product10_name: row.product10_name,
            product10_type: row.product10_type,
            product10_company: row.product10_company,
            product10_category: row.product10_category,
            product10_sub_category: row.product10_sub_category,
            product10_units: row.product10_units,
            product11_name: row.product11_name,
            product11_type: row.product11_type,
            product11_company: row.product11_company,
            product11_category: row.product11_category,
            product11_sub_category: row.product11_sub_category,
            product11_units: row.product11_units,
            product12_name: row.product12_name,
            product12_type: row.product12_type,
            product12_company: row.product12_company,
            product12_category: row.product12_category,
            product12_sub_category: row.product12_sub_category,
            product12_units: row.product12_units
        };
    });
}

export const CASE_EXPORT_HEADERS = {
    case_code: 'Case Code',
    case_date: 'Case Date',
    specialist: 'Product Specialist',
    line: 'Line',
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
    product4_name: 'Product 4',
    product4_type: 'P4 Type',
    product4_company: 'P4 Company',
    product4_category: 'P4 Category',
    product4_sub_category: 'P4 Sub-category',
    product4_units: 'P4 Units',
    product5_name: 'Product 5',
    product5_type: 'P5 Type',
    product5_company: 'P5 Company',
    product5_category: 'P5 Category',
    product5_sub_category: 'P5 Sub-category',
    product5_units: 'P5 Units',
    product6_name: 'Product 6',
    product6_type: 'P6 Type',
    product6_company: 'P6 Company',
    product6_category: 'P6 Category',
    product6_sub_category: 'P6 Sub-category',
    product6_units: 'P6 Units',
    product7_name: 'Product 7',
    product7_type: 'P7 Type',
    product7_company: 'P7 Company',
    product7_category: 'P7 Category',
    product7_sub_category: 'P7 Sub-category',
    product7_units: 'P7 Units',
    product8_name: 'Product 8',
    product8_type: 'P8 Type',
    product8_company: 'P8 Company',
    product8_category: 'P8 Category',
    product8_sub_category: 'P8 Sub-category',
    product8_units: 'P8 Units',
    product9_name: 'Product 9',
    product9_type: 'P9 Type',
    product9_company: 'P9 Company',
    product9_category: 'P9 Category',
    product9_sub_category: 'P9 Sub-category',
    product9_units: 'P9 Units',
    product10_name: 'Product 10',
    product10_type: 'P10 Type',
    product10_company: 'P10 Company',
    product10_category: 'P10 Category',
    product10_sub_category: 'P10 Sub-category',
    product10_units: 'P10 Units',
    product11_name: 'Product 11',
    product11_type: 'P11 Type',
    product11_company: 'P11 Company',
    product11_category: 'P11 Category',
    product11_sub_category: 'P11 Sub-category',
    product11_units: 'P11 Units',
    product12_name: 'Product 12',
    product12_type: 'P12 Type',
    product12_company: 'P12 Company',
    product12_category: 'P12 Category',
    product12_sub_category: 'P12 Sub-category',
    product12_units: 'P12 Units',
    company_units: 'Company Units',
    competitor_units: 'Competitor Units'
};

/**
 * Attach toggle button to show/hide products 4-12 columns in case tables
 * @param {Object} table - Tabulator table instance
 * @param {Object} options - Configuration options
 * @param {string} options.anchorField - Field name to attach the toggle button to (e.g., 'product3_units')
 * @param {string} options.storageKey - LocalStorage key to persist toggle state
 */
export function attachProductsToggle(table, { anchorField = 'actions', storageKey = 'cases_products_toggle' } = {}) {
    if (!table || !table.getColumn || !anchorField) return;
    if (table._productsToggleInitialized) return;

    const toggleFields = [
        'product1_name', 'product1_type', 'product1_company', 'product1_category', 'product1_sub_category', 'product1_units',
        'product2_name', 'product2_type', 'product2_company', 'product2_category', 'product2_sub_category', 'product2_units',
        'product3_name', 'product3_type', 'product3_company', 'product3_category', 'product3_sub_category', 'product3_units',
        'product4_name', 'product4_type', 'product4_company', 'product4_category', 'product4_sub_category', 'product4_units',
        'product5_name', 'product5_type', 'product5_company', 'product5_category', 'product5_sub_category', 'product5_units',
        'product6_name', 'product6_type', 'product6_company', 'product6_category', 'product6_sub_category', 'product6_units',
        'product7_name', 'product7_type', 'product7_company', 'product7_category', 'product7_sub_category', 'product7_units',
        'product8_name', 'product8_type', 'product8_company', 'product8_category', 'product8_sub_category', 'product8_units',
        'product9_name', 'product9_type', 'product9_company', 'product9_category', 'product9_sub_category', 'product9_units',
        'product10_name', 'product10_type', 'product10_company', 'product10_category', 'product10_sub_category', 'product10_units',
        'product11_name', 'product11_type', 'product11_company', 'product11_category', 'product11_sub_category', 'product11_units',
        'product12_name', 'product12_type', 'product12_company', 'product12_category', 'product12_sub_category', 'product12_units'
    ];

    const initialize = () => {
        const anchorColumn = table.getColumn(anchorField);
        if (!anchorColumn || !anchorColumn.getElement) return;
        const headerEl = anchorColumn.getElement();
        const titleEl = headerEl?.querySelector('.tabulator-col-title');
        if (!titleEl || titleEl.querySelector('.products-toggle-btn')) return;

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'btn btn-sm btn-outline-ghost products-toggle-btn';
        toggleBtn.textContent = '+';
        toggleBtn.setAttribute('aria-expanded', 'false');
        toggleBtn.setAttribute('aria-label', 'Show case details columns');
        toggleBtn.style.marginLeft = '0.5rem';

        titleEl.classList.add('products-toggle-title');
        titleEl.appendChild(toggleBtn);

        const getStoredState = () => {
            if (!storageKey) return null;
            try {
                return localStorage.getItem(storageKey);
            } catch {
                return null;
            }
        };

        const setStoredState = (expanded) => {
            if (!storageKey) return;
            try {
                localStorage.setItem(storageKey, expanded ? '1' : '0');
            } catch {
                // Ignore storage errors
            }
        };

        const applyState = (expanded) => {
            // Batch DOM updates for better performance
            const columns = toggleFields.map(field => table.getColumn(field)).filter(col => col);

            // Use blockRedraw to prevent multiple redraws
            table.blockRedraw();

            columns.forEach((column) => {
                if (expanded) {
                    column.show();
                } else {
                    column.hide();
                }
            });

            // Restore redraw
            table.restoreRedraw();

            toggleBtn.textContent = expanded ? '−' : '+';
            toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            toggleBtn.setAttribute(
                'aria-label',
                expanded ? 'Hide case details columns' : 'Show case details columns'
            );
            setStoredState(expanded);
        };

        const stored = getStoredState();
        let expanded = stored !== null ? stored === '1' : false;

        applyState(expanded);

        toggleBtn.addEventListener('click', () => {
            expanded = !expanded;
            applyState(expanded);
        });

        table._productsToggleInitialized = true;
    };

    // Try to initialize immediately if column exists
    if (table.getColumn(anchorField)) {
        initialize();
    } else {
        // Otherwise wait for table to be built
        table.on('tableBuilt', () => {
            if (table._productsToggleInitialized) return;
            // Use setTimeout to ensure DOM is fully ready
            setTimeout(() => {
                if (!table._productsToggleInitialized) {
                    initialize();
                }
            }, 50);
        });
    }
}

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
 * Calculate cases market share: company vs top 5 competitors vs others
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
        .slice(0, 5);

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
 * Calculate units market share: company vs top 5 competitors vs others
 * MATCHES STAT CARD LOGIC: Uses actual product units per company
 * FIX: Calculate units per competitor company from individual products, not case totals
 */
export function calculateUnitsMarketShare(cases = [], caseProductsMap = new Map()) {
    let companyUnits = 0;
    const competitorUnits = new Map();

    cases.forEach((caseItem) => {
        const products = caseProductsMap.get(caseItem.id) || [];

        // Add company units from case total
        companyUnits += caseItem.total_company_units || 0;

        // Calculate units per competitor company from individual products
        // This prevents double-counting when a case has multiple competitor companies
        products.forEach(product => {
            if (!product.is_company_product && product.company_name) {
                const companyName = product.company_name;
                const units = product.units || 0;
                competitorUnits.set(companyName, (competitorUnits.get(companyName) || 0) + units);
            }
        });
    });

    const sorted = Array.from(competitorUnits.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

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
 * Calculate cases per account type (Private, UPA, Military)
 */
export function calculateUPAvsPrivateCases(cases = []) {
    let privateCount = 0;
    let upaCount = 0;
    let militaryCount = 0;

    cases.forEach((caseItem) => {
        if (caseItem.account_type === 'Private') {
            privateCount += 1;
        } else if (caseItem.account_type === 'UPA') {
            upaCount += 1;
        } else if (caseItem.account_type === 'Military') {
            militaryCount += 1;
        }
    });

    return {
        labels: ['Private Cases', 'UPA Cases', 'Military Cases'],
        data: [privateCount, upaCount, militaryCount]
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
 * Helper function to truncate sub-category labels to "FirstWord...LastWord"
 * Example: "short self expanding stents" -> "short...stents"
 */
export function truncateSubCategoryLabel(label) {
    if (!label || typeof label !== 'string') return label;

    const words = label.trim().split(/\s+/);

    // If 2 words or less, return as is
    if (words.length <= 2) return label;

    // Return "FirstWord...LastWord"
    return `${words[0]}...${words[words.length - 1]}`;
}

/**
 * Calculate units per company (stacked by top 10 competitors + company + others)
 * Returns both truncated labels for display and full labels for tooltips
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

    // Create truncated labels for display
    const truncatedLabels = categories.map(cat => truncateSubCategoryLabel(cat));

    return {
        labels: truncatedLabels,
        fullLabels: categories, // Keep full labels for tooltips
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


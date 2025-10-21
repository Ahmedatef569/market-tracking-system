import { APPROVAL_STATUS, STATUS_LABELS, COLORS } from './constants.js';

const THEME_STORAGE_KEY = 'mts-theme';

export function formatDate(value, options = {}) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit', ...options });
}

export function formatMonth(value) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export function formatNumber(value, decimals = 0) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '0';
    return Number(value).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function createStatusPill(status) {
    const label = STATUS_LABELS[status] || toSentenceCase(status);
    return `<span class="status-pill ${status}">${label}</span>`;
}

export function serializeForm(formElement) {
    const formData = new FormData(formElement);
    const result = {};
    for (const [key, value] of formData.entries()) {
        if (result[key]) {
            if (!Array.isArray(result[key])) {
                result[key] = [result[key]];
            }
            result[key].push(typeof value === 'string' ? value.trim() : value);
        } else {
            result[key] = typeof value === 'string' ? value.trim() : value;
        }
    }
    return result;
}

export function clearForm(formElement) {
    formElement.reset();
    formElement.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
}

export function validateRequiredFields(formElement, requiredSelectors = []) {
    let valid = true;
    requiredSelectors.forEach((selector) => {
        const field = formElement.querySelector(selector);
        if (!field) return;
        if (!field.value || (Array.isArray(field.value) && !field.value.length)) {
            field.classList.add('is-invalid');
            valid = false;
        } else {
            field.classList.remove('is-invalid');
        }
    });
    return valid;
}

export function showAlert(container, message, type = 'danger') {
    if (!container) return;
    container.classList.remove('d-none');
    container.classList.toggle('alert-feedback', type === 'danger');
    container.innerHTML = message;
    setTimeout(() => {
        hideAlert(container);
    }, 5000);
}

export function hideAlert(container) {
    if (!container) return;
    container.classList.add('d-none');
    container.innerHTML = '';
}

export function sumBy(items, selector) {
    return items.reduce((sum, item) => sum + Number(selector(item) || 0), 0);
}

export function groupBy(items, keySelector) {
    return items.reduce((map, item) => {
        const key = keySelector(item);
        if (!map.has(key)) {
            map.set(key, []);
        }
        map.get(key).push(item);
        return map;
    }, new Map());
}

export function generateCaseCode() {
    const now = new Date();
    return `CASE-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${now.getTime().toString(36).toUpperCase()}`;
}

export async function downloadAsExcel(filename, rows = [], headerMap = {}) {
    if (!window.XLSX) {
        throw new Error('Excel library not loaded');
    }
    const worksheetData = rows.map((row) => {
        if (!row) return {};
        if (!Object.keys(headerMap).length) return row;
        const entry = {};
        for (const [key, label] of Object.entries(headerMap)) {
            entry[label] = row[key];
        }
        return entry;
    });
    const worksheet = window.XLSX.utils.json_to_sheet(worksheetData);
    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    window.XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = window.XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = window.XLSX.utils.sheet_to_json(worksheet, { defval: '' });
                resolve(json);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

export function buildAvatarInitials(name = '') {
    const parts = name.trim().split(/\s+/);
    return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('') || 'NA';
}

export function statusColor(status) {
    switch (status) {
        case APPROVAL_STATUS.APPROVED:
            return COLORS.company;
        case APPROVAL_STATUS.REJECTED:
            return '#f87171';
        case APPROVAL_STATUS.PENDING_ADMIN:
            return '#38bdf8';
        case APPROVAL_STATUS.PENDING_MANAGER:
        default:
            return '#facc15';
    }
}

export function monthRangeToDates(startMonth, endMonth) {
    if (!startMonth || !endMonth) return [null, null];
    const start = new Date(`${startMonth}-01`);
    const end = new Date(`${endMonth}-01`);
    end.setMonth(end.getMonth() + 1);
    end.setDate(0);
    return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}

export function distinct(values = []) {
    return Array.from(new Set(values.filter(Boolean)));
}

export function toSentenceCase(text = '') {
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

export function parseBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        return ['true', '1', 'yes', 'y'].includes(value.trim().toLowerCase());
    }
    return Boolean(value);
}

export function setActiveSection(sections, targetId) {
    sections.forEach((section) => {
        const isActive = section.dataset.section === targetId;
        section.classList.toggle('d-none', !isActive);
    });
}

export function initTabNavigation(buttons, panels, dataKey, defaultTarget) {
    if (!buttons?.length || !panels?.length) return () => {};
    const activate = (target) => {
        buttons.forEach((button) => {
            const isActive = button.dataset[dataKey] === target;
            button.classList.toggle('active', isActive);
        });
        panels.forEach((panel) => {
            const isActive = panel.dataset[dataKey] === target;
            panel.classList.toggle('d-none', !isActive);
        });
    };

    const initial = defaultTarget || buttons[0].dataset[dataKey];
    activate(initial);

    buttons.forEach((button) => {
        button.addEventListener('click', () => activate(button.dataset[dataKey]));
    });

    return activate;
}

export function debounce(fn, delay = 300) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.call(null, ...args), delay);
    };
}

export function buildOption(value, label, extra = {}) {
    const option = document.createElement('option');
    option.value = value ?? '';
    option.textContent = label ?? value ?? '';
    Object.entries(extra).forEach(([key, val]) => {
        if (val !== undefined && val !== null) {
            option.dataset[key] = val;
        }
    });
    return option;
}

export function mapToOptions(selectElement, items, { valueKey = 'id', labelKey = 'name', placeholder = null } = {}) {
    selectElement.innerHTML = '';
    if (placeholder) {
        selectElement.appendChild(buildOption('', placeholder));
    }
    items.forEach((item) => {
        const option = buildOption(item[valueKey], item[labelKey], item.dataset || {});
        selectElement.appendChild(option);
    });
}

export function setLoadingState(button, isLoading, loadingText = 'Saving...') {
    if (!button) return;
    if (isLoading) {
        button.dataset.originalText = button.textContent;
        button.textContent = loadingText;
        button.disabled = true;
    } else {
        button.textContent = button.dataset.originalText || button.textContent;
        button.disabled = false;
    }
}

export function handleError(error, fallbackMessage = 'Something went wrong') {
    console.error(error);
    return error?.message || fallbackMessage;
}
export function initAutocomplete({ input, hiddenInput = null, datalistId = '', items = [], labelSelector = (item) => item.label ?? item.name, valueSelector = (item) => item.value ?? item.id, allowUnmatched = false }) {
    if (!input) return { update: () => {}, getValue: () => '', clear: () => {} };
    const datalist = ensureDatalist(datalistId || `${input.id || input.name}-list`);
    input.setAttribute('list', datalist.id);

    const optionMap = new Map();

    const syncHidden = () => {
        const key = input.value.trim().toLowerCase();
        if (optionMap.has(key)) {
            const value = optionMap.get(key);
            if (hiddenInput) hiddenInput.value = value;
            input.classList.remove('is-invalid');
            return value;
        }
        if (!allowUnmatched && hiddenInput) {
            hiddenInput.value = '';
            if (input.value) {
                input.classList.add('is-invalid');
            }
        }
        return '';
    };

    input.addEventListener('change', syncHidden);
    input.addEventListener('input', () => {
        if (hiddenInput && !allowUnmatched) {
            hiddenInput.value = '';
        }
        input.classList.remove('is-invalid');
    });

    const update = (nextItems = []) => {
        datalist.innerHTML = '';
        optionMap.clear();
        nextItems.forEach((item) => {
            const label = labelSelector(item);
            const value = valueSelector(item);
            if (!label) return;
            const option = document.createElement('option');
            option.value = label;
            datalist.appendChild(option);
            optionMap.set(label.toLowerCase(), value);
        });
    };

    update(items);

    return {
        update,
        getValue: () => (hiddenInput ? hiddenInput.value : input.value),
        clear: () => {
            input.value = '';
            if (hiddenInput) hiddenInput.value = '';
            input.classList.remove('is-invalid');
        },
        isMatched: () => {
            const key = input.value.trim().toLowerCase();
            return optionMap.has(key);
        }
    };
}

function getPreferredTheme() {
    const stored = window.localStorage?.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
        return stored;
    }
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
}

export function applyTheme(theme) {
    if (theme === 'light') {
        document.body.dataset.theme = 'light';
    } else {
        delete document.body.dataset.theme;
    }
}

export function ensureThemeApplied() {
    const theme = getPreferredTheme();
    applyTheme(theme);
    return theme;
}

function updateThemeToggleVisual(theme, labelElement, iconElement) {
    if (labelElement) {
        labelElement.textContent = theme === 'light' ? 'Light Mode' : 'Dark Mode';
    }
    if (iconElement) {
        iconElement.classList.add('bi');
        iconElement.classList.add('theme-toggle__icon');
        iconElement.classList.remove('bi-sun-fill', 'bi-moon-stars-fill');
        iconElement.classList.add(theme === 'light' ? 'bi-sun-fill' : 'bi-moon-stars-fill');
    }
}

export function initThemeToggle(toggleElement, options = {}) {
    const { labelElement = null, iconElement = null, onThemeChange = null } = options;
    let currentTheme = ensureThemeApplied();
    const applyAndSync = (theme) => {
        currentTheme = theme;
        applyTheme(theme);
        updateThemeToggleVisual(theme, labelElement, iconElement);
        if (toggleElement) {
            if (toggleElement instanceof HTMLInputElement && toggleElement.type === 'checkbox') {
                toggleElement.checked = theme === 'light';
            }
            toggleElement.setAttribute(
                'aria-label',
                theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'
            );
        }
        // Call theme change callback if provided
        if (onThemeChange && typeof onThemeChange === 'function') {
            onThemeChange(theme);
        }
    };

    applyAndSync(currentTheme);

    const mediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const handleMediaChange = (event) => {
        if (window.localStorage?.getItem(THEME_STORAGE_KEY)) return;
        const nextTheme = event.matches ? 'dark' : 'light';
        applyAndSync(nextTheme);
    };
    if (mediaQuery) {
        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', handleMediaChange);
        } else if (mediaQuery.addListener) {
            mediaQuery.addListener(handleMediaChange);
        }
    }

    if (toggleElement) {
        if (toggleElement instanceof HTMLInputElement && toggleElement.type === 'checkbox') {
            toggleElement.addEventListener('change', () => {
                const nextTheme = toggleElement.checked ? 'light' : 'dark';
                applyAndSync(nextTheme);
                window.localStorage?.setItem(THEME_STORAGE_KEY, nextTheme);
            });
        } else {
            toggleElement.addEventListener('click', () => {
                const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
                applyAndSync(nextTheme);
                window.localStorage?.setItem(THEME_STORAGE_KEY, nextTheme);
            });
        }
    }
}

function ensureDatalist(id) {
    let list = document.getElementById(id);
    if (!list) {
        list = document.createElement('datalist');
        list.id = id;
        document.body.appendChild(list);
    }
    return list;
}

/**
 * Makes a select element searchable by adding a text input overlay
 * @param {string} selectId - The ID of the select element to make searchable
 */
export function makeSelectSearchable(selectId) {
    const selectEl = document.getElementById(selectId);
    if (!selectEl || selectEl.tagName !== 'SELECT') return;

    // Skip if already made searchable
    if (selectEl.classList.contains('searchable-select')) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'searchable-select-wrapper';
    selectEl.parentNode.insertBefore(wrapper, selectEl);
    wrapper.appendChild(selectEl);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control searchable-select-input';
    input.placeholder = 'Search...';
    input.setAttribute('autocomplete', 'off');
    wrapper.appendChild(input);

    selectEl.classList.add('searchable-select');

    const options = Array.from(selectEl.options);
    const originalOptions = options.map((opt) => ({
        value: opt.value,
        text: opt.text,
        element: opt
    }));

    // Handle input changes
    input.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();

        // Clear current options except the first one (usually "All")
        while (selectEl.options.length > 1) {
            selectEl.remove(1);
        }

        // Filter and add matching options
        const filtered = originalOptions.filter((opt) => {
            if (!opt.value) return true; // Always show empty option
            return opt.text.toLowerCase().includes(searchTerm);
        });

        filtered.forEach((opt) => {
            if (opt.value) {
                const newOption = document.createElement('option');
                newOption.value = opt.value;
                newOption.text = opt.text;
                selectEl.appendChild(newOption);
            }
        });
    });

    // Handle select changes
    selectEl.addEventListener('change', (e) => {
        const selectedOption = selectEl.options[selectEl.selectedIndex];
        input.value = selectedOption.text || '';

        // Trigger change event on the select for filter handlers
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Clear input when select is cleared
    selectEl.addEventListener('click', () => {
        if (!selectEl.value) {
            input.value = '';
        }
    });
}

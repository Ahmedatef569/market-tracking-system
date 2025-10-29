import { formatDate, createStatusPill } from './utils.js';

const DEFAULT_OPTIONS = {
    layout: 'fitDataTable',
    responsiveLayout: false,
    reactiveData: true,
    placeholder: 'No data available',
    headerHozAlign: 'left',
    pagination: true,
    paginationSize: 100,
    paginationSizeSelector: [10, 25, 50, 100, 200],
    height: '100%',
    columnDefaults: {
        vertAlign: 'middle',
        headerSort: true,
        resizable: true,
        minWidth: 140
    }
};

const TABULATOR_LOCAL_SRC = 'vendor/tabulator/tabulator.min.js';
const TABULATOR_CDN_SRC = 'https://unpkg.com/tabulator-tables@5.5.2/dist/js/tabulator.min.js';

let tabulatorReadyPromise = null;

export function ensureTabulator() {
    if (window.Tabulator) {
        return Promise.resolve(window.Tabulator);
    }

    if (!tabulatorReadyPromise) {
        tabulatorReadyPromise = new Promise((resolve, reject) => {
            const resolveIfReady = () => {
                if (window.Tabulator) {
                    resolve(window.Tabulator);
                    return true;
                }
                return false;
            };

            const loadScript = (src, isCdn = false) => {
                const script = document.createElement('script');
                script.src = src;
                script.dataset.tabulatorLoader = 'true';
                if (isCdn) {
                    script.dataset.tabulatorCdn = 'true';
                }
                script.onload = () => {
                    if (!resolveIfReady()) {
                        if (!isCdn) {
                            loadScript(TABULATOR_CDN_SRC, true);
                        } else {
                            reject(new Error('Tabulator library failed to initialize'));
                        }
                    }
                };
                script.onerror = () => {
                    if (!isCdn) {
                        loadScript(TABULATOR_CDN_SRC, true);
                    } else {
                        reject(new Error('Failed to load Tabulator library'));
                    }
                };
                document.head.appendChild(script);
            };

            const existing = document.querySelector('script[data-tabulator-loader]');
            if (existing) {
                existing.addEventListener('load', () => {
                    if (!resolveIfReady()) {
                        loadScript(TABULATOR_CDN_SRC, true);
                    }
                }, { once: true });
                existing.addEventListener('error', () => loadScript(TABULATOR_CDN_SRC, true), { once: true });
            } else {
                loadScript(TABULATOR_LOCAL_SRC);
            }

            const pollInterval = 50;
            const maxWait = 5000;
            let elapsed = 0;
            const poll = setInterval(() => {
                elapsed += pollInterval;
                if (resolveIfReady()) {
                    clearInterval(poll);
                } else if (elapsed >= maxWait) {
                    clearInterval(poll);
                    reject(new Error('Tabulator library not available'));
                }
            }, pollInterval);
        });
    }

    return tabulatorReadyPromise;
}

export function createTable(element, columns = [], data = [], options = {}) {
    const target = typeof element === 'string' ? document.getElementById(element) : element;
    if (!target) {
        throw new Error('Table target element not found');
    }
    if (!window.Tabulator) {
        throw new Error('Tabulator library not loaded');
    }
    if (target?.tabulator) {
        target.tabulator.destroy();
    }

    const normalizedColumns = columns.map((column, index) => {
        if (index === 0 && column.frozen === undefined) {
            return { ...column, frozen: true };
        }
        return { ...column };
    });

    const table = new window.Tabulator(target, {
        ...DEFAULT_OPTIONS,
        ...options,
        columns: normalizedColumns,
        data
    });
    target.tabulator = table;
    return table;
}

export const tableFormatters = {
    date(cell) {
        const value = cell.getValue();
        return value ? formatDate(value) : '';
    },
    status(cell) {
        return createStatusPill(cell.getValue());
    },
    number(decimals = 0) {
        return (cell) => {
            const value = cell.getValue();
            if (value === null || value === undefined || Number.isNaN(Number(value))) return '0';
            return Number(value).toLocaleString(undefined, {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            });
        };
    },
    actions(actions = []) {
        return function formatter(cell) {
            const rowData = cell.getData();
            const buttons = actions
                .filter((action) => !action.hidden || !action.hidden(rowData))
                .map((action) => {
                    const label = action.label || '';
                    const icon = action.icon ? `<i class="${action.icon}" aria-hidden="true"></i>` : '';
                    const labelHtml = label ? `<span>${label}</span>` : '';
                    const classes = ['btn', 'btn-compact', action.variant || 'btn-outline-ghost'];
                    if (action.className) {
                        classes.push(action.className);
                    }
                    return `<button type="button" class="${classes.join(' ')} action-btn" data-action="${action.name}">${icon}${labelHtml}</button>`;
                })
                .join('');
            return `<div class="d-flex flex-wrap gap-1 table-action-buttons">${buttons}</div>`;
        };
    }
};

export function bindTableActions(table, actionHandlers = {}) {
    table.on('cellClick', (e, cell) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        const action = target.dataset.action;
        if (typeof actionHandlers[action] === 'function') {
            actionHandlers[action](cell.getRow().getData(), cell.getRow());
        }
    });
}

export function exportTableToExcel(table, filename) {
    if (!table) return;
    table.download('xlsx', `${filename}.xlsx`, { sheetName: 'Sheet1' });
}

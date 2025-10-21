import { THEME } from './config.js';
import { formatMonth } from './utils.js';

const DEFAULT_FONT_DARK = {
    family: 'Inter, Segoe UI, sans-serif',
    size: 12,
    color: '#ffffff'
};

const DEFAULT_FONT_LIGHT = {
    family: 'Inter, Segoe UI, sans-serif',
    size: 12,
    color: '#1f2937'
};

let chartDefaultsApplied = false;
let chartDefaultsRetryHandle = null;

function getChartColorConfig(isDarkMode) {
    return {
        textColor: isDarkMode ? '#ffffff' : '#1f2937',
        legendColor: isDarkMode ? '#ffffff' : '#1f2937',
        tooltipBg: isDarkMode ? 'rgba(15,23,42,0.9)' : 'rgba(243,244,246,0.95)',
        tooltipTitle: isDarkMode ? '#ffffff' : '#1f2937',
        tooltipBody: isDarkMode ? '#ffffff' : '#1f2937',
        gridLinear: isDarkMode ? 'rgba(148,163,184,0.2)' : 'rgba(209,213,219,0.5)',
        gridCategory: isDarkMode ? 'rgba(148,163,184,0.12)' : 'rgba(209,213,219,0.3)'
    };
}

export function applyChartDefaults() {
    if (!window.Chart || !window.Chart.defaults) {
        if (!chartDefaultsRetryHandle) {
            chartDefaultsRetryHandle = setTimeout(() => {
                chartDefaultsRetryHandle = null;
                applyChartDefaults();
            }, 100);
        }
        return;
    }

    const defaults = window.Chart.defaults;

    // Detect current theme - check data-theme on body
    // Light mode: body.dataset.theme = 'light'
    // Dark mode: body.dataset.theme is undefined/deleted
    const bodyTheme = document.body.getAttribute('data-theme');
    const isDarkMode = bodyTheme !== 'light';

    const colors = getChartColorConfig(isDarkMode);
    const fontConfig = isDarkMode ? DEFAULT_FONT_DARK : DEFAULT_FONT_LIGHT;

    defaults.color = colors.textColor;
    defaults.font.family = fontConfig.family;
    defaults.font.size = fontConfig.size;
    defaults.font.weight = '600';

    defaults.plugins = defaults.plugins || {};
    defaults.plugins.legend = defaults.plugins.legend || { labels: {} };
    defaults.plugins.legend.labels = defaults.plugins.legend.labels || {};
    defaults.plugins.legend.labels.color = colors.legendColor;
    defaults.plugins.legend.labels.font = { weight: '600' };

    defaults.plugins.tooltip = defaults.plugins.tooltip || {};
    defaults.plugins.tooltip.backgroundColor = colors.tooltipBg;
    defaults.plugins.tooltip.titleColor = colors.tooltipTitle;
    defaults.plugins.tooltip.bodyColor = colors.tooltipBody;
    defaults.plugins.tooltip.titleFont = { weight: '600' };
    defaults.plugins.tooltip.bodyFont = { weight: '500' };

    defaults.scales = defaults.scales || {};
    defaults.scales.linear = defaults.scales.linear || { grid: {} };
    defaults.scales.linear.grid = defaults.scales.linear.grid || {};
    defaults.scales.linear.grid.color = colors.gridLinear;
    defaults.scales.linear.ticks = defaults.scales.linear.ticks || {};
    defaults.scales.linear.ticks.color = colors.textColor;
    defaults.scales.linear.ticks.font = { weight: '600' };

    defaults.scales.category = defaults.scales.category || { grid: {} };
    defaults.scales.category.grid = defaults.scales.category.grid || {};
    defaults.scales.category.grid.color = colors.gridCategory;
    defaults.scales.category.ticks = defaults.scales.category.ticks || {};
    defaults.scales.category.ticks.color = colors.textColor;
    defaults.scales.category.ticks.font = { weight: '600' };

    chartDefaultsApplied = true;
}

export function resetChartDefaults() {
    chartDefaultsApplied = false;
    applyChartDefaults();

    // Re-render dashboard charts after theme change
    // Dispatch custom event that dashboard pages can listen to
    window.dispatchEvent(new CustomEvent('themeChanged'));
}

export function createChart(canvas, config) {
    if (!window.Chart) {
        throw new Error('Chart.js library not loaded');
    }
    const ctx = typeof canvas === 'string' ? document.getElementById(canvas) : canvas;
    if (!ctx) return null;
    return new window.Chart(ctx, config);
}

export function destroyChart(chart) {
    if (chart && typeof chart.destroy === 'function') {
        chart.destroy();
    }
}

export function buildLineChart(canvas, { labels = [], datasets = [], options = {} }) {
    // Add 3D-like shadow effect to datasets
    const enhancedDatasets = datasets.map(dataset => ({
        ...dataset,
        borderWidth: 3,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: dataset.borderColor,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointHoverBorderWidth: 3,
        shadowOffsetX: 3,
        shadowOffsetY: 3,
        shadowBlur: 10,
        shadowColor: 'rgba(0, 0, 0, 0.3)'
    }));

    return createChart(canvas, {
        type: 'line',
        data: { labels, datasets: enhancedDatasets },
        options: {
            maintainAspectRatio: false,
            tension: 0.4,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                }
            },
            ...options
        }
    });
}

export function buildBarChart(canvas, { labels = [], datasets = [], stacked = false, options = {} }) {
    // Add rounded corners for non-stacked bars only
    const enhancedDatasets = datasets.map(dataset => ({
        ...dataset,
        borderRadius: stacked ? 0 : {
            topLeft: 6,
            topRight: 6,
            bottomLeft: 0,
            bottomRight: 0
        },
        borderSkipped: false,
        borderWidth: 0
    }));

    return createChart(canvas, {
        type: 'bar',
        data: { labels, datasets: enhancedDatasets },
        options: {
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        usePointStyle: true,
                        pointStyle: 'rectRounded'
                    }
                }
            },
            scales: {
                x: {
                    stacked,
                    grid: {
                        display: false
                    }
                },
                y: {
                    stacked,
                    beginAtZero: true,
                    grid: {
                        drawBorder: false
                    }
                }
            },
            ...options
        }
    });
}

export function buildDoughnutChart(canvas, { labels = [], data = [], backgroundColor = [], options = {} }) {
    return createChart(canvas, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [
                {
                    data,
                    backgroundColor: backgroundColor.length ? backgroundColor : gradientPalette(data.length),
                    borderWidth: 0,
                    spacing: 1,
                    hoverOffset: 8,
                    offset: 2
                }
            ]
        },
        options: {
            maintainAspectRatio: false,
            cutout: '60%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                }
            },
            ...options
        }
    });
}

export function buildPieChart(canvas, { labels = [], data = [], backgroundColor = [], options = {} }) {
    return createChart(canvas, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [
                {
                    data,
                    backgroundColor: backgroundColor.length ? backgroundColor : gradientPalette(data.length),
                    borderWidth: 0,
                    spacing: 1,
                    hoverOffset: 8,
                    offset: 2
                }
            ]
        },
        options: {
            maintainAspectRatio: false,
            cutout: '0%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                }
            },
            ...options
        }
    });
}

export function gradientPalette(length) {
    if (!length) return [];
    const start = hexToRgb(THEME.primaryGradient[0]);
    const end = hexToRgb(THEME.primaryGradient[1]);
    const palette = [];
    for (let index = 0; index < length; index += 1) {
        const ratio = length === 1 ? 0.5 : index / (length - 1);
        const r = Math.round(start.r + (end.r - start.r) * ratio);
        const g = Math.round(start.g + (end.g - start.g) * ratio);
        const b = Math.round(start.b + (end.b - start.b) * ratio);
        palette.push(`rgba(${r}, ${g}, ${b}, 0.85)`);
    }
    return palette;
}

function hexToRgb(hex) {
    const value = hex.replace('#', '');
    const bigint = parseInt(value, 16);
    return {
        r: (bigint >> 16) & 255,
        g: (bigint >> 8) & 255,
        b: bigint & 255
    };
}

export function buildMonthlyLabels(monthCount = 12) {
    const labels = [];
    const current = new Date();
    current.setMonth(current.getMonth() - (monthCount - 1));
    for (let index = 0; index < monthCount; index += 1) {
        labels.push(formatMonth(new Date(current)));
        current.setMonth(current.getMonth() + 1);
    }
    return labels;
}

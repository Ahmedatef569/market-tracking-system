const DEFAULT_CONFIG = {
    modalId: 'modalEntityForm',
    titleSelector: '#modalEntityFormTitle',
    bodySelector: '#modalEntityFormBody',
    hostSelector: '.modal-form-host[data-form-id]',
    triggerSelector: '[data-open-form]'
};

let config = { ...DEFAULT_CONFIG };
let modalEl = null;
let modalInstance = null;
let modalTitleEl = null;
let modalBodyEl = null;
let initialized = false;
const formHosts = new Map();

function registerHosts() {
    if (!initialized) return;
    formHosts.clear();
    document.querySelectorAll(config.hostSelector).forEach((host) => {
        const formId = host.dataset.formId;
        if (!formId) return;

        const selector = `#${formId}`;
        const formEl = document.getElementById(formId);
        if (!formEl) return;

        const parent = formEl.parentElement;
        const sibling = formEl.nextSibling;
        formHosts.set(selector, { host, form: formEl, parent, sibling });
        host.style.display = 'none';
    });
}

function handleTriggerClick(event) {
    if (!initialized) return;
    const trigger = event.target.closest(config.triggerSelector);
    if (!trigger) return;
    event.preventDefault();
    const selector = trigger.dataset.openForm;
    if (!selector) return;
    const title = trigger.dataset.formTitle || 'Add';
    const mode = trigger.dataset.formMode || 'create';
    const focusSelector = trigger.dataset.focusTarget || '';
    openFormModal(selector, { title, mode, focusSelector });
}

function handleModalHidden() {
    if (!modalEl) return;
    const selector = modalEl.getAttribute('data-current-form');
    if (!selector) return;
    const entry = formHosts.get(selector);
    if (!entry || !entry.form) {
        modalEl.setAttribute('data-current-form', '');
        if (modalBodyEl) modalBodyEl.innerHTML = '';
        return;
    }

    const mode = entry.form.dataset.formMode || 'create';
    entry.form.dispatchEvent(new CustomEvent('mts:form-close', { detail: { mode } }));

    if (entry.parent) {
        if (entry.sibling && entry.sibling.parentNode === entry.parent) {
            entry.parent.insertBefore(entry.form, entry.sibling);
        } else {
            entry.parent.appendChild(entry.form);
        }
        entry.sibling = entry.form.nextSibling;
    }
    entry.host.style.display = 'none';
    delete entry.form.dataset.formMode;

    if (modalBodyEl) modalBodyEl.innerHTML = '';
    modalEl.setAttribute('data-current-form', '');
}

export function initFormModal(options = {}) {
    config = { ...DEFAULT_CONFIG, ...options };

    modalEl = document.getElementById(config.modalId);
    if (!modalEl || !window.bootstrap) return null;

    modalTitleEl = modalEl.querySelector(config.titleSelector);
    modalBodyEl = modalEl.querySelector(config.bodySelector);
    if (!modalBodyEl) throw new Error('Modal body element not found');

    if (!initialized) {
        modalInstance = new window.bootstrap.Modal(modalEl);
        modalEl.addEventListener('hidden.bs.modal', handleModalHidden);
        document.addEventListener('click', handleTriggerClick);
        initialized = true;
    }

    registerHosts();
    return modalInstance;
}

export function refreshFormHosts() {
    if (!initialized) return;
    registerHosts();
}

export function openFormModal(selector, options = {}) {
    if (!initialized || !modalInstance || !modalBodyEl) return null;
    const { title = 'Add', mode = 'create', focusSelector = '' } = options;
    const entry = formHosts.get(selector);
    if (!entry || !entry.form) return null;

    const currentSelector = modalEl?.getAttribute('data-current-form');
    if (currentSelector && currentSelector !== selector) {
        const currentEntry = formHosts.get(currentSelector);
        if (currentEntry && currentEntry.form) {
            const currentMode = currentEntry.form.dataset.formMode || 'create';
            currentEntry.form.dispatchEvent(new CustomEvent('mts:form-close', { detail: { mode: currentMode } }));
            if (currentEntry.parent) {
                if (currentEntry.sibling && currentEntry.sibling.parentNode === currentEntry.parent) {
                    currentEntry.parent.insertBefore(currentEntry.form, currentEntry.sibling);
                } else {
                    currentEntry.parent.appendChild(currentEntry.form);
                }
                currentEntry.sibling = currentEntry.form.nextSibling;
            }
            currentEntry.host.style.display = 'none';
            delete currentEntry.form.dataset.formMode;
        }
    }

    if (modalTitleEl) modalTitleEl.textContent = title;
    modalBodyEl.innerHTML = '';
    modalBodyEl.appendChild(entry.form);
    if (modalEl) modalEl.setAttribute('data-current-form', selector);
    entry.form.dataset.formMode = mode;
    entry.form.dispatchEvent(new CustomEvent('mts:form-open', { detail: { mode } }));
    modalInstance.show();

    if (focusSelector) {
        requestAnimationFrame(() => {
            entry.form.querySelector(focusSelector)?.focus();
        });
    }

    return entry.form;
}

export function isFormModalInitialized() {
    return initialized;
}

export function closeFormModal() {
    if (!initialized || !modalInstance) return;
    modalInstance.hide();
}

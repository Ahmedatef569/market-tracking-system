const DEFAULT_CHECK_INTERVAL_MS = 2 * 60 * 1000;
const UPDATE_LOCK_KEY = 'mts-auto-update-lock';

function buildNoStoreUrl(path) {
    const separator = path.includes('?') ? '&' : '?';
    return `${path}${separator}__ts=${Date.now()}`;
}

function buildVersionToken(response) {
    const etag = response.headers.get('etag');
    if (etag) return `etag:${etag}`;

    const lastModified = response.headers.get('last-modified');
    if (lastModified) return `lm:${lastModified}`;

    const contentLength = response.headers.get('content-length');
    if (contentLength) return `len:${contentLength}`;

    return null;
}

function shouldSkipCheck() {
    if (document.hidden) return true;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    return false;
}

export function initAutoVersionCheck(options = {}) {
    const {
        resourcePath,
        checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
        storageKey = `mts-version-token:${resourcePath || 'app'}`
    } = options;

    if (!resourcePath) return;

    let timer = null;
    let isChecking = false;

    const checkForUpdate = async () => {
        if (isChecking || shouldSkipCheck()) return;
        isChecking = true;

        try {
            const response = await fetch(buildNoStoreUrl(resourcePath), {
                method: 'GET',
                cache: 'no-store',
                credentials: 'same-origin'
            });

            if (!response.ok) return;

            const currentToken = buildVersionToken(response);
            if (!currentToken) return;

            const previousToken = localStorage.getItem(storageKey);
            if (!previousToken) {
                localStorage.setItem(storageKey, currentToken);
                return;
            }

            if (previousToken !== currentToken) {
                localStorage.setItem(storageKey, currentToken);

                if (sessionStorage.getItem(UPDATE_LOCK_KEY) === '1') return;
                sessionStorage.setItem(UPDATE_LOCK_KEY, '1');

                const separator = window.location.search ? '&' : '?';
                const updatedUrl = `${window.location.pathname}${window.location.search}${separator}updated=${Date.now()}${window.location.hash}`;
                window.location.replace(updatedUrl);
            }
        } catch (_error) {
            // Silent by design: update checks should never break the app.
        } finally {
            isChecking = false;
        }
    };

    checkForUpdate();

    timer = window.setInterval(checkForUpdate, Math.max(15000, Number(checkIntervalMs) || DEFAULT_CHECK_INTERVAL_MS));

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            checkForUpdate();
        }
    });

    window.addEventListener('online', checkForUpdate);

    window.addEventListener('beforeunload', () => {
        if (timer) {
            window.clearInterval(timer);
            timer = null;
        }
    });
}


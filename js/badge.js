/**
 * Badge API utilities for app icon badge notifications
 * Displays unread notification count on the app icon (mobile/desktop)
 */

let serviceWorkerRegistration = null;

/**
 * Initialize badge support by registering service worker
 */
export async function initBadgeSupport() {
    if ('serviceWorker' in navigator) {
        try {
            serviceWorkerRegistration = await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker registered for badge support');
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }
}

/**
 * Update the app icon badge with notification count
 * @param {number} count - Number of unread notifications
 */
export async function updateBadge(count) {
    const badgeCount = Math.max(0, count || 0);
    
    // Method 1: Direct Badge API (works on some browsers)
    if ('setAppBadge' in navigator) {
        try {
            if (badgeCount > 0) {
                await navigator.setAppBadge(badgeCount);
            } else {
                await navigator.clearAppBadge();
            }
            return;
        } catch (error) {
            console.warn('Badge API failed, trying service worker method:', error);
        }
    }
    
    // Method 2: Via Service Worker message
    if (serviceWorkerRegistration && serviceWorkerRegistration.active) {
        serviceWorkerRegistration.active.postMessage({
            type: 'UPDATE_BADGE',
            count: badgeCount
        });
    }
}

/**
 * Clear the app icon badge
 */
export async function clearBadge() {
    // Method 1: Direct Badge API
    if ('clearAppBadge' in navigator) {
        try {
            await navigator.clearAppBadge();
            return;
        } catch (error) {
            console.warn('Clear badge API failed:', error);
        }
    }
    
    // Method 2: Via Service Worker message
    if (serviceWorkerRegistration && serviceWorkerRegistration.active) {
        serviceWorkerRegistration.active.postMessage({
            type: 'CLEAR_BADGE'
        });
    }
}

/**
 * Check if Badge API is supported
 * @returns {boolean}
 */
export function isBadgeSupported() {
    return 'setAppBadge' in navigator || 'clearAppBadge' in navigator;
}


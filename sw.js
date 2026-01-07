// Service Worker for Market Tracking System
// Handles caching and badge notifications

const CACHE_NAME = 'mts-cache-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/admin.html',
    '/employee.html',
    '/manager.html',
    '/css/app.css',
    '/manifest.webmanifest',
    '/assets/main_192.png',
    '/assets/main_512.png'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});

// Message event - handle badge updates
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'UPDATE_BADGE') {
        const count = event.data.count || 0;
        
        // Set badge count (supported on Android Chrome, Edge, etc.)
        if ('setAppBadge' in navigator) {
            if (count > 0) {
                navigator.setAppBadge(count);
            } else {
                navigator.clearAppBadge();
            }
        }
    }
    
    if (event.data && event.data.type === 'CLEAR_BADGE') {
        if ('clearAppBadge' in navigator) {
            navigator.clearAppBadge();
        }
    }
});


// PrintKurox Service Worker for PWA and Web Share Target
const CACHE_NAME = 'printkurox-pwa-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Normal network passthrough
});

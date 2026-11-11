const CACHE_NAME = 'stm32-pwa_' + '20261111_0015'; 

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './relay_control.js',
    './sun_calendar.js',
    //'./chart.umd.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

// Установка нового Service Worker и кэширование всех локальных ресурсов
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    // Принудительно активируем новый SW сразу, не дожидаясь закрытия всех вкладок
    self.skipWaiting();
});

// Активация и полное удаление устаревших версий кэша (например, stm32-pwa-v1)
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            );
        })
    );
    // Берём контроль над открытыми страницами немедленно
    self.clients.claim();
});

// Стратегия Network-First для HTML/JS/CSS с фолбэком в кэш для мгновенной работы офлайн
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // Если интернет есть и файл успешно скачан — обновляем его копию в кэше
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // Если интернета нет (офлайн-режим) — мгновенно отдаём из кэша
                return caches.match(event.request);
            })
    );
});


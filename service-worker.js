"use strict";

const CACHE_NAME = "panelpro-shell-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/panelpro.svg",
  "./icons/panelpro-180.png",
  "./icons/panelpro-192.png",
  "./icons/panelpro-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith("panelpro-") && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      if (request.mode === "navigate") {
        try {
          const response = await fetch(request);
          if (response.ok) await cache.put("./index.html", response.clone());
          return response;
        } catch (error) {
          const cachedPage = await cache.match("./index.html");
          if (cachedPage) return cachedPage;
          throw error;
        }
      }

      const cachedResponse = await cache.match(request);
      return cachedResponse || fetch(request);
    })
  );
});

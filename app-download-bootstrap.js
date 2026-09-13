// Registers desktop download/update routes before Express fallback/error
// middleware can answer the request. This preload is intentionally small and
// only hooks Express' own listen lifecycle so the routes are guaranteed to be
// installed on the actual application instance used by Render.
const express = require('express');

function moveRoutesToFront(app) {
  const stack = app && app._router && Array.isArray(app._router.stack) ? app._router.stack : null;
  if (!stack) return;

  const protectedPaths = new Set([
    '/api/app-download',
    '/api/app-update',
    '/api/apps/download/windows',
    '/api/apps/download/macos'
  ]);

  const routes = [];
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const layer = stack[i];
    if (layer && layer.route && protectedPaths.has(layer.route.path)) {
      routes.push(stack.splice(i, 1)[0]);
    }
  }

  for (let i = routes.length - 1; i >= 0; i -= 1) {
    stack.unshift(routes[i]);
  }
}

if (!express.application.__bithashDownloadBootstrap) {
  Object.defineProperty(express.application, '__bithashDownloadBootstrap', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const originalListen = express.application.listen;

  express.application.listen = function bithashListen(...args) {
    if (!this.__bithashRoutesInstalled) {
      try {
        require('./app-download').installAppDownloadRoute(this);
        require('./app-update').installAppUpdateRoute(this);
        moveRoutesToFront(this);
        Object.defineProperty(this, '__bithashRoutesInstalled', {
          value: true,
          configurable: false,
          enumerable: false,
          writable: false
        });
        console.log('✓ BitHash desktop download/update routes installed before listen');
      } catch (error) {
        // Fail closed for the optional update/download helpers without
        // preventing the main API from starting. Errors are visible in Render.
        console.error('[BitHash] Desktop route bootstrap failed:', error);
      }
    }

    return originalListen.apply(this, args);
  };
}

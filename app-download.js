const express = require('express');

const FILES = Object.freeze({
  'BitHash-Capital-windows.exe': 'application/vnd.microsoft.portable-executable',
  'BitHash-Capital-macos.dmg': 'application/x-apple-disk-image'
});

// Desktop installers are published as public release assets by the frontend
// repository's desktop-build workflow. Render must only redirect to the asset;
// it must never proxy/stream a 100+ MB installer itself.
const PUBLIC_DOWNLOAD_BASE_URL = String(
  process.env.PUBLIC_DOWNLOAD_BASE_URL ||
  'https://github.com/mekitariansalinacoria8-lgtm/Bithhash/releases/download/desktop-latest'
).replace(/\/+$/, '');

function publicAssetUrl(file) {
  return `${PUBLIC_DOWNLOAD_BASE_URL}/${encodeURIComponent(file)}`;
}

function handleDownload(req, res, forcedFile = null) {
  try {
    const requestedFile = forcedFile || (typeof req.query?.file === 'string' ? req.query.file : '');
    const contentType = FILES[requestedFile];

    if (!contentType) {
      return res.status(404).json({ error: 'Download not found' });
    }

    // Do not gate the binary by User-Agent. The URL already identifies the
    // requested installer, and browser privacy features, proxies, Electron,
    // Safari and CDN rewrites can legitimately omit or change platform hints.
    // Platform-specific visibility is handled by the frontend UI instead.
    const location = publicAssetUrl(requestedFile);

    res.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-BitHash-Download': 'public-release',
      'Content-Type': contentType,
      Location: location
    });

    return res.status(302).end();
  } catch (error) {
    console.error('[BitHash] App download request failed:', error);
    return res.status(500).json({
      error: 'Unable to prepare download',
      code: 'DESKTOP_DOWNLOAD_REDIRECT_FAILED'
    });
  }
}

function installAppDownloadRoute(app) {
  if (!app || typeof app.get !== 'function') return false;
  if (app.__bithashAppDownloadRouteInstalled) return true;

  Object.defineProperty(app, '__bithashAppDownloadRouteInstalled', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  app.get('/api/app-download', (req, res) => handleDownload(req, res));
  app.head('/api/app-download', (req, res) => handleDownload(req, res));

  app.get('/api/apps/download/windows', (req, res) => {
    handleDownload(req, res, 'BitHash-Capital-windows.exe');
  });
  app.head('/api/apps/download/windows', (req, res) => {
    handleDownload(req, res, 'BitHash-Capital-windows.exe');
  });

  app.get('/api/apps/download/macos', (req, res) => {
    handleDownload(req, res, 'BitHash-Capital-macos.dmg');
  });
  app.head('/api/apps/download/macos', (req, res) => {
    handleDownload(req, res, 'BitHash-Capital-macos.dmg');
  });

  console.log('[BitHash] Desktop download routes installed');
  return true;
}

// Keep compatibility with the existing bootstrap architecture while avoiding
// duplicate route registration.
if (!express.application.__bithashDownloadAutoinstallPatched) {
  Object.defineProperty(express.application, '__bithashDownloadAutoinstallPatched', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const originalApplicationUse = express.application.use;
  express.application.use = function bithashPatchedUse(...args) {
    const result = originalApplicationUse.apply(this, args);
    try {
      installAppDownloadRoute(this);
    } catch (error) {
      console.error('[BitHash] Failed to install app download routes:', error);
    }
    return result;
  };
}

module.exports = { installAppDownloadRoute };
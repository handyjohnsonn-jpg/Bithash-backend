const express = require('express');

const FILES = Object.freeze({
  'BitHash-Capital-windows.exe': 'application/vnd.microsoft.portable-executable',
  'BitHash-Capital-macos.dmg': 'application/x-apple-disk-image'
});

// The frontend CI publishes these files as public release/media assets. Set
// PUBLIC_DOWNLOAD_BASE_URL in Render when a different public asset origin is used.
const PUBLIC_DOWNLOAD_BASE_URL = String(
  process.env.PUBLIC_DOWNLOAD_BASE_URL ||
  'https://github.com/mekitariansalinacoria8-lgtm/Bithhash/releases/download/desktop-latest'
).replace(/\/+$/, '');

function detectPlatform(req) {
  const userAgent = String(req?.get?.('user-agent') || req?.headers?.['user-agent'] || '');
  const clientPlatform = String(
    req?.get?.('sec-ch-ua-platform') || req?.headers?.['sec-ch-ua-platform'] || ''
  ).replace(/[\"]/g, '');
  const value = `${userAgent} ${clientPlatform}`;

  if (/Windows NT|Windows Phone/i.test(value)) return 'windows';
  if (/iPhone|iPad|iPod/i.test(value)) return 'ios';
  if (/Android/i.test(value)) return 'android';
  if (/Macintosh|Mac OS X/i.test(value)) return 'macos';
  return 'other';
}

function requiredPlatformForFile(file) {
  if (file === 'BitHash-Capital-windows.exe') return 'windows';
  if (file === 'BitHash-Capital-macos.dmg') return 'macos';
  return null;
}

function platformRequirements(platform) {
  if (platform === 'windows') {
    return 'Windows 10 (64-bit) or Windows 11 (64-bit). Windows on ARM requires Windows 10 version 1903 or later.';
  }
  if (platform === 'macos') {
    return 'macOS 13 Ventura or later. Universal Intel + Apple silicon build.';
  }
  return '';
}

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

    const requiredPlatform = requiredPlatformForFile(requestedFile);
    const clientPlatform = detectPlatform(req);

    if (requiredPlatform && clientPlatform !== requiredPlatform) {
      return res.status(403).json({
        error: 'This native download is only available for the matching device platform.',
        requestedFile,
        detectedPlatform: clientPlatform,
        requiredPlatform,
        requirements: platformRequirements(requiredPlatform)
      });
    }

    const location = publicAssetUrl(requestedFile);

    // Do not fetch the installer through Render. Render only redirects the
    // browser to the public artifact, preventing R2 credentials or large-file
    // streaming from causing a server error.
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

  // Mark before registering so Express bootstrap hooks cannot register the
  // same routes twice.
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

// server.js has historically imported this module without explicitly calling
// installAppDownloadRoute(). Keep automatic installation for deployments that
// create an Express app and call app.use(), while app-download-bootstrap.js can
// still install the routes explicitly before fallback/error middleware.
if (!express.application.__bithashDownloadAutoinstallPatched) {
  const originalApplicationUse = express.application.use;

  Object.defineProperty(express.application, '__bithashDownloadAutoinstallPatched', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

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
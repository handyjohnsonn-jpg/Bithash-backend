const express = require('express');

// server.js imports this module but does not explicitly call installAppDownloadRoute(app).
// Install the routes automatically after the first middleware is registered so the
// endpoints work even when Render starts the service with `node server.js`.
const originalApplicationUse = express.application.use;
if (!express.application.__bithashDownloadAutoinstallPatched) {
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

const FILES = Object.freeze({
  'BitHash-Capital-windows.exe': 'application/vnd.microsoft.portable-executable',
  'BitHash-Capital-macos.dmg': 'application/x-apple-disk-image'
});

const GITHUB_RELEASE_BASE_URL = String(
  process.env.PUBLIC_DOWNLOAD_BASE_URL ||
  'https://github.com/mekitariansalinacoria8-lgtm/Bithhash/releases/download/desktop-latest'
).replace(/\/+$/, '');

function detectPlatform(req) {
  const headers = req?.headers || {};
  const userAgent = String(headers['user-agent'] || headers['User-Agent'] || '');
  const clientHints = String(headers['sec-ch-ua-platform'] || headers['Sec-CH-UA-Platform'] || '').replace(/[\"]/g, '');
  const value = `${userAgent} ${clientHints}`;
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
  if (platform === 'windows') return 'Windows 10 (64-bit) or Windows 11 (64-bit). Windows on ARM requires Windows 10 version 1903 or later.';
  if (platform === 'macos') return 'macOS 13 Ventura or later. Universal Intel + Apple silicon build.';
  return '';
}

function installAppDownloadRoute(app) {
  if (!app || app.__bithashAppDownloadRouteInstalled) return;
  app.__bithashAppDownloadRouteInstalled = true;

  function handleDownload(req, res, forcedFile = null) {
    try {
      const file = forcedFile || (typeof req.query?.file === 'string' ? req.query.file : '');
      const contentType = FILES[file];
      if (!contentType) return res.status(404).json({ error: 'Download not found' });

      const requiredPlatform = requiredPlatformForFile(file);
      const clientPlatform = detectPlatform(req);
      if (requiredPlatform && clientPlatform !== requiredPlatform) {
        return res.status(403).json({
          error: 'This native download is only available for the matching device platform.',
          requestedFile: file,
          detectedPlatform: clientPlatform,
          requiredPlatform,
          requirements: platformRequirements(requiredPlatform)
        });
      }

      // Desktop installers are published as public GitHub release assets by CI.
      // This removes the Render/R2 credential dependency from the download path.
      const publicUrl = `${GITHUB_RELEASE_BASE_URL}/${encodeURIComponent(file)}`;
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-BitHash-Download', 'github-release');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Location', publicUrl);
      return res.status(302).end();
    } catch (error) {
      console.error('[BitHash] App download request failed:', error);
      return res.status(500).json({ error: 'Unable to prepare download' });
    }
  }

  app.get('/api/app-download', (req, res) => handleDownload(req, res));
  app.head('/api/app-download', (req, res) => handleDownload(req, res));
  app.get('/api/apps/download/windows', (req, res) => handleDownload(req, res, 'BitHash-Capital-windows.exe'));
  app.head('/api/apps/download/windows', (req, res) => handleDownload(req, res, 'BitHash-Capital-windows.exe'));
  app.get('/api/apps/download/macos', (req, res) => handleDownload(req, res, 'BitHash-Capital-macos.dmg'));
  app.head('/api/apps/download/macos', (req, res) => handleDownload(req, res, 'BitHash-Capital-macos.dmg'));
}

module.exports = { installAppDownloadRoute };
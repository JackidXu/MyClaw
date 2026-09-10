'use strict';

/**
 * electron-builder custom Windows code-signing hook.
 *
 * Uploads each binary produced by the build (app exe, uninstaller, installer)
 * to the internal Youdao signing service and replaces the local file with the
 * signed result. This closes the "signed installer shell, unsigned payload"
 * gap: security software freezes the unsigned LobsterAI.exe on first
 * execution, which is what hung installations in the field.
 *
 * Service API (per the official signing-service doc):
 *   POST /api/sign
 *     headers: x-app-key, x-app-secret, x-username
 *     body:    multipart, files=<binary> (application/octet-stream)
 *     ->       {results: [{originalName, downloadUrl, ...}]}
 *   GET <downloadUrl>   same auth headers, returns the signed file
 *
 * NEVER call the service's /api/cleanup from automation: it deletes every
 * file on the shared server, including other teams' in-flight jobs.
 *
 * Credentials (process env wins; missing keys are filled from the repo-root
 * .env file, same convention as the Apple notarization credentials). The
 * service URL is internal infrastructure and is deliberately NOT hardcoded
 * here -- ask the signing service team for all four values:
 *   YD_SIGN_SERVICE_URL   signing service base URL
 *   YD_SIGN_APP_KEY       service app key
 *   YD_SIGN_APP_SECRET    service app secret
 *   YD_SIGN_USERNAME      requesting user (shown in the service's audit log)
 *
 * Missing values -> the hook logs one warning and skips, so local dev
 * packaging keeps producing (unsigned) artifacts. See .env.example.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { execSync } = require('child_process');

const SERVICE_URL_ENV = 'YD_SIGN_SERVICE_URL';
const APP_KEY_ENV = 'YD_SIGN_APP_KEY';
const APP_SECRET_ENV = 'YD_SIGN_APP_SECRET';
const USERNAME_ENV = 'YD_SIGN_USERNAME';
const CERT_SHA1_ENV = 'WIN_SIGN_CERT_SHA1';
const TIMESTAMP_URL_ENV = 'WIN_SIGN_TIMESTAMP_URL';
const DEFAULT_TIMESTAMP_URL = 'http://time.certum.pl';

const REQUEST_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 2;

let warnedAboutMissingCredentials = false;
const signedThisRun = new Set();

/**
 * Minimal dependency-free .env loader (KEY=VALUE lines, # comments,
 * optional surrounding quotes). Existing process.env values always win,
 * matching dotenv semantics. Values are never logged.
 */
function loadDotEnv(envPath = path.join(__dirname, '..', '.env')) {
  let content;
  try {
    content = fs.readFileSync(envPath, 'utf8');
  } catch {
    return;
  }
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

/**
 * Read the PE Attribute Certificate Table (data directory #4) entry.
 * Returns {offset, size} when the file carries an Authenticode signature,
 * null when it is a valid PE without one. Throws for non-PE files.
 */
function readPeCertTable(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const header = Buffer.alloc(4096);
    const bytesRead = fs.readSync(fd, header, 0, header.length, 0);
    if (bytesRead < 0x40 || header.toString('latin1', 0, 2) !== 'MZ') {
      throw new Error(`${filePath} is not a PE file (missing MZ header)`);
    }
    const eLfanew = header.readUInt32LE(0x3c);
    if (eLfanew + 24 > bytesRead || header.toString('latin1', eLfanew, eLfanew + 4) !== 'PE\0\0') {
      throw new Error(`${filePath} is not a PE file (missing PE signature)`);
    }
    const optOff = eLfanew + 4 + 20;
    const magic = header.readUInt16LE(optOff);
    let ddOff;
    if (magic === 0x10b) {
      ddOff = optOff + 96; // PE32
    } else if (magic === 0x20b) {
      ddOff = optOff + 112; // PE32+
    } else {
      throw new Error(`${filePath} has unknown optional header magic 0x${magic.toString(16)}`);
    }
    const certEntryOff = ddOff + 4 * 8;
    if (certEntryOff + 8 > bytesRead) {
      throw new Error(`${filePath} PE header is truncated`);
    }
    const offset = header.readUInt32LE(certEntryOff);
    const size = header.readUInt32LE(certEntryOff + 4);
    if (offset === 0 || size === 0) {
      return null;
    }
    return { offset, size };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * People paste whatever URL is at hand -- the doc's full /api/sign endpoint
 * or the manual upload page. Normalize all of them to the service root
 * (a raw endpoint would otherwise double up into /api/sign/api/sign).
 */
function normalizeServiceUrl(rawUrl) {
  return rawUrl
    .replace(/\/+$/, '')
    .replace(/\/sign\.html$/i, '')
    .replace(/\/api\/sign$/i, '')
    .replace(/\/+$/, '');
}

function resolveServiceConfig() {
  const serviceUrl = (process.env.WIN_SIGN_SERVICE_URL || process.env[SERVICE_URL_ENV] || '').trim();
  const secret = (process.env.WIN_SIGN_SERVICE_SECRET || process.env[APP_KEY_ENV] || '').trim();
  if (!serviceUrl || !secret) {
    return null;
  }
  const baseUrl = normalizeServiceUrl(serviceUrl);
  return {
    baseUrl,
    headers: {
      'x-sign-secret': secret,
      'x-app-key': secret,
    },
  };
}

async function safeText(response) {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return '';
  }
}

async function fileToBlob(filePath) {
  if (typeof fs.openAsBlob === 'function') {
    return fs.openAsBlob(filePath, { type: 'application/octet-stream' });
  }
  return new Blob([await fs.promises.readFile(filePath)], { type: 'application/octet-stream' });
}

let aliOssModule = null;
function getOssClient() {
  const accessKeyId = (process.env.OSS_ACCESS_KEY_ID || '').trim();
  const accessKeySecret = (process.env.OSS_ACCESS_KEY_SECRET || '').trim();
  const endpoint = (process.env.OSS_ENDPOINT || '').trim();
  const bucket = (process.env.OSS_BUCKET || '').trim();

  if (!accessKeyId || !accessKeySecret || !bucket) {
    return null;
  }

  if (!aliOssModule) {
    try {
      aliOssModule = require('ali-oss');
    } catch {
      return null;
    }
  }

  return new aliOssModule({
    endpoint: endpoint || undefined,
    accessKeyId,
    accessKeySecret,
    bucket,
  });
}

async function signOnceViaOss(serviceConfig, filePath, ossClient) {
  const fileName = path.basename(filePath);
  const originalSize = fs.statSync(filePath).size;
  const tmpPath = `${filePath}.ydsign.tmp`;
  const ossPrefix = (process.env.WIN_SIGN_OSS_PREFIX || 'heyclaw-dev/win-sign').replace(/\/+$/, '');
  const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const ossKey = `${ossPrefix}/${uniqueId}_${fileName}`;

  console.log(`[WinSign] Uploading to OSS: ${ossKey} (${(originalSize / (1024 * 1024)).toFixed(1)} MB)...`);
  await ossClient.multipartUpload(ossKey, filePath, {
    parallel: 4,
    partSize: 10 * 1024 * 1024,
  });

  console.log(`[WinSign] Requesting sign from service via OSS: ${serviceConfig.baseUrl}/sign-oss`);
  const serviceUrl = (process.env.WIN_SIGN_SERVICE_URL || serviceConfig.baseUrl).replace(/\/+$/, '');
  const signSecret = (process.env.WIN_SIGN_SERVICE_SECRET || '').trim();

  const resp = await fetch(`${serviceUrl}/sign-oss`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sign-secret': signSecret,
    },
    body: JSON.stringify({ ossKey }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`[WinSign] /sign-oss failed: HTTP ${resp.status} - ${errText.slice(0, 300)}`);
  }

  const signResponse = await resp.json();


  const signedOssKey = signResponse.signedOssKey;
  if (!signedOssKey) {
    throw new Error(`[WinSign] service response missing signedOssKey: ${JSON.stringify(signResponse)}`);
  }


  console.log(`[WinSign] Downloading signed file from OSS: ${signedOssKey}...`);
  await ossClient.get(signedOssKey, tmpPath);


  const signedSize = fs.statSync(tmpPath).size;
  if (signedSize < originalSize) {
    fs.rmSync(tmpPath, { force: true });
    throw new Error(
      `[WinSign] signed file is smaller than original (${signedSize} < ${originalSize} bytes), refusing to replace ${fileName}`,
    );
  }

  try {
    const certTable = readPeCertTable(tmpPath);
    if (!certTable) {
      throw new Error(`[WinSign] service returned ${fileName} without an Authenticode signature`);
    }
    fs.copyFileSync(tmpPath, filePath);
    fs.rmSync(tmpPath, { force: true });
  } catch (error) {
    fs.rmSync(tmpPath, { force: true });
    throw error;
  }

}

async function signOnce(serviceConfig, filePath) {
  const ossClient = getOssClient();
  if (!ossClient) {
    throw new Error(
      '[WinSign] OSS configuration is missing (OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, OSS_BUCKET). '
      + 'Windows remote code signing requires OSS relay to prevent network timeouts.',
    );
  }
  return signOnceViaOss(serviceConfig, filePath, ossClient);
}



function resolveSigntoolPath() {
  // If explicitly configured in environment
  if (process.env.SIGNTOOL_PATH && fs.existsSync(process.env.SIGNTOOL_PATH)) {
    return process.env.SIGNTOOL_PATH;
  }

  // Check if signtool is directly available in PATH
  try {
    execSync('signtool /?', { stdio: 'ignore' });
    return 'signtool';
  } catch {}

  // Search standard Windows Kits directories on GitHub Actions and local machines
  const kitsRoot = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin';
  if (fs.existsSync(kitsRoot)) {
    try {
      const versions = fs.readdirSync(kitsRoot)
        .filter((v) => /^10\./.test(v))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

      for (const ver of versions) {
        const candidate = path.join(kitsRoot, ver, 'x64', 'signtool.exe');
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    } catch {}
  }

  // Fallback default
  return 'signtool';
}

async function signWithSigntool(filePath, certSha1) {
  const normalizedPath = path.resolve(filePath);
  if (signedThisRun.has(normalizedPath)) {
    return true;
  }
  if (readPeCertTable(normalizedPath)) {
    console.log(`[WinSign] ${path.basename(normalizedPath)} already carries a signature, skipping`);
    signedThisRun.add(normalizedPath);
    return false;
  }

  const signtoolExe = resolveSigntoolPath();
  const timestampUrl = (process.env[TIMESTAMP_URL_ENV] || DEFAULT_TIMESTAMP_URL).trim();
  const sizeMb = (fs.statSync(normalizedPath).size / (1024 * 1024)).toFixed(1);
  console.log(`[WinSign] signing ${path.basename(normalizedPath)} (${sizeMb} MB) via ${path.basename(signtoolExe)} (sha1: ${certSha1.slice(0, 8)}..., ts: ${timestampUrl})`);
  const t0 = Date.now();

  const cmd = `"${signtoolExe}" sign /v /fd sha256 /sha1 "${certSha1}" /tr "${timestampUrl}" /td sha256 "${normalizedPath}"`;

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      execSync(cmd, { stdio: 'inherit', timeout: 120000 });
      signedThisRun.add(normalizedPath);
      console.log(`[WinSign] signed ${path.basename(normalizedPath)} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      return true;
    } catch (error) {
      lastError = error;
      console.warn(`[WinSign] signtool attempt ${attempt}/${MAX_ATTEMPTS} failed for ${path.basename(normalizedPath)}:`, error.message);
    }
  }
  throw lastError;
}

/**
 * Sign one binary in place.
 * Priority:
 * 1. WIN_SIGN_CERT_SHA1 -> local signtool using Windows Certificate Store (SimplySign)
 * 2. YD_SIGN_* -> remote signing service
 * Returns true when the file ends up signed, false when signing was skipped.
 */
async function signFile(filePath) {
  const serviceConfig = resolveServiceConfig();
  if (serviceConfig) {
    const normalizedPath = path.resolve(filePath);
    if (signedThisRun.has(normalizedPath)) {
      return true;
    }
    if (readPeCertTable(normalizedPath)) {
      console.log(`[WinSign] ${path.basename(normalizedPath)} already carries a signature, skipping`);
      signedThisRun.add(normalizedPath);
      return false;
    }

    const sizeMb = (fs.statSync(normalizedPath).size / (1024 * 1024)).toFixed(1);
    console.log(`[WinSign] signing ${path.basename(normalizedPath)} (${sizeMb} MB) via ${serviceConfig.baseUrl}`);
    const t0 = Date.now();

    let lastError = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        await signOnce(serviceConfig, normalizedPath);
        signedThisRun.add(normalizedPath);
        console.log(`[WinSign] signed ${path.basename(normalizedPath)} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
        return true;
      } catch (error) {
        lastError = error;
        console.warn(`[WinSign] attempt ${attempt}/${MAX_ATTEMPTS} failed for ${path.basename(normalizedPath)}:`, error.message);
      }
    }
    throw lastError;
  }

  const certSha1 = (process.env[CERT_SHA1_ENV] || '').trim();
  if (certSha1) {
    return signWithSigntool(filePath, certSha1);
  }
  if (!serviceConfig) {
    if (!warnedAboutMissingCredentials) {
      warnedAboutMissingCredentials = true;
      console.warn(
        `[WinSign] Neither ${CERT_SHA1_ENV} nor ${SERVICE_URL_ENV}/${APP_KEY_ENV} are set -- `
        + 'Windows binaries will NOT be signed. This is fine for local dev builds and must never happen on release CI. '
        + 'See .env.example.',
      );
    }
    return false;
  }

  const normalizedPath = path.resolve(filePath);
  if (signedThisRun.has(normalizedPath)) {
    return true;
  }
  if (readPeCertTable(normalizedPath)) {
    console.log(`[WinSign] ${path.basename(normalizedPath)} already carries a signature, skipping`);
    signedThisRun.add(normalizedPath);
    return false;
  }

  const sizeMb = (fs.statSync(normalizedPath).size / (1024 * 1024)).toFixed(1);
  console.log(`[WinSign] signing ${path.basename(normalizedPath)} (${sizeMb} MB) via ${serviceConfig.baseUrl}`);
  const t0 = Date.now();

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await signOnce(serviceConfig, normalizedPath);
      signedThisRun.add(normalizedPath);
      console.log(`[WinSign] signed ${path.basename(normalizedPath)} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      return true;
    } catch (error) {
      lastError = error;
      console.warn(`[WinSign] attempt ${attempt}/${MAX_ATTEMPTS} failed for ${path.basename(normalizedPath)}:`, error.message);
    }
  }
  throw lastError;
}

/**
 * electron-builder `win.sign` entry point. Called once per binary that needs
 * a signature (app exe, uninstaller, installer; some versions also pass
 * hash variants for the same file -- deduplicated via signedThisRun).
 */
async function signWindowsBinary(configuration) {
  await signFile(configuration.path);
}

function _resetForTests() {
  warnedAboutMissingCredentials = false;
  signedThisRun.clear();
}

module.exports = signWindowsBinary;
module.exports.default = signWindowsBinary;
module.exports.signFile = signFile;
module.exports.readPeCertTable = readPeCertTable;
module.exports.loadDotEnv = loadDotEnv;
module.exports._resetForTests = _resetForTests;

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const { computePluginsFingerprint, computeRuntimeFingerprint } = require('./openclaw-asset-fingerprint.cjs');
const {
  OSS_PREFIX,
  getOssConfig,
  statOssFile,
  uploadToOss,
  createTarGz,
} = require('./oss-asset-helper.cjs');

function resolveDefaultTargetId() {
  const platform = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return `${platform}-${arch}`;
}

/**
 * 校验并上传插件缓存到 OSS
 */
function publishPluginsAsset(pluginsFingerprint) {
  const pluginsDir = path.join(rootDir, 'vendor', 'openclaw-plugins');
  if (!fs.existsSync(pluginsDir) || fs.readdirSync(pluginsDir).length < 2) {
    console.log('[publish-cloud-assets] No valid vendor/openclaw-plugins found locally, skipping plugins publish.');
    return;
  }

  const ossKey = `${OSS_PREFIX}/openclaw-plugins-${pluginsFingerprint}.tar.gz`;
  if (statOssFile(ossKey)) {
    console.log(`[publish-cloud-assets] Cloud plugins cache already exists on OSS for fingerprint: ${pluginsFingerprint}, skipping.`);
    return;
  }

  console.log(`[publish-cloud-assets] Packaging and publishing plugins cache (fingerprint: ${pluginsFingerprint})...`);
  const tmpTgz = path.join(os.tmpdir(), `openclaw-plugins-${pluginsFingerprint}-${Date.now()}.tar.gz`);
  try {
    createTarGz(pluginsDir, tmpTgz);
    uploadToOss(tmpTgz, ossKey);
    fs.writeFileSync(path.join(pluginsDir, '.fingerprint'), pluginsFingerprint, 'utf8');
    console.log(`[publish-cloud-assets] Successfully published plugins cache to OSS: ${ossKey}`);
  } catch (err) {
    console.warn(`[publish-cloud-assets] Failed to publish plugins cache to OSS: ${err.message}`);
  } finally {
    fs.rmSync(tmpTgz, { force: true });
  }
}

/**
 * 校验并上传 Runtime 底包缓存到 OSS
 */
function publishRuntimeAsset(targetId, runtimeFingerprint) {
  const runtimeDir = path.join(rootDir, 'vendor', 'openclaw-runtime', targetId);
  const gatewayAsar = path.join(runtimeDir, 'gateway.asar');

  if (!fs.existsSync(runtimeDir) || !fs.existsSync(gatewayAsar)) {
    console.log(`[publish-cloud-assets] Runtime for ${targetId} is incomplete locally (missing gateway.asar), skipping.`);
    return;
  }

  const ossKey = `${OSS_PREFIX}/openclaw-runtime-${targetId}-${runtimeFingerprint}.tar.gz`;
  if (statOssFile(ossKey)) {
    console.log(`[publish-cloud-assets] Cloud runtime cache already exists on OSS for ${targetId} (${runtimeFingerprint}), skipping.`);
    return;
  }

  console.log(`[publish-cloud-assets] Packaging and publishing runtime cache for ${targetId} (${runtimeFingerprint})...`);
  const tmpTgz = path.join(os.tmpdir(), `openclaw-runtime-${targetId}-${runtimeFingerprint}-${Date.now()}.tar.gz`);
  try {
    createTarGz(runtimeDir, tmpTgz);
    uploadToOss(tmpTgz, ossKey);
    fs.writeFileSync(path.join(runtimeDir, '.fingerprint'), runtimeFingerprint, 'utf8');
    console.log(`[publish-cloud-assets] Successfully published runtime cache to OSS: ${ossKey}`);
  } catch (err) {
    console.warn(`[publish-cloud-assets] Failed to publish runtime cache to OSS: ${err.message}`);
  } finally {
    fs.rmSync(tmpTgz, { force: true });
  }
}

function main() {
  const targetId = (process.argv[2] || resolveDefaultTargetId()).trim();
  console.log(`[publish-cloud-assets] Checking assets to publish for target: ${targetId}`);

  const ossConfig = getOssConfig();
  if (!ossConfig.isConfigured) {
    console.log('[publish-cloud-assets] OSS credentials not configured, skipping cache publish.');
    return;
  }

  const pluginsFingerprint = computePluginsFingerprint();
  const runtimeFingerprint = computeRuntimeFingerprint(targetId);

  publishPluginsAsset(pluginsFingerprint);
  publishRuntimeAsset(targetId, runtimeFingerprint);

  console.log('[publish-cloud-assets] Asset publish check completed.');
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.warn(`[publish-cloud-assets] Non-fatal error during cache publish: ${err.message}`);
    process.exit(0);
  }
}

module.exports = {
  publishPluginsAsset,
  publishRuntimeAsset,
};


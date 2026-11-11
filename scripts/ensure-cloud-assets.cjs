'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const { computePluginsFingerprint, computeRuntimeFingerprint } = require('./openclaw-asset-fingerprint.cjs');
const {
  OSS_PREFIX,
  getOssConfig,
  statOssFile,
  downloadFromOss,
  extractTarGz,
} = require('./oss-asset-helper.cjs');

function resolveDefaultTargetId() {
  const platform = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return `${platform}-${arch}`;
}

/**
 * 恢复插件资产（平台无关）
 */
function ensurePluginsAsset(pluginsFingerprint) {
  const pluginsDir = path.join(rootDir, 'vendor', 'openclaw-plugins');
  const fingerprintFile = path.join(pluginsDir, '.fingerprint');

  if (fs.existsSync(fingerprintFile)) {
    try {
      const cachedFp = fs.readFileSync(fingerprintFile, 'utf8').trim();
      if (cachedFp === pluginsFingerprint && fs.readdirSync(pluginsDir).length > 2) {
        console.log(`[ensure-cloud-assets] Local plugins cache matches fingerprint (${pluginsFingerprint}), skipping.`);
        return;
      }
    } catch {}
  }

  const ossKey = `${OSS_PREFIX}/openclaw-plugins-${pluginsFingerprint}.tar.gz`;
  const ossConfig = getOssConfig();

  if (!ossConfig.isConfigured) {
    console.log('[ensure-cloud-assets] OSS credentials not configured, skipping cloud plugins cache check.');
    return;
  }

  console.log(`[ensure-cloud-assets] Checking cloud plugins cache for fingerprint: ${pluginsFingerprint}...`);
  if (!statOssFile(ossKey)) {
    console.log(`[ensure-cloud-assets] No cloud plugins cache found on OSS for key: ${ossKey}`);
    return;
  }

  const tmpTgz = path.join(os.tmpdir(), `openclaw-plugins-${pluginsFingerprint}-${Date.now()}.tar.gz`);
  try {
    downloadFromOss(ossKey, tmpTgz);
    fs.rmSync(pluginsDir, { recursive: true, force: true });
    extractTarGz(tmpTgz, pluginsDir);
    fs.writeFileSync(fingerprintFile, pluginsFingerprint, 'utf8');
    console.log(`[ensure-cloud-assets] Successfully restored plugins from OSS cache (fingerprint: ${pluginsFingerprint})`);
  } catch (err) {
    console.warn(`[ensure-cloud-assets] Failed to restore plugins from cloud cache (will fallback to local): ${err.message}`);
  } finally {
    fs.rmSync(tmpTgz, { force: true });
  }
}

/**
 * 恢复 Runtime 底包资产（平台架构绑定）
 */
function ensureRuntimeAsset(targetId, runtimeFingerprint) {
  const runtimeDir = path.join(rootDir, 'vendor', 'openclaw-runtime', targetId);
  const fingerprintFile = path.join(runtimeDir, '.fingerprint');
  const buildInfoFile = path.join(runtimeDir, 'runtime-build-info.json');
  const gatewayAsar = path.join(runtimeDir, 'gateway.asar');

  if (fs.existsSync(fingerprintFile) && fs.existsSync(gatewayAsar)) {
    try {
      const cachedFp = fs.readFileSync(fingerprintFile, 'utf8').trim();
      if (cachedFp === runtimeFingerprint) {
        console.log(`[ensure-cloud-assets] Local runtime (${targetId}) matches fingerprint (${runtimeFingerprint}), skipping.`);
        // 确保 current 软链接指向当前 target
        spawnSync(process.execPath, [path.join(rootDir, 'scripts', 'sync-openclaw-runtime-current.cjs'), targetId], {
          stdio: 'ignore',
        });
        return;
      }
    } catch {}
  }

  const ossKey = `${OSS_PREFIX}/openclaw-runtime-${targetId}-${runtimeFingerprint}.tar.gz`;
  const ossConfig = getOssConfig();

  if (!ossConfig.isConfigured) {
    console.log(`[ensure-cloud-assets] OSS credentials not configured, skipping cloud runtime (${targetId}) check.`);
    return;
  }

  console.log(`[ensure-cloud-assets] Checking cloud runtime cache for ${targetId} (${runtimeFingerprint})...`);
  if (!statOssFile(ossKey)) {
    console.log(`[ensure-cloud-assets] No cloud runtime cache found on OSS for key: ${ossKey}`);
    return;
  }

  const tmpTgz = path.join(os.tmpdir(), `openclaw-runtime-${targetId}-${runtimeFingerprint}-${Date.now()}.tar.gz`);
  try {
    downloadFromOss(ossKey, tmpTgz);
    fs.rmSync(runtimeDir, { recursive: true, force: true });
    extractTarGz(tmpTgz, runtimeDir);
    fs.writeFileSync(fingerprintFile, runtimeFingerprint, 'utf8');

    // 同步 current 指向
    spawnSync(process.execPath, [path.join(rootDir, 'scripts', 'sync-openclaw-runtime-current.cjs'), targetId], {
      stdio: 'inherit',
    });

    console.log(`[ensure-cloud-assets] Successfully restored runtime (${targetId}) from OSS cache (fingerprint: ${runtimeFingerprint})`);
  } catch (err) {
    console.warn(`[ensure-cloud-assets] Failed to restore runtime (${targetId}) from cloud cache: ${err.message}`);
  } finally {
    fs.rmSync(tmpTgz, { force: true });
  }
}

function main() {
  const targetId = (process.argv[2] || resolveDefaultTargetId()).trim();
  console.log(`[ensure-cloud-assets] Initializing cloud assets check for target: ${targetId}`);

  const pluginsFingerprint = computePluginsFingerprint();
  const runtimeFingerprint = computeRuntimeFingerprint(targetId);

  ensurePluginsAsset(pluginsFingerprint);
  ensureRuntimeAsset(targetId, runtimeFingerprint);

  console.log('[ensure-cloud-assets] Pre-build asset check completed.');
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    // 优雅降级，绝对不因为缓存检查崩溃而阻断 CI 主构建流程
    console.warn(`[ensure-cloud-assets] Non-fatal error during cache restore: ${err.message}`);
    process.exit(0);
  }
}

module.exports = {
  ensurePluginsAsset,
  ensureRuntimeAsset,
};


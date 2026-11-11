'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

/**
 * 辅助函数：安全读取文件并更新哈希
 */
function updateHashWithFile(hash, filePath) {
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    hash.update(fs.readFileSync(filePath));
  }
}

/**
 * 辅助函数：安全递归读取目录下所有文件并更新哈希
 */
function updateHashWithDir(hash, dirPath) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    return;
  }
  const entries = fs.readdirSync(dirPath).sort();
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      updateHashWithDir(hash, fullPath);
    } else if (stat.isFile()) {
      hash.update(`file:${entry}:`);
      hash.update(fs.readFileSync(fullPath));
    }
  }
}

/**
 * 计算插件资产（Plugins）的强内容指纹。
 * 覆盖：
 * 1. package.json 中的 openclaw.plugins 清单（包含每个插件的版本与 npm 规格）
 * 2. scripts/openclaw-plugin-preparers 目录下的所有加固脚本
 * 3. 插件安装管理核心脚本 ensure-openclaw-plugins.cjs 等
 */
function computePluginsFingerprint() {
  const hash = crypto.createHash('sha256');

  const pkgPath = path.join(rootDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const plugins = pkg.openclaw?.plugins || [];
  hash.update(`plugins:${JSON.stringify(plugins)};`);

  // 纳入所有插件准备脚本
  updateHashWithDir(hash, path.join(rootDir, 'scripts', 'openclaw-plugin-preparers'));

  // 纳入安装核心控制脚本
  updateHashWithFile(hash, path.join(rootDir, 'scripts', 'ensure-openclaw-plugins.cjs'));
  updateHashWithFile(hash, path.join(rootDir, 'scripts', 'openclaw-runtime-packaging.cjs'));
  updateHashWithFile(hash, path.join(rootDir, 'scripts', 'openclaw-plugin-sdk-contract.cjs'));

  return hash.digest('hex').slice(0, 16);
}

/**
 * 计算 Runtime 底包的强内容指纹。
 * 覆盖：
 * 1. OpenClaw 官方版本号
 * 2. 目标架构 (target: mac-arm64, mac-x64, win-x64 等)
 * 3. 对应版本全量 patch 补丁文件
 * 4. Runtime 核心构建与打包脚本
 */
function computeRuntimeFingerprint(target) {
  const pkgPath = path.join(rootDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const version = pkg.openclaw?.version || 'unknown';

  const hash = crypto.createHash('sha256');
  hash.update(`version:${version};target:${target};`);

  // 纳入所有补丁文件
  const patchesDir = path.join(rootDir, 'scripts', 'patches', version);
  updateHashWithDir(hash, patchesDir);

  // 纳入核心构建与剥离脚本
  updateHashWithFile(hash, path.join(rootDir, 'scripts', 'build-openclaw-runtime.sh'));
  updateHashWithFile(hash, path.join(rootDir, 'scripts', 'pack-openclaw-workspace-deps.cjs'));
  updateHashWithFile(hash, path.join(rootDir, 'scripts', 'run-build-openclaw-runtime.cjs'));
  updateHashWithFile(hash, path.join(rootDir, 'scripts', 'sync-openclaw-runtime-current.cjs'));
  updateHashWithFile(hash, path.join(rootDir, 'scripts', 'bundle-openclaw-gateway.cjs'));
  updateHashWithFile(hash, path.join(rootDir, 'scripts', 'prune-openclaw-runtime.cjs'));

  const shortHash = hash.digest('hex').slice(0, 16);
  return `${version}-${shortHash}`;
}

module.exports = {
  computePluginsFingerprint,
  computeRuntimeFingerprint,
};

if (require.main === module) {
  const type = process.argv[2] || 'all';
  const target = process.argv[3] || 'mac-arm64';
  if (type === 'plugins' || type === 'all') {
    console.log(`Plugins Fingerprint: ${computePluginsFingerprint()}`);
  }
  if (type === 'runtime' || type === 'all') {
    console.log(`Runtime (${target}) Fingerprint: ${computeRuntimeFingerprint(target)}`);
  }
}

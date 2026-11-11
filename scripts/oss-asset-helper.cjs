'use strict';

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

/**
 * 轻量加载 .env 文件（若存在），不覆盖已有环境变量
 */
function loadDotEnv(envPath = path.join(rootDir, '.env')) {
  try {
    const content = fs.readFileSync(envPath, 'utf8');
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
  } catch {}
}

loadDotEnv();

const OSS_PREFIX = 'assets/openclaw';

function getOssConfig() {
  const endpoint = (process.env.OSS_ENDPOINT || '').trim();
  const ak = (process.env.OSS_ACCESS_KEY_ID || '').trim();
  const sk = (process.env.OSS_ACCESS_KEY_SECRET || '').trim();
  const bucket = (process.env.OSS_BUCKET || '').trim();

  // 清洗 endpoint，防止带有协议头
  const cleanEndpoint = endpoint.replace(/^https?:\/\//i, '');

  return {
    endpoint: cleanEndpoint,
    ak,
    sk,
    bucket,
    isConfigured: Boolean(cleanEndpoint && ak && sk && bucket),
  };
}

/**
 * 寻找或就地安装阿里云官方 ossutil 工具
 */
function resolveOssutil() {
  if (process.env.OSSUTIL_PATH && fs.existsSync(process.env.OSSUTIL_PATH)) {
    return process.env.OSSUTIL_PATH;
  }

  // 1. 检查环境变量 PATH 中是否有现成 ossutil
  const checkCommands = process.platform === 'win32'
    ? ['ossutil64', 'ossutil']
    : ['ossutil', 'ossutilmac64', 'ossutil64'];

  for (const cmd of checkCommands) {
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore' });
      return cmd;
    } catch {}
  }

  // 2. 检查常见临时路径
  const tmpCandidates = process.platform === 'win32'
    ? [path.join(os.tmpdir(), 'ossutil64.exe'), path.join(rootDir, 'ossutil64.exe')]
    : ['/tmp/ossutil', '/tmp/ossutilmac64', path.join(os.tmpdir(), 'ossutil')];

  for (const candidate of tmpCandidates) {
    if (fs.existsSync(candidate)) {
      try {
        execSync(`"${candidate}" --version`, { stdio: 'ignore' });
        return candidate;
      } catch {}
    }
  }

  // 3. 自动下载对应平台的官方 ossutil
  console.log('[oss-asset-helper] Downloading official ossutil binary...');
  try {
    let downloadUrl = '';
    let targetBin = '';

    if (process.platform === 'darwin') {
      downloadUrl = 'https://gosspublic.alicdn.com/ossutil/1.7.18/ossutilmac64';
      targetBin = path.join(os.tmpdir(), 'ossutil');
      execSync(`curl -fSL "${downloadUrl}" -o "${targetBin}" && chmod +x "${targetBin}"`, {
        stdio: 'inherit',
      });
    } else if (process.platform === 'win32') {
      downloadUrl = 'https://gosspublic.alicdn.com/ossutil/1.7.18/ossutil64.zip';
      const zipPath = path.join(os.tmpdir(), 'ossutil64.zip');
      targetBin = path.join(os.tmpdir(), 'ossutil64.exe');
      execSync(`curl -fSL "${downloadUrl}" -o "${zipPath}"`, { stdio: 'inherit' });
      execSync(`tar -xf "${zipPath}" -C "${os.tmpdir()}"`, { stdio: 'inherit' });
      // 搜索解压后的 exe
      const files = fs.readdirSync(os.tmpdir());
      const extractedDir = files.find(f => f.startsWith('ossutil64'));
      if (extractedDir) {
        const foundExe = path.join(os.tmpdir(), extractedDir, 'ossutil64.exe');
        if (fs.existsSync(foundExe)) {
          targetBin = foundExe;
        }
      }
    } else {
      // Linux
      downloadUrl = 'https://gosspublic.alicdn.com/ossutil/1.7.18/ossutil64';
      targetBin = path.join(os.tmpdir(), 'ossutil');
      execSync(`curl -fSL "${downloadUrl}" -o "${targetBin}" && chmod +x "${targetBin}"`, {
        stdio: 'inherit',
      });
    }

    if (fs.existsSync(targetBin)) {
      return targetBin;
    }
  } catch (err) {
    console.warn('[oss-asset-helper] Failed to auto-download ossutil:', err.message);
  }

  return null;
}

/**
 * 检查 OSS 上指定 key 的文件是否存在
 */
function statOssFile(ossKey) {
  const config = getOssConfig();
  if (!config.isConfigured) return false;

  const ossutil = resolveOssutil();
  if (!ossutil) return false;

  const cmd = `"${ossutil}" stat "oss://${config.bucket}/${ossKey}" -e "${config.endpoint}" -i "${config.ak}" -k "${config.sk}"`;
  const result = spawnSync(cmd, { shell: true, stdio: 'ignore' });
  return result.status === 0;
}

/**
 * 从 OSS 下载文件
 */
function downloadFromOss(ossKey, localDestPath) {
  const config = getOssConfig();
  if (!config.isConfigured) {
    throw new Error('OSS configuration is missing in environment (OSS_ENDPOINT, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, OSS_BUCKET)');
  }

  const ossutil = resolveOssutil();
  if (!ossutil) {
    throw new Error('ossutil executable not found and auto-download failed');
  }

  fs.mkdirSync(path.dirname(localDestPath), { recursive: true });

  console.log(`[oss-asset-helper] Downloading oss://${config.bucket}/${ossKey} -> ${localDestPath}...`);
  const t0 = Date.now();
  const cmd = `"${ossutil}" cp -f "oss://${config.bucket}/${ossKey}" "${localDestPath}" -e "${config.endpoint}" -i "${config.ak}" -k "${config.sk}"`;

  const result = spawnSync(cmd, { shell: true, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`Failed to download from OSS (exit code ${result.status})`);
  }

  const sizeMb = (fs.statSync(localDestPath).size / (1024 * 1024)).toFixed(1);
  console.log(`[oss-asset-helper] Download completed in ${((Date.now() - t0) / 1000).toFixed(1)}s (${sizeMb} MB)`);
  return true;
}

/**
 * 上传本地文件到 OSS
 */
function uploadToOss(localSrcPath, ossKey) {
  const config = getOssConfig();
  if (!config.isConfigured) {
    throw new Error('OSS configuration is missing in environment');
  }

  const ossutil = resolveOssutil();
  if (!ossutil) {
    throw new Error('ossutil executable not found');
  }

  const sizeMb = (fs.statSync(localSrcPath).size / (1024 * 1024)).toFixed(1);
  console.log(`[oss-asset-helper] Uploading ${localSrcPath} (${sizeMb} MB) -> oss://${config.bucket}/${ossKey}...`);
  const t0 = Date.now();
  const cmd = `"${ossutil}" cp -f "${localSrcPath}" "oss://${config.bucket}/${ossKey}" -e "${config.endpoint}" -i "${config.ak}" -k "${config.sk}" --parallel=5 --part-size=2097152`;

  const result = spawnSync(cmd, { shell: true, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`Failed to upload to OSS (exit code ${result.status})`);
  }

  console.log(`[oss-asset-helper] Upload completed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return true;
}

/**
 * 跨平台使用系统原生 tar 创建 tar.gz 压缩包
 */
function createTarGz(sourceDir, tarGzPath) {
  fs.mkdirSync(path.dirname(tarGzPath), { recursive: true });
  console.log(`[oss-asset-helper] Compressing ${sourceDir} -> ${tarGzPath}...`);
  const t0 = Date.now();

  const tarExe = process.platform === 'win32' ? 'tar.exe' : 'tar';
  const result = spawnSync(tarExe, ['-czf', tarGzPath, '-C', sourceDir, '.'], {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`tar compression failed with code ${result.status}`);
  }
  const sizeMb = (fs.statSync(tarGzPath).size / (1024 * 1024)).toFixed(1);
  console.log(`[oss-asset-helper] Compression completed in ${((Date.now() - t0) / 1000).toFixed(1)}s (${sizeMb} MB)`);
}

/**
 * 跨平台使用系统原生 tar 解压 tar.gz 压缩包
 */
function extractTarGz(tarGzPath, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  console.log(`[oss-asset-helper] Extracting ${tarGzPath} -> ${targetDir}...`);
  const t0 = Date.now();

  const tarExe = process.platform === 'win32' ? 'tar.exe' : 'tar';
  const result = spawnSync(tarExe, ['-xzf', tarGzPath, '-C', targetDir], {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`tar extraction failed with code ${result.status}`);
  }
  console.log(`[oss-asset-helper] Extraction completed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

module.exports = {
  OSS_PREFIX,
  getOssConfig,
  resolveOssutil,
  statOssFile,
  downloadFromOss,
  uploadToOss,
  createTarGz,
  extractTarGz,
};


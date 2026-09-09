'use strict';

/**
 * SimplySign automated headless login helper for Windows CI/CD.
 *
 * Downloads and installs Certum SimplySign Desktop driver silently,
 * generates a valid 6-digit TOTP from SIMPLYSIGN_OTP_SECRET,
 * and logs in via SimplySign CLI to mount the code-signing certificate.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');

const USER_ENV = 'SIMPLYSIGN_USER';
const OTP_SECRET_ENV = 'SIMPLYSIGN_OTP_SECRET';

function base32Decode(base32) {
  const clean = base32.replace(/=+$/, '').toUpperCase();
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (let i = 0; i < clean.length; i += 1) {
    const val = alphabet.indexOf(clean[i]);
    if (val === -1) throw new Error(`Invalid base32 char: ${clean[i]}`);
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTOTP(secret, step = 30, digits = 6) {
  const key = base32Decode(secret);
  const epoch = Math.floor(Date.now() / 1000);
  const timeStep = Math.floor(epoch / step);
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigInt64BE(BigInt(timeStep));
  const hmac = crypto.createHmac('sha1', key);
  hmac.update(timeBuffer);
  const digest = hmac.digest();
  const offset = digest[digest.length - 1] & 0xf;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  const otp = binary % Math.pow(10, digits);
  return otp.toString().padStart(digits, '0');
}

async function main() {
  const user = (process.env[USER_ENV] || '').trim();
  const rawSecret = (process.env[OTP_SECRET_ENV] || '').trim();

  if (!user || !rawSecret) {
    console.log('[SimplySign] SIMPLYSIGN_USER or SIMPLYSIGN_OTP_SECRET not set, skipping SimplySign setup.');
    return;
  }

  // Extract secret from URL if full otpauth URI is passed
  let secret = rawSecret;
  const match = /[?&]secret=([A-Za-z0-9=]+)/i.exec(rawSecret);
  if (match) {
    secret = match[1];
  }

  console.log(`[SimplySign] Setting up SimplySign for user: ${user}`);

  // Default installation paths for SimplySign Desktop
  const possiblePaths = [
    'C:\\Program Files\\Certum\\SimplySign Desktop\\SimplySignDesktop.exe',
    'C:\\Program Files (x86)\\Certum\\SimplySign Desktop\\SimplySignDesktop.exe',
    'C:\\Program Files\\Certum by Asseco\\SimplySign Desktop\\SimplySignDesktop.exe',
    'C:\\Program Files (x86)\\Certum by Asseco\\SimplySign Desktop\\SimplySignDesktop.exe',
    'C:\\Program Files\\SimplySign Desktop\\SimplySignDesktop.exe',
    'C:\\Program Files (x86)\\SimplySign Desktop\\SimplySignDesktop.exe',
  ];

  function findExecutable() {
    const found = possiblePaths.find((p) => fs.existsSync(p));
    if (found) return found;

    // Fallback: search Certum directories
    const searchRoots = ['C:\\Program Files', 'C:\\Program Files (x86)'];
    for (const root of searchRoots) {
      if (!fs.existsSync(root)) continue;
      try {
        const entries = fs.readdirSync(root);
        for (const entry of entries) {
          if (/certum|simply/i.test(entry)) {
            const subDir = path.join(root, entry);
            const candidate1 = path.join(subDir, 'SimplySignDesktop.exe');
            if (fs.existsSync(candidate1)) return candidate1;
            const subEntries = fs.readdirSync(subDir);
            for (const sub of subEntries) {
              const candidate2 = path.join(subDir, sub, 'SimplySignDesktop.exe');
              if (fs.existsSync(candidate2)) return candidate2;
            }
          }
        }
      } catch {}
    }
    return null;
  }

  let appPath = findExecutable();

  if (!appPath) {
    console.log('[SimplySign] Downloading SimplySign Desktop installer from CDN...');
    const msiUrl = (process.env.SIMPLYSIGN_INSTALLER_URL || 'http://scrm0.cdn.banchengyun.com/heyclaw/SimplySignDesktop-9.4.3.90-64-bit-en.msi').trim();
    const msiPath = path.resolve(process.cwd(), 'SimplySignDesktop.msi');

    execSync(`curl -fsSL -o "${msiPath}" "${msiUrl}"`, { stdio: 'inherit' });

    console.log('[SimplySign] Installing SimplySign Desktop silently...');
    execSync(`msiexec /i "${msiPath}" /qn /norestart`, { stdio: 'inherit' });

    appPath = findExecutable();
  }

  if (!appPath) {
    throw new Error('[SimplySign] SimplySignDesktop.exe not found after installation.');
  }

  console.log(`[SimplySign] Found executable at: ${appPath}`);

  // 生成 OTP 前先检查 TOTP 窗口剩余时间
  // SimplySign 需要时间启动 + 连接 Certum 服务器，若 OTP 快过期则等到下一窗口再生成
  const MIN_OTP_REMAINING_MS = 12000;
  const remainingMs = 30000 - (Date.now() % 30000);
  if (remainingMs < MIN_OTP_REMAINING_MS) {
    const waitMs = remainingMs + 500; // 多等 0.5s 缓冲
    console.log(`[SimplySign] TOTP window ending in ${(remainingMs / 1000).toFixed(1)}s (<12s), waiting ${(waitMs / 1000).toFixed(1)}s for next window...`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  const otpRemainingMs = 30000 - (Date.now() % 30000);
  const otp = generateTOTP(secret);
  console.log(`[SimplySign] Generated TOTP. Remaining in current 30s window: ${(otpRemainingMs / 1000).toFixed(1)}s`);

  // 【调试】将 SimplySign 的 stdout/stderr 写入日志文件以便排查
  const logPath = path.resolve(process.cwd(), 'simplysign-debug.log');
  const logStream = fs.openSync(logPath, 'w');
  console.log(`[SimplySign][DEBUG] SimplySign output will be captured to: ${logPath}`);

  const child = spawn(appPath, ['/login', '-u', user, '-p', otp], {
    detached: true,
    stdio: ['ignore', logStream, logStream],
  });
  child.unref();

  // 【调试】稍等后检查进程是否还在运行
  await new Promise((resolve) => setTimeout(resolve, 3000));
  try {
    const taskList = execSync('tasklist /FI "IMAGENAME eq SimplySignDesktop.exe" /FO CSV /NH', { encoding: 'utf8' });
    if (taskList.toLowerCase().includes('simplysigndesktop')) {
      console.log('[SimplySign][DEBUG] SimplySignDesktop.exe is RUNNING (process alive after 3s).');
    } else {
      console.log('[SimplySign][DEBUG] SimplySignDesktop.exe is NOT running (process exited within 3s - likely crashed or rejected CLI args).');
    }
  } catch {
    console.log('[SimplySign][DEBUG] Could not check process status via tasklist.');
  }

  console.log('[SimplySign] Waiting for virtual smartcard certificate to mount (up to 60s)...');
  const certSha1 = (process.env.WIN_SIGN_CERT_SHA1 || 'f0d51f084bba92740ced8165475fddfaf0f901e2').toLowerCase();

  let mounted = false;
  for (let i = 0; i < 30; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    try {
      const output = execSync('certutil -user -store My', { encoding: 'utf8' });
      if (output.toLowerCase().includes(certSha1)) {
        console.log(`[SimplySign] Certificate (${certSha1.slice(0, 8)}...) successfully mounted and detected in Windows Certificate Store!`);
        mounted = true;
        break;
      }
    } catch {
      // ignore certutil error during early polling
    }
  }

  // 【调试】读取 SimplySign 的 stdout/stderr 日志
  try {
    fs.closeSync(logStream);
    const logContent = fs.readFileSync(logPath, 'utf8').trim();
    if (logContent) {
      console.log('[SimplySign][DEBUG] === SimplySign stdout/stderr output ===');
      console.log(logContent);
      console.log('[SimplySign][DEBUG] === End of stdout/stderr output ===');
    } else {
      console.log('[SimplySign][DEBUG] SimplySign wrote nothing to stdout/stderr (GUI app, expected).');
    }
  } catch {
    console.log('[SimplySign][DEBUG] Could not read stdout/stderr log file.');
  }

  // 【调试】尝试读取 SimplySign 自身在 %APPDATA% 里的日志文件
  const appDataPath = process.env.APPDATA || '';
  const possibleLogDirs = [
    path.join(appDataPath, 'Certum', 'SimplySign Desktop', 'Logs'),
    path.join(appDataPath, 'Certum', 'SimplySign Desktop'),
    path.join(appDataPath, 'SimplySign Desktop', 'Logs'),
  ];
  for (const logDir of possibleLogDirs) {
    if (fs.existsSync(logDir)) {
      console.log(`[SimplySign][DEBUG] Found SimplySign log dir: ${logDir}`);
      try {
        const logFiles = fs.readdirSync(logDir).filter((f) => /\.(log|txt)$/i.test(f)).slice(-3);
        for (const lf of logFiles) {
          const lfPath = path.join(logDir, lf);
          const content = fs.readFileSync(lfPath, 'utf8').slice(-2000).trim();
          if (content) {
            console.log(`[SimplySign][DEBUG] === ${lf} (last 2000 chars) ===`);
            console.log(content);
          }
        }
      } catch {
        console.log(`[SimplySign][DEBUG] Could not read log dir: ${logDir}`);
      }
      break;
    }
  }
  if (possibleLogDirs.every((d) => !fs.existsSync(d))) {
    console.log('[SimplySign][DEBUG] No SimplySign log directory found in APPDATA.');
  }

  if (!mounted) {
    console.error(`[SimplySign] Fatal: Certificate (${certSha1.slice(0, 8)}...) was not detected in Windows Certificate Store after 60s. SimplySign login may have failed or the OTP expired. Aborting build.`);
    process.exit(1);
  } else {
    console.log('[SimplySign] Setup complete and ready for code signing.');
  }
}

main().catch((err) => {
  console.error('[SimplySign] Fatal error:', err);
  process.exit(1);
});

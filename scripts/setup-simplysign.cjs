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
const { execSync } = require('child_process');

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

  // Generate OTP
  const otp = generateTOTP(secret);
  console.log('[SimplySign] Successfully generated dynamic TOTP code.');

  // Login via CLI
  console.log('[SimplySign] Logging in via CLI...');
  try {
    execSync(`"${appPath}" /login -u "${user}" -p "${otp}"`, { stdio: 'inherit', timeout: 30000 });
    console.log('[SimplySign] Login command completed successfully.');
  } catch (error) {
    console.error('[SimplySign] Login command failed:', error.message);
    throw error;
  }
}

main().catch((err) => {
  console.error('[SimplySign] Fatal error:', err);
  process.exit(1);
});

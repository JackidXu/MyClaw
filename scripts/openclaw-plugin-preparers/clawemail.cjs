'use strict';

const fs = require('fs');
const path = require('path');
const {
  extractPluginTarball,
  npmPackDirectory,
  readJsonFile,
  writeJsonFile,
} = require('./typescript-plugin.cjs');

const CLAWEMAIL_PACKAGE_ID = 'clawemail-email';
const CLAWEMAIL_PACKAGE_NAME = '@clawemail/email';
// 锁定 mailparser 安全版本，防止现场拉取最新 mailparser 引入不存在的 nodemailer@10.5.0
const PINNED_MAILPARSER_VERSION = '3.6.9';

function patchClawEmailPackageDirectory(packageDir, opts = {}) {
  const log = opts.log || (() => {});
  const packageJsonPath = path.join(packageDir, 'package.json');
  const pkg = readJsonFile(packageJsonPath);
  const packageLabel = opts.packageLabel || pkg.name || CLAWEMAIL_PACKAGE_NAME;

  let changed = false;
  if (pkg.dependencies && pkg.dependencies.mailparser) {
    const currentVersion = pkg.dependencies.mailparser;
    if (currentVersion !== PINNED_MAILPARSER_VERSION) {
      pkg.dependencies.mailparser = PINNED_MAILPARSER_VERSION;
      changed = true;
      log(`  Locked ${packageLabel} dependency "mailparser" from "${currentVersion}" to "${PINNED_MAILPARSER_VERSION}"`);
    }
  }

  if (changed) {
    writeJsonFile(packageJsonPath, pkg);
  }

  return { changed };
}

function prepareOpenClawClawEmailPackage(inputTgzPath, outputDir, opts = {}) {
  const packageLabel = opts.packageLabel || CLAWEMAIL_PACKAGE_NAME;
  const sourceDir = extractPluginTarball(inputTgzPath, outputDir, packageLabel);

  const result = patchClawEmailPackageDirectory(sourceDir, { ...opts, packageLabel });
  if (!result.changed) {
    fs.rmSync(sourceDir, { recursive: true, force: true });
    return inputTgzPath;
  }

  const patchedPackDir = fs.mkdtempSync(path.join(outputDir, 'openclaw-plugin-clawemail-'));
  const tgzPath = npmPackDirectory(sourceDir, patchedPackDir);
  fs.rmSync(sourceDir, { recursive: true, force: true });
  return tgzPath;
}

module.exports = {
  CLAWEMAIL_PACKAGE_ID,
  CLAWEMAIL_PACKAGE_NAME,
  PINNED_MAILPARSER_VERSION,
  patchClawEmailPackageDirectory,
  prepareOpenClawClawEmailPackage,
};


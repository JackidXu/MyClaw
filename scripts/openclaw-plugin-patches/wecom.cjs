'use strict';

const fs = require('fs');
const path = require('path');

const WECOM_MENTION_PATCH_MARKER = 'wecom_mention_strip_patch';

function patchWecomMonitorMentionStrip(monitorPath, label, log) {
  if (!fs.existsSync(monitorPath)) {
    return;
  }

  let src = fs.readFileSync(monitorPath, 'utf8');
  if (src.includes(WECOM_MENTION_PATCH_MARKER)) {
    log(`${label} mention strip patch already applied, skipping`);
    return;
  }

  // 匹配被官方注释掉的群聊移除提及标记逻辑
  const brokenPatterns = [
    `    // // 群聊中移除 @机器人 的提及标记\n    // if (body.chattype === "group") {\n    //   text = text.replace(/@\\S+/g, "").trim();\n    // }`,
    `    // 群聊中移除 @机器人 的提及标记\n    // if (body.chattype === "group") {\n    //   text = text.replace(/@\\S+/g, "").trim();\n    // }`,
    `    // if (body.chattype === "group") {\n    //   text = text.replace(/@\\S+/g, "").trim();\n    // }`,
  ];

  const replacement = `    // [HeyClaw Patch: ${WECOM_MENTION_PATCH_MARKER}] 群聊中移除开头的 @机器人 标记（支持任意机器人中文昵称）
    if (body.chattype === "group" && typeof text === "string") {
      text = text.replace(/^@\\S+\\s*/, "").trim();
    }`;

  let replaced = false;
  for (const pattern of brokenPatterns) {
    if (src.includes(pattern)) {
      src = src.replace(pattern, replacement);
      replaced = true;
      break;
    }
  }

  if (!replaced) {
    // 兜底正则匹配：匹配以注释形式存在的 body.chattype === "group" 和 replace
    const regexPattern = /\/\/\s*(?:\/\/\s*)?群聊中移除[\s\S]*?text\.replace\(\/@\\S\+\/g[\s\S]*?\}/;
    if (regexPattern.test(src)) {
      src = src.replace(regexPattern, replacement.trim());
      replaced = true;
    }
  }

  if (replaced) {
    fs.writeFileSync(monitorPath, src, 'utf8');
    log(`Patched ${label}: enabled 群聊开头的 @机器人 自动剥离逻辑`);
  } else {
    log(`${label}: mention strip target pattern not found, skipping patch`);
  }
}

function patchWecom({ runtimeExtensionsDir, log }) {
  const candidates = [];

  // 1. runtime third-party extensions 目标
  if (runtimeExtensionsDir) {
    candidates.push(path.join(runtimeExtensionsDir, 'wecom-openclaw-plugin'));
  }

  // 2. 查找工程内部 openclaw-plugins 缓存目录及 runtime 平台目录
  const rootDir = path.resolve(__dirname, '../..');
  const pluginCacheDir = path.join(rootDir, 'vendor', 'openclaw-plugins', 'wecom-openclaw-plugin');
  if (fs.existsSync(pluginCacheDir)) {
    candidates.push(pluginCacheDir);
  }

  const platforms = ['mac-x64', 'mac-arm64', 'win-x64', 'win-arm64', 'linux-x64', 'current'];
  for (const plat of platforms) {
    const platExtDir = path.join(rootDir, 'vendor', 'openclaw-runtime', plat, 'third-party-extensions', 'wecom-openclaw-plugin');
    if (fs.existsSync(platExtDir)) {
      candidates.push(platExtDir);
    }
  }

  const uniqueDirs = Array.from(new Set(candidates));
  for (const pluginDir of uniqueDirs) {
    const monitorJs = path.join(pluginDir, 'dist', 'src', 'monitor.js');
    patchWecomMonitorMentionStrip(monitorJs, path.relative(rootDir, monitorJs), log);
  }
}

module.exports = {
  patchWecom,
  patchWecomMonitorMentionStrip,
};

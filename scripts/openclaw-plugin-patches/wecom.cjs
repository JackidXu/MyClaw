'use strict';

const fs = require('fs');
const path = require('path');

const WECOM_MENTION_PATCH_MARKER = 'wecom_mention_strip_patch_v3';

function patchWecomMonitorMentionStrip(monitorPath, label, log) {
  if (!fs.existsSync(monitorPath)) {
    return;
  }

  let src = fs.readFileSync(monitorPath, 'utf8');
  if (src.includes(WECOM_MENTION_PATCH_MARKER)) {
    log(`${label} mention strip patch already applied, skipping`);
    return;
  }

  const replacement = `    // [HeyClaw Patch: ${WECOM_MENTION_PATCH_MARKER}] 群聊中移除开头的 @机器人 标记，纯 @ 机器人时强化提示意图唤醒
    const hadMentionPrefix = body.chattype === "group" && typeof text === "string" && /^@\\S+/.test(text);
    if (body.chattype === "group" && typeof text === "string") {
      text = text.replace(/^@\\S+\\s*/, "").trim();
    }
    if (!text && hadMentionPrefix && !quoteContent && imageUrls.length === 0 && fileUrls.length === 0) {
      text = "（用户在群聊中@呼叫了你，请向用户打招呼并询问有什么可以协助）";
    }`;

  // 匹配历史版本补丁以及被官方注释掉的群聊移除提及标记逻辑
  const brokenPatterns = [
    `    // [HeyClaw Patch: wecom_mention_strip_patch_v2] 群聊中移除开头的 @机器人 标记，纯 @ 机器人时默认打招呼唤醒\n    const hadMentionPrefix = body.chattype === "group" && typeof text === "string" && /^@\\S+/.test(text);\n    if (body.chattype === "group" && typeof text === "string") {\n      text = text.replace(/^@\\S+\\s*/, "").trim();\n    }\n    if (!text && hadMentionPrefix && !quoteContent && imageUrls.length === 0 && fileUrls.length === 0) {\n      text = "你好";\n    }`,
    `    // [HeyClaw Patch: wecom_mention_strip_patch] 群聊中移除开头的 @机器人 标记（支持任意机器人中文昵称）\n    if (body.chattype === "group" && typeof text === "string") {\n      text = text.replace(/^@\\S+\\s*/, "").trim();\n    }`,
    `    // // 群聊中移除 @机器人 的提及标记\n    // if (body.chattype === "group") {\n    //   text = text.replace(/@\\S+/g, "").trim();\n    // }`,
    `    // 群聊中移除 @机器人 的提及标记\n    // if (body.chattype === "group") {\n    //   text = text.replace(/@\\S+/g, "").trim();\n    // }`,
    `    // if (body.chattype === "group") {\n    //   text = text.replace(/@\\S+/g, "").trim();\n    // }`,
  ];

  let replaced = false;
  for (const pattern of brokenPatterns) {
    if (src.includes(pattern)) {
      src = src.replace(pattern, replacement);
      replaced = true;
      break;
    }
  }

  if (!replaced) {
    // 兜底正则匹配：匹配历史 patch 或官方注释
    const regexPattern = /\/\/\s*\[HeyClaw Patch:[\s\S]*?text\s*=\s*"你好";\s*\}|\/\/\s*(?:\/\/\s*)?群聊中移除[\s\S]*?text\.replace\(\/@\\S\+\/g[\s\S]*?\}/;
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

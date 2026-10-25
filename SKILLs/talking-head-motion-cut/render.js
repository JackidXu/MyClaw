#!/usr/bin/env node
/**
 * talking-head-motion-cut 极速渲染器（图层分离架构 + 智能环境探寻）
 *
 * 核心设计：
 * 1. 智能嗅探系统已有的 Chrome / Edge / Chromium，零配置开箱即用；
 * 2. 智能探测系统或 HeyClaw 内置 ffmpeg；
 * 3. 图层分离渲染：Puppeteer 只渲染纯透明背景的动效层（无需解码大体积原片视频），
 *    渲染耗时从 15 分钟直接降至 15~30 秒；
 * 4. 最终使用 ffmpeg overlay 硬件/多线程复合，秒级贴合原视频与原声。
 *
 * 用法：
 *   node render.js <public-dir> -o <output.mp4> [--fps 30] [--gpu]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

/**
 * 寻找可用的 Chrome / Edge / Chromium 路径
 */
function findSystemChrome() {
  // 1. 优先使用用户或环境指定的环境变量
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const platform = os.platform();
  const candidates = [];

  if (platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      `${os.homedir()}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
    );
  } else if (platform === 'win32') {
    const prefixes = [
      process.env['PROGRAMFILES(X86)'],
      process.env.PROGRAMFILES,
      process.env.LOCALAPPDATA,
    ].filter(Boolean);

    for (const prefix of prefixes) {
      candidates.push(
        path.join(prefix, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(prefix, 'Google', 'Chrome', 'Application', 'chrome.exe')
      );
    }
  } else {
    // Linux
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser'
    );
  }

  // 检查已知的系统安装路径
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // 2. 检查 ~/.cache/puppeteer 下缓存的 Chrome
  const cacheRoot = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome');
  if (fs.existsSync(cacheRoot)) {
    try {
      const dirs = fs.readdirSync(cacheRoot);
      for (const d of dirs) {
        let binaryPath;
        if (platform === 'darwin') {
          // mac_arm-xxx/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
          const sub = path.join(cacheRoot, d);
          const found = findBinaryRecursive(sub, 'Google Chrome for Testing') || findBinaryRecursive(sub, 'Chromium');
          if (found) return found;
        } else if (platform === 'win32') {
          const sub = path.join(cacheRoot, d);
          const found = findBinaryRecursive(sub, 'chrome.exe');
          if (found) return found;
        } else {
          const sub = path.join(cacheRoot, d);
          const found = findBinaryRecursive(sub, 'chrome');
          if (found) return found;
        }
      }
    } catch (_) {}
  }

  return null;
}

function findBinaryRecursive(dir, name) {
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === name) {
      return full;
    }
    if (entry.isDirectory()) {
      const res = findBinaryRecursive(full, name);
      if (res) return res;
    }
  }
  return null;
}

/**
 * 寻找可用的 ffmpeg 命令或静态二进制路径
 */
function resolveFfmpegBin() {
  // 1. 系统 PATH 中有 ffmpeg
  try {
    const res = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    if (res.status === 0) return 'ffmpeg';
  } catch (_) {}

  // 2. 检查 HeyClaw 内置的 ffmpeg-tool 目录
  const platform = os.platform();
  const arch = os.arch();
  const possiblePaths = [
    // 本项目 skills/ffmpeg-tool
    path.resolve(__dirname, '../skills/ffmpeg-tool/assets'),
    path.resolve(__dirname, '../SKILLs/ffmpeg-tool/assets'),
    path.join(os.homedir(), 'Library/Application Support/HeyClaw/SKILLs/ffmpeg-tool/assets'),
    path.join(os.homedir(), 'Library/Application Support/HeyClawDev/SKILLs/ffmpeg-tool/assets'),
    path.join(os.homedir(), 'AppData/Roaming/HeyClaw/SKILLs/ffmpeg-tool/assets'),
  ];

  for (const p of possiblePaths) {
    let binPath = null;
    if (platform === 'darwin') {
      binPath = path.join(p, arch === 'arm64' ? 'macos-arm64/ffmpeg' : 'macos-x64/ffmpeg');
    } else if (platform === 'win32') {
      binPath = path.join(p, 'win-x64/ffmpeg.exe');
    }
    if (binPath && fs.existsSync(binPath)) {
      try {
        fs.chmodSync(binPath, 0o755);
      } catch (_) {}
      return binPath;
    }
  }

  console.error('============================================================');
  console.error('缺少 ffmpeg，无法合成视频。请先安装后再运行 render.js：');
  console.error('  macOS  :  brew install ffmpeg');
  console.error('  Windows:  winget install Gyan.FFmpeg (或 choco install ffmpeg)');
  console.error('============================================================');
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  let publicDir = null, outFile = 'output.mp4', fps = null, gpu = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-o') outFile = args[++i];
    else if (args[i] === '--fps') fps = parseInt(args[++i], 10);
    else if (args[i] === '--gpu') gpu = true;
    else if (!args[i].startsWith('-') && !publicDir) publicDir = args[i];
  }

  if (!publicDir) {
    console.error('用法: node render.js <public-dir> -o output.mp4 [--fps 30] [--gpu]');
    process.exit(1);
  }

  const htmlPath = path.resolve(publicDir, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    console.error('找不到 ' + htmlPath);
    process.exit(1);
  }

  const ffmpegBin = resolveFfmpegBin();
  console.log(`[render.js] 使用 ffmpeg: ${ffmpegBin}`);

  // 动态加载 puppeteer 或 puppeteer-core
  function resolvePuppeteer() {
    const appDataRoots = [
      path.join(os.homedir(), 'Library/Application Support/HeyClaw'),
      path.join(os.homedir(), 'Library/Application Support/HeyClawDev'),
      path.join(os.homedir(), 'AppData/Roaming/HeyClaw'),
      path.join(os.homedir(), 'AppData/Roaming/HeyClawDev'),
      path.join(os.homedir(), '.config/HeyClaw'),
    ];

    const candidates = [
      'puppeteer-core',
      'puppeteer',
      path.resolve(__dirname, 'node_modules/puppeteer-core'),
      path.resolve(__dirname, 'node_modules/puppeteer'),
      path.resolve(__dirname, '../node_modules/puppeteer-core'),
      path.resolve(__dirname, '../node_modules/puppeteer'),
      path.resolve(process.cwd(), 'node_modules/puppeteer-core'),
      path.resolve(process.cwd(), 'node_modules/puppeteer'),
    ];

    for (const appRoot of appDataRoots) {
      candidates.push(
        path.join(appRoot, 'node_modules/puppeteer-core'),
        path.join(appRoot, 'node_modules/puppeteer'),
        path.join(appRoot, 'cache/node_modules/puppeteer-core')
      );
    }

    for (const cand of candidates) {
      try {
        return require(cand);
      } catch (_) {}
    }

    // 确定一个持久的缓存安装目录，避免每次新项目临时目录都重新下载
    let installDir = appDataRoots.find(p => fs.existsSync(p));
    if (!installDir) {
      installDir = path.join(os.homedir(), '.cache', 'heyclaw-runtime');
    }
    const cacheDir = path.join(installDir, 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });

    console.log('[render.js] 首次运行，正在快速配置轻量 puppeteer-core 渲染驱动...');
    try {
      execSync('npm install --prefix "' + cacheDir + '" --no-audit --no-fund puppeteer-core', {
        stdio: 'inherit',
        cwd: cacheDir,
      });
      return require(path.join(cacheDir, 'node_modules/puppeteer-core'));
    } catch (_) {
      // 若写入缓存目录失败，降级在当前目录安装
      execSync('npm install --no-save puppeteer-core', { stdio: 'inherit', cwd: process.cwd() });
      return require('puppeteer-core');
    }
  }

  const puppeteer = resolvePuppeteer();

  const chromePath = findSystemChrome();
  if (chromePath) {
    console.log(`[render.js] 找到系统 Chromium/Chrome: ${chromePath}`);
  } else {
    console.log('[render.js] 未检测到系统现有浏览器，将使用 Puppeteer 默认实例');
  }

  // 临时动效帧目录
  const tmpDir = path.join(publicDir, '.render-frames');
  fs.mkdirSync(tmpDir, { recursive: true });
  for (const f of fs.readdirSync(tmpDir)) {
    fs.unlinkSync(path.join(tmpDir, f));
  }

  const launchOptions = {
    headless: 'new',
    args: gpu
      ? ['--use-gl=desktop', '--enable-webgl', '--allow-file-access-from-files']
      : ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files'],
  };
  if (chromePath) {
    launchOptions.executablePath = chromePath;
  }

  console.log('[render.js] 启动 Headless 渲染浏览器...');
  const browser = await puppeteer.launch(launchOptions);
  const page = await browser.newPage();

  // 注入透明背景策略：无论原 HTML 背景为何，强制动效图层背景全透明（图层分离核心）
  await page.evaluateOnNewDocument(() => {
    window.__IS_OVERLAY_RENDER__ = true;
  });

  await page.goto('file://' + htmlPath, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // 等待 stage 就绪（健全检测：支持 data-ready="1" 或已声明 data-duration 即视为就绪）
  await page.waitForFunction(
    () => {
      const s = document.getElementById('stage');
      return s && (s.dataset.ready === '1' || !!s.dataset.duration);
    },
    { timeout: 30000, polling: 200 }
  );

  // 读取 composition 规格及适配模式
  const info = await page.evaluate(() => {
    const stage = document.getElementById('stage');
    if (!stage) throw new Error('找不到 #stage 容器');
    const vw = document.getElementById('video-wrap') || document.querySelector('.video-wrapper');
    const vid = document.getElementById('bg-video') || (vw ? vw.querySelector('video') : null);

    // 适配模式：支持从 stage dataset 读取；未指定时自动推导（contain 信箱居中 vs cover 铺满裁剪）
    let fitMode = (stage.dataset.fitMode || '').trim().toLowerCase();
    if (!fitMode) {
      if (vw) {
        const style = window.getComputedStyle(vw);
        const vStyle = vid ? window.getComputedStyle(vid) : null;
        if (vStyle && vStyle.objectFit === 'contain') {
          fitMode = 'contain';
        } else if (parseFloat(style.top) > 50 || (vStyle && vStyle.objectFit === 'cover')) {
          fitMode = parseFloat(style.top) > 50 ? 'contain' : 'cover';
        }
      }
    }
    if (!fitMode) fitMode = 'cover';

    return {
      duration: parseFloat(stage.dataset.duration),
      fps: parseInt(stage.dataset.fps, 10) || 30,
      width: parseInt(stage.dataset.width, 10),
      height: parseInt(stage.dataset.height, 10),
      compId: stage.dataset.compositionId,
      fitMode,
    };
  });

  if (!fps) fps = info.fps;
  if (!info.duration || !info.width || !info.height) {
    console.error('stage 缺少 data-duration/data-width/data-height');
    await browser.close();
    process.exit(1);
  }

  await page.setViewport({ width: info.width, height: info.height, deviceScaleFactor: 1 });

  // 等待 GSAP timeline 就绪
  await page.waitForFunction(
    `!!(window.__timelines && window.__timelines["${info.compId}"])`,
    { timeout: 60000, polling: 300 }
  );

  // 智能检测是否包含画中画动画（#video-wrap / .pip-pill 动画）
  const hasPipAnimation = await page.evaluate((cid) => {
    const tl = window.__timelines && window.__timelines[cid];
    if (!tl) return false;
    const vWrap = document.getElementById('video-wrap') || document.querySelector('.video-wrapper');
    if (!vWrap) return false;
    // 检查时间线 targets 中是否包含 video wrapper
    const targets = typeof tl.getChildren === 'function'
      ? tl.getChildren(true, true, false).flatMap((t) => (t.targets ? t.targets() : []))
      : [];
    if (targets.includes(vWrap)) return true;
    // 或者页面源码中显式配置了 pip-pill
    if (document.querySelector('.pip-pill')) return true;
    return false;
  }, info.compId);

  const totalFrames = Math.ceil(info.duration * fps);
  const inputVideoPath = path.resolve(publicDir, 'input-video.mp4');
  const hasInputVideo = fs.existsSync(inputVideoPath);

  // 决定渲染策略：有画中画且有原视频时走全 DOM 渲染保证 100% 动效复原；否则走极速图层分离
  const useFullDomRender = hasPipAnimation && hasInputVideo;

  if (useFullDomRender) {
    console.log(`[render.js] 检测到画中画 (PiP) 动画，自动启用【全 DOM 视频图层同步渲染】以确保 100% 效果完全还原...`);
    await page.evaluate(async () => {
      // 恢复背景视频显示并预热
      const videoWrapper = document.getElementById('video-wrap') || document.querySelector('.video-wrapper');
      if (videoWrapper) videoWrapper.style.display = '';
      const bgVideo = document.getElementById('bg-video');
      if (bgVideo) {
        bgVideo.style.display = '';
        bgVideo.muted = true;
        bgVideo.preload = 'auto';
        if (bgVideo.readyState < 3) {
          await new Promise((res) => {
            bgVideo.addEventListener('loadeddata', res, { once: true });
            bgVideo.load();
          });
        }
        try { await bgVideo.play(); bgVideo.pause(); } catch (_) {}
      }
    });
  } else {
    console.log(`[render.js] 启用【极速图层分离架构】(适配模式: ${info.fitMode})，提取纯透明动效图层...`);
    // 隐藏背景视频元素，确保截图是纯透明 PNG 动效层
    await page.evaluate(() => {
      const videoWrapper = document.getElementById('video-wrap') || document.querySelector('.video-wrapper');
      if (videoWrapper) videoWrapper.style.display = 'none';
      const bgVideo = document.getElementById('bg-video');
      if (bgVideo) {
        bgVideo.pause();
        bgVideo.style.display = 'none';
      }
      document.documentElement.style.background = 'transparent';
      document.body.style.background = 'transparent';
      const stage = document.getElementById('stage');
      if (stage) stage.style.background = 'transparent';
    });
  }

  console.log(`[render.js] 画布规格: ${info.compId} | ${info.width}x${info.height} | ${info.duration}s @ ${fps}fps`);
  console.log(`[render.js] 开始提取帧序列 (共 ${totalFrames} 帧)...`);

  const startTime = Date.now();
  for (let i = 0; i < totalFrames; i++) {
    const t = i / fps;
    await page.evaluate(async (time, cid, isFullDom) => {
      const tl = window.__timelines[cid];
      if (tl) tl.seek(time, false);

      if (isFullDom) {
        const v = document.getElementById('bg-video');
        if (v) {
          if (Math.abs((v.currentTime || 0) - time) > 0.03) {
            v.currentTime = time;
            await new Promise((res) => {
              let done = false;
              const finish = () => { if (done) return; done = true; v.removeEventListener('seeked', finish); res(); };
              v.addEventListener('seeked', finish, { once: true });
              setTimeout(finish, 250);
            });
          }
          await new Promise((r) => requestAnimationFrame(() => r(null)));
          await new Promise((r) => requestAnimationFrame(() => r(null)));
        }
      }
    }, t, info.compId, useFullDomRender);

    const framePath = path.join(tmpDir, `frame-${String(i).padStart(6, '0')}.png`);
    await page.screenshot({
      path: framePath,
      omitBackground: !useFullDomRender, // 全DOM渲染保留背景，图层分离保留透明
      clip: { x: 0, y: 0, width: info.width, height: info.height },
    });

    if (i % 60 === 0 || i === totalFrames - 1) {
      const percent = (((i + 1) / totalFrames) * 100).toFixed(1);
      const speed = ((i + 1) / ((Date.now() - startTime) / 1000)).toFixed(1);
      console.log(`  渲染进度: ${i + 1}/${totalFrames} (${percent}%) - ${speed} fps`);
    }
  }

  await browser.close();
  const renderElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[render.js] 帧提取完成，耗时: ${renderElapsed}s`);

  // 合成阶段
  const framesPattern = path.join(tmpDir, 'frame-%06d.png');

  if (useFullDomRender) {
    // 全 DOM 渲染模式：帧序列自带视频画面，只需合并原声音频
    console.log(`[render.js] 执行音视频成片封装...`);
    const audioTmp = path.join(tmpDir, 'audio.aac');
    execSync(`"${ffmpegBin}" -y -i "${inputVideoPath}" -vn -acodec aac "${audioTmp}"`, { stdio: 'inherit' });
    const cmd = `"${ffmpegBin}" -y -framerate ${fps} -i "${framesPattern}" -i "${audioTmp}" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "${outFile}"`;
    execSync(cmd, { stdio: 'inherit' });
  } else if (hasInputVideo) {
    console.log(`[render.js] 发现原视频，执行高保真图层贴合 (适配模式: ${info.fitMode}, 画布: ${info.width}x${info.height})...`);
    // 适配滤镜：
    // cover 模式（铺满裁剪）：等比放大铺满画布，居中裁剪，不留黑边
    // contain 模式（信箱居中）：等比缩小居中，上下/左右补纯黑背景，保留完整画面
    let filter;
    if (info.fitMode === 'contain') {
      filter = `[0:v]scale=${info.width}:${info.height}:force_original_aspect_ratio=decrease,pad=${info.width}:${info.height}:(ow-iw)/2:(oh-ih)/2:color=black[base];[base][1:v]overlay=0:0:shortest=1[outv]`;
    } else {
      filter = `[0:v]scale=${info.width}:${info.height}:force_original_aspect_ratio=increase,crop=${info.width}:${info.height}[base];[base][1:v]overlay=0:0:shortest=1[outv]`;
    }
    const cmd = `"${ffmpegBin}" -y -i "${inputVideoPath}" -framerate ${fps} -i "${framesPattern}" -filter_complex "${filter}" -map "[outv]" -map 0:a? -c:v libx264 -pix_fmt yuv420p -c:a copy "${outFile}"`;
    execSync(cmd, { stdio: 'inherit' });
  } else {
    console.log(`[render.js] 未检测到 input-video.mp4，直接导出动效视频...`);
    const cmd = `"${ffmpegBin}" -y -framerate ${fps} -i "${framesPattern}" -c:v libx264 -pix_fmt yuv420p "${outFile}"`;
    execSync(cmd, { stdio: 'inherit' });
  }

  // 清理临时帧
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`[render.js] 全部渲染合成完成！成片位置: ${path.resolve(outFile)}`);
}

main().catch((e) => {
  console.error('[render.js] 运行异常:', e);
  process.exit(1);
});

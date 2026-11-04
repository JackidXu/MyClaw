#!/usr/bin/env node
/**
 * script-to-motion-video 渲染器
 * 把 HTML composition（含 GSAP timeline）逐帧渲染成 mp4
 *
 * 用法：
 *   渲染视频：node render.js <composition-dir> -o <output.mp4> [--fps 30]
 *   抽帧验证：node render.js <composition-dir> --snapshot --at 5,15,25 --output <dir>
 *
 * 依赖：
 *   - puppeteer（首次运行自动安装，或手动 npm install puppeteer）
 *   - ffmpeg（系统级二进制，缺失时自动提示安装命令）
 *
 * 流程：
 *   1. 读取 project.json 获取 duration/width/height/fps
 *   2. puppeteer 启动 headless Chrome，加载 index.html
 *   3. 等待 GSAP timeline + 视频/音频就绪
 *   4. 按 fps 逐帧：tl.seek(time) → 截图 → 存盘
 *   5. ffmpeg 帧序列 → output.mp4
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

/**
 * 寻找可用的 Chrome / Edge / Chromium 路径
 */
function findSystemChrome() {
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
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser'
    );
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  // 检查 ~/.cache/puppeteer 下缓存的 Chrome
  const cacheRoot = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome');
  if (fs.existsSync(cacheRoot)) {
    try {
      const dirs = fs.readdirSync(cacheRoot);
      for (const d of dirs) {
        const sub = path.join(cacheRoot, d);
        const name = platform === 'darwin' ? 'Google Chrome for Testing' : platform === 'win32' ? 'chrome.exe' : 'chrome';
        const found = findBinaryRecursive(sub, name);
        if (found) return found;
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
    if (entry.isFile() && entry.name === name) return full;
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
  try {
    const res = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    if (res.status === 0) return 'ffmpeg';
  } catch (_) {}

  const platform = os.platform();
  const arch = os.arch();
  const possiblePaths = [
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
      try { fs.chmodSync(binPath, 0o755); } catch (_) {}
      return binPath;
    }
  }

  console.error('============================================================');
  console.error('缺少 ffmpeg，无法合成视频。请先安装：');
  console.error('  macOS  :  brew install ffmpeg');
  console.error('  Ubuntu :  sudo apt install -y ffmpeg');
  console.error('  Windows:  choco install ffmpeg   （或 winget install Gyan.FFmpeg）');
  console.error('============================================================');
  process.exit(1);
}

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
    execSync('npm install --no-save puppeteer-core', { stdio: 'inherit', cwd: process.cwd() });
    return require('puppeteer-core');
  }
}

// ===== 解析参数 =====
function parseArgs() {
  const args = process.argv.slice(2);
  let compDir = null, outFile = 'output.mp4', fps = 30;
  let snapshot = false, snapAt = [], snapOutput = null, tighten = false, noGrid = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-o' || args[i] === '--output') outFile = args[++i];
    else if (args[i] === '--fps') fps = parseInt(args[++i]);
    else if (args[i] === '--snapshot') snapshot = true;
    else if (args[i] === '--tighten') tighten = true;
    else if (args[i] === '--no-grid') noGrid = true;
    else if (args[i] === '--at') snapAt = args[++i].split(',').map(s => parseFloat(s.trim()));
    else if (!args[i].startsWith('-') && !compDir) compDir = args[i];
  }
  if (!compDir) {
    console.error('用法:');
    console.error('  渲染视频: node render.js <composition-dir> -o output.mp4 [--fps 30] [--tighten]');
    console.error('  抽帧验证: node render.js <composition-dir> --snapshot --at 5,15,25 --output <dir>');
    process.exit(1);
  }
  return { compDir, outFile, fps, snapshot, snapAt, tighten, noGrid, snapOutput: snapshot ? outFile : null };
}

async function main() {
  const { compDir, outFile, fps, snapshot, snapAt } = parseArgs();

  const htmlPath = path.resolve(compDir, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    console.error('找不到 ' + htmlPath);
    process.exit(1);
  }

  // 读取 project.json（技能自有配置）
  let config = {};
  const configPath = path.resolve(compDir, 'project.json');
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  const duration = config.duration || 30;
  const width = config.width || 1080;
  const height = config.height || 1920;
  const effFps = config.fps || fps;

  console.log(`Composition: ${width}x${height} ${effFps}fps ${duration}s`);

  // ===== 动态加载 puppeteer =====
  const puppeteer = resolvePuppeteer();
  const ffmpegBin = resolveFfmpegBin();
  console.log(`[render.js] 使用 ffmpeg: ${ffmpegBin}`);

  // ===== 临时帧目录 =====
  const tmpDir = path.resolve(compDir, '.render-frames');
  fs.mkdirSync(tmpDir, { recursive: true });
  for (const f of fs.readdirSync(tmpDir)) {
    try { fs.unlinkSync(path.join(tmpDir, f)); } catch (e) {}
  }

  // ===== 启动 Chrome =====
  const launchArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'];
  const executablePath = findSystemChrome();
  if (executablePath) {
    console.log(`[render.js] 找到系统 Chromium/Chrome: ${executablePath}`);
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: launchArgs,
    ...(executablePath ? { executablePath } : {})
  });

  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'domcontentloaded', timeout: 120000 });

  // 等待 GSAP 就绪
  await page.waitForFunction("typeof gsap !== 'undefined'", { timeout: 30000 });

  // 等待 @font-face 字体加载完成（确保截图时用自带字体而非系统回退）
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  });
  await new Promise(r => setTimeout(r, 800));

  // 预加载所有视频和音频
  await page.evaluate(async () => {
    const videos = document.querySelectorAll('video');
    for (const v of videos) {
      v.muted = true;
      v.preload = 'auto';
      if (v.readyState < 2) {
        await new Promise(res => {
          v.addEventListener('loadeddata', res, { once: true });
          v.addEventListener('error', res, { once: true });
          v.load();
        });
      }
    }
    const audios = document.querySelectorAll('audio');
    for (const a of audios) {
      a.preload = 'auto';
      if (a.readyState < 2) {
        await new Promise(res => {
          a.addEventListener('loadeddata', res, { once: true });
          a.addEventListener('error', res, { once: true });
          a.load();
        });
      }
    }
  });
  await new Promise(r => setTimeout(r, 500));

  if (snapshot) {
    // ===== 抽帧模式 =====
    const outDir = path.resolve(outFile);
    fs.mkdirSync(outDir, { recursive: true });

    for (let i = 0; i < snapAt.length; i++) {
      const t = snapAt[i];
      console.log(`  抽帧 ${t}s ...`);

      await page.evaluate(async (time) => {
        // seek GSAP timeline
        if (typeof tl !== 'undefined' && tl) {
          tl.seek(time);
          tl.pause();
        }
        // seek 视频（与渲染模式一致：按 data-scene-start 推进到场景相对时间 + 等 seeked）
        const vids = Array.from(document.querySelectorAll('video'));
        await Promise.all(vids.map(v => new Promise(res => {
          const start = parseFloat(v.dataset.sceneStart);
          if (!isNaN(start)) {
            const rt = time - start;
            if (rt >= 0) {
              const dur = v.duration || 0;
              try { v.currentTime = dur > 0 ? (rt % dur) : rt; } catch (e) {}
            }
          } else {
            console.warn(`[render] 视频 ${v.id || '(无id)'} 缺少 data-scene-start，将退回绝对时间，长素材会冻结——请补全该属性`);
            try { v.currentTime = time; v.pause(); } catch (e) {}
          }
          let done = false;
          const fin = () => { if (!done) { done = true; res(); } };
          v.addEventListener('seeked', fin, { once: true });
          setTimeout(fin, 300);
        })));
      }, t);

      await new Promise(r => setTimeout(r, 200));

      const framePath = path.join(outDir, `frame-${String(i).padStart(2, '0')}-at-${t}s.png`);
      await page.screenshot({ path: framePath, clip: { x: 0, y: 0, width, height } });
      console.log(`  ✓ ${framePath}`);
    }

    await browser.close();
    console.log(`\n抽帧完成：${snapAt.length} 张 → ${outDir}`);
    return;
  }

  // ===== 渲染模式：逐帧截图 =====
  const totalFrames = Math.ceil(duration * effFps);
  console.log(`开始渲染：${totalFrames} 帧 ...`);

  for (let frame = 0; frame < totalFrames; frame++) {
    const time = frame / effFps;

    if (frame % 100 === 0) {
      console.log(`  渲染 ${frame}/${totalFrames} (${(frame / totalFrames * 100).toFixed(0)}%)`);
    }

    await page.evaluate(async (t) => {
      // seek GSAP timeline
      if (typeof tl !== 'undefined' && tl) {
        tl.seek(t);
        tl.pause();
      }
      // 推进成片内【所有】<video> 到「场景相对时间」：每个 <video>（bg-vid 背景 或 clip 前景）都要带
      // data-scene-start（见 background-assets.md），记录其所属场景起点；成片绝对时间 t 减起点得场景内
      // 相对时间 rt；rt 超过素材时长则循环，避免冻结在末帧。不限于背景视频，前景 clip 同样需要。
      const vids = Array.from(document.querySelectorAll('video'));
      await Promise.all(vids.map(v => new Promise(res => {
        const start = parseFloat(v.dataset.sceneStart);
        if (!isNaN(start)) {
          const rt = t - start;
          if (rt >= 0) {
            const dur = v.duration || 0;
            try { v.currentTime = dur > 0 ? (rt % dur) : rt; } catch (e) {}
          }
        } else {
          // 未标注 data-scene-start：退回绝对时间分支，长素材会冻结在末帧（成片卡顿）
          console.warn(`[render] 视频 ${v.id || '(无id)'} 缺少 data-scene-start，将退回绝对时间，长素材会冻结——请补全该属性`);
          try { v.currentTime = t; } catch (e) {}
        }
        let done = false;
        const fin = () => { if (!done) { done = true; res(); } };
        v.addEventListener('seeked', fin, { once: true });
        setTimeout(fin, 300); // seek 不支持/失败时的兜底
      })));
    }, time);

    // 等待渲染稳定（seeked 已在上面 await，这里仅留极短缓冲）
    await new Promise(r => setTimeout(r, frame < 3 ? 200 : 30));

    const framePath = path.join(tmpDir, `frame_${String(frame).padStart(6, '0')}.png`);
    await page.screenshot({ path: framePath, clip: { x: 0, y: 0, width, height } });
  }

  await browser.close();
  console.log(`截图完成，开始合成视频 ...`);

  // ===== ffmpeg 合成 =====
  // 帧序列 → mp4
  const framePattern = path.join(tmpDir, 'frame_%06d.png');
  const outputAbs = path.resolve(outFile);
  const outputDir = path.dirname(outputAbs);
  fs.mkdirSync(outputDir, { recursive: true });

  // 合成视频（无音频，音频由 composition 内的 <audio> 在浏览器里播放，截图时不捕获）
  // 如需音频，用 -i 合并音频文件
  let audioFiles = [];
  const singleAudioCandidates = [
    path.resolve(compDir, 'narration.mp3'),
    path.resolve(compDir, 'audio', 'narration.mp3'),
    path.resolve(compDir, 'narration.m4a'),
    path.resolve(compDir, 'audio', 'narration.m4a'),
    path.resolve(compDir, 'audio.mp3'),
    path.resolve(compDir, 'audio', 'audio.mp3')
  ];
  const detectedSingleAudio = singleAudioCandidates.find(p => fs.existsSync(p));
  if (detectedSingleAudio) {
    audioFiles = [detectedSingleAudio];
    console.log(`[render.js] 检测到完整独立旁白音频：${path.relative(compDir, detectedSingleAudio)}`);
  } else {
    const audioDir = path.resolve(compDir, 'audio');
    if (fs.existsSync(audioDir)) {
      // 兼容分段切片模式：只认 segNN.mp3
      const files = fs.readdirSync(audioDir).filter(f => /^seg\d+\.mp3$/.test(f)).sort();
      for (const f of files) {
        audioFiles.push(path.join(audioDir, f));
      }
    }
  }

  let ffmpegCmd;
  if (audioFiles.length > 0) {
    // 有音频：先合成视频，再合并音频
    const silentVideo = path.join(tmpDir, '_silent.mp4');
    ffmpegCmd = `ffmpeg -y -framerate ${effFps} -i "${framePattern}" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 20 "${silentVideo}"`;
    execSync(ffmpegCmd, { stdio: 'inherit' });

    // 合并音频：直接 concat 各段（各段是「整条连续录音」的相邻切片，拼回去就是原音频）
    // 不用 acrossfade —— 切片本就首尾相接，加 crossfade 反而会在接缝处叠出回声/死区
    let mergedAudio;
    if (audioFiles.length === 1) {
      mergedAudio = audioFiles[0];
    } else {
      mergedAudio = path.join(tmpDir, '_merged.mp3');
      const inputs = audioFiles.map(f => `-i "${f}"`).join(' ');
      const labels = audioFiles.map((_, i) => `[${i}]`).join('');
      const filterStr = `${labels}concat=n=${audioFiles.length}:v=0:a=1[out]`;
      execSync(`"${ffmpegBin}" -y ${inputs} -filter_complex "${filterStr}" -map "[out]" -c:a aac -b:a 192k "${mergedAudio}"`, { stdio: 'inherit' });
    }

    const rawExport = tighten ? path.join(tmpDir, '_raw_export.mp4') : outputAbs;
    ffmpegCmd = `"${ffmpegBin}" -y -i "${silentVideo}" -i "${mergedAudio}" -c:v copy -c:a aac -shortest "${rawExport}"`;
    execSync(ffmpegCmd, { stdio: 'inherit' });

    if (tighten) {
      console.log(`\n正在执行紧凑化剪切（去气口，消除场景间停顿）...`);
      try {
        // 使用 silenceremove 自动裁除中间静默超过 0.5s 的空隙
        const tightenCmd = `"${ffmpegBin}" -y -i "${rawExport}" -af "silenceremove=stop_periods=-1:stop_duration=0.5:stop_threshold=-38dB" -c:v copy -c:a aac "${outputAbs}"`;
        execSync(tightenCmd, { stdio: 'inherit' });
        console.log(`  ✓ 紧凑化完成`);
      } catch (e) {
        console.warn(`[render.js] 紧凑化滤镜跳过，保留原成片：${e.message}`);
        fs.copyFileSync(rawExport, outputAbs);
      }
    }
  } else {
    // 无音频：直接合成视频
    ffmpegCmd = `"${ffmpegBin}" -y -framerate ${effFps} -i "${framePattern}" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 20 "${outputAbs}"`;
    execSync(ffmpegCmd, { stdio: 'inherit' });
  }

  // 清理临时帧
  try {
    for (const f of fs.readdirSync(tmpDir)) {
      fs.unlinkSync(path.join(tmpDir, f));
    }
    fs.rmdirSync(tmpDir);
  } catch (e) {}

  // 自动生成九宫格总览图供模型/用户一次性快速验收 (preview_grid.jpg)
  if (!noGrid && totalFrames > 0) {
    const gridPath = path.join(outputDir, `${path.basename(outputAbs, path.extname(outputAbs))}_grid.jpg`);
    try {
      const step = Math.max(1, Math.floor(totalFrames / 9));
      const tileCmd = `"${ffmpegBin}" -y -i "${outputAbs}" -vf "select='not(mod(n\\,${step}))',scale=360:640,tile=3x3" -frames:v 1 -q:v 2 "${gridPath}"`;
      execSync(tileCmd, { stdio: 'ignore' });
      if (fs.existsSync(gridPath)) {
        console.log(`  ✓ 已生成全片九宫格验收图: ${gridPath}`);
      }
    } catch (_) {}
  }

  const stat = fs.statSync(outputAbs);
  console.log(`\n完成：${outputAbs} (${(stat.size / 1048576).toFixed(1)} MB)`);
}

main().catch(err => {
  console.error('渲染失败:', err.message);
  process.exit(1);
});

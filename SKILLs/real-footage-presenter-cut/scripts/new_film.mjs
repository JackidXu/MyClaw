// 一条命令建片子（模板档）：页面 + 底座 + 模板库 + 纹理 + 字体 + 估出来的时间线，建完就能 render.mjs --stills。
//   node scripts/new_film.mjs <片子目录>            新片：film.js 是带注释的镜头表起点，script.json 是三句示例
//   node scripts/new_film.mjs <片子目录> --sync     老片子：只把 lib/ 和 assets/kit/ 更新到 skill 的最新版（film.js、素材不动）
// 字体不拷：fonts/ 是指向字体目录的联接，联接建不了才拷。字体目录写在 scripts/local.json 的 fonts_dir（没写就用 skill 里的 fonts/）。
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import {stub} from './timeline_stub.mjs';

const SK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), dst = args.find(a => !a.startsWith('--')), SYNC = args.includes('--sync');
if (args.some(a => a === '--demo' || a === '--demo2')) { console.error('本技能只做真人口播片，没有示例片模式。场景参数怎么写看 kit/demo/film.js 和 kit/demo2/film.js（纯代码参考，不接入口播帧、不能建片）；成片一律从 starter/ 起。'); process.exit(1); }
if (!dst) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 6).join('\n')); process.exit(1); }
const D = path.resolve(dst);
let local = {}; try { local = JSON.parse(fs.readFileSync(path.join(SK, 'scripts/local.json'), 'utf8')); } catch {}
const FONTS = path.resolve(local.fonts_dir ?? path.join(SK, 'fonts'));
const LIB = ['scripts/stage25d.js', 'scripts/film_base.js', 'scripts/moves.js', 'kit/kit.js', 'kit/scenes.js', 'kit/scenes_plus.js', 'kit/semantic_scenes.js', 'kit/host.js', 'kit/kit.css'];
const cp = (a, b) => { fs.mkdirSync(path.dirname(b), {recursive: true}); fs.copyFileSync(a, b); };

function copyLib() {
  for (const f of LIB) cp(path.join(SK, f), path.join(D, 'lib', path.basename(f)));
  for (const f of ['fabric.jpg', 'grain.png', 'worldmap.png']) cp(path.join(SK, 'kit/assets', f), path.join(D, 'assets/kit', f));
  for (const f of fs.readdirSync(path.join(SK, 'kit/assets/ph'))) cp(path.join(SK, 'kit/assets/ph', f), path.join(D, 'assets/kit/ph', f));
}
function linkFonts() {
  const to = path.join(D, 'fonts');
  if (fs.existsSync(to)) return;
  if (!fs.existsSync(FONTS)) { console.warn(`没找到字体目录 ${FONTS}：会退到系统字体（Noto Sans SC / 微软雅黑），样子不对。在 scripts/local.json 里写 fonts_dir，字体清单见 README`); return; }
  try { fs.symlinkSync(FONTS, to, 'junction'); }
  catch { fs.mkdirSync(to); for (const f of fs.readdirSync(FONTS)) if (/\.(ttf|otf|woff2?)$/i.test(f)) fs.copyFileSync(path.join(FONTS, f), path.join(to, f)); }
}

if (SYNC) {
  if (!fs.existsSync(path.join(D, 'index.html'))) { console.error(`${D} 不是片子目录（没有 index.html）`); process.exit(1); }
  copyLib(); linkFonts();
  console.log(`已更新 ${D}\\lib 和 assets\\kit 到 skill 的最新版。先 --stills 看几帧，确认老镜头没有变样。`);
  process.exit(0);
}
if (fs.existsSync(D) && fs.readdirSync(D).length) { console.error(`目标已存在且不是空的：${D}`); process.exit(1); }
fs.mkdirSync(D, {recursive: true});
const src = path.join(SK, 'starter');
cp(path.join(SK, 'starter/index.html'), path.join(D, 'index.html'));
cp(path.join(SK, 'starter/film.css'), path.join(D, 'film.css'));
cp(path.join(src, 'film.js'), path.join(D, 'film.js'));
cp(path.join(src, 'art.js'), path.join(D, 'art.js'));
cp(path.join(src, 'script.json'), path.join(D, 'script.json'));
copyLib(); linkFonts();
for (const d of ['assets/img', 'assets/clips', 'assets/cut', 'voice', 'out']) fs.mkdirSync(path.join(D, d), {recursive: true});
fs.writeFileSync(path.join(D, 'assets/clips/counts.json'), '{}');
// host.js 会 fetch fit.json 读竖屏换算信息；先给空的，避免新建片 404 被当成「页面报错」。
// 跑完 footage.py host 会被真实的画幅信息覆盖。
fs.writeFileSync(path.join(D, 'assets/clips/fit.json'), '{}');
const tl = stub(JSON.parse(fs.readFileSync(path.join(D, 'script.json'), 'utf8')));
fs.writeFileSync(path.join(D, 'timeline.json'), JSON.stringify(tl, null, 1));
const R = path.join(SK, 'scripts/render.mjs');
console.log(`建好了：${D}（占位时间线 ${tl.duration} 秒；正式时间线由 host_timeline.py 从口播原片逐字对齐生成）`);
console.log('下一步：');
const steps = [
  `抽口播帧：python "${path.join(SK, 'scripts/footage.py')}" host 口播.mp4 "${D}"    竖屏自动「中间完整 + 两侧虚化」，不裁人；帧数自动登记到 counts.json`,
  `转写口播逐字填 script.json（一句一个 id），和用户核对识别错的字`,
  `python "${path.join(SK, 'scripts/host_timeline.py')}" 口播.mp4 "${path.join(D, 'script.json')}" "${path.join(D, 'timeline.json')}"    逐字对齐，覆盖占位时间线`,
  `写 film.js：带真素材的镜头优先用原技能场景并写足动效参数；一镜一个主动作，别全片只用荧光笔（同族不连用三镜，≥5 镜分散到 3 族），每镜停够 2.6 / 3.0 / 3.4 秒（popup 2.6 秒）；host 的 zoom 档位别挤在一起、popup 看完就缩回别留长静止段；见 references/footage-effects.md 的「动效配比」「停留时间」「画面别抖、别死」`,
  `非素材镜头按 references/semantic-thinking.md 的四步自己设计画面，写在 art.js 里；不要写 semantic，技能不会自动替你画`];
steps.push(`node "${R}" --dir "${D}" --check            查镜头表（几秒钟，不渲染），改到零错误；会检查素材动效有没有写、有没有重复（全片刷黄）、每镜停够没有、景别跳有没有挤在一起抖、popup 有没有长段画面不动`,
  `node "${R}" --dir "${D}" --sheet            每镜三帧拼一张图（out/sheet.png），自己先看一遍`,
  `node "${R}" --dir "${D}" --video --h 720    渲 720p 预览（没声音）`);
steps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
console.log(`注意：fonts\\ 是指向字体目录的联接。删这个片子目录前先拆联接（只删联接，不删字体）：node -e "require('fs').rmdirSync(process.argv[1])" "${path.join(D, 'fonts')}"，再删目录。`);

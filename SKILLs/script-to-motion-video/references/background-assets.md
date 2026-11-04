# 背景素材获取指南

收到场景清单后，为每个场景找背景素材。核心原则：**优先搜视频素材（有动态感），无合适视频再退回搜图片**。

## 一、7 个免费素材渠道

| 渠道           | 内容类型         | 费用     | 注册     | 获取方式                                   | 推荐度        |
| ------------ | ------------ | ------ | ------ | -------------------------------------- | ---------- |
| **Pexels**   | 视频 + 图片      | CC0 免费 | 注册（免费） | 直链下载 `pexels.com/download/video/<id>/` | ★★★★★ 视频首选 |
| **Pixabay**  | 视频 + 图片 + 音乐 | CC0 免费 | 注册（免费） | API 或直链                                | ★★★★★      |
| **Coverr**   | 视频           | 免费商用   | 无需注册   | 直链下载                                   | ★★★★☆      |
| **Mixkit**   | 视频 + 音乐      | 免费商用   | 无需注册   | 直链下载                                   | ★★★★☆      |
| **Videvo**   | 视频           | 部分免费   | 注册（免费） | 直链下载                                   | ★★★☆☆      |
| **Unsplash** | 图片           | 免费商用   | 注册（免费） | API 或直链                                | ★★★★☆ 图片首选 |

**默认渠道**：视频用 Pexels，图片用 Unsplash。两个都免费、可商用、支持直链下载。

## 二、搜索关键词建议

按文案主题搜素材，用中英双语关键词（英文素材更多）：

| 文案主题          | 搜索关键词                                                             |
| ------------- | ----------------------------------------------------------------- |
| 医疗 / 医生 / 患者  | `medical doctor`, `hospital`, `patient`, `stethoscope`, `surgery` |
| 商业 / 创业 / 管理  | `business meeting`, `office`, `entrepreneur`, `teamwork`          |
| 科技 / 数字化 / AI | `technology`, `digital`, `AI`, `computer`, `data`                 |
| 教育 / 学习 / 成长  | `education`, `study`, `books`, `student`, `learning`              |
| 健康 / 生活 / 日常  | `healthy lifestyle`, `fitness`, `nature`, `wellness`              |
| 情感 / 关系 / 家庭  | `family`, `relationship`, `emotions`, `people`                    |
| 美食 / 餐饮       | `food`, `cooking`, `restaurant`, `chef`                           |
| 旅行 / 风景       | `travel`, `landscape`, `city`, `nature`                           |

搜索时用英文关键词（Pexels/Unsplash 英文素材库更大），结果更丰富。

### 怎么把关键词变成可下载的 URL（搜索环节，必须执行）

上面只给了「搜什么词」，下面是把词变成「可下载直链」的具体动作。**AI 必须实际执行搜索拿到 URL，不能只列关键词就跳到下载——这正是「优先视频」能否落地的关键。**

**Pexels（视频首选，需 API key 才能搜）**
1. 申请 key（免费，约 1 分钟）：打开 pexels.com/api → 注册/登录 → 复制「Your API Key」，设为环境变量 `PEXELS_API_KEY`。
2. 用 key 搜视频列表（返回 JSON，含各分辨率直链）：
```bash
curl -s -H "Authorization: <PEXELS_API_KEY>" \
  "https://api.pexels.com/videos/search?query=medical%20doctor&per_page=10" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); [print(v['video_files'][0]['link']) for v in d.get('videos',[])]"
```
3. 挑主题匹配、时长足够的直链，按「三、下载脚本」的直链方式下到 `public/vid/`。

**Pixabay（视频 + 图片，需 API key）**：key 从 pixabay.com/api 申请，搜视频用 `https://pixabay.com/api/videos/?key=<PIXABAY_KEY>&q=medical+doctor`，结果里取视频直链。

**免 key 视频站（Coverr / Mixkit，无 key 但需解析页面）**
- Coverr：搜索页 `https://coverr.co/search?q=<关键词>`，打开结果页，页面 `<source>` 或视频 `src` 即为直链；用 curl 取页面、提取 `.mp4` 直链下载。
- Mixkit：搜索/分类页 `https://mixkit.co/free-stock-video/<关键词>/`，结果卡的 `data-src` / `<source>` 为直链。
- 注意：这两站页面结构可能随改版变化导致解析失败，**解析失败时不要死磕，直接降级到下一级**（见七、降级阶梯）。

**Unsplash（图片首选）**：用 Unsplash API（免费 key）搜具体照片，拿 `photos/<id>/download` 直链（见三、下载脚本）；不要依赖已收紧的随机关键词接口。

## 三、下载脚本

### Pexels 视频下载

Pexels 视频页 URL 格式：`https://www.pexels.com/video/<title>-<id>/`  
下载直链：`https://www.pexels.com/download/video/<id>/`

```bash
# 下载视频（无需 API key，直链即可）
curl -L -s -o raw.mp4 "https://www.pexels.com/download/video/5867916/"
```

### Pixabay 视频下载

Pixabay 需注册获取 API key，但也可直接从视频页下载：

```bash
# 直链下载（从视频页提取）
curl -L -s -o raw.mp4 "https://pixabay.com/videos/download/<id>"
```

### Unsplash 图片下载

```bash
# 直链下载（无需 API key）
curl -L -s -o bg.jpg "https://unsplash.com/photos/<id>/download"
# 指定尺寸
curl -L -s -o bg.jpg "https://unsplash.com/photos/<id>/download?w=1080"
```

### 批量下载脚本

```bash
#!/bin/bash
# download_assets.sh — 从 scene-plan.json 批量下载背景素材
# 用法: ./download_assets.sh scene-plan.json public/vid public/img

PLAN=$1
VID_DIR=$2
IMG_DIR=$3
mkdir -p "$VID_DIR" "$IMG_DIR"

# 遍历 scene-plan.json 的 scenes，下载每个场景的 asset_url
python3 -c "
import json, os, sys
plan = json.load(open('$PLAN'))
for s in plan['scenes']:
    sid = s['id']
    if 'asset_url' not in s: continue
    url = s['asset_url']
    if url.endswith('.mp4'):
        path = f'$VID_DIR/{sid}-bg.mp4'
    else:
        path = f'$IMG_DIR/{sid}-bg.jpg'
    if not os.path.exists(path):
        os.system(f'curl -L -s -o \"{path}\" \"{url}\"')
        print(f'下载 {sid}: {path}')
    else:
        print(f'已存在 {sid}: {path}')
"
```

## 四、ffmpeg 压缩视频素材

从 Pexels/Pixabay 下载的视频通常是 4K（2160×4096 等），需压缩到 1080×1920 30fps。

### 竖屏 9:16 压缩

```bash
ffmpeg -y -i raw.mp4 -ss 0 -t <场景时长> \
  -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30" \
  -an -vsync cfr -g 30 -keyint_min 30 -preset fast -crf 28 \
  output-bg.mp4
```

参数说明：

- `-ss 0 -t <时长>`：从开头截取场景所需时长（如 `-t 7`）
- `scale=1080:1920:force_original_aspect_ratio=increase`：等比放大到覆盖 1080×1920
- `crop=1080:1920`：裁剪到精确 1080×1920
- `fps=30`：统一 30fps
- `-an`：去除音频（背景视频不要声音）
- `-vsync cfr -g 30 -keyint_min 30`：恒定帧率 + 每 30 帧一个关键帧，让 render.js 逐帧 seek 精准、不漂（关键帧间隔过大是 seek 漂移、背景抖动的主因）
- `-preset fast -crf 28`：快速编码 + 合理质量（crf 18-28，越小质量越高）

### 横屏 16:9 压缩

```bash
ffmpeg -y -i raw.mp4 -ss 0 -t <场景时长> \
  -vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30" \
  -an -preset fast -crf 28 \
  output-bg.mp4
```

### 批量压缩脚本

```bash
#!/bin/bash
# compress_videos.sh — 批量压缩 raw 视频到目标分辨率
for raw in public/vid/raw-*.mp4; do
    sid=$(basename "$raw" | sed 's/raw-\(.*\)\.mp4/\1/')
    ffmpeg -y -i "$raw" -ss 0 -t 8 \
      -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30" \
      -an -preset fast -crf 28 \
      "public/vid/${sid}-bg.mp4"
    rm "$raw"
done
```

## 五、素材选择原则

1. **匹配文案主题**：每个场景的背景素材要能讲该场景文案的故事。素材画面要跟文案讲的场景/人物/行业对应，不用无关素材
2. **质量优先**：选画面清晰、构图好、有动态感的素材。避免模糊、静止、低分辨率
3. **情绪匹配**：背景画面的情绪要跟文案基调一致。诊断痛点用偏沉的画面，讲方案用偏亮的画面
4. **人物优先**：有人物的素材比纯景物更有代入感（除非文案讲概念/数据）
5. **时长足够**：视频素材时长 ≥ 场景时长 + 1 秒（留余量给 Ken Burns 位移）

## 六、视频背景在 composition 里的使用

### HTML 写法

```html

<video class="bg-vid" id="s1-bg"
       data-scene-start="0"
       src="public/vid/s1-bg.mp4"
       autoplay muted loop playsinline preload="auto">
</video>


<div class="bg" id="s2-bg" style="background-image:url('public/img/s2-bg.jpg');"></div>
```

### CSS 样式

```css
/* 图片背景：inset:-12% 留 Ken Burns 位移空间 */
.bg {
  position: absolute; inset: -12%;
  background-size: cover; background-position: center;
  will-change: transform; transform-origin: center center;
}

/* 视频背景：inset:-15% + width/height:130% 留更多位移空间 */
video.bg-vid {
  position: absolute; inset: -15%;
  width: 130%; height: 130%;
  object-fit: cover;
  will-change: transform; transform-origin: center center;
}
```

### JS 播放控制（关键）

视频背景在场景切换时需要重置并播放。用 GSAP `call()` 在场景开始时控制：

```javascript
// 场景开始时重置视频并播放
tl.call(() => {
  const v = document.getElementById('s1-bg');
  if (v) { v.currentTime = 0; v.play().catch(()=>{}); }
}, [], 0);  // 0 = 场景开始时间

// 视频背景的 Ken Burns（幅度比图片小，因为视频本身已动）
tl.fromTo("#s1-bg", { scale: 1.0, x: 0, y: 0 },
  { scale: 1.2, x: -40, y: 20, duration: 6.3, ease: "power1.inOut" }, 0);
```

**关键点**：

- `preload="auto"`：让浏览器预加载视频
- `autoplay muted`：静音自动播放（浏览器策略要求）
- **`data-scene-start`（必须，成片内所有 `<video>` 都要）**：成片里每一个 `<video>`——不论 `bg-vid` 背景视频还是 `clip` 前景视频——都必须加这个属性，值等于它所属场景的 `data-start`（成片绝对时间）。render.js 渲染时会逐帧 seek **所有** `<video>`，按此属性把视频推进到「场景内相对时间」并循环；缺了它就会退回 `currentTime = t` 的绝对时间分支，当成片绝对时间超过素材长度，该视频冻结在末帧（背景"像一张图慢慢推"、前景产品视频播到末尾卡住，根因都在此）。例如场景 2 的 `data-start=6.5`，则其视频（无论 bg 还是 clip）写 `data-scene-start="6.5"`。
- `GSAP call()` 重置 currentTime：场景切换时视频从头播放，不会卡在上一场景的帧（render.js 现已用相对时间接管，此 call 作冗余保险）
- Ken Burns 幅度：视频背景 scale 1.0→1.2（图片背景 scale 1.0→1.4~1.5），因为视频本身已有动态感，位移幅度小一些避免画面晃动

## 七、降级阶梯（视频 → 图片 → AI 生图）

背景素材按以下顺序逐级降级，**上一级成功就用上一级，不要跳过**：

1. **视频（Pexels / Pixabay API 搜）**：主题匹配、时长足够的实拍视频，动态感最强，首选。
2. **视频（免 key 站 Coverr / Mixkit 解析）**：无 API key 时的视频兜底。
3. **图片（Unsplash / Pexels 真实照片）**：搜不到主题匹配视频时退回。用 CSS Ken Burns（见六、composition 使用）或 ffmpeg 做成运动视频补偿静态不足。
4. **AI 生成图片（最后手段，必须标注）**：仅当以上三级都失败才允许。使用时必须：① 告知用户本次为 AI 生图背景；② 用 ffmpeg 做成运动视频（Ken Burns）；③ 在成片说明里标注「本次为图片背景，动态感低于实拍视频」。

**严禁把「AI 生成图片」当默认背景**——它只是兜底，不是首选。正常情况下应停在 1 或 2 级拿到视频背景。

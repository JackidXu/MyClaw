# 素材获取指南（类型 B 素材展示面板 · 按文案语义获取真实素材）

本文档服务于 `talking-head-motion-cut-v2` 技能里**类型 B 素材展示面板**的素材来源。**核心原则：类型 B 面板里展示的视频，必须按本段文案语义，从免费素材平台获取一段主题相关的视频，严禁直接沿用模板自带的 `material-DEMO.mp4`（那是占位演示片，出片必须替换）。**

素材是「面板内嵌的小窗视频」（不是全屏背景），但获取与压缩逻辑与通用背景素材一致，下面直接给可复用的方法。

---

## 一、去哪找（7 个免费渠道，视频优先）

| 渠道 | 内容 | 费用 | 注册 | 获取方式 | 推荐度 |
| --- | --- | --- | --- | --- | --- |
| **Pexels** | 视频 + 图片 | CC0 免费 | 免费注册 | API 搜列表 → 直链下载 `pexels.com/download/video/<id>/` | ★★★★★ 视频首选 |
| **Pixabay** | 视频 + 图片 + 音乐 | CC0 免费 | 免费注册 | API 或直链 | ★★★★★ |
| **Coverr** | 视频 | 免费商用 | 无需注册 | 直链下载（解析结果页 `<source>`/视频 `src`） | ★★★★☆ 免 key |
| **Mixkit** | 视频 + 音乐 | 免费商用 | 无需注册 | 直链下载（分类页 `data-src`/`<source>`） | ★★★★☆ 免 key |
| **Videvo** | 视频 | 部分免费 | 免费注册 | 直链下载 | ★★★☆☆ |
| **Unsplash** | 图片 | 免费商用 | 免费注册 | API 或直链 `unsplash.com/photos/<id>/download` | ★★★★☆ 图片首选 |

**默认**：视频用 Pexels，图片用 Unsplash。都免费、可商用、支持直链。

---

## 二、按文案语义定关键词

先提炼该段文案的**主题**，再用**中英双语**关键词去搜（英文素材库更大、结果更丰富）。举例：

| 文案主题 | 英文搜索词（优先） | 中文辅助 |
| --- | --- | --- |
| 健身 / 约课 / 换场地 | `fitness`, `gym class`, `booking`, `schedule change`, `training session`, `workout` | 健身房、私教课、改期 |
| 医疗 / 医生 / 患者 | `medical doctor`, `hospital`, `patient`, `stethoscope` | 医生、医院 |
| 商业 / 创业 / 管理 | `business meeting`, `office`, `entrepreneur`, `teamwork` | 开会、团队 |
| 科技 / 数字化 / AI | `technology`, `digital`, `AI`, `computer`, `data` | 数字、智能 |
| 教育 / 学习 / 成长 | `education`, `study`, `books`, `student`, `learning` | 学习、课堂 |
| 健康 / 生活 / 日常 | `healthy lifestyle`, `fitness`, `nature`, `wellness` | 健康、日常 |
| 情感 / 关系 / 家庭 | `family`, `relationship`, `emotions`, `people` | 家庭、关系 |
| 美食 / 餐饮 | `food`, `cooking`, `restaurant`, `chef` | 美食、餐厅 |
| 旅行 / 风景 | `travel`, `landscape`, `city`, `nature` | 旅行、风景 |

搜索时**必须实际执行搜索拿到可下载直链**，不能只列关键词就跳到下载——这正是「优先视频」能否落地的关键。

### 把关键词变成直链（搜索环节，必须执行）

**Pexels（视频首选，需 API key 才能搜）**
1. 申请 key（免费，约 1 分钟）：pexels.com/api → 注册/登录 → 复制「Your API Key」→ 设为环境变量 `PEXELS_API_KEY`。
2. 用 key 搜视频列表（返回 JSON，含各分辨率直链）：
```bash
curl -s -H "Authorization: <PEXELS_API_KEY>" \
  "https://api.pexels.com/videos/search?query=fitness%20class&per_page=10" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); [print(v['video_files'][0]['link']) for v in d.get('videos',[])]"
```
3. 挑主题匹配、时长足够的直链，下到 `public/vid/`。

**Pixabay（视频 + 图片，需 key）**：key 从 pixabay.com/api 申请，搜视频用 `https://pixabay.com/api/videos/?key=<PIXABAY_KEY>&q=fitness+class`，结果里取视频直链。

**免 key 视频站（Coverr / Mixkit，无 key 但需解析页面）**
- Coverr：搜索页 `https://coverr.co/search?q=<关键词>`，打开结果页，页面 `<source>` 或视频 `src` 即为直链；用 curl 取页面、提取 `.mp4` 直链下载。
- Mixkit：搜索/分类页 `https://mixkit.co/free-stock-video/<关键词>/`，结果卡的 `data-src` / `<source>` 为直链。
- 注意：这两站页面结构可能随改版变化导致解析失败，**解析失败时不要死磕，直接降级到下一级**（见四、降级阶梯）。

**Unsplash（图片首选）**：用 Unsplash API（免费 key）搜具体照片，拿 `photos/<id>/download` 直链；不要依赖已收紧的随机关键词接口。

---

## 三、下载与压缩（落到 public/vid/）

### 竖屏 9:16 压缩（面板内嵌最稳）

类型 B 面板用 `object-fit:cover` 填满 900×740 区域，源视频比例不一会被裁切。**压成 1080×1920 竖屏**最稳，也统一了关键帧：

```bash
# 下载（以 Pexels 直链为例，免 key）
curl -L -s -o raw.mp4 "https://www.pexels.com/download/video/<id>/"

# 压缩到 1080×1920 30fps、去音频（-an）、【全关键帧 all-intra，避免素材卡顿】
ffmpeg -y -i raw.mp4 -ss 0 -t <场景时长+2> \
  -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30" \
  -an -vsync cfr -g 1 -x264-params keyint=1:scenecut=0 -preset medium -crf 20 \
  public/vid/<主题名>.mp4
```

参数说明：
- `-ss 0 -t <时长>`：从开头截取场景所需时长 + 2 秒余量（素材视频时长 ≥ 面板时长 + 1 秒）。
- `scale=1080:1920:force_original_aspect_ratio=increase` + `crop=1080:1920`：等比放大到覆盖再裁成精确竖屏。
- `-an`：去掉音频（面板素材不要声音，原片人声才是主音轨）。
- **`-g 1 -x264-params keyint=1:scenecut=0`（关键！防卡顿核心）**：把素材重编码为**全关键帧（all-intra）**——每一帧都是独立关键帧。渲染器靠 `currentTime` 逐帧 seek 素材画面，若关键帧稀疏（如默认 GOP 或 `-g 30` ≈ 每秒 1 个关键帧），跳到非关键帧位置要从上一个关键帧重解几十帧，解码慢且不准 → 成片里素材表现为**重复帧/抖动/卡顿**。全关键帧让任意帧 seek 都瞬时精准，卡顿彻底消失。素材多为几秒短片，全关键帧体积仅小幅增加，完全可接受。
- `-preset medium -crf 20`：均衡质量（crf 18-23 均可，越小质量越高）。

批量压缩脚本见参考技能 `script-to-motion-video/references/background-assets.md` 第六节，可照搬到 `public/vid/`。

---

## 四、在 composition 里接进去

把类型 B 面板里的素材视频指向上一步落盘的文件，并**保留 `data-scene-start`**（渲染器按场景相对时间循环）：

```html
<video class="material-clip" id="m2-video"
       data-scene-start="17"                <!-- 该段起点秒，与面板 data-start 一致 -->
       src="vid/<主题名>.mp4"               <!-- ★ 换成你获取的语义素材，禁止留 material-DEMO.mp4 -->
       muted loop playsinline preload="auto"></video>
```

四角信息卡（`素材标题 / REC 00:00:17 / 状态 / 规格`）的文案也按真实素材改，别留占位。

---

## 五、素材选择原则

1. **匹配文案主题**：素材画面要能讲该段文案的故事，不用无关素材（讲「换场地」就找健身房/换馆相关画面）。
2. **质量优先**：清晰、构图好、有动态感；避免模糊、静止、低分辨率。
3. **情绪匹配**：画面情绪跟文案基调一致（诊断痛点偏沉、讲方案偏亮）。
4. **人物优先**：有人物的素材比纯景物更有代入感（除非讲概念/数据）。
5. **时长足够**：素材时长 ≥ 面板时长 + 1 秒（留余量循环）。

---

## 六、降级阶梯（视频 → 图片 → AI 生图）

背景素材按以下顺序逐级降级，**上一级成功就用上一级，不要跳过**：

1. **视频（Pexels / Pixabay API 搜）**：主题匹配、时长足够的实拍视频，动态感最强，首选。
2. **视频（免 key 站 Coverr / Mixkit 解析）**：无 API key 时的视频兜底。
3. **图片（Unsplash / Pexels 真实照片）**：搜不到主题匹配视频时退回。用 CSS Ken Burns 或 ffmpeg 做成运动视频补偿静态不足（压成 1080×1920 后循环即可）。
4. **AI 生成图片（最后手段，必须标注）**：仅当以上三级都失败才允许。使用时必须：① 告知用户本次为 AI 生图背景；② 用 ffmpeg 做成运动视频（Ken Burns）；③ 在成片说明里标注「本次为图片背景，动态感低于实拍视频」。

**严禁把「AI 生成图片」当默认背景**——它只是兜底，不是首选。正常情况下应停在 1 或 2 级拿到视频背景。

# 更新记录

> 本文件只是历史记录。**当前行为以 `SKILL.md` 为准。**
> v3.2–v3.5 里的「按需增强网关 / AUTO 清单 / semantic 字段 / 六种构图」在 **v3.6.0 已整体撤除**：
> 非素材画面改由写镜头表的人按语义自己画（`references/semantic-thinking.md`），运行时不再自动替换任何画面。
> v3.0 / v3.1 的「无素材场景一律整屏重画」更早之前就已作废。
> v3.6.0 及更早的「开片先挑 1–2 镜写 article 刷黄」「信息画面 ≥1.5 秒」在 **v3.7.0 已改**：
> 动效要按语义分散到多族、每镜要停够 2.6 / 3.0 / 3.4 秒。
> v3.7.0 的「popup 也按 3.4 秒」「popup 底层永久冻在上一帧」在 **v3.8.0 已改**：
> popup 按 2.6 秒、底层跟着时间走，静止段由 `--check` 卡住。

| 历史条目里的旧说法（不要再照做） | 现在的做法 |
| --- | --- |
| 五个纯语义场景由 `install()` 自动接管、整屏重画 | 不挂任何网关，运行时不替换画面 |
| 默认透传原模板；只有「没真素材 + 内容稀疏 + 场景在 AUTO 清单」才升级 | 没有「升级」这回事；非素材画面自己写 `art.js` |
| 每镜写 `semantic:{kind:'triple'}` / `semantic:false` 微调 | `semantic` 已废弃，`--check` 会提醒 |
| 新建片 `starter/` 里不写 `semantic`，由内容量自动判定 | 新建片带 `art.js` 骨架；带真素材的镜写足 `hl` / `zoom` / `push` |
| 开片必执行先挑 1–2 镜写 `article + hl + zoom + hlAt`，`--check` 只查「全片有没有至少一处 hl」 | 一镜一个主动效族；同族不连用三镜、≥3 镜不能只有 1 族、≥5 镜至少 3 族；荧光笔只在真需要出处的那一两镜用 |
| 信息画面 ≥1.5 秒、升级画层 ≥2.6 秒，且只管纯图形场景 | 信息画面（含 `article` / `footage` / `device` 等带真素材的镜）≥2.6 秒、元素多 ≥3.0 秒、带推近刷黄 ≥3.4 秒（popup 2.6 秒），末尾还要留 ≥0.7 秒静止 |
| popup 也按「带撑开动作 ≥3.4 秒」硬凑；底层永久冻在 `t0-.01`，窗口缩回后是一张不动的照片 | popup 按 2.6 秒；底层默认跟着 t 走（人还在动），`freeze:true` 才回旧行为；`back` / `until` 卡住两段静止 |

## v3.8.0（2026-11-13）：**画面别抖、别死**

用户验收一条 47.7 秒的 720p 成片：第 2–3 秒有细微的放大缩小，第 8–9 秒画面静止。
逐帧量过（30fps 相邻帧平均绝对差）：2–3 秒两次反向景别跳间隔 0.88 秒；
7.5–8.4 秒帧差 0.06 等于完全静止；8.6 秒之后是一张不动的真人照片。

- **根因一 · 景别跳写太密**：`kit/host.js` 的 `zoomCam` 是硬切档位（原技能设计），
  这一镜写了 `1.15 → 1.0 → 1.06` 三档，后两档只隔 0.88 秒且方向相反。`--check` 以前完全不查。
- **根因二 · popup 冻成照片**：`scripts/moves.js` 的 `popWindow` 把底层永久冻在
  `still(o.under, o.t0-.01)`；`kit/scenes.js` 的 `popup.under` 也忽略传进来的时间。
  窗口撑开完到 `back` 有 2.7 秒整屏不动，缩回完到切镜又留 1.14 秒只剩那张冻结帧。
- **根因三 · 帧率重复帧**：源片 25fps，`fps=30` 抽帧每约 0.2 秒重复一帧，快动作有顿感。

改动（**窗口大小 / 位置 / 压暗 / 虚化、刷黄 / 推近 / 景别跳的画法，一个像素没改**）：

- `scripts/moves.js`：`popWindow` 底层默认跟着 t 走，`freeze:true` 可回旧行为。
- `kit/scenes.js`：`popup.under` 用传入的时间；`help` 补 `back` / `freeze` 说明。
- `kit/kit.js`：`--check` 新增三类 —— `host.zoom` 档位间隔 <0.9 秒、方向反复且 <1.2 秒（硬错误），
  `popup` 两段静止 >1.8 / >0.9 秒（硬错误），静态长镜 >3.2 秒无动作（提醒）；
  `popup` 从 3.4 秒的 ACTION 档移回 2.6 秒的 INFO 档（撑开+缩回只 0.65 秒，硬凑必然多出静止段）；
  顺手修了动效占比提醒「5/4」这种分子比分母大的口径。
- `scripts/footage.py`：新增 `--interp` / `clips.json` 的 `"interp": true`，运动补偿插帧替代重复帧，
  默认不开（慢、快速挥手有拖影）；`host` 抽帧时打印源帧率与重复帧周期。
- 文档同步：`footage-effects.md` 第七节、`rules.md` 规则 44/47/48/49、`thinking.md`、
  `kit/README.md` 错误对照表、`effects.html` 硬规矩、`SKILL.md`、`README.md`、
  `starter/film.js`、`new_film.mjs`、本文件。

验证：认可的 mid 基准片 `--check` 零错误；问题成片按新规则准确报出 3 处
（zoom 0.88 秒、popup 2.69 秒静止、popup 1.14 秒空镜）；
把 zoom 合成一档、`back` 提前到 7.22 秒、`until` 提前到 8.08 秒后零错误；
用修复后的 lib 重渲 5.9–8.0 秒，逐帧差均值从 0.137 升到 6.399、近零帧 0/21，
静帧确认窗口稳定、背景人物持续在动、缩回后不是静止照片。

## v3.7.0（2026-11-13）：**动效别只会刷黄，每镜别一闪而过**

用户反馈两条：技能里一直重复荧光笔这一种素材特效，其他特效基本不用；场景停留时间太短，还没看清就切走了。

两条都是**规则写歪了**，不是渲染坏了：

- **为什么全片刷黄**：`footage-effects.md` 的「开片必执行」把 `article` 放在第 1 条，`effects.html` 前三张卡都叫「荧光笔」，`--check` 只查「全片有没有至少一处 hl / 一处 zoom」。于是每镜都写 `article + hl + zoom` 就能一次过检，最省事也最单调。
- **为什么太短**：`kit.js` 的 `MIN_INFO_DUR=1.5` 只覆盖 `INFO` 里的纯图形场景，`article` / `footage` / `device` / `frames` / `desk` / `headlines` / `montage` / `popup` **一个都不在集合里**，带真素材的镜完全没有下限；`def.minDur` 只是一条软提醒；文档写的「元素多 ≥2.6 秒」代码里根本没实现；也没检查「最后一个落点到切镜」。`short:true` 还能无限制放行。

改动（原渲染代码 `scenes.js` / `scenes_plus.js` / `moves.js` / `kit.css` 一行未动）：

- **`kit/kit.js`**：`INFO` 补齐所有带真素材场景；新增 `DENSE` / `ACTION` 分档与 `MIN_INFO_DUR=2.6` / `MIN_DENSE_DUR=3.0` / `MIN_ACTION_DUR=3.4`；新增 `lastCueOf()` 检查末尾静止（0.7 秒 / 带动作 1.2 秒）；新增 `effectFamily()` 按「观众看到的动作」把 8 类素材处理分族，整片统计 + 连续三镜同族 + `short:true` 超过一处，全部作为 `--check` 硬错误；`lint` 里短镜提醒阈值 1.2 → 2.0 秒，并加「全片 ≥2 镜不到 2 秒」提醒。
- **`references/footage-effects.md`**：「开片必执行」改成先写 `says` 再一镜定一个主动作；新增「动效配比」（8 族 × 语义 × 必写参数）和「停留时间」（量化基准是 mid 成片 10 镜 2.6–6.2 秒 + 三档下限 + 时间预算分解）。
- **`kit/effects.html`**：新增「动效配比」「停留多久」两节；7 张卡标题从族名（三张都叫「荧光笔」）改成语义名，每张加 `data-family`；导航与「硬规矩」同步；仍是纯 HTML/CSS、零图片。
- **其它**：`starter/film.js`（注释讲清三镜是三个不同族、每镜停够）、`scripts/new_film.mjs` 建片提示、`SKILL.md`（description / 硬规矩 1、6、7 / 文件索引）、`references/rules.md`（规则 23、44 改写，新增 46）、`thinking.md`、`semantic-thinking.md`、`kit/README.md`（错误对照表新增「动效重复」条）、`README.md`、`review.md`、`lessons.md` 全部同步。

验证：认可的 mid 成片按新规则 `--check` 零错误、零新增告警（10 镜 2.6–6.2 秒、3 种动效族）；造反例（把 3/4/5 镜全改成刷黄 + 第 7 镜缩到 0.56 秒）后 `--check` 准确报出 3 处错误：短镜、素材镜只 2 族、连续三镜刷黄。

## v3.6.0（2026-11-13）：**方向反过来 —— 素材动效保住，非素材不再写死**

用户指出前面几轮做反了：带真素材的镜头没保留原技能的放大 / 荧光笔刷黄，反而是非素材那套写死的元素一直出现。

- **逐镜拆解作为事实基准**：新建 `references/mid-film-breakdown.md`。用户认可的 mid 成片 10 镜里，6 镜带真素材全部是原技能原样（第 5/9 镜 `article` 的 `hl` 刷黄 + `zoom` 推近、第 4 镜 `footage` 的 `push` 慢推、第 1/10 镜 `host` 景别跳与 `grow`、第 2 镜 `items` 挂墙），一个像素没改；第 3/6/7/8 镜是当时读着口播现画的，**当时没有任何模板**。
- **撤掉非素材的运行时自动画层**：`kit/semantic_scenes.js` 从「六种固定构图 + `pickKind()` 自动选型 + `ONE ENTRY` / `YOUR RULES` 固定卡眉 + `['book','rocket','clock']` 固定图标顺序 + `install()` 自动接管」重写成**无内容绘图工具箱** `window.KIT_ART`（零默认文案、零版式判定、零自动挂载）；`kit/kit.js` 不再调用 `install()`；`semantic` 字段废弃，写了会由 `--check` 提醒。
- **改成方法而不是模板**：新建 `references/semantic-thinking.md`（四步思考：信息结构 → 主焦点 → 只放重点信息 → 区域越大内容越多；硬原则、落点时长、自检清单）和 `starter/art.js` 骨架（内容全从镜头表参数取，不写死中文）；`references/semantic-scenes.md` 改成醒目废弃声明 + 错误对照表，指明以新文档为准。
- **素材动效做成开片必执行**：`references/footage-effects.md` 重写，每条补「什么时候用」（这句口播在讲什么 → 该让观众看懂什么）和「怎么运作」（`hl` 坐标换算、`zoom`/`hlAt`/`until` 时间联动、`push` 逐帧插值，均从 `scenes.js` 核出），附 mid 成片第 5/9 镜真实已验收参数；`kit/effects.html` 7 张卡各补 `<p class="how">` 运作机制，新增「开片必执行」段落与按语义选的决策表；`kit/kit.js --check` 新增**素材动效覆盖检查**（有真素材却没写刷黄 / 推近参数会提醒）。
- **模板与建片流程**：`starter/film.js` 三镜示范改成 `host` 景别跳 → `article(img+hl+zoom+hlAt)` → `footage(push+badge)`，并给出挂 `art.js` 的注释示范；`starter/index.html` 加载 `art.js`；`scripts/new_film.mjs` 建片拷 `art.js`、写默认 `fit.json`（避免新建片 404）、提示语改成「带真素材写足动效 / 非素材按四步自己画」。
- **文档统一**：`SKILL.md`（description、开片流程、七条硬规矩、读哪份、脚本表）、`README.md`、`kit/README.md` 去掉「自动补丰富 / 默认透传 / 六种构图 / semantic 微调」等过时表述。`CHANGELOG.md` 头部同步改。
- **验证**：6 个 JS/MJS 语法检查通过；工具箱零写死内容残留、零 `SCENES` 挂载；旧测试片 `--sync` 后渲 8.0s 静帧，自动三卡已消失、回到原模板三张小卡（SHA 与旧图不同）；新模板 `--check` 零错误、无 404；实渲 `article` 7.6s / 8.8s 两帧确认黄色荧光笔由短刷到长且镜头推近放大；`footage` 10.0s / 14.0s 静帧 SHA 不同确认慢推生效；反向测试去掉 `hl`/`zoom`/`push` 后 `--check` 两条覆盖缺失都报、还原后消失；`effects.html` Chromium 打开无页面错误，7 卡 / 8 段代码 / 8 表 / **0 图片**。
- **使用变化**：已建好的片子目录跑一次 `node scripts/new_film.mjs <片子目录> --sync`；非素材画面不再自动出现，需要自己按四步写 `art.js` 并在 `film.js` 里挂到对应场景。

- v3.5.0（2026-11-12）：**用「文本 + 单文件 HTML 模板」把原版处理素材的特效重新交给 AI**（用户问「有办法不通过图让 AI 学会吗，例如 HTML 模板」）。
  - **先说诊断**：荧光笔、拉近放大素材、快切实拍、画框推满屏、窗口撑开这些特效的**渲染代码一行都没删**——`kit/scenes.js`（仅几处中性措辞）、`kit/scenes_plus.js`（仅一处注释）、`kit/kit.css` / `scripts/moves.js` / `stage25d.js` / `film_base.js` / `snap_news.mjs` 与原版逐字节一致或等价；`new_film.mjs` 的 `LIB` 和 `starter/index.html` 也照旧加载。真正被移走的是「让写镜头表的 AI 知道有这些特效」的**演示图片、动图、示例片入口**，以及 `kit/README.md` 里那句「演示用静帧和动图已从本技能移除」——只剩参数表、没有可抄的写法，下游自然不会用。这是 v3.3.0「删示例导致能力变窄」的同一个坑，上次只修了 starter，没修这块。
  - **按用户指定的方向做，不靠图片**：新增 `references/footage-effects.md`（权威文本速查：决策表 + 7 类特效的参数表 + 可复制镜头片段 + 验证命令 + 硬规矩）和 `kit/effects.html`（单文件 HTML，**示意全部用 CSS 画、动效用 CSS animation 表达、零 `<img>`**，源码里带 `data-scene` / `data-params` / 参数表 / `<pre><code>` 片段，带一键复制）。AI 读纯文本就学会，人打开浏览器能看到示意和动效。两份内容对齐，参数以 md 为准。
  - 恢复 `examples/ai-burn-money/` 的纯文本手法参考（`moves_lib.json` / `film_lib.js` / `director.md` / `script.txt` / `CREDITS.md`）和 `examples/google-apple-20b/` 的文本文件，共 148K；**图片一律不恢复**（7 个动图 16M、静帧 1.1M、两条整片 sample.gif 15.5M）。曾经试过恢复图片并压成分镜图，用户提出「不通过图」后已全部撤回。
  - 文档全线改指向：`SKILL.md`（硬规矩 1、动手前先读、脚本表）、`kit/README.md`（开头、文件表、交片自检）、根 `README.md` 都指向这两份；清掉 `references/rules.md` 第 43 条、`review.md`、`lessons.md`、`kit/README.md` 里指向已删 `frames_1fps.jpg` 的悬空引用，改成「逐镜对照文字基准 + `kit/effects.html` 的 CSS 示意」。
  - **验证**：建最小片实渲两镜——`article` 的 `mock.mark + zoom + hlAt` 画出「整页斜摊 → 镜头推近 → 2780 亿元被黄色荧光笔刷过」；`device` 的 `img + hl + zoom + label` 画出「手机外框 → 金色细框框选 → 推近放大 + 付费入口标签」。`--check` 零错误（只剩测试片故意用的占位图提醒）；`effects.html` 用 Chromium 打开无 JS 错误，7 张特效卡 / 8 段代码 / 8 张参数表 / **0 张 `<img>`**。对照图 `demo/effects-check/effects-compare.png`、`effects-html-top.png`。
  - 分发包仍是小体积（图片零增加，1.9M）， Downloads 版与安装版同步。打包规则补一条：`scripts/local.json` 是本机配置（字体目录、ffmpeg/Playwright 路径），**只留在工作副本，不进分发包**；v3.5.0 包清单相对 v3.4.1 只新增 12 个文本/代码文件 + 2 个目录条目。

- v3.4.1（2026-11-12）：**去掉画层里最后一处「写死内容」**。`triple` 构图卡片不足三张时，原本会填「第一样 / 第二样 / 第三样」这种无信息占位词——拿废话补空白，和 `references/semantic-scenes.md` 里「不写占位符」的规矩直接冲突。现在卡名只从这一镜自己提取的短句池 `s._pool`（`nodes` / `items` / `lines` / `sub` / `en`）里取，自动跳过与已有卡重名的词；池子空了就**少画一张、按实际张数居中排**，绝不硬凑。内容够三张时布局逐像素不变（静帧 SHA256 已比对一致）。`references/semantic-scenes.md` 同步写明「补的是内容不是字数，取不到就少画」。
  - 说明：卡片空白的**主修法是版式**（`CARD` 内容 `justify-content:center` 垂直居中成簇、`foot` 不再 `margin-top:auto`），一个字都不用加；补内容只是短句不足两行时的兜底，且只从这一镜已有字段 / 口播原话借，不编数字和出处。
  - 保留的写死项：卡眉英文小字（`ONE ENTRY` / `YOUR RULES` / `FAQ` / `THE NUMBER` / `CHAPTER` 等）与图标顺序、配色、构图类型属于版式标签，不冒充这一镜的信息。

- v3.4.0（2026-11-12）：**修三个真实成片里暴露的问题**（竖屏被裁成大特写 / 一镜一闪而过 / 卡片中间大空白）。
  - 竖屏口播：`footage.py` 新增 `host` 命令和 `fit` 选项。ffprobe 量到宽高比 < 1.45 时自动走 blur：抽出的每帧都是 1920×1080 的「中间完整竖屏人像 + 两侧同源虚化放大 + 极淡网格 + 两道亮边」，人既不压扁也不被裁成大特写；blur 模式忽略 `zoom`，避免二次裁人。`fit.json` 记 portrait / scale，`host.js` 把按原片量的 `faceY` 自动换算到合成帧。`extract` 对竖屏 / 方屏片段同样自动适配；`cover` 只在确实要铺满时显式写。开片命令从手写 ffmpeg 换成 `footage.py host`。
  - 一镜一闪而过：`kit.js` 对信息类场景（flow / board / chart / title / network…）加 1.5 秒硬下限，`--check` **直接报错**（确属有意快切才单镜写 `short:true`）；`semantic_scenes.js` 短于 2.6 秒的镜不升级、交回原模板并提醒；cue 按镜头时长压缩并夹在镜内，淡入时长与错峰同步缩短，末尾留一段静止可读的时间。
  - 卡片中间大空白：`CARD` 内容改为**垂直居中成簇**，`foot` 不再用 `margin-top:auto` 顶到卡底，短句不足时从 `sub` / 口播短句补一行；`triple` 三卡改为「序号 + 图标 + 名字 + 短说明」四层，中间由图标撑住。顺带修掉 `derive()` 只认 `items` 不认 `nodes` 导致三卡一张都画不出来的真 bug（镜头表常写 `nodes`）。`--check` 新增「只写标题的高卡（h>260）」提醒；手写 `custom` 卡片也要求 `justify-content:center`，别用 `space-between` 把两行字分到卡片两头。
  - 文档同步：SKILL.md 从六条硬规矩扩成七条（新增「竖屏口播怎么处理」「一镜要停够」）、thinking.md 第 8 节、rules.md 规则 44/45、semantic-scenes.md 触发表 / 配比表 / 三条坑、kit/README.md、starter/film.js、new_film.mjs、README.md。
  - 验证：网关单测 14/14；用真实 1080×1920 口播原片抽帧，合成帧 1920×1080、人像与身体环境完整、两侧虚化无黑边；`--check` 短镜报错、正常时长零错误；三卡升级镜静帧逐帧看过，三张卡完整且卡内无大空白。
- v3.3.0（2026-11-12）：**修回「被误改的建片起点」和「被写死的非素材画面」**（用用户提供的原版 `wallstreet-explainer.zip` 和另一条真实成片做逐像素 A/B 后定位）。
  - 诊断：`scenes.js` / `scenes_plus.js` / `kit.css` 渲染代码与原版逐行一致，有真素材的镜头在新旧库下 9 帧比对 YAVG=0（另 1 帧 1e-6 是口播帧解码抖动）。被改坏的只有三处非素材帧，根因是 `starter/film.js` 在 v3.0 被整篇换成「host → flow(semantic) → host」三镜固定套路，模板里还带 `semantic:{...}` 示例；下游照抄后每个非素材镜都写 `semantic`，绕过了按需增强网关。
  - `starter/film.js` 恢复原技能的能力示范：`host` 全屏口播 → `frames` 三张真素材画框 → `title` 实拍压底片名卡，恢复 `PH` 占位图机制，删掉模板里的 `semantic` 示例，注释写明「默认一个字都不要写 semantic」。
  - `semantic_scenes.js` 的 `install()` 从「遍历所有场景」收窄为**只挂 `AUTO` 清单**（VERSION 1.2）：`chart` / `network` / `timeline` / `map` / `host` / `frames` / `device` / `article` / `footage` 等场景连 `make` 都不碰，写了 `semantic` 也不会被接管，原能力彻底不受影响。
  - 文档全线降级 `semantic`：SKILL.md 硬规矩 1 补齐「带真素材的场景清单」（frames / montage / article / headlines / device / popup / person / desk / 照片圆盘 / 实拍压底…），硬规矩 2 明写「默认不写、每镜都写＝写死」；README、kit/README.md、references/semantic-scenes.md、new_film.mjs 提示语、examples/gold-rates/README.md 同步；CHANGELOG 废弃表补一行。
  - 新增 `pickKind()`：自动升级时按「这一镜在说什么」从六种构图里选（关键差别→statement、落点是数→metric、一问一答→dialog、片名→headline、三样并列→triple、因果链→persona），不再按场景名写死成一种版式；显式 `semantic.kind` 仍优先。规则表写进 `references/semantic-scenes.md`。单测 7/7。
  - 合并本机的 Chrome 兜底：`render.mjs` 在没有 Playwright 自带 Chromium 时先试 `channel:'chrome'`，再兜底 `msedge`（本机缓存只有 1217、工具链要 1208，原来会直接启动失败）。`starter/index.html` 加空 favicon，新建片不再报一个无关 404。
  - 回归：网关单测 12/12、构图单测 7/7；用原版 zip 库做基准，同一镜头表下「内容写够」9/9 逐像素一致、「内容稀疏」只有 3 个非素材帧升级；从零建片 `--check` 零错误。
- v3.0（2026-11-11）：改名为「真实素材口播剪辑（real-footage-presenter-cut）」。只保留真人口播这一种模式，清掉不再适用的模式说明、署名与旧示例片。新增 `kit/semantic_scenes.js` 与 `references/semantic-scenes.md`：带真素材的镜头由原模板原样渲染，无素材纯语义场景（flow / statement / discs / number / title）按这句口播整屏重画，配比定为每屏 34–55 字、一张短句卡、纯图标贴片 ≤4 枚、留白 30%+。`new_film.mjs`、`starter/` 默认接入口播层。
- v3.1（2026-11-11）：端到端验证并收尾。
  - `new_film.mjs` 建片已复制 `semantic_scenes.js`；模板片的 cue 词与占位文案对齐，新建片 `--check` 零错误零提醒。
  - 自动提取文案去重：短句卡标题不再和大标题、中央大字重复；只取完整短语，不再出现半截词或省略号。
  - `FB.init({cuts:[]})` 时不再请求 `assets/cut/host/box.json`，消除新建片的 404 页面报错；真要 `swap` 时仍给明确提示。
  - 彻底移除 TTS 临时配音链路（`scripts/temp_voice.py`、edge-tts 依赖、正式/临时配音文档）；`references/audio.md` 改写为口播原声逐字对齐，faster-whisper 改为必需依赖。
  - 验证：从 `new_film.mjs` 从零建片，双入口 A/B 抽 10 帧比对——6 个真素材镜 SHA256 全同（零改动），4 个纯语义镜全部整屏重画。
- v3.2（2026-11-11）：**改回「按需增强」，不再把技能写死成固定长相。**
  - `semantic_scenes.js` 从「无条件接管 5 个场景的 make」改成网关：默认一律透传原模板；只有「没有真素材 + 内容稀疏 + 场景在 AUTO 清单」才换画层。
  - `AUTO` = flow / board / statement / discs / number / title / quote，其余场景默认一帧不碰；`semantic` 对象 / `true` / `'rich'` 可强制升级，`semantic:false` 强制原版，真素材镜头永远让路。
  - `density(p)` 用 units / chars / extras 三条判内容量（阈值可改 `KIT_SEMANTIC.DENSITY`）；注意 `K.film` 会合并场景 defaults，样式字段不算内容。
  - 用用户提供的原始 `wallstreet-explainer.zip` 做基准：6 个真素材镜 6/6 逐像素一致、内容写够的纯语义镜 3/3 逐像素一致（原能力保留）、内容少的 4/4 换成丰富画层；网关分支单测 9/9 通过。
  - 文档同步改写，去掉「一律整屏重画 / 配比定死全片」这类会把技能用死的表述。
- v3.2.1（2026-11-11）：**瘦身 28M → 2.8M，只删零引用的展示资源，渲染链路一行没改。**
  - 移走 `kit/gallery/`（17M：8 个演示 GIF 约 16M + 30 多张场景静帧 1.1M + 生成脚本 make.py）、`examples/gold-rates/sample.gif`（7.6M 成品预览）、`starter/assets/grain.png`（263K 孤儿文件）。全目录扫描确认这些文件没有任何 js / css / md / html 引用，纯给人看，不参与建片与渲染。
  - **特意保留** `kit/assets/fabric.jpg` / `grain.png` / `worldmap.png`（`kit.css` 直接 url、`kit.js` 强制 loadImg、地图底图）和 `kit/assets/ph/` 的 16 张占位图（`new_film.mjs` 会逐张拷进片子，`--check` 靠它提醒「还在用占位素材」）。这几样看着像示例，其实是机制的一部分，删了建片会崩或画面缺纹理。
  - 验证：从零建片 `--check` 零错误零提醒、纹理与 16 张占位图正常拷入；删前删后同入口抽 6 帧 + 内容写够的镜 1 帧，SHA256 全部一致，画面一个像素没变。
  - 移走的资源在本机 Downloads 另有备份，分发包内不含。
- v3.2.2（2026-11-11）：**补清非口播模式的最后残留。**
  - 发现 `kit/demo/film.js` / `kit/demo2/film.js` 是两条不带口播层的纯图形片（`FB.init` 没有 counts / cuts，也没调 `KIT_HOST.use`），`new_film.mjs --demo` / `--demo2` 能一键建出来直接 `--check → --sheet → --video`，且 `steps = DEMO ? [] : [...]` 会跳过抽帧、转写、逐字对齐三步——这是一条完整可运行的无人片链路，v3.0 只清了文档没清入口。
  - 关掉入口：`new_film.mjs` 移除 DEMO / DEMO2 分支，`src` 恒为 `starter/`，`steps` 恒为口播链路；再传 `--demo` / `--demo2` 明确报错退出（exit 1）并指向正确做法。
  - 两份 demo 文件**保留但降级为纯代码参考**（`references/grammar.md`、`motion.md`、`kit/README.md` 有多处按「`kit/demo/film.js` 第 N 镜」引用写法，删了会让文档全部悬空）：文件头加醒目声明「没有口播层、不能建片、不能渲染、不是交付物」，script.json 的 note 同步改写。底层渲染库一行没动，原技能画法照旧保留。
  - 文档改口径：SKILL.md 两处、kit/README.md 多处把「能跑的完整例子 / 建出来就能渲」改成「场景写法参考（纯代码，不能建片）」；rules.md / lessons.md 对示例片的数据引用加上「不是产出模式」的限定。
  - 顺带修 v3.2.1 瘦身留下的悬空引用：kit/README.md 31 处场景标题里的 `gallery/xxx.jpg`、文件表两行 gallery 说明、SKILL.md 表格的「图在 kit/gallery/」、render.mjs 注释——gallery 目录已移除。
  - 验证：`--demo` exit 1 并给出正确指引；正常建片 `--check` 零错误零提醒、步骤回到完整口播链路；抽 6 帧与清理前基准 6/6 逐像素一致（18.50 偶发的口播圆窗解码抖动复跑即消失，lib 五个文件与技能库全一致）。

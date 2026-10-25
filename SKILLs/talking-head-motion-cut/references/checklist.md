# 出片前自检清单（checklist）

渲染前过一遍这个清单，逐项确认。每项都过了再渲染。

## 阶段 1-2 · 转录与选型

- [ ] transcript.json 已生成，每段带 start/end 时间码（秒，精确到小数点后两位）
- [ ] 按 4-7 个语义段落归组，每段记录起止时间
- [ ] 每段口播内容已读，信息结构已识别
- [ ] 每段动效呈现形式已选定（从工具箱选或创造，不是套模板）
- [ ] 每段动效卡内元素数量与区域大小匹配（顶部 25% 约 4-8 元素，全屏更多）
- [ ] 动效卡内容是从文案提取的重点信息，整句口播交给字幕

## 阶段 3 · 字幕标色 vs 动效分工

- [ ] 单纯强调的词用字幕标色（紫色关键词/金色数字）
- [ ] 有结构关系的信息用动效呈现
- [ ] 动效卡和字幕不重叠（动效放重点信息，字幕放完整文字）

## 阶段 4 · HTML composition

- [ ] 布局选了 4 种之一（上下/左右/画中画/信箱居中），或合理混用
- [ ] 已选 1 个视觉风格 + 1 个边框（身份层每片只选 1 次，没有每张卡换风格/边框/主题）
- [ ] GSAP 与字体已就位：`public/vendor/gsap.min.js` 存在、`public/fonts/*.woff2` 已复制（否则渲染必崩）
- [ ] 动效卡位置不遮人脸（上下结构顶部约 25% 只遮额头，左右结构侧边约 25%，信箱居中在上方黑边不压人物）
- [ ] 开头标题卡（0-4.5s）**存在且未被跳过**，字号不超画宽上限（竖屏 1080 宽单行约 96px），颜色清晰易见
- [ ] 标题卡文字是**单独提炼的短标题（8-14 字）**，**不是口播第一句 / 钩子原文**
- [ ] 标题卡视觉是"视频封面式标题"：**纯文字 + 顶部渐变遮罩，无圆角卡片容器 / 无卡片背景色块 / 无元素错峰动效**，与动效卡区分明显；口播第一句作为字幕逐句显示，未混入标题卡
- [ ] 结尾全屏总结卡，列重点 + CTA
- [ ] 动效进出只用 opacity tween，可见性交给 data-start/data-duration
- [ ] card-host 直接包 root，root height:100% 全链贯通（无多余中间层）
- [ ] 内部动画选择器用纯 #id + Q(id) helper
- [ ] 每段动效卡内 4-8 元素分层错峰出场（不是一次铺字）
- [ ] 元素满足动效前提（kinetic-chars 包 span.char / count-up 标 from-to / draw-path 用 SVG path）
- [ ] 字幕 rail 逐句分组，每组 ≤2 行，150-250ms fade
- [ ] emphasis 词 inline 标色（hl-key 紫色 / hl-num 金色）
- [ ] **字幕 track-index=10（最顶层），大于所有动效卡**
- [ ] 全屏总结卡 track-index 小于字幕（如 4）
- [ ] 横屏源→竖屏成片用了信箱居中（object-fit:contain，黑边作动效/字幕区，原片不裁切变形）

## 阶段 5 · HTML 渲染前全方位静态自查（6 大核心维度）

- [ ] **1. 图层层级**：字幕 track-index=10（最顶层），大于所有动效卡与总结卡（全屏段字幕必须可见）
- [ ] **2. 空间分区**：竖屏动效卡在顶部 25%（top:30 width:1000），字幕在底部（top:1300 或 top:1520），互不重叠
- [ ] **3. GSAP Seek 安全**：动效属性均可静态重现（opacity、transform、clipPath 等）；数字滚动（count-up）使用安全闭包绑定对象更新，无外部异步副作用
- [ ] **4. 显隐契约**：只 tween opacity 与 transform，严禁在 tween 里改 visibility/display；显隐切换由 tl.set 托管
- [ ] **5. 标题隔离**：开头 0-4.5s 标题是提炼的短标题（封面式），绝不是口播正文第一句（钩子）
- [ ] **6. 字幕校对**：字幕逐句对照 transcript.json 原文校对过，错字补全纠正，每组 ≤2 行

## 阶段 6 · 极速渲染与双重门禁自检

- [ ] 渲染命令直出控制台（严禁使用 `| tail` 等管道符重定向）：`node render.js public -o output.mp4 --fps 30`
- [ ] 渲染无报错退出，output.mp4 成功生成且包含完整原声
- [ ] **第一道防线（机器探针）**：用 FFmpeg signalstats 读取中段亮度 YAVG（确保未黑屏）
- [ ] **第二道防线（黄金代表帧）**：仅提取 1 张中段代表帧 `check_preview.jpg` 且只查看 1 次，确认卡片在顶未遮挡人脸、字幕在底未重叠
- [ ] **严禁多模态死循环**：绝对严禁写脚本对每个分段循环抽多张图，绝对严禁读取第二张图片
- [ ] **单向终点交付（红线禁令）**：除致命全黑屏崩溃（YAVG ≤ 10）外，100% 绝对严禁执行第二次 `render.js` 重渲染（包括字幕冲突、色调微调等借口），单次出片必须作为最终成果立即交付 output.mp4 给用户

## 常见问题速查

| 现象                                        | 原因                                                 | 解决                                                                               |
| ----------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------- |
| 数字滚动（count-up）停留在 0                  | GSAP 在 seek() 寻轨时默认会抑制回调（suppressEvents）   | render.js 中已传 `tl.seek(t, false)`；HTML 中使用标准闭包对象驱动更新            |
| 渲染报 lint error: gsap_non_transform_motion | video-wrap 被 tween 了 left/top/width/height         | video 保持满屏不动，用 card-host zone 分区实现布局                                             |
| 黑屏                                        | tween 了 visibility 和框架冲突                           | 只 tween opacity，可见性交给 data-start/duration                                        |
| 卡片不显示                                     | 多层嵌套中间层 height:0                                   | card-host 直接包 root，root height:100%                                              |
| GSAP target not found                     | 后代选择器找不到深层元素                                       | 用纯 #id + Q(id) helper                                                            |
| 全屏段字幕不见了                                  | 全屏卡 track-index > 字幕                               | 字幕 track-index=10，永远最大                                                           |
| 标题左右裁边                                    | 字号超画宽                                              | 竖屏 1080 宽单行上限约 96px                                                              |
| 标题卡像动效卡 / 用了口播第一句                         | 标题与钩子没区分，套了动效卡样式                                   | 标题=单独提炼的短标题（封面式：纯文字+渐变遮罩，无卡片容器/无背景色块/无错峰动效）；钩子归字幕                                |
| snapshot 多 --at 只存最后一个                    | 框架限制                                               | 用成片 + ffmpeg 抽帧验证                                                                |
| Chromium 下载卡住                             | 网络问题                                               | 设 `PUPPETEER_DOWNLOAD_BASE_URL` 换镜像，或手动装 Chromium 后设 `PUPPETEER_EXECUTABLE_PATH` |
| 渲染等 ~10 秒后超时报错（waitForFunction 失败）        | 缺 GSAP：`public/vendor/gsap.min.js` 不在，timeline 设不上 | 阶段 0 把 `assets/vendor/gsap.min.js` 拷到 `public/vendor/`，字体拷到 `public/fonts/`      |

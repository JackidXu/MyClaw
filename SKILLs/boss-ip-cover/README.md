# 老板 IP 封面套件（boss-ip-cover）

一套**自有原创、可商用**的「老板个人 IP 封面」Agent Skills 套件，专为「中高端信任获客」调性设计。包含**图文封面**与**视频封面**两个技能，共用一套 **14 风格**视觉库。

> 区别于 adrianpunk/Punk-Skill：本套件全部代码与风格为原创重写，**MIT 协议，个人与企业均可免费商用、修改、分发**，无需向第三方申请商业授权。

## 目录结构

```
boss-ip-cover/
├── README.md                       # 本文件
├── LICENSE                         # MIT，可商用
├── styles/                         # 共享风格库（14 套，图文+视频共用）
│   ├── trust-business-magazine/     # 信任商业杂志
│   ├── minimal-tech-authority/      # 轻科技权威
│   ├── editorial-portrait/          # 编辑式人物大片
│   ├── bold-statement/              # 大字主张
│   ├── warm-studio/                 # 暖调工作室
│   ├── clean-minimal-whitespace/    # 极简留白
│   ├── dark-cinematic/              # 深色电影感
│   ├── guochao-newchinese/          # 新中式
│   ├── data-blueprint/              # 数据蓝图
│   ├── editorial-collage/           # 杂志拼贴
│   ├── 3d-futurism/                # 3D未来
│   ├── handdrawn-warmth/            # 手绘温暖
│   ├── luxury-monochrome/           # 极简黑白
│   └── vibrant-gradient/            # 活力渐变
│       └── {id}/META.md + STYLE.md  # 每套含元数据与视觉原子
├── references/                     # 共享参考（图文+视频共用）
│   ├── platform-ratios.md           # 平台→画幅映射与就近解析
│   ├── cover-blueprint.md           # 图文封面 prompt 结构
│   └── style-catalog.md             # 14 套风格目录与场景路由
└── skills/
    ├── boss-ip-cover/               # 技能①：图文封面 / 海报
    │   └── SKILL.md
    └── boss-ip-video-cover/         # 技能②：人物视频封面
        ├── SKILL.md
        └── references/              # 视频封面专用参考
            ├── video-cover-blueprint.md
            ├── photo-palette.md     # 四色提取与搭配
            ├── design-system.md     # 字体 / 材质 / 装饰
            ├── layouts.md           # 多比例排版与变体
            ├── person-remix.md      # 动作 / 表情 / 手持物
            ├── ratios.md            # 比例适配
            └── add-style.md         # 接入新风格
```

## 两个技能怎么用

### 技能① boss-ip-cover（图文封面 / 海报）
- **输入**：一个主题 / 文章 / 口播稿 / 一句人设定位；可选老板真人照片（强烈建议，用于锁脸）；平台 / 画幅；风格。
- **流程**：Agent 问平台 + 风格（确认门）→ 挑平台、定画幅、选风格、锁人脸 → 编译融合 prompt → 默认出图。
- **输出**：`boss-ip-cover-output/{slug}/prompts/cover.md` + `cover.png`（多尺寸每目标一张）。
- 覆盖平台：公众号 / 小红书 / 视频号 / 抖音 / 知乎 / B站等（见 `references/platform-ratios.md`）。

### 技能② boss-ip-video-cover（人物视频封面）
- **输入**：老板真人照片（强烈建议，锁脸）；主题 / 视频标题；比例（默认 3:4，支持 3:4 / 16:9 / 4:3 / 9:16）；可选风格 / 版本数量 / 背景大字。
- **流程**：提取照片四色 → 真人抠图 → 按主题自由构图 → 用所选风格处理字体 / 材质 / 装饰 → 多版本可选（默认 3）。
- **输出**：`boss-ip-cover-output/{slug}/brief.md` + `prompts/{version}-{style}-{ratio}.md` + 各版本成品图。
- 核心差异：自带「老板脸锁定」——同一张脸跨版本 / 跨画幅保持一致；四色取自本期照片，不照搬风格固定色。

## 老板脸锁定（两个技能共有）
上传老板真人照片即作为图生图参考图，锁定脸型 / 五官 / 发型 / 肤色 / 服装，风格只改光影版式不换身份。无照片时按文字生成并提示补图。

## 安装
把整个 `boss-ip-cover/` 仓库放到 Agent 的 skills 目录（用户级 `~/.workbuddy/skills/` 或项目级 `{workspace}/.workbuddy/skills/`）。两个子技能通过 `../../styles/` 与 `../../references/` 共享根级风格库与参考，请勿拆散目录。

## 授权
MIT —— 可商用、可修改、可分发，无需授权费。详见 `LICENSE`。

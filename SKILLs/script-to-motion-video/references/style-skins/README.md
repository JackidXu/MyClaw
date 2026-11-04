# 风格皮肤包（style-skins）— 换皮不降质

## 为什么需要这个包

技能以前有两类「风格」来源，但彼此冲突，正是"其他次质量差"的根因之一：

- **iWOD 实际用的脚手架**（`composition-template.html/css`）：浅色纸底 + `.vframe/.card/.kicker/.h1` + 每场景 UI mockup + b-roll 窗口 + 逐元素动效。这是出好片的结构真相。
- **`style-variants.md` 的 37 种风格**：用另一套 token（`--fg/--accent/--bg/--masthead-*`）+ 全屏 `.wash/scrim/dim/charge` 压暗类。很多带"深色全盘 + 压暗层"假设，**正好踩中质量基准的反模式黑名单**（画面发脏发灰）。

结果：AI 有时跑去套 `style-variants.md` 的深色压暗，而不是 iWOD 脚手架，于是缺具象 UI、缺 b-roll、画面发灰。

**本包的解法**：把"质量"和"观感"彻底解耦。

- **结构（决定质量）= 恒定**：永远用 `composition-template.html` 脚手架 + 质量门禁（`../quality-gate.md`）。这套结构决定了 iWOD 级质量，与风格无关。
- **皮肤（决定观感）= 只换 token**：本包每个子目录只提供 `:root` 语义色 + `#paper/#grain` 底板光学（+ 可选的 `.card` 表面/辉光），**绝不引入旧模版压暗类**。

## 内置皮肤

| 皮肤 | 观感 | 适用文案 | 翻色机制 |
|---|---|---|---|
| `iwod-light` | 浅色 · 蓝/橙/绿三语义色 | 默认 · 通用 | 浅纸底 + 白卡 |
| `editorial-dark` | 深色编辑 · 专业信任 | 痛点诊断/专业讲解/纪实 | `--white` 翻深色表面 + `--ink` 翻浅色 |
| `neon` | 霓虹科技 · 青/品红辉光 | 科技/数字化/未来感 | 同深色翻转 + 辉光 |
| `cream` | 奶油暖调 · 陶土/橄榄 | 温和/健康教育/生活 | 浅暖纸底 + 白卡 |

## 怎么用一套皮肤

1. 复制 `references/composition-template.html` 为项目的 `index.html`、`composition-template.css` 为 `styles.css`（结构骨架）。
2. 打开目标皮肤的 `tokens.css`，**整体替换** `styles.css` 里的 `:root` 块。
3. 打开目标皮肤的 `base.css`，**替换** `styles.css` 里的 `#paper` / `#grain` 定义（neon 还需把 `.card`/`.kicker i` 辉光覆盖一并加进去）。
4. 之后照常：填每场景内容（UI mockup + b-roll 窗口 + 逐元素动效），过质量门禁。

> 不用改任何 `.vframe/.card/.kicker/.h1` 组件类——它们都引用 `:root` token，换 token 即换皮。深色皮肤靠把 `--white` 设成深色表面、让白卡自动翻深卡，整页一致、不脏不灰。

## 怎么看效果（不渲染也能对比）

打开 `skin-preview.html`：同一个 S1 场景结构（kicker + 标题 + 实拍窗 + 手机卡 + 印章 + 提示条），点按钮在 4 套皮肤间切换。可见**结构丰富度完全一样，只有配色/底板光学在变**——这就是"换皮不降质"。

## 怎么加新皮肤（保持不降质）

1. 在 `style-skins/` 下新建 `<skin-name>/`，放 `tokens.css` + `base.css`。
2. `tokens.css` 只改 `:root` 语义色（保留全部变量名）。
3. `base.css` 只改 `#paper`/`#grain` 底板光学 + 可选 `.card`/`.kicker` 覆盖。
4. **禁止**引入 `style-variants.md` 的 `.bg img` 全屏压暗 / `scrim/dim/charge` 类——那是旧模版反模式。
5. 新皮肤照样过 `../quality-gate.md` 全部指标。

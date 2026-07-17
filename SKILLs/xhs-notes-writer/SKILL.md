---
name: xhs-notes-writer
description: Generate Xiaohongshu (小红书) style 图文笔记 for any of 21 industries. Multi-step interactive workflow: gather brand → define product highlights (3 points, max 50 chars, AI can help draft) → optional keywords → word count (default 300) → auto-detect industry → generate following industry-specific 6-pillar rules → compliance check against 限流 guidelines → add 3-5 hashtags → output as .md file. This skill should be used when the user asks to write 小红书笔记, 生成笔记, 小红书文案, 图文笔记, or social media marketing notes for a brand or product in any industry (beauty, food, pet, career, fashion, home, education, travel, baby, agriculture, culture, auto, sports, anime, healthcare, finance, legal, dining, knowledge-pay, manufacturing, relationships).
version: 1.0.0
agent_created: true
---

# 小红书图文笔记生成器（21行业通用）

Generate Xiaohongshu (小红书) style image-text notes for any of 21 industries. Follows each industry's specific 6-pillar framework refined from 300 viral notes, then validates against the platform's compliance detection methods.

## Trigger

Use this skill when the user asks any of:
- "帮我写一篇XX品牌的小红书笔记"
- "生成一个小红书图文"
- "写一篇XX行业的小红书种草笔记"
- "按照规则写XX品牌图文"
- Any request mentioning 小红书/笔记/图文/种草 + brand/product

## Reference Files

All reference files are bundled inside the skill — no external dependencies. Self-contained and shareable.

1. **Industry rules** (21 files): `references/{行业名}图文笔记生成规则.md`
   - Loaded during Phase 5 after industry detection
2. **Compliance handbook**: `references/小红书笔记限流检测方法.md`
   - Referenced during Phase 7 for compliance checking
3. **Industry detection keywords**: `references/industry-detection.md`
   - Used in Phase 5 for auto-detection

## Workflow

### Phase 1: Gather Brand & Product

Before anything else, ask two questions simultaneously. Do NOT proceed until both are answered:

1. **品牌名称 (Brand name)**: What brand is this for? (e.g., 洗脸熊, 半亩花田, 三只松鼠, 比亚迪)
2. **产品/服务 (Product/Service)**: What specific product or service? (e.g., 氨基酸洁面慕斯, 防晒乳, 坚果礼盒, 汉EV)

### Phase 2: Define Product Highlights

Ask the user for the product's core selling points. Constraints:
- **Maximum 3 highlights**
- **Total character count across all highlights ≤ 50 Chinese characters**
- Each highlight = one specific, factual claim — not marketing fluff

**AI assistance path**: If the user only provides the product name without highlights, offer assistance:
- Ask: "需要我帮你根据产品特点提炼3个亮点吗？"
- If yes, analyze the product and suggest 3 highlights within the 50-char limit
- Present them clearly and ask: "这样可以吗？还是需要修改？"
- Allow the user to edit before confirming

Example format:
```
产品：半亩花田防晒乳
亮点1：纯物理防晒 不渗透不刺激
亮点2：乳液质地 不假白不搓泥
亮点3：几十块大支 每天涂不心疼
（共48字，≤50字 ✓）
```

### Phase 3: Keywords (Optional)

Ask: "需要在文案中加入特定关键词吗？（选填）"

If provided, these keywords must appear naturally in the body text — never forced or stuffed. Keywords serve SEO on the platform, not to disrupt reading flow.

### Phase 4: Word Count

Ask: "文案字数限制多少？（默认300字）"

Use the default 300 Chinese characters unless the user specifies otherwise. Most notes range from 200-600 characters.

### Phase 5: Industry Detection & Rule Loading

Auto-detect the industry using `references/industry-detection.md`:

1. Read the industry detection keyword table
2. Match the brand name, product description, and user's language against detection keywords
3. Select the industry with the most keyword matches
4. If ambiguous (tie between industries): "检测到你可能是{行业A}或{行业B}，请确认你的笔记属于哪个行业？"
5. If no clear match: present the list of 21 industries and ask the user to select: 情感/美食/宠物/职场/服饰/美业/生活家居/教育/旅行/母婴/三农/文化/汽车/体育/二次元/医疗健康/财经/法律/餐饮探店/知识付费/制造业

Once the industry is confirmed, load the corresponding rules file:
```
references/{行业名}图文笔记生成规则.md
```

Read this file in its entirety — it contains the full 6-pillar framework with 60 formulas and 400+ industry-native examples.

### Phase 6: Generate Notes

Using the loaded industry rules, generate the note following this structure:

#### 封面标题 (Cover Title)
Choose one of the 10 cover title formulas from the loaded industry rules. Write the title as it would appear on the cover image — inside 「」 brackets.

#### 封面图型 (Cover Image)
Describe the cover image layout — what visual elements, what text overlay, what scene/comparison. Be specific enough to visualize.

#### 正文 (Body)
Write following the 6 pillars from the loaded industry rules:

1. **开头钩子** (Opening Hook): First 2-3 lines using one of the 10 hook formulas. Must grab attention immediately.
2. **正文结构** (Body Structure): Follow one of the 10 structural formulas from the loaded industry rules. The structure governs the ENTIRE flow of the body content.
3. **配图逻辑** (Image Logic): Describe images and their sequence following one of the 10 image formulas. Be industry-specific — manufacturing uses workshop photos, beauty uses face/product shots.
4. **排版呼吸感** (Visual Rhythm): Apply one of the 10 formatting formulas to control the text's visual rhythm. This governs paragraph structure, spacing, separators, and the body-to-CTA transition. Each formula creates a visibly different reading experience.
5. **结尾CTA** (Closing CTA): End with one of the 10 CTA formulas from the loaded industry rules.

**Critical rules for body generation:**
- The product highlights must be woven naturally into the copy — never listed as bullet points
- The brand name must appear as part of lived experience, not product placement
- If keywords were provided, weave them in seamlessly
- The overall tone must match the industry's native voice (manufacturing = hard-nosed factory floor; beauty = warm personal experience; finance = data-driven but accessible)

#### 配图建议 (Image Suggestions)
Provide 5-6 specific image suggestions covering: cover photo, detail close-ups, process shots, evidence/comparison images, and closing image. Each suggestion describes what to capture and why.

#### 话题标签 (Hashtags)
Add 3-5 relevant hashtags:
- 1 broad category tag
- 1 target audience/topic tag
- 1-2 content type tags
- 1 brand or product tag (optional)

### Phase 7: Compliance Check

Run the generated copy through the compliance handbook at `references/小红书笔记限流检测方法.md`.

Check specifically:
1. **导读Section 三 (Four major 限流 雷区)**: Scan for:
   - 站外导流 triggers (微信/QQ/二维码/私聊 and all 2026 intercepted variants)
   - 绝对化用语 (最/第一/唯一/100%/顶级 and their replacements)
   - 医疗功效词 (治疗/根治/消炎/祛斑 and their industry-appropriate replacements)
   - 诱导互动 (扣1/关注必回/互粉)

2. **Consult Section 五 (Industry-specific risks)**: Cross-reference the detected industry's section for industry-specific banned words and compliance notes. Each industry has its own risk table with 违禁词, 典型限流场景, and 合规替换方案.

3. **Consult Section 四 (AI rate detection)**: Verify the copy has:
   - No template-like structure (段落长度参差不齐, not uniform)
   - Personal details and emotional layers
   - First-hand experience markers

If any violation is found:
1. Mark the specific issue
2. Replace with the compliant alternative from the industry-specific table
3. Re-check
4. Do NOT deliver copy with unresolved compliance issues

### Phase 8: Add Hashtags

Add 3-5 relevant hashtags (话题标签):
- 1 broad category tag (e.g., #护肤干货, #工厂管理)
- 1 target audience tag (e.g., #油皮, #车间主任)
- 1-2 content type tags (e.g., #测评, #改善案例)
- 1 brand or product tag (optional, for searchability)

### Phase 9: Output as Markdown File

**CRITICAL — All final output MUST be written to a `.md` file.** Never deliver inline only.

1. Assemble the complete note in the format below
2. Write it to a `.md` file in the current workspace directory
3. Naming convention: `{品牌名}-{产品名}-笔记.md` for single note, `{品牌名}-{产品名}-笔记{N}篇合集.md` for batch
4. Call `present_files` to deliver the file

File content must follow this Markdown structure:

```markdown
# {品牌名} · {产品名} 小红书图文笔记

> 品牌：{品牌名} | 产品：{产品名} | 行业：{行业名} | 亮点：{亮点1} / {亮点2} / {亮点3} | 字数：≤{字数}字

---

## 笔记一：{角度/类型}

**封面标题**：「{title}」

**封面图型**：{cover description}

**正文**：

{body}

**配图建议**：
1. {image 1 description}
2. {image 2 description}
...

**话题标签**：`#{tag1}` `#{tag2}` `#{tag3}` `#{tag4}` `#{tag5}`

> ✅ 通过合规检查（无违禁词、无夸大功效、{字数}字以内）

---

*生成规则：{行业名}图文笔记生成规则（6支柱×10公式）| 合规校验：小红书笔记限流检测方法*
```

### File Delivery
- **Single note**: `{品牌名}-{产品名}-笔记.md`
- **Batch (2+ notes)**: `{品牌名}-{产品名}-笔记{N}篇合集.md`
- After writing the file, call `present_files` to deliver
- In the text reply, summarize: brand, product, industry detected, note count, word count, compliance status

## Key Reminders

- **Phase 1-4 are mandatory interactive steps** — never skip asking the user
- Industry detection must be transparent: tell the user which industry was detected and confirm
- Each industry's rules file is DIFFERENT — the beauty rules have 30% overlap with manufacturing at most. Never assume formulas transfer across industries
- The 限流检测 handbook is the single source of truth for compliance. Cross-reference both the general rules (Section 三) and the industry-specific table (Section 五)
- Product highlights must appear naturally in the copy, never listed as bullet points
- Brand name appears as lived experience, not product placement
- After writing the file, always call `present_files` before the text summary

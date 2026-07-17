---
name: moments-writer
description: Generate WeChat Moments (朋友圈) marketing copy for any industry. This skill should be used when the user asks to write 朋友圈 copy, 朋友圈文案, or WeChat Moments marketing content for a brand, product, or business. First gathers industry/brand/product context, then generates copy following the 18-industry rulebook including persona matching, tone calibration, content type selection, compliance checking, and reply strategy.
version: 1.0.0
agent_created: true
---

# WeChat Moments Copywriter

Generate WeChat Moments marketing copy optimized for WeChat's unique social dynamics — where authenticity beats advertising, and every post competes with friends' life updates.

## Trigger

Use this skill when the user asks any of:
- "帮我写一条朋友圈文案"
- "生成XX品牌的朋友圈"
- "给XX产品写个朋友圈"
- "按照手册规则写XX文案"
- Any request to write copy specifically for 朋友圈/WeChat Moments

## Workflow

### Phase 1: Gather Context

Before generating any copy, ask the user for these four pieces of information. If any are missing, ask before proceeding — do not guess:

1. **Industry**: What industry does this brand/business belong to? (18 options: 情感, 美食, 宠物, 职场, 服饰, 美业, 生活家居, 教育, 旅行, 母婴, 三农, 文化, 汽车, 体育, 二次元, 医疗健康, 财经, 法律)
2. **Brand name**: What is the brand/business called?
3. **Product/Service**: What specific product, service, or promotion is this copy about?
4. **Requirements**: Any specific angle, promotion detail, event, or constraint? (e.g., "今天双杯7折", "新品上市", "强调性价比")

If the user has already provided all four in the request, proceed directly to Phase 2 without asking.

### Phase 2: Load Industry Rules

Load `references/industry-rules.md` for the matched industry. This file contains the FULL handbook content — every industry with all 8 dimensions:

- **行业特点与受众画像**: Target audience, pain points, behavior patterns
- **文案风格定位**: Persona to adopt, tone keywords, voice description  
- **推荐内容类型**: Content type mix with exact percentage split
- **文案样式/模板**: 2-3 ready-to-use template formulas with placeholder notation
- **配图建议**: Image type, quantity, style, technique tips, items to avoid
- **发布频率与时间**: Posting frequency, optimal time windows, seasonal notes
- **避坑指南**: 5 specific taboos for this industry
- **示例文案**: 2-3 example posts written in the correct voice and tone
- **合规要求**: Risk level and required disclosures

Load only the matched industry section, not the entire file.

### Phase 3: Generate Copy

Write the copy following these universal principles (from the handbook's 六条铁律):

1. **Authenticity first**: Write as if talking to a friend. Use "我" and "你", not "大家" and "各位". Include a specific, sensory detail.
2. **Value-driven**: Every post must provide at least one of: useful (干货), entertaining (有趣), relatable (共鸣), or beneficial (福利).
3. **Scene-based**: Don't state abstract benefits — paint a specific scene. Not "护肤很重要" but "加班到凌晨一点，卸完妆看到镜子里的脸".
4. **Interaction hook**: Plant a question, suspense, or choice in the first two lines to trigger comments.
5. **Concise**: 3-5 lines is the golden length. If >5 lines, it gets folded under "全文".
6. **Soft CTA**: Give a path, not an order. "私信我" beats "赶紧下单"; "评论区聊聊" beats "请转发".

Apply the industry-specific persona, tone, and template from Phase 2. The generated copy must read like a real person posting — no stiff marketing language, no exclamation-mark spam, no official-sounding announcements.

#### Paragraph Formatting Rule (MANDATORY for multi-post plans)

When generating a weekly/monthly/multi-day content plan with multiple posts, every post's copy **MUST** be formatted with natural paragraph breaks — never crammed into a single continuous block.

Rules:
- Break each post into **2-5 natural paragraphs**, each paragraph being one complete thought unit
- Use **blank lines between paragraphs** (empty `>` line in blockquote format)
- Each paragraph should be **no more than 2 sentences** — short and scannable like real Moments posts
- This applies equally to all content types (科普/案例/种草/互动/福利)
- The paragraph breaks create visual breathing room and make the copy actually usable for posting

Good example:
```
> 夏天一出油就洗脸，一天洗四五次？
>
> 停一下。过度清洁会把油脂膜洗掉，皮脂腺反而更卖力出油，越洗越油。
>
> 早晚各洗一次就够了。关键是洗对产品，不是洗更多次。
>
> 不知道怎么选的，把你的肤质发我，帮你看看。
```

Bad example (single block — NEVER do this for plans):
```
> 夏天一出油就洗脸，一天洗四五次？停一下。过度清洁会把油脂膜洗掉，皮脂腺反而更卖力出油，越洗越油。早晚各洗一次就够了，关键是——洗对产品，不是洗更多次。不知道怎么选的，把你的肤质发我，帮你看看。
```

### Phase 4: Run Compliance Check

Load `references/compliance-checklist.md` and run the 6-step check on the generated copy:

1. **Length**: ≤5 lines? Not over 6?
2. **Banned words**: Any 最好/第一/100%/根治/保过 etc.?
3. **Industry taboos**: Any industry-specific banned words?
4. **Required disclaimers**: Missing any required disclaimer for this industry?
5. **Traffic diversion**: Any external links, QR codes, "加我微信"?
6. **Image advice**: What kind of image would work best for this post?

If any check fails, revise the copy accordingly and re-check.

### Phase 5: Deliver

Present the copy in `>` blockquote format with paragraph breaks, then include a brief rule-mapping table showing which handbook rules were applied:

```
> [Paragraph 1 — hook or opening]
>
> [Paragraph 2 — main point or detail]
>
> [Paragraph 3 — CTA or closing]

---

**规则映射：**
| 手册规则 | 应用 |
|---------|------|
| 行业人设 | {persona used} |
| 模板类型 | {template used} |
| 核心原则 | {which of the 六条铁律 were applied} |
| 合规检查 | {status of all 6 checks} |
```

If the user also wants reply scripts for anticipated comments, offer to generate them using the interaction reply framework (模块一 from the handbook).

## Key Reminders

- Always load `references/industry-rules.md` before generating — never guess the industry parameters
- Always load `references/compliance-checklist.md` before delivering — never skip compliance
- For 🔴高危 industries (医疗健康, 财经, 法律), disclaimers are MANDATORY and must appear in the copy itself
- All generated copy must read like a real person's post, not a corporate announcement
- **For multi-post plans (weekly/monthly): every post MUST be formatted with paragraph breaks — never cram into a single block.** See "Paragraph Formatting Rule" in Phase 3.
- If the user only provides partial context (e.g., just the product without industry), ask for the missing pieces before generating

---
name: 朋友圈种草
description: Write WeChat Moments (朋友圈文案) marketing copy for any industry, using second-brain brand and product context first.
agent_created: true
---

# 朋友圈种草

Generate WeChat Moments marketing copy optimized for WeChat's unique social dynamics — where authenticity beats advertising, and every post competes with friends' life updates.

On invocation it first retrieves brand, product, and industry context from the second brain via `retrieve_fmp`, asks only for fields that are still missing, then produces copy following the 18-industry rulebook: persona matching, tone calibration, content type selection, compliance checking, and reply strategy.

## Trigger

Use this skill when the user asks any of:
- "帮我写一条朋友圈文案"
- "生成XX品牌的朋友圈"
- "给XX产品写个朋友圈"
- "按照手册规则写XX文案"
- Any request to write copy specifically for 朋友圈/WeChat Moments

## Workflow

### Phase 0: Retrieve Context from the Second Brain (ALWAYS RUN FIRST)

Before asking the user for anything, search the user's second brain for existing material about this brand, product, and industry. Use the `retrieve_fmp` tool.

1. **Run up to 3 parallel queries**, one per dimension, each written as a complete natural-language question (not a keyword stack):
   - Brand/company: "这个品牌的定位、人设、已发布内容风格是什么？" (layer 4 or 5 when known)
   - Product/service: "这个产品/服务的卖点、价格、目标人群、近期活动是什么？" (layer 4)
   - Industry/audience: "这个行业的目标客户痛点、沟通禁忌、已验证的文案表达是什么？" (layer 4 or 5)
2. **Pass `layer` when the dimension is clear**: 4 = 行业知识, 5 = 经验提炼(案例), 1 = 价值观念, 2 = 决策规则. Omit `layer` when unsure.
3. **Judge sufficiency field by field** against the four Phase 1 fields:
   - Industry clearly identified → do not ask.
   - Brand name and positioning clear → do not ask.
   - Product/service and its selling points clear → do not ask.
   - Angle, offer, or constraint clear → do not ask.
4. **Ask only the gaps.** If all four fields are already clear from the request plus retrieved material, skip Phase 1 entirely and proceed to Phase 2.
5. **Nothing relevant retrieved**: fall back to Phase 1 and ask all four fields.
6. **Never fabricate.** Use only what the user said or what the second brain returned. If retrieved material conflicts with the latest user instruction, follow the user and flag the conflict in one short line.
7. **Disclose the source briefly** in the delivery, e.g. "品牌与行业信息取自第二大脑，未重复询问" — so the user understands why no questions were asked.
8. **Privacy**: in group or shared sessions, use retrieved material only as far as needed to write the copy; never surface unrelated personal details from the second brain.

### Phase 1: Gather Context (only for unresolved fields)

Run this phase only for the fields Phase 0 could not resolve. Ask about missing information — never guess:

1. **Industry**: What industry does this brand/business belong to? (18 options: 情感, 美食, 宠物, 职场, 服饰, 美业, 生活家居, 教育, 旅行, 母婴, 三农, 文化, 汽车, 体育, 二次元, 医疗健康, 财经, 法律)
2. **Brand name**: What is the brand/business called?
3. **Product/Service**: What specific product, service, or promotion is this copy about?
4. **Requirements**: Any specific angle, promotion detail, event, or constraint? (e.g., "今天双杯7折", "新品上市", "强调性价比")

If the request plus Phase 0 retrieval already cover all four, proceed directly to Phase 2 without asking.

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

- **Always run Phase 0 first**: retrieve brand/product/industry context from the second brain with `retrieve_fmp` before asking the user anything; ask only for fields that remain missing after retrieval
- Always load `references/industry-rules.md` before generating — never guess the industry parameters
- Always load `references/compliance-checklist.md` before delivering — never skip compliance
- For 🔴高危 industries (医疗健康, 财经, 法律), disclaimers are MANDATORY and must appear in the copy itself
- All generated copy must read like a real person's post, not a corporate announcement
- **For multi-post plans (weekly/monthly): every post MUST be formatted with paragraph breaks — never cram into a single block.** See "Paragraph Formatting Rule" in Phase 3.
- If the user only provides partial context (e.g., just the product without industry), check the second brain first, then ask for whatever is still missing before generating

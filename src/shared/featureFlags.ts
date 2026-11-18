/**
 * Feature flags for controlling experimental or incomplete features.
 * Toggle these to enable/disable features globally.
 */

/**
 * Whether to enable OpenClaw skill sync (auto-detect + manual sync entry).
 * Deleting a synced skill only removes LobsterAI's copy, so the next sync
 * imports it again; handle that before turning this back on.
 */
export const ENABLE_OPENCLAW_SKILL_SYNC = false;

/**
 * 是否启用专家广场（Expert Plaza）。
 * 【HeyClaw 核心业务规范】必须保持 false！
 * 网易有道上游新增的专家广场视图会强制劫持 HeyClaw 侧边栏“AI 团队”下的“专家团/专家/技能库/MCP”四个菜单入口，
 * 且会拉取上游预设专家。HeyClaw 拥有自研的专家管理、技能库与 MCP 体系（基于 ExpertsView），
 * 严禁开启此特性以免界面与业务逻辑被有道专家广场劫持。
 */
export const ENABLE_EXPERT_PLAZA_UI = false;

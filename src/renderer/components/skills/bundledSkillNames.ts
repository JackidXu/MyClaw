import type { LocalizedText } from '../../types/skill';

/**
 * Localized display names for the skills bundled with the app
 * (the ones listed in SKILLs/skills.config.json).
 *
 * The skill store currently ships English-only ids as names, so these give
 * Chinese users a readable title today. Once the server sends `displayName`
 * for a skill, that value wins over this map — see
 * `skillService.getLocalizedSkillName()`.
 *
 * When adding a bundled skill, add its display name here too; a missing entry
 * only means the prettified English name is shown.
 */
export const BUNDLED_SKILL_DISPLAY_NAMES: Record<string, LocalizedText> = {
  'content-ip-manager': { zh: 'IP操盘手', en: 'Content IP Manager' },
  'content-marketing-strategy-map': { zh: '营销策略图谱', en: 'Content Marketing Strategy Map' },
  'content-ip-rampup': { zh: 'IP冷启动', en: 'Content IP Rampup' },
  'content-moments-planner': { zh: '朋友圈操盘手', en: 'Moments Planner' },
  'content-topic-engine': { zh: '选题引擎', en: 'Topic Engine' },
  'content-script-writer': { zh: '文案撰写', en: 'Script Writer' },
  'qu-ai-wei': { zh: '去AI味', en: 'De-AI Tone' },
  'content-illustrator': { zh: '配图专家', en: 'Content Illustrator' },
  'content-quality-guard': { zh: '质检专家', en: 'Quality Guard' },
  'content-production-planner': { zh: '排产专家', en: 'Production Planner' },
  'content-material-library': { zh: '素材库', en: 'Material Library' },
  'content-material-matcher': { zh: '素材匹配', en: 'Material Matcher' },
  'content-video-cutter': { zh: '视频快剪', en: 'Video Cutter' },
  'content-wechat-publisher': { zh: '公众号发布', en: 'Wechat Publisher' },
  'short-form-video': { zh: '短视频创作', en: 'Short-Form Video' },
  'aihot-skill': { zh: '热点追踪', en: 'AI Hot Trend' },
  'hot-topic-select': { zh: '热点选题', en: 'Hot Topic Select' },
  'topic-generator': { zh: '选题生成器', en: 'Topic Generator' },
  'hook-and-headline-writing': { zh: '爆款标题撰写', en: 'Hook and Headline Writing' },
  'short-video-hook': { zh: '短视频黄金前3秒', en: 'Short Video Hook' },
  'huashu-proofreading': { zh: '话术校对', en: 'Script Proofreading' },
  'shouzhang-pintie-card': { zh: '手账拼贴卡片', en: 'Collage Card' },
  'black-xhs-cover': { zh: '小红书黑金封面', en: 'Black Gold Cover' },
  'marketing-psychology': { zh: '营销心理学', en: 'Marketing Psychology' },
  'content-strategy': { zh: '内容策略', en: 'Content Strategy' },
  'social-content-calendar': { zh: '社媒排期日历', en: 'Social Content Calendar' },
  'topic-reviewer': { zh: '选题评审', en: 'Topic Reviewer' },
  'huashu-topic-gen': { zh: '话术选题生成', en: 'Topic Script Generator' },
  'selling-point-translator': { zh: '卖点转化器', en: 'Selling Point Translator' },
  'geo-optimizer': { zh: 'GEO 本地优化', en: 'GEO Optimizer' },
  'rag-skill': { zh: '知识库检索', en: 'Knowledge Base (RAG)' },
  'huashu-data-pro': { zh: '数据分析专家', en: 'Data Analytics Pro' },
  'ip-strategy-report-v7': { zh: 'IP策略报告', en: 'IP Strategy Report' },
  'OPC-one-opc': { zh: '一人公司操盘', en: 'One Person Company' },
  'OPC-one-illustration': { zh: '一人公司配图', en: 'OPC Illustration' },
  'OPC-one-hook': { zh: '一人公司黄金钩子', en: 'OPC Hook' },
  'OPC-one-motion': { zh: '一人公司动效', en: 'OPC Motion' },
  'OPC-one-wiki': { zh: '一人公司百科', en: 'OPC Wiki' },
  'OPC-one-de-ai': { zh: '一人公司去AI味', en: 'OPC De-AI' },
  'OPC-one-xhs-check': { zh: '小红书违禁词检测', en: 'XHS Check' },
  'remotion-video-toolkit': { zh: 'Remotion 视频工具箱', en: 'Remotion Video Toolkit' },
  'docx': { zh: 'Word 文档处理', en: 'Word Documents' },
  'web-search': { zh: '联网搜索', en: 'Web Search' },
  'xlsx': { zh: '表格处理', en: 'Excel Spreadsheets' },
  'pptx': { zh: 'PPT 制作', en: 'PowerPoint Slides' },
  'pdf': { zh: 'PDF 处理', en: 'PDF Toolkit' },
  'playwright': { zh: 'Playwright 自动化', en: 'Playwright' },
  'article-writer': { zh: '长文写作', en: 'Article Writer' },
  'local-tools': { zh: '本地工具', en: 'Local Tools' },
  'seedance': { zh: 'Seedance 视频生成', en: 'Seedance' },
  'seedream': { zh: 'Seedream 图像生成', en: 'Seedream' },
  'skill-vetter': { zh: '技能安全审查', en: 'Skill Vetter' },
  'skill-creator': { zh: '技能创建', en: 'Skill Creator' },
};

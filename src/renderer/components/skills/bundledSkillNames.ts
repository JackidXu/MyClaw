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
  'content-ip-manager': { zh: '操盘手', en: 'IP Manager' },
  'content-marketing-strategy-map': { zh: '营销战略图', en: 'Marketing Strategy Map' },
  'content-ip-rampup': { zh: 'IP起盘定位', en: 'IP Rampup' },
  'content-moments-planner': { zh: '朋友圈发售', en: 'Moments Planner' },
  'content-topic-engine': { zh: '选题库生成', en: 'Topic Engine' },
  'content-script-writer': { zh: '逐字稿写作', en: 'Script Writer' },
  'qu-ai-wei': { zh: '文案去AI味', en: 'De-AI Writing' },
  'content-illustrator': { zh: '视觉插画师', en: 'Content Illustrator' },
  'content-quality-guard': { zh: '质量审查员', en: 'Quality Guard' },
  'content-production-planner': { zh: '排期规划师', en: 'Production Planner' },
  'content-material-library': { zh: '素材百宝箱', en: 'Material Library' },
  'content-material-matcher': { zh: '素材智能匹配', en: 'Material Matcher' },
  'content-video-cutter': { zh: '视频智能粗剪', en: 'Video Cutter' },
  'content-wechat-publisher': { zh: '微信群发助手', en: 'WeChat Publisher' },
  'content-performance-review': { zh: '复盘分析师', en: 'Performance Review' },
  'paid-traffic-operator': { zh: '投流操盘手', en: 'Paid Traffic Operator' },
  'short-form-video': { zh: '短视频生成', en: 'Short Video' },
  'aihot-skill': { zh: '全网热点捕捉', en: 'AI Hot Topics' },
  'hot-topic-select': { zh: '精选爆款选题', en: 'Hot Topic Select' },
  'topic-generator': { zh: '话题生成器', en: 'Topic Generator' },
  'hook-and-headline-writing': { zh: '吸睛钩子标题', en: 'Hook & Headline' },
  'short-video-hook': { zh: '短视频黄金前3秒', en: 'Short Video Hook' },
  'huashu-proofreading': { zh: '话术校对审校', en: 'Proofreading' },
  'shouzhang-pintie-card': { zh: '手帐拼贴卡片', en: 'Collage Card' },
  'black-xhs-cover': { zh: '小红书黑底封面', en: 'Black XHS Cover' },
  'marketing-psychology': { zh: '消费心理学洞察', en: 'Marketing Psychology' },
  'content-strategy': { zh: '全案内容战略', en: 'Content Strategy' },
  'social-content-calendar': { zh: '社媒内容日历', en: 'Content Calendar' },
  'topic-reviewer': { zh: '选题可行性评审', en: 'Topic Reviewer' },
  'huashu-topic-gen': { zh: '获客话术选题', en: 'Lead Gen Topics' },
  'selling-point-translator': { zh: '产品卖点转译', en: 'Selling Point Translator' },
  'geo-optimizer': { zh: '本地同城优化', en: 'GEO Optimizer' },
  'rag-skill': { zh: '智能知识库检索', en: 'RAG Knowledge' },
  'huashu-data-pro': { zh: '话术数据分析', en: 'Huashu Data Pro' },
  'ip-strategy-report-v7': { zh: 'IP战略报告V7', en: 'IP Strategy Report' },
  'OPC-one-opc': { zh: '超级个案OPC', en: 'Super Case OPC' },
  'OPC-one-illustration': { zh: 'OPC配图生成', en: 'OPC Illustration' },
  'OPC-one-hook': { zh: 'OPC开篇钩子', en: 'OPC Hook' },
  'OPC-one-motion': { zh: 'OPC动态卡片', en: 'OPC Motion' },
  'OPC-one-wiki': { zh: 'OPC百科词条', en: 'OPC Wiki' },
  'OPC-one-de-ai': { zh: 'OPC去AI味', en: 'OPC De-AI' },
  'OPC-one-xhs-check': { zh: 'OPC小红书合规审查', en: 'OPC XHS Check' },
  'remotion-video-toolkit': { zh: 'Remotion 视频套件', en: 'Remotion Toolkit' },
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
  'ffmpeg-tool': { zh: 'FFmpeg 多媒体处理', en: 'FFmpeg Tool' },
  'whisper-tool': { zh: 'Whisper 语音识别', en: 'Whisper Tool' },
};

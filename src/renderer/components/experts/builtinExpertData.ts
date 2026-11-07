// 业务引擎语义化类型与通用配置（无任何静态专家假数据，数据全部来自云端 presets）

export const ExpertEngineType = {
  Acquisition: 'acquisition', // 获客引擎 (IP 营销 + 内容营销)
  Conversion: 'conversion',   // 成交引擎 (复制销冠)
} as const;

export type ExpertEngineType = typeof ExpertEngineType[keyof typeof ExpertEngineType];

export interface EngineConfig {
  id: ExpertEngineType;
  badge: string;
  title: string;
  description: string;
  badgeColor: string;
  defaultScenes: string[];
}

export const ENGINE_CONFIGS: Record<ExpertEngineType, EngineConfig> = {
  [ExpertEngineType.Acquisition]: {
    id: ExpertEngineType.Acquisition,
    badge: '获客引擎',
    title: 'IP 营销 + 内容营销',
    description: '让目标客户刷到你、信你，主动来找你',
    badgeColor: 'text-amber-600 dark:text-amber-400',
    defaultScenes: ['全部', '定方向', '起盘', '选题', '做图', '拍视频', '剪辑', '发布运营'],
  },
  [ExpertEngineType.Conversion]: {
    id: ExpertEngineType.Conversion,
    badge: '成交引擎',
    title: '复制销冠',
    description: '给销售发内容弹药，把信任变成订单',
    badgeColor: 'text-blue-600 dark:text-blue-400',
    defaultScenes: ['全部', '成交弹药', '证据', '带新人'],
  },
};

// 全局默认高质感封面图
export const DEFAULT_COVER_IMAGE = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80';

// 各阶段场景专属默认封面图
export const SCENE_DEFAULT_COVERS: Record<string, string> = {
  定方向: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&auto=format&fit=crop&q=80',
  起盘: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=600&auto=format&fit=crop&q=80',
  选题: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=600&auto=format&fit=crop&q=80',
  做图: 'https://images.unsplash.com/photo-1626785774573-4b799315345d?w=600&auto=format&fit=crop&q=80',
  拍视频: 'https://images.unsplash.com/photo-1579632652768-6cb9dcf85912?w=600&auto=format&fit=crop&q=80',
  剪辑: 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=600&auto=format&fit=crop&q=80',
  发布运营: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
  成交弹药: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=600&auto=format&fit=crop&q=80',
  证据: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?w=600&auto=format&fit=crop&q=80',
  带新人: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600&auto=format&fit=crop&q=80',
};

/**
 * 获取专家展示封面图：优先使用后台配置的真实 coverImage，未配置则使用阶段或全局默认封面
 */
export function getExpertCoverImage(expert: { coverImage?: string; scene?: string }): string {
  if (expert.coverImage && expert.coverImage.trim()) {
    return expert.coverImage.trim();
  }
  if (expert.scene && SCENE_DEFAULT_COVERS[expert.scene]) {
    return SCENE_DEFAULT_COVERS[expert.scene];
  }
  return DEFAULT_COVER_IMAGE;
}

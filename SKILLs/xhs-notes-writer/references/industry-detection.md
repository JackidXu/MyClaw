# 21 Industry Detection Keywords

Each industry name maps to the corresponding rule file at:
`/Users/archerjim/Desktop/beauty-notes-writer/references/{行业名}图文笔记生成规则.md`

## Industry Detection Table

| 行业 | 规则文件名 | 检测关键词 |
|------|-----------|-----------|
| 美业 | 美业图文笔记生成规则.md | 美容/护肤/化妆品/面膜/精华/面霜/防晒/洗脸/洁面/水光/医美/皮肤管理/美甲/美睫/化妆/护肤品牌 |
| 美食 | 美食图文笔记生成规则.md | 美食/餐厅/小吃/甜品/饮料/食谱/做菜/料理/火锅/烧烤/烘焙/咖啡/茶饮 |
| 宠物 | 宠物图文笔记生成规则.md | 宠物/猫/狗/萌宠/猫咪/狗狗/异宠/猫粮/狗粮/宠物用品 |
| 职场 | 职场图文笔记生成规则.md | 职场/求职/面试/工作/加薪/升职/跳槽/简历/上班/打工/副业(不含割韭菜) |
| 服饰 | 服饰图文笔记生成规则.md | 服饰/穿搭/衣服/鞋/包/配饰/首饰/手表/穿搭/潮牌/ootd |
| 生活家居 | 生活家居图文笔记生成规则.md | 家居/装修/收纳/家具/家电/窗帘/灯具/软装/整理 |
| 教育 | 教育图文笔记生成规则.md | 教育/学习/考试/培训/课程/辅导/考研/考公/考证/升学 |
| 旅行 | 旅行图文笔记生成规则.md | 旅行/旅游/酒店/民宿/景点/攻略/出游/自驾游 |
| 母婴 | 母婴图文笔记生成规则.md | 母婴/宝宝/育儿/奶粉/尿布/待产/怀孕/产后/婴幼儿 |
| 三农 | 三农图文笔记生成规则.md | 三农/农村/农业/种植/养殖/农产品/田园/乡村 |
| 文化 | 文化图文笔记生成规则.md | 文化/书籍/书评/历史/艺术/博物馆/展览/文学/哲学 |
| 汽车 | 汽车图文笔记生成规则.md | 汽车/车/买车/驾驶/试驾/轿车/SUV/新能源车/二手车 |
| 体育 | 体育图文笔记生成规则.md | 体育/运动/健身/跑步/足球/篮球/游泳/瑜伽/马拉松 |
| 二次元 | 二次元图文笔记生成规则.md | 二次元/动漫/漫画/COS/手办/漫展/game/ACG |
| 医疗健康 | 医疗健康图文笔记生成规则.md | 医疗/健康/养生/疾病/药品/医院/体检/中医/睡眠 |
| 财经 | 财经图文笔记生成规则.md | 财经/股票/基金/理财/投资/保险/金融/赚钱/经济 |
| 法律 | 法律图文笔记生成规则.md | 法律/律师/诉讼/合同/仲裁/法规/维权 |
| 餐饮探店 | 餐饮探店图文笔记生成规则.md | 探店/打卡/网红店/排队/美食推荐(含店铺名)/餐厅测评 |
| 知识付费 | 知识付费图文笔记生成规则.md | 知识付费/课程/训练营/技能学习/在线教育/自我提升(卖课语境) |
| 制造业 | 制造业图文笔记生成规则.md | 制造/工厂/车间/生产/加工/设备/工艺/供应链/产线/工匠 |
| 情感 | 情感图文笔记生成规则.md | 情感/恋爱/婚姻/分手/约会/单身/脱单/亲密关系 |

## Auto-Detection Logic

1. Extract keywords from brand name, product description, and user conversation
2. Count keyword matches per industry
3. Select the industry with the most matches
4. If ambiguous (tie), ask the user to pick: "检测到你可能是{行业A}或{行业B}，请确认你的笔记属于哪个行业？"
5. If no clear match, show the list and ask user to select

## Ambiguity Resolution

Some brands/products may span multiple industries. Priority rules:
- Products with 护肤/化妆品 keywords → 美业 (even if mentioned with 医疗)
- Products with 餐厅/菜品 keywords → 餐饮探店 or 美食 (ask if unclear)
- 副业 content → check if it's job-seeking (职场) or money-making promise (知识付费)

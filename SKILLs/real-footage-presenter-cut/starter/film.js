// film.js —— 这条片的镜头表。本技能只做真人口播片：口播原声就是配音，t 就是口播的 t。
// 开片前先做两件事（new_film.mjs 建完目录会提示）：
//   python <skill>/scripts/footage.py host 口播.mp4 .     # 整条抽 30fps 帧 + 自动登记 counts.json
//   python <skill>/scripts/host_timeline.py 口播.mp4 script.json timeline.json   # 逐字对齐
// 竖屏口播不要手写 scale=1920:1080（会压扁），也不要 crop / zoom 去铺满（会把人裁成大特写）：
// footage.py host 自动做成「中间完整竖屏画面 + 两侧同源虚化」的 1920×1080 合成帧。
//
// 每一镜都要写：
//   scene  场景名。30 多个场景见 kit/README.md 的「选场景」表；带真素材的场景清单见 SKILL.md 硬规矩第 1 条
//   host   她在这一镜的样子：'pip'（角上圆窗）/ 'window'（右侧竖窗 + 左侧图形板）；不写 = 不加窗
//   until  到哪一刻结束：'@b02'（下一句开口）、'@b02:谁'（念到这个词）。最后一镜不写 = 到片尾
//   says   这一镜让观众多懂了什么（一句话；说不出来就重想这一镜）
//   enter  可选：'cut'（默认）/'push'/'through'/'blur'/'flat'/'whip'
//
// 两类镜头，两条路，别混：
//   带真素材（口播真人、官网原文、产品实拍、界面截图）：用原技能场景，动效参数必须写足，
//   而且【一镜一个主动作，别全片只用荧光笔】：
//     article 的 hl + zoom + hlAt 是「荧光笔刷黄 + 推近放大」（刷黄族）；
//     footage 的 push 是慢推；host 的 items / zoom / enter:'grow' 是挂墙、景别跳、从圆窗长回房间；
//     还有 device 框选、frames 推满屏、popup 窗口撑开、montage 快切实拍、desk / headlines 摊开挑一句。
//     按这一镜的 says 选一族：同族不连着用三镜，带素材 ≥5 镜至少分散到 3 族。
//     参数不写，成片里就看不到这些动效 —— 渲染代码一直在，靠镜头表触发。
//     配比、机制、使用时机见 references/footage-effects.md，写法菜单见 kit/effects.html。
//   【每镜停够】信息画面 ≥2.6 秒、元素多 / 自己画的 ≥3.0 秒、带推近刷黄动作 ≥3.4 秒；
//     最后一个落点到切镜还要留 ≥0.7 秒（带动作 1.2 秒）静止可读。
//     until 往后挪或并进相邻镜，别靠 short:true 绕开检查（一条片最多一处）。
//   不带真素材、纯靠语义画：不要写 semantic（已废弃，技能不会自动替你画）。
//     读 references/semantic-thinking.md 的四步自己设计，写在 art.js 里，再按文末注释挂到场景上。
//     不给固定构图、不给图标顺序、不给占位文案；换一条口播，本来就该画得不一样。
// 验收基准见 references/mid-film-breakdown.md：那条成片里 6 镜是原技能动效、4 镜是手绘；
// 10 镜分别停 4.4 / 6.0 / 6.2 / 4.1 / 5.3 / 5.5 / 2.6 / 3.9 / 5.1 / 4.7 秒，最短也有 2.6 秒，
// 而且动作是换着用的（刷黄只占 2 镜，其余是慢推、挂墙、景别跳）。
//
// 时刻一律写 '@句id:词'，不写秒数。词照念法写（'@b02:一百三十亿'，不是 '130亿'）。
// 下面三镜只是占位示例，展示「真人口播 + 真素材（先用占位图跑通）」怎么写：
// 它们故意用了三个不同的动作族（景别跳 / 刷黄 / 慢推），不是让你每镜都写 article。
// 成片前把占位图全换成真素材，场景和动作族从 says 出发按语义选，别照抄这个顺序。
// 下面这些 cue 词和 script.json 的三句占位文案是配套的；换成真实口播文案时一起改，
// 否则 --check 会报「句子里找不到这个词」。
// 画面别抖、别死：host 的 zoom 是硬切档位，相邻 ≥0.9 秒、方向来回 ≥1.2 秒（一缩一放挤在一起像抖）；
// popup 看完就写 back（撑开完→缩回前 ≤1.8 秒），until 跟着往前挪（缩回完 ≤0.9 秒切镜）；
// 一张静态图别单独撑过 3.2 秒，写 push / 落点或缩短。源片 25fps 觉得顿才用 footage.py host --interp 重抽。
// 详见 references/footage-effects.md 第七节。
// 写完：node <skill>/scripts/render.mjs --dir . --check → --sheet → --video --h 720
//       --check 会直接拦：动效重复（全片刷黄 / 连着三镜同族）、镜太短、末尾没留静止。
window.ready=(async()=>{
const F=await FB.init({
 counts:['assets/clips/counts.json'],   // 口播帧 + 其它实拍帧的帧数登记
 cuts:[],                               // matte.py 抠的口播人像序列名（身后换世界才要）
 fonts:KIT.FONTS,
});
const K=await KIT.use(F);
await KIT_HOST.use(K,{faceY:380});      // faceY：她脸的中心在「原片」里的 y；竖屏片 host.js 会按 fit.json 自动换算到合成帧
const PH='assets/kit/ph/';              // 占位素材：先跑通，成片之前全部换成真素材（--check 会提醒）

// 如果这一条片里有「没有真素材、得靠语义画出来」的镜头，先按四步想好画面、写进 art.js，
// 再把下面几行取消注释挂上去。只挂纯语义场景；带真素材的场景一个都不要挂。
// for(const name of ['flow','statement','discs']){
//  const def=KIT.SCENES[name];
//  def.make=(p,c)=>window.ART.make(c.i,c,p);
// }

await K.film([
 // 1 开口：房间全屏，念到关键词跳中景给墙留地方（原技能 host 的 zoom 景别跳）
 {scene:'host',until:'@b02',says:'开场抛反常识：先抛出最反常的那个数',
  zoom:[{at:0,s:1.14},{at:'@b01:那个数',s:1}]},

 // 2 讲出处：原文截图 → 推近 → 荧光笔刷过那句关键表述（刷黄族；全片一两镜就够）
 //   hl 是 [x,y,w,h]，成片时按 scripts/snap_news.mjs 量真实截图；这里用占位图先跑通
 {scene:'article',until:'@b03',host:'pip',says:'这个数是谁的、多大，用原文说清楚',
  img:PH+'news_a.jpg',hl:[120,180,460,42],tilt:-1.2,
  zoom:'@b02:谁',hlAt:'@b02:谁'},
 // 正式时间线里 zoom 和 hlAt 挂不同的词（先推近、后落笔），但 until 要留够
 // 「刷 0.45 秒 + 停 1 秒」；占位时间线两词太近，这里先挂同一个词演示参数齐全。

 // 3 讲实物：实拍缓慢推近，她留在角上圆窗（原技能 footage 的 push）
 {scene:'footage',host:'window',says:'回到问题，给一句判断',
  img:PH+'site.jpg',push:[1,1.06],badge:{name:'现场',color:'gold',at:'@b03'}},
]);
return K.go();
})();

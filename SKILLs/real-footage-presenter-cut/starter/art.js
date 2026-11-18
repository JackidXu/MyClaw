// art.js —— 纯语义镜头「自己画画面」的骨架
// -------------------------------------------------------------------------------------
// 这不是模板。这里没有构图、没有图标顺序、没有英文卡眉、没有占位文案。
// 下面那段能跑的代码只是示范「工具箱的函数怎么调」：所有上屏的字都从镜头表参数 p 里取，
// 一个中文都没写死。正式出片前，请按 references/semantic-thinking.md 的四步思考，
// 把 make 里的内容整个换成你读着这一镜口播设计出来的画面。
//
// 换一条口播、换一个 AI 工具，画出来的东西本来就应该不一样。
//
// 怎么生效：
//   1. index.html 里本文件在 film.js 之前加载（建片模板已放好）。
//   2. film.js 里把「挂自己的画层」那几行取消注释，只挂纯语义的场景。
//   3. 带真素材的场景（host / footage / article / frames / desk / device / popup / montage …）
//      一个都不要挂，它们身上就是原技能的放大、荧光笔刷黄、推近这些动效。
//
// 工具箱：window.KIT_ART（kit/semantic_scenes.js，new_film.mjs 会拷进 lib/）
// -------------------------------------------------------------------------------------
(()=>{
const A=window.KIT_ART;

window.ART={
 // i = 镜号，c = {t0,t1,at(...)}，p = 这一镜的镜头表参数
 // 返回 t => HTML。返回空字符串表示这一镜不接管。
 make(i,c,p){
  // 想清楚这一镜的信息结构以后，在这里自己决定画什么。
  // 下面只是最小可用示范：把镜头表里本来就有的短标题和第一行正文画出来。
  const title=p.title||p.brow||'';
  const line=[...(p.lines||[])][0]||'';
  if(!title&&!line)return ()=> '';

  return t=>{
   A.setMode(p);                                  // 每帧都要设，别让最后一镜的字号盖过来
   const a=A.A(t,c.t0,.42);                      // 落点按口播的字自己定，别写死秒数
   return A.BG()+
    (title?`<div style="position:absolute;left:110px;top:260px;${A.fx(a)}">${A.TITLE(title)}</div>`:'')+
    (line?`<div style="position:absolute;left:110px;top:430px;${A.fx(a)}">${A.TXT(line)}</div>`:'');
  };
 }
};
})();

// semantic_scenes.js —— 纯语义画面的「绘图工具箱」，不是模板
// -------------------------------------------------------------------------------------
// 这个文件以前会自动替换非素材场景的画面，并按固定构图 / 固定图标 / 固定英文卡眉画出来。
// 那套做法已经整体撤掉：它让每条片子、每个 AI 工具做出来的非素材画面都长得一模一样。
//
// 现在这里只有一堆**没有内容的零件**：背景、文字、卡片容器、贴片容器、线条、图标库、
// 淡入曲线、字幕安全区、两套字号。它不会挂到任何场景上，不会自动替换任何画面，
// 不会替你选版式，不会替你从口播里提取文案，更不会替你填任何占位文字。
//
// 这一屏画什么、画几个元素、用什么图标、怎么分层、字放哪儿，全部由写镜头表的人
// 读这一镜的口播语义后自己决定，写进片子目录的 art.js（骨架见 starter/art.js）。
// 思考方法见 references/semantic-thinking.md，验收基准见 references/mid-film-breakdown.md。
//
// 带真素材的镜头完全不用碰这个文件：host / footage / article / frames / desk / device /
// popup / montage … 一律由原技能场景渲染，动效原样保留（见 references/footage-effects.md）。
//
// 用法：art.js 里 `const A=window.KIT_ART;`，按需取零件拼 HTML。
// -------------------------------------------------------------------------------------
(()=>{
const CL=x=>Math.max(0,Math.min(1,x));
const esc=s=>String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const cut=(s,n)=>{s=String(s??'').trim();return s.length>n?s.slice(0,n-1)+'…':s;};
// 标题宁可缩字号也不截字
const FIT=(max,s)=>Math.max(.62,Math.min(1,max/Math.max(1,String(s??'').length)));
// 淡入：at 是时刻（秒），d 是淡入时长，i 是错峰序号。每镜的 d 由写画层的人自己定。
const A=(t,at,d=.42,i=0)=>CL((t-at-i*.16)/d);
const fx=a=>`opacity:${a.toFixed(3)};transform:translateY(${((1-a)*16).toFixed(1)}px)`;

// 画布风格：深蓝 + 琥珀金 + 米白。只是颜色和字体，不含任何内容。
const C={
 gold:'#e8cf86',goldDim:'#c9a95a',goldLo:'rgba(232,207,134,.50)',
 txt:'#f4eeda',mut:'#aab8ca',mut2:'#72859c',
 line:'rgba(232,207,134,.26)',lineS:'rgba(232,207,134,.10)',
 blue:'#7eaee0',green:'#57c2ac',dim:'#3c4b60'
};
const COL={gold:C.gold,blue:C.blue,green:C.green,red:'#e08a7a',white:C.txt};
const FH="Shu,'Alimama ShuHeiTi',sans-serif";
const FU="Mi,MiSans,'Noto Sans SC','Microsoft YaHei',sans-serif";
const FE="Mont,Montserrat,'Segoe UI',sans-serif";

// host:'window' 的图形板先缩 0.633 再输出 0.667（总 0.422）；pip / 全屏只有 0.667。
// 写画层时每帧都要按这一镜的 host 调 setMode，别让最后一镜的字号盖到别的镜上。
const WIN_F={k:22,s:32,p:52,h:104,mega:168,pad:34,gap:26};
const PIP_F={k:20,s:28,p:42,h:82,mega:132,pad:28,gap:22};
let F=WIN_F;
const setMode=p=>{F=p?.host==='window'?WIN_F:PIP_F;return F;};
// 字幕带 y>=900 不放内容；pip 镜 y>880 不放元素。
const SAFE={x0:100,x1:1820,y0:80,y1:870,pipY:880};

// -------------------------------------------------------------------------------------
// 图标库：一组线稿零件。叫什么名字、用在哪张卡、按什么顺序，全部由写画层的人按语义决定。
// 这里没有任何「第 i 张卡用第 i 个图标」的映射。
// -------------------------------------------------------------------------------------
const ICON={
 pen:'<path d="M7 39l5-1L35 15a4 4 0 0 0-6-6L6 32l1 7z"/><path d="M26 12l6 6"/>',
 person:'<circle cx="24" cy="15" r="7"/><path d="M10 41c0-8 6-13 14-13s14 5 14 13"/>',
 book:'<path d="M7 10c6-2 12-2 17 1 5-3 11-3 17-1v27c-6-2-12-2-17 1-5-3-11-3-17-1z"/><path d="M24 11v27"/>',
 rocket:'<path d="M24 6c7 5 10 13 10 21l-10 7-10-7c0-8 3-16 10-21z"/><circle cx="24" cy="20" r="4"/><path d="M14 30l-6 7 9-2M34 30l6 7-9-2M20 38l4 6 4-6"/>',
 clock:'<circle cx="24" cy="24" r="17"/><path d="M24 13v12l8 5"/>',
 chat:'<path d="M8 12a4 4 0 0 1 4-4h24a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H20l-9 7v-7a4 4 0 0 1-3-4z"/>',
 shield:'<path d="M24 6l15 5v11c0 10-6 16-15 20-9-4-15-10-15-20V11z"/><path d="m17 24 5 5 9-10"/>',
 tag:'<path d="M7 23 23 7h14v14L21 37z"/><circle cx="31" cy="15" r="3"/>',
 brain:'<path d="M24 12c-4-5-12-4-14 2-5 1-7 7-4 11-2 5 1 10 6 11 2 4 8 5 12 1zM24 12c4-5 12-4 14 2 5 1 7 7 4 11 2 5-1 10-6 11-2 4-8 5-12 1z"/><path d="M24 12v26M14 20c3 0 5 2 5 5M34 20c-3 0-5 2-5 5"/>',
 bot:'<rect x="9" y="15" width="30" height="24" rx="6"/><circle cx="18" cy="26" r="2.5"/><circle cx="30" cy="26" r="2.5"/><path d="M24 9v6M19 33h10"/>',
 check:'<circle cx="24" cy="24" r="17"/><path d="m15 24 6 6 12-13"/>',
 star:'<path d="m24 6 5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z"/>',
 qmark:'<circle cx="24" cy="24" r="17"/><path d="M19 19a5 5 0 1 1 7 4c-2 1-2 3-2 5"/><circle cx="24" cy="34" r="1.4" fill="currentColor" stroke="none"/>',
 coin:'<ellipse cx="24" cy="13" rx="15" ry="6"/><path d="M9 13v9c0 3 7 6 15 6s15-3 15-6v-9M9 22v9c0 3 7 6 15 6s15-3 15-6v-9"/>',
 chart:'<path d="M8 40h32M12 34V24M21 34V16M30 34V27M39 34V11"/>',
 bulb:'<path d="M17 30a10 10 0 1 1 14 0c-2 2-2 4-2 6H19c0-2 0-4-2-6zM20 41h8"/>',
 flag:'<path d="M12 42V7l25 6-6 8 6 8-25 6"/>',
 target:'<circle cx="24" cy="24" r="17"/><circle cx="24" cy="24" r="9"/><circle cx="24" cy="24" r="2"/>',
 link:'<path d="M20 28l8-8M18 20l-3 3a7 7 0 0 0 10 10l3-3M30 28l3-3a7 7 0 0 0-10-10l-3 3"/>'
};
const ICO=(n,s,c,sw)=>`<svg width="${s}" height="${s}" viewBox="0 0 48 48" fill="none" stroke="${c||C.gold}"
 stroke-width="${sw||2.3}" stroke-linecap="round" stroke-linejoin="round" style="display:block;color:${c||C.gold}">${ICON[n]||''}</svg>`;
const FACE=(s,mood,c)=>{
 let brow='',eye='',mouth='';
 if(mood==='think'){
  brow='<path d="M13 16h8M27 15l8 3"/>';
  eye='<circle cx="18" cy="23" r="2" fill="'+c+'" stroke="none"/><circle cx="30" cy="23" r="2" fill="'+c+'" stroke="none"/>';
  mouth='<path d="M20 33q4-3 8 0"/>';
 }else if(mood==='happy'){
  eye='<path d="M14 22q4-5 8 0M26 22q4-5 8 0"/>';mouth='<path d="M17 30q7 9 14 0"/>';
 }else if(mood==='sure'){
  brow='<path d="M14 17h8M26 17h8"/>';
  eye='<circle cx="18" cy="23" r="2" fill="'+c+'" stroke="none"/><circle cx="30" cy="23" r="2" fill="'+c+'" stroke="none"/>';
  mouth='<path d="M19 32q5 5 10 0"/>';
 }else{
  eye='<circle cx="18" cy="22" r="3"/><circle cx="30" cy="22" r="3"/>';mouth='<ellipse cx="24" cy="32" rx="3.5" ry="4.5"/>';
 }
 return `<svg width="${s}" height="${s}" viewBox="0 0 48 48" fill="none" stroke="${c}" stroke-width="2.3"
   stroke-linecap="round" stroke-linejoin="round" style="display:block">${brow}${eye}${mouth}</svg>`;
};

// -------------------------------------------------------------------------------------
// 零件：全部参数化。任何文字都由调用方传进来，本文件一个默认文案都不给。
// -------------------------------------------------------------------------------------
const KICK=(s,c)=>`<div style="font:600 ${F.k}px ${FE};letter-spacing:5px;color:${c||C.goldDim}">${esc(s)}</div>`;
const TITLE=(s,px,c)=>`<div style="font:700 ${Math.round((px||F.h)*FIT(11,s))}px ${FH};color:${c||C.txt};letter-spacing:4px;line-height:1.18">${esc(s)}</div>`;
const H2=(s,o={})=>`<div style="font:700 ${Math.round((o.px||F.p)*FIT(9,s))}px ${FH};color:${o.c||C.txt};letter-spacing:2px;line-height:1.3">${esc(s)}</div>`;
const TXT=(s,o={})=>`<div style="font:400 ${o.px||Math.round(F.p*.72)}px ${FU};color:${o.c||C.mut};letter-spacing:1px;line-height:1.5">${esc(cut(s,o.max??20))}</div>`;
const LAB=(s,o={})=>`<div style="font:700 ${o.px||F.p}px ${FH};color:${o.c||C.txt};letter-spacing:2px;line-height:1.2;white-space:nowrap">${esc(cut(s,o.max??10))}</div>`;
const CAP=(s,c)=>`<div style="display:inline-flex;align-items:center;padding:8px 22px;border-radius:999px;
  border:1px solid ${c||C.line};background:rgba(10,20,36,.72);font:600 ${F.s}px ${FU};
  letter-spacing:2px;color:${c||C.gold};white-space:nowrap">${esc(cut(s,24))}</div>`;
const RULE=()=>`<div style="height:1px;background:linear-gradient(90deg,${C.line},transparent);margin:${Math.round(F.gap*.8)}px 0"></div>`;

// 背景：只是画风，不含内容。每一层都能关。
const BG=(o={})=>{
 const corners=o.corners===false?'':[[70,58,1,1],[1850,58,-1,1],[70,1022,1,-1],[1850,1022,-1,-1]].map(([x,y,sx,sy])=>
  `<div style="position:absolute;left:${x}px;top:${y}px;width:30px;height:30px;
    border-left:${sx>0?'2px solid '+C.goldLo:'none'};border-right:${sx<0?'2px solid '+C.goldLo:'none'};
    border-top:${sy>0?'2px solid '+C.goldLo:'none'};border-bottom:${sy<0?'2px solid '+C.goldLo:'none'};
    transform:translate(${sx<0?'-30px':'0'},${sy<0?'-30px':'0'})"></div>`).join('');
 let ticks='';if(o.grid!==false)for(let i=0;i<=30;i++){const h=i%5===0?10:4;
  ticks+=`<div style="position:absolute;left:${110+i*57}px;top:${o.tickY??92}px;width:1px;height:${h}px;background:${i%5===0?C.line:C.lineS}"></div>`;}
 return `<div class="k-full" style="background:radial-gradient(ellipse 72% 78% at 50% 42%,#142440 0%,#0a1424 54%,#060b14 100%)"></div>
 <div class="k-full" style="background-image:
   repeating-linear-gradient(0deg,rgba(232,207,134,.030) 0 1px,transparent 1px 120px),
   repeating-linear-gradient(90deg,rgba(232,207,134,.030) 0 1px,transparent 1px 120px);
   -webkit-mask-image:radial-gradient(ellipse 66% 70% at 50% 46%,#000 12%,transparent 84%);
   mask-image:radial-gradient(ellipse 66% 70% at 50% 46%,#000 12%,transparent 84%)"></div>
 <div class="k-full" style="background:
   radial-gradient(ellipse 44% 54% at 18% 24%,rgba(72,124,190,.18),transparent 74%),
   radial-gradient(ellipse 40% 50% at 84% 76%,rgba(232,207,134,.11),transparent 76%)"></div>
 ${corners}${ticks}
 <div style="position:absolute;left:110px;top:${o.tickY??92}px;width:1710px;height:1px;background:linear-gradient(90deg,transparent,${C.lineS},transparent)"></div>`;
};
// 顶部一行：左右文字都由调用方给，不给就不画。别拿它当固定卡眉。
const TOP=(o={})=>o.left==null&&o.right==null?'':
 `<div style="position:absolute;left:110px;top:128px;right:110px;display:flex;align-items:center;justify-content:space-between;${fx(o.a??1)}">
   ${o.left!=null?KICK(o.left,o.leftC):'<span></span>'}${o.right!=null?`<div style="font:600 ${F.s-4}px ${FE};letter-spacing:3px;color:${C.mut2}">${esc(cut(o.right,30))}</div>`:'<span></span>'}</div>`;
const BEAM=(x,y,w,a)=>`<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;${fx(a)}">
  <div style="height:2px;background:linear-gradient(90deg,transparent,${C.goldLo},${C.gold})"></div>
  <div style="position:absolute;right:-6px;top:-7px;width:16px;height:16px;border-radius:50%;background:${C.gold};box-shadow:0 0 22px ${C.gold}"></div>
  <div style="position:absolute;left:14%;top:-3px;width:9px;height:9px;border-radius:50%;background:${C.goldDim};opacity:.7"></div>
 </div>`;

// 卡片 / 贴片都只是容器：inner 里放什么、几行、什么顺序，由调用方拼。
// 内容一律垂直居中成簇，不许用 space-between 把两行字顶到两头再留一大块空白。
const GLASS=(x,y,w,h,inner,o={})=>{
 const a=o.a??1;
 return `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;box-sizing:border-box;padding:${o.pad??F.pad}px;
  background:linear-gradient(155deg,rgba(20,33,54,.90),rgba(7,13,24,.95));
  border:1px solid ${o.border||C.line};border-radius:${o.r??26}px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 22px 52px rgba(0,0,0,.55);
  ${fx(a)};overflow:hidden">${inner}</div>`;
};
const CARD=(x,y,w,h,inner,o={})=>GLASS(x,y,w,h,
 `<div style="display:flex;flex-direction:column;justify-content:center;height:100%;box-sizing:border-box">${inner||''}</div>`,o);
const STICK=(x,y,d,inner,o={})=>{
 const a=o.a??1,rot=o.rot??0,c=o.c||C.gold,ghost=o.ghost;
 const base=o.base?Math.max(o.base,.30):0;
 const op=ghost?.62:base+(1-base)*a;
 const bd=ghost?`1px dashed ${C.mut2}`:`2px solid ${a>.65?c:C.mut2}`;
 return `<div style="position:absolute;left:${x}px;top:${y}px;width:${d}px;height:${d}px;box-sizing:border-box;
   border-radius:${o.square?'24%':'50%'};border:${bd};
   background:radial-gradient(circle at 32% 24%,rgba(255,255,255,.11),rgba(11,21,37,.94) 64%);
   box-shadow:inset 0 2px 0 rgba(255,255,255,.09),0 20px 44px rgba(0,0,0,.55),
     0 0 0 7px rgba(232,207,134,.045)${o.glow?`,0 0 46px ${c}55`:''};
   display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(d*.045)}px;
   opacity:${op.toFixed(3)};
   transform:rotate(${rot}deg) translateY(${((1-a)*18).toFixed(1)}px) scale(${(.94+.06*a).toFixed(3)})">
   ${inner||''}${o.cross?`<div style="position:absolute;left:8%;top:50%;width:84%;height:3px;background:${C.goldDim};transform:rotate(-32deg);box-shadow:0 0 12px rgba(0,0,0,.6)"></div>`:''}
  </div>`;
};

window.KIT_ART={C,COL,FH,FU,FE,ICON,SAFE,WIN_F,PIP_F,
 get F(){return F;},setMode,
 A,fx,esc,cut,FIT,ICO,FACE,KICK,TITLE,H2,TXT,LAB,CAP,RULE,BG,TOP,BEAM,GLASS,CARD,STICK,VERSION:'2.0'};
// 兼容旧名：不提供任何自动挂载入口，也不会自动改任何场景的画面。
window.KIT_SEMANTIC=window.KIT_ART;
})();

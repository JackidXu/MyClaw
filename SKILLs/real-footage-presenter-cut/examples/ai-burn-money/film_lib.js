// 《AI到底有多烧钱》第六版：在第五版 b 的基础上重做镜头运动
// 动的是镜头和世界：分层相机（远的动得少）、景深、快动作带运动模糊；东西在原地换状态。每个动作对着那句话的意思。
// 新加：真人抠像压巨字（黄仁勋、Altman）/ 人身后换背景 / 卡片在人旁边冒出来 / 钉住一个东西、底下换实拍 / 平面倒成桌面 / 横推换人。
// 数字只在"累加"时滚：四家加起来、OpenAI 累计净烧。其余的数切进来就在。
// —— film_lib.js：同一条片，底座换成 lib/film_base.js，动作换成 lib/moves.js 的手法（M.xxx，每处写了 why），用来核对手法库拆得没走样。
//    为了和 film.js 逐帧对得上，这里留着 v6 自己的 camPath/L/mega 等小工具；新片直接用 S25 的。
//    没有对应手法的镜头（快闪、新闻桌面、资金循环、柱状图、押注）仍是手写。
window.ready=(async()=>{
const preload=['grain.png','docs/burn.png','docs/n_google.png','docs/n_register.png','docs/n_amazon.png','docs/n_meta.png','stage_navy.jpg','face_jensen.png','face_altman.png','face_ellison.png','logo_google.png','icon_ms.png','logo_amazon.png','logo_meta.png','icon_nvidia.png','openai.png','logo_oracle.png'];
const F=await FB.init({counts:['assets/clips/v4_counts.json','assets/clips/v6_counts.json'],preload,fonts:['500 60px Mi','60px Shu','60px Num','600 30px Mont']});
const {T,A,B,BE,cue,INS,CL,fr,clipSrc,shot}=F,M=MV;
const C=x=>Math.max(0,Math.min(1,x)),E=x=>1-(1-C(x))**3,S=x=>{x=C(x);return x*x*(3-2*x)},IO=x=>{x=C(x);return x<.5?4*x*x*x:1-(-2*x+2)**3/2},lerp=(a,b,k)=>a+(b-a)*k;
const fade=(t,t0,d=.18)=>C((t-t0)/d);
let FOOT=false;
const BOX={};for(const n of ['jensen','altman'])BOX[n]=await fetch(A+`cut/${n}/box.json`).then(r=>r.json());
const fmt=v=>(Math.round(v/1e9)*1e9).toLocaleString('en-US');

// ---------- 2.5D 相机 ----------
// 机位 {x,y,s}：焦平面（z=1）上画面中心对着的点、放大倍数。z<1 的层远（动得少），z>1 近（动得多）。
// 一镜的机位 = 起点 + 若干次移动（每次 d 秒，两头缓）；两次移动之间按 drift 每秒慢推，所以不会定死。
function camPath(t,base,moves,drift=.02){
 let from={x:960,y:540,s:1,...base},ts=base.t??0;
 for(const m of moves){
  if(t<m.t)break;
  const dr={...from,s:from.s*(1+drift*Math.max(0,m.t-ts))},to={...dr,...m.to},k=(m.e??IO)((t-m.t)/m.d);
  if(k<1)return {x:lerp(dr.x,to.x,k),y:lerp(dr.y,to.y,k),s:lerp(dr.s,to.s,k)};
  from=to;ts=m.t+m.d;
 }
 return {...from,s:from.s*(1+drift*Math.max(0,t-ts))};
}
// 运动模糊：SVG 方向模糊，按这一层这一帧在屏幕上挪了多少挑一档
const MBK=[3,6,10,16,24,36];
const DEFS=`<svg width="0" height="0" style="position:absolute">${MBK.map(k=>`<filter id="mh${k}" x="-30%" y="-5%" width="160%" height="110%"><feGaussianBlur stdDeviation="${k} 0"/></filter><filter id="mv${k}" x="-5%" y="-30%" width="110%" height="160%"><feGaussianBlur stdDeviation="0 ${k}"/></filter>`).join('')}</svg>`;
const mbF=(vx,vy)=>{const a=Math.abs(vx),b=Math.abs(vy),m=Math.max(a,b)*.5;if(m<2)return '';const k=MBK.reduce((p,q)=>Math.abs(q-m)<Math.abs(p-m)?q:p);return `url(#${a>=b?'mh':'mv'}${k}) `;};
// 一层：c 当前机位，cp 上一帧机位（算运动模糊），z 深度；o.blur 景深虚化，o.br 亮度
function L(c,cp,z,html,o={}){
 const s=1+(c.s-1)*z,ox=(c.x-960)*z,oy=(c.y-540)*z;
 let f='';
 if(cp&&o.mb!==false){const sp=1+(cp.s-1)*z;f=mbF(((cp.x-960)*z-ox)*s,((cp.y-540)*z-oy)*s);const ds=Math.abs(s-sp)*900;if(ds>2)o={...o,blur:(o.blur??0)+(ds-2)*.5};}
 if((o.blur??0)>.3)f+=`blur(${o.blur.toFixed(1)}px) `;
 if(o.br!=null&&Math.abs(o.br-1)>.005)f+=`brightness(${o.br.toFixed(3)}) `;
 return `<div class="full" style="transform:scale(${s.toFixed(4)}) translate(${(-ox).toFixed(1)}px,${(-oy).toFixed(1)}px);${f?`filter:${f};`:''}${o.o!=null?`opacity:${C(o.o).toFixed(3)};`:''}z-index:${o.zi??Math.round(10+z*10)}">${html}</div>`;
}
const cams=(fn,t)=>[fn(t),fn(t-1/30)];

// ---------- 底：这条片子自己的抽象舞台（深色织物 + 这一段的颜色光），不假装是真实场景 ----------
const TH={navy:['#24375c','#070b14'],nv:['#3b7a1c','#050d06'],oa:['#1c6b62','#041110'],ink:['#2c3242','#06070a'],red:['#6e1f26','#0d0507']};
function ground(th,o={}){const [a,b]=TH[th];
 return `<div class="full" style="background:${b}"></div>`+
  `<div style="position:absolute;inset:-12%;background:url(${A}stage_navy.jpg) center/cover;filter:grayscale(1) brightness(${o.tb??1.25}) contrast(1.15);mix-blend-mode:screen;opacity:${o.to??.42}"></div>`+
  `<div class="full" style="background:radial-gradient(ellipse ${o.rw??52}% ${o.rh??62}% at ${o.lx??50}% ${o.ly??46}%,${a} 0%,${a}00 78%);mix-blend-mode:screen;opacity:${o.lo??1}"></div>`+
  `<div class="full" style="background:radial-gradient(ellipse at 50% 50%,#0000 42%,#000d 100%)"></div>`;}
function stageNavy(dim=1){return `<div class="full" style="background:#070a12"></div><div style="position:absolute;inset:-8%;background:url(${A}stage_navy.jpg) center/cover;filter:brightness(${1.45*dim}) saturate(.72)"></div><div class="full" style="background:radial-gradient(ellipse 70% 60% at 50% 42%,#ffffff10,#0000 60%),radial-gradient(ellipse at 50% 50%,#0000 40%,#000c 100%)"></div>`;}
// 实拍退成底：压暗、去色、略虚（字是主角的时候）
const demote=(src,o={})=>`<img src="${src}" style="position:absolute;left:-2%;top:-2%;width:104%;height:104%;object-fit:cover;filter:brightness(${o.br??.36}) saturate(${o.sat??.5}) blur(${o.bl??1.2}px)">`;
const fullImg=(src,o={})=>`<img src="${src}" style="position:absolute;left:0;top:0;width:1920px;height:1080px;object-fit:cover;${o.f?`filter:${o.f}`:''}">`;

// ---------- 字 ----------
// 巨字：数字 Bebas、汉字 阿里妈妈数黑，渐变里压一层颗粒（印刷质感），人站在它前面
function mega(txt,o){
 const parts=txt.replace(/([0-9.,$−+]+)|([^0-9.,$−+]+)/g,(m,d,h)=>d?`<span class="d">${d}</span>`:`<span class="h">${h}</span>`);
 const ax=o.anchor==='r'?'100%':o.anchor==='c'?'50%':'0%',tx=o.anchor==='r'?'-100%':o.anchor==='c'?'-50%':'0';
 return `<div class="mega" style="left:${o.x}px;top:${o.y}px;font-size:${o.size}px;--m1:${o.m?.[0]??'#f4f1e6'};--m2:${o.m?.[1]??'#b9c2ad'};transform:translate(${tx},${(o.dy??0).toFixed(1)}px) scale(${(o.s??1).toFixed(4)});transform-origin:${ax} 100%;opacity:${C(o.o??1).toFixed(3)};filter:drop-shadow(0 22px 34px #000b)${(o.b??0)>.3?` blur(${o.b.toFixed(1)}px)`:''}${o.mbv?` ${o.mbv}`:''}">${parts}</div>`;}
const brow=(x,y,zh,en,o={})=>`<div class="brow" style="left:${x}px;top:${y}px;opacity:${C(o.o??1).toFixed(3)};transform:translateX(${o.anchor==='c'?'-50%':o.anchor==='r'?'-100%':'0'});text-align:${{c:'center',r:'right'}[o.anchor]??'left'}"><b>${zh}</b>${en?`<i>${en}</i>`:''}</div>`;
// 真人抠像：源帧（1920x1080）里的 (ax,ay) 落到舞台 (x,y)，放大 sc
function cutP(n,f,o){const b=BOX[n];f=Math.max(1,Math.min(b.frames,Math.round(f)));const sc=o.sc??1,ax=o.track?lerp(o.ax??b.cx[f-1],b.cx[f-1],o.track===true?1:o.track):o.ax,left=o.x-(ax-b.x)*sc,top=o.y-(o.ay-b.y)*sc;
 return `<img src="${A}cut/${n}/${String(f).padStart(4,'0')}.png" style="position:absolute;left:${left.toFixed(1)}px;top:${top.toFixed(1)}px;width:${(b.w*sc).toFixed(1)}px;height:${(b.h*sc).toFixed(1)}px;filter:contrast(1.04) saturate(.96) drop-shadow(0 0 ${o.rimR??60}px ${o.rim??'#0000'})">`;}
// 背后的光：给抠像一个落脚的光斑，和底色同一个色
const halo=(x,y,r,c,o=1)=>`<div class="L" style="left:${x-r}px;top:${y-r}px;width:${2*r}px;height:${2*r}px;border-radius:50%;background:radial-gradient(circle,${c} 0%,${c}00 70%);opacity:${o};mix-blend-mode:screen"></div>`;

// ---------- 新闻卡（v5b） ----------
const NEWS={
 capex:{crop:[400,120,820,520],hl:[[549.2,192,259,38]]},
 n_google:{crop:[220,95,800,430],hl:[[449.6,171.2,152.7,34]]},
 n_ms:{img:'n_register',crop:[190,100,1220,420],hl:[[404.5,257.3,108.2,25]]},
 n_amazon:{crop:[20,0,1180,600],hl:[[283.5,17,142.2,35]]},
 n_meta:{crop:[220,95,800,420],hl:[[299.7,171.2,150.2,34]]}};
const cardH=(k,w)=>NEWS[k].crop[3]*w/NEWS[k].crop[2];
function card(key,o){
 const N=NEWS[key],[cx,cy,cw,ch]=N.crop,sc=o.w/cw,h=ch*sc,tot=N.hl.reduce((a,r)=>a+r[2],0),kk=C(o.hl??0)*tot;let hl='',acc=0;
 for(const [x,y,w,hh] of N.hl){const ww=Math.max(0,Math.min(w,kk-acc));acc+=w;if(ww<=0)continue;
  hl+=`<div class="L" style="left:${(x-cx-4)*sc}px;top:${(y-cy+hh*.08)*sc}px;width:${(ww+8)*sc}px;height:${hh*.86*sc}px;background:#ffd84a;mix-blend-mode:multiply;border-radius:${3*sc}px"></div>`;}
 return `<div class="L" style="left:${o.x-o.w/2}px;top:${o.y-h/2}px;width:${o.w}px;height:${h}px;transform:rotate(${o.rot??0}deg);filter:brightness(${(o.dim??1).toFixed(3)});border-radius:10px;overflow:hidden;background:#fff;box-shadow:0 24px 60px #000b,0 0 0 1px #ffffff30${o.glow?`,0 0 ${o.glow}px #ffd86a`:''}">`+
  `<img src="${A}docs/${N.img??key}.png" style="position:absolute;left:${-cx*sc}px;top:${-cy*sc}px;width:${1600*sc}px;height:${1000*sc}px">${hl}</div>`;}
// 新闻原文整页（v5b）
const DOCS={burn:{img:'docs/burn.png',whole:{s:1.2,cx:760,cy:450},close:{s:1.75,cx:705,cy:160},hl:[[736.1,114,248.7,44],[180,154,85.5,44]]}};
function doc(id,t,cut,hl0){const D=DOCS[id],cl=t>=cut,v=cl?D.close:D.whole;
 let h=`<div class="full" style="background:#fff"></div><div class="L" style="left:${960-v.cx*v.s}px;top:${540-v.cy*v.s}px;width:${1600*v.s}px;height:${1000*v.s}px"><img src="${A+D.img}" style="position:absolute;left:0;top:0;width:100%;height:100%">`;
 if(cl){const tot=D.hl.reduce((a,r)=>a+r[2],0),k=C((t-hl0)/.4)*tot;let acc=0;
  for(const [x,y,w,hh] of D.hl){const ww=Math.max(0,Math.min(w,k-acc));acc+=w;if(ww<=0)continue;
   h+=`<div class="L" style="left:${(x-4)*v.s}px;top:${(y+hh*.1)*v.s}px;width:${(ww+8)*v.s}px;height:${hh*.84*v.s}px;background:#ffd84a;mix-blend-mode:multiply;border-radius:${3*v.s}px"></div>`;}}
 h+=`</div>`;
 if(cl)h+=`<div class="full" style="background:radial-gradient(ellipse 52% 36% at 50% 50%,#fff0 45%,#ffffffc0 100%)"></div>`;
 return h;}

// ---------- 厚玻璃圆盘、管子（v5b） ----------
const PAL={nvidia:['#8fbd52','#4f8826','#21410f','#bfe28c','#122607','#f0f8e0'],openai:['#5aae99','#1f6f60','#0c342d','#98d9c8','#062019','#e4f6f1'],
 oracle:['#d97362','#a33c2e','#4e1913','#f2a99b','#2c0c08','#ffe9e3']};
const ORN=`<path d="M0 9H74M126 9H200" stroke="currentColor" stroke-width="1.3"/><path d="M74 9c8-7 14-7 18-2M126 9c-8-7-14-7-18-2M74 9c8 7 14 7 18 2M126 9c-8 7-14 7-18 2" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M100 2l5 7-5 7-5-7z" fill="currentColor"/>`;
function slab(o){
 const [hi,mid,lo,rim,edge,ink]=PAL[o.k],q=C(o.q??1),d=o.d,thk=o.thk??Math.max(7,d*.036);
 const sc=(o.s??1)*(.97+.03*q),zs=o.zs??d*.16;let tx=`<svg class="orn" viewBox="0 0 200 18">${ORN}</svg>`;
 if(o.logo)tx+=`<img class="logo" src="${A+o.logo}" style="width:${o.lw??d*.3}px;max-height:${d*.15}px;margin:${d*.025}px 0 ${d*.01}px"><div class="dots"></div>`;
 if(o.zh)tx+=`<div class="zh" style="font-size:${zs}px">${o.zh}</div>`;
 tx+=`<svg class="orn" viewBox="0 0 200 18" style="transform:scaleY(-1);margin-top:${d*.035}px">${ORN}</svg>`;
 const person=o.person?`<img class="person" src="${A+o.person}" style="left:${o.pl??40}%;height:${o.ph??86}%">`:'';
 const tpad=o.person?`padding-right:${d*.34}px;padding-left:${d*.06}px;justify-content:center`:'';
 const dim=o.dim??1;
 return `<div class="slab" style="--hi:${hi};--mid:${mid};--lo:${lo};--rim:${rim};--edge:${edge};--ink:${ink};left:${o.x-d/2}px;top:${o.y-d/2}px;width:${d}px;height:${d}px;opacity:${q};transform:scale(${sc});filter:${(o.blur??0)>.2?`blur(${o.blur.toFixed(1)}px) `:''}brightness(${dim}) saturate(${.5+.5*dim});z-index:${o.z??10}">`+
  `<div class="shadow" style="transform:translateY(${thk*2.4}px)"></div><div class="edge" style="transform:translateY(${thk}px)"></div>`+
  `<div class="face"><div class="txt" style="${tpad}">${tx}</div>${person}</div></div>`;}
function tag2(o){return `<div class="tag2" style="left:${o.x}px;top:${o.y}px;font-size:${o.size??64}px;opacity:${C(o.q??1)};transform:translateX(-50%);z-index:${o.z??30}">${o.k?`<div class="k">${o.k}</div>`:''}<span class="c">${o.cur??'$'}</span><span>${o.num}</span><span class="u">${o.u??''}</span></div>`;}
function arc(x1,y1,x2,y2,bend){const mx=(x1+x2)/2,my=(y1+y2)/2,dx=x2-x1,dy=y2-y1,l=Math.hypot(dx,dy);return [x1,y1,mx-dy/l*bend,my+dx/l*bend,x2,y2];}
const qpt=(p,k)=>{const [x1,y1,cx,cy,x2,y2]=p,a=(1-k)*(1-k),b=2*(1-k)*k,c=k*k;return [a*x1+b*cx+c*x2,a*y1+b*cy+c*y2]};
function tube(p,k,c=['#4a0d16','#a82c38','#ff9a9a'],w=24,id='t',dim=1){
 if(k<=0)return'';const [x1,y1,cx,cy,x2,y2]=p,d=`M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`;
 const [hx,hy]=qpt(p,Math.min(1,k)),[px,py]=qpt(p,Math.max(0,Math.min(1,k)-.03)),ang=Math.atan2(hy-py,hx-px)*180/Math.PI;
 const m=`<mask id="${id}"><path d="${d}" fill="none" stroke="#fff" stroke-width="${w+20}" pathLength="1000" stroke-dasharray="${Math.max(0,1000*C(k)-30)} 3000"/></mask>`;
 return `<g style="filter:brightness(${dim}) saturate(${.4+.6*dim})">`+m+`<g mask="url(#${id})"><path d="${d}" fill="none" stroke="#0008" stroke-width="${w+10}" transform="translate(0 10)" style="filter:blur(6px)"/><path d="${d}" fill="none" stroke="${c[0]}" stroke-width="${w}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${c[1]}" stroke-width="${w*.62}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${c[2]}" stroke-width="${w*.16}" stroke-linecap="round" opacity=".5" transform="translate(-2 -4)"/></g>`+
  `<g transform="translate(${hx} ${hy}) rotate(${ang})"><path d="M-30 -30 L18 0 L-30 30 Z" fill="${c[0]}"/><path d="M-26 -22 L10 0 L-26 22 Z" fill="${c[1]}"/></g></g>`;}
function table(cam,content){
 return S25.desk3d(cam,content,{plane:`<div class="plane" style="left:-2400px;top:-1700px;width:4800px;height:3400px;background:url(${A}stage_navy.jpg) center/2400px 1350px repeat;filter:brightness(1.5) saturate(.72)"></div>`})+
  `<div class="full" style="background:radial-gradient(ellipse 70% 60% at 50% 42%,#ffffff10,#0000 60%),radial-gradient(ellipse at 50% 50%,#0000 40%,#000c 100%)"></div>`;}

// ---------- 镜头 ----------

// S01 “烧钱”关键词快闪（v5b 原样）
const KWL=[
 ['AI','有多猛？四大科技巨头一年砸下7250亿美元','sr','资讯','v4_dc'],['OpenAI预计到2030年累计','近2800亿美元','news','财经','v4_altman'],
 ['大模型','竞赛：算力账单越来越大','sr','科技',null],['如何看待科技巨头疯狂','？','qa','问答',null],['谷歌资本开支翻倍，AI','提速','sr','财经','v4_dc'],
 ['AI','背后：卖芯片的英伟达成了最大赢家','video','视频','v4_jensen'],['亚马逊2000亿押注AI，华尔街担心','过猛','news','财经','v4_wafer'],
 ['一年','七千亿，AI什么时候能赚回来','qa','问答',null],['星门计划：AI','进入千亿美元时代','news','科技','v4_openai'],['Meta上调资本开支：','也要做超级智能','sr','资讯',null],
 ['AI','还能烧多久？','video','视频','v4_sunset'],['甲骨文接下3000亿美元算力大单，','再升级','sr','财经',null],['巨头集体','建数据中心','news','科技','v4_dc'],
 ['OpenAI一年收入360亿，','速度远超','sr','资讯',null],['AI泡沫？巨头','停不下来','qa','问答',null],['算力','：一座数据中心要花多少钱','video','视频','v4_wafer'],
 ['2026，AI','竞赛白热化','sr','科技',null],['英伟达投钱，OpenAI','，钱转了一圈','news','财经','v4_cnbc'],['为什么说AI是史上最','的技术','qa','问答',null],
 ['微软一年1900亿：AI','何时回本','sr','财经',null],['科技巨头的','竞赛进入新阶段','news','资讯','v4_openai'],['AI','到底有多','video','视频','v4_jensen'],
 ['AI','有多猛？四大科技巨头一年砸下7250亿美元','sr','资讯','v4_dc']];
const KW_D=1/6,KF=130;
function kwPage(i){
 const [Lt,Rt,ty,tag,img]=KWL[i%KWL.length],hx=960,kw=KF,blue=ty==='news'||ty==='qa'?'#1f1f1f':'#2440b3',fw=ty==='news'?700:500;
 const im=img?`${A}clips/${img}/${String(10+(i*7)%30).padStart(4,'0')}.jpg`:'';
 let h=`<div class="full" style="background:#fff"></div>`;
 const line=y=>`<div class="L" style="right:${1920-(hx-kw)}px;top:${y}px;white-space:nowrap;font:${fw} ${KF}px Noto;color:${blue};letter-spacing:2px">${Lt}</div>`+
  `<div class="L" style="left:${hx-kw}px;top:${y}px;width:${2*kw}px;text-align:center;white-space:nowrap;font:${fw} ${KF}px Noto;color:#e3262e">烧钱</div>`+
  `<div class="L" style="left:${hx+kw}px;top:${y}px;white-space:nowrap;font:${fw} ${KF}px Noto;color:${blue};letter-spacing:2px">${Rt}</div>`;
 const ty0=540-KF*.68-13;
 const src=`<div class="L" style="left:${hx-kw-420}px;top:${ty0-96}px;display:flex;align-items:center;gap:18px;font:500 46px Noto;color:#777"><span style="width:52px;height:52px;border-radius:50%;background:${['#3b7cff','#ff7a2f','#19b36b','#8a56ff'][i%4]};display:inline-block"></span>${tag}<span style="color:#aaa;margin-left:12px">2026-${String(1+(i*5)%9).padStart(2,'0')}-${String(3+(i*11)%25).padStart(2,'0')}</span></div>`;
 const snip=`<div class="L" style="left:${hx-kw-420}px;top:${ty0+KF*1.35}px;width:1700px;font:400 54px Noto;line-height:1.5;color:#666">${['据报道，','业内人士认为，','数据显示，','有分析指出，'][i%4]}巨额投入仍在继续，算力、芯片与数据中心成为最大开支……</div>`;
 if(ty==='news'&&im)h+=`<img src="${im}" style="position:absolute;left:${hx-kw-420}px;top:${ty0+KF*1.3}px;width:1500px;height:700px;object-fit:cover;border-radius:16px">`;else h+=snip;
 if(ty==='video'&&im)h+=`<div class="L" style="left:${hx-kw-1250}px;top:${ty0-40}px;width:760px;height:430px;border-radius:16px;overflow:hidden"><img src="${im}" style="width:100%;height:100%;object-fit:cover"><div class="L" style="left:310px;top:145px;width:140px;height:140px;border-radius:50%;background:#0008"></div></div>`;
 if(ty==='sr'&&im)h+=`<img src="${im}" style="position:absolute;left:${hx+kw+Rt.length*KF*.9+60}px;top:${ty0-30}px;width:520px;height:330px;object-fit:cover;border-radius:14px">`;
 if(ty==='qa')h+=`<div class="L" style="left:${hx-kw-420}px;top:${ty0+KF*2.6}px;font:500 46px Noto;color:#999">${120+(i*97)%900} 个回答 · ${3+(i*13)%40}万 浏览</div>`;
 return h+src+line(ty0);}
function kwFlash(t,o={}){
 const i=Math.floor(Math.max(0,t)/KW_D),p=kwPage(i),fl=[1,.94,1.04,.97,1.02][i%5];
 return `<div class="full" style="background:#050505;transform:scale(${o.s??1});filter:${o.b?`blur(${o.b.toFixed(1)}px) `:''}brightness(${fl});opacity:${o.o??1}">`+
  `<div class="full" style="filter:blur(10px)">${p}</div>`+
  `<div class="full" style="-webkit-mask-image:radial-gradient(ellipse 30% 26% at 50% 50%,#000 50%,transparent 100%);mask-image:radial-gradient(ellipse 30% 26% at 50% 50%,#000 50%,transparent 100%)">${p}</div>`+
  `<div class="full" style="background:radial-gradient(ellipse 58% 54% at 50% 50%,transparent 42%,rgba(0,0,0,.6) 74%,#000 100%)"></div>`+
  `<div class="full" style="background:repeating-linear-gradient(0deg,rgba(0,0,0,.13) 0 2px,transparent 2px 5px)"></div>`+
  `<div class="full" style="background:url(${A}grain.png);opacity:.22;background-position:${(i*137)%400}px ${(i*71)%300}px;mix-blend-mode:overlay"></div></div>`;}
const NAMES=['谷','微','亚','M'].map(w=>cue('b01',w)-.06),G=NAMES[0];
shot(0,G,t=>{FOOT=true;return kwFlash(t)+`<div class="full" style="background:#000;opacity:${1-C(t/.12)};z-index:70"></div>`;});

// S02–S03 四家的新闻摆在一张桌上：念到哪家，镜头沿桌面滑到哪张（念到才亮）；"这四家"抬高看全；
// "加起来"桌面放平压暗、退成底，四家的钱从 1800 亿（第一张）滚到 7250 亿，话说到"七千多亿"时停。
const COS=['n_google','n_ms','n_amazon','n_meta'];
const FOUR=cue('b01','这四家'),ADD=cue('b01','加起来'),N7=cue('b01','七千');
const CNT0=ADD+.05,CNT1=N7+.42;
const cnt=t=>M.roll(t,{t0:CNT0,t1:CNT1,from:180e9,to:725e9,why:'四家加起来：从第一家的 1800 亿累加到 7250 亿，说到"七千"停'});
function deskFn(t){
 const GAP=880,cx=i=>(i-1.5)*GAP;
 let px=cx(0)-260,pz=150,rx=30,py=60,dim=1;
 px=lerp(px,cx(0),IO((t-G)/.45));
 for(let i=1;i<4;i++)px=lerp(px,cx(i),IO((t-NAMES[i]+.1)/.38));
 const kf=IO((t-FOUR)/.75);px=lerp(px,0,kf);pz=lerp(pz,-1500,kf);rx=lerp(rx,38,kf);
 const ka=IO((t-ADD)/.85);rx=lerp(rx,64,ka);py=lerp(py,560,ka);pz=lerp(pz,-1800,ka);dim=lerp(1,.4,ka);
 pz+=(t-G)*70;                                  // 一直在慢慢往前推
 let cs='';
 COS.forEach((k,i)=>{const lit=t>=NAMES[i]-.05,focus=t<FOUR?(Math.abs(px-cx(i))<GAP*.5?1:.42):1;
  const cntGlow=t>=CNT0&&t<CNT1+.3?C((cnt(t)-180e9)/(545e9)*4-i)*(1-C((t-CNT1)/.3)):0;
  cs+=card(k,{x:cx(i),y:0,w:800,rot:[-2,1.5,-1,2][i],hl:(t-NAMES[i]-.02)/.25,dim:(lit?1:.32)*focus*(1+.25*cntGlow),glow:cntGlow>0?40*cntGlow:0});});
 const desk=`<div class="L" style="inset:0;perspective:1400px;perspective-origin:50% 40%"><div class="table" style="transform:translate3d(${-px}px,${py}px,${pz}px) rotateX(${rx}deg)">`+
  `<div class="plane" style="left:-3200px;top:-1600px;width:6400px;height:3200px;background:url(${A}stage_navy.jpg) center/2400px 1350px repeat;filter:brightness(1.1) saturate(.6)"></div>${cs}</div></div>`;
 let h=`<div class="full" style="background:#05070c"></div><div class="full" style="filter:brightness(${dim.toFixed(3)})">${desk}</div><div class="full" style="background:radial-gradient(ellipse at 50% 45%,#0000 38%,#000d 100%)"></div>`;
 // 快闪最后一张冲过镜头
 const zt=C((t-G)/.24);if(zt<1)h+=`<div class="full" style="z-index:70">${kwFlash(G-.01,{s:lerp(1,1.7,E(zt)),b:lerp(0,14,zt),o:1-zt})}</div>`;
 if(t>=CNT0){const q=E((t-CNT0)/.35);
  h+=`<div class="full" style="transform:translateY(${lerp(70,0,q).toFixed(1)}px);opacity:${q.toFixed(3)};z-index:60">`+
   brow(960,150,'四家 · 2026 年 AI 资本开支','BIG TECH AI CAPEX · 2026',{anchor:'c'})+
   `<div class="count" style="left:0;right:0;top:250px;text-align:center;font-size:240px">$${fmt(cnt(t))}</div></div>`;}
 return h;}
shot(G,T.title.start,deskFn);

// S04 片名：数出来的钱缩成片名上的眉题；底下实拍每 0.42 秒换一座数据中心（压暗去色，字是主角）
const MONT=['v6_m_fair','v6_m_abil','v6_m_meta','v6_m_goog','v6_dc','v6_abilene'];
const TT0=T.title.start;
const montage=(t,t0,why)=>M.montage(t,{t0,clips:MONT,why});
const WHY_TITLE='钉住片名和 7250 亿，底下连换数据中心：这笔钱 = 这些楼';
function titleFn(t,o={}){
 const q=E((t-TT0)/.22),mv=IO((t-TT0)/.4);
 let h=`<div class="full" style="background:#000"></div>`+montage(t,TT0,WHY_TITLE);
 h+=`<div class="full" style="background:radial-gradient(ellipse 60% 50% at 50% 50%,#0000 0%,#0007 100%)"></div>`;
 // 眉题：刚数出来的 7250 亿
 h+=`<div class="count" style="left:0;right:0;top:${lerp(250,286,mv).toFixed(1)}px;text-align:center;font-size:${lerp(240,64,mv).toFixed(1)}px">$${fmt(725e9)}</div>`;
 h+=`<div class="L" style="left:0;right:0;top:${lerp(560,372,mv).toFixed(1)}px;text-align:center;opacity:${mv.toFixed(3)}"><div style="display:inline-block;transform:scale(${lerp(1.04,1,q).toFixed(4)})"><div class="chrome" style="font-family:Shu;font-weight:400;font-size:168px">AI到底有多烧钱</div></div>`+
  `<div style="font:600 22px Mont;letter-spacing:12px;color:#ffffff7a;margin-top:26px">HOW MUCH MONEY IS AI BURNING</div></div>`;
 return h;}
shot(TT0,B('b03'),t=>{FOOT=true;return titleFn(t);});

// S05 这钱都花哪了：7250 亿留在中间，底下还在换数据中心；"芯片""数据中心"两个画框一左一右甩进来，钱的线分过去
const CH=cue('b03','芯')-.12,DC=cue('b03','数')-.12,B03=B('b03');
const PF={chip:[520,600,780],dc:[1400,600,780]};
function pframe(clip,t,t0,[cx,cy,w],o={}){const hh=w*9/16;return `<div class="pframe" style="left:${(cx-w/2).toFixed(1)}px;top:${(cy-hh/2).toFixed(1)}px;width:${w.toFixed(1)}px;height:${hh.toFixed(1)}px;${o.f?`filter:${o.f};`:''}${o.bw!=null?`border-width:${o.bw}px;`:''}${o.r!=null?`border-radius:${o.r}px;`:''}"><img src="${clipSrc(clip,t,t0,o.rate)}"></div>`;}
function whereFn(t){
 const c=t=>camPath(t,{t:B03,s:1},[{t:CH-.1,d:.5,to:{y:560,s:1}}],.018),[k,kp]=[c(t),c(t-1/30)];
 const out=IO((t-B03)/.45),gq=fade(t,CH-.05,.3);
 let back=`<div class="full" style="background:#000"></div>`+montage(t,TT0,WHY_TITLE);
 let h=L(k,kp,.45,back,{mb:false})+L(k,kp,.45,stageNavy(.85),{o:gq,mb:false});
 // 片名淡出，7250 亿回到中间当锚
 let top='';
 if(out<1)top+=`<div class="L" style="left:0;right:0;top:${lerp(372,330,out).toFixed(1)}px;text-align:center;opacity:${(1-out).toFixed(3)}"><div class="chrome" style="font-family:Shu;font-weight:400;font-size:168px;filter:blur(${(out*6).toFixed(1)}px)">AI到底有多烧钱</div></div>`;
 const up=IO((t-CH+.1)/.5),ny=lerp(lerp(286,400,out),130,up),ns=lerp(lerp(64,150,out),96,up);
 top+=`<div class="count" style="left:0;right:0;top:${ny.toFixed(1)}px;text-align:center;font-size:${ns.toFixed(1)}px">$${fmt(725e9)}</div>`;
 const whip=(clip,lab,pf,t1,dir)=>{if(t<t1)return '';const hh=pf[2]*9/16,y0=pf[1]-hh/2;
  const w=M.whipIn(t,{t0:t1,dir,html:`${pframe(clip,t,t1,pf)}<div class="plab" style="left:${pf[0]-pf[2]/2}px;top:${y0-74}px">${lab}</div>`,why:'钱分成两路：芯片、数据中心两样东西一左一右进来，同时停在屏上'});
  return `<svg class="L" style="left:0;top:0;opacity:${C((w.k-.6)/.4)}" width="1920" height="1080"><path d="M960 ${ny+ns*.95} C960 ${(ny+ns+y0)/2} ${pf[0]} ${(ny+ns+y0)/2} ${pf[0]} ${y0-70}" fill="none" stroke="#e8d9a8" stroke-width="3" opacity=".7"/></svg>`+w.html;};
 top+=whip('v6_wafer','芯片',PF.chip,CH,-1)+whip('v6_dc','数据中心',PF.dc,DC,1);
 return h+L(k,kp,1,top);}
shot(B03,B('b04'),t=>{FOOT=t<CH+.2;return whereFn(t);});

// S06 卖芯片的英伟达：推进芯片画框 → 黄仁勋台上实拍 → 说到"市值"他身后的台换成英伟达的绿，"5.2 万亿"立在他身后；
// "全世界最值钱"他正好张开双手，身后的字翻成"全球第一"
const B04=B('b04'),JC=cue('b04','的'),SZ=cue('b04','市值')-.05,QS=cue('b04','全世界')-.1;
const jF=t=>185+(t-cue('b04','世'))*30;            // 源片第 185 帧开始抬手，对到"世"
function jensenComp(t,c,cp){
 const tq=E((t-SZ)/.32);
 const p=M.bgSwap(t,{t0:SZ,to:{x:960,y:1120,sc:1.2},why:'说到"市值"：黄仁勋身后的台换成英伟达的绿，人还是那个人，话题进了钱的世界'});
 const fl=M.megaFlip(t,{t0:QS,why:'"全世界最值钱"：同一个人、同一个底，字从 5.2 万亿翻成全球第一'});
 let h='';
 h+=L(c,cp,.3,ground('nv',{lx:52,ly:40,rw:46,rh:70}),{mb:false});
 // 身后的字：5.2 | 万亿（人站在中间，头在两组字之间）→ 全球 | 第一
 let ty='';const yT=96,M1=['#ffffff','#cfe6b0'],M2=['#fffaf0','#e8cf86'];
 if(fl.k<1){const o=tq*fl.out.o,dy=fl.out.dy,sc=lerp(1.14,1,tq);
  ty+=mega('5.2',{x:735,y:yT,size:470,anchor:'r',s:sc,o,dy,m:M1});
  ty+=mega('万亿',{x:1185,y:yT+30,size:470,s:sc,o,dy,m:M1});}
 if(fl.k>0){const o=fl.in.o,dy=fl.in.dy;
  ty+=mega('全球',{x:735,y:yT+10,size:500,anchor:'r',o,dy,m:M2});
  ty+=mega('第一',{x:1185,y:yT+10,size:500,o,dy,m:M2});}
 h+=L(c,cp,.72,ty+brow(110,560,'英伟达 · 市值','NVIDIA · MARKET CAP',{o:tq*(1-fl.k)}),{mb:false});
 h+=L(c,cp,1,halo(960,520,560,'#8fd14f',.22)+cutP('jensen',jF(t),p),{mb:false});
 return h;}
const jCam=t=>camPath(t,{t:SZ,s:1,y:540},[{t:QS-.05,d:.7,to:{s:1.1,y:470}}],.025);
// 推进芯片画框（同一个画框推满屏）→ 黄仁勋台上实拍 → 说到"市值"换背景
const jensenFn=t=>M.frameFill(t,{t0:B04,t1:JC,box:PF.chip,from:whereFn,
 frame:(t,b,s)=>pframe('v6_wafer',t,CH,b,{bw:s.bw,r:s.r,f:`blur(${s.blur.toFixed(1)}px)`}),
 to:t=>{if(t<SZ)return fullImg(fr('v6_jensen',jF(t)));const [c,cp]=cams(jCam,t);return jensenComp(t,c,cp);},
 why:'"卖芯片的英伟达"：芯片画框推满屏，接卖这块芯片的人'});
shot(B04,B('b05'),jensenFn);

// S07 再看 OpenAI：整张黄仁勋连字带人往左推走（带运动模糊），Altman 从右边推进来，身后是 OpenAI 的青色；
// 说到"八千五百二十亿"字立在他身后；"收入"时焦点移到他肩旁冒出来的小卡片：才 360 亿
const B05=B('b05'),PU=.42,GZ=cue('b05','八')-.06,INC=cue('b06','收')-.06,CAI=cue('b06','才');
const aF=t=>12+(t-B05)*30*.8;            // 源片前 11 帧是采访者，从第 12 帧起才是 Altman
const aCam=t=>camPath(t,{t:B05+PU,s:1},[{t:INC,d:.8,to:{x:1010,y:530,s:1.05}}],.02);
function altmanComp(t,c,cp){
 const tq=E((t-GZ)/.32),f=M.cardFocus(t,{t0:INC,pulse:CAI,why:'说到"收入"：Altman 肩旁冒出 360 亿小卡，身后 8520 亿虚掉，大小一比就懂'});
 let h=L(c,cp,.3,ground('oa',{lx:62,ly:42,rw:50,rh:70}),{mb:false});
 h+=L(c,cp,.72,mega('8520',{x:100,y:260,size:480,s:lerp(1.12,1,tq),o:tq*f.big.o,b:f.big.b,m:['#e6f6f2','#86c4b6']})+mega('亿',{x:880,y:330,size:480,s:lerp(1.12,1,tq),o:tq*f.big.o,b:f.big.b,m:['#e6f6f2','#86c4b6']})+
  brow(120,120,'OpenAI · 估值','OPENAI · VALUATION',{o:fade(t,B05+PU,.3)}),{mb:false});
 h+=L(c,cp,1,halo(1330,560,520,'#59c4b0',.2)+cutP('altman',aF(t),{x:1330,y:1100,track:true,ay:1080,sc:1.14}),{mb:false});
 if(t>=INC+.2)h+=L(c,cp,1.05,`<div class="gcard" style="left:1525px;top:${(310+f.card.dy).toFixed(1)}px;opacity:${f.card.o.toFixed(3)};transform:scale(${f.card.s.toFixed(4)});transform-origin:0 50%"><b>今年收入（预计）</b><div class="n"><span class="c">$</span>360<span class="u">亿</span></div></div>`,{mb:false});
 return h;}
function altmanFn(t){
 const [c,cp]=cams(aCam,t);
 return M.pushSwap(t,{t0:B05,d:PU,dir:-1,
  from:t=>{const [jc,jcp]=cams(jCam,t);return jensenComp(t,jc,jcp);},
  to:(t,s)=>altmanComp(t,c,s.moving?null:cp),
  why:'"再看 OpenAI"：换一个人来说，黄仁勋连字带人推走，Altman 带着青色的底推进来'});}
shot(B05,B('b07'),altmanFn);

// S08 路透原文：整页认出处 → 推近标题、荧光笔刷过 → "它还准备"整页往后倒成桌面压暗，白底图表立在上面：
// 2026 到 2030 年的累计现金流一路往下画，数字跟着曲线累加，说到"两千七百多亿"时落在 −2780 亿
const B07=B('b07'),IT=cue('b07','它')-.04,LIANG=cue('b07','两'),DRAW1=LIANG+.55;
const burnK=t=>IO((t-IT-.3)/(DRAW1-IT-.3));
const CHART={x:340,y:130,w:1240,h:640};
function burnChart(t,o={}){
 const W=CHART.w,H=CHART.h,k=o.k??burnK(t),pts=[];for(let i=0;i<=48;i++){const u=i/48;pts.push([110+u*1020,170+(u**1.7)*330]);}
 const m=Math.max(1,Math.round(k*48)),poly=pts.slice(0,m+1).map(p=>p.join(',')).join(' ');
 let svg=`<polygon points="110,170 ${poly} ${pts[m][0]},170" fill="#e45a5a" opacity=".12"/><polyline points="${poly}" fill="none" stroke="#d13b3b" stroke-width="4"/><circle cx="${pts[m][0]}" cy="${pts[m][1]}" r="10" fill="#fff" stroke="#d13b3b" stroke-width="4"/>`;
 const yrs=['2026','2027','2028','2029','2030'];
 let h=`<div class="L" style="left:0;top:0;width:${W}px;height:${H}px;background:#fff;border-radius:18px;box-shadow:0 30px 70px #0006,0 2px 6px #0002">`+
  `<svg class="L" style="left:${W/2-100}px;top:24px" width="200" height="18" viewBox="0 0 200 18" color="#b8a571">${ORN}</svg>`+
  `<div class="L" style="left:0;right:0;top:50px;text-align:center;font:40px Shu;letter-spacing:6px;color:#22252b">OpenAI 累计净烧钱（预测）</div>`+
  [0,1,2,3].map(i=>`<div class="L" style="left:110px;right:110px;top:${170+i*110}px;border-top:1px dashed #0000001c"></div>`).join('')+
  `<svg class="L" style="left:0;top:0" width="${W}" height="${H}">${svg}</svg>`+
  yrs.map((y,i)=>`<div class="L" style="left:${110+i*255-26}px;top:${H-66}px;font:500 22px Mont;color:#00000070">${y}</div>`).join('')+
  `<div class="count red" style="right:80px;top:118px;font-size:104px;opacity:${C(k*6).toFixed(3)}">−$${fmt(o.k!=null?278e9:M.roll(t,{k,to:278e9,ease:x=>x<.999?Math.min(1,x**1.7):1,why:'按年累计：净烧跟着曲线一年年累加，说到"两千七百多亿"停在 −2780 亿'}))}</div></div>`;
 return h;}
function burnFn(t){
 const cut=B07+.6;
 if(t<IT){FOOT=true;const z=1+.03*(t-B07);return `<div class="full" style="transform:scale(${z.toFixed(4)})">${doc('burn',t,cut,cut+.05)}</div>`;}
 const c=camPath(t,{t:IT,s:1},[],.018),cp=camPath(t-1/30,{t:IT,s:1},[],.018);
 let h=`<div class="full" style="background:#05070c"></div>`;
 h+=L(c,cp,.5,M.layFlat(t,{t0:IT,html:doc('burn',IT-.01,cut,cut+.05),why:'"它还准备"：路透原文讲完出处，倒成桌面退成底'}),{mb:false});
 h+=L(c,cp,1,M.standUp(t,{t0:IT+.12,rect:[CHART.x,CHART.y,CHART.w,CHART.h],html:burnChart(t),why:'净烧的图表站在原文上面：证据在下，数在上'}),{mb:false});
 return h;}
shot(B07,B('b14'),burnFn);

// S09 光是算力：图表退到左边；它身后的桌面换成星门（阿比林）工地的实拍，压暗；8560 亿立在右边，比 2780 大一截
const B14=B('b14'),SL=cue('b14','算')-.08,N8=cue('b14','八')-.05;
function computeFn(t){
 const c=camPath(t,{t:B14,s:1},[],.022),cp=camPath(t-1/30,{t:B14,s:1},[],.022);
 const mv=IO((t-B14)/.55),bq=fade(t,SL,.3);
 let h=`<div class="full" style="background:#05070c"></div>`;
 h+=L(c,cp,.45,`<div class="full" style="opacity:${(1-bq).toFixed(3)};filter:brightness(.28)">${doc('burn',B14,0,0)}</div>`+`<div class="full" style="opacity:${bq.toFixed(3)}">${demote(clipSrc('v6_abilene',t,SL),{br:.42,sat:.62,bl:.6})}</div>`+`<div class="full" style="background:radial-gradient(ellipse at 50% 50%,#0000 35%,#000c 100%)"></div>`,{mb:false});
 const sc=lerp(1,.5,mv),x=lerp(CHART.x,90,mv),y=lerp(CHART.y,250,mv);
 h+=L(c,cp,1,`<div class="L" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;width:${CHART.w}px;height:${CHART.h}px;transform:scale(${sc.toFixed(4)}) perspective(2200px) rotateX(3deg);transform-origin:0 0">${burnChart(t,{k:1})}</div>`,{mb:false});
 if(t>=N8){const q=E((t-N8)/.3);
  h+=L(c,cp,1,brow(800,250,'算力 · 到 2030 年','COMPUTE COMMITMENTS · TO 2030',{o:q})+mega('8560亿',{x:790,y:360,size:400,s:lerp(1.12,1,q),o:q,m:['#fff6d8','#e3c46a']}),{mb:false});}
 FOOT=false;return h;}
shot(B14,B('b08'),computeFn);

// S10–S12 资金循环：同一张 3D 桌面，镜头去找正在说的那一家——"从哪来"在 OpenAI 上慢漂，"英伟达"摇过去找到它，
// 钱流到哪镜头跟到哪，"转了一圈"拉回看全，"回到英伟达手里"推到英伟达，其余压暗
const NV=[-520,-190],OA=[480,-260],OR=[0,170];
const B08=B('b08'),NVIN=cue('b08','英')-.1,C1=cue('b09','投'),C2=cue('b09','花'),C3=cue('b09','再'),R0=cue('b10','钱'),R1=cue('b10','又'),C6=cue('b10','手')-.05;
const tcamKeys=[[B08,{x:-470,y:40,z:120}],[NVIN-.2,{x:-470,y:40,z:180}],[NVIN+.55,{x:420,y:20,z:120}],[C1,{x:400,y:20,z:120}],[C1+1.05,{x:20,y:10,z:20}],[C2,{x:30,y:0,z:30}],[C2+.95,{x:-60,y:-110,z:-10}],[C3,{x:-60,y:-110,z:0}],[C3+1.1,{x:0,y:-20,z:-230}],[C6-.1,{x:0,y:-20,z:-190}],[C6+.75,{x:470,y:150,z:210}]];
const tcam=t=>S25.camKeys(t,tcamKeys,{z:25});
function loopCore(t){
 const cm=tcam(t),cmp=tcam(t-1/30),cam={rx:43,rz:-2,...cm};
 const others=1-.6*S((t-C6+.05)/.5);
 // 景深：离镜头对着的点越远越虚
 const fx=-cm.x,fy=-cm.y;const dofB=(p)=>Math.min(5,Math.hypot(p[0]-fx,(p[1]-fy)*1.4)/240);
 let c='';
 const p1=arc(NV[0]+200,NV[1]-30,OA[0]-200,OA[1]-10,-120),p2=arc(OA[0]+40,OA[1]+200,OR[0]+200,OR[1]-40,-140),p3=arc(OR[0]-200,OR[1]-40,NV[0]-30,NV[1]+200,-140);
 const k1=IO((t-C1)/.9),k2=IO((t-C2)/.9),k3=IO((t-C3)/.9);
 c+=`<svg class="L" style="left:-2000px;top:-1500px;width:4000px;height:3000px;overflow:visible" viewBox="-2000 -1500 4000 3000">${t>=C1?tube(p1,k1,undefined,24,'t1',others):''}${t>=C2?tube(p2,k2,undefined,24,'t2',others):''}${t>=C3?tube(p3,k3,undefined,24,'t3',others):''}</svg>`;
 const lab=(p,txt,q,num)=>{if(q<=0)return'';const [x,y]=qpt(p,.5);return `<div class="tag2" style="left:${x}px;top:${y-40}px;font-size:46px;opacity:${C(q)*others};transform:translateX(-50%)"><span style="font:34px Shu;letter-spacing:4px;color:#f1e7cc">${txt}</span>${num?`<span style="margin-left:14px">${num}</span><span class="u">亿</span>`:''}</div>`;};
 let pulse='';
 if(t>=R0&&t<R1+.25){const u=C((t-R0)/(R1-R0))*3,seg=Math.min(2,Math.floor(u)),[gx,gy]=qpt([p1,p2,p3][seg],Math.min(1,u-seg));
  pulse=`<div class="L" style="left:${gx-110}px;top:${gy-110}px;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,#ffffff 0,#fff3c4 9%,#ffc860 20%,#ff8a3c66 38%,#0000 66%);opacity:${1-C((t-R1)/.25)}"></div>`;}
 c+=lab(p1,'投资',fade(t,C1+.5,.25))+lab(p2,'买算力 $',fade(t,C2+.5,.25),'3000')+lab(p3,'买芯片',fade(t,C3+.5,.25));
 c+=slab({k:'openai',x:OA[0],y:OA[1],d:400,logo:'openai.png',lw:70,zh:'OpenAI',zs:60,person:'face_altman.png',pl:46,ph:80,dim:others,blur:dofB(OA)});
 c+=slab({k:'nvidia',x:NV[0],y:NV[1],d:400,logo:'icon_nvidia.png',lw:80,zh:'英伟达',zs:62,person:'face_jensen.png',pl:44,ph:80,blur:t>C6?0:dofB(NV)});
 if(t>=C2-.25)c+=slab({k:'oracle',x:OR[0],y:OR[1],d:380,logo:'logo_oracle.png',lw:150,zh:'甲骨文',zs:58,person:'face_ellison.png',pl:46,ph:84,q:fade(t,C2-.25,.25),dim:others,blur:dofB(OR)});
 if(t<C1)c+=tag2({x:OA[0],y:OA[1]+250,size:56,cur:'−$',num:'2780',u:'亿',k:'要烧掉的钱',q:fade(t,B08+.15,.25)*(1-fade(t,C1-.2,.25))});
 // 桌面横移时整张带一点运动模糊
 const mbv=mbF((cm.x-cmp.x)*.9,(cm.y-cmp.y)*.6);
 let H=`<div class="full" style="${mbv?`filter:${mbv}`:''}">${table(cam,c+pulse)}</div>`;
 // CNBC 新闻小卡：从"投资"那根管子旁边弹出来，新闻条就是证据，读完缩回去
 const cq0=C1-.05,cq1=C2-.35;
 H+=M.popWindow(t,{t0:cq0,t1:cq1,from:[820,320,280,158],to:[400,130,1120,630],html:`<img src="${clipSrc('v4_cnbc',t,cq0)}" style="width:100%;height:100%;object-fit:cover">`,
  why:'"英伟达投钱给 OpenAI"：CNBC 新闻条从"投资"那根管子旁边弹出来作证，读完缩回，关系图不离场'});
 return H;}
// 从工地实拍虚掉进来（上一镜虚化、压暗，退成这一镜）
const loopFn=t=>M.blurToBase(t,{t0:B08,from:computeFn,to:loopCore,why:'工地实拍和资金循环桌面是两个世界，中间没有能带过去的东西'});
const JB=INS.bite_jensen,JO=JB.start-.32;
shot(B08,JO,t=>{FOOT=false;return loopFn(t);});
// S13–S14 "难怪黄仁勋总爱说这句"：英伟达盘里的他撑开成一个窗口，桌面压暗虚掉，他在台上说"买得越多，省得越多"
const NVS=[900,363,225],JW=[400,150,1120,630];
shot(JO,B('b11'),t=>{
 const [cx,cy,r]=NVS;FOOT=true;
 return M.popWindow(t,{t0:JO,d:.32,t1:JB.end+.02,from:[cx-r,cy-r,2*r,2*r],to:JW,r0:r,r1:10,border:'none',fade:4,under:loopFn,dim:.32,blur:5,
  html:`<img src="${clipSrc('v4_bite_jh',t,JB.start)}" style="width:100%;height:100%;object-fit:cover">`,
  why:'"难怪黄仁勋总爱说这句"：从他的圆盘里撑开原声窗口，观众知道是谁在说'});});

// S15 所以 AI 到底有多烧钱？——回到片名那串数据中心实拍上问；"每年砸进去"切到一块立着柱子的地面，
// 红柱长到 7250 亿，"收回来的"镜头摇到旁边那根矮柱，"差着一大截"镜头沿着差的那一段往上抬
const B11=B('b11'),MN=cue('b11','每')-.05,ZA=cue('b11','砸'),SH=cue('b11','收')-.05,CHA=cue('b11','差')-.08;
const BASE=740,X1=640,X2=1100,BW=200,TALL=440,SMALL=54;
const bCam=t=>camPath(t,{t:MN,x:900,y:560,s:1.12},[{t:ZA,d:.8,to:{x:820,y:470,s:1.04}},{t:SH,d:.7,to:{x:1120,y:600,s:1.2}},{t:CHA,d:1.1,to:{x:1000,y:470,s:1}}],.016);
function floorGrid(){let g='';for(let i=-10;i<=10;i++)g+=`<div class="L" style="left:${960+i*160}px;top:0;width:1px;height:100%;background:#ffffff14"></div>`;for(let j=0;j<12;j++)g+=`<div class="L" style="left:-2000px;width:5920px;top:${j*120}px;height:1px;background:#ffffff14"></div>`;
 return `<div class="L" style="left:0;top:${BASE}px;width:1920px;height:900px;perspective:900px;perspective-origin:50% 0"><div class="L" style="left:-1000px;top:0;width:3920px;height:1500px;transform:rotateX(72deg);transform-origin:50% 0;background:radial-gradient(ellipse 40% 50% at 50% 0,#ffffff12,#0000 70%)">${g}</div></div>`;}
function barsFn(t,o={}){
 const c=o.c??bCam(t),cp=o.cp??bCam(t-1/30),capQ=1-fade(t,NN,.3);
 let h=L(c,cp,.35,ground('red',{lx:45,ly:35,rw:60,rh:60,lo:.7}),{mb:false});
 const kA=IO((t-ZA)/.7),kS=IO((t-SH)/.4),ga=fade(t,MN,.25);
 let b=floorGrid();
 b+=`<div class="L" style="left:420px;right:420px;top:${BASE}px;height:2px;background:#ffffff50;opacity:${ga}"></div>`;
 if(kA>0){const hh=TALL*kA;b+=`<div class="bar2" style="--b1:#7a1d27;--b2:#c2403f;left:${X1}px;width:${BW}px;top:${BASE-hh}px;height:${hh}px"></div>`+
  tag2({x:X1+BW/2,y:BASE-hh-120,size:58,num:'7250',u:'亿',q:fade(t,ZA+.5,.2)})+`<div class="cap2" style="left:${X1+BW/2}px;top:${BASE+16}px;opacity:${fade(t,ZA,.25)*capQ}"><b>每年砸进去</b></div>`;}
 if(kS>0){const hh=SMALL*kS;b+=`<div class="bar2" style="--b1:#3b2152;--b2:#7b4ea0;left:${X2}px;width:${BW}px;top:${BASE-hh}px;height:${hh}px"></div>`+
  `<div class="cap2" style="left:${X2+BW/2}px;top:${BASE+16}px;opacity:${fade(t,SH,.25)*capQ}"><b>收回来的</b></div>`;}
 const kc=IO((t-CHA)/.9);
 if(kc>0){const top=BASE-TALL,bot=BASE-SMALL-10,x3=X2+BW+70;
  b+=`<svg class="flow" style="z-index:20"><path d="M${X1+BW+20} ${top} H${x3} V${top+(bot-top)*kc} H${X2+BW+20}" fill="none" stroke="#d9c58f" stroke-width="2.5" stroke-dasharray="8 8"/></svg>`;
  b+=`<div class="L" style="left:${x3+30}px;top:${(top+bot)/2-50}px;opacity:${fade(t,CHA+.4,.25)};white-space:nowrap"><div style="font:64px Shu;letter-spacing:8px;color:#f3e6c2">差一大截</div></div>`;}
 b+=o.extra?o.extra(t):'';
 h+=L(c,cp,1,b,{mb:false});
 return h;}
shot(B11,MN,t=>{FOOT=true;const q=E((t-B11)/.25);
 return `<div class="full" style="background:#000"></div>`+montage(t,B11,'回到片名那串数据中心实拍上问"到底有多烧钱"：首尾呼应')+`<div class="full" style="background:radial-gradient(ellipse 60% 50% at 50% 50%,#0000 0%,#0007 100%)"></div>`+
  `<div class="L" style="left:0;right:0;top:400px;text-align:center;opacity:${q.toFixed(3)}"><div style="display:inline-block;transform:scale(${lerp(1.04,1,q).toFixed(4)})"><div class="chrome" style="font-family:Shu;font-weight:400;font-size:150px">AI到底有多烧钱？</div></div></div>`;});

// S16 这一大截就是赌注：差的那一段亮起来；"都在赌"四家的筹码沿地面推到这一段上；"能不能"镜头推到矮柱上的问号
const B13=B('b13'),GAPT=cue('b13','这')-.05,DU=cue('b13','赌')-.15,NN=cue('b13','能')-.05,ZK=B('b13b');
const BETS=[['logo_google.png',.62],['icon_ms.png',.5],['logo_amazon.png',.62],['logo_meta.png',.62]];
const betCam=t=>{const c0=bCam(B13);return camPath(t,{t:B13,...c0},[{t:NN,d:.9,to:{x:X2+BW/2,y:BASE-SMALL-230,s:1.5}},{t:ZK,d:.7,to:{x:X1+BW/2+52,y:BASE-TALL+178,s:1.7}}],.016);};
function betExtra(t){
 let b='';const g=E((t-GAPT)/.35);
 if(g>0)b+=`<div class="L" style="left:${X2-24}px;top:${BASE-TALL}px;width:${BW+48}px;height:${TALL-SMALL-160}px;border:3px dashed #e8cf86;border-radius:10px;background:rgba(232,207,134,${(.16*g).toFixed(3)});box-shadow:0 0 ${(60*g).toFixed(0)}px rgba(232,207,134,.35);opacity:${g}"></div>`;
 const hi=E((t-ZK)/.35);
 BETS.forEach(([lg,lw],i)=>{const t1=DU+i*.12;if(t<t1)return;const m=E((t-t1)/.45),cx=X2+BW/2+(i%2?52:-52),cy=BASE-TALL+70+Math.floor(i/2)*108,sx=cx+lerp(700,0,m),sy=cy+lerp(260,0,m);
  const isMeta=i===3,dim=isMeta?1:lerp(1,.3,hi),sc=isMeta?lerp(1,1.4,hi):1;
  b+=`<div class="L" style="left:${sx-48}px;top:${sy-48}px;width:96px;height:96px;border-radius:50%;background:#f7f5ef;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 26px #000a${isMeta&&hi>0?`,0 0 ${(40*hi).toFixed(0)}px #8fb4ff`:''};transform:scale(${sc.toFixed(3)});opacity:${C(m*3)};filter:brightness(${dim.toFixed(3)})"><img src="${A+lg}" style="width:${96*lw}px;max-height:52px;object-fit:contain"></div>`;});
 const qz=E((t-NN)/.4);
 b+=`<div class="L" style="left:${X2}px;width:${BW}px;top:${BASE-SMALL-170-qz*40}px;text-align:center;font:${(120+qz*90).toFixed(0)}px Num;color:#e9dcf5;text-shadow:0 0 ${(20+40*qz).toFixed(0)}px #b98ad0;opacity:${fade(t,SH+.2,.2)}">?</div>`;
 return b;}
// 柱子那一镜里矮柱上的问号也要在（收回来的 → ?）
const barsWithQ=t=>barsFn(t,{extra:t=>`<div class="L" style="left:${X2}px;width:${BW}px;top:${BASE-SMALL-170}px;text-align:center;font:120px Num;color:#e9dcf5;text-shadow:0 0 20px #b98ad0;opacity:${fade(t,SH+.2,.2)}">?</div>`});
shot(MN,B('b13'),t=>{FOOT=false;return barsWithQ(t);});
const META_XY=()=>{const c=betCam(ZB.start);return [960+(X1+BW/2+52-c.x)*c.s,540+(BASE-TALL+70+108-c.y)*c.s];};
const ZB=INS.bite_zuck;
const betFn=t=>{const c=betCam(t),cp=betCam(t-1/30);return barsFn(t,{c,cp,extra:betExtra});};
shot(B13,ZB.start,t=>{FOOT=false;return betFn(t);});
// S17–S18 Meta 那枚筹码推过镜头 → 扎克伯格本人（原声三句）
shot(ZB.start,T.duration,t=>{
 const [a,b,c]=ZB.parts;FOOT=true;
 const zk=t=>t<b.start?fullImg(clipSrc('v4_zuck1',t,a.start)):t<c.start?fullImg(clipSrc('v4_zuck2',t,b.start)):fullImg(clipSrc('v4_zuck3',t,c.start));
 return M.pushThrough(t,{t0:ZB.start,d:.32,s:4,at:META_XY(),from:betFn,to:zk,why:'"连扎克伯格自己都说"：Meta 那枚筹码冲过镜头，接他本人'})+
  `<div class="full" style="background:#000;opacity:${C((t-ZB.end-.05)/.6)};z-index:88"></div>`;});

return F.go({defs:DEFS,frame:h=>`<div class="full" style="filter:saturate(.9) contrast(.97)">${h}</div><div class="full" style="background:#0b0e14;mix-blend-mode:screen;z-index:78;pointer-events:none"></div><div class="bars"></div>`});
})();

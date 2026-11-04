/* iWOD 私教改期 · 动效时间轴 */
var S = [
  { id: "s1", start: 0.00, dur: 11.10 },
  { id: "s2", start: 11.10, dur: 5.95 },
  { id: "s3", start: 17.05, dur: 8.80 },
  { id: "s4", start: 25.85, dur: 4.60 },
  { id: "s5", start: 30.45, dur: 9.95 },
  { id: "s6", start: 40.40, dur: 5.20 },
  { id: "s7", start: 45.60, dur: 8.00 },
  { id: "s8", start: 53.60, dur: 10.25 },
  { id: "s9", start: 63.85, dur: 11.00 },
  { id: "s10", start: 74.85, dur: 5.30 }
];

var tl = gsap.timeline({ paused: true });

function enter(i) {
  var s = S[i], at = s.start;
  tl.set("#" + s.id, { opacity: 1, visibility: "visible" }, at);
  if (i > 0) {
    tl.to("#" + S[i - 1].id + " .clip", { opacity: 0, duration: 0.32, ease: "power2.in" }, at);
  }
  var k = tl.fromTo("#" + s.id + " .kicker", { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, at + 0.12);
  tl.fromTo("#" + s.id + " .h1", { opacity: 0, y: 42 }, { opacity: 1, y: 0, duration: 0.72, ease: "power3.out" }, at + 0.24);
  tl.fromTo("#sub-" + (i < 9 ? "0" : "") + (i + 1), { opacity: 0 }, { opacity: 1, duration: 0.3 }, at + 0.35);
  tl.to("#sub-" + (i < 9 ? "0" : "") + (i + 1), { opacity: 0, duration: 0.28 }, at + s.dur - 0.3);
  return k;
}

/* ---------- S1 ---------- */
enter(0);
tl.fromTo("#s1-video", { opacity: 0, y: 40, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: "power3.out" }, 0.42);
tl.fromTo("#s1-phone", { opacity: 0, y: 90, rotate: -1.5 }, { opacity: 1, y: 0, rotate: 0, duration: 0.85, ease: "power3.out" }, 0.95);
tl.fromTo("#s1-phone .p-row", { opacity: 0, x: -18 }, { opacity: 1, x: 0, duration: 0.45, stagger: 0.14 }, 1.5);
tl.fromTo(".stamp", { opacity: 0, scale: 1.55, rotate: -11 }, { opacity: 1, scale: 1, rotate: -11, duration: 0.45, ease: "back.out(2.4)" }, 3.2);
tl.fromTo("#s1-note", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.55 }, 4.1);
tl.to("#s1-phone", { y: -10, duration: 1.4, ease: "sine.inOut", yoyo: true, repeat: 3 }, 4.6);

/* ---------- S2 ---------- */
enter(1);
tl.fromTo("#s2-card", { opacity: 0, y: 60, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.85, ease: "power3.out" }, 11.5);
tl.fromTo("#s2-badge", { opacity: 0, scale: 0.5, rotate: -12 }, { opacity: 1, scale: 1, rotate: 0, duration: 0.5, ease: "back.out(2.6)" }, 11.9);
tl.fromTo("#s2-big", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7 }, 12.05);
tl.fromTo("#s2-sub", { opacity: 0 }, { opacity: 1, duration: 0.6 }, 12.4);
tl.fromTo("#s2-lead", { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.5 }, 12.6);
tl.to("#s2-badge", { scale: 1.06, duration: 0.7, yoyo: true, repeat: 2, ease: "sine.inOut" }, 13.2);

/* ---------- S3 ---------- */
enter(2);
tl.fromTo("#s3-timeline", { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.6 }, 17.45);
tl.fromTo("#s3-fill", { width: 0 }, { width: 740, duration: 2.1, ease: "power2.inOut" }, 17.8);
tl.fromTo("#s3-timeline .tl-node", { scale: 0 }, { scale: 1, duration: 0.4, stagger: 0.16, ease: "back.out(3)" }, 17.8);
tl.fromTo("#s3-timeline .tl-lb", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.16 }, 18.05);
tl.fromTo("#s3-window", { opacity: 0, x: -18 }, { opacity: 1, x: 0, duration: 0.45 }, 18.5);
tl.fromTo("#s3-chat", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.65 }, 19.1);
tl.fromTo("#s3-chat .msg", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.55 }, 19.4);
tl.fromTo("#s3-hint", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 20.4);

/* ---------- S4 ---------- */
enter(3);
tl.fromTo("#s4-video", { opacity: 0, scale: 1.06 }, { opacity: 1, scale: 1, duration: 0.8 }, 26.15);
tl.fromTo("#s4-list .status", { opacity: 0, y: 34 }, { opacity: 1, y: 0, duration: 0.55, stagger: 0.35 }, 26.5);
tl.fromTo("#s4-rule", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 27.5);
tl.to("#s4-list .status.no", { scale: 1.02, duration: 0.5, yoyo: true, repeat: 1, ease: "sine.inOut" }, 28.1);

/* ---------- S5 ---------- */
enter(4);
tl.fromTo("#s5-ui", { opacity: 0, y: 48 }, { opacity: 1, y: 0, duration: 0.75, ease: "power3.out" }, 30.8);
tl.fromTo("#s5-ui .ui-block", { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.5, stagger: 0.28 }, 31.3);
tl.fromTo("#s5-ui .switch-row", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.45 }, 31.9);
tl.fromTo("#s5-load", { opacity: 0 }, { opacity: 1, duration: 0.4 }, 32.25);
tl.fromTo("#s5-chip", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.45 }, 32.5);
tl.to("#s5-ui .spinner", { rotate: 360, duration: 1, repeat: 6, ease: "none", transformOrigin: "50% 50%" }, 32.3);

/* ---------- S6 ---------- */
enter(5);
tl.fromTo("#s6-grid .slot", { opacity: 0, y: 24, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, stagger: 0.08 }, 40.75);
tl.fromTo("#s6-submit", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5 }, 41.35);
tl.to("#s6-grid .slot.busy", { backgroundColor: "#FFD9CE", duration: 0.3, yoyo: true, repeat: 3 }, 41.7);
tl.fromTo("#s6-alert", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5 }, 42.15);
tl.fromTo("#s6-note", { opacity: 0 }, { opacity: 1, duration: 0.4 }, 42.5);
tl.to("#s6-submit", { backgroundColor: "#C9D2DF", duration: 0.01 }, 42.2);

/* ---------- S7 ---------- */
enter(6);
tl.fromTo("#s7-devices .dev", { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.55, stagger: 0.22, ease: "power3.out" }, 46.0);
tl.fromTo("#s7-flow", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5 }, 46.9);
tl.to("#s7-devices .dot", { scale: 1.35, duration: 0.6, stagger: 0.2, yoyo: true, repeat: 3, ease: "sine.inOut" }, 47.2);

/* ---------- S8 ---------- */
enter(7);
tl.fromTo("#s8-video", { opacity: 0, scale: 1.05 }, { opacity: 1, scale: 1, duration: 0.8 }, 53.95);
tl.fromTo("#s8-wechat", { opacity: 0, y: 44 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, 54.35);
tl.fromTo("#s8-wechat .wx-card", { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.5 }, 54.7);
tl.fromTo("#s8-steps .step", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.2 }, 55.2);
tl.fromTo("#s8-note", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 55.9);
tl.to("#s8-wechat .go", { opacity: 0.45, duration: 0.7, yoyo: true, repeat: 4 }, 55.4);

/* ---------- S9 ---------- */
enter(8);
tl.fromTo("#s9-video", { opacity: 0, scale: 1.06 }, { opacity: 1, scale: 1, duration: 0.85 }, 64.15);
tl.fromTo("#s9-stats .stat", { opacity: 0, y: 34 }, { opacity: 1, y: 0, duration: 0.55, stagger: 0.16 }, 64.5);
var c = { v: 0 };
tl.to(c, { v: 7000, duration: 1.8, ease: "power2.out", onUpdate: function () {
  var el = document.getElementById("s9-num");
  if (el) el.innerHTML = Math.round(c.v) + '<span class="unit">+</span>';
} }, 64.7);
tl.fromTo("#s9-two", { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.6 }, 65.6);
tl.fromTo("#s9-note", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 66.1);

/* ---------- S10 ---------- */
enter(9);
tl.fromTo("#s10-big", { opacity: 0, scale: 0.82 }, { opacity: 1, scale: 1, duration: 0.7, ease: "back.out(1.8)" }, 75.1);
tl.fromTo("#s10-box", { opacity: 0, y: 34 }, { opacity: 1, y: 0, duration: 0.6 }, 75.5);
tl.fromTo("#s10-cta", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.55 }, 76.0);
tl.fromTo("#s10-hint", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 76.3);
var w = { n: 0 };
tl.to(w, { n: 2, duration: 0.8, ease: "none", onUpdate: function () {
  var el = document.getElementById("s10-word");
  if (el) el.textContent = "适用".slice(0, Math.round(w.n));
} }, 75.9);
tl.to("#s10-input .cursor", { opacity: 0, duration: 0.42, repeat: 5, yoyo: true }, 76.0);

/* 字幕底衬常显 */
tl.set("#sub-scrim", { opacity: 1 }, 0.05);

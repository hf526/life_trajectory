/* motion.js：数字滚动 + 卡片错峰入场
 * 零侵入设计：不改动任何业务 js，靠 MutationObserver 自动接管 KPI 数字的写入并做补间。
 * API：
 *   Motion.setNum(el, text, animateFirst)  写入数字并滚动过去（animateFirst=true 时首帧也滚）
 *   Motion.reveal(container)               容器内 .card 首次进入视口时错峰淡入
 */
(function () {
  const REDUCE = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const SEL = ".kpi b, .verdict b, .probs b, .vprob b, .stat b, .hero-num b, .hero-pct b, .hero-lg b";

  // 把 "≈1,234.5万" 拆成 前缀 + 数字 + 后缀，记住小数位与千分位，回写时保持原格式
  function parts(s) {
    const str = String(s == null ? "" : s);
    const m = str.match(/(-?\d[\d,]*(?:\.\d+)?)/);
    if (!m) return null;
    const raw = m[0];
    return {
      pre: str.slice(0, m.index),
      post: str.slice(m.index + raw.length),
      dec: (raw.split(".")[1] || "").length,
      comma: raw.indexOf(",") >= 0,
      to: parseFloat(raw.replace(/,/g, "")),
    };
  }

  function fmtNum(v, p) {
    let s = p.dec > 0 ? v.toFixed(p.dec) : String(Math.round(v));
    if (p.comma) {
      const neg = s.charAt(0) === "-";
      const b = neg ? s.slice(1) : s;
      const seg = b.split(".");
      seg[0] = seg[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      s = (neg ? "-" : "") + seg.join(".");
    }
    return s;
  }

  function setNum(el, text, animateFirst) {
    if (!el) return;
    const p = parts(text);
    if (!p || REDUCE) {
      el.textContent = text;
      el.__own = text;
      el.__cur = p ? p.to : null;
      return;
    }
    if (el.__raf) { cancelAnimationFrame(el.__raf); el.__raf = null; }
    const to = p.to;
    let from = el.__cur;
    if (from == null || !isFinite(from)) {
      // 元素刚被重建（innerHTML 重写）：不做入场动画，否则拖滑杆会一直抖
      if (!animateFirst) { el.__cur = to; el.textContent = text; el.__own = text; return; }
      from = to * 0.55;
    }
    if (from === to) { el.__cur = to; el.textContent = text; el.__own = text; return; }
    const dur = animateFirst && el.__seen !== to ? 520 : 240;
    el.__seen = to;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.__cur = from + (to - from) * e;
      const s = p.pre + fmtNum(el.__cur, p) + p.post;
      el.__own = s;
      el.textContent = s;
      if (k < 1) el.__raf = requestAnimationFrame(step);
      else { el.__cur = to; el.__own = text; el.textContent = text; el.__raf = null; }
    };
    el.__raf = requestAnimationFrame(step);
  }

  function handle(el) {
    if (!el || !el.matches || !el.matches(SEL)) return;
    if (el.textContent === el.__own) return; // 自己写的，不回环
    setNum(el, el.textContent, false);
  }

  let mo = null;
  function observe() {
    if (mo || typeof MutationObserver === "undefined") return;
    mo = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "characterData") { handle(m.target.parentElement); continue; }
        handle(m.target);
        if (m.addedNodes && m.addedNodes.length) {
          m.addedNodes.forEach((n) => {
            if (n.nodeType !== 1) return;
            handle(n);
            if (n.querySelectorAll) n.querySelectorAll(SEL).forEach(handle);
          });
        }
      }
    });
    mo.observe(document.body, { subtree: true, childList: true, characterData: true });
  }

  /* 卡片错峰入场：同一个窗口只演一次，拖滑杆重排不会重放 */
  const seen = new Set();
  let io = null;
  function reveal(container) {
    if (!container) return;
    const items = container.querySelectorAll(".card.reveal:not(.in)");
    if (!items.length) return;
    // 容器不可见（比如在未激活的 tab 里）：直接显示，不排队等 IntersectionObserver
    if (REDUCE || typeof IntersectionObserver === "undefined" || !container.offsetParent) {
      items.forEach((el) => {
        const key = el.dataset.rk || el.getAttribute("aria-label") || "";
        if (key) seen.add(key);
        el.classList.add("in");
      });
      return;
    }
    if (!io) {
      io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          setTimeout(() => e.target.classList.add("in"), 0);
        });
      }, { rootMargin: "0px 0px -30px 0px" });
    }
    let slot = 0;
    items.forEach((el) => {
      const key = el.dataset.rk || el.getAttribute("aria-label") || "";
      if (key && seen.has(key)) { el.classList.add("in"); return; }
      if (key) seen.add(key);
      el.style.animationDelay = Math.min(slot++, 14) * 35 + "ms";
      io.observe(el);
    });
  }

  window.Motion = { setNum, reveal, reduce: REDUCE };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", observe);
  else observe();
})();

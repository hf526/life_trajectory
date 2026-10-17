/* util.js：partner / wealth / loan / rentbuy 四个计算器共用的小工具
 * 只收「逐字相同」的那部分：格式化口径与芯片/分段滑杆读写改一处即可，
 * 不必在四个文件里各改一遍（之前 YUAN、clamp、num、fmtW 等重复了 3–4 份）。
 * 依赖：window.SliderScale（scale.js），在 bindScale/readScale/writeScale 被调用时才用到。
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const YUAN = 10000; // 1万 = 10000元，内部统一用元

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const cleanNum = (v) => String(v ?? "").trim().replace(/[,，\s]/g, ""); // 千分位逗号/空格直接删掉，小数点保留
  const num = (v, d) => { const n = parseFloat(cleanNum(v)); return Number.isFinite(n) ? n : d; };
  const int = (v, d) => { const n = parseInt(cleanNum(v), 10); return Number.isFinite(n) ? n : d; };
  const trim1 = (v) => String(parseFloat(Number(v).toFixed(2))); // 两位小数，多余尾零自动去掉
  const fmtW = (yuan) => {
    const neg = yuan < 0 ? "-" : "";
    const a = Math.abs(yuan) / YUAN;
    return neg + (a >= 1000 ? a.toFixed(0) : a.toFixed(1)) + "万";
  };
  const fmtYuan = (v) => v >= 10000 ? (v / 10000).toFixed(2) + "万" : Math.round(v) + "元";

  const chipVal = (id) => $(id)?.querySelector(".chip.active")?.dataset.v ?? null;
  function setChips(id, v) {
    const box = $(id);
    if (!box) return;
    if (!box.querySelector(`[data-v="${v}"]`)) return; // 旧存档的值已下线则保留默认
    box.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.v === v));
  }

  // 金额滑杆经分段刻度换算：value 属性存的是档位序号，不是万元
  function bindScale(id, segs, val) { window.SliderScale.bind($(id), segs, val); }
  function readScale(id) { return window.SliderScale.read($(id)); }
  function writeScale(id, v) { window.SliderScale.write($(id), v); }

  window.Util = {
    YUAN, clamp, num, int, trim1, fmtW, fmtYuan,
    chipVal, setChips, bindScale, readScale, writeScale,
  };
})();

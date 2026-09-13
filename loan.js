/* 贷款买房/车风险器 v2：滑杆输入 + 断供概率结论 + 利率压力测试
 * 房/车双模式（切换自动换量程与默认值），等额本息/本金两种算法，localStorage 持久化
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const LS_KEY = "loan-v2";
  const YUAN = 10000;

  // 数值单位：万元（收入/支出/存款/贷款），显示时转元
  const PRESETS = {
    house: { loan: 100, rate: 3.3, years: 30, income: 1.2, expense: 0.8, deposit: 10, type: "annuity", job: "normal" },
    car: { loan: 12, rate: 5, years: 3, income: 1.0, expense: 0.5, deposit: 3, type: "annuity", job: "normal" },
  };
  const RANGES = {
    house: {
      fLoan: [20, 500, 5], fRate: [1, 8, 0.1],
      fExpense: [0, 5, 0.1], fDeposit: [0, 200, 1], years: [10, 20, 30],
    },
    car: {
      fLoan: [5, 80, 1], fRate: [1, 12, 0.1],
      fExpense: [0, 5, 0.1], fDeposit: [0, 50, 1], years: [1, 3, 5],
    },
  };
  const SHOCK_BASE = { stable: 0.04, normal: 0.08, volatile: 0.15 }; // 年内收入中断3个月的假设概率

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  // 税后月收入用对数刻度：低收入占更多格子（0.3万→0格，1.2万→40格，3万→66格，10万→100格）
  const INCOME_MIN = 0.3, INCOME_MAX = 10;
  const INCOME_SPAN = Math.log(INCOME_MAX / INCOME_MIN);
  const incomeFromPos = (pos) => INCOME_MIN * Math.exp(INCOME_SPAN * clamp(num(pos, 0), 0, 100) / 100);
  const incomeToPos = (v) => clamp(100 * Math.log(clamp(num(v, INCOME_MIN), INCOME_MIN, INCOME_MAX) / INCOME_MIN) / INCOME_SPAN, 0, 100);
  function setIncomeSlider(wan) {
    const el = $("fIncome");
    if (!el) return;
    el.min = 0; el.max = 100; el.step = 1;
    el.value = Math.round(incomeToPos(wan));
  }
  const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
  const trim1 = (v) => String(parseFloat(Number(v).toFixed(1)));
  const fmtW = (yuan) => {
    const neg = yuan < 0 ? "-" : "";
    const a = Math.abs(yuan) / YUAN;
    return neg + (a >= 1000 ? a.toFixed(0) : a.toFixed(1)) + "万";
  };
  const fmtYuan = (v) => v >= 10000 ? (v / 10000).toFixed(2) + "万" : Math.round(v) + "元";
  const chipVal = (id) => $(id)?.querySelector(".chip.active")?.dataset.v;
  function setChips(id, v) {
    const box = $(id);
    if (!box) return;
    if (!box.querySelector(`[data-v="${v}"]`)) return;
    box.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.v === v));
  }

  function getInputs() {
    return {
      mode: chipVal("loanMode") || "house",
      type: chipVal("loanType") || "annuity",
      loan: Math.max(0, num($("fLoan").value, 0)) * YUAN,
      rate: clamp(num($("fRate").value, 0), 0, 20) / 100,
      years: clamp(Math.round(num(chipVal("loanYears"), 0)), 1, 40),
      income: Math.max(0, Math.round(incomeFromPos($("fIncome").value) * 10) / 10) * YUAN,
      expense: Math.max(0, num($("fExpense").value, 0)) * YUAN,
      deposit: Math.max(0, num($("fDeposit").value, 0)) * YUAN,
      job: chipVal("loanJob") || "normal",
    };
  }

  // 月供（等额本金按首月，最保守）与总利息
  function calcPay(P, annualRate, years, type) {
    const n = Math.max(1, Math.round(years * 12));
    const r = annualRate / 12;
    if (type === "principal") {
      const first = P / n + P * r;
      return { pay: first, totalInterest: P * r * (n + 1) / 2, n };
    }
    if (r < 1e-9) return { pay: P / n, totalInterest: 0, n };
    const k = Math.pow(1 + r, n);
    const pay = (P * r * k) / (k - 1);
    return { pay, totalInterest: pay * n - P, n };
  }

  function calc(p) {
    const { pay, totalInterest } = calcPay(p.loan, p.rate, p.years, p.type);
    const ratio = p.income > 0 ? pay / p.income : NaN;
    const monthlyOut = pay + p.expense;
    const buffer = monthlyOut > 0 ? p.deposit / monthlyOut : Infinity;
    // 断供概率 = 慢性压力 + 急性冲击（示意估算，口径见脚注）；5年/10年按年概率复利累加
    const chronic = !(p.income > 0) ? 0.15 : ratio > 0.5 ? 0.25 : ratio > 0.35 ? 0.10 : 0.02;
    const shock = (SHOCK_BASE[p.job] ?? 0.08) * Math.max(clamp((6 - buffer) / 6, 0, 1), 0.25); // 缓冲再厚也留25%暴露，黑天鹅面前人人平等
    const p1 = clamp(chronic + shock, 0, 0.95);
    const p5 = 1 - Math.pow(1 - p1, 5);
    const p10 = 1 - Math.pow(1 - p1, 10);
    const noIncomeWithLoan = !(p.income > 0) && p.loan > 0; // 无收入却背贷款：存款再厚也不能算稳健
    const danger = noIncomeWithLoan || (p.income > 0 && ratio > 0.5) || buffer < 3;
    const tight = (p.income > 0 && ratio > 0.35) || buffer < 6;
    const grade = danger ? "危险" : tight ? "紧张" : "稳健";
    const stress = [0.01, 0.02].map((d) => {
      const s = calcPay(p.loan, p.rate + d, p.years, p.type);
      return { d, pay: s.pay, ratio: p.income > 0 ? s.pay / p.income : NaN };
    });
    return { pay, totalInterest, ratio, buffer, p1, p5, p10, grade, stress };
  }

  function render() {
    if (!$("loanForm")) return;
    const p = getInputs();
    const r = calc(p);
    const isHouse = p.mode === "house";
    const probCls = r.grade === "稳健" ? "go" : r.grade === "紧张" ? "tight" : "past";
    $("vLoan").textContent = trim1(p.loan / YUAN);
    $("vRate").textContent = trim1(p.rate * 100);
    $("vIncome").textContent = trim1(p.income / YUAN);
    $("vExpense").textContent = trim1(p.expense / YUAN);
    $("vDeposit").textContent = trim1(p.deposit / YUAN);
    const probEl = $("lProb");
    const fmtP = (x) => (x * 100).toFixed(x < 0.1 ? 1 : 0) + "%";
    probEl.textContent = fmtP(r.p1);
    probEl.className = probCls;
    $("lProb5").textContent = fmtP(r.p5);
    $("lProb10").textContent = fmtP(r.p10);
    $("lVerdict").textContent =
      r.grade === "危险" ? "别签！先降总额、拉长期限或攒够6个月缓冲再来。" :
      r.grade === "紧张" ? "悬：把存款垫到6个月（月供+支出）再上车，期间别加负债。" :
      "扛得住：按时还、留好存款缓冲，别乱加负债。";
    $("lPay").textContent = fmtYuan(r.pay) + (p.type === "principal" ? "/首月" : "");
    $("lRatio").textContent = Number.isFinite(r.ratio) ? (r.ratio * 100).toFixed(1) + "%" : "–";
    $("lBuffer").textContent = !Number.isFinite(r.buffer) ? "–" : r.buffer >= 20 ? "20+月" : r.buffer.toFixed(1) + "月";
    $("lInterest").textContent = fmtW(r.totalInterest);
    const badge = $("riskBadge");
    badge.textContent = (isHouse ? "房贷" : "车贷") + r.grade;
    badge.className = "badge " + probCls;
    $("riskDesc").textContent =
      r.grade === "稳健" ? "占比和缓冲都在安全线内。" :
      r.grade === "紧张" ? "有一项踩线，重点看上面的断供概率。" :
      "占比或缓冲已亮红灯，结论区给了明确动作。";
    $("loanStress").innerHTML = r.stress.map((s) =>
      `<span class="mile${s.ratio > 0.5 ? " dim" : ""}">利率+${s.d * 100}% → 月供${fmtYuan(s.pay)}${Number.isFinite(s.ratio) ? `（${(s.ratio * 100).toFixed(0)}%）` : ""}</span>`
    ).join("");
    $("loanSub").textContent = `${isHouse ? "买房" : "买车"} · 1年断供约${fmtP(r.p1)} · 月供${fmtYuan(r.pay)}`;

    const adv = [];
    if (!(p.income > 0) && p.loan > 0) adv.push(`当前无税后月收入：靠存款硬扛月供，先有稳定收入再签约。`);
    else if (p.income > 0 && r.ratio > 0.5) adv.push(`月供吃掉收入 <b>${(r.ratio * 100).toFixed(0)}%</b>：过了50%红线，降总额、拉长期限、多攒首付三选一。`);
    else if (p.income > 0 && r.ratio > 0.35) adv.push(`月供占比 <b>${(r.ratio * 100).toFixed(0)}%</b>：偏紧但可扛，别再新增大额分期。`);
    else if (p.income > 0) adv.push(`月供占比 <b>${(r.ratio * 100).toFixed(0)}%</b>：30%线内，健康。`);
    if (r.buffer < 3) adv.push(`存款只撑 <b>${r.buffer.toFixed(1)}个月</b>：先存够6个月（月供+支出）约 <b>${fmtYuan((r.pay + p.expense) * 6)}</b> 再上车。`);
    else if (r.buffer < 6) adv.push(`缓冲 <b>${r.buffer.toFixed(1)}个月</b>：补到6个月就达标，单独存着别动。`);
    else adv.push(`缓冲 <b>${r.buffer >= 20 ? "20+" : r.buffer.toFixed(1)}个月</b>：达标，继续保持。`);
    const worst = r.stress[1];
    if (worst.ratio > 0.5) adv.push(`利率+2%后月供占比 <b>${(worst.ratio * 100).toFixed(0)}%</b>：顶不住加息，现在的方案偏脆弱。`);
    if (!isHouse && (p.rate > 0.06 || p.years > 5)) adv.push(`车是贬值消费品：利率超6%或贷超5年都不划算，尽量缩短期限。`);
    if (isHouse && r.totalInterest > p.loan) adv.push(`总利息 <b>${fmtW(r.totalInterest)}</b> 超过本金：期限长是省月供的代价，有钱可提前还。`);
    $("loanAdvice").innerHTML = adv.slice(0, 4).map((a) => `<li>${a}</li>`).join("");
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        mode: p.mode, type: p.type, years: p.years, job: p.job,
        loan: p.loan / YUAN, rate: p.rate, income: p.income / YUAN,
        expense: p.expense / YUAN, deposit: p.deposit / YUAN,
      }));
    } catch (e) {}
  }

  function setRange(id, min, max, step, val) {
    const el = $(id);
    if (!el) return;
    el.min = min; el.max = max; el.step = step; el.value = val;
  }
  function buildYears(mode) {
    const box = $("loanYears");
    if (!box) return;
    const cur = chipVal("loanYears");
    const opts = (RANGES[mode] || RANGES.house).years;
    const fallback = mode === "car" ? 3 : 30;
    box.innerHTML = opts.map((y) => `<button class="chip" data-v="${y}" type="button">${y}年</button>`).join("");
    setChips("loanYears", opts.includes(Number(cur)) ? cur : String(fallback));
  }
  function fillPreset(mode) {
    const d = PRESETS[mode] || PRESETS.house;
    const rg = RANGES[mode] || RANGES.house;
    setChips("loanMode", mode);
    setChips("loanType", d.type);
    if (d.job) setChips("loanJob", d.job);
    setRange("fLoan", ...rg.fLoan, d.loan);
    setRange("fRate", ...rg.fRate, d.rate);
    buildYears(mode);
    setChips("loanYears", String(d.years));
    setIncomeSlider(d.income);
    setRange("fExpense", ...rg.fExpense, d.expense);
    setRange("fDeposit", ...rg.fDeposit, d.deposit);
  }
  function restore() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return false;
      const p = JSON.parse(raw);
      const mode = p.mode === "car" ? "car" : "house";
      setChips("loanMode", mode);
      if (p.type) setChips("loanType", p.type);
      buildYears(mode);
      if (p.years) setChips("loanYears", String(p.years));
      const rg = RANGES[mode];
      if (p.loan !== undefined) setRange("fLoan", ...rg.fLoan, p.loan);
      if (p.rate !== undefined) setRange("fRate", ...rg.fRate, p.rate * 100);
      if (p.income !== undefined) setIncomeSlider(p.income);
      if (p.expense !== undefined) setRange("fExpense", ...rg.fExpense, p.expense);
      if (p.deposit !== undefined) setRange("fDeposit", ...rg.fDeposit, p.deposit);
      if (p.job) setChips("loanJob", p.job);
      return true;
    } catch (e) { return false; }
  }

  function init() {
    if (!$("loanForm") || $("loanForm").dataset.bound) { render(); return; }
    $("loanForm").dataset.bound = "1";
    restore();
    buildYears(chipVal("loanMode") || "house"); // 无存档首进时补上年限选项
    $("loanForm").addEventListener("input", render);
    $("loanForm").addEventListener("change", render);
    $("loanForm").addEventListener("click", (e) => {
      const b = e.target.closest("#loanMode .chip, #loanType .chip, #loanYears .chip, #loanJob .chip");
      if (!b) return;
      const box = b.closest(".chips");
      box.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === b));
      if (box.id === "loanMode") fillPreset(b.dataset.v); // 切换用途自动换量程与默认值
      else render();
    });
    $("loanExample").addEventListener("click", () => { fillPreset(chipVal("loanMode") || "house"); render(); });
    $("loanReset").addEventListener("click", () => {
      try { localStorage.removeItem(LS_KEY); } catch (e) {}
      $("loanForm").reset();
      fillPreset("house");
      render();
    });
    render();
  }

  window.LoanApp = { init, calc, calcPay };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

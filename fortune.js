/* 人生财富计算器 v1：现状快照
 * 输入8个数 -> 净资产 / 健康分 / 阶段 / 行动清单，实时计算 + localStorage 持久化
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const LS_KEY = "fortune-v1";
  const CITY_BASE = { tier1: 60, new1: 40, tier2: 25, tier3: 15 }; // 30岁参考净资产(万)
  const CITY_NAME = { tier1: "一线", new1: "新一线", tier2: "二线", tier3: "三线及以下" };

  const num = (v, dflt = 0) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? Math.max(0, n) : dflt;
  };
  const fmtW = (n) => {
    const neg = n < 0 ? "-" : "";
    const a = Math.abs(n);
    return neg + (a >= 100 ? a.toFixed(0) : a.toFixed(1)) + "万";
  };

  function getInputs() {
    return {
      age: Math.max(18, Math.min(70, parseInt($("fAge").value, 10) || 30)),
      city: $("fCity").value in CITY_BASE ? $("fCity").value : "new1",
      income: num($("fIncome").value),
      expense: num($("fExpense").value),
      cash: num($("fCash").value),
      invest: num($("fInvest").value),
      house: num($("fHouse").value),
      debt: num($("fDebt").value),
    };
  }

  function calc(p) {
    const total = p.cash + p.invest + p.house;
    const net = total - p.debt;
    const saveAmt = p.income - p.expense;
    const saveRate = p.income > 0 ? saveAmt / p.income : 0;
    const monthly = p.expense / 12;
    const liquid = p.cash + p.invest * 0.5; // 投资资产打5折计入应急
    const emg = monthly > 0 ? liquid / monthly : 99;
    const debtRatio = total > 0 ? p.debt / total : (p.debt > 0 ? 1 : 0);

    // 健康分 100 = 储蓄30 + 应急25 + 负债25 + 对标20
    const sSave = saveRate >= 0.5 ? 30 : saveRate >= 0.3 ? 24 : saveRate >= 0.15 ? 16 : saveRate >= 0 ? 8 : 0;
    const sEmg = emg >= 12 ? 25 : emg >= 6 ? 20 : emg >= 3 ? 14 : emg >= 1 ? 7 : 0;
    const sDebt = total === 0 && p.debt === 0 ? 15 : debtRatio <= 0.2 ? 25 : debtRatio <= 0.4 ? 18 : debtRatio <= 0.6 ? 10 : 3;
    const factor = Math.max(0.2, Math.min(5, (p.age - 22) / 8));
    const bench = CITY_BASE[p.city] * factor;
    const sBench = Math.max(0, Math.min(1.5, bench > 0 ? net / bench : 0)) / 1.5 * 20;
    const score = Math.round(sSave + sEmg + sDebt + sBench);

    let stage, desc;
    if (net < 0) { stage = "修复期"; desc = "净资产为负，先止血：先保应急，再集中还高息债。"; }
    else if (emg < 3 || saveRate < 0.1) { stage = "脆弱起步期"; desc = "经不起一次意外，优先把应急垫到3个月。"; }
    else if (net < bench * 0.5) { stage = "追赶积累期"; desc = "储蓄机器刚启动，拉高定投比例比选股重要。"; }
    else if (net < bench * 1.2) { stage = "同程稳健期"; desc = "跟同城同龄大部队齐头并进，守住负债率。"; }
    else { stage = "领先预备期"; desc = "已超多数同龄人，下一步看保障与长期配置。"; }

    const advice = [];
    // 1 应急
    if (emg < 3) advice.push(`应急缺口约 <b>${fmtW(Math.max(0, monthly * 3 - liquid))}</b>：先存够3个月支出（${fmtW(monthly * 3)}），再谈投资。`);
    else if (emg < 6) advice.push(`应急已 ${emg.toFixed(1)} 个月：补到6个月（还差 ${fmtW(monthly * 6 - liquid)}），用货币基金单独存放。`);
    else advice.push(`应急 ${emg >= 20 ? "20+" : emg.toFixed(1)} 个月已达标：多余活钱可转入定投，去「财富累计」算未来。`);
    // 2 储蓄
    if (p.income > 0 && saveRate < 0.2) advice.push(`储蓄率仅 ${(saveRate * 100).toFixed(0)}%：记账1个月，砍掉最大的一笔可选支出，目标先到20%。`);
    else if (saveRate < 0.4) advice.push(`储蓄率 ${(saveRate * 100).toFixed(0)}% 健康：把涨薪部分的50%自动定投，避免 lifestyle creep。`);
    else if (p.income > 0) advice.push(`储蓄率 ${(saveRate * 100).toFixed(0)}% 很强：检查是否过度紧缩，留 5% 取悦自己的预算。`);
    // 3 负债
    if (debtRatio > 0.5) advice.push(`负债率 ${(debtRatio * 100).toFixed(0)}% 偏高：暂停加杠杆，按利率从高到低还，保留3个月月供做缓冲。`);
    else if (debtRatio > 0.3) advice.push(`负债率 ${(debtRatio * 100).toFixed(0)}% 可控：别再新增大额分期，大额支出先做压力测试。`);
    // 4 结构
    if (total > 0 && p.house / total > 0.8 && p.house > 0) advice.push(`房产占总资产 ${((p.house / total) * 100).toFixed(0)}%：流动性偏紧，每月强制留一笔非房产资产。`);
    else if (total > 0 && p.cash / total > 0.6 && total >= 10) advice.push(`现金占比超60%：通胀在吃利息，留足应急后分批转稳健投资。`);
    else if (p.invest === 0 && saveAmt > 0) advice.push(`还没有投资资产：每月拿结余的1/3开小额定投，先养成再求收益。`);
    if (p.age < 35 && saveAmt > 0) advice.push(`你处在复利最便宜的年纪：早投10年结局差一倍，去「财富累计」亲手算一次。`);

    return { total, net, saveRate, emg, debtRatio, score, bench, stage, desc, advice: advice.slice(0, 4) };
  }

  function render() {
    if (!$("fortuneForm")) return;
    const p = getInputs();
    const r = calc(p);
    $("kNet").textContent = fmtW(r.net);
    $("kNet").style.color = r.net < 0 ? "var(--past)" : "var(--go)";
    $("kScore").textContent = r.score + "分";
    $("kSave").textContent = p.income > 0 ? (r.saveRate * 100).toFixed(0) + "%" : "–";
    $("kEmg").textContent = r.emg >= 20 ? "20+月" : r.emg.toFixed(1) + "月";
    const badge = $("stageBadge");
    badge.textContent = r.stage;
    badge.className = "badge " + (r.score >= 75 ? "go" : r.score >= 50 ? "tight" : "past");
    $("stageDesc").textContent = r.desc;
    // 结构条
    const tot = Math.max(r.total, 0.001);
    const segs = [
      { label: `现金${fmtW(p.cash)}`, w: (p.cash / tot) * 100, c: "var(--go)" },
      { label: `投资${fmtW(p.invest)}`, w: (p.invest / tot) * 100, c: "#c9a45c" },
      { label: `房产${fmtW(p.house)}`, w: (p.house / tot) * 100, c: "#33405e" },
    ].filter((s) => s.w > 0.5);
    $("structBar").innerHTML = segs.map((s) => `<span style="width:${s.w.toFixed(1)}%;background:${s.c}" title="${s.label}"></span>`).join("");
    $("structLegend").textContent = `总资产 ${fmtW(r.total)} · 负债 ${fmtW(p.debt)} · 负债率 ${(r.debtRatio * 100).toFixed(0)}%`;
    $("fortuneAdvice").innerHTML = r.advice.map((a) => `<li>${a}</li>`).join("");
    $("fortuneBench").textContent = `${p.age}岁 · ${CITY_NAME[p.city]}参考约 ${fmtW(r.bench)}（公开报道估算，非官方分位，仅看差距不看排名）`;
    $("fortuneSub").textContent = `当前 ${p.age} 岁 · ${CITY_NAME[p.city]} · 净资产 ${fmtW(r.net)}`;
    try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch (e) {}
  }

  function restore() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (p.age) $("fAge").value = p.age;
      if (p.city) $("fCity").value = p.city;
      ["Income", "Expense", "Cash", "Invest", "House", "Debt"].forEach((k) => {
        const key = k.toLowerCase();
        if (p[key] !== undefined) $("f" + k).value = p[key];
      });
    } catch (e) {}
  }

  function init() {
    if (!$("fortuneForm") || $("fortuneForm").dataset.bound) { render(); return; }
    $("fortuneForm").dataset.bound = "1";
    restore();
    $("fortuneForm").addEventListener("input", render);
    $("fortuneForm").addEventListener("change", render);
    $("fortuneReset").addEventListener("click", () => {
      try { localStorage.removeItem(LS_KEY); } catch (e) {}
      $("fortuneForm").reset();
      $("fAge").value = 30; $("fCity").value = "new1";
      $("fIncome").value = 20; $("fExpense").value = 12;
      $("fCash").value = 8; $("fInvest").value = 10;
      $("fHouse").value = 0; $("fDebt").value = 0;
      render();
    });
    $("fortuneExample").addEventListener("click", () => {
      $("fAge").value = 32; $("fCity").value = "tier1";
      $("fIncome").value = 35; $("fExpense").value = 20;
      $("fCash").value = 15; $("fInvest").value = 40;
      $("fHouse").value = 300; $("fDebt").value = 180;
      render();
    });
    render();
  }

  window.FortuneApp = { init, calc };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

/* 财富累计计算器 v1：定投 + 复利 + 通胀
 * 月复利迭代，按年上调定投，输出名义/实际/投入三条曲线 + 里程碑 + 敏感度
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const LS_KEY = "wealth-v1";
  const YUAN = 10000; // 1万 = 10000元，内部统一用元

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const cleanNum = (v) => String(v ?? "").trim().replace(/[,，\s]/g, ""); // 千分位逗号/空格直接删掉，小数点保留
  const num = (v, d) => { const n = parseFloat(cleanNum(v)); return Number.isFinite(n) ? n : d; };
  const int = (v, d) => { const n = parseInt(cleanNum(v), 10); return Number.isFinite(n) ? n : d; };
  const fmtW = (yuan) => {
    const w = yuan / YUAN;
    const neg = w < 0 ? "-" : "";
    const a = Math.abs(w);
    return neg + (a >= 1000 ? a.toFixed(0) : a.toFixed(1)) + "万";
  };

  function getInputs() {
    const ageNow = clamp(int($("wAgeNow").value, 30), 18, 80);
    const ageEnd = clamp(int($("wAgeEnd").value, 60), ageNow + 1, 90);
    return {
      ageNow, ageEnd,
      init: Math.max(0, num($("wInit").value, 0)) * YUAN,
      monthly: Math.max(0, num($("wMonthly").value, 0)),
      growth: clamp(num($("wGrowth").value, 0), 0, 20) / 100,
      ret: clamp(num($("wReturn").value, 0), -5, 15) / 100,
      inflation: clamp(num($("wInflation").value, 0), 0, 10) / 100,
    };
  }

  // 跑一次：返回 { rows:[{age,nominal,real,contrib}], final, contribTotal }
  function simulate(p, retOverride) {
    const R = retOverride !== undefined ? retOverride : p.ret;
    const mr = Math.pow(1 + R, 1 / 12) - 1;
    const years = p.ageEnd - p.ageNow;
    let bal = p.init, contrib = p.init;
    const rows = [{ age: p.ageNow, nominal: bal, real: bal, contrib }];
    for (let m = 0; m < years * 12; m++) {
      const y = Math.floor(m / 12);
      bal = bal * (1 + mr) + p.monthly * Math.pow(1 + p.growth, y);
      contrib += p.monthly * Math.pow(1 + p.growth, y);
      if ((m + 1) % 12 === 0) {
        const t = (m + 1) / 12;
        rows.push({ age: p.ageNow + t, nominal: bal, real: bal / Math.pow(1 + p.inflation, t), contrib });
      }
    }
    return { rows, final: bal, contribTotal: contrib };
  }

  function milestones(rows) {
    const targets = [100 * YUAN, 300 * YUAN, 500 * YUAN, 1000 * YUAN];
    return targets.map((t) => {
      const hit = rows.find((r) => r.nominal >= t);
      return { t, age: hit ? hit.age : null };
    }).filter((x) => x.age !== null || x.t <= rows[rows.length - 1].nominal * 1.5).slice(0, 3);
  }

  function chart(rows) {
    const W = 600, H = 240, P = { l: 8, r: 8, t: 12, b: 22 };
    const maxY = Math.max(...rows.map((r) => r.nominal), 1);
    const n = rows.length - 1;
    const X = (i) => P.l + (i / Math.max(1, n)) * (W - P.l - P.r);
    const Y = (v) => P.t + (1 - v / maxY) * (H - P.t - P.b);
    const line = (key, color, width, dash) => {
      const d = rows.map((r, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(r[key]).toFixed(1)}`).join(" ");
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ""} stroke-linejoin="round"/>`;
    };
    const grids = [0.25, 0.5, 0.75, 1].map((f) =>
      `<line x1="${P.l}" y1="${Y(maxY * f)}" x2="${W - P.r}" y2="${Y(maxY * f)}" stroke="#2a3550" stroke-width="1"/><text x="${W - P.r}" y="${Y(maxY * f) - 3}" fill="#9aa3b8" font-size="10" text-anchor="end">${fmtW(maxY * f)}</text>`
    ).join("");
    const labels = [0, Math.floor(n / 2), n].map((i) =>
      `<text x="${X(i)}" y="${H - 6}" fill="#9aa3b8" font-size="10" text-anchor="middle">${rows[i].age}岁</text>`
    ).join("");
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="资产曲线图">` + grids +
      line("contrib", "#64748b", 2, "5 4") + line("nominal", "#c9a45c", 3) + line("real", "#0f766e", 2.5) +
      labels +
      `<g font-size="11"><circle cx="14" cy="8" r="4" fill="#c9a45c"/><text x="22" y="12" fill="#e9e4d4">名义</text><circle cx="80" cy="8" r="4" fill="#0f766e"/><text x="88" y="12" fill="#e9e4d4">实际购买力</text><circle cx="170" cy="8" r="4" fill="#64748b"/><text x="178" y="12" fill="#e9e4d4">累计投入</text></g></svg>`;
  }

  function render() {
    if (!$("wealthForm")) return;
    const p = getInputs();
    // 目标年龄必须大于当前年龄：只在未聚焦时回写，避免跟打字打架
    if (document.activeElement !== $("wAgeEnd") && int($("wAgeEnd").value, p.ageEnd) !== p.ageEnd) $("wAgeEnd").value = p.ageEnd;
    const s = simulate(p);
    const last = s.rows[s.rows.length - 1];
    const gain = last.nominal - s.contribTotal;
    $("wFinal").textContent = fmtW(last.nominal);
    $("wReal").textContent = fmtW(last.real);
    $("wContrib").textContent = fmtW(s.contribTotal);
    $("wGain").textContent = (gain >= 0 ? "+" : "−") + fmtW(Math.abs(gain)).replace("-", "");
    $("wGain").style.color = gain >= 0 ? "#5eead4" : "#fda4af";
    $("wealthChartWrap").innerHTML = chart(s.rows);
    // 里程碑
    const ms = milestones(s.rows);
    $("wealthMiles").innerHTML = ms.length
      ? ms.map((m) => m.age ? `<span class="mile">首破 <b>${fmtW(m.t)}</b> · ${m.age}岁</span>` : `<span class="mile dim">${fmtW(m.t)} 未达成</span>`).join("")
      : `<span class="mile dim">本假设下连 100万 也到不了，先提高定投或拉长年限</span>`;
    // 敏感度：收益±2%
    const up = simulate(p, clamp(p.ret + 0.02, -0.05, 0.15));
    const dn = simulate(p, clamp(p.ret - 0.02, -0.05, 0.15));
    const eaten = last.nominal - last.real;
    const early = (() => { // 早10年开始差多少：对比少10年
      if (p.ageEnd - p.ageNow < 15) return null;
      const late = simulate({ ...p, ageNow: p.ageNow + 10 }, undefined);
      return last.nominal - late.final;
    })();
    const adv = [
      `通胀吃掉约 <b>${fmtW(eaten)}</b>：只看名义会自我感觉良好，请盯住「实际购买力」。`,
      `年化±2%终值区间 <b>${fmtW(dn.final)} ~ ${fmtW(up.final)}</b>：收益假设差一点，结局差一截，别把高收益当计划。`,
    ];
    if (early !== null && early > 0) adv.push(`早10年开始多出约 <b>${fmtW(early)}</b>：${p.ageNow < 35 ? "你还在便宜窗口，" : ""}开始早比选得好更重要。`);
    if (s.contribTotal > 0 && gain / last.nominal < 0.3) adv.push(`投入占比超七成：现阶段<b>提高定投额</b>比纠结收益率管用。`);
    else if (last.nominal > 0) adv.push(`复利已接管：后期波动会很大，拿住比折腾重要，留足应急再定投。`);
    $("wealthAdvice").innerHTML = adv.slice(0, 3).map((a) => `<li>${a}</li>`).join("");
    // 表格每5年
    const picks = s.rows.filter((r, i) => i % 5 === 0 || i === s.rows.length - 1);
    $("wealthTable").innerHTML = `<table><thead><tr><th>年龄</th><th>名义</th><th>实际</th><th>累计投入</th></tr></thead><tbody>` +
      picks.map((r) => `<tr><td>${r.age}岁</td><td>${fmtW(r.nominal)}</td><td>${fmtW(r.real)}</td><td>${fmtW(r.contrib)}</td></tr>`).join("") + `</tbody></table>`;
    $("wealthSub").textContent = `${p.ageNow}→${p.ageEnd}岁 · ${(p.ret * 100).toFixed(1)}%年化 · ${fmtW(last.nominal)}名义`;
    try { localStorage.setItem(LS_KEY, JSON.stringify({ ...p, init: p.init / YUAN })); } catch (e) {}
  }

  function restore() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (p.ageNow) $("wAgeNow").value = p.ageNow;
      if (p.ageEnd) $("wAgeEnd").value = p.ageEnd;
      if (p.init !== undefined) $("wInit").value = p.init;
      if (p.monthly !== undefined) $("wMonthly").value = Math.round(p.monthly);
      if (p.growth !== undefined) $("wGrowth").value = (p.growth * 100).toFixed(1).replace(/\.0$/, "");
      if (p.ret !== undefined) $("wReturn").value = (p.ret * 100).toFixed(1).replace(/\.0$/, "");
      if (p.inflation !== undefined) $("wInflation").value = (p.inflation * 100).toFixed(1).replace(/\.0$/, "");
    } catch (e) {}
  }

  function init() {
    if (!$("wealthForm") || $("wealthForm").dataset.bound) { render(); return; }
    $("wealthForm").dataset.bound = "1";
    restore();
    $("wealthForm").addEventListener("input", render);
    $("wealthForm").addEventListener("change", render);
    $("wealthForm").querySelectorAll("[data-ret]").forEach((b) =>
      b.addEventListener("click", () => { $("wReturn").value = b.dataset.ret; render(); }));
    $("wealthReset").addEventListener("click", () => {
      try { localStorage.removeItem(LS_KEY); } catch (e) {}
      $("wealthForm").reset();
      $("wAgeNow").value = 30; $("wAgeEnd").value = 60; $("wInit").value = 10;
      $("wMonthly").value = 3000; $("wGrowth").value = 0; $("wReturn").value = 2.5; $("wInflation").value = 3;
      render();
    });
    if ($("wealthBring")) $("wealthBring").addEventListener("click", () => {
      try {
        const f = JSON.parse(localStorage.getItem("fortune-v1") || "null");
        if (f) {
          const netW = Math.max(0, (f.cash || 0) + (f.invest || 0) + (f.house || 0) - (f.debt || 0));
          if (f.age) $("wAgeNow").value = f.age;
          $("wInit").value = Math.round(netW * 10) / 10;
          // 定投初估：年结余/12
          if (f.income !== undefined && f.expense !== undefined) {
            const m = Math.max(0, Math.round((f.income - f.expense) * YUAN / 12));
            if (m > 0) $("wMonthly").value = m;
          }
          render();
          return;
        }
      } catch (e) {}
      alert("还没算过人生财富，先去 Tab2 填一次现状再带入。");
    });
    render();
  }

  window.WealthApp = { init, simulate };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

/* 买还是租更值 v1：同起点逐月迭代，比n年后净财富，算打平年限
 * 买方：首付+税费开局，每月还月供+持有成本，期末拥有房值−剩余贷款
 * 租方：首付+税费理财，每月把(月供+持有−租金)差额继续定投
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const LS_KEY = "rentbuy-v1";
  const YUAN = 10000;
  const TAX_RATE = 0.03; // 交易税费：房价×3%一次性
  const HOLD_RATE = 0.01; // 持有成本：当年房价×1%/年

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
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
    const loan = Math.max(0, num($("rLoanAmt").value, 0)) * YUAN;
    const down = Math.max(0, num($("rDownPay").value, 0)) * YUAN;
    return {
      price: loan + down, // 房价 = 贷款 + 首付
      down,
      loan,
      rate: clamp(num($("rRate").value, 0), 0, 20) / 100,
      years: clamp(Math.round(num(chipVal("buyYears"), 0)), 1, 40),
      rent: Math.max(0, num($("rRent").value, 0)),
      rentG: clamp(num($("rRentG").value, 0), -5, 20) / 100,
      homeG: clamp(num($("rHomeG").value, 0), -10, 20) / 100,
      hold: clamp(Math.round(num($("rHold").value, 0)), 1, 30),
      opp: clamp(num($("rOpp").value, 0), 0, 20) / 100,
    };
  }

  function annuity(P, annualRate, years) {
    const n = Math.max(1, Math.round(years * 12));
    const r = annualRate / 12;
    if (r < 1e-9) return P / n;
    const k = Math.pow(1 + r, n);
    return (P * r * k) / (k - 1);
  }

  // 跑满30年月迭代，返回逐年快照与打平年限
  function simulate(p) {
    const D = p.down;
    const L = p.loan;
    const T = p.price * TAX_RATE;
    const M = annuity(L, p.rate, p.years);
    const rm = p.rate / 12;
    const gh = Math.pow(1 + p.homeG, 1 / 12) - 1;
    const gr = Math.pow(1 + p.rentG, 1 / 12) - 1;
    const ro = Math.pow(1 + p.opp, 1 / 12) - 1;
    let home = p.price, bal = L, invest = D + T, rent = p.rent;
    const rows = [{ y: 0, buy: home - bal, rent: invest }];
    let even = null;
    for (let m = 1; m <= 360; m++) {
      home *= 1 + gh;
      rent *= 1 + gr;
      let pmt = 0;
      if (bal > 0) {
        const interest = bal * rm;
        pmt = Math.min(M, bal + interest);
        bal -= pmt - interest;
        if (bal < 1) bal = 0;
      }
      const hold = (home * HOLD_RATE) / 12;
      invest = invest * (1 + ro) + (pmt + hold - rent);
      if (m % 12 === 0) {
        const y = m / 12;
        const buy = home - bal;
        rows.push({ y, buy, rent: invest });
        if (even === null && y >= 1 && buy >= invest) even = y;
      }
    }
    return { rows, even, pay: M, down: D, tax: T };
  }

  function chart(rows, hold, even) {
    const W = 600, H = 240, P = { l: 8, r: 8, t: 12, b: 22 };
    const data = rows.filter((r) => r.y <= hold);
    const maxY = Math.max(...data.map((r) => Math.max(r.buy, r.rent)), 1);
    const n = data.length - 1;
    const X = (i) => P.l + (i / Math.max(1, n)) * (W - P.l - P.r);
    const Y = (v) => P.t + (1 - v / maxY) * (H - P.t - P.b);
    const line = (key, color, width) => {
      const d = data.map((r, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(r[key]).toFixed(1)}`).join(" ");
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round"/>`;
    };
    const grids = [0.25, 0.5, 0.75, 1].map((f) =>
      `<line x1="${P.l}" y1="${Y(maxY * f)}" x2="${W - P.r}" y2="${Y(maxY * f)}" stroke="#2a3550" stroke-width="1"/><text x="${W - P.r}" y="${Y(maxY * f) - 3}" fill="#9aa3b8" font-size="10" text-anchor="end">${fmtW(maxY * f)}</text>`
    ).join("");
    const labels = [...new Set([0, Math.floor(n / 2), n])].map((i) =>
      `<text x="${X(i)}" y="${H - 6}" fill="#9aa3b8" font-size="10" text-anchor="middle">${data[i].y}年</text>`
    ).join("");
    let evenMark = "";
    if (even !== null && even <= hold && n > 0) {
      const fi = (even / hold) * n;
      const x = X(fi);
      evenMark = `<line x1="${x}" y1="${P.t}" x2="${x}" y2="${H - P.b}" stroke="#c9a45c" stroke-width="1" stroke-dasharray="4 3"/><text x="${x}" y="${P.t + 10}" fill="#c9a45c" font-size="10" text-anchor="middle">打平</text>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="买卖净财富曲线">` + grids +
      line("rent", "#64748b", 2.5) + line("buy", "#c9a45c", 3) + labels + evenMark +
      `<g font-size="11"><circle cx="14" cy="8" r="4" fill="#c9a45c"/><text x="22" y="12" fill="#e9e4d4">买方净财富</text><circle cx="110" cy="8" r="4" fill="#64748b"/><text x="118" y="12" fill="#e9e4d4">租方净财富</text></g></svg>`;
  }

  function render() {
    if (!$("rentbuyForm")) return;
    const p = getInputs();
    const s = simulate(p);
    const last = s.rows[p.hold];
    const diff = last.buy - last.rent;
    const buyWins = diff >= 0;
    $("vLoanAmt").textContent = trim1(p.loan / YUAN);
    $("vDownPay").textContent = trim1(p.down / YUAN);
    $("vRateR").textContent = trim1(p.rate * 100);
    $("vRent").textContent = Math.round(p.rent);
    $("vRentG").textContent = trim1(p.rentG * 100);
    $("vHomeG").textContent = trim1(p.homeG * 100);
    $("vHold").textContent = p.hold;
    $("vOpp").textContent = trim1(p.opp * 100);
    $("rbKicker").textContent = `持有${p.hold}年，买比租${buyWins ? "多" : "少"}${fmtW(Math.abs(diff))}`;
    const diffEl = $("rbDiff");
    diffEl.textContent = (buyWins ? "+" : "−") + fmtW(Math.abs(diff)).replace("-", "");
    diffEl.className = buyWins ? "go" : "past";
    $("rbVerdict").textContent =
      s.even === null ? `30年都不打平：这价格下长租更划算。` :
      s.even <= p.hold ? `住满${s.even}年买更划算，你打算住${p.hold}年，买。` :
      `要住${s.even}年才打平，你只住${p.hold}年，租。`;
    $("bPay").textContent = fmtYuan(s.pay);
    $("bBuy").textContent = fmtW(last.buy);
    $("bRent").textContent = fmtW(last.rent);
    $("bEven").textContent = s.even === null ? "30年+无" : s.even + "年";
    $("rbChartWrap").innerHTML = chart(s.rows, p.hold, s.even);
    $("rbSub").textContent = `持有${p.hold}年 · ${buyWins ? "买多" : "租多"}` + fmtW(Math.abs(diff));

    const adv = [];
    const oppEnd = s.down * Math.pow(1 + p.opp, p.hold) + s.tax * Math.pow(1 + p.opp, p.hold);
    adv.push(`首付+税费共 <b>${fmtW(s.down + s.tax)}</b>，按${trim1(p.opp * 100)}%理财${p.hold}年变 <b>${fmtW(oppEnd)}</b>：这是买房最大的隐性成本。`);
    if (s.even !== null && s.even > p.hold) adv.push(`打平要${s.even}年：${p.hold}年内换房/换城市概率大就别买，税费白交。`);
    else if (s.even !== null) adv.push(`打平仅${s.even}年：确定长住就早买，月供里本金占比越来越高。`);
    if (p.rentG > p.homeG) adv.push(`租金涨(${(p.rentG * 100).toFixed(1)}%)跑赢房价(${(p.homeG * 100).toFixed(1)}%)：越往后租越亏，关键看你信哪个涨幅。`);
    if (p.rent > 0) adv.push(`首月月供 <b>${fmtYuan(s.pay)}</b>，是租金的 <b>${(s.pay / p.rent).toFixed(1)}倍</b>：月供压力直观感受一下。`);
    $("rbAdvice").innerHTML = adv.slice(0, 3).map((a) => `<li>${a}</li>`).join("");
    const cmpYears = [5, 10, 15, 20, 30];
    $("rbTable").innerHTML = `<table><thead><tr><th>持有</th><th>买方净</th><th>租方净</th><th>差</th><th>结论</th></tr></thead><tbody>` +
      cmpYears.map((y) => {
        const r = s.rows[y], d = r.buy - r.rent;
        return `<tr><td>${y}年</td><td>${fmtW(r.buy)}</td><td>${fmtW(r.rent)}</td><td>${fmtW(d)}</td><td>${d >= 0 ? "买多" + fmtW(d) : "租多" + fmtW(-d)}</td></tr>`;
      }).join("") + `</tbody></table>`;
    try { localStorage.setItem(LS_KEY, JSON.stringify({ ...p, price: undefined, loanAmt: p.loan / YUAN, downPay: p.down / YUAN })); } catch (e) {}
  }

  function restore() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return false;
      const q = JSON.parse(raw);
      if (q.loanAmt !== undefined) $("rLoanAmt").value = q.loanAmt;
      else if (q.price !== undefined) $("rLoanAmt").value = Math.round(q.price * (1 - (q.downPct ?? 0.3)));
      if (q.downPay !== undefined) $("rDownPay").value = q.downPay;
      if (q.rate !== undefined) $("rRate").value = q.rate * 100;
      if (q.years) setChips("buyYears", String(q.years));
      if (q.rent !== undefined) $("rRent").value = Math.round(q.rent);
      if (q.rentG !== undefined) $("rRentG").value = q.rentG * 100;
      if (q.homeG !== undefined) $("rHomeG").value = q.homeG * 100;
      if (q.hold !== undefined) $("rHold").value = q.hold;
      if (q.opp !== undefined) $("rOpp").value = q.opp * 100;
      return true;
    } catch (e) { return false; }
  }

  function init() {
    if (!$("rentbuyForm") || $("rentbuyForm").dataset.bound) { render(); return; }
    $("rentbuyForm").dataset.bound = "1";
    restore();
    $("rentbuyForm").addEventListener("input", render);
    $("rentbuyForm").addEventListener("change", render);
    $("rentbuyForm").addEventListener("click", (e) => {
      const b = e.target.closest("#buyYears .chip");
      if (!b) return;
      b.closest(".chips").querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === b));
      render();
    });
    $("rbReset").addEventListener("click", () => {
      try { localStorage.removeItem(LS_KEY); } catch (e) {}
      $("rentbuyForm").reset();
      setChips("buyYears", "30");
      render();
    });
    render();
  }

  window.RentbuyApp = { init, simulate };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

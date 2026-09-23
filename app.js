/* 紧凑卡片 + 弹窗详情 */
(function () {
  const $ = (s) => document.querySelector(s);
  const grid = $("#grid"), curLine = $("#curLine");
  const scrim = $("#scrim"), sheetBody = $("#sheetBody"), sheetClose = $("#sheetClose");
  const ageRange = $("#ageRange"), ageNumber = $("#ageNumber"), ageLabel = $("#ageLabel");
  const btnF = $("#btnFemale"), btnM = $("#btnMale");
  const statusBox = $("#statusFilter"), domainFilter = $("#domainFilter"), sortSel = $("#sortSel");
  const REVEAL = window.Motion ? " reveal" : ""; // 无动效模块时卡片照常显示，不留空白

  const state = { age: 30, gender: "female", status: "all", domain: "all", sort: "start" };
  const GROUPS = [
    { name: "身体监控", domains: ["生理健康", "生育家庭"] },
    { name: "教育成长", domains: ["认知教育", "关系社交"] },
    { name: "事业发展", domains: ["职业财富", "迁移身份"] },
  ];
  let current = [];

  try {
    const q = new URLSearchParams(location.search);
    const a = parseInt(q.get("age"), 10);
    if (!Number.isNaN(a)) state.age = Math.max(0, Math.min(90, a));
    const g = q.get("gender");
    if (g === "male" || g === "female") state.gender = g;
  } catch (e) {}

  function getStatus(w, age) {
    if (age < w.start) return { key: "upcoming", tag: "待开启", n: w.start - age, unit: "年后" };
    if (age <= w.end) {
      const span = Math.max(1, w.end - w.start);
      const p = (age - w.start) / span;
      const left = w.end - age;
      if (left <= 3 || p >= 0.8) return { key: "narrowing", tag: "余量不多", n: left, unit: "年" };
      return { key: "open", tag: "进行中", n: left, unit: "年" };
    }
    return { key: "missed", tag: "已过·补救", n: age - w.end, unit: "年前" };
  }

  function sync() {
    ageRange.value = state.age; ageNumber.value = state.age; ageLabel.textContent = state.age;
    btnF.classList.toggle("active", state.gender === "female");
    btnM.classList.toggle("active", state.gender === "male");
    statusBox.querySelectorAll(".t").forEach((c) => c.classList.toggle("active", c.dataset.s === state.status));
    domainFilter.value = state.domain; sortSel.value = state.sort;
    try {
      const q = new URLSearchParams({ age: String(state.age), gender: state.gender });
      history.replaceState(null, "", location.pathname + "?" + q.toString() + location.hash);
    } catch (e) {}
  }

  function visible() {
    return (window.LIFE_WINDOWS || []).filter((w) =>
      (w.genders === "all" || w.genders === state.gender) &&
      (state.domain === "all" || w.domain === state.domain)
    );
  }

  // 补救档案不是死的：data.js 里写的是"刚错过"那一刻的基线，
  // 错过越久难度越高、效果越差，拖滑杆时这块会跟着变。
  // 升档规则：错过>5年升1档，>15年升2档；封顶"高/效果有限"，
  // "不可逆/几乎无法补救"只留给数据本身标定的项目，时间不会替数据加冕。
  const COST_LADDER = ["低", "中", "高", "不可逆"];
  const EFF_LADDER = ["可基本补足", "部分可补", "效果有限", "几乎无法补救"];
  function remedyProfile(w, st) {
    const c = Math.max(0, COST_LADDER.indexOf(w.remedyCost));
    const e = Math.max(0, EFF_LADDER.indexOf(w.remedyEffect));
    const steps = st.key === "missed" ? (st.n > 15 ? 2 : st.n > 5 ? 1 : 0) : 0;
    const ci = w.remedyCost === "不可逆" ? 3 : Math.min(c + steps, 2);
    const ei = w.remedyEffect === "几乎无法补救" ? 3 : Math.min(e + steps, 2);
    return { cost: COST_LADDER[ci], effect: EFF_LADDER[ei], steps };
  }

  // 补救分三档：还能补 / 补得动但价值有限 / 只能止损
  // 有些"补救措施"自己也有有效期（岗位放宽年龄、疫苗说明书、生殖中心上限等），
  // data.js 用 remedyDeadline 标出；过了这条线就不再叫"补救"，改称止损/替代方案。
  function remedyGrade(w, st) {
    const rp = remedyProfile(w, st);
    // 窗口内/收尾中：不谈降档，只做预防性预告
    if (st.key !== "missed") {
      return Object.assign(rp, { kind: "ok", closed: false, doom: w.remedyCost === "不可逆",
        label: `补救难度：${rp.cost} · ${rp.effect}`, head: `代价${rp.cost} · ${rp.effect}` });
    }
    if (typeof w.remedyDeadline === "number" && state.age > w.remedyDeadline) {
      return Object.assign(rp, { kind: "closed", closed: true, doom: true,
        label: "出路已关闭 · 只剩止损", head: `已过补救有效期（${w.remedyDeadline}岁）· 只剩止损` });
    }
    if (rp.effect === "几乎无法补救") {
      return Object.assign(rp, { kind: "none", closed: false, doom: true,
        label: "已不可补 · 只剩止损", head: "几乎无法补救 · 只剩止损" });
    }
    if (rp.effect === "效果有限") {
      return Object.assign(rp, { kind: "weak", closed: false, doom: false,
        label: rp.steps >= 2 ? "补救价值很低 · 以止损为主" : `补救价值有限 · 难度${rp.cost}`,
        head: `代价${rp.cost} · ${rp.effect}${rp.steps ? `（较刚错过升${rp.steps}档）` : ""}` });
    }
    return Object.assign(rp, { kind: "ok", closed: false, doom: rp.cost === "不可逆",
      label: `补救难度：${rp.cost} · ${rp.effect}`,
      head: `代价${rp.cost} · ${rp.effect}${rp.steps ? `（较刚错过升${rp.steps}档）` : ""}` });
  }

  // 补救块的引导语：随年龄/状态/补救档位变。刻意控制在十几字内，
  // 保证卡片里永远一行，不折行——不然同行卡片会高低不平。
  function remedyLead(st, g) {
    if (st.key === "open") return "进行中，收益最大。万一错过——";
    if (st.key === "narrowing") return `只剩${st.n}${st.unit}，错过后——`;
    if (st.key === "missed") {
      if (g.kind === "closed") return `已过${st.n}${st.unit}，补救也已过期，只剩——`;
      if (g.kind === "none") return `已过${st.n}${st.unit}，已无补救空间，只剩——`;
      if (g.kind === "weak") return g.steps >= 2
        ? `已过${st.n}${st.unit}，硬补收益已很薄，只能——`
        : `已过${st.n}${st.unit}，代价更高，只能——`;
      return `已过${st.n}${st.unit}，现在只能——`;
    }
    return "";
  }

  function miniBar(w, age) {    const l = (w.start / 90 * 100).toFixed(2);
    const wd = (Math.max(1, w.end - w.start) / 90 * 100).toFixed(2);
    const me = (Math.max(0, Math.min(90, age)) / 90 * 100).toFixed(2);
    return `<div class="mini"><span class="sp" style="left:${l}%;width:${wd}%"></span><span class="me" style="left:${me}%"></span></div>`;
  }

  function render() {
    sync();
    const list = visible();
    const rows = list.map((w) => ({ w, st: getStatus(w, state.age) }));
    current = rows;
    const c = { open: 0, narrowing: 0, missed: 0, upcoming: 0, closed: 0 };
    rows.forEach((x) => {
      c[x.st.key]++;
      // 补不回来的单独计数：补救期已关闭 或 数据本身标了几乎无法补救
      if (x.st.key === "missed") {
        const g = remedyGrade(x.w, x.st);
        if (g.kind === "closed" || g.kind === "none") c.closed++;
      }
    });
    // 状态统计只在首屏巨幕里说一次，避免上下两处重复数字
    if (window.LifeHero) window.LifeHero.update(state.age, state.gender, c, list.length);
    curLine.textContent = `当前 ${state.age} 岁 · ${state.gender === "female" ? "女性" : "男性"} · ${list.length} 个区间`;

    let filt = rows.filter((x) => state.status === "all" || x.st.key === state.status);
    const rank = { narrowing: 0, open: 1, upcoming: 2, missed: 3 };
    filt.sort((a, b) => state.sort === "start"
      ? (a.w.start - b.w.start || a.w.end - b.w.end)
      : (rank[a.st.key] - rank[b.st.key] || a.st.n - b.st.n));
    current = filt;

    if (!filt.length) { grid.innerHTML = `<div class="empty">该筛选下暂无区间。</div>`; return; }
    const cardHTML = ({ w, st }, i) => {
      const iv = st.key === "missed" ? `${w.start}–${w.end}岁 · 过${st.n}${st.unit}`
        : st.key === "upcoming" ? `${w.start}–${w.end}岁 · ${st.n}${st.unit}开`
        : `${w.start}–${w.end}岁 · 剩${st.n}${st.unit}`;
      const g = remedyGrade(w, st);
      const tip = g.steps ? ` title="刚错过时：${w.remedyCost} · ${w.remedyEffect}"` : "";
      const tag = st.key !== "missed" ? st.tag
        : g.kind === "closed" ? "已关闭·止损"
        : g.kind === "none" ? "已过·不可补" : st.tag;
      const body = g.kind === "closed" && w.remedyClosed ? w.remedyClosed
        : (!w.remedy || !w.remedy.trim()) ? "暂无有效补救" : w.remedy;
      return `<article class="card st-${st.key}${REVEAL}" data-i="${i}" data-rk="${w.title}" tabindex="0" aria-label="${w.title}，${iv}">
        <div class="chead"><span class="dom">${w.domain}</span><span class="st"><i></i>${tag}</span></div>
        <h3>${w.title}</h3>
        <div class="iv">${iv}</div>
        ${miniBar(w, state.age)}
        <p class="ds">${w.desc}</p>
        ${st.key === "upcoming" ? "" : `<div class="fx"><span class="diff${g.doom ? " doom" : ""}${g.kind === "weak" && g.steps ? " worse" : ""}"${tip}>${g.label}</span><p class="rlead">${remedyLead(st, g)}</p><p>${body}</p></div>`}
      </article>`;
    };
    let html = "";
    const ordered = [];
    if (state.domain === "all") {
      GROUPS.forEach((g) => {
        const items = filt.filter((x) => g.domains.includes(x.w.domain));
        if (!items.length) return;
        html += `<div class="gsec-h"><h2>${g.name}</h2><small>${items.length} 个区间</small></div>`;
        items.forEach((x) => { html += cardHTML(x, ordered.length); ordered.push(x); });
      });
    } else {
      filt.forEach((x) => { html += cardHTML(x, ordered.length); ordered.push(x); });
    }
    current = ordered;
    grid.innerHTML = html;
    if (window.Motion) window.Motion.reveal(grid);
  }

  function openSheet(i) {
    const item = current[i];
    if (!item) return;
    const { w, st } = item;
    const l = (w.start / 90 * 100).toFixed(2);
    const wd = (Math.max(1, w.end - w.start) / 90 * 100).toFixed(2);
    const me = (Math.max(0, Math.min(90, state.age)) / 90 * 100).toFixed(2);
    sheetBody.innerHTML =
      `<div class="kicker"><span>${w.domain}</span><span>${w.constraint}</span><span>当前：${state.age}岁 · ${st.tag}</span></div>` +
      `<h2 id="sheetTitle">${w.title}</h2>` +
      `<div style="color:var(--muted);font-size:12px">关键区间 ${w.start}–${w.end} 岁</div>` +
      `<div class="track"><span class="sp" style="left:${l}%;width:${wd}%"></span><span class="me" style="left:${me}%"></span></div>` +
      `<div class="scale"><span>0</span><span>30</span><span>60</span><span>90岁</span></div>` +
      `<p>${w.desc}</p><p class="basis">${w.basis}</p>` +
      (() => {
        const g = remedyGrade(w, st);
        const body = g.kind === "closed" && w.remedyClosed ? w.remedyClosed : w.remedy;
        const title = g.kind === "closed" || g.kind === "none" ? "止损方案" : "补救档案";
        return `<div class="fix"><b>${title}（${g.head}）：</b>${st.key === "upcoming" ? "" : remedyLead(st, g)}${body}</div>`;
      })();
    scrim.hidden = false;
  }
  function closeSheet() { scrim.hidden = true; }

  grid.addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (card) openSheet(+card.dataset.i);
  });
  grid.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      const card = e.target.closest(".card");
      if (card) { e.preventDefault(); openSheet(+card.dataset.i); }
    }
  });
  sheetClose.addEventListener("click", closeSheet);
  scrim.addEventListener("click", (e) => { if (e.target === scrim) closeSheet(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

  ageRange.addEventListener("input", (e) => { state.age = +e.target.value; render(); });
  ageNumber.addEventListener("change", (e) => {
    let v = parseInt(e.target.value, 10);
    if (Number.isNaN(v)) v = state.age;
    state.age = Math.max(0, Math.min(90, v));
    render();
  });
  btnF.addEventListener("click", () => { state.gender = "female"; render(); });
  btnM.addEventListener("click", () => { state.gender = "male"; render(); });
  statusBox.addEventListener("click", (e) => {
    const b = e.target.closest(".t");
    if (b) { state.status = b.dataset.s; render(); }
  });
  domainFilter.addEventListener("change", (e) => { state.domain = e.target.value; render(); });
  sortSel.addEventListener("change", (e) => { state.sort = e.target.value; render(); });
  $("#btnShare").addEventListener("click", async () => {
    const btn = $("#btnShare");
    const tabNames = { windows: "人生窗口图谱", partner: "错过还有下一个吗", wealth: "复利要怎么攒", loan: "月供扛得住吗", rentbuy: "买还是租更值" };
    let hk = "";
    try { hk = (location.hash || "").replace(/^#\/?/, "").split("?")[0]; } catch (e) {}
    if (hk === "levels" || hk === "fortune") hk = "partner";
    const onWindows = hk === "" || hk === "windows";
    const shareData = {
      title: document.title,
      text: onWindows ? `人生窗口图谱：${state.age}岁 · ${state.gender === "female" ? "女性" : "男性"}` : (tabNames[hk] || "人生工具箱"),
      url: location.href,
    };
    try {
      if (navigator.share) { await navigator.share(shareData); return; }
      await navigator.clipboard.writeText(location.href);
      btn.textContent = "链接已复制";
      setTimeout(() => (btn.textContent = "分享"), 1500);
    } catch (e) {
      if (e && e.name === "AbortError") return;
      try { await navigator.clipboard.writeText(location.href); btn.textContent = "链接已复制"; }
      catch (_) { alert(location.href); return; }
      setTimeout(() => (btn.textContent = "分享"), 1500);
    }
  });

  render();
})();

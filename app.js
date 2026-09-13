/* 紧凑卡片 + 弹窗详情 */
(function () {
  const $ = (s) => document.querySelector(s);
  const grid = $("#grid"), summary = $("#summary"), curLine = $("#curLine");
  const scrim = $("#scrim"), sheetBody = $("#sheetBody"), sheetClose = $("#sheetClose");
  const ageRange = $("#ageRange"), ageNumber = $("#ageNumber"), ageLabel = $("#ageLabel");
  const btnF = $("#btnFemale"), btnM = $("#btnMale");
  const statusBox = $("#statusFilter"), domainFilter = $("#domainFilter"), sortSel = $("#sortSel");

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

  // 补救块的引导语：正文是静态档案，这句随年龄/状态变，拖滑杆时能看到它在动
  function remedyLead(st) {
    if (st.key === "open") return "窗口进行中，现在行动收益最大。万一错过——";
    if (st.key === "narrowing") return `只剩${st.n}${st.unit}，抓紧收尾；错过后——`;
    if (st.key === "missed") return `已过${st.n}${st.unit}，现在只能——`;
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
    const c = { open: 0, narrowing: 0, missed: 0, upcoming: 0 };
    rows.forEach((x) => c[x.st.key]++);
    summary.innerHTML =
      `<span class="stat go"><b>${c.open}</b>进行中</span>` +
      `<span class="stat tight"><b>${c.narrowing}</b>余量不多</span>` +
      `<span class="stat past"><b>${c.missed}</b>已过·补救</span>` +
      `<span class="stat future"><b>${c.upcoming}</b>待开启</span>`;
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
      const noRemedy = !w.remedy || !w.remedy.trim();
      return `<article class="card st-${st.key}" data-i="${i}" tabindex="0" aria-label="${w.title}，${iv}">
        <div class="chead"><span class="dom">${w.domain}</span><span class="st"><i></i>${st.tag}</span></div>
        <h3>${w.title}</h3>
        <div class="iv">${iv}</div>
        ${miniBar(w, state.age)}
        <p class="ds">${w.desc}</p>
        ${st.key === "upcoming" ? "" : `<div class="fx"><span class="diff${w.remedyCost === "不可逆" ? " doom" : ""}">补救难度：${w.remedyCost} · ${w.remedyEffect}</span><p class="rlead">${remedyLead(st)}</p><p>${noRemedy ? "暂无有效补救" : w.remedy}</p></div>`}
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
      `<div class="fix"><b>补救档案（代价${w.remedyCost} · ${w.remedyEffect}）：</b>${st.key === "upcoming" ? "" : remedyLead(st)}${w.remedy}</div>`;
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
    const tabNames = { windows: "人生窗口图谱", partner: "伴侣选择器", wealth: "财富累计计算器", loan: "贷款买房/车风险器", rentbuy: "买租房计算器" };
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

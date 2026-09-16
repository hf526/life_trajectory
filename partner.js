/* 错过还有下一个吗 v1：费米估算
 * 输入：目标性别 / 我年龄 / 对象年龄段 / 身高 / 颜值 / 学历 / 收入 / 资产 / 城市 / 社交量
 * 输出：最佳伴侣画像 + 同城候选人数 + 错过后1年内重遇概率（大/中/小）+ 最贵条件 + 行动
 * 基数均为量级估算（见 CITIES / EDU_BASE / INC_BASE / ASSET_BASE），可在顶部直接调。
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const LS_KEY = "partner-v1";

  // ---- 城市表（s = 18–50岁单身总数，单位万人，由常住人口×0.175折算：18–50岁占比约50% × 单身率约35%，量级估算） ----
  // t 为线级，只决定学历/收入/资产的城市系数
  const CITIES = [
    { n: "北京", t: "tier1", s: 380 }, { n: "上海", t: "tier1", s: 440 },
    { n: "广州", t: "tier1", s: 330 }, { n: "深圳", t: "tier1", s: 310 },
    { n: "成都", t: "new1", s: 380 }, { n: "重庆", t: "new1", s: 560 },
    { n: "杭州", t: "new1", s: 220 }, { n: "武汉", t: "new1", s: 240 },
    { n: "苏州", t: "new1", s: 230 }, { n: "西安", t: "new1", s: 230 },
    { n: "南京", t: "new1", s: 170 }, { n: "天津", t: "new1", s: 240 },
    { n: "郑州", t: "new1", s: 230 }, { n: "长沙", t: "new1", s: 180 },
    { n: "东莞", t: "new1", s: 180 }, { n: "佛山", t: "new1", s: 170 },
    { n: "宁波", t: "new1", s: 170 }, { n: "青岛", t: "new1", s: 180 },
    { n: "沈阳", t: "new1", s: 160 },
    { n: "合肥", t: "tier2", s: 180 }, { n: "济南", t: "tier2", s: 160 },
    { n: "福州", t: "tier2", s: 150 }, { n: "厦门", t: "tier2", s: 90 },
    { n: "昆明", t: "tier2", s: 120 }, { n: "大连", t: "tier2", s: 130 },
    { n: "长春", t: "tier2", s: 160 }, { n: "哈尔滨", t: "tier2", s: 130 },
    { n: "南昌", t: "tier2", s: 110 }, { n: "南宁", t: "tier2", s: 160 },
    { n: "贵阳", t: "tier2", s: 110 }, { n: "太原", t: "tier2", s: 90 },
    { n: "石家庄", t: "tier2", s: 200 }, { n: "温州", t: "tier2", s: 170 },
    { n: "无锡", t: "tier2", s: 130 }, { n: "泉州", t: "tier2", s: 160 },
    { n: "洛阳", t: "tier3", s: 120 }, { n: "桂林", t: "tier3", s: 90 },
    { n: "柳州", t: "tier3", s: 70 }, { n: "襄阳", t: "tier3", s: 100 },
    { n: "其他城市", t: "tier3", s: 100 },
  ];
  const TIER_NAME = { tier1: "一线", new1: "新一线", tier2: "二线", tier3: "三线及以下" };
  const DEFAULT_CITY = "成都";
  const cityOf = (name) => CITIES.find((c) => c.n === name) || CITIES.find((c) => c.n === DEFAULT_CITY);
  const cityLabel = (name) => cityOf(name).n;
  let committedCity = DEFAULT_CITY; // 已确认的城市；输入框打字过程中不污染计算
  const EDU_BASE = { any: 1, dz: 0.45, bk: 0.25, ms: 0.06 };
  const EDU_NAME = { any: "学历不限", low: "大专以下", dz: "大专+", bk: "本科+", ms: "硕士+" };
  const EDU_CITY_MULT = { tier1: 1.3, new1: 1.15, tier2: 1.0, tier3: 0.8, tier4: 0.7 };
  const INC_BASE = { any: 1, 10: 0.40, 18: 0.22, 50: 0.04, 100: 0.008 };
  const INC_NAME = { any: "收入不限", low: "年入10万以下", 10: "年入10万+", 18: "年入18万+", 50: "年入50万+", 100: "年入100万+" };
  const INC_CITY_MULT = { tier1: 1.4, new1: 1.2, tier2: 1.0, tier3: 0.7, tier4: 0.6 };
  const ASSET_BASE = { any: 1, 50: 0.25, 200: 0.08, 500: 0.02 };
  const ASSET_NAME = { any: "资产不限", low: "资产50万以下", 50: "资产50万+", 200: "资产200万+", 500: "资产500万+" };
  const ASSET_CITY_MULT = { tier1: 1.3, new1: 1.15, tier2: 1.0, tier3: 0.8, tier4: 0.7 };
  const HEIGHT = { female: { mean: 160, sd: 5.5 }, male: { mean: 173, sd: 6 } }; // 找女生/找男生
  const LOOKS = { mean: 6, sd: 1.5 }; // 颜值1–10分正态近似
  const AGE_LO = 18, AGE_HI = 50, AGE_SPAN = AGE_HI - AGE_LO + 1; // 33

  // 标准正态 CDF（erf 近似）
  function phi(z) {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    p = 1 - p;
    return z > 0 ? p : 1 - p;
  }

  const chipVal = (id) => {
    const el = $(id)?.querySelector(".chip.active");
    return el ? el.dataset.v : null;
  };
  const radioVal = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value;
  function setRadio(name, v) {
    const list = document.querySelectorAll(`input[name="${name}"]`);
    if (!list.length || ![...list].some((r) => r.value === v)) return; // 旧存档的值已下线则保留默认
    list.forEach((r) => { r.checked = r.value === v; });
  }

  function getInputs() {
    let ageMin = parseInt($("pAgeMin").value, 10) || 24;
    let ageMax = parseInt($("pAgeMax").value, 10) || 32;
    if (ageMin > ageMax) { const t = ageMin; ageMin = ageMax; ageMax = t; }
    const city = cityOf(committedCity);
    return {
      gender: chipVal("pGender") || "female",
      ageMin, ageMax,
      height: Math.max(150, Math.min(190, parseInt($("pHeight").value, 10) || 160)),
      looks: Math.max(1, Math.min(10, parseInt($("pLooks").value, 10) || 6)),
      edu: radioVal("edu") || "any",
      income: radioVal("income") || "any",
      asset: radioVal("asset") || "any",
      city: city.n,
      tier: city.t,
      base: city.s * 10000, // 单身总数（人）
      social: Math.max(1, parseInt($("pSocial").value, 10) || 5),
    };
  }

  function parts(p) {
    const lo = Math.max(p.ageMin, AGE_LO), hi = Math.min(p.ageMax, AGE_HI);
    const pAge = Math.max(1e-9, hi - lo + 1) / AGE_SPAN;
    const h = HEIGHT[p.gender];
    const pHeight = Math.max(1e-9, 1 - phi((p.height - h.mean) / h.sd));
    const pLooks = Math.max(1e-9, 1 - phi((p.looks - LOOKS.mean) / LOOKS.sd));
    const eduMult = EDU_CITY_MULT[p.tier] ?? 1;
    const pEdu = p.edu === "any" ? 1
      : p.edu === "low" ? Math.max(0.05, 1 - Math.min(0.85, EDU_BASE.dz * eduMult))
      : Math.min(0.85, (EDU_BASE[p.edu] ?? 1) * eduMult);
    const pInc = p.income === "any" ? 1 : Math.min(0.9, (INC_BASE[p.income] ?? 1) * (INC_CITY_MULT[p.tier] ?? 1));
    const pAsset = p.asset === "any" ? 1 : Math.min(0.7, (ASSET_BASE[p.asset] ?? 1) * (ASSET_CITY_MULT[p.tier] ?? 1));
    return { pAge, pHeight, pLooks, pEdu, pInc, pAsset };
  }

  function calc(p) {
    const { pAge, pHeight, pLooks, pEdu, pInc, pAsset } = parts(p);
    const ratio = pAge * pHeight * pLooks * pEdu * pInc * pAsset; // 目标性别单身中过硬条件的占比
    const baseTarget = p.base / 2;
    const pool = baseTarget * ratio; // 客观存在多少
    const lambda = p.social * 12 * ratio; // 每年遇到同级人数期望
    const probYear = 1 - Math.exp(-lambda); // 1年内至少再遇一个同级的概率
    const prob3 = 1 - Math.exp(-lambda * 3); // 3年内至少再遇一个同级的概率
    const waitMonths = lambda > 0 ? 1 / (p.social * ratio) : Infinity;
    const horizon = 10;
    const life = lambda * horizon; // 未来10年累计遇到人数期望
    const grade = probYear >= 0.7 ? "大" : probYear >= 0.3 ? "中" : "小";

    // 最贵的一条：逐个放宽到不限，看人数变为几倍（= 1/该项占比）
    const relax = [
      { name: `年龄${p.ageMin}–${p.ageMax}岁`, mult: 1 / Math.max(pAge, 1e-9), kind: "age" },
      { name: `身高${p.height}cm+`, mult: 1 / Math.max(pHeight, 1e-9), kind: "height" },
      { name: `颜值${p.looks}分+`, mult: 1 / Math.max(pLooks, 1e-9), kind: "looks" },
    ];
    if (p.edu !== "any") relax.push({ name: EDU_NAME[p.edu], mult: 1 / Math.max(pEdu, 1e-9), kind: "edu" });
    if (p.income !== "any") relax.push({ name: INC_NAME[p.income], mult: 1 / Math.max(pInc, 1e-9), kind: "income" });
    if (p.asset !== "any") relax.push({ name: ASSET_NAME[p.asset], mult: 1 / Math.max(pAsset, 1e-9), kind: "asset" });
    relax.sort((a, b) => b.mult - a.mult);

    const bits = [`${p.ageMin}–${p.ageMax}岁`, `${p.height}cm+`, `${p.looks}分+`];
    if (p.edu !== "any") bits.push(EDU_NAME[p.edu]);
    if (p.income !== "any") bits.push(INC_NAME[p.income]);
    if (p.asset !== "any") bits.push(ASSET_NAME[p.asset]);
    bits.push(cityLabel(p.city), p.gender === "female" ? "女生" : "男生");
    const portrait = "最佳伴侣：" + bits.join(" · ");
    return { ratio, pool, lambda, probYear, prob3, horizon, waitMonths, life, grade, relax, portrait, parts: { pAge, pHeight, pLooks, pEdu, pInc, pAsset } };
  }

  const fmtPool = (n) => n >= 10000 ? (n / 10000).toFixed(1) + "万" : String(Math.max(0, Math.round(n))) + "人";
  const fmtBase = (n) => n >= 10000 ? (n / 10000).toFixed(0) + "万" : String(Math.round(n));
  const pct1 = (x) => (x * 100).toFixed(x < 0.01 ? 2 : 1) + "%";
  const fmtRatio = (r) => r >= 0.01 ? (r * 100).toFixed(1) + "%" : (r * 100).toFixed(2) + "%";
  const fmtWait = (m) => !Number.isFinite(m) || m > 1200 ? "几乎等不到" : m >= 24 ? "约" + (m / 12).toFixed(1) + "年" : m >= 12 ? "约" + (m / 12).toFixed(1) + "年" : "约" + Math.max(1, Math.round(m)) + "个月";

  function render() {
    if (!$("partnerForm")) return;
    const p = getInputs();
    const r = calc(p);
    $("vAgeRange").textContent = `${p.ageMin}–${p.ageMax}`;
    $("vHeight").textContent = p.height;
    $("vLooks").textContent = p.looks;
    $("vSocial").textContent = p.social;

    $("qPool").textContent = "约" + fmtPool(r.pool);
    $("qRatio").textContent = fmtRatio(r.ratio);
    $("qProb").textContent = (r.probYear * 100).toFixed(0) + "%·" + r.grade;
    $("qProb3").textContent = (r.prob3 * 100).toFixed(0) + "%";

    const badge = $("missBadge");
    badge.textContent = "重遇概率" + r.grade;
    badge.className = "badge " + (r.grade === "大" ? "go" : r.grade === "中" ? "tight" : "past");
    $("portrait").textContent = r.portrait;
    $("waitLine").textContent = `错过这个同级，下一个平均要等 ${fmtWait(r.waitMonths)}（按当前社交量）`;
    $("partnerSub").textContent = `${cityLabel(p.city)} · 还剩${fmtPool(r.pool)} · 重遇${r.grade}`;

    // 计算漏斗：基数 → 每步占比 → 剩余人数
    (function funnel() {
      const box = $("howRows");
      if (!box) return;
      const base = p.base;
      const who = p.gender === "female" ? "女生" : "男生";
      let acc = base / 2;
      const rows = [
        { l: `${cityLabel(p.city)}18–50岁单身约${fmtBase(base)}人`, r: "基数" },
        { l: `其中${who}一半`, r: fmtPool(acc) },
      ];
      const step = (label, part) => {
        acc *= part;
        rows.push({ l: `× ${label} ${pct1(part)}`, r: "剩" + fmtPool(acc) });
      };
      step(`年龄${p.ageMin}–${p.ageMax}岁`, r.parts.pAge);
      step(`身高${p.height}cm+`, r.parts.pHeight);
      step(`颜值${p.looks}分+`, r.parts.pLooks);
      if (p.edu !== "any") step(EDU_NAME[p.edu], r.parts.pEdu);
      if (p.income !== "any") step(INC_NAME[p.income], r.parts.pInc);
      if (p.asset !== "any") step(ASSET_NAME[p.asset], r.parts.pAsset);
      rows.push({ l: "＝ 同城候选", r: "约" + fmtPool(acc) + `（占${fmtRatio(r.ratio)}）`, final: true });
      const lifeFmt = r.life >= 100 ? Math.round(r.life) + "人" : r.life >= 10 ? r.life.toFixed(0) + "人" : r.life.toFixed(1) + "人";
      rows.push({ l: `每月认识${p.social}人`, r: `年均遇到${r.lambda >= 100 ? Math.round(r.lambda) : r.lambda.toFixed(1)}人` });
      rows.push({ l: `未来10年累计遇到`, r: `约${lifeFmt}` });
      rows.push({ l: "1年内再遇同级", r: `${(r.probYear * 100).toFixed(0)}%·${r.grade}`, final: true });
      rows.push({ l: "3年内再遇同级", r: `${(r.prob3 * 100).toFixed(0)}%`, final: true });
      box.innerHTML = rows.map((x) => `<div class="howrow${x.final ? " final" : ""}"><span>${x.l}</span><span class="pc">${x.r}</span></div>`).join("");
    })();

    const adv = [];
    const top = r.relax[0];
    if (top && top.mult >= 1.5) adv.push(`最贵的一条是 <b>${top.name}</b>：放宽它人数约 ×${top.mult >= 10 ? Math.round(top.mult) : top.mult.toFixed(1)}。<button class="linkbtn" data-relax="${top.kind}" type="button">帮我放宽</button>`);
    else adv.push(`当前条件不算苛刻：占比 ${fmtRatio(r.ratio)}，先保社交量再砍条件。`);
    if (Number.isFinite(r.waitMonths) && r.waitMonths > 1) {
      const target = Math.min(30, p.social * 2); // 社交封顶30，等待按实际能涨到的量缩，不能一律说减半
      if (target > p.social) {
        const newWait = r.waitMonths * p.social / target;
        adv.push(`社交从 ${p.social} 提到 ${target} 人/月，等待从 ${fmtWait(r.waitMonths)} 缩到 ${fmtWait(newWait)}。圈子比标准好改。`);
      }
    }
    if (r.grade === "小") adv.push(`重遇概率小：遇到前 10% 的别用“再看看”放走，错过平均等 ${fmtWait(r.waitMonths)}。`);
    else if (r.grade === "大") adv.push(`重遇概率大：不用怕错过，${fmtWait(r.waitMonths)}内大概率再遇同级，多看人品和相处。`);
    else adv.push(`重遇概率中等：给自己设条线——超过 3 个月没遇到同级，就放宽一条。`);
    const shown = adv.slice(0, 3), rest = adv.slice(3);
    $("partnerAdvice").innerHTML = shown.map((a) => `<li>${a}</li>`).join("");
    const oldMore = $("partnerAdvice").nextElementSibling;
    if (oldMore && oldMore.classList.contains("more")) oldMore.remove();
    if (rest.length) {
      const d = document.createElement("details");
      d.className = "more";
      d.innerHTML = `<summary>更多建议（${rest.length}条）</summary><ul>${rest.map((a) => `<li>${a}</li>`).join("")}</ul>`;
      $("partnerAdvice").after(d);
    }
    try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch (e) {}
  }

  function bindChips(id, cb) {
    const box = $(id);
    if (!box || box.dataset.bound) return;
    box.dataset.bound = "1";
    box.addEventListener("click", (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      box.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      b.classList.add("active");
      cb?.(b.dataset.v);
      render();
    });
  }
  function setChips(id, v) {
    const box = $(id);
    if (!box) return;
    if (!box.querySelector(`[data-v="${v}"]`)) return; // 旧存档的值已下线则保留默认
    box.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.v === v));
  }

  // 城市输入即筛：打字过滤候选，点选/回车确认；输错则回退到上一个有效城市
  let hotIdx = -1;
  function suggestMatches(q) {
    q = (q || "").trim();
    if (!q) return CITIES.slice(0, 8); // 空输入给热门8城
    return CITIES.filter((c) => c.n.includes(q)).slice(0, 8);
  }
  function showSuggest() {
    const box = $("pCityList"), inp = $("pCityInput");
    if (!box || !inp) return;
    const list = suggestMatches(inp.value);
    hotIdx = -1;
    if (!list.length) { box.hidden = true; box.innerHTML = ""; return; }
    box.innerHTML = list.map((c, i) => `<button type="button" data-city="${c.n}" data-i="${i}"><span>${c.n}</span><small>${TIER_NAME[c.t]} · 单身约${c.s}万</small></button>`).join("");
    box.hidden = false;
  }
  function hideSuggest() {
    const box = $("pCityList");
    if (box) { box.hidden = true; box.innerHTML = ""; }
    hotIdx = -1;
  }
  function commitCity(name) {
    const c = CITIES.find((x) => x.n === name);
    if (!c) return false;
    committedCity = c.n;
    const inp = $("pCityInput");
    if (inp && inp.value !== c.n) inp.value = c.n;
    hideSuggest();
    return true;
  }

  function restore() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return false;
      const p = JSON.parse(raw);
      if (p.gender) setChips("pGender", p.gender);
      if (p.ageMin) $("pAgeMin").value = p.ageMin;
      if (p.ageMax) $("pAgeMax").value = p.ageMax;
      if (p.height) $("pHeight").value = p.height;
      if (p.looks) $("pLooks").value = p.looks;
      if (p.edu) setRadio("edu", p.edu);
      if (p.income) setRadio("income", p.income);
      if (p.asset) setRadio("asset", p.asset);
      if (p.city && CITIES.some((c) => c.n === p.city)) committedCity = p.city;
      if (p.social) $("pSocial").value = p.social;
      return true;
    } catch (e) { return false; }
  }

  function init() {
    if (!$("partnerForm") || $("partnerForm").dataset.bound) { render(); return; }
    $("partnerForm").dataset.bound = "1";
    const had = restore();
    if ($("pCityInput")) $("pCityInput").value = committedCity;
    bindChips("pGender", (v) => { if (!had) $("pHeight").value = v === "female" ? 160 : 175; });
    $("partnerForm").addEventListener("input", render);
    $("partnerForm").addEventListener("change", render);
    // 城市输入框：打字只过滤候选（不污染计算），change/回车/点选才确认
    (function bindCity() {
      const inp = $("pCityInput");
      if (!inp || inp.dataset.bound) return;
      inp.dataset.bound = "1";
      inp.addEventListener("input", showSuggest);
      inp.addEventListener("focus", showSuggest);
      inp.addEventListener("blur", () => setTimeout(hideSuggest, 120));
      inp.addEventListener("change", () => {
        if (!commitCity(inp.value.trim())) inp.value = committedCity;
        render();
      });
      inp.addEventListener("keydown", (e) => {
        const box = $("pCityList");
        const btns = box ? [...box.querySelectorAll("button")] : [];
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          if (!btns.length) return;
          e.preventDefault();
          hotIdx = (hotIdx + (e.key === "ArrowDown" ? 1 : -1) + btns.length) % btns.length;
          btns.forEach((b, i) => b.classList.toggle("hot", i === hotIdx));
          btns[hotIdx].scrollIntoView({ block: "nearest" });
        } else if (e.key === "Enter") {
          if (hotIdx >= 0 && btns[hotIdx]) { e.preventDefault(); commitCity(btns[hotIdx].dataset.city); render(); }
        } else if (e.key === "Escape") { inp.value = committedCity; hideSuggest(); }
      });
    })();
    if ($("pCityList")) $("pCityList").addEventListener("mousedown", (e) => {
      const b = e.target.closest("[data-city]");
      if (!b) return;
      e.preventDefault();
      commitCity(b.dataset.city);
      render();
    });
    // 一键放宽：把最贵的那条直接降到不限/最小
    $("partnerForm").addEventListener("click", (e) => {
      const b = e.target.closest("[data-relax]");
      if (!b) return;
      const k = b.dataset.relax;
      if (k === "age") { $("pAgeMin").value = 18; $("pAgeMax").value = 50; }
      else if (k === "height") { $("pHeight").value = 150; }
      else if (k === "looks") { $("pLooks").value = 1; }
      else if (k === "edu") setRadio("edu", "any");
      else if (k === "income") setRadio("income", "any");
      else if (k === "asset") setRadio("asset", "any");
      else return;
      render();
    });
    $("partnerReset").addEventListener("click", () => {
      try { localStorage.removeItem(LS_KEY); } catch (e) {}
      setChips("pGender", "female");
      $("pAgeMin").value = 24; $("pAgeMax").value = 32; $("pHeight").value = 160;
      $("pLooks").value = 6;
      setRadio("edu", "any"); setRadio("income", "any"); setRadio("asset", "any");
      committedCity = DEFAULT_CITY;
      if ($("pCityInput")) $("pCityInput").value = committedCity;
      $("pSocial").value = 5;
      render();
    });
    render();
  }

  window.PartnerApp = { init, calc };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

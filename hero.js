/* hero.js：首屏巨幕 —— 生命格子 + 超大数字 + 一句话定性
 * 一格 = 一个月，一列 = 一岁。总年数按性别取预期寿命口径：女性 85 岁、男性 80 岁
 * （见 data.js 的 LIFE_SPAN），所以切性别时列数会变，网格需要重建。
 * 数据由 app.js 每次 render 时喂进来：LifeHero.update(age, gender, counts, total)
 */
(function () {
  const $ = (s) => document.querySelector(s);
  const root = $("#lifeHero");
  if (!root) return;

  const SPAN = window.LIFE_SPAN || { female: 85, male: 80 };
  const MONTHS = 12;
  const spanOf = (g) => SPAN[g] || SPAN.female || 85;

  const gridEl = $("#hGrid");
  const legendEl = $("#hLegendYears");
  const leftLabelEl = $("#hLeftLabel");
  let cells = [], years = 0;

  // 列数 = 预期寿命（女 85 / 男 80），行 = 12 个月，共 years × 12 格
  function build(n) {
    years = n;
    gridEl.style.gridTemplateColumns = `repeat(${n},1fr)`;
    const frag = document.createDocumentFragment();
    cells = [];
    for (let y = 0; y < MONTHS; y++) {
      for (let m = 0; m < n; m++) {
        const d = document.createElement("div");
        d.className = "hcell";
        frag.appendChild(d);
        cells.push(d);
      }
    }
    gridEl.textContent = "";
    gridEl.appendChild(frag);
    root.dataset.age = ""; // 网格重建过，强制下一帧重绘
  }

  const setNum = (el, txt, first) => {
    if (!el) return;
    if (window.Motion && window.Motion.setNum) window.Motion.setNum(el, txt, first);
    else el.textContent = txt;
  };
  const nf = (n) => Math.round(n).toLocaleString("en-US");

  // 一列 = 一岁：前 age 列整列点亮（= age×12 个月），当前岁那一列标红
  function paint(age) {
    for (let i = 0; i < cells.length; i++) {
      const col = i % years;
      const want = col === age ? "hcell now" : col < age ? "hcell on" : "hcell";
      const c = cells[i];
      if (c.className !== want) c.className = want;
    }
  }

  let booted = false; // 只有首帧做入场滚动，之后拖动用短补间跟手
  function update(age, gender, counts, total) {
    const YEARS = spanOf(gender);
    if (YEARS !== years) build(YEARS);
    const first = !booted;
    booted = true;

    age = Math.max(0, Math.min(YEARS, age | 0));
    if (root.dataset.age !== String(age)) { paint(age); root.dataset.age = String(age); }

    if (leftLabelEl) leftLabelEl.textContent = `按 ${YEARS} 岁算还剩`;
    if (legendEl) {
      legendEl.textContent = `一格 = 一个月，一列 = 一岁，按${gender === "male" ? "男性" : "女性"} ${YEARS} 岁计`;
    }

    const days = age * 365.25, left = (YEARS - age) * 365.25;
    setNum($("#hDays"), nf(days), first);
    setNum($("#hLeft"), nf(left), first);
    setNum($("#hPct"), Math.round((age / YEARS) * 100) + "%", first);

    const c = counts || {};
    const kicker = $("#hKicker");
    if (!kicker) return;
    if (!total) { kicker.innerHTML = ""; return; }
    const open = c.open || 0, narrowing = c.narrowing || 0, missed = c.missed || 0;
    const upcoming = c.upcoming || 0, closed = c.closed || 0;
    // 一句话定性：统计胶囊已删，这里的数字必须把四档状态都接住，别处不再重复
    const main = missed > 0
      ? `${total} 个窗口里，<b class="go">${open}</b> 个正在进行、<b class="past">${missed}</b> 个已经错过。`
      : `${total} 个窗口里，<b class="go">${open}</b> 个正在进行，一个都还没错过。`;
    let tail = "";
    if (closed) tail = `其中 <b class="dead">${closed}</b> 个已补不回来，只剩止损`;
    else if (narrowing && upcoming) tail = `另有 <b class="tight">${narrowing}</b> 个只剩不到 3 年，<b>${upcoming}</b> 个未到年纪`;
    else if (narrowing) tail = `另有 <b class="tight">${narrowing}</b> 个只剩不到 3 年，正在关门`;
    else if (upcoming) tail = `还有 <b>${upcoming}</b> 个未到年纪`;
    else if (missed) tail = `错过的都能补，代价不同而已`;
    kicker.innerHTML = `<span class="hk-main">${main}</span>` + (tail ? `<small>${tail}。</small>` : "");
  }

  window.LifeHero = { update };
})();

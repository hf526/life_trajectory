/* Tab 路由：hash 驱动，支持深链接 + 浏览器前进后退
 * 路由表：#/windows #/partner #/wealth #/loan #/rentbuy（#/levels #/fortune 为旧链接，自动跳 #/partner）
 * 后续新工具：1) 在 TABS 加一项 2) index.html 加一个 section 3) 如需 JS，新建 <name>.js 并在 initializers 里注册
 */
(function () {
  const TABS = {
    windows: { view: "view-windows", tab: "tab-windows", name: "窗口图谱" },
    partner: { view: "view-partner", tab: "tab-partner", name: "伴侣去留" },
    wealth: { view: "view-wealth", tab: "tab-wealth", name: "复利攒钱" },
    loan: { view: "view-loan", tab: "tab-loan", name: "月供压力" },
    rentbuy: { view: "view-rentbuy", tab: "tab-rentbuy", name: "买租哪个值" },
  };
  const ALIAS = { levels: "partner", fortune: "partner" }; // 旧 Tab2 链接兼容
  const DEFAULT = "windows";
  // 各工具的一次性初始化钩子，后续把真正的 init 函数挂在这里即可
  const initializers = {
    partner: () => window.PartnerApp?.init(),
    wealth: () => window.WealthApp?.init(),
    loan: () => window.LoanApp?.init(),
    rentbuy: () => window.RentbuyApp?.init(),
  };
  const inited = new Set();

  function currentKey() {
    let h = (location.hash || "").replace(/^#\/?/, "").split("?")[0];
    if (ALIAS[h]) h = ALIAS[h];
    return TABS[h] ? h : DEFAULT;
  }

  function switchTab(key, push) {
    if (!TABS[key]) key = DEFAULT;
    Object.entries(TABS).forEach(([k, v]) => {
      const active = k === key;
      document.getElementById(v.view).hidden = !active;
      const btn = document.querySelector(`.tab[data-tab="${k}"]`);
      if (btn) {
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-selected", active ? "true" : "false");
        btn.tabIndex = active ? 0 : -1;
      }
    });
    // 只有窗口图谱需要年龄/性别条
    const ctl = document.getElementById("windowsControls");
    if (ctl) ctl.hidden = key !== "windows";
    const nameEl = document.getElementById("curTabName");
    if (nameEl) nameEl.textContent = TABS[key].name;
    try {
      if (push !== false && currentKey() !== key) {
        history.replaceState(null, "", location.pathname + location.search + "#/" + key);
        // 注：保留 ?age=&gender=；如需后退栈可换 pushState
      } else if (push !== false && !location.hash) {
        history.replaceState(null, "", location.pathname + location.search + "#/" + key);
      }
    } catch (e) {} // 沙箱 iframe 下 history 可能不可用，tab 切换本身不受影响
    // 懒初始化一次
    if (!inited.has(key)) {
      inited.add(key);
      try { initializers[key]?.(); } catch (e) { console.error(e); }
    }
    window.scrollTo({ top: 0 });
  }

  document.querySelector(".tabs").addEventListener("click", (e) => {
    const b = e.target.closest(".tab");
    if (b) switchTab(b.dataset.tab);
  });
  // 键盘左右箭头切换，无障碍
  document.querySelector(".tabs").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const keys = Object.keys(TABS);
    let i = keys.indexOf(currentKey());
    i = (i + (e.key === "ArrowRight" ? 1 : -1) + keys.length) % keys.length;
    e.preventDefault();
    switchTab(keys[i]);
    document.querySelector(`.tab[data-tab="${keys[i]}"]`)?.focus();
  });
  window.addEventListener("hashchange", () => switchTab(currentKey(), false));

  // 分享按钮文案带上当前 tab，app.js 里已有分享逻辑，这里只增强文本
  // （app.js 的监听仍有效，无需重复绑定）

  switchTab(currentKey(), false);
  // 首屏无 hash 时补上，方便分享深链接
  if (!location.hash) { try { history.replaceState(null, "", location.pathname + location.search + "#/" + currentKey()); } catch (e) {} }
})();

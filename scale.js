/* scale.js：金额滑杆的分段刻度
 * 为什么需要：一套房大多 100–200 万，但也要能算到 600 万以上。
 * 线性滑杆做不到两头兼顾（要么低端一格好几万、要么拉不到 600 万），
 * 所以把滑杆变成"档位序号"，档位表由分段生成：低端步长细、高端步长粗。
 *
 * segments 形如 [[0,50,1],[50,150,5],[150,300,10],[300,600,20],[600,1000,50]]
 * 含义：[起点, 终点, 步长]，后续段从"上一段终点 + 本段步长"接着走。
 *
 * 用法：
 *   SliderScale.bind(el, segments, value)  绑定并建立 min/max/step（只写档位序号）
 *   SliderScale.read(el)                   读当前档位对应的真实数值（万元 / 元）
 *   SliderScale.write(el, value)           把真实数值写回最近的档位
 */
(function () {
  const map = new WeakMap();
  const q = (v) => Math.round(v * 1e6) / 1e6; // 抹掉浮点累加误差（0.1+0.2 那种）

  function make(segments) {
    const values = [];
    (segments || []).forEach((seg, i) => {
      const from = Number(seg[0]), to = Number(seg[1]), step = Number(seg[2]) || 1;
      if (!(step > 0) || to < from) return;
      const start = i === 0 ? from : values[values.length - 1] + step;
      for (let v = start; v <= to + 1e-9; v += step) values.push(q(v));
    });
    if (!values.length) values.push(0);
    const max = values.length - 1;
    return {
      values,
      max,
      at: (pos) => values[Math.max(0, Math.min(max, Math.round(Number(pos) || 0)))],
      posOf: (v) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return 0;
        let best = 0, bd = Infinity;
        for (let i = 0; i < values.length; i++) {
          const d = Math.abs(values[i] - n);
          if (d < bd) { bd = d; best = i; }
        }
        return best;
      },
    };
  }

  function bind(el, segments, value) {
    if (!el) return null;
    const s = make(segments);
    map.set(el, s);
    el.min = "0"; el.max = String(s.max); el.step = "1";
    el.value = String(s.posOf(value));
    return s;
  }
  function read(el) {
    if (!el) return 0;
    const s = map.get(el);
    return s ? s.at(el.value) : Number(el.value);
  }
  function write(el, value) {
    if (!el) return;
    const s = map.get(el);
    if (s) el.value = String(s.posOf(value));
    else el.value = value;
  }

  window.SliderScale = { make, bind, read, write };
})();

/* ===== 미니 캔들차트 렌더러 (의존성 없음) =====
 * StockChart.draw(canvas, spec)
 * spec = {
 *   candles: [{o,h,l,c}],
 *   lines:    [{values:[num|null], color, width?, dash?, name?}],
 *   band:     {upper:[], lower:[], color},
 *   segments: [{x1,y1,x2,y2,color,dash?,width?,label?,labelAt?:'start'|'end'|'mid'}],
 *   hlines:   [{y, color, dash?, label?}],
 *   markers:  [{i, text, dir:'up'|'down', color?}],
 *   labels:   [{i, y, text, color?, align?, bold?}],
 *   legend:   [{name, color}],
 *   volume:   {values:[num]},                       // 하단 거래량 창
 *   sub:      {name?, range?, lines?, bars?, hlines?} // 하단 보조지표 창
 * }
 * 좌표계: x = 캔들 인덱스(소수 가능), y = 가격
 */
(function () {
  'use strict';

  const COLOR = {
    up: '#d94040',
    dn: '#2a78d6',
    ink: '#0b0b0b',
    ink2: '#52514e',
    muted: '#898781',
    grid: '#e1e0d9',
    axis: '#c3c2b7',
    surface: '#fcfcfb'
  };

  const FONT = '11px "Pretendard", "Apple SD Gothic Neo", system-ui, sans-serif';
  const FONT_BOLD = '700 11.5px "Pretendard", "Apple SD Gothic Neo", system-ui, sans-serif';

  function niceRange(min, max, padRatio) {
    const span = Math.max(max - min, 1e-9);
    const pad = span * (padRatio == null ? 0.09 : padRatio);
    return [min - pad, max + pad];
  }

  function draw(canvas, spec) {
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth || 600;
    const H = canvas.clientHeight || 300;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COLOR.surface;
    ctx.fillRect(0, 0, W, H);

    const candles = spec.candles || [];
    const n = Math.max(candles.length, 2);

    // ---- 패널 레이아웃 ----
    const padT = 14, padB = 8, padL = 10, padR = 46;
    const hasVol = !!spec.volume;
    const hasSub = !!spec.sub;
    const gapPane = 14;
    let mainH, volH = 0, subH = 0;
    const totalH = H - padT - padB;
    if (hasVol && hasSub) { volH = totalH * 0.16; subH = totalH * 0.24; }
    else if (hasVol) { volH = totalH * 0.22; }
    else if (hasSub) { subH = totalH * 0.30; }
    mainH = totalH - volH - subH - (hasVol ? gapPane : 0) - (hasSub ? gapPane : 0);

    const main = { x: padL, y: padT, w: W - padL - padR, h: mainH };
    let cursorY = padT + mainH;
    let volPane = null, subPane = null;
    if (hasVol) { cursorY += gapPane; volPane = { x: padL, y: cursorY, w: main.w, h: volH }; cursorY += volH; }
    if (hasSub) { cursorY += gapPane; subPane = { x: padL, y: cursorY, w: main.w, h: subH }; }

    // ---- y 스케일 (메인) ----
    let lo = Infinity, hi = -Infinity;
    candles.forEach(c => { lo = Math.min(lo, c.l); hi = Math.max(hi, c.h); });
    (spec.lines || []).forEach(L => L.values.forEach(v => { if (v != null && isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }));
    if (spec.band) {
      spec.band.upper.forEach(v => { if (v != null) hi = Math.max(hi, v); });
      spec.band.lower.forEach(v => { if (v != null) lo = Math.min(lo, v); });
    }
    (spec.hlines || []).forEach(h => { lo = Math.min(lo, h.y); hi = Math.max(hi, h.y); });
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    const [yMin, yMax] = niceRange(lo, hi, spec.yPad);

    const slot = main.w / n;
    const X = i => main.x + slot * (i + 0.5);
    const Y = v => main.y + main.h * (1 - (v - yMin) / (yMax - yMin));

    // ---- 그리드 + y축 라벨 ----
    ctx.font = FONT;
    ctx.textBaseline = 'middle';
    const gridN = 4;
    for (let g = 0; g <= gridN; g++) {
      const v = yMin + (yMax - yMin) * g / gridN;
      const y = Y(v);
      ctx.strokeStyle = COLOR.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(main.x, y + 0.5);
      ctx.lineTo(main.x + main.w, y + 0.5);
      ctx.stroke();
      ctx.fillStyle = COLOR.muted;
      ctx.textAlign = 'left';
      ctx.fillText(Math.round(v).toLocaleString(), main.x + main.w + 6, y);
    }

    // ---- 볼린저 등 밴드 ----
    if (spec.band) {
      const { upper, lower, color } = spec.band;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < upper.length; i++) {
        if (upper[i] == null) continue;
        if (!started) { ctx.moveTo(X(i), Y(upper[i])); started = true; }
        else ctx.lineTo(X(i), Y(upper[i]));
      }
      for (let i = lower.length - 1; i >= 0; i--) {
        if (lower[i] == null) continue;
        ctx.lineTo(X(i), Y(lower[i]));
      }
      ctx.closePath();
      ctx.fillStyle = color || 'rgba(42,120,214,0.08)';
      ctx.fill();
    }

    // ---- 캔들 ----
    const bodyW = Math.max(3, Math.min(slot * 0.62, 16));
    candles.forEach((c, i) => {
      const x = X(i);
      const isUp = c.c >= c.o;
      const col = c.color || (isUp ? COLOR.up : COLOR.dn);
      // 꼬리
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1, bodyW * 0.12);
      ctx.beginPath();
      ctx.moveTo(x, Y(c.h));
      ctx.lineTo(x, Y(c.l));
      ctx.stroke();
      // 몸통
      const yO = Y(c.o), yC = Y(c.c);
      const top = Math.min(yO, yC);
      const hBody = Math.max(Math.abs(yC - yO), 1.2);
      ctx.fillStyle = col;
      ctx.fillRect(x - bodyW / 2, top, bodyW, hBody);
      // 양봉은 속을 살짝 밝게 (한국 HTS 스타일 채움 유지: 둘 다 채움)
    });

    // ---- 오버레이 라인 (이평선 등) ----
    (spec.lines || []).forEach(L => {
      ctx.strokeStyle = L.color;
      ctx.lineWidth = L.width || 2;
      ctx.setLineDash(L.dash || []);
      ctx.beginPath();
      let started = false;
      L.values.forEach((v, i) => {
        if (v == null || !isFinite(v)) { return; }
        if (!started) { ctx.moveTo(X(i), Y(v)); started = true; }
        else ctx.lineTo(X(i), Y(v));
      });
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // ---- 수평선 (지지/저항) ----
    (spec.hlines || []).forEach(h => {
      const y = Y(h.y);
      ctx.strokeStyle = h.color || COLOR.ink2;
      ctx.lineWidth = h.width || 1.5;
      ctx.setLineDash(h.dash || [6, 4]);
      ctx.beginPath();
      ctx.moveTo(main.x, y);
      ctx.lineTo(main.x + main.w, y);
      ctx.stroke();
      ctx.setLineDash([]);
      if (h.label) {
        ctx.font = FONT_BOLD;
        ctx.fillStyle = h.color || COLOR.ink2;
        ctx.textAlign = 'left';
        ctx.fillText(h.label, main.x + 4, y - 9);
      }
    });

    // ---- 세그먼트 (추세선·목선) ----
    (spec.segments || []).forEach(s => {
      ctx.strokeStyle = s.color || COLOR.ink2;
      ctx.lineWidth = s.width || 1.8;
      ctx.setLineDash(s.dash || []);
      ctx.beginPath();
      ctx.moveTo(X(s.x1), Y(s.y1));
      ctx.lineTo(X(s.x2), Y(s.y2));
      ctx.stroke();
      ctx.setLineDash([]);
      if (s.label) {
        ctx.font = FONT_BOLD;
        ctx.fillStyle = s.color || COLOR.ink2;
        let lx, ly;
        if (s.labelAt === 'start') { lx = X(s.x1); ly = Y(s.y1); ctx.textAlign = 'left'; }
        else if (s.labelAt === 'mid') { lx = X((s.x1 + s.x2) / 2); ly = Y((s.y1 + s.y2) / 2); ctx.textAlign = 'center'; }
        else { lx = X(s.x2); ly = Y(s.y2); ctx.textAlign = 'right'; }
        ctx.fillText(s.label, lx, ly - 10);
      }
    });

    // ---- 마커 (화살표+텍스트) ----
    (spec.markers || []).forEach(m => {
      const i = m.i;
      const c = candles[Math.round(i)] || { h: (yMin + yMax) / 2, l: (yMin + yMax) / 2 };
      const col = m.color || COLOR.ink2;
      ctx.fillStyle = col;
      ctx.font = FONT_BOLD;
      ctx.textAlign = 'center';
      if (m.dir === 'down') {
        // 캔들 위쪽에 표시, 아래 방향 지시
        const y = Y(c.h) - 8;
        ctx.beginPath();
        ctx.moveTo(X(i), y);
        ctx.lineTo(X(i) - 4.5, y - 7);
        ctx.lineTo(X(i) + 4.5, y - 7);
        ctx.closePath();
        ctx.fill();
        ctx.fillText(m.text, X(i), y - 15);
      } else {
        const y = Y(c.l) + 8;
        ctx.beginPath();
        ctx.moveTo(X(i), y);
        ctx.lineTo(X(i) - 4.5, y + 7);
        ctx.lineTo(X(i) + 4.5, y + 7);
        ctx.closePath();
        ctx.fill();
        ctx.fillText(m.text, X(i), y + 21);
      }
    });

    // ---- 자유 라벨 ----
    (spec.labels || []).forEach(L => {
      ctx.font = L.bold === false ? FONT : FONT_BOLD;
      ctx.fillStyle = L.color || COLOR.ink2;
      ctx.textAlign = L.align || 'center';
      ctx.fillText(L.text, X(L.i), Y(L.y));
    });

    // ---- 범례 ----
    if (spec.legend && spec.legend.length) {
      ctx.font = FONT;
      let lx = main.x + 6;
      const ly = main.y + 6;
      spec.legend.forEach(item => {
        ctx.fillStyle = item.color;
        ctx.fillRect(lx, ly - 4, 14, 3);
        ctx.fillStyle = COLOR.ink2;
        ctx.textAlign = 'left';
        ctx.fillText(item.name, lx + 18, ly - 2);
        lx += 18 + ctx.measureText(item.name).width + 16;
      });
    }

    // ---- 거래량 창 ----
    if (volPane) {
      const vals = spec.volume.values;
      const vMax = Math.max(...vals) * 1.1;
      ctx.strokeStyle = COLOR.grid;
      ctx.lineWidth = 1;
      ctx.strokeRect(volPane.x + 0.5, volPane.y + 0.5, volPane.w, volPane.h);
      vals.forEach((v, i) => {
        const c = candles[i];
        const isUp = c ? c.c >= c.o : true;
        const bh = volPane.h * (v / vMax);
        ctx.fillStyle = isUp ? 'rgba(217,64,64,0.55)' : 'rgba(42,120,214,0.55)';
        ctx.fillRect(X(i) - bodyW / 2, volPane.y + volPane.h - bh, bodyW, bh);
      });
      ctx.font = FONT;
      ctx.fillStyle = COLOR.muted;
      ctx.textAlign = 'left';
      ctx.fillText('거래량', volPane.x + 4, volPane.y + 10);
      (spec.volume.markers || []).forEach(m => {
        ctx.font = FONT_BOLD;
        ctx.fillStyle = m.color || COLOR.ink2;
        ctx.textAlign = 'center';
        ctx.fillText(m.text, X(m.i), volPane.y - 3);
      });
    }

    // ---- 보조지표 창 ----
    if (subPane) {
      const sub = spec.sub;
      let sLo = Infinity, sHi = -Infinity;
      (sub.lines || []).forEach(L => L.values.forEach(v => { if (v != null && isFinite(v)) { sLo = Math.min(sLo, v); sHi = Math.max(sHi, v); } }));
      if (sub.bars) sub.bars.values.forEach(v => { if (v != null) { sLo = Math.min(sLo, v, 0); sHi = Math.max(sHi, v, 0); } });
      (sub.hlines || []).forEach(h => { sLo = Math.min(sLo, h.y); sHi = Math.max(sHi, h.y); });
      if (sub.range) { sLo = sub.range[0]; sHi = sub.range[1]; }
      if (!isFinite(sLo)) { sLo = 0; sHi = 1; }
      const [sMin, sMax] = sub.range ? [sLo, sHi] : niceRange(sLo, sHi, 0.12);
      const SY = v => subPane.y + subPane.h * (1 - (v - sMin) / (sMax - sMin));

      ctx.strokeStyle = COLOR.grid;
      ctx.lineWidth = 1;
      ctx.strokeRect(subPane.x + 0.5, subPane.y + 0.5, subPane.w, subPane.h);

      (sub.hlines || []).forEach(h => {
        ctx.strokeStyle = h.color || COLOR.axis;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(subPane.x, SY(h.y));
        ctx.lineTo(subPane.x + subPane.w, SY(h.y));
        ctx.stroke();
        ctx.setLineDash([]);
        if (h.label != null) {
          ctx.font = FONT;
          ctx.fillStyle = COLOR.muted;
          ctx.textAlign = 'left';
          ctx.fillText(h.label, subPane.x + subPane.w + 6, SY(h.y));
        }
      });

      if (sub.bars) {
        sub.bars.values.forEach((v, i) => {
          if (v == null) return;
          const y0 = SY(0), y1 = SY(v);
          ctx.fillStyle = v >= 0 ? 'rgba(217,64,64,0.5)' : 'rgba(42,120,214,0.5)';
          ctx.fillRect(X(i) - bodyW / 2, Math.min(y0, y1), bodyW, Math.max(Math.abs(y1 - y0), 0.5));
        });
      }

      (sub.lines || []).forEach(L => {
        ctx.strokeStyle = L.color;
        ctx.lineWidth = L.width || 1.8;
        ctx.setLineDash(L.dash || []);
        ctx.beginPath();
        let started = false;
        L.values.forEach((v, i) => {
          if (v == null || !isFinite(v)) return;
          if (!started) { ctx.moveTo(X(i), SY(v)); started = true; }
          else ctx.lineTo(X(i), SY(v));
        });
        ctx.stroke();
        ctx.setLineDash([]);
      });

      if (sub.name) {
        ctx.font = FONT_BOLD;
        ctx.fillStyle = COLOR.ink2;
        ctx.textAlign = 'left';
        ctx.fillText(sub.name, subPane.x + 4, subPane.y + 11);
      }
      // 보조지표 창 범례
      if (sub.legend && sub.legend.length) {
        ctx.font = FONT;
        let lx = subPane.x + subPane.w - 6;
        [...sub.legend].reverse().forEach(item => {
          ctx.textAlign = 'right';
          ctx.fillStyle = COLOR.ink2;
          ctx.fillText(item.name, lx, subPane.y + 11);
          const tw = ctx.measureText(item.name).width;
          ctx.fillStyle = item.color;
          ctx.fillRect(lx - tw - 18, subPane.y + 7, 14, 3);
          lx -= tw + 26;
        });
      }
    }
  }

  window.StockChart = { draw, COLOR };
})();

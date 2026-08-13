/* ===== 탭 전환 + 데모 차트 초기화 ===== */
(function () {
  'use strict';

  // key → {canvas, spec, drawn}
  const demos = new Map();

  function initDemos() {
    document.querySelectorAll('.demo[data-demo]').forEach(el => {
      const key = el.dataset.demo;
      const canvas = el.querySelector('canvas');
      if (!canvas || !window.PatternLib.has(key)) return;
      const state = { canvas, spec: null };
      demos.set(el, state);

      const regen = el.querySelector('.regen');
      if (regen) {
        regen.addEventListener('click', () => {
          state.spec = window.PatternLib.generate(key);
          window.StockChart.draw(canvas, state.spec);
        });
      }
      el.dataset.key = key;
    });
  }

  /** 보이는 패널의 데모를 (최초 1회 생성 후) 그리기 */
  function drawVisible() {
    const panel = document.querySelector('.panel.active');
    if (!panel) return;
    panel.querySelectorAll('.demo[data-demo]').forEach(el => {
      const state = demos.get(el);
      if (!state) return;
      if (!state.spec) state.spec = window.PatternLib.generate(el.dataset.key);
      window.StockChart.draw(state.canvas, state.spec);
    });
    if (panel.id === 'panel-quiz' && window.Quiz) window.Quiz.start();
  }

  function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        const panel = document.getElementById('panel-' + tab.dataset.tab);
        if (panel) panel.classList.add('active');
        window.scrollTo({ top: 0 });
        drawVisible();
      });
    });
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawVisible, 150);
  });

  document.addEventListener('DOMContentLoaded', () => {
    initDemos();
    initTabs();
    drawVisible();
  });
})();

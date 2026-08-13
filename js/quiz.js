/* ===== 패턴 퀴즈 =====
 * 정답 주석을 가린 차트를 보여주고, 답을 고르면 주석이 표시된 원래 차트를 공개한다.
 */
(function () {
  'use strict';

  const POOL = [
    // 반전형
    { key: 'headShoulders', name: '헤드앤숄더형 (삼봉천장형)', cat: 'rev', explain: '세 봉우리 중 가운데(머리)가 가장 높고, 목선을 하향 이탈하면 하락 반전이 완성됩니다.' },
    { key: 'invHeadShoulders', name: '역헤드앤숄더형 (삼봉바닥형)', cat: 'rev', explain: '헤드앤숄더를 뒤집은 모양. 목선을 상향 돌파하면 상승 반전이 완성됩니다.' },
    { key: 'doubleTop', name: '이중천장형 (쌍봉)', cat: 'rev', explain: '비슷한 높이의 봉우리 2개(M자). 목선 이탈 시 하락 반전.' },
    { key: 'doubleBottom', name: '이중바닥형 (쌍바닥)', cat: 'rev', explain: '비슷한 깊이의 바닥 2개(W자). 목선 돌파 시 상승 반전.' },
    { key: 'roundTop', name: '원형천장형', cat: 'rev', explain: '완만한 반원을 그리며 서서히 하락으로 전환하는 패턴입니다.' },
    { key: 'roundBottom', name: '원형바닥형', cat: 'rev', explain: '바닥을 완만하게 다지고 서서히 상승으로 전환하는 패턴입니다.' },
    { key: 'vTop', name: 'V자 천장형', cat: 'rev', explain: '급등 직후 급락. 예고 없이 순식간에 반전되어 예측이 가장 어렵습니다.' },
    { key: 'vBottom', name: 'V자 바닥형', cat: 'rev', explain: '급락 직후 급반등하는 패턴입니다.' },
    // 지속형
    { key: 'symTriangle', name: '대칭삼각형', cat: 'cont', explain: '고점은 낮아지고 저점은 높아지며 수렴한 뒤, 기존 추세 방향으로 돌파합니다.' },
    { key: 'ascTriangle', name: '상승삼각형', cat: 'cont', explain: '고점은 수평(저항), 저점은 상승. 매수세가 강해져 상향 돌파 가능성이 높습니다.' },
    { key: 'descTriangle', name: '하락삼각형', cat: 'cont', explain: '저점은 수평(지지), 고점은 하락. 매도세 우위로 하향 이탈 가능성이 높습니다.' },
    { key: 'rectangle', name: '직사각형 (박스권)', cat: 'cont', explain: '수평 지지선과 저항선 사이를 오가다 돌파 방향으로 진행합니다.' },
    { key: 'flag', name: '깃발형', cat: 'cont', explain: '급등(깃대) 후 추세 반대로 살짝 기운 평행 채널로 조정하는 지속형 패턴입니다.' },
    { key: 'pennant', name: '페넌트형', cat: 'cont', explain: '급등(깃대) 후 작은 삼각형으로 수렴하는 지속형 패턴입니다.' },
    { key: 'wedgeFalling', name: '하락쐐기형', cat: 'cont', explain: '두 추세선이 모두 아래로 향하며 수렴. 하락 힘이 약해져 상향 돌파(강세)가 기대됩니다.' },
    { key: 'wedgeRising', name: '상승쐐기형', cat: 'cont', explain: '두 추세선이 모두 위로 향하며 수렴. 상승 힘이 약해져 하향 이탈(약세) 가능성이 있습니다.' },
    // 이동평균선
    { key: 'goldenCross', name: '골든 크로스', cat: 'ma', explain: '단기 이평선이 장기 이평선을 아래에서 위로 돌파 — 매수 신호입니다.' },
    { key: 'deadCross', name: '데드 크로스', cat: 'ma', explain: '단기 이평선이 장기 이평선을 위에서 아래로 하향 돌파 — 매도 신호입니다.' },
    // 캔들
    { key: 'hammer', name: '망치형', cat: 'candle', explain: '하락 추세 끝의 긴 아래꼬리 캔들 — 상승 반전 신호. (상승 추세 끝이면 교수형)' },
    { key: 'shootingStar', name: '유성형', cat: 'candle', explain: '상승 추세 끝의 긴 위꼬리 캔들 — 하락 반전 신호.' },
    { key: 'bullEngulf', name: '상승장악형', cat: 'candle', explain: '큰 양봉이 전날 음봉의 몸통을 완전히 감싸는 상승 반전 패턴입니다.' },
    { key: 'bearEngulf', name: '하락장악형', cat: 'candle', explain: '큰 음봉이 전날 양봉의 몸통을 완전히 감싸는 하락 반전 패턴입니다.' },
    { key: 'morningStar', name: '샛별형', cat: 'candle', explain: '장대음봉 → 작은 별 → 장대양봉. 바닥에서 나타나는 상승 반전 3봉 패턴입니다.' },
    { key: 'eveningStar', name: '석별형', cat: 'candle', explain: '장대양봉 → 작은 별 → 장대음봉. 천장에서 나타나는 하락 반전 3봉 패턴입니다.' },
    { key: 'threeWhite', name: '적삼병', cat: 'candle', explain: '연속 양봉 3개가 고점을 높여가는 본격 상승 개시 신호입니다.' },
    { key: 'threeBlack', name: '흑삼병', cat: 'candle', explain: '연속 음봉 3개가 저점을 낮춰가는 본격 하락 개시 신호입니다.' }
  ];

  const CAT_LABEL = { rev: '반전형 패턴', cont: '지속형 패턴', ma: '이동평균선', candle: '캔들 패턴' };

  let currentItem = null;
  let currentSpec = null;
  let answered = false;
  let qNum = 0, score = 0, streak = 0;
  let lastKey = null;

  const $ = id => document.getElementById(id);

  function maskedSpec(spec) {
    const m = Object.assign({}, spec);
    delete m.labels;
    delete m.markers;
    delete m.segments;
    delete m.hlines;
    if (m.volume) m.volume = { values: m.volume.values };
    return m;
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function nextQuestion() {
    answered = false;
    qNum++;
    // 직전 문제와 다른 패턴 선택
    let item;
    do { item = POOL[Math.floor(Math.random() * POOL.length)]; } while (item.key === lastKey);
    lastKey = item.key;
    currentItem = item;
    currentSpec = window.PatternLib.generate(item.key);

    $('quiz-progress').textContent = '문제 ' + qNum;
    $('quiz-question').textContent = `이 차트에 나타난 ${CAT_LABEL[item.cat]}은 무엇일까요?`;
    $('quiz-feedback').innerHTML = '';
    $('quiz-next').disabled = true;

    drawQuiz();

    // 같은 카테고리에서 오답 3개 선택
    const sameCat = POOL.filter(p => p.cat === item.cat && p.key !== item.key);
    const distractors = shuffle(sameCat).slice(0, Math.min(3, sameCat.length));
    // 카테고리 내 선택지가 부족하면 다른 카테고리에서 보충
    while (distractors.length < 3) {
      const others = POOL.filter(p => p.key !== item.key && !distractors.includes(p));
      distractors.push(others[Math.floor(Math.random() * others.length)]);
    }
    const choices = shuffle([item, ...distractors]);

    const box = $('quiz-choices');
    box.innerHTML = '';
    choices.forEach(ch => {
      const btn = document.createElement('button');
      btn.className = 'quiz-choice';
      btn.textContent = ch.name;
      btn.addEventListener('click', () => answer(btn, ch));
      box.appendChild(btn);
    });
  }

  function answer(btn, chosen) {
    if (answered) return;
    answered = true;
    const ok = chosen.key === currentItem.key;
    if (ok) { score += 10; streak++; }
    else { streak = 0; }

    document.querySelectorAll('.quiz-choice').forEach(b => {
      b.disabled = true;
      if (b.textContent === currentItem.name) b.classList.add('correct');
    });
    if (!ok) btn.classList.add('wrong');

    $('quiz-score').textContent = '점수 ' + score;
    $('quiz-streak').textContent = streak >= 2 ? `🔥 ${streak}연속 정답!` : '';
    $('quiz-feedback').innerHTML =
      `<span class="fb-title ${ok ? 'ok' : 'no'}">${ok ? '⭕ 정답!' : '❌ 오답 — 정답은 「' + currentItem.name + '」'}</span><br>` +
      currentItem.explain;
    $('quiz-next').disabled = false;

    // 주석이 표시된 원래 차트 공개
    const canvas = $('quiz-canvas');
    window.StockChart.draw(canvas, currentSpec);
  }

  function drawQuiz() {
    const canvas = $('quiz-canvas');
    if (!canvas || !currentSpec) return;
    window.StockChart.draw(canvas, answered ? currentSpec : maskedSpec(currentSpec));
  }

  function reset() {
    qNum = 0; score = 0; streak = 0; lastKey = null;
    $('quiz-score').textContent = '점수 0';
    $('quiz-streak').textContent = '';
    nextQuestion();
  }

  window.Quiz = {
    start() { if (qNum === 0) nextQuestion(); else drawQuiz(); },
    redraw: drawQuiz
  };

  document.addEventListener('DOMContentLoaded', () => {
    $('quiz-next').addEventListener('click', nextQuestion);
    $('quiz-reset').addEventListener('click', reset);
  });
})();

/* ===== 패턴 데이터 생성기 =====
 * PatternLib.generate(key, {quiz:true}) → StockChart용 spec
 * quiz 모드에서는 정답을 알려주는 주석(라벨·마커·보조선)을 제거한다.
 */
(function () {
  'use strict';

  const C = window.StockChart.COLOR;
  const SHORT = '#eb6834';   // 단기 이평선
  const MID = '#1baf7a';     // 중기 이평선
  const LONG = '#4a3aa7';    // 장기 이평선
  const ANNO = '#52514e';    // 주석선
  const HL_UP = '#b8322f';   // 강조(하락 경고)
  const HL_DN = '#1c5cab';   // 강조(상승 신호)

  // ---------- 유틸 ----------
  const R = (a, b) => a + Math.random() * (b - a);

  /** 웨이포인트 [t(0~1), price] 배열에 랜덤 변형을 가함 */
  function jitter(wps, amt) {
    return wps.map(([t, p]) => [t, p + R(-amt, amt)]);
  }

  /** 웨이포인트를 코사인 보간으로 n개 포인트 경로로 변환 (경로는 웨이포인트를 정확히 통과) */
  function pathFrom(wps, n, noise) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      let j = 0;
      while (j < wps.length - 2 && wps[j + 1][0] < t) j++;
      const [t0, p0] = wps[j], [t1, p1] = wps[j + 1];
      const u = Math.min(Math.max((t - t0) / Math.max(t1 - t0, 1e-9), 0), 1);
      const s = (1 - Math.cos(Math.PI * u)) / 2;
      const onWp = wps.some(([wt]) => Math.abs(wt - t) < 0.5 / n);
      pts.push(p0 + (p1 - p0) * s + (onWp ? 0 : R(-noise, noise)));
    }
    return pts;
  }

  /** 경로(종가열) → 캔들 배열 */
  function toCandles(path, wig) {
    const out = [];
    let prev = path[0];
    for (let i = 0; i < path.length; i++) {
      const c = path[i];
      const o = i === 0 ? c + R(-wig, wig) * 0.5 : prev + R(-wig, wig) * 0.35;
      const h = Math.max(o, c) + R(0.1, 1) * wig * 0.8;
      const l = Math.min(o, c) - R(0.1, 1) * wig * 0.8;
      out.push({ o, h, l, c });
      prev = c;
    }
    return out;
  }

  /** t(0~1) → 캔들 인덱스 */
  const ti = (t, n) => t * (n - 1);

  /** 단일 캔들 생성 도우미 */
  const K = (o, c, up, dn) => ({ o, c, h: Math.max(o, c) + up, l: Math.min(o, c) - dn });

  /** 방향성 있는 캔들 나열 (하나씩 step만큼 이동) */
  function drift(start, step, k, wig) {
    const out = [];
    let px = start;
    for (let i = 0; i < k; i++) {
      const c = px + step + R(-wig, wig);
      out.push(K(px + R(-wig, wig) * 0.3, c, R(0.2, 1) * wig, R(0.2, 1) * wig));
      px = c;
    }
    return out;
  }

  const closes = candles => candles.map(c => c.c);

  function sma(vals, k) {
    const out = new Array(vals.length).fill(null);
    let sum = 0;
    for (let i = 0; i < vals.length; i++) {
      sum += vals[i];
      if (i >= k) sum -= vals[i - k];
      if (i >= k - 1) out[i] = sum / k;
    }
    return out;
  }

  function ema(vals, k) {
    const out = new Array(vals.length).fill(null);
    const a = 2 / (k + 1);
    let prev = vals[0];
    for (let i = 0; i < vals.length; i++) {
      prev = i === 0 ? vals[0] : vals[i] * a + prev * (1 - a);
      if (i >= k - 1) out[i] = prev;
    }
    return out;
  }

  function rollingStd(vals, k) {
    const out = new Array(vals.length).fill(null);
    for (let i = k - 1; i < vals.length; i++) {
      let m = 0;
      for (let j = i - k + 1; j <= i; j++) m += vals[j];
      m /= k;
      let v = 0;
      for (let j = i - k + 1; j <= i; j++) v += (vals[j] - m) ** 2;
      out[i] = Math.sqrt(v / k);
    }
    return out;
  }

  function calcRSI(vals, k) {
    const out = new Array(vals.length).fill(null);
    let up = 0, dn = 0;
    for (let i = 1; i < vals.length; i++) {
      const d = vals[i] - vals[i - 1];
      const u = Math.max(d, 0), w = Math.max(-d, 0);
      if (i <= k) { up += u / k; dn += w / k; }
      else { up = (up * (k - 1) + u) / k; dn = (dn * (k - 1) + w) / k; }
      if (i >= k) out[i] = dn === 0 ? 100 : 100 - 100 / (1 + up / dn);
    }
    return out;
  }

  /** 단기·장기 이평선의 교차 인덱스 탐색 */
  function findCross(fast, slow, dirUp) {
    for (let i = 1; i < fast.length; i++) {
      if (fast[i] == null || slow[i] == null || fast[i - 1] == null || slow[i - 1] == null) continue;
      if (dirUp && fast[i - 1] <= slow[i - 1] && fast[i] > slow[i]) return i;
      if (!dirUp && fast[i - 1] >= slow[i - 1] && fast[i] < slow[i]) return i;
    }
    return -1;
  }

  // ---------- 생성기 ----------
  const GENS = {};

  // ===== 1. 개요 =====
  GENS.dowPhases = () => {
    const wps = jitter([
      [0, 100], [0.16, 105], [0.34, 140], [0.46, 172], [0.58, 176],
      [0.66, 162], [0.78, 128], [0.9, 110], [1, 106]
    ], 3);
    const n = 90;
    const path = pathFrom(wps, n, 2.2);
    return {
      candles: toCandles(path, 2),
      labels: [
        { i: ti(0.08, n), y: 90, text: '① 매집', color: HL_DN },
        { i: ti(0.3, n), y: 155, text: '② 상승', color: HL_DN },
        { i: ti(0.52, n), y: 190, text: '③ 과열 / ① 분산', color: ANNO },
        { i: ti(0.72, n), y: 155, text: '② 공포', color: HL_UP },
        { i: ti(0.93, n), y: 93, text: '③ 침체', color: HL_UP }
      ],
      segments: [
        { x1: ti(0.58, n), y1: 88, x2: ti(0.58, n), y2: 192, color: '#c3c2b7', dash: [4, 4], width: 1 }
      ],
      yPad: 0.16
    };
  };

  // ===== 2. 캔들 =====
  GENS.candleAnatomy = () => {
    const up = K(100, 140, 12, 12);
    const dn = K(140, 100, 12, 12);
    return {
      candles: [up, dn],
      labels: [
        { i: 0.14, y: 152, text: '고가', align: 'left' },
        { i: 0.14, y: 140, text: '종가', align: 'left', color: C.up },
        { i: 0.14, y: 100, text: '시가', align: 'left', color: C.up },
        { i: 0.14, y: 88, text: '저가', align: 'left' },
        { i: -0.14, y: 146, text: '위꼬리', align: 'right', color: '#898781' },
        { i: -0.14, y: 120, text: '몸통', align: 'right', color: '#898781' },
        { i: -0.14, y: 94, text: '아래꼬리', align: 'right', color: '#898781' },
        { i: 0, y: 163, text: '양봉 (종가 > 시가)', color: C.up },
        { i: 1, y: 163, text: '음봉 (종가 < 시가)', color: C.dn },
        { i: 0.86, y: 140, text: '시가', align: 'right', color: C.dn },
        { i: 0.86, y: 100, text: '종가', align: 'right', color: C.dn }
      ],
      yPad: 0.2
    };
  };

  /** 단일·복합 캔들 패턴 공통 골격: 앞추세 + 패턴 + 확인 캔들 */
  function candleScene(pre, pattern, post, marks, quiz) {
    const candles = [...pre, ...pattern, ...post];
    const spec = { candles, yPad: 0.18 };
    if (!quiz) spec.markers = marks(pre.length);
    return spec;
  }

  GENS.hammer = (quiz) => {
    const pre = drift(132, -6, 6, 1.6);
    const base = pre[pre.length - 1].c;
    const body = R(1, 3);
    const ham = K(base - 3, base - 3 + body, R(0.3, 1), R(9, 13));
    const post = drift(ham.c + 2, 5, 2, 1.4);
    return candleScene(pre, [ham], post, p => [{ i: p, text: '망치형', dir: 'up', color: HL_DN }], quiz);
  };

  GENS.hangingMan = (quiz) => {
    const pre = drift(96, 6, 6, 1.6);
    const base = pre[pre.length - 1].c;
    const body = R(1, 3);
    const man = K(base + 3, base + 3 - body, R(0.3, 1), R(9, 13));
    const post = drift(man.c - 2, -5, 2, 1.4);
    return candleScene(pre, [man], post, p => [{ i: p, text: '교수형', dir: 'down', color: HL_UP }], quiz);
  };

  GENS.shootingStar = (quiz) => {
    const pre = drift(96, 6, 6, 1.6);
    const base = pre[pre.length - 1].c;
    const body = R(1, 3);
    const star = K(base + 3, base + 3 - body, R(9, 13), R(0.3, 1));
    const post = drift(star.c - 2, -5, 2, 1.4);
    return candleScene(pre, [star], post, p => [{ i: p, text: '유성형', dir: 'down', color: HL_UP }], quiz);
  };

  GENS.doji = (quiz) => {
    const pre = drift(98, 5.5, 6, 1.6);
    const base = pre[pre.length - 1].c;
    const dj = K(base + 2, base + 2 + R(-0.4, 0.4), R(4, 7), R(4, 7));
    const post = drift(dj.c - 2, -4.5, 2, 1.4);
    return candleScene(pre, [dj], post, p => [{ i: p, text: '십자형(도지)', dir: 'down', color: ANNO }], quiz);
  };

  GENS.bullEngulf = (quiz) => {
    const pre = drift(130, -5.5, 5, 1.5);
    const base = pre[pre.length - 1].c;
    const small = K(base, base - R(2, 3.5), 1, 1);
    const big = K(small.c - R(1, 2), small.o + R(3, 5), 1.5, 1.5);
    const post = drift(big.c + 2, 5, 2, 1.4);
    return candleScene(pre, [small, big], post,
      p => [{ i: p + 1, text: '상승장악형', dir: 'up', color: HL_DN }], quiz);
  };

  GENS.bearEngulf = (quiz) => {
    const pre = drift(94, 5.5, 5, 1.5);
    const base = pre[pre.length - 1].c;
    const small = K(base, base + R(2, 3.5), 1, 1);
    const big = K(small.c + R(1, 2), small.o - R(3, 5), 1.5, 1.5);
    const post = drift(big.c - 2, -5, 2, 1.4);
    return candleScene(pre, [small, big], post,
      p => [{ i: p + 1, text: '하락장악형', dir: 'down', color: HL_UP }], quiz);
  };

  GENS.morningStar = (quiz) => {
    const pre = drift(134, -5.5, 5, 1.5);
    const base = pre[pre.length - 1].c;
    const black = K(base, base - R(7, 9), 1, 1);
    const star = K(black.c - R(2, 3), black.c - R(2, 3) + R(-1.2, 1.2), 1.5, 1.5);
    const white = K(star.c + R(1.5, 2.5), base - R(0.5, 2), 1.5, 1);
    const post = drift(white.c + 2.5, 5, 2, 1.4);
    return candleScene(pre, [black, star, white], post,
      p => [{ i: p + 1, text: '샛별형', dir: 'up', color: HL_DN }], quiz);
  };

  GENS.eveningStar = (quiz) => {
    const pre = drift(92, 5.5, 5, 1.5);
    const base = pre[pre.length - 1].c;
    const white = K(base, base + R(7, 9), 1, 1);
    const star = K(white.c + R(2, 3), white.c + R(2, 3) + R(-1.2, 1.2), 1.5, 1.5);
    const black = K(star.c - R(1.5, 2.5), base + R(0.5, 2), 1, 1.5);
    const post = drift(black.c - 2.5, -5, 2, 1.4);
    return candleScene(pre, [white, star, black], post,
      p => [{ i: p + 1, text: '석별형', dir: 'down', color: HL_UP }], quiz);
  };

  GENS.threeWhite = (quiz) => {
    const pre = drift(108, -2, 5, 1.8);
    const base = pre[pre.length - 1].c;
    const w1 = K(base, base + R(5, 7), 1, 0.8);
    const w2 = K(w1.c - R(0.5, 1.5), w1.c + R(5, 7), 1, 0.8);
    const w3 = K(w2.c - R(0.5, 1.5), w2.c + R(5, 7), 1, 0.8);
    const post = drift(w3.c + 2, 3.5, 2, 1.5);
    return candleScene(pre, [w1, w2, w3], post,
      p => [{ i: p + 1, text: '적삼병', dir: 'up', color: HL_DN }], quiz);
  };

  GENS.threeBlack = (quiz) => {
    const pre = drift(96, 2, 5, 1.8);
    const base = pre[pre.length - 1].c;
    const b1 = K(base, base - R(5, 7), 0.8, 1);
    const b2 = K(b1.c + R(0.5, 1.5), b1.c - R(5, 7), 0.8, 1);
    const b3 = K(b2.c + R(0.5, 1.5), b2.c - R(5, 7), 0.8, 1);
    const post = drift(b3.c - 2, -3.5, 2, 1.5);
    return candleScene(pre, [b1, b2, b3], post,
      p => [{ i: p + 1, text: '흑삼병', dir: 'down', color: HL_UP }], quiz);
  };

  // ===== 3. 추세 =====
  GENS.uptrend = (quiz) => {
    const n = 55;
    const slope = R(0.75, 1.0), amp = R(6.5, 8.5), period = 16;
    const path = [];
    for (let i = 0; i < n; i++) {
      path.push(100 + slope * i - amp * Math.cos(2 * Math.PI * (i - 6) / period) + R(-1.2, 1.2));
    }
    const lineY = i => 100 + slope * i - amp;
    const spec = { candles: toCandles(path, 1.6) };
    if (!quiz) {
      spec.segments = [{ x1: 1, y1: lineY(1) - 1.5, x2: n - 2, y2: lineY(n - 2) - 1.5, color: HL_DN, width: 2, label: '상승 추세선 (저점 연결)', labelAt: 'mid' }];
      spec.markers = [6, 6 + period, 6 + period * 2].filter(i => i < n - 3)
        .map(i => ({ i, text: '지지', dir: 'up', color: HL_DN }));
    }
    return spec;
  };

  GENS.downtrend = (quiz) => {
    const n = 55;
    const slope = R(0.75, 1.0), amp = R(6.5, 8.5), period = 16;
    const path = [];
    for (let i = 0; i < n; i++) {
      path.push(160 - slope * i + amp * Math.cos(2 * Math.PI * (i - 6) / period) + R(-1.2, 1.2));
    }
    const lineY = i => 160 - slope * i + amp;
    const spec = { candles: toCandles(path, 1.6) };
    if (!quiz) {
      spec.segments = [{ x1: 1, y1: lineY(1) + 1.5, x2: n - 2, y2: lineY(n - 2) + 1.5, color: HL_UP, width: 2, label: '하락 추세선 (고점 연결)', labelAt: 'mid' }];
      spec.markers = [6, 6 + period, 6 + period * 2].filter(i => i < n - 3)
        .map(i => ({ i, text: '저항', dir: 'down', color: HL_UP }));
    }
    return spec;
  };

  GENS.supportResistance = (quiz) => {
    const n = 60;
    const sup = 100, res = 122;
    const wps = jitter([
      [0, 103], [0.1, res - 1], [0.2, sup + 1], [0.32, res - 2], [0.44, sup + 1.5],
      [0.56, res - 1], [0.66, sup + 2], [0.74, res + 2], [0.85, 138], [1, 148]
    ], 1.2);
    const path = pathFrom(wps, n, 1.6);
    const vols = path.map((p, i) => {
      const t = i / (n - 1);
      return (t > 0.72 && t < 0.84 ? R(2.4, 3.2) : R(0.7, 1.2));
    });
    const spec = { candles: toCandles(path, 1.6), volume: { values: vols } };
    if (!quiz) {
      spec.hlines = [
        { y: res, color: HL_UP, label: '저항선' },
        { y: sup, color: HL_DN, label: '지지선' }
      ];
      spec.markers = [{ i: ti(0.76, n), text: '돌파!', dir: 'up', color: HL_DN }];
      spec.volume.markers = [{ i: ti(0.78, n), text: '거래량 급증', color: ANNO }];
    }
    return spec;
  };

  GENS.roleReversal = (quiz) => {
    const n = 65;
    const lvl = 120;
    const wps = jitter([
      [0, 104], [0.12, lvl - 2], [0.24, 106], [0.36, lvl - 1], [0.46, 110],
      [0.56, lvl + 12], [0.68, lvl + 1], [0.8, lvl + 14], [1, lvl + 24]
    ], 1.2);
    const path = pathFrom(wps, n, 1.5);
    const spec = { candles: toCandles(path, 1.5) };
    if (!quiz) {
      spec.hlines = [{ y: lvl, color: ANNO, label: '저항선 → 돌파 후 지지선' }];
      spec.markers = [
        { i: ti(0.5, n), text: '돌파', dir: 'up', color: HL_DN },
        { i: ti(0.68, n), text: '되돌림 후 지지 확인', dir: 'up', color: HL_DN }
      ];
    }
    return spec;
  };

  // ===== 4. 이동평균선 =====
  GENS.maBasic = () => {
    const n = 130;
    const ph = R(0, 6);
    const path = [];
    for (let i = 0; i < n; i++) {
      path.push(105 + 0.22 * i + 20 * Math.sin((i + ph) / 13) + R(-2.2, 2.2));
    }
    const candles = toCandles(path, 2);
    const cl = closes(candles);
    return {
      candles,
      lines: [
        { values: sma(cl, 5), color: SHORT, name: '5일' },
        { values: sma(cl, 20), color: MID, name: '20일' },
        { values: sma(cl, 60), color: LONG, name: '60일' }
      ],
      legend: [
        { name: '5일선', color: SHORT },
        { name: '20일선', color: MID },
        { name: '60일선', color: LONG }
      ]
    };
  };

  GENS.goldenCross = (quiz) => {
    const n = 85;
    const wps = jitter([[0, 138], [0.3, 104], [0.5, 98], [0.65, 108], [1, 145]], 3);
    const path = pathFrom(wps, n, 1.8);
    const candles = toCandles(path, 1.8);
    const cl = closes(candles);
    const f = sma(cl, 5), s = sma(cl, 20);
    const spec = {
      candles,
      lines: [
        { values: f, color: SHORT },
        { values: s, color: LONG }
      ],
      legend: [{ name: '단기(5일)', color: SHORT }, { name: '장기(20일)', color: LONG }]
    };
    const x = findCross(f, s, true);
    if (!quiz && x > 0) spec.markers = [{ i: x, text: '골든 크로스 (매수 신호)', dir: 'up', color: HL_DN }];
    return spec;
  };

  GENS.deadCross = (quiz) => {
    const n = 85;
    const wps = jitter([[0, 100], [0.3, 136], [0.5, 142], [0.65, 130], [1, 92]], 3);
    const path = pathFrom(wps, n, 1.8);
    const candles = toCandles(path, 1.8);
    const cl = closes(candles);
    const f = sma(cl, 5), s = sma(cl, 20);
    const spec = {
      candles,
      lines: [
        { values: f, color: SHORT },
        { values: s, color: LONG }
      ],
      legend: [{ name: '단기(5일)', color: SHORT }, { name: '장기(20일)', color: LONG }]
    };
    const x = findCross(f, s, false);
    if (!quiz && x > 0) spec.markers = [{ i: x, text: '데드 크로스 (매도 신호)', dir: 'down', color: HL_UP }];
    return spec;
  };

  // ===== 5. 반전형 =====
  GENS.headShoulders = (quiz) => {
    const n = 75;
    const neck = 105 + R(-3, 3);
    const ls = 118 + R(-2, 3), head = 136 + R(-2, 4), rs = 117 + R(-2, 3);
    const wps = [
      [0, 94], [0.13, ls], [0.22, neck], [0.36, head], [0.5, neck],
      [0.62, rs], [0.73, neck - 1], [0.85, 90], [1, 80]
    ];
    const path = pathFrom(wps, n, 1.7);
    const spec = { candles: toCandles(path, 1.7) };
    if (!quiz) {
      spec.segments = [{ x1: ti(0.16, n), y1: neck, x2: ti(0.82, n), y2: neck, color: ANNO, dash: [6, 4], width: 1.8, label: '목선 (Neckline)', labelAt: 'end' }];
      spec.labels = [
        { i: ti(0.13, n), y: ls + 7, text: '왼어깨' },
        { i: ti(0.36, n), y: head + 7, text: '머리' },
        { i: ti(0.62, n), y: rs + 7, text: '오른어깨' }
      ];
      spec.markers = [{ i: ti(0.75, n), text: '목선 이탈 → 하락', dir: 'down', color: HL_UP }];
    }
    return spec;
  };

  GENS.invHeadShoulders = (quiz) => {
    const n = 75;
    const neck = 115 + R(-3, 3);
    const ls = 102 + R(-3, 2), head = 84 + R(-4, 2), rs = 103 + R(-3, 2);
    const wps = [
      [0, 126], [0.13, ls], [0.22, neck], [0.36, head], [0.5, neck],
      [0.62, rs], [0.73, neck + 1], [0.85, 130], [1, 140]
    ];
    const path = pathFrom(wps, n, 1.7);
    const spec = { candles: toCandles(path, 1.7) };
    if (!quiz) {
      spec.segments = [{ x1: ti(0.16, n), y1: neck, x2: ti(0.82, n), y2: neck, color: ANNO, dash: [6, 4], width: 1.8, label: '목선', labelAt: 'end' }];
      spec.labels = [
        { i: ti(0.13, n), y: ls - 7, text: '왼어깨' },
        { i: ti(0.36, n), y: head - 7, text: '머리' },
        { i: ti(0.62, n), y: rs - 7, text: '오른어깨' }
      ];
      spec.markers = [{ i: ti(0.75, n), text: '목선 돌파 → 상승', dir: 'up', color: HL_DN }];
    }
    return spec;
  };

  GENS.doubleTop = (quiz) => {
    const n = 65;
    const peak = 126 + R(-2, 4), neck = 106 + R(-2, 2);
    const wps = [
      [0, 92], [0.18, peak], [0.34, neck], [0.5, peak + R(-2, 1)],
      [0.66, neck - 1], [0.82, 92], [1, 84]
    ];
    const path = pathFrom(wps, n, 1.6);
    const spec = { candles: toCandles(path, 1.6) };
    if (!quiz) {
      spec.segments = [{ x1: ti(0.28, n), y1: neck, x2: ti(0.78, n), y2: neck, color: ANNO, dash: [6, 4], width: 1.8, label: '목선', labelAt: 'end' }];
      spec.labels = [
        { i: ti(0.18, n), y: peak + 7, text: '봉우리 1' },
        { i: ti(0.5, n), y: peak + 7, text: '봉우리 2' }
      ];
      spec.markers = [{ i: ti(0.68, n), text: '목선 이탈', dir: 'down', color: HL_UP }];
    }
    return spec;
  };

  GENS.doubleBottom = (quiz) => {
    const n = 65;
    const bot = 88 + R(-4, 2), neck = 108 + R(-2, 2);
    const wps = [
      [0, 122], [0.18, bot], [0.34, neck], [0.5, bot + R(-1, 2)],
      [0.66, neck + 1], [0.82, 122], [1, 130]
    ];
    const path = pathFrom(wps, n, 1.6);
    const spec = { candles: toCandles(path, 1.6) };
    if (!quiz) {
      spec.segments = [{ x1: ti(0.28, n), y1: neck, x2: ti(0.78, n), y2: neck, color: ANNO, dash: [6, 4], width: 1.8, label: '목선', labelAt: 'end' }];
      spec.labels = [
        { i: ti(0.18, n), y: bot - 7, text: '바닥 1' },
        { i: ti(0.5, n), y: bot - 7, text: '바닥 2' }
      ];
      spec.markers = [{ i: ti(0.68, n), text: '목선 돌파', dir: 'up', color: HL_DN }];
    }
    return spec;
  };

  GENS.roundTop = (quiz) => {
    const n = 70;
    const base = 95 + R(-4, 4), amp = 34 + R(-4, 6);
    const path = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      path.push(base + amp * Math.pow(Math.sin(Math.PI * t), 0.75) + R(-1.4, 1.4));
    }
    const spec = { candles: toCandles(path, 1.5) };
    if (!quiz) spec.labels = [{ i: ti(0.5, n), y: base + amp + 8, text: '완만한 천장 (원형천장형)' }];
    return spec;
  };

  GENS.roundBottom = (quiz) => {
    const n = 70;
    const top = 130 + R(-4, 4), amp = 34 + R(-4, 6);
    const path = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      path.push(top - amp * Math.pow(Math.sin(Math.PI * t), 0.75) + R(-1.4, 1.4));
    }
    const spec = { candles: toCandles(path, 1.5) };
    if (!quiz) spec.labels = [{ i: ti(0.5, n), y: top - amp - 8, text: '완만한 바닥 (원형바닥형)' }];
    return spec;
  };

  GENS.vTop = (quiz) => {
    const n = 45;
    const apex = 148 + R(-4, 6);
    const wps = [[0, 96], [0.42, 130], [0.5, apex], [0.58, 128], [1, 90]];
    const path = pathFrom(wps, n, 1.4);
    const spec = { candles: toCandles(path, 1.6) };
    if (!quiz) spec.markers = [{ i: ti(0.5, n), text: '급반전 (V자 천장)', dir: 'down', color: HL_UP }];
    return spec;
  };

  GENS.vBottom = (quiz) => {
    const n = 45;
    const apex = 78 + R(-6, 4);
    const wps = [[0, 130], [0.42, 96], [0.5, apex], [0.58, 98], [1, 136]];
    const path = pathFrom(wps, n, 1.4);
    const spec = { candles: toCandles(path, 1.6) };
    if (!quiz) spec.markers = [{ i: ti(0.5, n), text: '급반전 (V자 바닥)', dir: 'up', color: HL_DN }];
    return spec;
  };

  // ===== 6. 지속형 =====
  GENS.symTriangle = (quiz) => {
    const n = 70;
    const mid = 118;
    const h1 = mid + 13, h2 = mid + 8, h3 = mid + 4;
    const l1 = mid - 12, l2 = mid - 7, l3 = mid - 3;
    const wps = jitter([
      [0, 94], [0.2, h1], [0.28, l1], [0.38, h2], [0.48, l2],
      [0.58, h3], [0.66, l3], [0.74, mid + 1], [0.82, mid + 14], [1, 146]
    ], 1);
    const path = pathFrom(wps, n, 1.2);
    const spec = { candles: toCandles(path, 1.3) };
    if (!quiz) {
      spec.segments = [
        { x1: ti(0.2, n), y1: h1 + 1.5, x2: ti(0.76, n), y2: mid + 1.5, color: ANNO, width: 1.6 },
        { x1: ti(0.28, n), y1: l1 - 1.5, x2: ti(0.76, n), y2: mid - 1.5, color: ANNO, width: 1.6 }
      ];
      spec.markers = [{ i: ti(0.82, n), text: '수렴 후 돌파', dir: 'up', color: HL_DN }];
    }
    return spec;
  };

  GENS.ascTriangle = (quiz) => {
    const n = 70;
    const res = 126 + R(-2, 2);
    const l1 = 104, l2 = 111, l3 = 117;
    const wps = jitter([
      [0, 96], [0.18, res - 1], [0.28, l1], [0.4, res - 1], [0.52, l2],
      [0.64, res - 1], [0.72, l3], [0.8, res + 4], [1, 148]
    ], 1);
    const path = pathFrom(wps, n, 1.2);
    const spec = { candles: toCandles(path, 1.3) };
    if (!quiz) {
      spec.segments = [
        { x1: ti(0.15, n), y1: res + 1, x2: ti(0.78, n), y2: res + 1, color: HL_UP, width: 1.6, label: '수평 저항', labelAt: 'start' },
        { x1: ti(0.28, n), y1: l1 - 1.5, x2: ti(0.76, n), y2: l3 + 2, color: HL_DN, width: 1.6, label: '저점 상승', labelAt: 'mid' }
      ];
      spec.markers = [{ i: ti(0.8, n), text: '상향 돌파', dir: 'up', color: HL_DN }];
    }
    return spec;
  };

  GENS.descTriangle = (quiz) => {
    const n = 70;
    const sup = 100 + R(-2, 2);
    const h1 = 124, h2 = 117, h3 = 110;
    const wps = jitter([
      [0, 130], [0.18, sup + 1], [0.28, h1], [0.4, sup + 1], [0.52, h2],
      [0.64, sup + 1], [0.72, h3], [0.8, sup - 4], [1, 80]
    ], 1);
    const path = pathFrom(wps, n, 1.2);
    const spec = { candles: toCandles(path, 1.3) };
    if (!quiz) {
      spec.segments = [
        { x1: ti(0.15, n), y1: sup - 1, x2: ti(0.78, n), y2: sup - 1, color: HL_DN, width: 1.6, label: '수평 지지', labelAt: 'start' },
        { x1: ti(0.28, n), y1: h1 + 1.5, x2: ti(0.76, n), y2: h3 - 2, color: HL_UP, width: 1.6, label: '고점 하락', labelAt: 'mid' }
      ];
      spec.markers = [{ i: ti(0.8, n), text: '하향 이탈', dir: 'down', color: HL_UP }];
    }
    return spec;
  };

  GENS.rectangle = (quiz) => {
    const n = 70;
    const sup = 104, res = 124;
    const wps = jitter([
      [0, sup + 3], [0.12, res - 1], [0.24, sup + 1], [0.36, res - 1], [0.48, sup + 1],
      [0.6, res - 1], [0.7, sup + 2], [0.78, res + 4], [1, 150]
    ], 1);
    const path = pathFrom(wps, n, 1.3);
    const spec = { candles: toCandles(path, 1.4) };
    if (!quiz) {
      spec.segments = [
        { x1: 0, y1: res + 1, x2: ti(0.78, n), y2: res + 1, color: HL_UP, width: 1.6, label: '저항선', labelAt: 'start' },
        { x1: 0, y1: sup - 1, x2: ti(0.78, n), y2: sup - 1, color: HL_DN, width: 1.6, label: '지지선', labelAt: 'start' }
      ];
      spec.markers = [{ i: ti(0.79, n), text: '박스권 돌파', dir: 'up', color: HL_DN }];
    }
    return spec;
  };

  GENS.flag = (quiz) => {
    const n = 60;
    const top = 138 + R(-3, 3);
    const wps = jitter([
      [0, 92], [0.3, top],
      [0.38, top - 7], [0.46, top - 4], [0.54, top - 11], [0.62, top - 8], [0.68, top - 13],
      [0.78, top + 4], [1, 168]
    ], 1);
    const path = pathFrom(wps, n, 1.1);
    const spec = { candles: toCandles(path, 1.2) };
    if (!quiz) {
      spec.segments = [
        { x1: ti(0.34, n), y1: top - 1, x2: ti(0.7, n), y2: top - 8, color: ANNO, width: 1.5 },
        { x1: ti(0.38, n), y1: top - 13, x2: ti(0.72, n), y2: top - 19, color: ANNO, width: 1.5 }
      ];
      spec.labels = [
        { i: ti(0.16, n), y: 122, text: '깃대(급등)', color: ANNO },
        { i: ti(0.53, n), y: top + 12, text: '깃발(조정)', color: ANNO }
      ];
      spec.markers = [{ i: ti(0.78, n), text: '재상승', dir: 'up', color: HL_DN }];
    }
    return spec;
  };

  GENS.pennant = (quiz) => {
    const n = 60;
    const top = 138 + R(-3, 3);
    const wps = jitter([
      [0, 92], [0.3, top],
      [0.38, top - 12], [0.46, top - 2], [0.54, top - 9], [0.62, top - 4], [0.68, top - 6],
      [0.78, top + 5], [1, 168]
    ], 1);
    const path = pathFrom(wps, n, 1.0);
    const spec = { candles: toCandles(path, 1.1) };
    if (!quiz) {
      spec.segments = [
        { x1: ti(0.36, n), y1: top - 1, x2: ti(0.72, n), y2: top - 5.5, color: ANNO, width: 1.5 },
        { x1: ti(0.38, n), y1: top - 13, x2: ti(0.72, n), y2: top - 7, color: ANNO, width: 1.5 }
      ];
      spec.labels = [
        { i: ti(0.16, n), y: 122, text: '깃대(급등)', color: ANNO },
        { i: ti(0.53, n), y: top + 10, text: '페넌트(수렴)', color: ANNO }
      ];
      spec.markers = [{ i: ti(0.78, n), text: '재상승', dir: 'up', color: HL_DN }];
    }
    return spec;
  };

  GENS.wedgeFalling = (quiz) => {
    const n = 65;
    const h0 = 132, l0 = 112;
    const hSlope = -26, lSlope = -14; // 위선이 더 가파르게 수렴
    const wps = jitter([
      [0, h0], [0.12, l0], [0.24, h0 + hSlope * 0.24], [0.36, l0 + lSlope * 0.36],
      [0.48, h0 + hSlope * 0.48], [0.6, l0 + lSlope * 0.6], [0.7, h0 + hSlope * 0.7],
      [0.78, l0 + lSlope * 0.7 + 6], [1, 140]
    ], 1);
    const path = pathFrom(wps, n, 1.1);
    const spec = { candles: toCandles(path, 1.2) };
    if (!quiz) {
      spec.segments = [
        { x1: 0, y1: h0 + 1.5, x2: ti(0.74, n), y2: h0 + hSlope * 0.74 + 1.5, color: ANNO, width: 1.6 },
        { x1: ti(0.12, n), y1: l0 - 1.5, x2: ti(0.74, n), y2: l0 + lSlope * 0.74 - 1.5, color: ANNO, width: 1.6 }
      ];
      spec.markers = [{ i: ti(0.8, n), text: '상향 돌파 (강세)', dir: 'up', color: HL_DN }];
    }
    return spec;
  };

  GENS.wedgeRising = (quiz) => {
    const n = 65;
    const l0 = 96, h0 = 116;
    const lSlope = 26, hSlope = 14;
    const wps = jitter([
      [0, l0], [0.12, h0], [0.24, l0 + lSlope * 0.24], [0.36, h0 + hSlope * 0.36],
      [0.48, l0 + lSlope * 0.48], [0.6, h0 + hSlope * 0.6], [0.7, l0 + lSlope * 0.7],
      [0.78, h0 + hSlope * 0.7 - 6], [1, 88]
    ], 1);
    const path = pathFrom(wps, n, 1.1);
    const spec = { candles: toCandles(path, 1.2) };
    if (!quiz) {
      spec.segments = [
        { x1: 0, y1: l0 - 1.5, x2: ti(0.74, n), y2: l0 + lSlope * 0.74 - 1.5, color: ANNO, width: 1.6 },
        { x1: ti(0.12, n), y1: h0 + 1.5, x2: ti(0.74, n), y2: h0 + hSlope * 0.74 + 1.5, color: ANNO, width: 1.6 }
      ];
      spec.markers = [{ i: ti(0.8, n), text: '하향 이탈 (약세)', dir: 'down', color: HL_UP }];
    }
    return spec;
  };

  // ===== 7. 갭 =====
  GENS.gapStory = (quiz) => {
    const candles = [];
    const wig = 1.1;
    let px = 100;
    const push = (close, gap, up, dn) => {
      const o = px + (gap || R(-0.6, 0.6));
      candles.push(K(o, close, up != null ? up : R(0.2, 1) * wig, dn != null ? dn : R(0.2, 1) * wig));
      px = close;
    };
    // ① 횡보 + 보통갭
    for (let i = 0; i < 4; i++) push(100 + R(-2, 2));
    push(px + 3, 3.2, 0.6, 0.4);          // 보통갭 (곧 메워짐)
    push(px - 3);
    for (let i = 0; i < 3; i++) push(100 + R(-2, 2));
    const commonGapI = 4;
    // ② 돌파갭
    push(px + 4 + 6, 6.5, 0.8, 0.5);
    const breakGapI = candles.length - 1;
    // 상승 랠리
    for (let i = 0; i < 6; i++) push(px + R(2.5, 4.5));
    // ③ 급진갭
    push(px + 7, 5.5, 0.8, 0.5);
    const runGapI = candles.length - 1;
    for (let i = 0; i < 6; i++) push(px + R(2.5, 4.5));
    // ④ 소멸갭 → 섬
    push(px + 6.5, 5, 0.8, 0.5);
    const exGapI = candles.length - 1;
    push(px + R(-1, 2));
    push(px + R(-2, 1));
    // 반대 방향 갭 (섬꼴반전)
    push(px - 7.5, -6.5, 0.5, 0.9);
    const islandI = candles.length - 1;
    for (let i = 0; i < 5; i++) push(px - R(2, 4));

    const spec = { candles, yPad: 0.14 };
    if (!quiz) {
      spec.markers = [
        { i: commonGapI, text: '보통갭', dir: 'down', color: ANNO },
        { i: breakGapI, text: '돌파갭', dir: 'up', color: HL_DN },
        { i: runGapI, text: '급진(계속)갭', dir: 'up', color: HL_DN },
        { i: exGapI, text: '소멸갭', dir: 'down', color: HL_UP },
        { i: islandI + 1, text: '섬꼴반전', dir: 'down', color: HL_UP }
      ];
    }
    return spec;
  };

  // ===== 8. 보조지표 =====
  GENS.volumeTrend = (quiz) => {
    const n = 70;
    const res = 118;
    const wps = jitter([
      [0, 106], [0.12, res - 2], [0.24, 106], [0.36, res - 1], [0.46, 108],
      [0.54, res + 5], [0.68, res + 14], [0.8, res + 10], [1, res + 26]
    ], 1.2);
    const path = pathFrom(wps, n, 1.5);
    const vols = path.map((p, i) => {
      const t = i / (n - 1);
      if (t > 0.5 && t < 0.62) return R(2.6, 3.4);   // 돌파 구간 급증
      if (t >= 0.62) return R(1.3, 2.1);
      return R(0.6, 1.1);
    });
    const spec = { candles: toCandles(path, 1.5), volume: { values: vols } };
    if (!quiz) {
      spec.hlines = [{ y: res, color: ANNO, label: '저항선' }];
      spec.markers = [{ i: ti(0.55, n), text: '돌파', dir: 'up', color: HL_DN }];
      spec.volume.markers = [{ i: ti(0.56, n), text: '거래량 급증 = 진짜 돌파', color: ANNO }];
    }
    return spec;
  };

  GENS.bollinger = (quiz) => {
    const n = 95;
    const path = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      if (t < 0.45) path.push(112 + 3.5 * Math.sin(i / 3.2) + R(-1, 1));
      else path.push(112 + (t - 0.45) * 75 + 6 * Math.sin(i / 4) + R(-2, 2));
    }
    const candles = toCandles(path, 1.4);
    const cl = closes(candles);
    const mid = sma(cl, 20);
    const sd = rollingStd(cl, 20);
    const upper = mid.map((m, i) => m == null ? null : m + 2 * sd[i]);
    const lower = mid.map((m, i) => m == null ? null : m - 2 * sd[i]);
    const spec = {
      candles,
      band: { upper, lower, color: 'rgba(42,120,214,0.09)' },
      lines: [
        { values: upper, color: '#6da7ec', width: 1.5 },
        { values: mid, color: SHORT, width: 1.5, dash: [5, 3] },
        { values: lower, color: '#6da7ec', width: 1.5 }
      ],
      legend: [{ name: '20일 이평', color: SHORT }, { name: '±2σ 밴드', color: '#6da7ec' }]
    };
    if (!quiz) {
      spec.labels = [
        { i: ti(0.28, n), y: 96, text: '밴드 수축(스퀴즈) = 폭풍 전야', color: ANNO },
        { i: ti(0.72, n), y: 108, text: '밴드 확장 = 추세 발생', color: ANNO }
      ];
    }
    return spec;
  };

  GENS.rsi = () => {
    const n = 110;
    const ph = R(0, 8);
    const path = [];
    for (let i = 0; i < n; i++) {
      path.push(115 + 20 * Math.sin((i + ph) / 9) + 8 * Math.sin((i + ph) / 23) + R(-1.6, 1.6));
    }
    const candles = toCandles(path, 1.6);
    const r = calcRSI(closes(candles), 14);
    return {
      candles,
      sub: {
        name: 'RSI(14)',
        range: [0, 100],
        lines: [{ values: r, color: LONG, width: 2 }],
        hlines: [
          { y: 70, label: '70 과매수' },
          { y: 30, label: '30 과매도' }
        ]
      }
    };
  };

  GENS.macd = () => {
    const n = 120;
    const ph = R(0, 10);
    const path = [];
    for (let i = 0; i < n; i++) {
      path.push(110 + 24 * Math.sin((i + ph) / 14) + 0.12 * i + R(-1.8, 1.8));
    }
    const candles = toCandles(path, 1.7);
    const cl = closes(candles);
    const e12 = ema(cl, 12), e26 = ema(cl, 26);
    const macd = cl.map((_, i) => (e12[i] == null || e26[i] == null) ? null : e12[i] - e26[i]);
    const validMacd = macd.map(v => v == null ? 0 : v);
    const sig = ema(validMacd, 9).map((v, i) => macd[i] == null ? null : v);
    const hist = macd.map((v, i) => (v == null || sig[i] == null) ? null : v - sig[i]);
    return {
      candles,
      sub: {
        name: 'MACD(12,26,9)',
        bars: { values: hist },
        lines: [
          { values: macd, color: SHORT, width: 2 },
          { values: sig, color: LONG, width: 1.8, dash: [5, 3] }
        ],
        hlines: [{ y: 0 }],
        legend: [{ name: 'MACD', color: SHORT }, { name: '시그널', color: LONG }]
      }
    };
  };

  GENS.stochastic = () => {
    const n = 110;
    const ph = R(0, 8);
    const path = [];
    for (let i = 0; i < n; i++) {
      path.push(112 + 16 * Math.sin((i + ph) / 8) + 6 * Math.sin((i + ph) / 19) + R(-1.6, 1.6));
    }
    const candles = toCandles(path, 1.6);
    const kP = 14;
    const pctK = candles.map((c, i) => {
      if (i < kP - 1) return null;
      let hh = -Infinity, ll = Infinity;
      for (let j = i - kP + 1; j <= i; j++) { hh = Math.max(hh, candles[j].h); ll = Math.min(ll, candles[j].l); }
      return ((c.c - ll) / Math.max(hh - ll, 1e-9)) * 100;
    });
    const valid = pctK.map(v => v == null ? 50 : v);
    const pctD = sma(valid, 3).map((v, i) => pctK[i] == null ? null : v);
    return {
      candles,
      sub: {
        name: '스토캐스틱(14,3)',
        range: [0, 100],
        lines: [
          { values: pctK, color: SHORT, width: 2 },
          { values: pctD, color: LONG, width: 1.8, dash: [5, 3] }
        ],
        hlines: [
          { y: 80, label: '80 과매수' },
          { y: 20, label: '20 과매도' }
        ],
        legend: [{ name: '%K', color: SHORT }, { name: '%D', color: LONG }]
      }
    };
  };

  GENS.obv = (quiz) => {
    const n = 85;
    const candles = [];
    let px = 105;
    const vols = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      let d, v;
      if (t < 0.7) {
        // 횡보하지만 오르는 날 거래량이 큼 (매집)
        const up = Math.random() < 0.5;
        d = up ? R(1, 3) : R(-2.6, -0.8);
        v = up ? R(1.8, 2.6) : R(0.5, 1.0);
        if (px > 115) d = -Math.abs(d);
        if (px < 98) d = Math.abs(d);
      } else {
        d = R(0.5, 3.5);
        v = R(1.6, 2.8);
      }
      const c = px + d;
      candles.push(K(px + R(-0.5, 0.5), c, R(0.3, 1.1), R(0.3, 1.1)));
      vols.push(v);
      px = c;
    }
    const obv = [];
    let acc = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) acc += candles[i].c >= candles[i - 1].c ? vols[i] : -vols[i];
      obv.push(acc);
    }
    const spec = {
      candles,
      volume: { values: vols },
      sub: { name: 'OBV (거래량 누적)', lines: [{ values: obv, color: MID, width: 2 }] }
    };
    if (!quiz) {
      spec.labels = [{ i: ti(0.33, n), y: 125, text: '주가는 횡보, OBV는 상승 → 매집 진행', color: ANNO }];
    }
    return spec;
  };

  GENS.elliott = (quiz) => {
    const n = 90;
    const w = {
      s: 80 + R(-3, 3), p1: 104 + R(-2, 3), p2: 92 + R(-2, 2), p3: 140 + R(-3, 5),
      p4: 124 + R(-3, 3), p5: 152 + R(-3, 5), pa: 133 + R(-3, 3), pb: 142 + R(-2, 3), pc: 110 + R(-4, 3)
    };
    const wps = [
      [0, w.s], [0.13, w.p1], [0.21, w.p2], [0.42, w.p3], [0.52, w.p4],
      [0.65, w.p5], [0.75, w.pa], [0.83, w.pb], [1, w.pc]
    ];
    const path = pathFrom(wps, n, 1.4);
    const spec = { candles: toCandles(path, 1.5), yPad: 0.14 };
    if (!quiz) {
      const o = 7;
      spec.labels = [
        { i: ti(0.13, n), y: w.p1 + o, text: '1' },
        { i: ti(0.21, n), y: w.p2 - o, text: '2' },
        { i: ti(0.42, n), y: w.p3 + o, text: '3 (가장 강함)' },
        { i: ti(0.52, n), y: w.p4 - o, text: '4' },
        { i: ti(0.65, n), y: w.p5 + o, text: '5' },
        { i: ti(0.75, n), y: w.pa - o, text: 'a', color: HL_UP },
        { i: ti(0.83, n), y: w.pb + o, text: 'b', color: HL_UP },
        { i: ti(1, n) - 2, y: w.pc - o, text: 'c', color: HL_UP }
      ];
      spec.segments = [
        { x1: ti(0.68, n), y1: w.s + 4, x2: ti(0.68, n), y2: w.p5 + 10, color: '#c3c2b7', dash: [4, 4], width: 1 }
      ];
      spec.labels.push(
        { i: ti(0.34, n), y: w.s - 2, text: '상승 5파', color: HL_DN },
        { i: ti(0.86, n), y: w.s - 2, text: '하락 3파', color: HL_UP }
      );
    }
    return spec;
  };

  window.PatternLib = {
    generate(key, opts) {
      const gen = GENS[key];
      if (!gen) throw new Error('unknown pattern: ' + key);
      return gen(!!(opts && opts.quiz));
    },
    has: key => !!GENS[key],
    keys: () => Object.keys(GENS)
  };
})();

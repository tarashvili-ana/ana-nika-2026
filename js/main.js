(() => {
  "use strict";

  /* ------------------------------------------------------------------ *
   *  Settings you may want to change
   * ------------------------------------------------------------------ */

  // true : show the live local time in Tbilisi and Basel.
  // false: keep the fixed times written in index.html (14 Nov, 15:00 / 12:00).
  const LIVE_CLOCKS = true;

  /* ------------------------------------------------------------------ *
   *  Drawing data, traced from the reference screenshot (2000 × 1120)
   * ------------------------------------------------------------------ */

  const REF_W = 2000;
  const REF_H = 1120;

  // The mountain line, from Tbilisi (left) to Basel (right).
  const RIDGE = [
    [190.3, 976.8], [340.3, 871.3], [385.3, 862.5], [396.5, 861.8], [405.2, 856.1],
    [426.4, 829.0], [435.2, 822.7], [478.5, 807.4], [494.0, 777.4], [502.7, 773.4],
    [513.7, 771.6], [575.6, 720.8], [630.8, 662.7], [636.6, 653.1], [645.0, 620.1],
    [705.8, 536.9], [714.0, 529.0], [782.5, 487.6], [865.7, 426.6], [875.4, 420.7],
    [928.5, 398.9], [966.6, 373.8], [974.9, 366.3], [993.1, 337.1], [1042.2, 289.2],
    [1052.7, 286.4], [1086.8, 286.4], [1097.8, 288.1], [1115.4, 302.6], [1148.3, 349.5],
    [1172.6, 373.8], [1177.8, 383.1], [1180.2, 405.9], [1184.6, 414.9], [1273.0, 439.1],
    [1411.4, 576.0], [1456.9, 627.2], [1475.3, 656.2], [1497.0, 662.4], [1550.2, 683.4],
    [1599.5, 760.5], [1608.0, 765.7], [1630.7, 767.1], [1640.0, 772.5], [1687.5, 822.3],
    [1691.6, 879.2], [1698.1, 887.3], [1756.0, 924.2], [1767.0, 926.6], [1801.1, 926.6],
  ];

  // Centre of every snowball in the reference screenshot.
  const SNOWBALLS = [
    [142.4, 74.5], [497.9, 218.6], [1136.2, 74.4], [1635.7, 151.3], [1363.5, 361.0],
    [901.6, 499.9], [349.8, 693.2], [737.2, 805.9], [1400.3, 758.4], [1795.1, 566.5],
  ];

  /* ------------------------------------------------------------------ *
   *  Elements
   * ------------------------------------------------------------------ */

  const scene = document.getElementById("scene");
  const snowLayer = document.getElementById("snow");
  const ridge = document.getElementById("ridge");
  const revealPath = document.getElementById("reveal-path");
  const playBtn = document.getElementById("play");
  const pauseBtn = document.getElementById("pause");
  const song = document.getElementById("song");
  const clockTbilisi = document.getElementById("clock-tbilisi");
  const clockBasel = document.getElementById("clock-basel");

  /* ------------------------------------------------------------------ *
   *  Mountain line
   * ------------------------------------------------------------------ */

  const pathData = RIDGE.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  ridge.setAttribute("d", pathData);
  revealPath.setAttribute("d", pathData);

  /* ------------------------------------------------------------------ *
   *  Snowballs: each one fades in, drifts down slowly, and fades out.
   *  As one starts to fade away, a new one appears somewhere else, so
   *  about ten are visible at any time (a few more or fewer is fine).
   * ------------------------------------------------------------------ */

  const RING_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.9" /></svg>';

  const FADE_IN = 3.5; // seconds
  const FADE_OUT = 4; // seconds
  const LIFE = [16, 26]; // seconds a snowball stays on screen
  const SPEED = [0.014, 0.028]; // fall speed, as a share of the screen height per second
  const TARGET = [9, 11]; // how many are "alive" (not yet fading out)

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let balls = [];
  let W = window.innerWidth;
  let H = window.innerHeight;

  // Small seeded random generator, so every visit starts the same way.
  function rng(seed) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = rng(1109);
  const between = (a, b) => a + rand() * (b - a);
  const ease = (t) => t * t * (3 - 2 * t); // soft start and end

  const isAlive = (b) => b.age < b.life - FADE_OUT;

  // Choose a spot that is as far as possible from the snowballs already there.
  function freeSpot() {
    let best = { x: rand(), y: rand() * 0.8 };
    let bestGap = -1;
    for (let i = 0; i < 40; i++) {
      const x = 0.03 + rand() * 0.94;
      const y = 0.02 + rand() * 0.8;
      let gap = Infinity;
      for (const b of balls) {
        gap = Math.min(gap, Math.hypot((b.xf - x) * W, (b.yf - y) * H));
      }
      if (gap > bestGap) {
        bestGap = gap;
        best = { x, y };
      }
    }
    return best;
  }

  function addBall(xf, yf) {
    const el = document.createElement("span");
    el.className = "snowball";
    el.innerHTML = RING_SVG;
    el.style.opacity = "0";
    el.style.setProperty("--spin", `${between(70, 120)}s`);
    el.style.setProperty("--turn", rand() < 0.5 ? "360deg" : "-360deg");
    snowLayer.appendChild(el);
    const ball = {
      el,
      xf,
      yf,
      vy: between(SPEED[0], SPEED[1]),
      sway: between(8, 18), // px
      swaySpeed: between(0.2, 0.4), // radians per second
      phase: rand() * Math.PI * 2,
      life: between(LIFE[0], LIFE[1]),
      age: 0,
    };
    balls.push(ball);
    return ball;
  }

  function spawn() {
    const spot = freeSpot();
    addBall(spot.x, spot.y);
  }

  function buildSnow() {
    // The first ten sit exactly where your screenshot puts them, fully visible.
    SNOWBALLS.forEach(([x, y]) => {
      const ball = addBall(x / REF_W, y / REF_H);
      // Different ages, so they fade away one by one instead of all together.
      ball.age = between(FADE_IN, ball.life - FADE_OUT - 0.5);
    });
    drawSnow(0);
  }

  function opacityOf(b) {
    const fadeIn = ease(Math.min(b.age / FADE_IN, 1));
    const fadeOut = ease(Math.min(Math.max((b.life - b.age) / FADE_OUT, 0), 1));
    return Math.min(fadeIn, fadeOut);
  }

  function drawSnow(time) {
    balls.forEach((b) => {
      const x = b.xf * W + Math.sin(b.phase + time * b.swaySpeed) * b.sway;
      const y = b.yf * H;
      b.el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      b.el.style.opacity = opacityOf(b).toFixed(3);
    });
  }

  let snowRunning = false;
  let lastFrame = 0;
  let clock = 0;
  let cooldown = 0;
  let target = 10;
  let retarget = 0;

  function frame(now) {
    if (!snowRunning) return;
    const dt = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;
    clock += dt;

    balls.forEach((b) => {
      b.age += dt;
      b.yf += b.vy * dt;
    });
    // Remove snowballs that have faded out completely.
    balls = balls.filter((b) => {
      if (b.age < b.life) return true;
      b.el.remove();
      return false;
    });

    // Now and then the wanted number changes a little (9, 10 or 11).
    retarget -= dt;
    if (retarget <= 0) {
      target = Math.round(between(TARGET[0], TARGET[1]));
      retarget = between(6, 14);
    }

    // When one starts fading away, bring a new one in somewhere else.
    cooldown -= dt;
    if (cooldown <= 0 && balls.filter(isAlive).length < target) {
      spawn();
      cooldown = between(0.8, 2.4);
    }

    drawSnow(clock);
    requestAnimationFrame(frame);
  }

  function startSnow() {
    if (snowRunning || reduceMotion) return;
    snowRunning = true;
    lastFrame = performance.now();
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", () => {
    W = window.innerWidth;
    H = window.innerHeight;
    drawSnow(clock);
  });

  /* ------------------------------------------------------------------ *
   *  Clocks
   * ------------------------------------------------------------------ */

  function cityTime(timeZone) {
    const now = new Date();
    const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone }).format(now);
    const time = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    }).format(now);
    return `${date}, ${time}`;
  }

  function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }

  function tickClocks() {
    setText(clockTbilisi, cityTime("Asia/Tbilisi"));
    setText(clockBasel, cityTime("Europe/Zurich"));
  }

  if (LIVE_CLOCKS) {
    tickClocks();
    setInterval(tickClocks, 1000);
  }

  /* ------------------------------------------------------------------ *
   *  Dragging Ana and Nika up the mountain
   * ------------------------------------------------------------------ */

  const svg = document.querySelector(".art");
  const couple = document.getElementById("couple");
  const heart = document.getElementById("heart");
  const pics = [...document.querySelectorAll(".pic")].map((el) => ({
    el,
    who: el.dataset.who,
    at: Number(el.dataset.at), // the figure's x position that makes the photo appear
    last: el.dataset.last === "true", // appears only after all the other photos
    shown: false,
  }));

  // Where the two stand at the start (their feet), in drawing coordinates.
  const STAND_ANA = [140.4, 989.3];
  const STAND_NIKA = [1821.1, 967.3];

  // Ana climbs the left slope up to the peak, Nika the right slope.
  const ANA_ROUTE = [STAND_ANA, ...RIDGE.slice(0, 25)];
  const NIKA_ROUTE = [STAND_NIKA, ...RIDGE.slice(27).reverse()];

  function makeRoute(points) {
    const cum = [0];
    for (let i = 1; i < points.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    }
    return { points, cum, len: cum[cum.length - 1] };
  }

  function pointAt(route, length) {
    const { points, cum } = route;
    let i = 1;
    while (i < points.length - 1 && cum[i] < length) i++;
    const seg = cum[i] - cum[i - 1] || 1;
    const t = Math.min(Math.max((length - cum[i - 1]) / seg, 0), 1);
    return [
      points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
      points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t,
    ];
  }

  // The distance along the route of the point closest to (x, y).
  function nearestLength(route, x, y) {
    const { points, cum } = route;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 1; i < points.length; i++) {
      const [x1, y1] = points[i - 1];
      const dx = points[i][0] - x1;
      const dy = points[i][1] - y1;
      const segLen2 = dx * dx + dy * dy || 1;
      const t = Math.min(Math.max(((x - x1) * dx + (y - y1) * dy) / segLen2, 0), 1);
      const d = Math.hypot(x - (x1 + dx * t), y - (y1 + dy * t));
      if (d < bestDist) {
        bestDist = d;
        best = cum[i - 1] + t * (cum[i] - cum[i - 1]);
      }
    }
    return best;
  }

  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  function makeFigure(who, route, forwardKey, backKey) {
    return {
      who,
      el: document.getElementById(`fig-${who}`),
      hint: document.getElementById(`hint-${who}`),
      route: makeRoute(route),
      forwardKey,
      backKey,
      length: 0, // where the figure is now, measured along the route
      target: 0, // where the pointer wants it
      grab: [0, 0],
      dragging: false,
      moved: false,
      atTop: false,
    };
  }

  const ana = makeFigure("ana", ANA_ROUTE, "ArrowRight", "ArrowLeft");
  const nika = makeFigure("nika", NIKA_ROUTE, "ArrowLeft", "ArrowRight");
  const figures = [ana, nika];
  let finished = false;

  function placeFigure(f) {
    const [x, y] = pointAt(f.route, f.length);
    f.el.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
    f.el.setAttribute("aria-valuenow", String(Math.round((f.length / f.route.len) * 100)));
    return x;
  }

  // Photos appear one at a time, never all at once.
  let nextReveal = 0;
  function revealPic(pic) {
    pic.shown = true;
    const now = performance.now();
    const when = Math.max(now, nextReveal);
    nextReveal = when + 700;
    setTimeout(() => pic.el.classList.add("is-in"), when - now);
  }

  function showHint(f) {
    if (!f.moved && !finished) f.hint.classList.add("is-on");
  }

  function hideHint(f) {
    f.hint.classList.remove("is-on");
  }

  function checkPics() {
    pics.forEach((pic) => {
      if (pic.shown) return;
      const f = pic.who === "ana" ? ana : nika;
      const x = pointAt(f.route, f.length)[0];
      if (!(pic.who === "ana" ? x >= pic.at : x <= pic.at)) return;
      if (pic.last && !pics.every((other) => other === pic || other.shown)) return;
      revealPic(pic);
    });
  }

  function checkFigure(f) {
    checkPics();

    const top = f.target >= f.route.len - 6 && f.length >= f.route.len - 12;
    if (top === f.atTop) return;
    f.atTop = top;
    if (!top) return;

    if (f === ana && !nika.moved) setTimeout(() => showHint(nika), 700);
    if (ana.atTop && nika.atTop) finale();
  }

  // Both are at the top: they sit down together and a heart appears.
  function finale() {
    if (finished) return;
    finished = true;
    figures.forEach((f) => {
      f.dragging = false;
      hideHint(f);
      f.el.classList.remove("is-ready", "is-dragging");
      f.el.classList.add("is-gone");
    });
    // Any photo that has not shown yet (for example after keyboard jumps) comes in first.
    pics.filter((pic) => !pic.shown).forEach(revealPic);
    setTimeout(() => couple.classList.add("is-in"), 600);
    setTimeout(() => heart.classList.add("is-in"), 2600);
    setTimeout(startFilm, 2600 + HOLD_AFTER_HEART);
  }

  let figLoop = false;
  let lastFig = 0;

  function figFrame(now) {
    const dt = Math.min((now - lastFig) / 1000, 0.05);
    lastFig = now;
    let moving = false;
    figures.forEach((f) => {
      const diff = f.target - f.length;
      if (reduceMotion || Math.abs(diff) < 0.2) {
        f.length = f.target;
      } else {
        f.length += diff * (1 - Math.exp(-dt * 12)); // soft, slightly lagging follow
        moving = true;
      }
      placeFigure(f);
      checkFigure(f);
    });
    if (moving) requestAnimationFrame(figFrame);
    else figLoop = false;
  }

  function wakeFigures() {
    if (figLoop) return;
    figLoop = true;
    lastFig = performance.now();
    requestAnimationFrame(figFrame);
  }

  function pointerInDrawing(event) {
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  function markMoved(f) {
    if (f.moved) return;
    f.moved = true;
    hideHint(f);
  }

  figures.forEach((f) => {
    f.el.addEventListener("pointerdown", (event) => {
      if (finished || !f.el.classList.contains("is-ready")) return;
      event.preventDefault();
      f.el.setPointerCapture(event.pointerId);
      const p = pointerInDrawing(event);
      const feet = pointAt(f.route, f.length);
      f.grab = [p.x - feet[0], p.y - feet[1]]; // keeps the figure from jumping under the pointer
      f.dragging = true;
      f.el.classList.add("is-dragging");
      markMoved(f);
    });

    f.el.addEventListener("pointermove", (event) => {
      if (!f.dragging) return;
      const p = pointerInDrawing(event);
      f.target = nearestLength(f.route, p.x - f.grab[0], p.y - f.grab[1]);
      wakeFigures();
    });

    const release = () => {
      f.dragging = false;
      f.el.classList.remove("is-dragging");
    };
    f.el.addEventListener("pointerup", release);
    f.el.addEventListener("pointercancel", release);
    f.el.addEventListener("lostpointercapture", release);

    // Keyboard: arrow keys move the figure along the mountain.
    f.el.addEventListener("keydown", (event) => {
      if (finished || !f.el.classList.contains("is-ready")) return;
      let dir = 0;
      if (event.key === "ArrowUp" || event.key === "PageUp" || event.key === f.forwardKey) dir = 1;
      if (event.key === "ArrowDown" || event.key === "PageDown" || event.key === f.backKey) dir = -1;
      if (!dir) return;
      event.preventDefault();
      markMoved(f);
      f.target = clamp(f.target + dir * f.route.len * 0.04, 0, f.route.len);
      wakeFigures();
    });
  });

  // The hint text keeps the same readable size on every screen.
  function sizeHints() {
    const m = svg.getScreenCTM();
    if (!m) return;
    const px = Math.max(11, (window.innerWidth / REF_W) * 17);
    figures.forEach((f) => (f.hint.style.fontSize = `${px / m.a}px`));
  }
  sizeHints();
  window.addEventListener("resize", sizeHints);

  let figuresStarted = false;
  function startFigures() {
    if (figuresStarted) return;
    figuresStarted = true;
    // They can be picked up as soon as they have appeared.
    setTimeout(() => ana.el.classList.add("is-ready"), 1500);
    setTimeout(() => nika.el.classList.add("is-ready"), 5000);
    // Soon after both are there, "drag" shows up next to Ana.
    setTimeout(() => showHint(ana), 6200);
  }

  /* ------------------------------------------------------------------ *
   *  After the heart: 5 s later the picture fades out, a film canister
   *  appears in the middle, glides to the left, and its film slides out a
   *  little and back, twice, as a sign that it can be pulled.
   * ------------------------------------------------------------------ */

  const HOLD_AFTER_HEART = 5000; // ms between the heart and the film
  const FILM_HOLD = 1500; // ms the canister stays in the middle
  const FILM_GLIDE = 1900; // ms it takes to glide to the left (matches the CSS)
  const NUDGE = 64; // how far the film slides out, in drawing units
  const NUDGE_CYCLE = 5200; // ms between two "out and back" pairs

  const film = document.getElementById("film");
  const filmSvg = document.getElementById("film-svg");
  const strip = document.getElementById("strip");
  const stripHit = document.getElementById("strip-hit");
  const stripBody = document.getElementById("strip-body");
  const frames = document.getElementById("frames");
  const canister = document.getElementById("canister");
  const SVGNS = "http://www.w3.org/2000/svg";

  // Photos in the order they come out of the canister: the first one sits next to the
  // end of the film, the last one is deepest inside.
  const FILM_PHOTOS = [["film/p00.jpg", 1.5], ["film/p01.jpg", 1.3333], ["film/p02.jpg", 0.75], ["film/p03.jpg", 0.75], ["film/p04.jpg", 0.75], ["film/p05.jpg", 0.75], ["film/p06.jpg", 0.75], ["film/p07.jpg", 0.75], ["film/p08.jpg", 1.3333], ["film/p09.jpg", 0.75], ["film/p10.jpg", 0.75], ["film/p11.jpg", 1.3333], ["film/p12.jpg", 1.3333], ["film/p13.jpg", 0.75], ["film/p14.jpg", 0.75], ["film/p15.jpg", 0.75], ["film/p16.jpg", 1.3333], ["film/p17.jpg", 0.75], ["film/p18.jpg", 1.5], ["film/p19.jpg", 0.75], ["film/p20.jpg", 1.3335], ["film/p21.jpg", 0.7513], ["film/p22.jpg", 0.75], ["film/p23.jpg", 1.3333], ["film/p24.jpg", 1.5], ["film/p25.jpg", 1.5], ["film/p26.jpg", 0.75], ["film/p27.jpg", 0.75], ["film/p28.jpg", 0.75], ["film/p29.jpg", 1.5], ["film/p30.jpg", 1.3333], ["film/p31.jpg", 1.3333], ["film/p32.jpg", 1.3333], ["film/p33.jpg", 1.3333], ["film/p34.jpg", 0.75], ["film/p35.jpg", 0.75], ["film/p36.jpg", 0.75], ["film/p37.jpg", 1.3333], ["film/p38.jpg", 0.75], ["film/p39.jpg", 1.5], ["film/p40.jpg", 1.5], ["film/p41.jpg", 0.75], ["film/p42.jpg", 0.75], ["film/p43.jpg", 0.75], ["film/p44.jpg", 1.3333], ["film/p45.jpg", 0.75], ["film/p46.jpg", 1.3333], ["film/p47.jpg", 0.75], ["film/p48.jpg", 0.75], ["film/p49.jpg", 0.75], ["film/p50.jpg", 1.3326], ["film/p51.jpg", 1.5], ["film/p52.jpg", 0.75], ["film/p53.jpg", 0.75], ["film/p54.jpg", 1.5], ["film/p55.jpg", 0.75], ["film/p56.jpg", 0.75], ["film/p57.jpg", 0.75], ["film/p58.jpg", 1.5], ["film/p59.jpg", 0.75], ["film/p60.jpg", 1.5], ["film/p61.jpg", 1.3333], ["film/p62.jpg", 1.3333], ["film/p63.jpg", 0.7502], ["film/p64.jpg", 0.75], ["film/p65.jpg", 1.5], ["film/p66.jpg", 0.75], ["film/p67.jpg", 1.3333], ["film/p68.jpg", 1.5], ["film/p69.jpg", 1.5]];
  const FRAME_H = 312;
  const FRAME_Y = 404;
  const FRAME_GAP = 18;
  const FIRST_RIGHT = 350; // right edge of the first photo while the film is closed
  const SPOOL_EDGE = 404; // where the film disappears behind the canister
  const LEADER = 200; // blank film after the last photo

  // Every photo is 312 high; wide ones are 3:2, tall ones keep their own proportions.
  const photoFrames = [];
  let edge = FIRST_RIGHT;
  FILM_PHOTOS.forEach(([src, aspect]) => {
    const w = FRAME_H * aspect;
    const img = document.createElementNS(SVGNS, "image");
    img.setAttribute("href", "assets/" + src);
    img.setAttribute("x", edge - w);
    img.setAttribute("y", FRAME_Y);
    img.setAttribute("width", w);
    img.setAttribute("height", FRAME_H);
    img.setAttribute("preserveAspectRatio", "xMidYMid slice");
    img.setAttribute("pointer-events", "none");
    frames.appendChild(img);
    photoFrames.push({ el: img, src, aspect, left: edge - w, right: edge });
    edge -= w + FRAME_GAP;
  });
  const lastLeft = photoFrames[photoFrames.length - 1].left;
  const bodyLeft = lastLeft - LEADER;
  stripBody.setAttribute("x", bodyLeft);
  stripBody.setAttribute("width", 267.5 - bodyLeft);
  const PULL_MAX = SPOOL_EDGE - bodyLeft; // the whole film is out, the last photo has been seen

  let pull = 0;
  let nudging = false;
  let filmDragging = false;
  let flying = false;

  function setPull(value) {
    pull = Math.max(0, Math.min(PULL_MAX, value));
    strip.setAttribute("transform", `translate(${pull.toFixed(2)} 0)`);
    if (pull >= PULL_MAX - 2 && !rollShown && !leaving) showRoll();
  }

  function nudgeLoop(start) {
    if (!nudging) return;
    const t = (performance.now() - start) % NUDGE_CYCLE;
    // out and back, out and back, then rest
    let u = 0;
    if (t < 1000) u = t / 1000;
    else if (t > 1150 && t < 2150) u = (t - 1150) / 1000;
    const inPair = t < 1000 || (t > 1150 && t < 2150);
    setPull(inPair ? NUDGE * Math.pow(Math.sin(Math.PI * u), 2) : 0);
    requestAnimationFrame(() => nudgeLoop(start));
  }

  /* ---- The end of the film: a red button wanders around; click it and the film rolls back. ---- */

  const rollBtn = document.getElementById("roll");
  const stage = document.getElementById("stage");
  let rollShown = false;
  let leaving = false;
  let wander = null;

  function showRoll() {
    rollShown = true;
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const size = rollBtn.offsetWidth;
    wander = {
      x: size + Math.random() * (W - size * 3),
      y: size + Math.random() * (H * 0.7 - size),
      a: Math.random() * Math.PI * 2,
      slow: false,
      last: performance.now(),
    };
    rollBtn.style.transform = `translate(${wander.x}px, ${wander.y}px)`;
    rollBtn.classList.add("is-on");
    if (!reduceMotion) requestAnimationFrame(wanderStep);
  }

  function wanderStep(now) {
    if (!wander) return;
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const size = rollBtn.offsetWidth;
    const dt = Math.min(0.05, (now - wander.last) / 1000);
    wander.last = now;
    // drifts about, turning a little at random, bouncing off the edges
    wander.a += (Math.random() - 0.5) * 7 * dt;
    const speed = W * (wander.slow ? 0.05 : 0.11);
    wander.x += Math.cos(wander.a) * speed * dt;
    wander.y += Math.sin(wander.a) * speed * dt;
    const minX = size * 0.4;
    const maxX = W - size * 1.4;
    const minY = size * 0.4;
    const maxY = H - size * 1.9; // stays above the footer bar
    if (wander.x < minX) { wander.x = minX; wander.a = Math.PI - wander.a; }
    if (wander.x > maxX) { wander.x = maxX; wander.a = Math.PI - wander.a; }
    if (wander.y < minY) { wander.y = minY; wander.a = -wander.a; }
    if (wander.y > maxY) { wander.y = maxY; wander.a = -wander.a; }
    rollBtn.style.transform = `translate(${wander.x.toFixed(1)}px, ${wander.y.toFixed(1)}px)`;
    requestAnimationFrame(wanderStep);
  }

  rollBtn.addEventListener("pointerenter", () => { if (wander) wander.slow = true; });
  rollBtn.addEventListener("pointerleave", () => { if (wander) wander.slow = false; });

  rollBtn.addEventListener("click", () => {
    if (leaving) return;
    leaving = true;
    wander = null;
    closePhoto();
    rollBtn.classList.remove("is-on");
    film.classList.remove("is-ready");
    flying = false;
    velocity = 0;
    const from = pull;
    const start = performance.now();
    const DUR = reduceMotion ? 1 : 900;
    (function back(now) {
      const t = Math.min(1, (now - start) / DUR);
      const k = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      setPull(from * (1 - k));
      if (t < 1) requestAnimationFrame(back);
      else {
        setTimeout(() => film.classList.remove("is-on"), 250); // then the film fades away
        setTimeout(showCard, 250 + 1300); // and the folded card takes its place
      }
    })(start);
  });

  function startFilm() {
    scene.classList.add("is-away");
    setTimeout(() => {
      snowRunning = false; // the snow is hidden now, so stop animating it
      film.classList.add("is-on");
      setTimeout(() => {
        film.classList.add("is-left");
        setTimeout(() => {
          film.classList.add("is-ready");
          if (!reduceMotion) {
            nudging = true;
            nudgeLoop(performance.now());
          }
        }, FILM_GLIDE + 500);
      }, FILM_HOLD + 1200);
    }, 1100);
  }

  function filmX(event) {
    const m = filmSvg.getScreenCTM();
    return m ? (event.clientX - m.e) / m.a : event.clientX;
  }

  // Any touch on the film (or the canister) picks it up. A quick flick keeps rolling.
  let grabX = 0;
  let grabPull = 0;
  let lastX = 0;
  let lastT = 0;
  let velocity = 0; // drawing units per ms
  let downClientX = 0;
  let downClientY = 0;
  let downTime = 0;

  function glide() {
    if (filmDragging) return;
    const now = performance.now();
    const dt = Math.min(48, now - lastT);
    lastT = now;
    setPull(pull + velocity * dt);
    velocity *= Math.pow(0.0025, dt / 1000);
    if (Math.abs(velocity) > 0.01 && pull > 0 && pull < PULL_MAX) requestAnimationFrame(glide);
    else flying = false;
  }

  function startGrab(event) {
    if (zoom) return; // a photo is open: the next click only closes it
    nudging = false; // the visitor found it
    filmDragging = true;
    flying = false;
    grabX = lastX = filmX(event);
    downClientX = event.clientX;
    downClientY = event.clientY;
    downTime = performance.now();
    grabPull = pull;
    lastT = performance.now();
    velocity = 0;
    film.classList.add("is-dragging");
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function moveGrab(event) {
    if (!filmDragging || zoom) return;
    const x = filmX(event);
    const now = performance.now();
    const dt = Math.max(1, now - lastT);
    velocity = velocity * 0.6 + ((x - lastX) / dt) * 0.4;
    lastX = x;
    lastT = now;
    setPull(grabPull + x - grabX);
  }
  function endGrab(event) {
    if (!filmDragging) return;
    filmDragging = false;
    film.classList.remove("is-dragging");
    const moved = Math.hypot(event.clientX - downClientX, event.clientY - downClientY);
    if (event.type === "pointerup" && event.currentTarget === stripHit && moved < 6 && performance.now() - downTime < 600) {
      velocity = 0;
      openPhotoAt(event);
      return;
    }
    if (performance.now() - lastT > 90) velocity = 0; // held still before letting go
    if (Math.abs(velocity) > 0.05 && !reduceMotion && !flying) {
      flying = true;
      lastT = performance.now();
      requestAnimationFrame(glide);
    }
  }

  /* ---- Click a photo: it grows to the middle; click anywhere else and it goes back. ---- */

  let zoom = null;

  function svgPoint(clientX, clientY) {
    const pt = filmSvg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(filmSvg.getScreenCTM().inverse());
  }

  function frameRect(frame) {
    const r = frame.el.getBoundingClientRect();
    const a = svgPoint(r.left, r.top);
    const b = svgPoint(r.right, r.bottom);
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  }

  function tween(from, to, ms, onUpdate, onDone) {
    const start = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    (function step(now) {
      const t = Math.min(1, (now - start) / (reduceMotion ? 1 : ms));
      const k = ease(t);
      onUpdate({
        x: from.x + (to.x - from.x) * k,
        y: from.y + (to.y - from.y) * k,
        w: from.w + (to.w - from.w) * k,
        h: from.h + (to.h - from.h) * k,
        k,
      });
      if (t < 1) requestAnimationFrame(step);
      else if (onDone) onDone();
    })(start);
  }

  function openPhotoAt(event) {
    const p = svgPoint(event.clientX, event.clientY);
    const x = p.x - pull; // into the film's own coordinates
    const frame = photoFrames.find(
      (f) => x >= f.left && x <= f.right && p.y >= FRAME_Y && p.y <= FRAME_Y + FRAME_H
    );
    if (!frame) return;

    const from = frameRect(frame);
    // Biggest size that fits above the footer, centred on the page.
    const maxW = 1560;
    const maxH = 900;
    const h = Math.min(maxH, maxW / frame.aspect);
    const to = { w: h * frame.aspect, h, x: 0, y: 0 };
    to.x = 1000 - to.w / 2;
    to.y = 537 - to.h / 2; // the drawing is shifted up 37 so the film sits centred above the footer

    const layer = document.createElementNS(SVGNS, "g");
    const veil = document.createElementNS(SVGNS, "rect");
    veil.setAttribute("x", -4000);
    veil.setAttribute("y", -2000);
    veil.setAttribute("width", 10000);
    veil.setAttribute("height", 5200);
    veil.setAttribute("fill", "#fff");
    veil.setAttribute("opacity", 0);
    const big = document.createElementNS(SVGNS, "image");
    big.setAttribute("href", "assets/" + frame.src);
    big.setAttribute("preserveAspectRatio", "xMidYMid slice");
    big.setAttribute("pointer-events", "none");
    layer.append(veil, big);
    filmSvg.appendChild(layer);
    layer.style.cursor = "pointer";

    zoom = { frame, layer, veil, big, from, to, closing: false };
    frame.el.style.visibility = "hidden";
    const apply = (r) => {
      big.setAttribute("x", r.x);
      big.setAttribute("y", r.y);
      big.setAttribute("width", r.w);
      big.setAttribute("height", r.h);
    };
    apply(from);
    tween(from, to, 520, (r) => {
      apply(r);
      veil.setAttribute("opacity", (0.94 * r.k).toFixed(3));
    });
    veil.addEventListener("pointerdown", closePhoto);
  }

  function closePhoto() {
    if (!zoom || zoom.closing) return;
    const z = zoom;
    z.closing = true;
    const from = {
      x: +z.big.getAttribute("x"),
      y: +z.big.getAttribute("y"),
      w: +z.big.getAttribute("width"),
      h: +z.big.getAttribute("height"),
    };
    const back = frameRect({ el: z.frame.el }); // where it sits in the film right now
    tween(
      from,
      back,
      420,
      (r) => {
        z.big.setAttribute("x", r.x);
        z.big.setAttribute("y", r.y);
        z.big.setAttribute("width", r.w);
        z.big.setAttribute("height", r.h);
        z.veil.setAttribute("opacity", (0.94 * (1 - r.k)).toFixed(3));
      },
      () => {
        z.frame.el.style.visibility = "";
        z.layer.remove();
        if (zoom === z) zoom = null;
      }
    );
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePhoto();
  });

  [stripHit, canister].forEach((el) => {
    el.addEventListener("pointerdown", startGrab);
    el.addEventListener("pointermove", moveGrab);
    el.addEventListener("pointerup", endGrab);
    el.addEventListener("pointercancel", endGrab);
    el.style.cursor = "grab";
    el.style.touchAction = "none";
  });

  // A mouse wheel or trackpad swipe moves the film too.
  film.addEventListener(
    "wheel",
    (event) => {
      if (!film.classList.contains("is-ready")) return;
      if (zoom) {
        event.preventDefault();
        return;
      }
      nudging = false;
      velocity = 0;
      const d = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      setPull(pull - d * (event.deltaMode === 1 ? 24 : 1));
      event.preventDefault();
    },
    { passive: false }
  );

  /* ------------------------------------------------------------------ *
   *  The folded card. A corner lifts now and then as a hint; pull it and the
   *  card opens. It then stays open.
   * ------------------------------------------------------------------ */

  const card = document.getElementById("card");
  const cardShift = document.getElementById("card-shift");
  const card3d = document.getElementById("card3d");
  const flap = document.getElementById("flap");
  const corner = document.getElementById("corner");
  const spread = document.getElementById("spread");

  const HINT_DELAY = 2000; // ms after the card appears before the corner first lifts
  const HINT_EVERY = 5200; // ms between lifts

  let theta = 0; // how far the cover is open, 0 to PI
  let cardState = "closed"; // closed | dragging | settling | open
  let hintTimer = null;
  let peelPx = 0;
  let peelAnim = 0;

  function cardSize() {
    return card3d.getBoundingClientRect().width;
  }

  function setPeel(px) {
    peelPx = px;
    card3d.style.setProperty("--c", px.toFixed(1) + "px");
  }

  function setTheta(t) {
    theta = Math.max(0, Math.min(Math.PI, t));
    flap.style.transform = `translateZ(1px) rotateY(${(-theta * 180 / Math.PI).toFixed(2)}deg)`;
    cardShift.style.setProperty("--k", (theta / Math.PI).toFixed(4));
  }

  function animateValue(from, to, ms, apply, done) {
    const start = performance.now();
    const myId = ++peelAnim;
    (function step(now) {
      if (myId !== peelAnim && apply === setPeel) return; // a newer peel animation took over
      const t = Math.min(1, (now - start) / (reduceMotion ? 1 : ms));
      const k = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      apply(from + (to - from) * k);
      if (t < 1) requestAnimationFrame(step);
      else if (done) done();
    })(start);
  }

  function lift() {
    if (cardState !== "closed") return;
    const max = cardSize() * 0.11;
    animateValue(peelPx, max, 750, setPeel, () => {
      setTimeout(() => {
        if (cardState === "closed") animateValue(peelPx, 0, 650, setPeel);
      }, 500);
    });
  }

  function scheduleHint(delay) {
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function again() {
      if (cardState !== "closed") return;
      lift();
      hintTimer = setTimeout(again, HINT_EVERY);
    }, delay);
  }

  function showCard() {
    card.classList.add("is-on");
    card.setAttribute("aria-hidden", "false");
    scheduleHint(HINT_DELAY);
  }

  let hingeX = 0;
  let pullStartX = 0;
  let pullMoved = false;
  let grabOffset = 0;

  function startPull(event) {
    if (cardState !== "closed") return;
    cardState = "dragging";
    clearTimeout(hintTimer);
    card.classList.add("is-dragging");
    const r = card3d.getBoundingClientRect();
    hingeX = r.left;
    pullStartX = event.clientX;
    pullMoved = false;
    grabOffset = event.clientX - (r.right - 1);
    peelAnim++; // stop any lift in progress
    setPeel(0);
    corner.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function movePull(event) {
    if (cardState !== "dragging") return;
    if (Math.abs(event.clientX - pullStartX) > 5) pullMoved = true;
    const S = cardSize();
    // The corner follows the pointer: its distance from the hinge is S * cos(theta).
    const c = Math.max(-1, Math.min(1, (event.clientX - grabOffset - hingeX) / S));
    setTheta(Math.acos(c));
  }

  function endPull() {
    if (cardState !== "dragging") return;
    card.classList.remove("is-dragging");
    cardState = "settling";
    if (!pullMoved) {
      // a plain click on the corner: the card unfolds by itself
      animateValue(0, Math.PI, 1100, setTheta, openDone);
      return;
    }
    const target = theta > Math.PI * 0.3 ? Math.PI : 0;
    animateValue(theta, target, 520, setTheta, () => {
      if (target === 0) {
        cardState = "closed";
        scheduleHint(1500);
      } else {
        openDone();
      }
    });
  }

  function openDone() {
    cardState = "open";
    card.classList.add("is-open");
    // Swap to the flat spread (same picture) so it can turn over.
    card.classList.add("is-flat");
  }

  corner.addEventListener("pointerdown", startPull);
  corner.addEventListener("pointermove", movePull);
  corner.addEventListener("pointerup", endPull);
  corner.addEventListener("pointercancel", endPull);
  corner.addEventListener("pointerenter", () => {
    if (cardState === "closed") animateValue(peelPx, Math.max(peelPx, cardSize() * 0.06), 220, setPeel);
  });
  corner.addEventListener("pointerleave", () => {
    if (cardState === "closed") animateValue(peelPx, 0, 300, setPeel);
  });
  corner.addEventListener("keydown", (event) => {
    if (cardState !== "closed" || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    cardState = "settling";
    clearTimeout(hintTimer);
    peelAnim++;
    setPeel(0);
    animateValue(0, Math.PI, 900, setTheta, openDone);
  });

  /* ------------------------------------------------------------------ *
   *  Music + reveal
   * ------------------------------------------------------------------ */

  let blobTried = false;

  // If the browser refuses to stream the file directly, load it as a blob.
  async function loadSongAsBlob() {
    if (blobTried) return false;
    blobTried = true;
    try {
      const res = await fetch(song.getAttribute("src"));
      if (!res.ok) return false;
      song.src = URL.createObjectURL(await res.blob());
      return true;
    } catch (err) {
      return false;
    }
  }

  function showScene() {
    scene.classList.add("is-on");
    startSnow();
    startFigures();
  }

  async function play() {
    showScene();
    try {
      await song.play();
    } catch (err) {
      if (song.error && (await loadSongAsBlob())) {
        try {
          await song.play();
        } catch (err2) {
          console.warn("The song could not be played.", err2);
        }
      } else {
        console.warn("The song could not be played.", err);
      }
    }
  }

  function pause() {
    song.pause();
  }

  function syncButtons() {
    playBtn.setAttribute("aria-pressed", String(!song.paused));
    pauseBtn.setAttribute("aria-pressed", String(song.paused && scene.classList.contains("is-on")));
  }

  // After a mouse click, hand focus back to the page so Space toggles the song.
  playBtn.addEventListener("click", (event) => {
    play();
    if (event.detail > 0) playBtn.blur();
  });
  pauseBtn.addEventListener("click", (event) => {
    pause();
    if (event.detail > 0) pauseBtn.blur();
  });
  song.addEventListener("play", syncButtons);
  song.addEventListener("pause", syncButtons);

  document.addEventListener("keydown", (event) => {
    if (event.code === "Space" && event.target === document.body) {
      event.preventDefault();
      if (song.paused) play();
      else pause();
    }
  });

  buildSnow();
  syncButtons();
})();

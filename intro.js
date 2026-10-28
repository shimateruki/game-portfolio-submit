/* ゲーム本体の4コマ素材を使い、作品画像の準備と画面への移行を見せる。 */
(() => {
  'use strict';

  const root = document.getElementById('app');
  if (!root) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const sprite = new Image();
  sprite.src = 'assets/slime-loading-sheet.png';
  // 元画像の絵は543pxごとの区画をまたぐため、不透明な領域をコマごとに指定する。
  const poses = [
    { x: 65, y: 315, width: 443, height: 317 },
    { x: 590, y: 148, width: 484, height: 469 },
    { x: 1131, y: 185, width: 416, height: 316 },
    { x: 1596, y: 397, width: 538, height: 241 }
  ];
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => clamp(value) ** 2 * (3 - 2 * clamp(value));
  let running = false;

  function show(trigger = null) {
    if (running || reducedMotion.matches || document.body.classList.contains('motion-paused')) return;
    running = true;
    const previousFocus = document.activeElement;
    const previousInert = root.inert;
    const previousOverflow = document.body.style.overflow;
    const overlay = document.createElement('div');
    overlay.className = 'slime-loader';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '制作作品の表示準備');
    overlay.innerHTML = `
      <canvas class="slime-loader-canvas" aria-hidden="true"></canvas>
      <div class="slime-loader-brand" aria-hidden="true">ゲーム制作の記録</div>
      <div class="slime-loader-progress">
        <div class="slime-loader-heading">
          <span>制作作品を準備しています</span>
          <strong class="slime-loader-number">0%</strong>
        </div>
        <div class="slime-loader-track" role="progressbar" aria-label="作品画像の準備" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <span class="slime-loader-fill"></span>
        </div>
        <p class="slime-loader-caption" role="status">スライムと一緒に、作品へ。</p>
      </div>
      <button class="slime-loader-skip" type="button">スキップして作品を見る →</button>`;
    document.body.append(overlay);

    const canvas = overlay.querySelector('canvas');
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) { overlay.remove(); running = false; return; }
    const track = overlay.querySelector('.slime-loader-track');
    const fill = overlay.querySelector('.slime-loader-fill');
    const number = overlay.querySelector('.slime-loader-number');
    const caption = overlay.querySelector('.slime-loader-caption');
    const skip = overlay.querySelector('button');
    root.inert = true;
    document.body.style.overflow = 'hidden';
    skip.focus({ preventScroll: true });

    const images = [sprite, ...root.querySelectorAll('.play-intro .hero-window img, .play-intro .console-slide img')];
    let completedImages = 0;
    images.forEach(image => {
      const pending = image.decode ? image.decode() : new Promise((resolve, reject) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', reject, { once: true });
      });
      Promise.resolve(pending).catch(() => {}).finally(() => { completedImages++; });
    });

    let width = 0, height = 0, trackRect;
    let frame = 0, done = false, displayed = 0, lastTime = performance.now();
    let finalStart = null, lastLabel = -1;
    const startedAt = lastTime;
    function resize() {
      width = innerWidth;
      height = innerHeight;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      trackRect = track.getBoundingClientRect();
    }
    function close() {
      if (done) return;
      done = true;
      cancelAnimationFrame(frame);
      clearTimeout(watchdog);
      removeEventListener('resize', resize);
      document.removeEventListener('keydown', onKeydown, true);
      document.removeEventListener('visibilitychange', onVisibility);
      overlay.remove();
      root.inert = previousInert;
      document.body.style.overflow = previousOverflow;
      running = false;
      const target = trigger?.isConnected ? trigger : previousFocus;
      if (target?.isConnected && target !== document.body) target.focus({ preventScroll: true });
    }
    function onKeydown(event) {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') { event.preventDefault(); skip.focus(); }
    }
    function onVisibility() { if (document.hidden) close(); }
    skip.addEventListener('click', close);
    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('visibilitychange', onVisibility);
    addEventListener('resize', resize);
    resize();
    const watchdog = setTimeout(close, 5000);

    function drawBackground(time) {
      const base = ctx.createLinearGradient(0, 0, width, height);
      base.addColorStop(0, '#d8f0ed');
      base.addColorStop(.58, '#e8f4ed');
      base.addColorStop(1, '#f5f2e9');
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, width, height);
      // バーを通る水面状の線を、背景の模様として薄く引く。
      const waterY = trackRect.top + 4;
      ctx.strokeStyle = 'rgba(33,112,114,.10)';
      ctx.lineWidth = 1;
      for (let row = 0; row < 3; row++) {
        ctx.beginPath();
        for (let px = -12; px <= width + 12; px += 8) {
          const py = waterY + 34 + row * 24 + Math.sin(px * .013 + time * .8 + row) * (3 + row);
          if (px === -12) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }

    function drawShadow(x, ground, widthScale, lift, opacity = 1) {
      ctx.save();
      ctx.translate(x, ground + 1);
      ctx.scale(1, .19);
      const size = widthScale * (.34 - Math.min(lift / 240, .08));
      const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
      shadow.addColorStop(0, `rgba(22,78,83,${(.28 - Math.min(lift / 300, .14)) * opacity})`);
      shadow.addColorStop(1, 'rgba(22,78,83,0)');
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.arc(0, 0, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawSlime(frameIndex, x, ground, baseWidth, lift = 0, angle = 0, scale = 1) {
      if (!sprite.complete || !sprite.naturalWidth) return;
      const pose = poses[frameIndex];
      const widthScale = [1.03, .96, 1, 1.12][frameIndex] * scale;
      const heightScale = [.95, 1.08, 1, .88][frameIndex] * scale;
      const drawWidth = baseWidth * widthScale;
      const drawHeight = baseWidth * 724 / 543 * heightScale;
      ctx.save();
      ctx.translate(x, ground - lift);
      ctx.rotate(angle);
      // 共通の724pxキャンバス上での高さを保ち、絵だけを正確に切り出す。
      const visualWidth = drawWidth * pose.width / 543;
      const visualHeight = drawHeight * pose.height / 724;
      ctx.drawImage(sprite, pose.x, pose.y, pose.width, pose.height,
        -visualWidth / 2, -drawHeight * .88 + drawHeight * pose.y / 724,
        visualWidth, visualHeight);
      ctx.restore();
    }

    function drawRun(now, progress) {
      const seconds = (now - startedAt) / 1000;
      const phase = (seconds * 1.45) % 1;
      const x = Math.max(trackRect.left + 65, Math.min(trackRect.right - 65,
        trackRect.left + trackRect.width * progress));
      const ground = trackRect.top - 15;
      const size = Math.min(160, width * .36);
      let pose = 0, lift = 0, rotation = 0;
      if (phase < .22) { pose = 0; lift = -2; }
      else if (phase < .42) { pose = 1; lift = 17; rotation = .025; }
      else if (phase < .76) {
        pose = 2;
        lift = 22 + Math.sin((phase - .42) / .34 * Math.PI) * 9;
        rotation = -.018;
      } else {
        pose = 3;
        lift = -4 + Math.sin((phase - .76) / .24 * Math.PI) * 4;
      }
      drawShadow(x, ground, size, lift);
      drawSlime(pose, x, ground, size, lift, rotation);
      if (pose === 3 && phase < .9) drawRipple(x, ground + 2, (phase - .76) / .14, .25);
    }

    function drawRipple(x, y, amount, alpha = 1) {
      ctx.save();
      ctx.strokeStyle = `rgba(40,171,181,${(1 - clamp(amount)) * alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y, 25 + amount * 80, 4 + amount * 11, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    function drawFinal(now) {
      const time = (now - finalStart) / 1000;
      const startX = Math.max(trackRect.left + 65, Math.min(trackRect.right - 65, trackRect.right));
      const centerX = width / 2;
      const centerY = Math.min(height * .48, trackRect.top - 30);
      const size = Math.min(160, width * .36);
      const flight = smooth(time / .43);
      const x = startX + (centerX - startX) * flight;
      const ground = (trackRect.top - 15) + (centerY - (trackRect.top - 15)) * flight;
      const lift = Math.sin(Math.PI * flight) * 72;
      if (time < .43) {
        drawShadow(x, ground, size, lift);
        drawSlime(time < .23 ? 1 : 2, x, ground, size, lift, -.04 * (1 - flight));
      } else if (time < .61) {
        const impact = clamp((time - .43) / .18);
        drawShadow(centerX, centerY, size, 0);
        drawSlime(3, centerX, centerY, size, 0, 0, 1 + Math.sin(impact * Math.PI) * .1);
        drawRipple(centerX, centerY + 3, impact, .75);
      }
      if (time >= .43) {
        const splash = clamp((time - .43) / .62);
        for (let ring = 0; ring < 2; ring++) {
          const spread = clamp((splash - ring * .15) / .85);
          if (spread <= 0 || spread >= 1) continue;
          ctx.strokeStyle = `rgba(42,166,174,${.28 * (1 - spread)})`;
          ctx.lineWidth = 2 - spread;
          ctx.beginPath();
          ctx.ellipse(centerX, centerY + 3, 35 + spread * width * .28,
            7 + spread * height * .045, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        for (let i = 0; i < 7; i++) {
          const angle = i * Math.PI * 2 / 7 - .2;
          const radius = 22 + splash * (55 + i % 3 * 15);
          const px = centerX + Math.cos(angle) * radius;
          const py = centerY + Math.sin(angle) * radius * .48 - Math.sin(splash * Math.PI) * 20;
          ctx.fillStyle = `rgba(68,184,191,${(1 - splash) * .55})`;
          ctx.beginPath();
          ctx.arc(px, py, 2.5 + i % 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (time >= .55) {
        const reveal = clamp((time - .55) / .67);
        // 波紋を残しながら、文字や作品画像を切り欠かず画面全体をフェードする。
        overlay.style.opacity = String(1 - smooth(reveal));
        if (reveal === 1) { close(); return true; }
      }
      return false;
    }

    function draw(now) {
      if (done) return;
      const delta = Math.min((now - lastTime) / 1000, .06);
      lastTime = now;
      const elapsed = (now - startedAt) / 1000;
      const ready = images.length ? completedImages / images.length : 1;
      displayed += (ready - displayed) * (1 - Math.exp(-4.3 * delta));
      if (ready === 1 && elapsed >= 1.35) displayed = 1;
      const percentage = Math.min(100, Math.floor(displayed * 100));
      if (percentage !== lastLabel) {
        lastLabel = percentage;
        number.textContent = `${percentage}%`;
        track.setAttribute('aria-valuenow', String(percentage));
        fill.style.width = `${percentage}%`;
      }
      if (ready === 1 && elapsed >= 1.35 && finalStart === null) {
        finalStart = now;
        caption.textContent = '準備できました';
        overlay.classList.add('is-complete');
      }
      drawBackground(elapsed);
      if (finalStart === null) drawRun(now, displayed);
      else drawFinal(now);
      if (!done) frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
  }

  document.addEventListener('click', event => {
    const trigger = event.target instanceof Element ? event.target.closest('[data-replay-intro]') : null;
    if (trigger) show(trigger);
  });
  let visited = false;
  try {
    visited = sessionStorage.getItem('portfolio-slime-loader-v3') === 'seen';
    sessionStorage.setItem('portfolio-slime-loader-v3', 'seen');
  } catch { /* 保存できない環境でも表示を続ける。 */ }
  if (!visited && !location.hash) show();
})();

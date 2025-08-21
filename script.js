// ===== Safe Text→Particles (fallback-first) =====
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: true });

let W = 0, H = 0;
const LINES = [
  "SPENT HOURS BACKFLOW",
  "SLOWLY RISING ROUND MY SKIN",
  "FOG DISSOLVES THE WALLS"
];
const FONT_FAMILY = "'Host Grotesk', sans-serif";

// 튜닝
const TARGET_WIDTH_RATIO = 0.8;
const MIN_FONT_PX = 18;
const MAX_FONT_PX = 160;
const STEP = 3;
const DOT  = 1.2;
const SPRING = 0.03;
const DAMP   = 0.90;
const FORCE_NEAR = 2500;
const FORCE_FAR  = 900;
const JITTER     = 6;

const particles = [];
const mouse = { x: 0, y: 0, down: false };

function onPointer(e){
  const r = canvas.getBoundingClientRect();
  mouse.x = e.clientX - r.left;
  mouse.y = e.clientY - r.top;
}
addEventListener('pointermove', onPointer);
addEventListener('pointerdown', e => { mouse.down = true; onPointer(e); });
addEventListener('pointerup',   () => { mouse.down = false; });

function fit() {
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width  = W;
  canvas.height = H;
  console.log('[fit]', W, H);
}

async function waitFont(fontSpec){
  try { await document.fonts.load(fontSpec, "A"); } catch(e) { console.warn('fonts.load fail', e); }
  try { await document.fonts.ready; } catch(e) { console.warn('fonts.ready fail', e); }
}

function computeMetrics() {
  // 1) 기준 크기에서 최장 폭
  const baseSize = 100;
  const baseSpec = `500 ${baseSize}px ${FONT_FAMILY}`;
  ctx.font = baseSpec;

  const maxBaseW = LINES.reduce((m,t)=>Math.max(m, ctx.measureText(t).width), 0) || 1;
  const targetW  = Math.max(320, Math.min(W * TARGET_WIDTH_RATIO, 1600));
  const scale    = targetW / maxBaseW;

  // 2) 최종 폰트 크기/스펙
  const fontSize = Math.round(Math.max(MIN_FONT_PX, Math.min(MAX_FONT_PX, baseSize * scale)));
  const fontSpec = `500 ${fontSize}px ${FONT_FAMILY}`;
  const lineH    = Math.round(fontSize * 1.3);

  // 3) 실제 폭 다시 측정
  ctx.font = fontSpec;
  const maxLineW = LINES.reduce((m,t)=>Math.max(m, ctx.measureText(t).width), 0);

  // 4) 블록 중앙 배치(좌측 정렬 앵커)
  const totalH = LINES.length * lineH;
  const baseX  = Math.round((W - maxLineW) / 2);
  const startY = Math.round((H - totalH) / 2);

  return { fontSpec, fontSize, lineH, baseX, startY, maxLineW };
}

function drawTextBlock(fontSpec, baseX, startY, lineH, color = '#fff') {
  ctx.font = fontSpec;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = color;
  LINES.forEach((t,i)=> ctx.fillText(t, baseX, startY + i*lineH));
}

async function buildParticles() {
  particles.length = 0;

  // 1) 폰트 먼저 로드 (기본 스펙) → 정확한 계산
  const baseSpecForLoad = `500 100px ${FONT_FAMILY}`;
  await waitFont(baseSpecForLoad);

  const { fontSpec, lineH, baseX, startY, maxLineW } = computeMetrics();
  await waitFont(fontSpec);

  // 2) 먼저 텍스트를 직접 보여준다(폴백 겸 디버그)
  ctx.clearRect(0,0,W,H);
  drawTextBlock(fontSpec, baseX, startY, lineH, '#9ad'); // 연한 색으로 먼저 표기
  console.log('[text drawn]');

  // 3) 텍스트 영역만 샘플링
  const minX = Math.max(0, baseX);
  const maxX = Math.min(W, baseX + maxLineW);
  const minY = Math.max(0, startY);
  const maxY = Math.min(H, startY + LINES.length * lineH);

  const sw = Math.max(0, maxX - minX);
  const sh = Math.max(0, maxY - minY);

  if (sw === 0 || sh === 0) {
    console.warn('[sampling] zero-size rect', {minX,maxX,minY,maxY});
    return; // 폴백으로 텍스트가 그대로 보임
  }

  let img;
  try {
    img = ctx.getImageData(minX, minY, sw, sh);
  } catch (e) {
    console.error('getImageData failed', e);
    return; // 폴백 유지
  }

  const data = img.data, iw = img.width, ih = img.height;

  for (let y = 0; y < ih; y += STEP) {
    for (let x = 0; x < iw; x += STEP) {
      const a = data[(y * iw + x) * 4 + 3];
      if (a > 10) {
        const gx = minX + x;
        const gy = minY + y;
        particles.push({
          x:  gx + (Math.random()-0.5) * JITTER,
          y:  gy + (Math.random()-0.5) * JITTER,
          ox: gx, oy: gy,
          vx: 0,  vy: 0
        });
      }
    }
  }
  console.log('[particles]', particles.length);

  // 4) 파티클이 충분히 만들어졌으면 텍스트 지우고 입자만 보임
  if (particles.length > 0) {
    ctx.clearRect(0,0,W,H);
  }
}

function loop(){
  // 배경 잔상
  ctx.fillStyle = 'rgba(11,13,16,0.18)';
  ctx.fillRect(0,0,W,H);

  // 디버그 중앙점
  ctx.fillStyle = '#ff4040';
  ctx.beginPath();
  ctx.arc(W/2, H/2, 2, 0, Math.PI*2);
  ctx.fill();

  // 파티클
  if (particles.length > 0) {
    ctx.fillStyle = '#fff';
    for (const p of particles) {
      const dx = p.x - mouse.x;
      const dy = p.y - mouse.y;
      const d2 = dx*dx + dy*dy + 0.0001;
      const inv = Math.sqrt(d2);
      const f   = (mouse.down ? FORCE_NEAR : FORCE_FAR) / d2;

      p.vx += (dx/inv) * f;
      p.vy += (dy/inv) * f;

      p.vx += (p.ox - p.x) * SPRING;
      p.vy += (p.oy - p.y) * SPRING;

      p.vx *= DAMP;
      p.vy *= DAMP;

      p.x += p.vx;
      p.y += p.vy;

      ctx.fillRect(p.x, p.y, DOT, DOT);
    }
  }
  requestAnimationFrame(loop);
}

// 리사이즈: 즉시 반영 + 재샘플링
let resizeTimer = null;
addEventListener('resize', () => {
  fit();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(buildParticles, 150);
});

// 부팅
(async function ready(){
  fit();
  await buildParticles(); // 텍스트는 무조건 한번 보임 → 그다음 입자로 전환
  loop();
})();

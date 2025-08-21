// ===== Haiku Text Particles — robust, DPI-safe, resize-safe =====
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: true });

// ---------- Config ----------
const LINES = [
  "SPENT HOURS BACKFLOW",
  "SLOWLY RISING ROUND MY SKIN",
  "FOG DISSOLVES THE WALLS"
];
const FONT_FAMILY = "'Host Grotesk', sans-serif";

// 텍스트 박스 목표 폭 비율(화면폭의 82%), 폰트 클램프
const TARGET_WIDTH_RATIO = 0.82;
const MAX_TEXT_WIDTH     = 1600;
const MIN_FONT_PX        = 18;
const MAX_FONT_PX        = 160;

const STEP   = 3;     // 샘플 간격 (2=촘촘, 3~4=적당)
const DOT    = 1.2;   // 점 크기 (CSS px 기준)
const SPRING = 0.03;  // 복귀력
const DAMP   = 0.90;  // 감쇠
const FORCE_NEAR = 2500;
const FORCE_FAR  = 900;
const JITTER     = 6;

// ---------- State ----------
let DPR = 1;
let W = 0, H = 0;
const particles = [];
const mouse = { x: 0, y: 0, down: false };

// ---------- Pointer (CSS 좌표계) ----------
function setPointer(e){
  const r = canvas.getBoundingClientRect();
  mouse.x = e.clientX - r.left;
  mouse.y = e.clientY - r.top;
}
addEventListener('pointermove', setPointer);
addEventListener('pointerdown', e => { mouse.down = true; setPointer(e); });
addEventListener('pointerup',   () => { mouse.down = false; });

// ---------- Resize (풀창 + DPR 보정) ----------
function resizeCanvas() {
  const cssW = innerWidth;
  const cssH = innerHeight;

  DPR = Math.max(1, window.devicePixelRatio || 1);
  canvas.width  = Math.floor(cssW * DPR);    // 디바이스 픽셀
  canvas.height = Math.floor(cssH * DPR);
  canvas.style.width  = cssW + 'px';         // 표시(레아이웃) 크기
  canvas.style.height = cssH + 'px';

  ctx.setTransform(1,0,0,1,0,0);
  ctx.scale(DPR, DPR);                        // 이후 좌표는 CSS px로 쓴다

  W = cssW; H = cssH;
  console.log('[resize]', {W,H,DPR});
}

// ---------- Fonts ----------
async function waitFont(fontSpec){
  try { await document.fonts.load(fontSpec, "A"); } catch {}
  try { await document.fonts.ready; } catch {}
}

// ---------- Layout metrics (동적 폰트/정중앙 배치) ----------
function computeMetrics() {
  const baseSize = 100;
  const baseSpec = `500 ${baseSize}px ${FONT_FAMILY}`;
  ctx.font = baseSpec;

  const maxBaseWidth = LINES.reduce((m,t)=>Math.max(m, ctx.measureText(t).width), 0);
  const targetWidth = Math.max(320, Math.min(W * TARGET_WIDTH_RATIO, MAX_TEXT_WIDTH));
  const scale = targetWidth / Math.max(1, maxBaseWidth);

  const fontSize = Math.round(Math.max(MIN_FONT_PX, Math.min(MAX_FONT_PX, baseSize * scale)));
  const fontSpec = `500 ${fontSize}px ${FONT_FAMILY}`;
  const lineH    = Math.round(fontSize * 1.3);

  ctx.font = fontSpec;
  const maxLineW = LINES.reduce((m,t)=>Math.max(m, ctx.measureText(t).width), 0);

  const totalH = LINES.length * lineH;
  const baseX  = Math.round((W - maxLineW) / 2); // 중앙 기준 좌측정렬 앵커
  const startY = Math.round((H - totalH) / 2);

  return { fontSpec, fontSize, lineH, baseX, startY, maxLineW };
}

// ---------- Build Particles (DPR-safe sampling) ----------
async function buildParticles() {
  particles.length = 0;

  const { fontSpec, lineH, baseX, startY, maxLineW } = computeMetrics();
  await waitFont(fontSpec);

  // 1) 메인 캔버스에 텍스트를 CSS 좌표로 그림
  ctx.clearRect(0,0,W,H);
  ctx.font = fontSpec;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  LINES.forEach((t,i)=> ctx.fillText(t, baseX, startY + i*lineH));

  // 2) 샘플링은 디바이스 픽셀 좌표로 (DPR 곱)
  const sx = Math.max(0, Math.floor(baseX * DPR));
  const sy = Math.max(0, Math.floor(startY * DPR));
  const sw = Math.min(Math.floor(maxLineW * DPR), canvas.width - sx);
  const sh = Math.min(Math.floor(LINES.length * lineH * DPR), canvas.height - sy);

  // 텍스트 흔적 제거(렌더는 파티클만)
  ctx.clearRect(0,0,W,H);

  if (sw <= 0 || sh <= 0) {
    console.warn('[buildParticles] invalid sample rect', {sx,sy,sw,sh});
    return;
  }

  const img = canvas.getContext('2d', { willReadFrequently: true }).getImageData(sx, sy, sw, sh);
  const data = img.data, iw = img.width;

  const stepDev = Math.max(1, Math.round(STEP * DPR)); // 디바이스 픽셀 스텝

  for (let yDev = 0; yDev < img.height; yDev += stepDev) {
    for (let xDev = 0; xDev < img.width; xDev += stepDev) {
      const a = data[(yDev * iw + xDev) * 4 + 3];
      if (a > 10) {
        const gx = (sx + xDev) / DPR;  // 디바이스 → CSS
        const gy = (sy + yDev) / DPR;
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
}

// ---------- Loop ----------
function loop(){
  ctx.fillStyle = 'rgba(11,13,16,0.18)';
  ctx.fillRect(0,0,W,H);
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

    ctx.fillStyle = '#fff';
    ctx.fillRect(p.x, p.y, DOT, DOT);
  }
  requestAnimationFrame(loop);
}

// ---------- Resize handling ----------
let resizeTimer = null;
addEventListener('resize', () => {
  resizeCanvas();                  // 즉시 사이즈 반영
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { // 디바운스 후 재샘플링
    buildParticles();
  }, 150);
});

// ---------- Boot ----------
(async function ready(){
  resizeCanvas();        // 풀창 + DPR 스케일
  await buildParticles();// 샘플링(폰트 로드 포함)
  loop();
})();

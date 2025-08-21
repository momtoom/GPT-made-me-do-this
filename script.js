// ===== Minimal, DPR-less, always-visible text particles =====
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: true });

let W = 0, H = 0;
const LINES = [
  "SPENT HOURS BACKFLOW",
  "SLOWLY RISING ROUND MY SKIN",
  "FOG DISSOLVES THE WALLS"
];
const FONT_FAMILY = "'Host Grotesk', sans-serif";

// 튜닝 파라미터
const TARGET_WIDTH_RATIO = 0.8; // 텍스트 블록 폭 = 화면의 80%
const MIN_FONT_PX = 18;
const MAX_FONT_PX = 160;
const STEP = 1;      // 2=촘촘, 3~4=적당
const DOT  = 1;    // 점 크기
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
  canvas.width  = W;   // DPR 고려 안 함 (단순화)
  canvas.height = H;
}

async function waitFont(fontSpec){
  try { await document.fonts.load(fontSpec, "A"); } catch {}
  try { await document.fonts.ready; } catch {}
}

function computeMetrics() {
  // 기준 크기에서 최장폭 측정
  const baseSize = 100;
  const baseSpec = `500 ${baseSize}px ${FONT_FAMILY}`;
  ctx.font = baseSpec;

  const maxBaseW = LINES.reduce((m,t)=>Math.max(m, ctx.measureText(t).width), 0);
  const targetW  = Math.max(320, Math.min(W * TARGET_WIDTH_RATIO, 1600));
  const scale    = targetW / Math.max(1, maxBaseW);

  const fontSize = Math.round(
    Math.max(MIN_FONT_PX, Math.min(MAX_FONT_PX, baseSize * scale))
  );
  const fontSpec = `500 ${fontSize}px ${FONT_FAMILY}`;
  const lineH    = Math.round(fontSize * 1.3);

  ctx.font = fontSpec;
  const maxLineW = LINES.reduce((m,t)=>Math.max(m, ctx.measureText(t).width), 0);

  const totalH = LINES.length * lineH;
  const baseX  = Math.round((W - maxLineW) / 2);
  const startY = Math.round((H - totalH) / 2);

  return { fontSpec, lineH, baseX, startY, maxLineW };
}

async function buildParticles() {
  particles.length = 0;

  // 1) 폰트 가족부터 로드(기본 크기 스펙)
  const baseSpecForLoad = `500 100px ${FONT_FAMILY}`;
  await waitFont(baseSpecForLoad);

  // 2) 로드된 폰트로 정확한 폭/크기 계산
  const { fontSpec, lineH, baseX, startY, maxLineW } = computeMetrics();

  // 3) 최종 스펙도 보장(가끔 fallback 방지)
  await waitFont(fontSpec);

  // ...
}

  // 오프스크린 캔버스에 텍스트를 그리고 투명 픽셀만 샘플링
  const off = document.createElement('canvas');
  off.width = W; off.height = H;
  const octx = off.getContext('2d', { willReadFrequently: true });

  octx.clearRect(0,0,W,H);
  octx.font = fontSpec;
  octx.textBaseline = 'top';
  octx.textAlign = 'left';
  octx.fillStyle = '#fff';
  LINES.forEach((t,i)=> octx.fillText(t, baseX, startY + i*lineH));

  const minX = Math.max(0, baseX);
  const maxX = Math.min(W, baseX + maxLineW);
  const minY = Math.max(0, startY);
  const maxY = Math.min(H, startY + LINES.length * lineH);

  const img = octx.getImageData(minX, minY, maxX - minX, maxY - minY);
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
}

function loop(){
  // 배경 잔상
  ctx.fillStyle = 'rgba(11,13,16,0.18)';
  ctx.fillRect(0,0,W,H);

  // 디버그: 항상 보이는 빨간 점 (화면 중앙)
  ctx.fillStyle = '#ff4040';
  ctx.beginPath();
  ctx.arc(W/2, H/2, 2, 0, Math.PI*2);
  ctx.fill();

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

  requestAnimationFrame(loop);
}

// 리사이즈: 즉시 반영 + 재샘플링
let resizeTimer = null;
addEventListener('resize', () => {
  fit();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(buildParticles, 120);
});

// 부팅
(async function ready(){
  fit();
  await buildParticles();
  loop();
})();

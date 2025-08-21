const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: true });

let DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1)); // NEW: DPR 동적 반영
let W = 0, H = 0;

// ====== 폰트 세팅 ======
const LINES = [
  "SPENT HOURS BACKFLOW",
  "SLOWLY RISING ROUND MY SKIN",
  "FOG DISSOLVES THE WALLS"
];

const FONT_BASE = 100;                            // CHANGED: 보기 쉬운 배율 기준
const FONT_SIZE = Math.round(FONT_BASE);          // CHANGED: 캔버스에선 scale로 DPR 처리
const LINE_H    = Math.round(FONT_SIZE * 1.35);
const FONT_FAMILY = "'Host Grotesk', sans-serif";
const FONT_SPEC   = `500 ${FONT_SIZE}px ${FONT_FAMILY}`;   // 굵기 + 크기 + 폰트명

const STEP = 3;                                   // 샘플 간격 (작을수록 촘촘)
const DOT  = 1.2;                                 // 점 크기(캔버스 좌표계 기준)

const particles = [];
const mouse = { x: 0, y: 0, down: false };

// ====== 포인터 ======
function setPointer(e){
  const r = canvas.getBoundingClientRect();
  mouse.x = e.clientX - r.left;                   // CHANGED: 스케일 이후 좌표계 = CSS 픽셀
  mouse.y = e.clientY - r.top;
}
window.addEventListener('pointermove', setPointer);
window.addEventListener('pointerdown', e => { mouse.down = true; setPointer(e); });
window.addEventListener('pointerup',   () => { mouse.down = false; });

// ====== 리사이즈 (핵심 변경) ======
function resizeCanvas() {
  // 1) CSS 픽셀 기준 화면 크기
  const cssW = window.innerWidth;                 // CHANGED
  const cssH = window.innerHeight;                // CHANGED

  // 2) 렌더 타깃 해상도 (물리 픽셀)
  DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1)); // NEW
  canvas.width  = Math.floor(cssW * DPR);         // CHANGED
  canvas.height = Math.floor(cssH * DPR);         // CHANGED

  // 3) 표시 크기 (CSS)
  canvas.style.width  = cssW + 'px';              // NEW
  canvas.style.height = cssH + 'px';              // NEW

  // 4) 컨텍스트 스케일 (DPR 보정)
  ctx.setTransform(1, 0, 0, 1, 0, 0);             // CHANGED: 이전 스케일 초기화
  ctx.scale(DPR, DPR);                            // CHANGED: 이후 모든 그리기/좌표는 CSS 픽셀 기준

  // 내부 계산도 CSS 좌표계로
  W = cssW;                                       // CHANGED
  H = cssH;                                       // CHANGED
}

// ====== 폰트 로드 보장 ======
async function waitFont() {
  try { await document.fonts.load(FONT_SPEC, "A"); } catch {}
  try { await document.fonts.ready; } catch {}
}

// ====== 도우미 ======
function measureMaxLineWidth() {
  ctx.font = FONT_SPEC;
  let max = 0;
  for (const t of LINES) max = Math.max(max, ctx.measureText(t).width);
  return max;
}

// ====== 파티클 생성 (텍스트 샘플링) ======
async function buildParticles() {
  particles.length = 0;

  ctx.clearRect(0,0,W,H);
  ctx.font = FONT_SPEC;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';

  // 중앙 기준 좌측 정렬 앵커
  const totalH = LINES.length * LINE_H;
  const startY = (H / 2) - (totalH / 2);
  const maxLine = measureMaxLineWidth();
  const baseX   = (W / 2) - (maxLine / 2);

  // 텍스트 찍기 (메인 캔버스에 잠깐 찍고 샘플링 후 지움)
  LINES.forEach((t,i)=> ctx.fillText(t, baseX, startY + i*LINE_H));

  // 텍스트 영역만 샘플링
  const minX = Math.max(0, Math.floor(baseX));
  const maxX = Math.min(W, Math.ceil(baseX + maxLine));
  const minY = Math.max(0, Math.floor(startY));
  const maxY = Math.min(H, Math.ceil(startY + LINES.length * LINE_H));

  const img = ctx.getImageData(minX, minY, maxX - minX, maxY - minY);
  const data = img.data, iw = img.width;

  // 텍스트 지우기
  ctx.clearRect(0,0,W,H);

  for (let y = 0; y < img.height; y += STEP) {
    for (let x = 0; x < img.width; x += STEP) {
      const a = data[(y * iw + x) * 4 + 3];
      if (a > 10) {
        const gx = minX + x;
        const gy = minY + y;
        particles.push({
          x:  gx + (Math.random()-0.5)*6,
          y:  gy + (Math.random()-0.5)*6,
          ox: gx, oy: gy,
          vx: 0,  vy: 0
        });
      }
    }
  }
}

// ====== 루프 ======
function loop() {
  // 배경 잔상
  ctx.fillStyle = 'rgba(11,13,16,0.18)';
  ctx.fillRect(0,0,W,H);

  for (const p of particles) {
    const dx = p.x - mouse.x;                     // CHANGED: 좌표계가 CSS 기준
    const dy = p.y - mouse.y;
    const d2 = dx*dx + dy*dy + 0.0001;
    const f  = (mouse.down ? 2500 : 900) / d2;

    p.vx += (dx/Math.sqrt(d2)) * f;
    p.vy += (dy/Math.sqrt(d2)) * f;

    // 복귀 스프링
    p.vx += (p.ox - p.x) * 0.03;
    p.vy += (p.oy - p.y) * 0.03;

    // 감쇠
    p.vx *= 0.90;
    p.vy *= 0.90;

    p.x += p.vx;
    p.y += p.vy;

    ctx.fillStyle = '#fff';
    ctx.fillRect(p.x, p.y, DOT, DOT);             // CHANGED: DOT은 CSS 좌표계 기준
  }

  requestAnimationFrame(loop);
}

// ====== 리사이즈 디바운스 ======
let resizeTimer = null;
window.addEventListener('resize', () => {
  resizeCanvas();                                  // NEW: 즉시 사이즈 반영
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    buildParticles();                              // NEW: 새 크기에 맞춰 재샘플링
  }, 120);
});

// ====== 부팅 순서 ======
(async function ready(){
  await waitFont();                                // NEW: 폰트 로드 보장
  resizeCanvas();                                  // CHANGED: 풀창 + DPR 스케일
  await buildParticles();
  loop();
})();

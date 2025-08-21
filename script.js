// ===== Haiku Text Particles — full script.js =====

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: true });

// 화면 전체 사용 + DPR 대응
let DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
let W = 0, H = 0;

// 하이쿠 (이미 대문자)
const LINES = [
  "SPENT HOURS BACKFLOW",
  "SLOWLY RISING ROUND MY SKIN",
  "FOG DISSOLVES THE WALLS"
];

// 폰트
const FONT_FAMILY = "'Host Grotesk', sans-serif";

// 샘플링/렌더 파라미터(필요시 취향대로 조정)
const TARGET_WIDTH_RATIO = 0.85; // 텍스트 블록의 목표 가로폭 (화면의 85%)
const MAX_TEXT_WIDTH     = 1600; // 너무 커지는 것 방지 상한
const MIN_FONT_PX        = 18;
const MAX_FONT_PX        = 180;
const STEP               = 3;    // 2=촘촘, 3~4=적당, 5=빠름
const DOT                = 1.2;  // 점 크기 (CSS 픽셀 기준)
const SPRING             = 0.03; // 원위치 복귀 힘
const DAMP               = 0.90; // 감쇠
const FORCE_NEAR         = 2500; // 마우스 다운 시
const FORCE_FAR          = 900;  // 마우스 업 시
const JITTER             = 6;    // 초기 점 흩뿌림 정도

const particles = [];
const mouse = { x: 0, y: 0, down: false };

// ---------- 공통 유틸 ----------
function setPointer(e){
  const r = canvas.getBoundingClientRect();
  mouse.x = e.clientX - r.left; // CSS 좌표계
  mouse.y = e.clientY - r.top;
}
window.addEventListener('pointermove', setPointer);
window.addEventListener('pointerdown', e => { mouse.down = true; setPointer(e); });
window.addEventListener('pointerup',   () => { mouse.down = false; });

// 화면 크기 + DPR 반영
function resizeCanvas() {
  const cssW = window.innerWidth;
  const cssH = window.innerHeight;

  DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width  = Math.floor(cssW * DPR);
  canvas.height = Math.floor(cssH * DPR);
  canvas.style.width  = cssW + 'px';
  canvas.style.height = cssH + 'px';

  ctx.setTransform(1,0,0,1,0,0);
  ctx.scale(DPR, DPR); // 이후 좌표/치수는 CSS 픽셀 기준으로 사용

  W = cssW; H = cssH;
}

// 폰트 로드 완료까지 대기
async function waitFont(fontSpec) {
  try { await document.fonts.load(fontSpec, "A"); } catch {}
  try { await document.fonts.ready; } catch {}
}

// 최장 줄 기준으로 폰트/레이아웃 동적 계산
function computeMetrics() {
  // 1) 기준 크기로 최장 폭 측정
  const baseSize = 100;
  const baseSpec = `500 ${baseSize}px ${FONT_FAMILY}`;
  ctx.font = baseSpec;

  const maxBaseWidth = LINES.reduce((m,t)=>Math.max(m, ctx.measureText(t).width), 0);

  // 2) 목표 폭 = 화면의 85% (상한도 걸기)
  const targetWidth = Math.max(320, Math.min(W * TARGET_WIDTH_RATIO, MAX_TEXT_WIDTH));
  const scale = targetWidth / Math.max(1, maxBaseWidth);

  // 3) 실제 폰트 크기 산출 (하한/상한)
  const fontSize = Math.round(
    Math.max(MIN_FONT_PX, Math.min(MAX_FONT_PX, baseSize * scale))
  );
  const fontSpec = `500 ${fontSize}px ${FONT_FAMILY}`;
  const lineH = Math.round(fontSize * 1.3);

  // 4) 실제 폰트로 다시 폭 계산
  ctx.font = fontSpec;
  const maxLineW = LINES.reduce((m,t)=>Math.max(m, ctx.measureText(t).width), 0);

  // 5) 텍스트 블록을 화면 정중앙에 배치 (블록 내부는 좌측정렬)
  const totalH = LINES.length * lineH;
  const baseX  = Math.round((W - maxLineW) / 2);
  const startY = Math.round((H - totalH) / 2);

  return { fontSpec, lineH, baseX, startY, maxLineW };
}

// 텍스트를 잠깐 그려서 픽셀을 샘플링 → 파티클 생성
async function buildParticles() {
  particles.length = 0;

  const { fontSpec, lineH, baseX, startY, maxLineW } = computeMetrics();
  await waitFont(fontSpec);

  ctx.clearRect(0,0,W,H);
  ctx.font = fontSpec;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';

  // 텍스트 찍기
  LINES.forEach((t,i)=> ctx.fillText(t, baseX, startY + i*lineH));

  // 텍스트 영역만 샘플링(성능↑, 잘림 방지)
  const minX = Math.max(0, baseX);
  const maxX = Math.min(W, baseX + maxLineW);
  const minY = Math.max(0, startY);
  const maxY = Math.min(H, startY + LINES.length * lineH);

  const img = ctx.getImageData(minX, minY, maxX - minX, maxY - minY);
  const data = img.data, iw = img.width;

  // 텍스트 지우고 입자만 그릴 준비
  ctx.clearRect(0,0,W,H);

  for (let y = 0; y < img.height; y += STEP) {
    for (let x = 0; x < img.width; x += STEP) {
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
}

// 렌더 루프
function loop() {
  // 배경 잔상
  ctx.fillStyle = 'rgba(11,13,16,0.18)';
  ctx.fillRect(0,0,W,H);

  for (const p of particles) {
    // 마우스 반발력
    const dx = p.x - mouse.x;
    const dy = p.y - mouse.y;
    const d2 = dx*dx + dy*dy + 0.0001;
    const f  = (mouse.down ? FORCE_NEAR : FORCE_FAR) / d2;
    const inv = Math.sqrt(d2);
    p.vx += (dx/inv) * f;
    p.vy += (dy/inv) * f;

    // 원위치 복귀(스프링)
    p.vx += (p.ox - p.x) * SPRING;
    p.vy += (p.oy - p.y) * SPRING;

    // 감쇠
    p.vx *= DAMP;
    p.vy *= DAMP;

    // 이동
    p.x += p.vx;
    p.y += p.vy;

    // 점 그리기
    ctx.fillStyle = '#fff';
    ctx.fillRect(p.x, p.y, DOT, DOT);
  }

  requestAnimationFrame(loop);
}

// 리사이즈: 즉시 반영 + 디바운스 후 재샘플링
let resizeTimer = null;
window.addEventListener('resize', () => {
  resizeCanvas();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { buildParticles(); }, 120);
});

// 부팅
(async function ready(){
  resizeCanvas();         // 먼저 화면 맞춤
  await buildParticles(); // 폰트/레이아웃 맞춰 입자 생성
  loop();
})();

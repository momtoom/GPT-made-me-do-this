const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: true });

const DPR = Math.min(2, window.devicePixelRatio || 1);
let W = 0, H = 0;

function fit() {
  // CSS 픽셀 기준 표시 크기(최소 폭 1024 보장)
  const cssW = Math.max(1024, window.innerWidth);
  const cssH = window.innerHeight;

  // 화면에 보이는 크기(스타일)도 명시
  canvas.style.width  = cssW + 'px';
  canvas.style.height = cssH + 'px';

  // 실제 렌더링 해상도(DPR 반영)
  W = Math.floor(cssW * DPR);
  H = Math.floor(cssH * DPR);
  canvas.width  = W;
  canvas.height = H;
}

const LINES = [
  "SPENT HOURS BACKFLOW",
  "SLOWLY RISING ROUND MY SKIN",
  "FOG DISSOLVES THE WALLS"
];

// 폰트 지정: 굵기 + 크기 + 폰트명 순서 중요!
const FONT_SIZE   = Math.round(42 * DPR);
const FONT_FAMILY = '"Host Grotesk", sans-serif';
const FONT_SPEC   = `500 ${FONT_SIZE}px ${FONT_FAMILY}`;

const LINE_H = Math.round(FONT_SIZE * 1.35);
const STEP   = Math.max(2, Math.round(3 * DPR));  // 샘플 간격 (2=촘촘, 4=빠름)
const DOT    = Math.max(1, Math.round(1.1 * DPR)); // 점 크기

const particles = [];

const mouse = { x: 0, y: 0, down: false };
function setPointer(e){
  const r = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) * DPR;
  mouse.y = (e.clientY - r.top) * DPR;
}
window.addEventListener('pointermove', setPointer);
window.addEventListener('pointerdown', e => { mouse.down = true; setPointer(e); });
window.addEventListener('pointerup',   () => { mouse.down = false; });

function measureMaxLineWidth() {
  ctx.font = FONT_SPEC;
  let max = 0;
  for (const t of LINES) max = Math.max(max, ctx.measureText(t).width);
  return max;
}

// 폰트가 실제로 로드될 때까지 기다림 (중요!)
async function waitFont() {
  try { await document.fonts.load(FONT_SPEC, "A"); } catch {}
  try { await document.fonts.ready; } catch {}
}

async function buildParticles() {
  particles.length = 0;

  // 텍스트를 메인 캔버스에 잠깐 찍어 샘플링 → 곧바로 지움
  ctx.clearRect(0,0,W,H);
  ctx.font = FONT_SPEC;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';

  // 중앙 기준 좌측 정렬 앵커 계산
  const totalH  = LINES.length * LINE_H;
  const startY  = (H / 2) - (totalH / 2);
  const maxLine = measureMaxLineWidth();
  const baseX   = (W / 2) - (maxLine / 2);

  // 텍스트 찍기
  LINES.forEach((t,i)=> ctx.fillText(t, baseX, startY + i*LINE_H));

  // 텍스트 영역만 샘플링
  const minX = Math.max(0, Math.floor(baseX));
  const maxX = Math.min(W, Math.ceil(baseX + maxLine));
  const minY = Math.max(0, Math.floor(startY));
  const maxY = Math.min(H, Math.ceil(startY + LINES.length * LINE_H));

  const img = ctx.getImageData(minX, minY, maxX - minX, maxY - minY);
  const data = img.data, iw = img.width;

  // 텍스트 지우고 파티클만 그릴 준비
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

function loop() {
  // 배경 잔상
  ctx.fillStyle = 'rgba(11,13,16,0.18)';
  ctx.fillRect(0,0,W,H);

  for (const p of particles) {
    const dx = p.x - mouse.x;
    const dy = p.y - mouse.y;
    const d2 = dx*dx + dy*dy + 0.0001;
    const f  = (mouse.down ? 2500 : 900) / d2;

    p.vx += (dx/Math.sqrt(d2)) * f;
    p.vy += (dy/Math.sqrt(d2)) * f;

    // 원위치(ox, oy)로 끌어당기는 스프링
    p.vx += (p.ox - p.x) * 0.03;
    p.vy += (p.oy - p.y) * 0.03;

    // 감쇠
    p.vx *= 0.90;
    p.vy *= 0.90;

    p.x += p.vx;
    p.y += p.vy;

    ctx.fillStyle = '#fff';
    ctx.fillRect(p.x, p.y, DOT, DOT);
  }

  requestAnimationFrame(loop);
}

// 리사이즈 시: 사이즈 맞추고, 잠깐 쉬었다가 입자 재생성(과도한 호출 방지)
let resizeTimer = null;
window.addEventListener('resize', () => {
  fit();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { buildParticles(); }, 120);
});

// 최초 실행
(async function ready() {
  await waitFont();   // 폰트 로드 보장
  fit();              // 사이즈 세팅 (최소 1024, 중앙 배치)
  await buildParticles();
  loop();
})();

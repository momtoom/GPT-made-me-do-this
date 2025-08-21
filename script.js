const canvas = document.getElementById('stage');
// alpha:true 로 두자 (투명채널 필요)
const ctx = canvas.getContext('2d', { alpha: true });

const DPR = Math.min(1, window.devicePixelRatio || 1);
let W = 0, H = 0;

function fit() {
  // CSS 픽셀 기준 실제 표시 크기
  const cssW = Math.max(1024, window.innerWidth);
  const cssH = window.innerHeight;

  // 캔버스의 ‘표시 크기’도 명시적으로 맞춰주면 레이아웃이 안정적이에요
  const el = canvas; // id="stage"
  el.style.width = cssW + 'px';
  el.style.height = cssH + 'px';

  // 렌더링 해상도(DPR 적용)
  W = Math.floor(cssW * DPR);
  H = Math.floor(cssH * DPR);
  canvas.width  = W;
  canvas.height = H;
}
fit();
window.addEventListener('resize', () => requestAnimationFrame(fit));

const LINES = [
  "SPENT HOURS BACKFLOW",
  "SLOWLY RISING ROUND MY SKIN",
  "FOG DISSOLVES THE WALLS"
];

const FONT_SIZE = Math.round(100 * DPR);
const LINE_H = Math.round(FONT_SIZE * 1.35);
const FONT = `${FONT_SIZE}px 'Host Grotesk', sans-serif`;

const STEP = Math.max(2, Math.round(3 * DPR));   // 샘플 간격
const DOT  = Math.max(1, Math.round(1.2 * DPR)); // 점 크기
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
  ctx.font = FONT;
  let max = 0;
  for (const t of LINES) max = Math.max(max, ctx.measureText(t).width);
  return max;
}

async function buildParticles() {
  particles.length = 0;

  // 폰트 로딩 보장
  try { await document.fonts.ready; } catch {}

  // 텍스트를 메인 캔버스에 "잠깐" 찍어서 샘플링
  ctx.clearRect(0,0,W,H);
  ctx.font = FONT;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';

  const totalH = LINES.length * LINE_H;
  const startY = (H / 2) - (totalH / 2);
  const maxLineW = measureMaxLineWidth();
  const baseX = (W / 2) - (maxLineW / 2); // 중앙 기준 좌측 정렬 앵커

  // 텍스트 찍기
  LINES.forEach((t,i)=>{
    const y = startY + i*LINE_H;
    ctx.fillText(t, baseX, y);
  });

  // 텍스트 영역만 샘플링
  const minX = Math.max(0, Math.floor(baseX));
  const maxX = Math.min(W, Math.ceil(baseX + maxLineW));
  const minY = Math.max(0, Math.floor(startY));
  const maxY = Math.min(H, Math.ceil(startY + LINES.length * LINE_H));

  const img = ctx.getImageData(minX, minY, maxX - minX, maxY - minY);
  const data = img.data;
  const iw = img.width;

  // 캔버스 깨끗이 지워서 텍스트 흔적 제거
  ctx.clearRect(0,0,W,H);

  // 파티클 추출
  for (let y = 0; y < img.height; y += STEP) {
    for (let x = 0; x < img.width; x += STEP) {
      const a = data[(y * iw + x) * 4 + 3];
      if (a > 10) {
        const gx = (minX + x);
        const gy = (minY + y);
        particles.push({
          x: gx + (Math.random()-0.5)*6,
          y: gy + (Math.random()-0.5)*6,
          ox: gx, oy: gy,
          vx: 0, vy: 0
        });
      }
    }
  }

  console.log('[particles]', particles.length);
}

function loop() {
  // 배경 잔상
  ctx.fillStyle = 'rgba(11,13,16,0.18)';
  ctx.fillRect(0,0,W,H);

  for (const p of particles) {
    const dx = p.x - mouse.x;
    const dy = p.y - mouse.y;
    const d2 = dx*dx + dy*dy + 0.0001;
    const f = (mouse.down ? 2500 : 900) / d2;

    p.vx += (dx/Math.sqrt(d2)) * f;
    p.vy += (dy/Math.sqrt(d2)) * f;

    // 원위치로 복귀하는 힘
    p.vx += (p.ox - p.x) * 0.03;
    p.vy += (p.oy - p.y) * 0.03;

    p.vx *= 0.90;
    p.vy *= 0.90;

    p.x += p.vx;
    p.y += p.vy;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(p.x, p.y, DOT, DOT);
  }

  requestAnimationFrame(loop);
}

(async function ready(){
  await buildParticles();
  loop();
})();

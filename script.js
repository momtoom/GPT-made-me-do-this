const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: false });

const DPR = Math.min(2, window.devicePixelRatio || 1);
let W = 0, H = 0;

function fit() {
  W = Math.max(320, Math.floor(window.innerWidth * DPR));
  H = Math.max(320, Math.floor(window.innerHeight * DPR));
  canvas.width = W;
  canvas.height = H;
}
fit();
window.addEventListener('resize', () => requestAnimationFrame(fit));

const LINES = [
  "SPENT HOURS BACKFLOW",
  "SLOWLY RISING ROUND MY SKIN",
  "FOG DISSOLVES THE WALLS"
];

const FONT_SIZE = Math.round(42 * DPR);
const LINE_H = Math.round(FONT_SIZE * 1.35);
const FONT = `${FONT_SIZE}px 'Host Grotesk', sans-serif`;

const STEP = Math.max(2, Math.round(3 * DPR));   // 샘플링 간격(작을수록 촘촘)
const DOT = Math.max(1, Math.round(1.2 * DPR));  // 점 크기
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
  for (const t of LINES) {
    const w = ctx.measureText(t).width;
    if (w > max) max = w;
  }
  return max;
}

async function buildParticles() {
  particles.length = 0;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = FONT;

  // 화면 중앙을 기준으로 "왼쪽 정렬" 위치 계산
  const totalH = LINES.length * LINE_H;
  const startY = (H / 2) - (totalH / 2);
  const maxLineW = measureMaxLineWidth();
  const baseX = (W / 2) - (maxLineW / 2);  // 중앙에서 왼쪽 정렬 anchoring

  // 오프스크린 캔버스로 텍스트 그리기 & 픽셀 샘플링
  const off = new OffscreenCanvas(W, H);
  const octx = off.getContext('2d', { willReadFrequently: true });
  octx.fillStyle = '#000';
  octx.fillRect(0,0,W,H);
  octx.fillStyle = '#fff';
  octx.textBaseline = 'top';
  octx.textAlign = 'left';
  octx.font = FONT;

  LINES.forEach((text, i) => {
    const y = startY + i * LINE_H;
    octx.fillText(text, baseX, y);
  });

  const { data } = octx.getImageData(0, 0, W, H);

  // 샘플링
  for (let y = 0; y < H; y += STEP) {
    for (let x = 0; x < W; x += STEP) {
      const a = data[(y * W + x) * 4 + 3]; // alpha
      if (a > 128) {
        particles.push({
          x: x + (Math.random()-0.5)*8, 
          y: y + (Math.random()-0.5)*8,
          ox: x, oy: y,
          vx: 0, vy: 0
        });
      }
    }
  }
}

async function ready() {
  // 폰트 로드가 끝난 뒤에 샘플링해야 모양이 흐트러지지 않음
  try { await document.fonts.ready; } catch {}
  await buildParticles();
  loop();
}

function loop() {
  // 배경 잔상
  ctx.fillStyle = 'rgba(11,13,16,0.18)';
  ctx.fillRect(0,0,W,H);

  for (const p of particles) {
    // 마우스 반응: 눌렀을 때 더 강하게 흩어짐
    const dx = p.x - mouse.x;
    const dy = p.y - mouse.y;
    const d2 = dx*dx + dy*dy + 0.0001;
    const f = (mouse.down ? 2500 : 900) / d2;
    p.vx += (dx / Math.sqrt(d2)) * f;
    p.vy += (dy / Math.sqrt(d2)) * f;

    // 복귀(스프링)
    p.vx += (p.ox - p.x) * 0.03;
    p.vy += (p.oy - p.y) * 0.03;

    // 감쇠
    p.vx *= 0.90;
    p.vy *= 0.90;

    p.x += p.vx;
    p.y += p.vy;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(p.x, p.y, DOT, DOT);
  }

  requestAnimationFrame(loop);
}

ready();

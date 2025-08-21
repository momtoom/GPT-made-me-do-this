// ===== Text Particles: edge-spawn → converge → mouse react =====
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: true });

let W = 0, H = 0;

const LINES = [
  "SPENT HOURS BACKFLOW",
  "SLOWLY RISING ROUND MY SKIN",
  "FOG DISSOLVES THE WALLS"
];
const FONT_FAMILY = "'Host Grotesk', sans-serif";

// ---- Tuning ----
const TARGET_WIDTH_RATIO = 0.8; // 텍스트 블록 가로 폭(화면의 비율)
const MIN_FONT_PX = 18;
const MAX_FONT_PX = 160;

// 샘플링 밀도 / 점 크기
const STEP = 3;              // 2=촘촘, 3~4=적당, 5=빠름
const DOT  = 1.2;

// 물리 파라미터
const SPRING = 0.05;         // 목표점으로 끌리는 힘(스프링)
const DAMP   = 0.90;         // 감쇠(공기저항)
const MAX_SPEED = 12;        // 속도 캡

// 마우스 반응
const FORCE_MOUSE_UP   = 900;   // 마우스 업일 때 반발
const FORCE_MOUSE_DOWN = 2500;  // 마우스 다운일 때 반발
const FORCE_RADIUS     = 220;   // 반응 반경(px)
const EDGE_JITTER      = 10;    // 가장자리 스폰 시 약간의 랜덤

// 연출: 가장자리에서 시작해 서서히 모이기
const EDGE_SPAWN = true;        // true면 가장자리 스폰
const STAGGER_MS = 600;         // 점마다 합류 지연의 최대치(ms)
const WANDER     = 0.12;        // 미세한 흔들림

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
}

// 폰트 로드 보장
async function waitFont(fontSpec){
  try { await document.fonts.load(fontSpec, "A"); } catch {}
  try { await document.fonts.ready; } catch {}
}

// 동적 레이아웃(폰트 크기/중앙 배치)
function computeMetrics() {
  const baseSize = 100;
  const baseSpec = `500 ${baseSize}px ${FONT_FAMILY}`;
  ctx.font = baseSpec;

  const maxBaseW = LINES.reduce((m,t)=>Math.max(m, ctx.measureText(t).width), 0) || 1;
  const targetW  = Math.max(320, Math.min(W * TARGET_WIDTH_RATIO, 1600));
  const scale    = targetW / maxBaseW;

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

// 가장자리 스폰 좌표 생성
function randomEdgePosition() {
  // 0:상 1:우 2:하 3:좌
  const side = Math.floor(Math.random()*4);
  if (side === 0)   return { x: Math.random()*W,        y: -EDGE_JITTER + Math.random()*EDGE_JITTER };
  if (side === 1)   return { x: W+EDGE_JITTER,          y: Math.random()*H };
  if (side === 2)   return { x: Math.random()*W,        y: H+EDGE_JITTER };
  /* side === 3 */  return { x: -EDGE_JITTER + Math.random()*EDGE_JITTER, y: Math.random()*H };
}

async function buildParticles() {
  particles.length = 0;

  // 폰트 먼저 로드
  const baseSpecForLoad = `500 100px ${FONT_FAMILY}`;
  await waitFont(baseSpecForLoad);

  const { fontSpec, lineH, baseX, startY, maxLineW } = computeMetrics();
  await waitFont(fontSpec);

  // 오프스크린에 텍스트 렌더 → 알파로 샘플링
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

  const now = performance.now();

  for (let y = 0; y < ih; y += STEP) {
    for (let x = 0; x < iw; x += STEP) {
      const a = data[(y * iw + x) * 4 + 3];
      if (a > 10) {
        const gx = minX + x;
        const gy = minY + y;

        // 가장자리에서 시작 → 목표(ox,oy)로 모여듦
        let sx = gx, sy = gy;
        if (EDGE_SPAWN) {
          const p0 = randomEdgePosition();
          sx = p0.x; sy = p0.y;
        } else {
          // 화면 내부 랜덤 시작
          sx = Math.random()*W;
          sy = Math.random()*H;
        }

        particles.push({
          // 현재 위치/속도
          x: sx, y: sy, vx: 0, vy: 0,
          // 목표 위치
          ox: gx, oy: gy,
          // 합류 지연(점마다 다르게)
          startAt: now + Math.random()*STAGGER_MS
        });
      }
    }
  }
}

// 메인 루프
function loop() {
  // 배경 잔상
  ctx.fillStyle = 'rgba(11,13,16,0.18)';
  ctx.fillRect(0,0,W,H);

  const t = performance.now();

  for (const p of particles) {
    // 합류 시간 전에는 살짝 헤엄치듯이
    let springK = 0;
    if (t >= p.startAt) {
      springK = SPRING;
    } else {
      // 모이기 전에는 목표로의 힘을 약하게 (0) + 약간의 노이즈
      p.vx += (Math.random()-0.5) * WANDER;
      p.vy += (Math.random()-0.5) * WANDER;
    }

    // 마우스 반작용
    const dx = p.x - mouse.x;
    const dy = p.y - mouse.y;
    const d2 = dx*dx + dy*dy;
    if (d2 < FORCE_RADIUS*FORCE_RADIUS) {
      const inv = Math.sqrt(d2) || 1;
      const repel = (mouse.down ? FORCE_MOUSE_DOWN : FORCE_MOUSE_UP) / Math.max(400, d2);
      p.vx += (dx / inv) * repel;
      p.vy += (dy / inv) * repel;
    }

    // 스프링(목표점으로 복귀)
    p.vx += (p.ox - p.x) * springK;
    p.vy += (p.oy - p.y) * springK;

    // 감쇠
    p.vx *= DAMP;
    p.vy *= DAMP;

    // 속도 캡
    const sp2 = p.vx*p.vx + p.vy*p.vy;
    if (sp2 > MAX_SPEED*MAX_SPEED) {
      const s = Math.sqrt(sp2);
      p.vx = p.vx / s * MAX_SPEED;
      p.vy = p.vy / s * MAX_SPEED;
    }

    // 이동
    p.x += p.vx;
    p.y += p.vy;

    // 렌더
    ctx.fillStyle = '#fff';
    ctx.fillRect(p.x, p.y, DOT, DOT);
  }

  requestAnimationFrame(loop);
}

// 리사이즈: 즉시 반영 + 디바운스 재샘플링
let resizeTimer = null;
addEventListener('resize', () => {
  fit();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(buildParticles, 150);
});

// 부팅
(async function ready(){
  fit();
  // 폰트 로드 & 파티클 생성
  await buildParticles();
  loop();
})();

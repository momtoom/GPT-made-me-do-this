// ===== Murmuration → Cursor-follow → Text-mask reveal =====
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: true });

let W=0, H=0;
const mouse = { x: 0, y: 0, down:false };
addEventListener('pointermove', e=>{ const r=canvas.getBoundingClientRect(); mouse.x=e.clientX-r.left; mouse.y=e.clientY-r.top; });
addEventListener('pointerdown', e=>{ mouse.down=true; });
addEventListener('pointerup',   e=>{ mouse.down=false; });

const LINES = [
  "SPENT HOURS BACKFLOW",
  "SLOWLY RISING ROUND MY SKIN",
  "FOG DISSOLVES THE WALLS"
];
const FONT_FAMILY = "'Host Grotesk', sans-serif";

// ---------- params ----------
const BG_FADE   = 0.15;    // 잔상
const STEP      = 3;       // 텍스트 샘플 간격(2=빽빽, 4=빠름)
const DOT       = 1.2;     // 점 크기
const EDGE_JIT  = 12;      // 가장자리 스폰 흔들림
const N_FACTOR  = 0.45;    // 화면 대비 입자 수 비율(적으면 0.3~0.4, 많으면 0.6)
const SWARM_PULL= 0.0009;  // 마우스 쪽으로 끌림(스웜)
const ALIGN     = 0.05;    // 정렬(평균 속도 쪽으로)
const SEPARATE  = 2600;    // 분리(충돌 방지)
const DAMP      = 0.93;    // 속도 감쇠
const MAX_SPD   = 6;       // 속도 캡
const REVEAL_R  = 140;     // 커서 주변 ‘마스크’ 반경
const SPRING    = 0.08;    // 글자 목표점으로 끌림
const UNCLAIM_D = 24;      // 목표점 근접시 점을 해제(다시 스웜으로)

// ---------- state ----------
let particles = [];
let textPts = [];          // {x,y,claimed:false}
let buckets = null;        // 공간 해시(텍스트 포인트 가속)
const BUCKET = 24;         // 버킷 크기(px)

// ---------- utils ----------
function fit(){
  W = innerWidth; H = innerHeight;
  canvas.width = W; canvas.height = H;
}
async function waitFont(spec){
  try { await document.fonts.load(spec, "A"); } catch {}
  try { await document.fonts.ready; } catch {}
}
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function fromEdge(){
  const s = Math.floor(Math.random()*4);
  if (s===0) return {x:Math.random()*W, y:-EDGE_JIT+Math.random()*EDGE_JIT};
  if (s===1) return {x:W+EDGE_JIT,      y:Math.random()*H};
  if (s===2) return {x:Math.random()*W, y:H+EDGE_JIT};
  return {x:-EDGE_JIT+Math.random()*EDGE_JIT, y:Math.random()*H};
}
function keyFor(x,y){ return ((x/BUCKET)|0)+','+((y/BUCKET)|0); }
function buildBuckets(){
  buckets = new Map();
  for (let i=0;i<textPts.length;i++){
    const p = textPts[i];
    const k = keyFor(p.x, p.y);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(i);
  }
}
function nearbyTextIndices(cx,cy,r){
  const res = [];
  const minX = Math.floor((cx-r)/BUCKET), maxX=Math.floor((cx+r)/BUCKET);
  const minY = Math.floor((cy-r)/BUCKET), maxY=Math.floor((cy+r)/BUCKET);
  for(let gx=minX; gx<=maxX; gx++){
    for(let gy=minY; gy<=maxY; gy++){
      const k = gx+','+gy;
      const arr = buckets.get(k);
      if(!arr) continue;
      for(const idx of arr){
        const tp = textPts[idx];
        if (!tp.claimed){
          const dx = tp.x - cx, dy = tp.y - cy;
          if (dx*dx+dy*dy <= r*r) res.push(idx);
        }
      }
    }
  }
  return res;
}

// ---------- build text points ----------
function computeMetrics(){
  const base = 100;
  const baseSpec = `500 ${base}px ${FONT_FAMILY}`;
  ctx.font = baseSpec;

  const maxBaseW = LINES.reduce((m,t)=>Math.max(m, ctx.measureText(t).width),0)||1;
  const targetW = Math.max(320, Math.min(W*0.85, 1600));
  const scale = targetW/maxBaseW;

  const fontSize = clamp(Math.round(base*scale), 18, 170);
  const fontSpec = `500 ${fontSize}px ${FONT_FAMILY}`;
  const lineH = Math.round(fontSize*1.3);

  ctx.font = fontSpec;
  const maxW = LINES.reduce((m,t)=>Math.max(m, ctx.measureText(t).width),0);
  const totalH = LINES.length*lineH;
  const baseX = Math.round((W - maxW)/2);
  const startY = Math.round((H - totalH)/2);

  return {fontSpec,lineH,baseX,startY,maxW};
}

async function buildTextPoints(){
  textPts = [];

  const baseSpecForLoad = `500 100px ${FONT_FAMILY}`;
  await waitFont(baseSpecForLoad);
  const {fontSpec,lineH,baseX,startY,maxW} = computeMetrics();
  await waitFont(fontSpec);

  const off = document.createElement('canvas');
  off.width=W; off.height=H;
  const octx = off.getContext('2d', {willReadFrequently:true});
  octx.clearRect(0,0,W,H);
  octx.font = fontSpec;
  octx.textBaseline='top';
  octx.textAlign='left';
  octx.fillStyle='#fff';
  LINES.forEach((t,i)=> octx.fillText(t, baseX, startY+i*lineH));

  const minX = Math.max(0, baseX);
  const maxX = Math.min(W, baseX+maxW);
  const minY = Math.max(0, startY);
  const maxY = Math.min(H, startY+LINES.length*lineH);
  const img = octx.getImageData(minX, minY, maxX-minX, maxY-minY);
  const data = img.data, iw=img.width, ih=img.height;

  for(let y=0;y<ih;y+=STEP){
    for(let x=0;x<iw;x+=STEP){
      const a = data[(y*iw+x)*4+3];
      if (a>10) textPts.push({x:minX+x, y:minY+y, claimed:false});
    }
  }
  buildBuckets();
}

// ---------- particles ----------
function buildSwarm(){
  particles.length=0;
  const targetN = Math.min(textPts.length, Math.floor((W*H)/1000*N_FACTOR));
  for(let i=0;i<targetN;i++){
    const s = fromEdge();
    particles.push({
      x:s.x, y:s.y, vx:0, vy:0,
      // text targeting
      tidx:-1  // -1=스웜, >=0 이면 해당 textPts로 스프링
    });
  }
}

// ---------- loop ----------
function loop(){
  // 배경 잔상
  ctx.fillStyle = `rgba(11,13,16,${BG_FADE})`;
  ctx.fillRect(0,0,W,H);

  // 커서 주변 텍스트 포인트 후보들(미리 뽑아두고 입자들이 나눠가짐)
  const cand = nearbyTextIndices(mouse.x, mouse.y, REVEAL_R);

  // 입자 업데이트
  for (const p of particles){
    // 1) 타깃 할당/해제
    if (p.tidx>=0){
      const tp = textPts[p.tidx];
      // 목표 근접하면 해제해서 다른 입자도 쓸 수 있게
      const dx = tp.x - p.x, dy = tp.y - p.y;
      if (dx*dx+dy*dy < UNCLAIM_D*UNCLAIM_D) { tp.claimed=false; p.tidx=-1; }
      // 커서가 멀어지면 해제
      const mdx = tp.x - mouse.x, mdy = tp.y - mouse.y;
      if (mdx*mdx+mdy*mdy > (REVEAL_R*REVEAL_R)*1.4){ tp.claimed=false; p.tidx=-1; }
    }
    if (p.tidx<0 && cand.length){
      // 가장 가까운 후보 하나를 가져감(간단히 pop)
      // (더 정교하게 하려면 실제 최근접 검색으로 교체 가능)
      const idx = cand.pop();
      if (idx!==undefined){
        const tp = textPts[idx];
        if (!tp.claimed){ tp.claimed=true; p.tidx=idx; }
      }
    }

    // 2) 힘 계산
    let ax=0, ay=0;

    // (a) 스웜: 커서쪽으로 약하게 끌림 + 부드러운 정렬
    const mx = mouse.x - p.x, my = mouse.y - p.y;
    ax += mx * SWARM_PULL;
    ay += my * SWARM_PULL;

    // (b) 간단한 분리(근접 입자 반발) — 근사: 커서 반경 이용
    const d2m = mx*mx + my*my;
    const repel = (mouse.down? 1.8:1.0) * SEPARATE / Math.max(400, d2m);
    ax -= mx * repel;
    ay -= my * repel;

    // (c) 텍스트 타깃이 있으면 스프링으로 강하게 끌림
    if (p.tidx>=0){
      const tp = textPts[p.tidx];
      ax += (tp.x - p.x) * SPRING;
      ay += (tp.y - p.y) * SPRING;
    }

    // (d) 정렬: 자신의 속도 유지 방향성 조금 강조
    ax += p.vx * ALIGN;
    ay += p.vy * ALIGN;

    // 3) 속도/위치
    p.vx = (p.vx + ax) * DAMP;
    p.vy = (p.vy + ay) * DAMP;
    const sp = Math.hypot(p.vx,p.vy);
    if (sp>MAX_SPD){ p.vx *= MAX_SPD/sp; p.vy *= MAX_SPD/sp; }

    p.x += p.vx;
    p.y += p.vy;

    // 4) 테두리에서 튕김
    if (p.x<0||p.x>W){ p.vx*=-0.6; p.x = clamp(p.x, 0, W); }
    if (p.y<0||p.y>H){ p.vy*=-0.6; p.y = clamp(p.y, 0, H); }

    // 5) 렌더
    ctx.fillStyle = '#fff';
    ctx.fillRect(p.x, p.y, DOT, DOT);
  }

  requestAnimationFrame(loop);
}

// ---------- resize & rebuild ----------
let resizeTimer=null;
addEventListener('resize', ()=>{
  fit();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(async ()=>{
    await buildTextPoints();
    buildSwarm();
  }, 150);
});

// ---------- boot ----------
(async function ready(){
  fit();
  await buildTextPoints(); // 텍스트 포인트 필드 생성
  buildSwarm();           // 가장자리 스폰
  loop();
})();

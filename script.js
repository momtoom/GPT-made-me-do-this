// ===== Murmuration + Masked Text Reveal (organic) =====
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: true });

let W=0, H=0;
const mouse = { x: 0, y: 0, overText: false, down:false };
addEventListener('pointermove', e=>{ const r=canvas.getBoundingClientRect(); mouse.x=e.clientX-r.left; mouse.y=e.clientY-r.top; });
addEventListener('pointerdown', ()=>{ mouse.down=true; });
addEventListener('pointerup',   ()=>{ mouse.down=false; });

const LINES = [
  "SPENT HOURS BACKFLOW",
  "SLOWLY RISING ROUND MY SKIN",
  "FOG DISSOLVES THE WALLS"
];
const FONT_FAMILY = "'Host Grotesk', sans-serif";

// ---------- params (감각은 여기서 튜닝) ----------
const BG_FADE   = 0.15;   // 잔상
const STEP      = 3;      // 텍스트 샘플 간격
const DOT       = 1.1;    // 점 크기

// Swarm(boids)
const ALIGN_W   = 0.04;   // 정렬
const COHESION_W= 0.015;  // 응집
const SEPARATE_W= 0.35;   // 분리(짧은 거리에서 강함)
const SEPARATE_R= 26;     // 분리 반경(px)
const FLOW_W    = 0.18;   // 흐름장(곡선 경로) 가중치
const CURSOR_W  = 0.006;  // 커서 추적(아주 약하게)
const DAMP      = 0.93;   // 감쇠
const MAX_SPD   = 5.8;    // 속도 캡

// Text reveal
const REVEAL_R  = 120;    // 커서 주변 마스크 반경
const SPRING    = 0.085;  // 글자 목표점으로 스프링
const UNCLAIM_D = 20;     // 목표 근접 시 텍스트 포인트 반환
const TEXT_HYST = 18;     // 텍스트 영역 히스테리시스

// 수/스폰
const N_FACTOR  = 0.45;   // 입자 수(화면 넓이 대비)
const EDGE_JIT  = 10;     // 가장자리 스폰 흔들림
const BUCKET    = 30;     // 공간 해시 셀 크기(px)

// ---------- state ----------
let particles = [];        // {x,y,vx,vy,tidx}
let textPts = [];          // 텍스트 픽셀 포인트 {x,y,claimed}
let textRect = {x:0,y:0,w:0,h:0}; // 텍스트 박스
let buckets = null;        // 텍스트 포인트용 공간 해시

// ---------- utils ----------
function fit(){ W=innerWidth; H=innerHeight; canvas.width=W; canvas.height=H; }
async function waitFont(spec){ try{await document.fonts.load(spec,"A");}catch{} try{await document.fonts.ready;}catch{} }
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function fromEdge(){
  const s = Math.floor(Math.random()*4);
  if (s===0) return {x:Math.random()*W, y:-EDGE_JIT+Math.random()*EDGE_JIT};
  if (s===1) return {x:W+EDGE_JIT,      y:Math.random()*H};
  if (s===2) return {x:Math.random()*W, y:H+EDGE_JIT};
  return {x:-EDGE_JIT+Math.random()*EDGE_JIT, y:Math.random()*H};
}

// curl-like flow (부드러운 곡선 움직임)
function flow(ax, ay, t){
  // 간단한 합성장: 위치/시간에 따른 회전 벡터
  const s = 0.0018;
  const u = Math.sin((ax+ay)*s + t*0.0013);
  const v = Math.cos((ax-ay)*s + t*0.0011);
  // (u,v)에 90도 회전 성분 좀 섞기
  return { x: (u - v*0.35), y: (v + u*0.35) };
}

// ---------- build text points ----------
function computeMetrics(){
  const base = 100;
  const baseSpec = `500 ${base}px ${FONT_FAMILY}`;
  ctx.font = baseSpec;
  const maxBaseW = LINES.reduce((m,t)=>Math.max(m, ctx.measureText(t).width),0)||1;
  const targetW = Math.max(320, Math.min(W*0.84, 1600));
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
function keyFor(x,y){ return ((x/BUCKET)|0)+','+((y/BUCKET)|0); }
function buildBuckets(){
  buckets = new Map();
  for (let i=0;i<textPts.length;i++){
    const p = textPts[i];
    const k = keyFor(p.x,p.y);
    if(!buckets.has(k)) buckets.set(k,[]);
    buckets.get(k).push(i);
  }
}
function nearbyTextIndices(cx,cy,r){
  const res=[];
  const minX = Math.floor((cx-r)/BUCKET), maxX=Math.floor((cx+r)/BUCKET);
  const minY = Math.floor((cy-r)/BUCKET), maxY=Math.floor((cy+r)/BUCKET);
  for(let gx=minX; gx<=maxX; gx++){
    for(let gy=minY; gy<=maxY; gy++){
      const arr = buckets.get(gx+','+gy); if(!arr) continue;
      for(const idx of arr){
        const tp = textPts[idx];
        if(!tp.claimed){
          const dx=tp.x-cx, dy=tp.y-cy;
          if(dx*dx+dy*dy<=r*r) res.push(idx);
        }
      }
    }
  }
  return res;
}

async function buildTextPoints(){
  textPts.length=0;

  const baseSpecForLoad = `500 100px ${FONT_FAMILY}`;
  await waitFont(baseSpecForLoad);
  const {fontSpec,lineH,baseX,startY,maxW} = computeMetrics();
  await waitFont(fontSpec);

  // 텍스트 렌더링 → 포인트 샘플링
  const off = document.createElement('canvas');
  off.width=W; off.height=H;
  const octx = off.getContext('2d',{willReadFrequently:true});
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
      if(a>10) textPts.push({x:minX+x, y:minY+y, claimed:false});
    }
  }
  textRect = {x:minX, y:minY, w:maxX-minX, h:maxY-minY};
  buildBuckets();
}

function buildSwarm(){
  particles.length=0;
  const n = Math.min(textPts.length, Math.floor((W*H)/1000*N_FACTOR));
  for(let i=0;i<n;i++){
    const s = fromEdge();
    particles.push({ x:s.x, y:s.y, vx:0, vy:0, tidx:-1 });
  }
}

// 마우스가 텍스트 영역 위인지 검사(약간 여유)
function isMouseOverText(){
  const m = TEXT_HYST;
  return mouse.x >= textRect.x-m && mouse.x <= textRect.x+textRect.w+m &&
         mouse.y >= textRect.y-m && mouse.y <= textRect.y+textRect.h+m;
}

// ---------- loop ----------
function loop(){
  const t = performance.now();

  // 배경 잔상
  ctx.fillStyle = `rgba(11,13,16,${BG_FADE})`;
  ctx.fillRect(0,0,W,H);

  // 텍스트 영역 위에 있을 때만 마스크 활성화
  mouse.overText = isMouseOverText();
  const candidates = mouse.overText ? nearbyTextIndices(mouse.x, mouse.y, REVEAL_R) : [];

  // 간단한 이웃 탐색(보이드용): 같은 버킷 기반
  // 파티클을 버킷에 넣기
  const grid = new Map();
  const keyP = (x,y)=> ((x/BUCKET)|0)+','+((y/BUCKET)|0);
  for(let i=0;i<particles.length;i++){
    const p = particles[i];
    const k = keyP(p.x,p.y);
    if(!grid.has(k)) grid.set(k,[]);
    grid.get(k).push(i);
  }
  const neighborIdx = (x,y)=>{
    const res=[];
    const gx=(x/BUCKET)|0, gy=(y/BUCKET)|0;
    for(let ix=gx-1; ix<=gx+1; ix++){
      for(let iy=gy-1; iy<=gy+1; iy++){
        const arr = grid.get(ix+','+iy);
        if(arr) res.push(...arr);
      }
    }
    return res;
  };

  // 업데이트
  for(let i=0;i<particles.length;i++){
    const p = particles[i];

    // 텍스트 모드 탈출: 텍스트 영역 벗어나면 claim 해제
    if(!mouse.overText && p.tidx>=0){ textPts[p.tidx].claimed=false; p.tidx=-1; }

    // 새 타깃 할당(마스크)
    if(mouse.overText && p.tidx<0 && candidates.length){
      const idx = candidates.pop();
      if(idx!==undefined){
        const tp = textPts[idx];
        if(!tp.claimed){ tp.claimed=true; p.tidx=idx; }
      }
    }

    // 힘들
    let ax=0, ay=0;

    // 흐름장(곡선 경로)
    const f = flow(p.x, p.y, t);
    ax += f.x * FLOW_W;
    ay += f.y * FLOW_W;

    // 커서 추적(아주 약함, 떼가 따라다니는 인상만)
    const mx = mouse.x - p.x, my = mouse.y - p.y;
    ax += mx * CURSOR_W;
    ay += my * CURSOR_W;

    // 이웃 기반 보이드(정렬/응집/분리)
    const neigh = neighborIdx(p.x, p.y);
    let cx=0, cy=0, avx=0, avy=0, count=0;
    let sx=0, sy=0; // separation
    for(const j of neigh){
      if(j===i) continue;
      const q = particles[j];
      const dx = q.x - p.x, dy = q.y - p.y;
      const d2 = dx*dx+dy*dy; if(d2<1e-6) continue;
      const d = Math.sqrt(d2);
      // 분리
      if(d < SEPARATE_R){
        const inv = 1/Math.max(6,d);
        sx -= dx*inv; sy -= dy*inv;
      }
      // 정렬/응집용 누적
      cx += q.x; cy += q.y;
      avx += q.vx; avy += q.vy;
      count++;
    }
    if(count>0){
      // 응집
      cx/=count; cy/=count;
      ax += (cx - p.x) * COHESION_W;
      ay += (cy - p.y) * COHESION_W;
      // 정렬
      avx/=count; avy/=count;
      ax += avx * ALIGN_W;
      ay += avy * ALIGN_W;
      // 분리
      ax += sx * SEPARATE_W;
      ay += sy * SEPARATE_W;
    }

    // 텍스트 타깃이 있으면 스프링으로 모이기 (커서 주변에서만 글자 형성)
    if(p.tidx>=0){
      const tp = textPts[p.tidx];
      ax += (tp.x - p.x) * SPRING;
      ay += (tp.y - p.y) * SPRING;

      // 목표 가까우면 반환(너무 빽빽해지지 않도록)
      const dx = tp.x - p.x, dy = tp.y - p.y;
      if(dx*dx+dy*dy < UNCLAIM_D*UNCLAIM_D){
        tp.claimed=false; p.tidx=-1;
      }
    }

    // 속도/위치 업데이트
    p.vx = (p.vx + ax) * DAMP;
    p.vy = (p.vy + ay) * DAMP;
    const sp = Math.hypot(p.vx,p.vy);
    if(sp>MAX_SPD){ p.vx *= MAX_SPD/sp; p.vy *= MAX_SPD/sp; }

    p.x += p.vx; p.y += p.vy;

    // 경계 반사
    if (p.x<0||p.x>W){ p.vx*=-0.6; p.x = clamp(p.x, 0, W); }
    if (p.y<0||p.y>H){ p.vy*=-0.6; p.y = clamp(p.y, 0, H); }

    // 렌더
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
  await buildTextPoints(); // 텍스트 포인트 구축
  buildSwarm();           // 떼 생성
  loop();
})();

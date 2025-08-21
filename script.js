const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: false });

// 디버그: 부팅 로그
console.log('[vibe] boot');

const DPR = Math.min(2, window.devicePixelRatio || 1);
let W = 0, H = 0;

function resize() {
  // iOS에서 레이아웃 전 0 나오는 경우 방지
  const w = Math.max(320, Math.floor(window.innerWidth  * DPR));
  const h = Math.max(320, Math.floor(window.innerHeight * DPR));
  W = w; H = h;
  canvas.width = W;
  canvas.height = H;
}
resize();
window.addEventListener('resize', () => {
  // 주소창 등장/숨김 등으로 연쇄 리사이즈 방어
  requestAnimationFrame(resize);
});

const rand = (a,b)=>a+Math.random()*(b-a);
const TAU = Math.PI*2;

const MOUSE = { x: W/2, y: H/2, down:false };
const toCanvas = e => {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * DPR;
  const y = (e.clientY - rect.top) * DPR;
  return {x,y};
};
canvas.style.touchAction = 'none'; // iOS 제스처 간섭 방지
window.addEventListener('pointermove', e => Object.assign(MOUSE, toCanvas(e)));
window.addEventListener('pointerdown', e => { MOUSE.down = true; Object.assign(MOUSE, toCanvas(e)); });
window.addEventListener('pointerup',   () => MOUSE.down = false);

class Particle {
  constructor() { this.reset(true); }
  reset(randomPos=false) {
    this.x = randomPos ? rand(0,W) : W*0.5 + rand(-50,50);
    this.y = randomPos ? rand(0,H) : H*0.5 + rand(-50,50);
    this.vx = rand(-0.5,0.5);
    this.vy = rand(-0.5,0.5);
    this.size = rand(0.6, 1.8) * DPR;
    this.hue = rand(180, 220);
    this.life = 0;
  }
  step() {
    const dx = this.x - MOUSE.x;
    const dy = this.y - MOUSE.y;
    const d2 = dx*dx + dy*dy + 0.0001;
    const f = MOUSE.down ? -1200/d2 : 600/d2;
    const inv = Math.sqrt(d2);
    this.vx += (dx/inv) * f;
    this.vy += (dy/inv) * f;

    const a = Math.sin(this.x*0.002 + this.y*0.002 + this.life*0.02);
    this.vx += Math.cos(a)*0.03;
    this.vy += Math.sin(a)*0.03;

    this.vx *= 0.985;
    this.vy *= 0.985;

    this.x += this.vx;
    this.y += this.vy;

    if (this.x < -20 || this.x > W+20 || this.y < -20 || this.y > H+20) this.reset(true);
    this.life++;
  }
  draw() {
    ctx.beginPath();
    ctx.fillStyle = `hsla(${this.hue + this.life*0.1}, 70%, 65%, 0.8)`;
    ctx.arc(this.x, this.y, this.size, 0, TAU);
    ctx.fill();
  }
}

// 최소 입자 수 보장 (작은 화면에서도 보이게)
const COUNT = Math.max(60, Math.min(220, Math.floor((W*H)/(16000))));
const particles = Array.from({length:COUNT}, _=>new Particle());

function loop() {
  // 배경 잔상
  ctx.fillStyle = 'rgba(11,13,16,0.15)';
  ctx.fillRect(0,0,W,H);

  for (const p of particles) {
    p.step();
    p.draw();
  }
  requestAnimationFrame(loop);
}
loop();

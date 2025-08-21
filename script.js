const canvas=document.getElementById('stage');
const ctx=canvas.getContext('2d',{alpha:false});
const DPR=Math.min(2,window.devicePixelRatio||1);let W=0,H=0;
function resize(){W=Math.floor(window.innerWidth*DPR);H=Math.floor(window.innerHeight*DPR);canvas.width=W;canvas.height=H}
resize();window.addEventListener('resize',resize);
const rand=(a,b)=>a+Math.random()*(b-a),TAU=Math.PI*2;
const MOUSE={x:W/2,y:H/2,down:false};
const toCanvas=e=>{const r=canvas.getBoundingClientRect();return{ x:(e.clientX-r.left)*DPR, y:(e.clientY-r.top)*DPR }};
window.addEventListener('pointermove',e=>Object.assign(MOUSE,toCanvas(e)));
window.addEventListener('pointerdown',e=>{MOUSE.down=true;Object.assign(MOUSE,toCanvas(e))});
window.addEventListener('pointerup',()=>MOUSE.down=false);
class Particle{
  constructor(){this.reset(true)}
  reset(r=false){this.x=r?rand(0,W):W*.5+rand(-50,50);this.y=r?rand(0,H):H*.5+rand(-50,50);
    this.vx=rand(-.5,.5);this.vy=rand(-.5,.5);this.size=rand(.6,1.8)*DPR;this.hue=rand(180,220);this.life=0}
  step(){const dx=this.x-MOUSE.x,dy=this.y-MOUSE.y,d2=dx*dx+dy*dy+.0001;
    const f=MOUSE.down?-1200/d2:600/d2;const inv=Math.sqrt(d2);
    this.vx+=(dx/inv)*f;this.vy+=(dy/inv)*f;
    const a=Math.sin(this.x*.002+this.y*.002+this.life*.02);
    this.vx+=Math.cos(a)*.03;this.vy+=Math.sin(a)*.03;
    this.vx*=.985;this.vy*=.985;this.x+=this.vx;this.y+=this.vy;
    if(this.x<-20||this.x>W+20||this.y<-20||this.y>H+20)this.reset(true);this.life++}
  draw(){ctx.beginPath();ctx.fillStyle=`hsla(${this.hue+this.life*.1},70%,65%,.8)`;ctx.arc(this.x,this.y,this.size,0,TAU);ctx.fill()}
}
const COUNT=Math.min(220,Math.floor((W*H)/16000));
const particles=Array.from({length:COUNT},()=>new Particle());
function loop(){ctx.fillStyle='rgba(11,13,16,.15)';ctx.fillRect(0,0,W,H);
  for(const p of particles){p.step();p.draw()} requestAnimationFrame(loop)}
loop();

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
let W,H;
function resize(){
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W;
  canvas.height = H;
}
resize();
window.addEventListener('resize',resize);

// 하이쿠 텍스트
const lines = [
  "SPENT HOURS BACKFLOW",
  "SLOWLY RISING ROUND MY SKIN",
  "FOG DISSOLVES THE WALLS"
];

// 파티클 설정
const particles = [];
const fontSize = 42; // 글자 크기
const lineHeight = fontSize * 1.4;
const fontFamily = "'Host Grotesk', sans-serif";

// 픽셀 → 파티클화
function createParticles() {
  particles.length = 0;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = "white";
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  // 총 텍스트 높이
  const totalHeight = lines.length * lineHeight;
  const startY = H/2 - totalHeight/2;

  lines.forEach((text,i)=>{
    const y = startY + i*lineHeight;
    // 가운데 정렬 + 왼쪽 정렬
    const x = W/2 - 300; // 화면 중앙에서 왼쪽으로 300px 고정
    ctx.fillText(text,x,y);

    const imageData = ctx.getImageData(0,0,W,H).data;
    for(let py=y;py<y+fontSize;py+=4){
      for(let px=x;px<x+1000;px+=4){
        const idx = (py*W+px)*4+3;
        if(imageData[idx]>128){
          particles.push({x:px,y:py,ox:px,oy:py,vx:0,vy:0});
        }
      }
    }
  });
}
createParticles();

// 애니메이션
function animate(){
  ctx.fillStyle="rgba(11,13,16,0.3)";
  ctx.fillRect(0,0,W,H);
  for(const p of particles){
    // 마우스/터치 인터랙션 추가해도 됨
    p.x += (p.ox-p.x)*0.05 + p.vx;
    p.y += (p.oy-p.y)*0.05 + p.vy;
    ctx.fillStyle="white";
    ctx.fillRect(p.x,p.y,1.2,1.2);
  }
  requestAnimationFrame(animate);
}
animate();

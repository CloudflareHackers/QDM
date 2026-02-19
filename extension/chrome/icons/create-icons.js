/**
 * Generate extension icons (16x16, 48x48, 128x128 PNG)
 * Run: node extension/chrome/icons/create-icons.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(size, pixels) {
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size,0); ihdr.writeUInt32BE(size,4);
  ihdr[8]=8; ihdr[9]=2; // 8-bit RGB
  const raw = Buffer.alloc(size*(1+size*3));
  for(let y=0;y<size;y++){
    raw[y*(1+size*3)]=0;
    for(let x=0;x<size;x++){
      const i=(y*size+x)*3, o=y*(1+size*3)+1+x*3;
      raw[o]=pixels[i]; raw[o+1]=pixels[i+1]; raw[o+2]=pixels[i+2];
    }
  }
  const compressed = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR',ihdr), chunk('IDAT',compressed), chunk('IEND',Buffer.alloc(0))]);
}
function chunk(type,data){
  const len=Buffer.alloc(4); len.writeUInt32BE(data.length,0);
  const t=Buffer.from(type,'ascii');
  const c=crc32(Buffer.concat([t,data]));
  const cb=Buffer.alloc(4); cb.writeUInt32BE(c,0);
  return Buffer.concat([len,t,data,cb]);
}
function crc32(buf){
  let c=0xFFFFFFFF;const tbl=[];
  for(let n=0;n<256;n++){let cn=n;for(let k=0;k<8;k++)cn=(cn&1)?(0xEDB88320^(cn>>>1)):(cn>>>1);tbl[n]=cn;}
  for(let i=0;i<buf.length;i++)c=tbl[(c^buf[i])&0xFF]^(c>>>8);
  return(c^0xFFFFFFFF)>>>0;
}
function draw(size){
  const px=new Uint8Array(size*size*3);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=(y*size+x)*3, nx=x/size, ny=y/size;
    const m=0.02,r=0.15;
    if(!inRR(nx,ny,m,m,1-m*2,1-m*2,r)){px[i]=px[i+1]=px[i+2]=0;continue;}
    const t=(nx+ny)/2;
    px[i]=Math.round(108+(168-108)*t);
    px[i+1]=Math.round(92+(85-92)*t);
    px[i+2]=Math.round(231+(247-231)*t);
    const cx=0.5,lw=Math.max(0.06,0.5/size*3);
    if(Math.abs(nx-cx)<lw&&ny>0.22&&ny<0.62){px[i]=px[i+1]=px[i+2]=255;}
    const dy=ny-0.62,sp=0.18;
    if(dy>-0.18&&dy<0.02){
      const e1=cx+dy*(sp/0.18),e2=cx-dy*(sp/0.18);
      if((Math.abs(nx-e1)<lw||Math.abs(nx-e2)<lw)&&ny>0.44&&ny<0.66)px[i]=px[i+1]=px[i+2]=255;
    }
    if(ny>0.72&&ny<0.78&&nx>0.28&&nx<0.72)px[i]=px[i+1]=px[i+2]=255;
  }
  return Buffer.from(px);
}
function inRR(px,py,rx,ry,rw,rh,r){
  if(px<rx||px>rx+rw||py<ry||py>ry+rh)return false;
  const corners=[[rx+r,ry+r],[rx+rw-r,ry+r],[rx+r,ry+rh-r],[rx+rw-r,ry+rh-r]];
  for(const[cx,cy]of corners){
    const inC=(px<rx+r&&py<ry+r)||(px>rx+rw-r&&py<ry+r)||(px<rx+r&&py>ry+rh-r)||(px>rx+rw-r&&py>ry+rh-r);
    if(inC){const dx=px-cx,dy=py-cy;if(dx*dx+dy*dy>r*r)return false;}
  }
  return true;
}

for(const size of [16,48,128]){
  const png = createPNG(size, draw(size));
  const file = path.join(__dirname, `icon${size}.png`);
  fs.writeFileSync(file, png);
  console.log(`✅ ${file} (${size}x${size}, ${png.length} bytes)`);
}
// Also create "off" variants (dimmed)
for(const size of [16,48]){
  const px = draw(size);
  // Dim by 50%
  for(let i=0;i<px.length;i++) px[i] = Math.round(px[i]*0.4);
  const png = createPNG(size, px);
  const file = path.join(__dirname, `icon${size}-off.png`);
  fs.writeFileSync(file, png);
  console.log(`✅ ${file} (${size}x${size} dimmed, ${png.length} bytes)`);
}

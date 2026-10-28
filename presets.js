/* Procedural sample content and built-in style presets (no image files needed). */
(function(){
'use strict';
const NST=window.NST=window.NST||{};

function rng(seed){let s=seed;return()=>(s=(s*1664525+1013904223)>>>0)/4294967296}

function sampleContent(x){
  const g=x.createLinearGradient(0,0,0,256);g.addColorStop(0,'#5aa0e0');g.addColorStop(.65,'#f5d5a0');
  x.fillStyle=g;x.fillRect(0,0,256,256);
  x.fillStyle='#fff3b0';x.beginPath();x.arc(190,70,28,0,7);x.fill();
  x.fillStyle='#4f8a4a';x.beginPath();x.ellipse(70,230,170,80,0,0,7);x.fill();
  x.fillStyle='#386b3a';x.beginPath();x.ellipse(230,245,150,70,0,0,7);x.fill();
  x.fillStyle='#b5543a';x.fillRect(90,140,80,60);
  x.fillStyle='#5a2a20';x.beginPath();x.moveTo(80,142);x.lineTo(130,100);x.lineTo(180,142);x.fill();
  x.fillStyle='#3b2a1e';x.fillRect(120,165,20,35);
  x.fillStyle='#bfe3ff';x.fillRect(98,152,16,16);x.fillRect(148,152,16,16);
}

const presets=[
 {name:'Swirl night',fn(x){
  x.fillStyle='#12214a';x.fillRect(0,0,256,256);
  const r=rng(42),pal=['#f2c94c','#2f6bd6','#8fd3f4','#1b2a6b','#fff3b0','#4aa3a0'];
  x.lineCap='round';
  for(let i=0;i<1100;i++){
   let px=r()*256,py=r()*256;x.strokeStyle=pal[(r()*pal.length)|0];x.lineWidth=2+r()*4;
   x.beginPath();x.moveTo(px,py);
   for(let k=0;k<6;k++){const a=Math.sin(px*.03)*2+Math.cos(py*.03)*2;px+=Math.cos(a)*5;py+=Math.sin(a)*5;x.lineTo(px,py)}
   x.stroke();
  }}},
 {name:'Mosaic',fn(x){
  x.fillStyle='#1c1917';x.fillRect(0,0,256,256);
  const r=rng(7);
  for(let i=0;i<14;i++)for(let j=0;j<14;j++){
   x.save();x.translate(i*19+9,j*19+9);x.rotate((r()-.5)*.6);
   x.fillStyle='hsl('+((r()*360)|0)+',65%,'+(40+r()*25)+'%)';x.fillRect(-7.5,-7.5,15,15);x.restore();
  }}},
 {name:'Ink',fn(x){
  x.fillStyle='#f3ecd8';x.fillRect(0,0,256,256);
  const r=rng(99);x.strokeStyle='#15130f';x.lineCap='round';
  for(let i=0;i<70;i++){
   x.lineWidth=1+r()*6;x.beginPath();x.moveTo(r()*256,r()*256);
   x.bezierCurveTo(r()*256,r()*256,r()*256,r()*256,r()*256,r()*256);x.stroke();
  }}},
 {name:'Waves',fn(x){
  x.fillStyle='#0b3954';x.fillRect(0,0,256,256);
  for(let i=0;i<26;i++){
   x.fillStyle='hsl('+(190+i*5)+',70%,'+(22+i*1.9)+'%)';x.beginPath();x.moveTo(0,256);
   for(let px=0;px<=256;px+=4)x.lineTo(px,i*9+Math.sin(px*.05+i*.7)*10);
   x.lineTo(256,256);x.closePath();x.fill();
  }}}
];

/* Draw a 256-unit design onto a square canvas of the given pixel size. */
function paint(cv,fn,size){
  cv.width=cv.height=size;
  const x=cv.getContext('2d');x.save();x.scale(size/256,size/256);fn(x);x.restore();
}

NST.rng=rng;NST.sampleContent=sampleContent;NST.presets=presets;NST.paint=paint;
})();

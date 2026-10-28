/* UI, state and job scheduling. */
(function(){
'use strict';
const NST=window.NST;
const $=id=>document.getElementById(id);
const frame=()=>new Promise(r=>requestAnimationFrame(()=>r()));

/* ---------- small helpers ---------- */
const store={
  get(k,d){try{const v=localStorage.getItem('nst1_'+k);return v===null?d:JSON.parse(v)}catch(e){return d}},
  set(k,v){try{localStorage.setItem('nst1_'+k,JSON.stringify(v))}catch(e){}},
  clear(){try{Object.keys(localStorage).filter(k=>k.indexOf('nst1_')===0).forEach(k=>localStorage.removeItem(k))}catch(e){}}
};
function status(t,err){const s=$('st');s.textContent=t;s.classList.toggle('err',!!err)}
const ACTIONS=['go','at','sp'];
const setActionsDisabled=d=>ACTIONS.forEach(i=>{$(i).disabled=d});

/* ---------- state ---------- */
let engine=null,ready=false,running=false,queued=null,debounce=null;
const result=document.createElement('canvas');   // last full-quality result, kept off-screen
let hasResult=false;

const slots={
  content:{cv:$('c1'),ver:0,card:$('k1'),label:$('n1'),file:$('f1')},
  a:{cv:$('c2'),ver:0,card:$('k2'),label:$('n2'),file:$('f2')},
  b:{cv:$('c3'),ver:0,card:$('k3'),label:$('n3'),file:$('f3')}
};
let activeSlot='content';
const out=$('co');

function touch(name,label){
  const s=slots[name];s.ver++;s.label.textContent=label||'';
  if(engine)engine.prune();
  schedule();
}

/* ---------- loading images ---------- */
const MAX_SIDE=2048;
async function decode(file){
  // createImageBitmap honours EXIF rotation, so phone photos come in upright.
  if(window.createImageBitmap){
    try{const bm=await createImageBitmap(file,{imageOrientation:'from-image'});return {src:bm,w:bm.width,h:bm.height,close:()=>bm.close&&bm.close()}}catch(e){/* fall through */}
  }
  return new Promise((res,rej)=>{
    const img=new Image(),url=URL.createObjectURL(file);
    img.onload=()=>res({src:img,w:img.width,h:img.height,close:()=>URL.revokeObjectURL(url)});
    img.onerror=()=>{URL.revokeObjectURL(url);rej(new Error('unreadable image'))};
    img.src=url;
  });
}
async function setFromFile(name,file){
  if(!file||!/^image\//.test(file.type)){status('That file is not an image.',true);return}
  try{
    const d=await decode(file);
    const s=slots[name],k=Math.min(1,MAX_SIDE/Math.max(d.w,d.h));
    s.cv.width=Math.max(1,Math.round(d.w*k));s.cv.height=Math.max(1,Math.round(d.h*k));
    s.cv.getContext('2d').drawImage(d.src,0,0,s.cv.width,s.cv.height);
    d.close();touch(name,d.w+'×'+d.h);
  }catch(e){status('That image could not be read.',true)}
}
function setPreset(name,p){NST.paint(slots[name].cv,p.fn,512);touch(name,p.name)}

function setActive(n){activeSlot=n;Object.keys(slots).forEach(k=>slots[k].card.classList.toggle('active',k===n))}

function initSlots(){
  NST.paint(slots.content.cv,NST.sampleContent,512);slots.content.label.textContent='Sample';
  NST.paint(slots.a.cv,NST.presets[0].fn,512);slots.a.label.textContent=NST.presets[0].name;
  NST.paint(slots.b.cv,NST.presets[3].fn,512);slots.b.label.textContent=NST.presets[3].name;
  Object.keys(slots).forEach(name=>{
    const s=slots[name];
    s.file.onchange=e=>{setFromFile(name,e.target.files[0]);e.target.value=''};
    s.card.addEventListener('pointerenter',()=>setActive(name));
    s.card.addEventListener('click',()=>setActive(name));
    ['dragenter','dragover'].forEach(t=>s.card.addEventListener(t,e=>{e.preventDefault();s.card.classList.add('drag')}));
    ['dragleave','drop'].forEach(t=>s.card.addEventListener(t,e=>{e.preventDefault();s.card.classList.remove('drag')}));
    s.card.addEventListener('drop',e=>{const f=[...(e.dataTransfer.files||[])].find(f=>/^image\//.test(f.type));if(f)setFromFile(name,f)});
  });
  setActive('content');
  document.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>$(b.dataset.pick).click());
  $('ex1').onclick=()=>{NST.paint(slots.content.cv,NST.sampleContent,512);touch('content','Sample')};
  document.addEventListener('paste',e=>{
    const it=[...((e.clipboardData&&e.clipboardData.items)||[])].find(i=>/^image\//.test(i.type));
    if(!it||slots[activeSlot].card.classList.contains('hid'))return;
    setFromFile(activeSlot,it.getAsFile());
    status('Pasted into '+(activeSlot==='content'?'content':'style'+(activeSlot==='b'?' B':'')));
  });
  [['ch2','a'],['ch3','b']].forEach(([id,name])=>{
    NST.presets.forEach(p=>{
      const b=document.createElement('button');b.className='chip';b.title=p.name;b.setAttribute('aria-label','Use '+p.name+' style');
      const cv=document.createElement('canvas');NST.paint(cv,p.fn,64);b.appendChild(cv);
      b.onclick=e=>{e.stopPropagation();setPreset(name,p)};
      $(id).appendChild(b);
    });
  });
}

/* ---------- settings ---------- */
const CTRLS=['ws','wm','wc','rs','sz','wp','wl','wd','pz','wk','fmt'];
const DEFAULTS={ws:100,wm:50,wc:0,rs:512,sz:256,wp:35,wl:0,wd:0,pz:1,wk:70,fmt:'png'};
function defaultSize(){
  const mobile=/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent),mem=navigator.deviceMemory||4;
  if(window.tf&&tf.getBackend()!=='webgl')return 256;
  return (mobile||mem<4)?384:512;
}
function syncLabels(){
  [['vs','ws'],['vm','wm'],['vc','wc'],['vp','wp'],['vl','wl'],['vd','wd'],['vk','wk']].forEach(([l,i])=>{$(l).textContent=$(i).value});
  const on=$('bl').checked;$('k3').classList.toggle('hid',!on);$('mixw').classList.toggle('hid',!on);
  if(!on&&activeSlot==='b')setActive('content');
}
function applySettings(useDefaults){
  CTRLS.forEach(id=>{
    const v=useDefaults?DEFAULTS[id]:store.get(id,DEFAULTS[id]);
    $(id).value=v;if(!$(id).value)$(id).value=DEFAULTS[id];
  });
  $('lv').checked=useDefaults?true:store.get('lv',true);
  $('msc').checked=useDefaults?true:store.get('msc',true);
  $('bl').checked=false;
  syncLabels();
}
function wireSettings(){
  CTRLS.forEach(id=>$(id).addEventListener('input',()=>{store.set(id,$(id).value);syncLabels()}));
  ['ws','wm','wc','wp','wl','wd'].forEach(id=>$(id).addEventListener('input',()=>schedule()));
  ['sz','pz'].forEach(id=>$(id).addEventListener('change',()=>schedule()));
  $('lv').onchange=()=>store.set('lv',$('lv').checked);
  $('msc').onchange=()=>{store.set('msc',$('msc').checked);schedule()};
  $('bl').onchange=()=>{syncLabels();schedule()};
  $('reset').onclick=()=>{store.clear();applySettings(true);$('rs').value=defaultSize();schedule();status('Settings reset')};
}
function getParams(full){
  let S=+$('sz').value;if(!full)S=Math.min(S,256);
  return {
    N:full?+$('rs').value:Math.min(320,+$('rs').value),S,draft:!full,
    ratio:+$('ws').value/100,color:+$('wc').value/100,
    blend:$('bl').checked,mix:+$('wm').value/100,
    prot:+$('wp').value/100,pal:+$('wl').value/100,det:+$('wd').value/100,
    passes:+$('pz').value,multi:$('msc').checked
  };
}

/* ---------- job scheduling ----------
   One job runs at a time. While it runs, only the most important pending request is kept
   (tune > full > draft), so dragging a slider never builds up a backlog. */
const PRIORITY={draft:0,full:1,tune:2};
function request(kind){
  if(!ready)return;
  if(queued&&PRIORITY[queued]>PRIORITY[kind])return;
  queued=kind;
  if(!running)pump();
}
function schedule(immediate){
  if(!ready||!$('lv').checked)return;
  clearTimeout(debounce);
  debounce=setTimeout(()=>request('draft'),immediate?0:220);
}
async function pump(){
  running=true;
  try{
    while(queued){
      const kind=queued;queued=null;
      setBusy(true);
      try{if(kind==='tune')await tuneJob();else await renderJob(kind==='full')}
      catch(e){console.error(e);status('Error: '+e.message,true)}
    }
  }finally{running=false;setBusy(false)}
}
function setBusy(b){$('bar').classList.toggle('on',b);setActionsDisabled(b||!ready)}

async function renderJob(full){
  const t0=performance.now();
  const p=getParams(full),notes=[];
  status(full?'Stylizing…':'Updating preview…');
  await frame();await frame();
  let ok=false,lastErr;
  for(let attempt=0;attempt<5&&!ok;attempt++){
    try{
      const r=engine.run(p);
      try{await tf.browser.toPixels(r.out,result)}finally{r.out.dispose()}
      out.width=result.width;out.height=result.height;out.getContext('2d').drawImage(result,0,0);
      $('rs2').textContent=r.w+'×'+r.h+(full?'':' · draft');
      ok=true;
    }catch(e){
      // Most failures here are the GPU running out of memory: retry smaller.
      lastErr=e;console.warn('Render failed at',p.N,e);
      if(p.N<=192)break;
      p.N=Math.max(192,Math.floor(p.N*.75/8)*8);notes.push('reduced to '+p.N+'px');
      await frame();
    }
  }
  if(!ok)throw lastErr||new Error('render failed — try a smaller output size');
  hasResult=true;['dl','cmp','cp'].forEach(i=>{$(i).disabled=false});
  const sec=((performance.now()-t0)/1000).toFixed(1);
  status((full?'Done':'Preview')+' in '+sec+'s'+(notes.length?' ('+notes.join(', ')+' to fit memory)':''));
  if(full)addHistory();
}

async function tuneJob(){
  const target=+$('wk').value/100;
  const p=getParams(false);
  const r=await engine.tune(p,target,(i,n)=>status('Auto-tuning… step '+i+'/'+n));
  $('ws').value=Math.round(r.ratio*100);store.set('ws',$('ws').value);syncLabels();
  await renderJob(true);
  status('Auto-tuned to '+$('ws').value+'% strength'+(r.score!==null?' (structure kept ≈ '+Math.round(r.score*100)+'%)':''));
}

/* ---------- result tools ---------- */
function showContent(on){
  if(!hasResult)return;
  const x=out.getContext('2d');
  x.drawImage(on?slots.content.cv:result,0,0,out.width,out.height);
}
function wireResultTools(){
  const cmp=$('cmp');
  cmp.addEventListener('pointerdown',()=>showContent(true));
  ['pointerup','pointerleave','pointercancel'].forEach(t=>cmp.addEventListener(t,()=>showContent(false)));
  $('cp').onclick=async()=>{
    try{
      const blob=await new Promise(r=>result.toBlob(r,'image/png'));
      await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);status('Copied to clipboard');
    }catch(e){status('Copy is not supported here — use Download instead.',true)}
  };
  $('dl').onclick=()=>{
    const fmt=$('fmt').value,mime={png:'image/png',jpg:'image/jpeg',webp:'image/webp'}[fmt]||'image/png';
    result.toBlob(b=>{
      if(!b){status('Could not encode '+fmt.toUpperCase(),true);return}
      const a=document.createElement('a'),url=URL.createObjectURL(b);
      a.href=url;a.download='stylized-'+new Date().toISOString().replace(/[-:T]/g,'').slice(0,14)+'.'+fmt;
      document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
    },mime,.92);
  };
}

const MAX_HISTORY=8;
function addHistory(){
  const full=document.createElement('canvas');full.width=result.width;full.height=result.height;
  full.getContext('2d').drawImage(result,0,0);
  const t=document.createElement('canvas');t.width=t.height=128;
  const x=t.getContext('2d'),s=Math.max(128/full.width,128/full.height);
  x.drawImage(full,(128-full.width*s)/2,(128-full.height*s)/2,full.width*s,full.height*s);
  const img=new Image();img.alt='Earlier result';img.src=t.toDataURL('image/jpeg',.8);
  const btn=document.createElement('button');btn.title='Restore this result';btn.appendChild(img);
  btn.onclick=()=>{
    result.width=full.width;result.height=full.height;result.getContext('2d').drawImage(full,0,0);
    out.width=full.width;out.height=full.height;out.getContext('2d').drawImage(full,0,0);
    $('rs2').textContent=full.width+'×'+full.height;
  };
  $('hist').prepend(btn);
  while($('hist').children.length>MAX_HISTORY)$('hist').lastChild.remove();
}

/* ---------- startup ---------- */
async function waitForTf(){
  for(let i=0;i<200;i++){if(window.tf)return;await new Promise(r=>setTimeout(r,100))}
  throw new Error('TensorFlow.js could not be loaded — check your connection.');
}
async function boot(){
  $('retry').classList.add('hid');status('Loading models…');$('ms').textContent='Models: loading';
  try{
    await waitForTf();await tf.ready();
    $('bk').textContent='Backend: '+tf.getBackend();
    if(store.get('rs',null)===null)$('rs').value=defaultSize();
    const nets=await NST.loadModels(f=>status('Loading models… '+Math.round(f*100)+'%'));
    status('Warming up…');await frame();
    engine=new NST.Engine(nets,n=>slots[n]);engine.warmup();
    ready=true;$('ms').textContent='Models: ready';setActionsDisabled(false);
    status('Ready');schedule(true);
  }catch(e){
    console.error(e);status('Could not start: '+e.message,true);$('ms').textContent='Models: failed';$('retry').classList.remove('hid');
  }
}

function init(){
  initSlots();
  applySettings(false);
  wireSettings();
  wireResultTools();
  $('go').onclick=()=>{clearTimeout(debounce);request('full')};
  $('at').onclick=()=>{clearTimeout(debounce);request('tune')};
  $('sp').onclick=()=>{
    setPreset('a',NST.presets[(Math.random()*NST.presets.length)|0]);
    clearTimeout(debounce);request('tune');
  };
  $('retry').onclick=boot;
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();if(!$('go').disabled)$('go').click()}});
  boot();
}
init();
})();

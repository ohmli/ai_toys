/* Loads the two pretrained Magenta networks (via the reiinakano TF.js port).
   After the first download they are stored in IndexedDB, so later visits start fast and work offline. */
(function(){
'use strict';
const NST=window.NST=window.NST||{};

const BASES=[
  'https://cdn.jsdelivr.net/gh/reiinakano/arbitrary-image-stylization-tfjs@gh-pages/',
  'https://reiinakano.github.io/arbitrary-image-stylization-tfjs/',
  'https://raw.githubusercontent.com/reiinakano/arbitrary-image-stylization-tfjs/gh-pages/'
];
const DIRS={style:'saved_model_style_js',trans:'saved_model_transformer_separable_js'};
const DB='indexeddb://nst-';

async function loadOne(dir,onProgress){
  try{const m=await tf.loadGraphModel(DB+dir);onProgress(1);return m}catch(e){/* not cached yet */}
  let lastErr;
  for(const base of BASES){
    try{
      const m=await tf.loadGraphModel(base+dir+'/model.json',{onProgress});
      try{await m.save(DB+dir)}catch(e){console.warn('Could not cache model locally',e)}
      return m;
    }catch(e){lastErr=e;console.warn('Model source failed:',base,e)}
  }
  throw new Error('Could not download '+dir+' ('+(lastErr&&lastErr.message||'network error')+')');
}

/* onProgress receives a number from 0 to 1. */
NST.loadModels=async function(onProgress){
  const p=[0,0];
  const report=()=>onProgress((p[0]+p[1])/2);
  const [styleNet,transNet]=await Promise.all([
    loadOne(DIRS.style,f=>{p[0]=f;report()}),
    loadOne(DIRS.trans,f=>{p[1]=f;report()})
  ]);
  return {styleNet,transNet};
};
})();

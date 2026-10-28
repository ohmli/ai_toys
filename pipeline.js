/* The stylization engine. It owns the networks and a cache of style vectors, and knows nothing about the DOM:
   every setting arrives in a plain parameter object. */
(function(){
'use strict';
const NST=window.NST=window.NST||{};

class Engine{
  /* getSlot(name) -> {cv, ver} for 'content', 'a' and 'b'. `ver` changes whenever the image does. */
  constructor(nets,getSlot){
    this.styleNet=nets.styleNet;this.transNet=nets.transNet;this.getSlot=getSlot;
    this.cache=new Map();
    this.Wg=tf.tensor1d([.299,.587,.114]);
    this.KX=tf.tensor4d([-1,0,1,-2,0,2,-1,0,1],[3,3,1,1]);
    this.KY=tf.tensor4d([-1,-2,-1,0,0,0,1,2,1],[3,3,1,1]);
    this.TO_YIQ=tf.tensor2d([[.299,.587,.114],[.596,-.274,-.322],[.211,-.523,.312]]);
    this.FROM_YIQ=tf.tensor2d([[1,.956,.621],[1,-.272,-.647],[1,-1.106,1.703]]);
  }

  /* Compile shaders ahead of the first real render. */
  warmup(){
    try{tf.tidy(()=>{const z=tf.zeros([1,64,64,3]);this.transNet.predict([z,this.styleNet.predict(z)]).dataSync()})}
    catch(e){console.warn('Warm-up skipped',e)}
  }

  /* ---- style vectors (cached: each image is analysed once per scale) ---- */
  bottleneck(name,S){
    const slot=this.getSlot(name),key=name+':'+slot.ver+':'+S;
    if(this.cache.has(key))return this.cache.get(key);
    const t=tf.tidy(()=>{
      const img=tf.image.resizeBilinear(tf.browser.fromPixels(slot.cv).toFloat().div(255),[S,S]).expandDims(0);
      return this.styleNet.predict(img);
    });
    tf.keep(t);this.cache.set(key,t);
    return t;
  }
  /* Drop vectors belonging to images that have since changed. */
  prune(){
    for(const [k,v] of this.cache){
      const [name,ver]=k.split(':');
      if(this.getSlot(name).ver!==+ver){v.dispose();this.cache.delete(k)}
    }
  }

  /* ---- image analysis helpers (all expect [1,h,w,3] tensors in 0..1) ---- */
  gray(x){return x.mul(this.Wg).sum(3,true)}
  blur(x,k){return tf.avgPool(x,[k,k],1,'same')}
  edges(x){
    const g=this.blur(this.gray(x),3);
    return tf.conv2d(g,this.KX,1,'same').square().add(tf.conv2d(g,this.KY,1,'same').square()).sqrt();
  }
  corr(a,b){
    const am=a.sub(a.mean()),bm=b.sub(b.mean());
    return am.mul(bm).mean().div(am.square().mean().sqrt().mul(bm.square().mean().sqrt()).add(1e-6));
  }
  paletteStats(name){
    const img=tf.image.resizeBilinear(tf.browser.fromPixels(this.getSlot(name).cv).toFloat().div(255),[96,96]);
    const m=tf.moments(img,[0,1]);
    return {m:m.mean,s:m.variance.sqrt()};
  }
  /* Luminance from `res`, chroma from `content`, mixed by `amount` (YIQ space). */
  keepColors(res,content,amount){
    const [,h,w]=res.shape;
    const yr=res.reshape([-1,3]).matMul(this.TO_YIQ,false,true);
    const yc=content.reshape([-1,3]).matMul(this.TO_YIQ,false,true);
    const mixed=tf.concat([yr.slice([0,0],[-1,1]),yc.slice([0,1],[-1,2])],1);
    const kept=mixed.matMul(this.FROM_YIQ,false,true).reshape([1,h,w,3]);
    return res.mul(1-amount).add(kept.mul(amount)).clipByValue(0,1);
  }

  /* ---- the pipeline ----
     p: {N, S, draft, ratio, color, blend, mix, prot, pal, det, passes, multi, score}
     Returns {out: [h,w,3] tensor (caller disposes), score?: scalar tensor, w, h}. */
  run(p){
    const cv=this.getSlot('content').cv;
    const k=p.N/Math.max(cv.width,cv.height);
    const w=Math.max(8,Math.round(cv.width*k/8)*8),h=Math.max(8,Math.round(cv.height*k/8)*8);
    // Averaging style vectors from several scales captures both the broad palette and the fine brushwork.
    const scales=p.multi?(p.draft?[128,256]:[128,256,384]):[p.S];
    const res=tf.tidy(()=>{
      const c=tf.image.resizeBilinear(tf.browser.fromPixels(cv).toFloat().div(255),[h,w]).expandDims(0);
      const vec=name=>{const ts=scales.map(s=>this.bottleneck(name,s));return ts.length>1?tf.addN(ts).div(ts.length):ts[0]};
      let bS=vec('a');
      if(p.blend)bS=bS.mul(1-p.mix).add(vec('b').mul(p.mix));
      const bC=vec('content');
      const mkB=q=>bS.mul(q).add(bC.mul(1-q));
      let r=this.transNet.predict([c,mkB(p.ratio)]).clipByValue(0,1);

      if(p.score)return {out:r.squeeze(0),score:this.corr(this.edges(r),this.edges(c))};

      // Extra passes deepen the style while the content vector keeps structure anchored.
      for(let i=1;i<p.passes;i++)r=this.transNet.predict([r,mkB(Math.min(p.ratio,1)*.7)]).clipByValue(0,1);

      // Protect detail: where the content has strong structure (faces, edges, text), blend toward a gentler stylization.
      if(p.prot>0){
        const base=this.transNet.predict([c,mkB(Math.min(p.ratio,1)*.35)]).clipByValue(0,1);
        let m=this.blur(this.blur(this.edges(c),9),9);
        m=m.div(m.max().add(1e-6)).sqrt().mul(1.6).clipByValue(0,1).mul(p.prot);
        r=r.mul(m.neg().add(1)).add(base.mul(m));
      }
      // Palette match: shift the per-channel colour statistics toward the style image's.
      if(p.pal>0){
        let st=this.paletteStats('a');
        if(p.blend){const sb=this.paletteStats('b');st={m:st.m.mul(1-p.mix).add(sb.m.mul(p.mix)),s:st.s.mul(1-p.mix).add(sb.s.mul(p.mix))}}
        const rm=tf.moments(r,[0,1,2]);
        const shifted=r.sub(rm.mean).div(rm.variance.sqrt().add(1e-4)).mul(st.s).add(st.m);
        r=r.mul(1-p.pal).add(shifted.mul(p.pal)).clipByValue(0,1);
      }
      // Restore fine detail: add back high frequencies lost in stylization.
      if(p.det>0)r=r.add(c.sub(this.blur(c,5)).mul(p.det*.9)).clipByValue(0,1);
      if(p.color>0)r=this.keepColors(r,c,p.color);
      return {out:r.squeeze(0)};
    });
    this.prune();
    return {out:res.out,score:res.score,w,h};
  }

  /* Closed-loop search: the strongest style that still keeps `target` (0..1) of the content's edge structure. */
  async tune(p,target,onStep){
    let lo=.15,hi=1.5,best=lo,bestScore=null;
    const steps=7;
    for(let i=0;i<steps;i++){
      if(onStep)onStep(i+1,steps);
      await tf.nextFrame();
      const mid=(lo+hi)/2;
      const r=this.run(Object.assign({},p,{N:256,ratio:mid,score:true,draft:true}));
      const sc=(await r.score.data())[0];
      r.score.dispose();r.out.dispose();
      if(sc>=target){best=mid;bestScore=sc;lo=mid}else hi=mid;
    }
    return {ratio:best,score:bestScore};
  }
}

NST.Engine=Engine;
})();

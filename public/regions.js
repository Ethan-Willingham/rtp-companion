(function(root){
  'use strict';
  const names={'west':'US West','east':'US East','eu central':'EU Central','eu west':'EU West','asia':'Asia','oceania':'Oceania'};
  const colors={'west':'#e8c27d','east':'#91c2e3','eu central':'#c4a3e0','eu west':'#e8a395','asia':'#9cdbab','oceania':'#decaa6'};
  function prepare(data){
    const g=data?.grid;
    if(!g||!['minX','minZ','cellSize','width','height'].every(k=>Number.isFinite(g[k]))||g.cellSize<=0||!Number.isInteger(g.width)||!Number.isInteger(g.height)||g.width<1||g.height<1||g.width>1000||g.height>1000||!Array.isArray(data.cells))throw new Error('Invalid region map');
    const lookup=new Map();
    for(const c of data.cells)if(Number.isInteger(c.cellX)&&Number.isInteger(c.cellZ)&&c.cellX>=0&&c.cellX<g.width&&c.cellZ>=0&&c.cellZ<g.height&&names[c.region])lookup.set(c.cellZ*g.width+c.cellX,c.region);
    const labels=[];
    for(const region of Object.keys(names)){
      const cells=data.cells.filter(c=>lookup.get(c.cellZ*g.width+c.cellX)===region&&c.region===region);
      if(!cells.length)continue;
      const cx=cells.reduce((n,c)=>n+c.cellX,0)/cells.length,cz=cells.reduce((n,c)=>n+c.cellZ,0)/cells.length;
      let best=null,bestScore=-Infinity;
      for(const c of cells){
        let depth=1;
        outer:for(;depth<Math.max(g.width,g.height);depth++)for(let dx=-depth;dx<=depth;dx++)for(let dz=-depth;dz<=depth;dz++){
          const x=c.cellX+dx,z=c.cellZ+dz;
          if(x<0||z<0||x>=g.width||z>=g.height||lookup.get(z*g.width+x)!==region)break outer;
        }
        const score=depth*1000-Math.hypot(c.cellX-cx,c.cellZ-cz);
        if(score>bestScore){best=c;bestScore=score;}
      }
      if(best)labels.push(best);
    }
    return{...data,lookup,labels};
  }
  function at(data,p){
    if(!data||!p)return null;const g=data.grid,x=Math.floor((p.x-g.minX)/g.cellSize),z=Math.floor((p.z-g.minZ)/g.cellSize);
    return x>=0&&z>=0&&x<g.width&&z<g.height?(data.lookup.get(z*g.width+x)||null):null;
  }
  const api={names,colors,prepare,at};if(typeof module==='object'&&module.exports)module.exports=api;else root.RTPRegions=api;
})(globalThis);

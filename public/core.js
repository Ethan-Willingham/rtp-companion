(function(root) {
  'use strict';
  // Parse one deliberately cropped coordinate row, never guess missing signs.
  function parseCoordinates(text) {
    const s = text.replace(/[\u2212\u2013\u2014]/g, '-').replace(/\u00a0/g, ' ').replace(/^XY2\b/gim,'XYZ').replace(/^B1ock\b/gim,'Block').trim();
    const number = '-?\\d{1,7}(?:\\.\\d+)?';
    const triple = new RegExp(`^(?:XYZ|Block|Position)?\\s*:?\\s*(${number})\\s*(?:/|,|\\s)\\s*(${number})\\s*(?:/|,|\\s)\\s*(${number})(?:\\s*\\[.*\\])?\\s*$`, 'i');
    const labelled = new RegExp(`^X\\s*:?\\s*(${number})\\s*[, ]+Y\\s*:?\\s*(${number})\\s*[, ]+Z\\s*:?\\s*(${number})\\s*$`, 'i');
    const matches = s.split('\n').map(line => line.trim()).filter(Boolean).map(line => line.match(triple) || line.match(labelled)).filter(Boolean);
    if (matches.length !== 1) return null;
    const [, a, b, c] = matches[0];
    const p = {x:Number(a), y:Number(b), z:Number(c)};
    if (Math.abs(p.x)>30000000 || Math.abs(p.z)>30000000 || p.y < -2048 || p.y > 4096) return null;
    return p;
  }
  function distance(a,b) { return Math.hypot(a.x-b.x, a.z-b.z); }
  function normalize(p, grid) { return {x:(p.x-grid.minX)/(grid.maxX-grid.minX), z:(p.z-grid.minZ)/(grid.maxZ-grid.minZ)}; }
  function findCoordinateLine(data) {
    const lines=[];
    for(const block of data.blocks||[])for(const paragraph of block.paragraphs||[])for(const line of paragraph.lines||[])lines.push(line);
    const candidates=[];
    for(const anchor of lines){
      if(!/^(?:XYZ|XY2|Block|B1ock)\b/i.test(anchor.text.trim()))continue;
      const b=anchor.bbox;
      const row=lines.filter(l=>l.bbox.x0>=b.x0-2&&Math.abs((l.bbox.y0+l.bbox.y1-b.y0-b.y1)/2)<Math.max(l.bbox.y1-l.bbox.y0,b.y1-b.y0)*.45).sort((a,b)=>a.bbox.x0-b.bbox.x0);
      let text='';let right=b.x1,top=b.y0,bottom=b.y1;
      for(const part of row){
        text+=(text?' ':'')+part.text.trim();right=Math.max(right,part.bbox.x1);top=Math.min(top,part.bbox.y0);bottom=Math.max(bottom,part.bbox.y1);
        const position=parseCoordinates(text);
        if(position){candidates.push({position,text,confidence:anchor.confidence??data.confidence,bbox:{x0:b.x0,y0:top,x1:right,y1:bottom}});break;}
      }
    }
    if(!candidates.length)for(const line of (data.text||'').split('\n')){
      if(!/^(?:XYZ|XY2|Block|B1ock)\b/i.test(line.trim()))continue;
      const position=parseCoordinates(line);if(position)candidates.push({position,text:line,confidence:data.confidence,bbox:null});
    }
    candidates.sort((a,b)=>Number(/^B/i.test(a.text))-Number(/^B/i.test(b.text)));
    return candidates[0]||null;
  }
  class Tracker {
    constructor() { this.position=null; this.pending=null; this.lastRead=0; this.history=[]; }
    read(p, confidence, now=Date.now()) {
      if (!p || confidence < 45) { this.pending=null; return null; }
      // Confirm every reading twice. Teleports must agree, even on the first fix.
      if (!this.pending || now-this.pending.time>5000 || distance(this.pending.p,p)>40 || Math.abs(this.pending.p.y-p.y)>30) {
        this.pending={p,time:now}; return null;
      }
      const jump=this.position ? distance(this.position,p) : 0;
      const landing=!this.position || jump>1000;
      this.position={...p}; this.lastRead=now; this.pending={p,time:now};
      if (landing) {
        this.history.unshift({...p,time:now,kind:jump?'Large jump':'First position'});
        this.history=this.history.slice(0,100);
      }
      return {position:this.position,landing,jump};
    }
  }
  const api={parseCoordinates,distance,normalize,Tracker,findCoordinateLine};
  if (typeof module==='object' && module.exports) module.exports=api; else root.RTPCore=api;
})(globalThis);

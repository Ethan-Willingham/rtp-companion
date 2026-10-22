(function(root){
  'use strict';
  // Small, fixed bitmap glyphs. Read the bright foreground, never the debug shadow.
  const glyphs={
    '0':['01110','10001','10011','10101','11001','10001','01110'],
    '1':['00100','01100','00100','00100','00100','00100','11111'],
    '2':['01110','10001','00001','00110','01000','10001','11111'],
    '3':['01110','10001','00001','00110','00001','10001','01110'],
    '4':['00011','00101','01001','10001','11111','00001','00001'],
    '5':['11111','10000','11110','00001','00001','10001','01110'],
    '6':['00110','01000','10000','11110','10001','10001','01110'],
    '7':['11111','10001','00001','00010','00100','00100','00100'],
    '8':['01110','10001','10001','01110','10001','10001','01110'],
    '9':['01110','10001','10001','01111','00001','00010','01100'],
    'X':['10001','01010','00100','01010','10001','10001','10001'],
    'Y':['10001','01010','00100','00100','00100','00100','00100'],
    'Z':['11111','00001','00010','00100','01000','10000','11111'],
    'B':['11110','10001','11110','10001','10001','10001','11110'],
    'l':['10','10','10','10','10','10','01'],
    'o':['00000','00000','01110','10001','10001','10001','01110'],
    'c':['00000','00000','01110','10001','10000','10001','01110'],
    'k':['1000','1000','1001','1010','1100','1010','1001'],
    ':':['0','0','1','0','0','0','1'],
    '.':['0','0','0','0','0','0','1'],
    '-':['00000','00000','00000','11111','00000','00000','00000'],
    '/':['00001','00010','00010','00100','01000','01000','10000']
  };
  function read(image){
    const {width,height,data}=image;
    const mask=new Uint8Array(width*height);
    for(let i=0;i<mask.length;i++){
      const r=data[i*4],g=data[i*4+1],b=data[i*4+2];
      mask[i]=Math.min(r,g,b)>=175 && Math.max(r,g,b)-Math.min(r,g,b)<=12 ? 1:0;
    }
    const bands=[];
    for(let y=0;y<height;y++){
      let on=false;
      for(let x=0;x<Math.min(40,width);x++)if(mask[y*width+x]){on=true;break;}
      if(on){if(!bands.length||y>bands[bands.length-1].end+1)bands.push({start:y,end:y});else bands[bands.length-1].end=y;}
    }
    const rows=[],labels=new Set();
    for(const band of bands){
      const rowHeight=band.end-band.start+1,scale=rowHeight/7;
      if(scale<1||scale>8||!Number.isInteger(scale))continue;
      const runs=[];
      for(let x=0;x<width;x++){
        let on=false;for(let y=band.start;y<=band.end;y++)if(mask[y*width+x]){on=true;break;}
        if(on){if(!runs.length||x>runs[runs.length-1].end+1)runs.push({start:x,end:x});else runs[runs.length-1].end=x;}
      }
      if(!runs.length||runs[0].start>24)continue;
      let text='',lastEnd=runs[0].start-1,right=lastEnd,invalid=false;
      for(const run of runs){
        const gap=run.start-lastEnd-1;
        // A long gap after a complete triple is the end of the debug line.
        if(gap>8*scale && root.RTPCore.parseCoordinates(text))break;
        if(gap>2*scale)text+=' ';
        const chars=Object.entries(glyphs).filter(([,bits])=>bits[0].length*scale===run.end-run.start+1);
        let char=null;
        for(const [key,bits] of chars){
          let matches=true;
          for(let by=0;by<7&&matches;by++)for(let bx=0;bx<bits[0].length&&matches;bx++){
            const expected=bits[by][bx]==='1'?1:0;
            for(let sy=0;sy<scale&&matches;sy++)for(let sx=0;sx<scale;sx++){
              if(mask[(band.start+by*scale+sy)*width+run.start+bx*scale+sx]!==expected){matches=false;break;}
            }
          }
          if(matches){char=key;break;}
        }
        if(!char){
          // Optional Block suffix or scenery is separated from the completed number.
          if(gap>2*scale && root.RTPCore.parseCoordinates(text))break;
          invalid=true;break;
        }
        text+=char;lastEnd=run.end;right=run.end;
        if(text.length<=4 && !'XYZ:'.startsWith(text) && !'Block:'.startsWith(text)){invalid=true;break;}
      }
      const label=text.match(/^(XYZ|Block):/);
      if(label)labels.add(label[1]);
      if(invalid||!label)continue;
      const position=root.RTPCore.parseCoordinates(text);
      if(position)rows.push({position,text,confidence:100,bbox:{x0:runs[0].start,y0:band.start,x1:right+1,y1:band.end+1}});
    }
    const xyz=rows.find(r=>r.text.startsWith('XYZ:')),block=rows.find(r=>r.text.startsWith('Block:'));
    if(labels.has('XYZ')&&labels.has('Block')&&(!xyz||!block||['x','y','z'].some(a=>Math.floor(xyz.position[a])!==block.position[a])))return {unconfirmed:true};
    const result=xyz||block;
    return result?{...result,paired:!!(xyz&&block)}:null;
  }
  const api={read,glyphs};
  if(typeof module==='object'&&module.exports){root={RTPCore:require('./core.js')};module.exports=api;}else root.RTPPixelOCR=api;
})(globalThis);

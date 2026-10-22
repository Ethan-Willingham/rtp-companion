const {test}=require('node:test');
const assert=require('node:assert/strict');
const {read,glyphs}=require('../public/pixel-ocr.js');
function frame(xyz,block,scale=1){
  const width=1000,height=250,data=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<data.length;i+=4){data[i]=40;data[i+1]=42;data[i+2]=40;data[i+3]=255;}
  function row(text,y){let x=4;
    for(const c of text){if(c===' '){x+=4*scale;continue;}const bits=glyphs[c];
      for(let by=0;by<7;by++)for(let bx=0;bx<bits[0].length;bx++)if(bits[by][bx]==='1')for(let sy=0;sy<scale;sy++)for(let sx=0;sx<scale;sx++){
        const i=((y+by*scale+sy)*width+x+bx*scale+sx)*4;data[i]=data[i+1]=data[i+2]=224;
      }x+=(bits[0].length+1)*scale;
    }
  }
  if(xyz)row(xyz,60);if(block)row(block,60+9*scale);
  return {width,height,data};
}
test('tiny pixel rows retain every digit, decimal and negative sign at native scales',()=>{
  for(const scale of [1,2,3]){
    const result=read(frame('XYZ: -109876.300 / -43.00000 / -293210.700','Block: -109877 -43 -293211',scale));
    assert.deepEqual(result.position,{x:-109876.3,y:-43,z:-293210.7});assert.equal(result.paired,true);
  }
  assert.deepEqual(read(frame('XYZ: 890123.456 / 72.00000 / -145678.043','Block: 890123 72 -145679')).position,{x:890123.456,y:72,z:-145678.043});
});
test('disagreeing or damaged paired rows are withheld instead of choosing one',()=>{
  assert.equal(read(frame('XYZ: 29613.300 / -43.000 / -239418.300','Block: 29613 -43 -239219')).unconfirmed,true);
  const damaged=frame('XYZ: 29613.300 / -43.000 / -239418.300','Block: 29613 -43 -239419');
  // Damage a digit, preserving both exact row labels.
  const i=(60*damaged.width+52)*4;damaged.data[i]=damaged.data[i+1]=damaged.data[i+2]=224;
  assert.equal(read(damaged).unconfirmed,true);
  assert.equal(read(frame(null,null)),null);
});
test('a single complete row is accepted and unrelated text is ignored',()=>{
  assert.deepEqual(read(frame(null,'Block: -9 63 23450')).position,{x:-9,y:63,z:23450});
});
module.exports={frame};

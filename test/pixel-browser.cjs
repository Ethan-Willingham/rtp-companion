const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {createServer}=require('../server.cjs');
(async()=>{
 let browser;const server=createServer({mapProvider:async kind=>JSON.stringify(require('./fixtures.cjs')[kind])});
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({executablePath:process.env.TEST_CHROME||chromium.executablePath(),headless:true});
  const page=await browser.newPage({viewport:{width:1150,height:900}});
  await page.addInitScript(()=>{
    window.rtpDesktop={listMinecraftWindows:async()=>[{id:'test:0',name:'Minecraft pixel test'}],selectMinecraftWindow:async()=>{}};
    const c=document.createElement('canvas');c.width=1280;c.height=720;const g=c.getContext('2d');
    let state={xyz:'-109876.300 / 63.00000 / -293210.700',block:'-109877 63 -293211',scale:1};
    window.pixelTest=(next)=>{state={...state,...next};paint();};
    function paint(){g.fillStyle='#263329';g.fillRect(0,0,c.width,c.height);if(!window.RTPPixelOCR||!state.xyz)return;
      function row(text,y){let x=4,s=state.scale;
        for(const char of text){if(char===' '){x+=s*4;continue;}const bits=window.RTPPixelOCR.glyphs[char];
          g.fillStyle='#383838';g.fillRect(x+s,y+s,6*s,7*s);
          g.fillStyle='#e0e0e0';
          for(let by=0;by<7;by++)for(let bx=0;bx<bits[0].length;bx++)if(bits[by][bx]==='1')g.fillRect(x+bx*s,y+by*s,s,s);
          x+=(bits[0].length+1)*s;
        }
      }row('XYZ: '+state.xyz,160);row('Block: '+state.block,160+9*state.scale);
    }
    setInterval(paint,100);
    Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{value:async()=>c.captureStream(5)});
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(()=>{Tesseract.createWorker=()=>{throw new Error('Pixel reader must work without Tesseract');};});
  await page.getByRole('button',{name:'Start tracking',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('x').textContent==='-109,877');
  assert.equal(await page.locator('#z').textContent(),'-293,211');
  assert.match(await page.locator('#ocrText').textContent(),/XYZ and Block agree/);
  assert.equal(await page.locator('#follow').textContent(),'Follow: off');
  assert.deepEqual(await page.evaluate(()=>({...view})),{x:.5,z:.5,zoom:1});
  await page.evaluate(()=>pixelTest({xyz:'3456.062 / 72.00000 / -145678.043',block:'3456 72 -145679',scale:2}));
  await page.waitForFunction(()=>document.getElementById('x').textContent==='3,456');
  assert.equal(await page.locator('#z').textContent(),'-145,679');
  assert.deepEqual(await page.evaluate(()=>({...view})),{x:.5,z:.5,zoom:1});
  await page.evaluate(()=>pixelTest({block:'3456 72 -145279'}));
  await page.waitForFunction(()=>document.getElementById('live').textContent==='Coordinates stale',null,{timeout:10000});
  assert.equal(await page.locator('#z').textContent(),'-145,679');
  assert.deepEqual(await page.evaluate(()=>({...view})),{x:.5,z:.5,zoom:1});
  await page.evaluate(()=>pixelTest({xyz:null}));
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('#live').textContent(),'Coordinates stale');
  await page.evaluate(()=>pixelTest({xyz:'-9.001 / -43.00000 / 890123.456',block:'-10 -43 890123',scale:3}));
  await page.waitForFunction(()=>document.getElementById('x').textContent==='-10');
  assert.equal(await page.locator('#z').textContent(),'890,123');
  await page.getByRole('button',{name:'Stop',exact:true}).click();
  assert.equal(await page.locator('#live').textContent(),'Stopped');
  console.log('PASS: native-size pixel glyphs, paired rows, signed coordinates, jumps, stale disagreements, hidden F3, recovery and Stop without general OCR.');
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

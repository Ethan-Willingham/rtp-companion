const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {createServer}=require('../server.cjs');
const desktop=process.argv.includes('--desktop');
(async()=>{
 let browser,page;const server=createServer({mapProvider:async kind=>JSON.stringify(require('./fixtures.cjs')[kind])});
 try {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const macTest='/Users/ethan/.local/bin/agent-chrome-for-testing';
  browser=await chromium.launch({executablePath:process.env.TEST_CHROME||(process.platform==='darwin'&&fs.existsSync(macTest)?macTest:chromium.executablePath()),headless:true});
  page=await browser.newPage({viewport:{width:760,height:1100}});
  const errors=[];const foreign=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))foreign.push(r.url());});
  await page.addInitScript(({desktop})=>{
   if(desktop)window.rtpDesktop={listMinecraftWindows:async()=>[{id:'test:0',name:'Minecraft synthetic test'}],selectMinecraftWindow:async()=>{}};
   const display=document.createElement('canvas');display.width=1280;display.height=720;
   const g=display.getContext('2d');
   let current=['-85000.250','70.000','42000.125'];
   window.drawTestCoordinates=(x,y,z)=>{current=[x,y,z];paint();};
   function paint(){const [x,y,z]=current;
    g.fillStyle='#366041';g.fillRect(0,0,1280,720);
    g.fillStyle='#202020';g.fillRect(12,40,1040,50);
    g.fillStyle='#fafafa';g.font='28px monospace';g.fillText(`XYZ: ${x} / ${y} / ${z}`,20,76);
   }
   paint();setInterval(paint,200);
   Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{value:async()=>display.captureStream(5)});
  },{desktop});
  await page.goto(base);
  await page.waitForFunction(()=>document.getElementById('mapStatus').textContent.includes('observations'),null,{timeout:60000});
  await page.getByRole('button',{name:'Try sample coordinates'}).click();
  await page.waitForFunction(()=>document.getElementById('x').textContent==='-140,000');
  assert.equal(await page.locator('#history li').count(),3);
  await page.getByRole('button',{name:desktop?'Start tracking':'1. Select Minecraft window',exact:true}).click();
  if(!desktop){
  await page.locator('#cropDialog').waitFor({state:'visible'});
  const rect=await page.locator('#cropCanvas').boundingBox();
  // Crop row at source pixel bounds x=12..1052, y=40..90.
  await page.mouse.move(rect.x+12/1280*rect.width,rect.y+40/720*rect.height);
  await page.mouse.down();
  await page.mouse.move(rect.x+1052/1280*rect.width,rect.y+90/720*rect.height,{steps:5});
  await page.mouse.up();
  await page.getByRole('button',{name:'Use this row'}).click();
  }
  await page.waitForFunction(()=>document.getElementById('x').textContent==='-85,001',null,{timeout:60000});
  assert.equal(await page.locator('#z').textContent(),'42,000');
  const mapWidth=await page.locator('#map').evaluate(el=>el.clientWidth);
  assert.ok(mapWidth>650, `Tracking map should fill the panel, got ${mapWidth}px`);
  await page.setViewportSize({width:1150,height:900});
  assert.ok(await page.locator('#map').evaluate(el=>el.clientWidth)>650);
  await page.setViewportSize({width:760,height:1100});
  await page.evaluate(()=>window.drawTestCoordinates('67000.500','64.000','-92000.250'));
  await page.waitForFunction(()=>document.getElementById('x').textContent==='67,000',null,{timeout:30000});
  assert.equal(await page.locator('#z').textContent(),'-92,001');
  assert.equal(await page.locator('#history li').count(),2);
  // Repeated readable text with poor OCR confidence must never move the marker.
  await page.evaluate(()=>{
    const recognize=worker.recognize.bind(worker);
    worker.recognize=async(...args)=>{const result=await recognize(...args);result.data.confidence=49;return result;};
    window.drawTestCoordinates('19812.300','-43.000','-224218.300');
  });
  await page.waitForTimeout(5000);
  assert.equal(await page.locator('#x').textContent(),'67,000');
  assert.equal(await page.locator('#z').textContent(),'-92,001');
  assert.equal(await page.locator('#live').textContent(),'Coordinates stale');
  await page.evaluate(()=>window.drawTestCoordinates('hidden','',''));
  await page.waitForTimeout(5000);
  assert.equal(await page.locator('#live').textContent(),'Coordinates stale');
  await page.getByRole('button',{name:'Stop',exact:true}).click();
  assert.equal(await page.locator('#live').textContent(),'Stopped');
  await page.getByRole('button',{name:'Try sample coordinates'}).click();
  await page.getByRole('button',{name:'Follow: off'}).click();
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export my landings'}).click();
  assert.equal((await downloadPromise).suggestedFilename(),'sample-landings.csv');
  await page.selectOption('#dimension','nether');
  assert.equal(await page.locator('#x').textContent(),'---');
  await page.selectOption('#dimension','overworld');
  await page.getByRole('button',{name:'Try sample coordinates'}).click();
  await page.getByRole('button',{name:'World',exact:true}).click();
  fs.mkdirSync(path.join(__dirname,'output'),{recursive:true});
  await page.screenshot({path:path.join(__dirname,'output/companion.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);assert.deepEqual(foreign,[]);
  console.log('PASS: actual local OCR, capture/crop, signed coordinates, teleport, stale readings, stop, dimensions, map, export, no external browser requests.');
 } catch(e) {
  if(page){console.error(await page.locator('#status').textContent(),await page.locator('#ocrText').textContent());await page.screenshot({path:path.join(__dirname,'failure.png'),fullPage:true});}
  throw e;
 } finally { if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve)); }
})().catch(e=>{console.error(e);process.exitCode=1;});

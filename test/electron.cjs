'use strict';
const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
(async()=>{
 let instance;
 try{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  instance=await electron.launch({args:[path.join(__dirname,'../electron/main.cjs'),'--smoke-test'],env});
  const page=await instance.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.waitForFunction(()=>typeof window.rtpDesktop==='object');
  assert.equal(await page.evaluate(()=>typeof window.require),'undefined');
  assert.deepEqual(await page.evaluate(()=>window.rtpDesktop.listMinecraftWindows()),[{id:'test:0',name:'Minecraft synthetic test'}]);
  await page.evaluate(()=>{
   const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const g=canvas.getContext('2d');
   function paint(){g.fillStyle='#365041';g.fillRect(0,0,1280,720);g.fillStyle='#202020';g.fillRect(12,40,1040,50);g.fillStyle='#fafafa';g.font='28px monospace';g.fillText('XYZ: -85000.250 / 70.000 / 42000.125',20,76);}
   paint();setInterval(paint,200);
   Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{value:async()=>canvas.captureStream(5)});
  });
  await page.getByRole('button',{name:'Start tracking',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('x').textContent==='-85,001',null,{timeout:60000});
  assert.match(await page.locator('#regionStatus').textContent(),/Asia/);
  assert.equal(await page.locator('#cropDialog').isVisible(),false);
  assert.ok(await page.evaluate(()=>typeof window.process==='undefined'));
  fs.mkdirSync(path.join(__dirname,'output'),{recursive:true});
  await page.screenshot({path:path.join(__dirname,'output/windows-app-synthetic.png'),fullPage:true});
  await page.getByRole('button',{name:'Stop',exact:true}).click();
  assert.deepEqual(errors,[]);
  console.log('PASS: Electron main/preload, restricted IPC, isolated renderer, automatic local OCR, region display, and stop. Screen capture was synthetic.');
 }finally{if(instance)await instance.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

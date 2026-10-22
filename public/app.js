'use strict';
const $=id=>document.getElementById(id);
const {parseCoordinates, normalize, Tracker,findCoordinateLine}=RTPCore;
const desktop=window.rtpDesktop;
let tracker=new Tracker(), stream=null, worker=null, workerPromise=null, crop=null;
let running=false, generation=0, timer=null, sampleMode=false, reading=false;
let mapData=null, regions=null, bitmap=null, follow=false;
let view={x:.5,z:.5,zoom:1}, drag=null, selection=null, selectionStart=null;
const video=$('capture'), map=$('map'), ctx=map.getContext('2d');
const shot=document.createElement('canvas'), shotCtx=shot.getContext('2d');
const ocr=$('ocrPreview'), ocrCtx=ocr.getContext('2d',{willReadFrequently:true});
let captureSize=null;
let autoFind=false,unreadable=0;
if(desktop){
  $('connect').textContent='Start tracking';$('crop').textContent='Adjust coordinate row';
  document.querySelector('.setup>p').textContent='Open Minecraft Java, show F3 coordinates, then click Start tracking.';
  $('status').textContent='The app finds your Minecraft window and coordinate row automatically.';
  const detail=document.querySelector('.setup>details');
  detail.innerHTML='<summary>Setup and privacy</summary><p>Keep Minecraft visible beside this app with F3 enabled. The reader finds the coordinate row automatically. Use Adjust coordinate row if automatic detection struggles. Use windowed or borderless mode. Select the dimension manually after portals.</p><p>Pixels and coordinates stay on this computer. No audio, game files, game memory, Minecraft mods, packets, or game controls are accessed. Only public map data is requested from Donut Auction. Server staff decide which tools are permitted; zero ban risk cannot be guaranteed.</p>';
}
function status(message) { $('status').textContent=message; }
function badge(message,kind='') { $('live').textContent=message; $('live').className=`badge ${kind}`; }
function format(n) { return Math.floor(n).toLocaleString('en-US'); }
function setDimension() {
  generation++; tracker=new Tracker(); sampleMode=false; updateReadout(); draw();
  status('Dimension changed. Coordinates will be read again; select the correct dimension after every portal.');
}
$('dimension').addEventListener('change',setDimension);
async function initWorker() {
  if (worker) return worker;
  if (workerPromise) return workerPromise;
  workerPromise=(async()=>{
    status('Loading the local coordinate reader...');
    const w=await Tesseract.createWorker('eng',1,{
      workerPath:'/vendor/worker.min.js',corePath:'/vendor/core',langPath:'/vendor',
      workerBlobURL:false,gzip:true,
      errorHandler:e=>status(`Reader error: ${e.message||e}. Stop and reconnect to retry.`)
    });
    if (!running) { await w.terminate(); throw new Error('Capture stopped'); }
    await w.setParameters({tessedit_pageseg_mode:'7',preserve_interword_spaces:'1'});
    worker=w; return w;
  })();
  try { return await workerPromise; } finally { workerPromise=null; }
}
function stopCapture(message='Capture stopped. The last marker is no longer live.') {
  running=false; generation++; clearTimeout(timer);
  if (stream) stream.getTracks().forEach(t=>t.stop());
  stream=null; video.srcObject=null; crop=null; captureSize=null;autoFind=false;
  $('connect').disabled=false; $('stop').disabled=true; $('crop').disabled=true;
  document.body.classList.remove('tracking');
  badge('Stopped','stale'); status(message);
  if (worker) { worker.terminate(); worker=null; }
}
$('stop').onclick=()=>stopCapture();
$('connect').onclick=async()=>{
  if (!navigator.mediaDevices?.getDisplayMedia) { status('Screen capture is unavailable here. Open http://localhost:4317 in Chrome or Edge.'); return; }
  $('connect').disabled=true;
  try {
    if(desktop){
      const sources=await desktop.listMinecraftWindows();
      if(!sources.length)throw new Error('No Minecraft game window found. Open Minecraft Java in windowed or borderless mode, then try again.');
      const previous=$('windowSelect').value;
      $('windowSelect').replaceChildren(...sources.map(s=>{const option=document.createElement('option');option.value=s.id;option.textContent=s.name;return option;}));
      if(sources.some(s=>s.id===previous))$('windowSelect').value=previous;
      $('windowPicker').hidden=sources.length<2;
      await desktop.selectMinecraftWindow($('windowSelect').value);
    }
    stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:5},audio:false});
    video.srcObject=stream; await video.play();
    stream.getVideoTracks()[0].addEventListener('ended',()=>stopCapture('Screen sharing ended. Select the Minecraft window to reconnect.'),{once:true});
    sampleMode=false; tracker=new Tracker(); updateReadout(); running=true;
    $('stop').disabled=false; $('crop').disabled=false;
    badge('Select coordinates'); status('Capture connected. Select just the complete XYZ or Block coordinate row.');
    if(desktop){autoFind=true;captureSize={w:video.videoWidth,h:video.videoHeight};status('Finding the F3 coordinate row automatically...');clearTimeout(timer);timer=setTimeout(readFrame,0);}else openCrop();
  } catch(e) { stopCapture(`Capture not started: ${e.message}${desktop?'':' Use the browser picker to choose Minecraft; macOS may require screen recording permission.'}`); }
};
$('windowSelect').onchange=()=>{if(running)stopCapture('Window changed. Click Start tracking to use the selected Minecraft window.');};
function openCrop() {
  if (!stream || !video.videoWidth) return;
  generation++;
  shot.width=video.videoWidth; shot.height=video.videoHeight;
  shotCtx.drawImage(video,0,0);
  const c=$('cropCanvas'); c.width=shot.width; c.height=shot.height;
  selection=null; selectionStart=null; $('useCrop').disabled=true;
  paintCrop(); $('cropDialog').showModal();
}
$('crop').onclick=openCrop;
function paintCrop() {
  const c=$('cropCanvas'), g=c.getContext('2d');
  g.drawImage(shot,0,0);
  if (!selection) return;
  const {x,y,w,h}=selection;
  g.fillStyle='#0009';g.fillRect(0,0,c.width,c.height);
  g.drawImage(shot,x,y,w,h,x,y,w,h);
  g.strokeStyle='#eee8bc';g.lineWidth=Math.max(2,c.width/600);g.strokeRect(x,y,w,h);
}
function cropPoint(e) {
  const c=$('cropCanvas'),r=c.getBoundingClientRect();
  return {x:Math.max(0,Math.min(c.width,(e.clientX-r.left)/r.width*c.width)),y:Math.max(0,Math.min(c.height,(e.clientY-r.top)/r.height*c.height))};
}
$('cropCanvas').onpointerdown=e=>{
  selectionStart=cropPoint(e); $('cropCanvas').setPointerCapture(e.pointerId);
};
$('cropCanvas').onpointermove=e=>{
  if (!selectionStart) return;
  const p=cropPoint(e);
  selection={x:Math.floor(Math.min(p.x,selectionStart.x)),y:Math.floor(Math.min(p.y,selectionStart.y)),w:Math.ceil(Math.abs(p.x-selectionStart.x)),h:Math.ceil(Math.abs(p.y-selectionStart.y))};
  $('useCrop').disabled=selection.w<50||selection.h<8;
  $('cropHint').textContent=`Selected ${selection.w} x ${selection.h} pixels. Keep only one coordinate line, including its label.`;
  paintCrop();
};
$('cropCanvas').onpointerup=()=>{selectionStart=null;};
$('cropCanvas').onpointercancel=()=>{selectionStart=null;};
$('cancelCrop').onclick=()=>$('cropDialog').close();
$('useCrop').onclick=()=>{
  if (!selection) return;
  crop={...selection};autoFind=false;unreadable=0;captureSize={w:video.videoWidth,h:video.videoHeight};
  tracker=new Tracker(); updateReadout(); $('cropDialog').close(); status('Starting the coordinate reader...');
};
$('cropDialog').addEventListener('close',()=>{
  if (running && (crop||autoFind)) { clearTimeout(timer); timer=setTimeout(readFrame,0); }
});
async function discoverRow(w){
  const sourceWidth=Math.ceil(video.videoWidth*.85),sourceHeight=Math.ceil(video.videoHeight*.75);
  const scale=Math.min(2,2400/sourceWidth);
  ocr.width=Math.round(sourceWidth*scale);ocr.height=Math.round(sourceHeight*scale);
  ocrCtx.imageSmoothingEnabled=false;ocrCtx.drawImage(video,0,0,sourceWidth,sourceHeight,0,0,ocr.width,ocr.height);
  const pixels=ocrCtx.getImageData(0,0,ocr.width,ocr.height);
  for(let i=0;i<pixels.data.length;i+=4){const value=(pixels.data[i]+pixels.data[i+1]+pixels.data[i+2])/3>160?0:255;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;pixels.data[i+3]=255;}
  ocrCtx.putImageData(pixels,0,0);
  await w.setParameters({tessedit_pageseg_mode:'3'});
  const {data}=await w.recognize(ocr,{}, {blocks:true});
  const found=findCoordinateLine(data);
  return{found,scale};
}
async function readFrame() {
  if (!running || (!crop&&!autoFind) || $('cropDialog').open) return;
  if (reading) { clearTimeout(timer);timer=setTimeout(readFrame,200);return; }
  reading=true;
  const token=generation;
  try {
    if (video.videoWidth!==captureSize.w || video.videoHeight!==captureSize.h) {
      generation++;crop=null;tracker.pending=null;
      if(desktop){autoFind=true;captureSize={w:video.videoWidth,h:video.videoHeight};status('Minecraft changed size. Finding the coordinate row again...');}
      else{badge('Re-select row','stale');status('Minecraft changed size. Select its coordinate row again.');}return;
    }
    const w=await initWorker();
    if (!running || token!==generation || $('cropDialog').open) return;
    if(autoFind){
      const {found,scale}=await discoverRow(w);
      if(!running||token!==generation||$('cropDialog').open)return;
      if(!found||found.confidence<45){status('Show Minecraft F3 coordinates. Looking for the XYZ or Block row...');return;}
      $('ocrText').textContent=found.text;
      if(found.bbox){
        const b=found.bbox,x=Math.max(0,Math.floor(b.x0/scale)-6),y=Math.max(0,Math.floor(b.y0/scale)-4);
        crop={x,y,w:Math.min(video.videoWidth-x,Math.ceil((b.x1-b.x0)/scale)+12),h:Math.min(video.videoHeight-y,Math.ceil((b.y1-b.y0)/scale)+8)};
        autoFind=false;unreadable=0;
      }
      const confirmed=tracker.read(found.position,found.confidence);
      if(confirmed){sampleMode=false;document.body.classList.add('tracking');updateReadout();if(follow)centerOnPlayer();draw();}
      status(confirmed?'Reading visible coordinates locally.':'Found the coordinate row. Confirming your position...');
      return;
    }
    await w.setParameters({tessedit_pageseg_mode:'7'});
    // Scale bright Minecraft glyphs and remove the translucent debug background.
    const scale=Math.max(2,Math.min(4,64/crop.h));
    const pad=16;
    ocr.width=Math.round(crop.w*scale)+pad*2;ocr.height=Math.round(crop.h*scale)+pad*2;
    ocrCtx.fillStyle='white';ocrCtx.fillRect(0,0,ocr.width,ocr.height);
    ocrCtx.imageSmoothingEnabled=false;
    ocrCtx.drawImage(video,crop.x,crop.y,crop.w,crop.h,pad,pad,ocr.width-pad*2,ocr.height-pad*2);
    const pixels=ocrCtx.getImageData(pad,pad,ocr.width-pad*2,ocr.height-pad*2);
    for(let i=0;i<pixels.data.length;i+=4){
      const bright=(pixels.data[i]+pixels.data[i+1]+pixels.data[i+2])/3;
      const value=bright>160?0:255;
      pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;pixels.data[i+3]=255;
    }
    ocrCtx.putImageData(pixels,pad,pad);
    const {data}=await w.recognize(ocr);
    if (!running || token!==generation || $('cropDialog').open) return;
    $('ocrText').textContent=`${data.text.trim()||'(no text)'}\nOCR confidence: ${Math.round(data.confidence)}%`;
    const p=parseCoordinates(data.text);
    const result=tracker.read(p,data.confidence);
    if (result) {
      unreadable=0;
      sampleMode=false;document.body.classList.add('tracking');updateReadout();
      status(result.landing&&result.jump ? 'Large coordinate jump confirmed. Your map marker has moved.' : 'Reading visible coordinates locally. Keep the selected row visible.');
      if (follow) centerOnPlayer();draw();
    } else if (!p || data.confidence<45) {
      status('Cannot read the coordinate row. Show F3, or use Adjust coordinate row.');
      if(desktop&&++unreadable>=4){crop=null;autoFind=true;unreadable=0;tracker.pending=null;}
    }
    else status('Confirming coordinates with another reading...');
  } catch(e) { if (running && token===generation) status(`Reader error: ${e.message}. Stop and reconnect to retry.`); }
  finally { reading=false;if (running && (crop||autoFind) && !$('cropDialog').open) { clearTimeout(timer);timer=setTimeout(readFrame,600); } }
}
function updateReadout() {
  const p=tracker.position;
  if (!p) $('freshness').textContent='Waiting for coordinates';
  for (const axis of ['x','y','z']) $(axis).textContent=p?format(p[axis]):'---';
  updateRegion();
  const list=$('history'); list.replaceChildren();
  if (!tracker.history.length) { const li=document.createElement('li');li.textContent='No landings yet. History stays in memory until you close or reload this page.';list.append(li); }
  for (const p of tracker.history) {
    const li=document.createElement('li');li.textContent=`${new Date(p.time).toLocaleTimeString()}  X ${format(p.x)} / Y ${format(p.y)} / Z ${format(p.z)} (${sampleMode?'Sample':p.kind})`;list.append(li);
  }
}
setInterval(()=>{
  if (sampleMode) {badge('Sample coordinates');$('freshness').textContent='Sample mode, not your Minecraft position';return;}
  if (!tracker.lastRead) return;
  const age=(Date.now()-tracker.lastRead)/1000;
  const live=running&&age<4;
  badge(live?'Reading live':running?'Coordinates stale':'Stopped',live?'live':'stale');
  $('freshness').textContent=live?'Confirmed just now':`Last confirmed ${Math.floor(age)}s ago; marker may be out of date`;
  draw();
},1000);
async function loadMap() {
  $('reload').disabled=true;$('mapStatus').textContent='Loading public RTP heatmap...';
  try {
    const results=await Promise.allSettled(['/api/heatmap','/api/regions'].map(async url=>{
      const r=await fetch(url);if (!r.ok) throw new Error(`Map service returned ${r.status}`);return r.json();
    }));
    if (results[0].status==='rejected') throw results[0].reason;
    const data=results[0].value,g=data.grid;
    if (!g || !['minX','maxX','minZ','maxZ','cellSize','width','height'].every(k=>Number.isFinite(g[k])) || g.width<=0 || g.height<=0 || g.width>5000 || g.height>5000 || g.maxX<=g.minX || g.maxZ<=g.minZ || !Array.isArray(data.cells)) throw new Error('Invalid map data');
    mapData=data;regions=results[1].status==='fulfilled'?RTPRegions.prepare(results[1].value):null;updateRegion();
    bitmap=document.createElement('canvas');bitmap.width=g.width;bitmap.height=g.height;
    const b=bitmap.getContext('2d'),image=b.createImageData(g.width,g.height);
    const max=Math.max(1,...data.cells.map(c=>c.rtpCount).slice(0,10000));
    let actualMax=max;for(const c of data.cells) actualMax=Math.max(actualMax,c.rtpCount);
    for(let i=0;i<image.data.length;i+=4) image.data.set([20,36,32,255],i);
    for(const c of data.cells) {
      if (!Number.isInteger(c.cellX)||!Number.isInteger(c.cellZ)||c.cellX<0||c.cellX>=g.width||c.cellZ<0||c.cellZ>=g.height||!Number.isFinite(c.rtpCount)) continue;
      const t=Math.log1p(c.rtpCount)/Math.log1p(actualMax), stops=[[24,44,43],[86,141,117],[223,189,114],[242,230,202]];
      const n=t*3,j=Math.min(2,Math.floor(n)),f=n-j;
      image.data.set([...stops[j].map((v,k)=>Math.round(v+(stops[j+1][k]-v)*f)),255],(c.cellZ*g.width+c.cellX)*4);
    }
    b.putImageData(image,0,0);
    $('mapStatus').textContent=`${data.totalRtps.toLocaleString()} public RTP observations${regions?' with region boundaries':''}. Raw counts, logarithmic colors.`;
    $('mapDate').textContent=`Snapshot: ${new Date(data.generatedAt).toLocaleString()}.`;
    draw();
  } catch(e) { $('mapStatus').textContent=`Heatmap unavailable: ${e.message}. ${mapData?'Keeping the previous map.':'Your marker still works on the coordinate grid.'}`;draw(); }
  finally {$('reload').disabled=false;}
}
const fallbackGrid={minX:-225000,maxX:225000,minZ:-225000,maxZ:225000};
function grid(){return mapData?.grid||fallbackGrid;}
function project(p,size){const n=normalize(p,grid());return{x:(n.x-view.x)*view.zoom*size+size/2,y:(n.z-view.z)*view.zoom*size+size/2};}
function worldAt(x,y,size){const g=grid();return{x:g.minX+(view.x+(x/size-.5)/view.zoom)*(g.maxX-g.minX),z:g.minZ+(view.z+(y/size-.5)/view.zoom)*(g.maxZ-g.minZ)};}
function updateRegion(){
  if($('dimension').value!=='overworld'){$('regionStatus').textContent='Region: no region map for this dimension';return;}
  const key=RTPRegions.at(regions,tracker.position);
  $('regionStatus').textContent=`Region: ${!tracker.position?'waiting for coordinates':!regions?'unavailable':RTPRegions.names[key]||'Unassigned / outside map'}`;
  $('regionStatus').style.color=RTPRegions.colors[key]||'';
}
function draw() {
  const size=map.clientWidth;if(!size)return;
  const dpr=window.devicePixelRatio||1;
  if(map.width!==Math.round(size*dpr)||map.height!==Math.round(size*dpr)){map.width=Math.round(size*dpr);map.height=Math.round(size*dpr);}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,size,size);
  ctx.fillStyle='#101a18';ctx.fillRect(0,0,size,size);
  const g=grid(),active=$('dimension').value==='overworld';
  const origin=project({x:g.minX,z:g.minZ},size),span=size*view.zoom;
  if(bitmap&&active){ctx.imageSmoothingEnabled=false;ctx.drawImage(bitmap,origin.x,origin.y,span,span);}
  if(regions&&active){
    const rg=regions.grid,lookup=new Map(regions.cells.map(c=>[`${c.cellX},${c.cellZ}`,c.region]));
    ctx.strokeStyle='#dde8ca66';ctx.lineWidth=1;ctx.beginPath();
    for(const c of regions.cells){if(!c.region)continue;
      const x=rg.minX+c.cellX*rg.cellSize,z=rg.minZ+c.cellZ*rg.cellSize;
      for(const [dx,dz,ax,az,bx,bz] of [[-1,0,x,z,x,z+rg.cellSize],[1,0,x+rg.cellSize,z,x+rg.cellSize,z+rg.cellSize],[0,-1,x,z,x+rg.cellSize,z],[0,1,x,z+rg.cellSize,x+rg.cellSize,z+rg.cellSize]]){
        if(lookup.get(`${c.cellX+dx},${c.cellZ+dz}`)===c.region)continue;
        const a=project({x:ax,z:az},size),b=project({x:bx,z:bz},size);ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
      }
    }ctx.stroke();
    for(const cell of regions.labels){
      const p=project({x:rg.minX+(cell.cellX+.5)*rg.cellSize,z:rg.minZ+(cell.cellZ+.5)*rg.cellSize},size),label=RTPRegions.names[cell.region];
      ctx.font='bold 12px system-ui';const width=ctx.measureText(label).width+14;
      if(p.x-width/2<0||p.x+width/2>size||p.y<14||p.y>size-14)continue;
      ctx.fillStyle='#101b17ee';ctx.fillRect(p.x-width/2,p.y-13,width,26);ctx.strokeStyle=RTPRegions.colors[cell.region];ctx.strokeRect(p.x-width/2,p.y-13,width,26);
      ctx.fillStyle=RTPRegions.colors[cell.region];ctx.textAlign='center';ctx.fillText(label,p.x,p.y+4);ctx.textAlign='left';
    }
  }
  const spawn=project({x:0,z:0},size);
  ctx.setLineDash([4,5]);ctx.strokeStyle='#e0e9c866';ctx.beginPath();ctx.moveTo(spawn.x,0);ctx.lineTo(spawn.x,size);ctx.moveTo(0,spawn.y);ctx.lineTo(size,spawn.y);ctx.stroke();ctx.setLineDash([]);
  for(const p of tracker.history){const q=project(p,size);ctx.fillStyle='#ded3b4';ctx.beginPath();ctx.arc(q.x,q.y,3,0,Math.PI*2);ctx.fill();}
  if(tracker.position){
    const p=project(tracker.position,size),visible=p.x>=0&&p.x<=size&&p.y>=0&&p.y<=size;
    if(visible){ctx.beginPath();ctx.arc(p.x,p.y,8,0,Math.PI*2);ctx.strokeStyle='#111b19';ctx.lineWidth=6;ctx.stroke();ctx.strokeStyle=(!running||Date.now()-tracker.lastRead>4000)?'#d6c18d':'#fffdf0';ctx.lineWidth=3;ctx.stroke();ctx.fillStyle='#fffdf0';ctx.beginPath();ctx.arc(p.x,p.y,2,0,Math.PI*2);ctx.fill();}
    else{ctx.fillStyle='#fff2d5';ctx.font='12px system-ui';ctx.fillText('Position outside this view. Select Follow.',14,48);}
  }
  if(!active){ctx.fillStyle='#fff2d5';ctx.font='12px system-ui';ctx.fillText(`${$('dimension').value.toUpperCase()}: coordinate grid only`,14,48);}
  ctx.strokeStyle='#91a58c';ctx.lineWidth=1;ctx.strokeRect(origin.x,origin.y,span,span);
}
function centerOnPlayer(){if(!tracker.position)return;const n=normalize(tracker.position,grid());view.x=n.x;view.z=n.z;}
function zoom(factor,anchor={x:.5,z:.5}){
  const before={x:view.x+(anchor.x-.5)/view.zoom,z:view.z+(anchor.z-.5)/view.zoom};
  view.zoom=Math.max(1,Math.min(128,view.zoom*factor));
  view.x=before.x-(anchor.x-.5)/view.zoom;view.z=before.z-(anchor.z-.5)/view.zoom;draw();
}
$('zoomIn').onclick=()=>zoom(2);$('zoomOut').onclick=()=>zoom(.5);
$('reset').onclick=()=>{view={x:.5,z:.5,zoom:1};follow=false;$('follow').textContent='Follow: off';draw();};
$('follow').onclick=()=>{follow=!follow;$('follow').textContent=`Follow: ${follow?'on':'off'}`;if(follow)centerOnPlayer();draw();};
map.onwheel=e=>{e.preventDefault();const r=map.getBoundingClientRect();zoom(e.deltaY>0?.8:1.25,{x:(e.clientX-r.left)/r.width,z:(e.clientY-r.top)/r.height});};
map.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,vx:view.x,vz:view.z};map.setPointerCapture(e.pointerId);follow=false;$('follow').textContent='Follow: off';};
map.onpointermove=e=>{
  const r=map.getBoundingClientRect();
  if(drag){view.x=drag.vx-(e.clientX-drag.x)/r.width/view.zoom;view.z=drag.vz-(e.clientY-drag.y)/r.height/view.zoom;draw();}
  const p=worldAt(e.clientX-r.left,e.clientY-r.top,r.width);
  let region='';if(regions&&$('dimension').value==='overworld'){const g=regions.grid;region=regions.cells.find(c=>c.cellX===Math.floor((p.x-g.minX)/g.cellSize)&&c.cellZ===Math.floor((p.z-g.minZ)/g.cellSize))?.region||'';}
  $('hover').textContent=`X ${format(p.x)} / Z ${format(p.z)}${region?` / ${region}`:''}`;
};
map.onpointerup=()=>{drag=null;};map.onpointercancel=()=>{drag=null;};
$('demo').onclick=()=>{
  if(running){status('Stop screen capture before trying sample coordinates.');return;}
  sampleMode=true;tracker=new Tracker();const now=Date.now();
  for(const [i,p] of [{x:-85000,y:70,z:42000},{x:67000,y:64,z:-92000},{x:-140000,y:82,z:-31000}].entries()){
    tracker.read(p,99,now+i*1000);tracker.read(p,99,now+i*1000+600);
  }
  view={x:.5,z:.5,zoom:1};updateReadout();draw();badge('Sample coordinates');$('freshness').textContent='Sample mode, not your Minecraft position';status('Showing sample positions. Select Minecraft to start your own live session.');
};
$('clear').onclick=()=>{tracker.history=[];updateReadout();draw();};
$('export').onclick=()=>{
  const csv='kind,dimension,x,y,z,time,sample\n'+tracker.history.map(p=>[p.kind,$('dimension').value,p.x,p.y,p.z,new Date(p.time).toISOString(),sampleMode].join(',')).join('\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download=sampleMode?'sample-landings.csv':'my-rtp-landings.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
};
$('reload').onclick=loadMap;
new ResizeObserver(draw).observe(map);
window.addEventListener('pagehide',()=>stopCapture());
loadMap();

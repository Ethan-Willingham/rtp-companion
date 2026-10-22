'use strict';
const {app,BrowserWindow,desktopCapturer,ipcMain,Menu,session,dialog,shell}=require('electron');
const path=require('node:path');
const {createServer}=require('../server.cjs');
const {isMinecraftWindow}=require('./windows.cjs');
let window,server,origin,selectedWindow=null;
const smoke=process.argv.includes('--smoke-test');
if (!smoke && !app.requestSingleInstanceLock()) app.quit();
else {
app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.focus();}});
app.whenReady().then(async()=>{
  server=createServer(smoke?{mapProvider:async kind=>JSON.stringify(require('../test/fixtures.cjs')[kind])}:{});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  origin=`http://127.0.0.1:${server.address().port}`;
  function trusted(event){return event.sender===window?.webContents && event.senderFrame===window.webContents.mainFrame && event.senderFrame.url.startsWith(origin+'/');}
  async function sources(){
    if(smoke)return[{id:'test:0',name:'Minecraft synthetic test'}];
    return(await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:0,height:0},fetchWindowIcons:false})).filter(s=>isMinecraftWindow(s.name));
  }
  ipcMain.handle('rtp:list-windows',async event=>{if(!trusted(event))throw new Error('Untrusted frame');return(await sources()).map(s=>({id:s.id,name:s.name}));});
  ipcMain.handle('rtp:select-window',async(event,id)=>{
    if(!trusted(event)||typeof id!=='string')throw new Error('Invalid capture request');
    const found=(await sources()).find(s=>s.id===id);if(!found)throw new Error('Minecraft window closed. Open it and try again.');
    selectedWindow=found.id;
  });
  session.defaultSession.setDisplayMediaRequestHandler(async(request,callback)=>{
    try{
      if(!request.frame||request.frame!==window?.webContents.mainFrame||new URL(request.securityOrigin).origin!==origin||request.audioRequested||!selectedWindow)return callback(null);
      const found=(await sources()).find(s=>s.id===selectedWindow);
      callback(found?{video:found}:null);
    }catch{callback(null);}
  });
  session.defaultSession.setPermissionRequestHandler((webContents,permission,callback)=>callback(webContents===window?.webContents&&permission==='display-capture'));
  session.defaultSession.setPermissionCheckHandler((webContents,permission,requestOrigin)=>webContents===window?.webContents&&requestOrigin===origin&&permission==='display-capture');
  window=new BrowserWindow({title:'RTP Companion',width:1150,height:900,minWidth:500,minHeight:650,backgroundColor:'#111b19',show:!smoke,
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  Menu.setApplicationMenu(null);
  window.webContents.setWindowOpenHandler(({url})=>{
    if(['https://donut.auction/rtp-heatmap','https://rules.donutsmp.net/'].includes(url))shell.openExternal(url);
    return{action:'deny'};
  });
  window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(origin+'/'))event.preventDefault();});
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  window.on('closed',()=>{selectedWindow=null;window=null;app.quit();});
  await window.loadURL(origin+'/');
}).catch(e=>{dialog.showErrorBox('RTP Companion could not start',e.message);app.quit();});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{if(server)server.close();});
}

'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('rtpDesktop',Object.freeze({
  listMinecraftWindows:()=>ipcRenderer.invoke('rtp:list-windows'),
  selectMinecraftWindow:id=>ipcRenderer.invoke('rtp:select-window',id)
}));

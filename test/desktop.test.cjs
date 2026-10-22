const {test}=require('node:test');
const assert=require('node:assert/strict');
const {findCoordinateLine}=require('../public/core.js');
const regions=require('../public/regions.js');
const {isMinecraftWindow}=require('../electron/windows.cjs');
test('auto-detection joins OCR fragments on one baseline and preserves signs',()=>{
 const line=(text,x0,x1,y0=50)=>({text,confidence:95,bbox:{x0,x1,y0,y1:y0+20}});
 const data={confidence:95,blocks:[{paragraphs:[{lines:[line('XYZ: -85000.250',10,240),line('/ 70.000 / 42000.125',250,650),line('Block: -85001 70 42000',10,450,80),line('999 123 456',10,450,110)]}]}]};
 const r=findCoordinateLine(data);
 assert.deepEqual(r.position,{x:-85000.25,y:70,z:42000.125});
 assert.deepEqual(r.bbox,{x0:10,y0:50,x1:650,y1:70});
 assert.equal(findCoordinateLine({text:'Chunk: 3 4 5\n123 456 789',confidence:95}),null);
});
test('Minecraft source filter excludes launchers, browsers and the companion',()=>{
 assert.ok(isMinecraftWindow('Minecraft 26.3 - Multiplayer'));
 for(const name of ['Minecraft Launcher','Minecraft Wiki - Google Chrome','RTP Companion','Minecraft - Microsoft Edge',''])assert.equal(isMinecraftWindow(name),false,name);
});
test('region labels stay in their assigned regions and lookup respects world bounds',()=>{
 const data=regions.prepare(require('./fixtures.cjs').regions);
 assert.equal(data.labels.length,6);
 for(const c of data.labels)assert.equal(regions.at(data,{x:data.grid.minX+(c.cellX+.5)*25000,z:data.grid.minZ+(c.cellZ+.5)*25000}),c.region);
 assert.equal(regions.at(data,{x:192262,z:-56241}),'east');
 assert.equal(regions.at(data,{x:225000,z:0}),null);
 assert.equal(regions.at(data,{x:-225001,z:0}),null);
 assert.throws(()=>regions.prepare({grid:{cellSize:0},cells:[]}));
});

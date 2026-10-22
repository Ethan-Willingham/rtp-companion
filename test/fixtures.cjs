'use strict';
const grid={minX:-225000,maxX:225000,minZ:-225000,maxZ:225000,cellSize:25000,width:18,height:18};
const cells=Array.from({length:324},(_,i)=>({cellX:i%18,cellZ:Math.floor(i/18),rtpCount:i%17+1,rtpPercentage:0}));
const heatmap={dimension:'overworld',grid,cells,totalRtps:cells.reduce((s,c)=>s+c.rtpCount,0),generatedAt:'2026-10-22T00:00:00Z'};
const regions={grid,cells:cells.map(c=>({...c,region:c.cellZ<9?(c.cellX<3?'oceania':c.cellX<8?'west':'east'):c.cellZ<12?'asia':c.cellX<6?'eu west':'eu central'}))};
module.exports={heatmap,regions};

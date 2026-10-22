'use strict';
// Only a Minecraft game window, never the launcher, a browser or this app.
function isMinecraftWindow(name){
  return typeof name==='string' && /\bminecraft\b/i.test(name) && !/launcher|rtp companion|chrome|edge|firefox/i.test(name);
}
module.exports={isMinecraftWindow};

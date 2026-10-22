'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const root=path.join(__dirname,'..');
const modelHash='ed350f3752f81ee8f38769edc14d92d997dababe23b565c59879372cc46a2468';
async function main(){
  const target=path.join(root,'public/vendor'),core=path.join(target,'core');
  await fs.mkdir(core,{recursive:true});
  const tess=path.dirname(require.resolve('tesseract.js/package.json'));
  const engine=path.dirname(require.resolve('tesseract.js-core/package.json'));
  for(const file of ['tesseract.min.js','worker.min.js'])await fs.copyFile(path.join(tess,'dist',file),path.join(target,file));
  await fs.copyFile(path.join(tess,'LICENSE.md'),path.join(target,'TESSERACT-LICENSE.txt'));
  await fs.copyFile(path.join(engine,'LICENSE'),path.join(target,'CORE-LICENSE.txt'));
  for(const file of await fs.readdir(engine))if(file.startsWith('tesseract-core')&&/\.(js|wasm)$/.test(file))await fs.copyFile(path.join(engine,file),path.join(core,file));
  const file=path.join(target,'eng.traineddata.gz');let data;
  try{data=await fs.readFile(file);}catch{}
  if(!data||createHash('sha256').update(data).digest('hex')!==modelHash){
    const response=await fetch('https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz',{signal:AbortSignal.timeout(120000)});
    if(!response.ok)throw new Error(`English OCR data download failed: ${response.status}`);
    data=Buffer.from(await response.arrayBuffer());
    if(createHash('sha256').update(data).digest('hex')!==modelHash)throw new Error('English OCR model checksum does not match the pinned version');
    await fs.writeFile(file,data);
  }
  console.log('Local OCR assets ready; English model SHA-256 verified.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

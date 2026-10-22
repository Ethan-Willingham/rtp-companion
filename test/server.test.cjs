const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('../server.cjs');
const http=require('node:http');
test('local server serves bundled UI, limits methods and hosts, and proxies only fixed map routes',async()=>{
 const calls=[];const server=createServer({mapProvider:async kind=>{calls.push(kind);return JSON.stringify({kind});}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const r=await fetch(base+'/');assert.equal(r.status,200);assert.match(r.headers.get('content-security-policy'),/connect-src 'self'/);
  assert.equal((await fetch(base+'/',{method:'POST'})).status,405);
  const foreignHost=await new Promise((resolve,reject)=>{const request=http.get(base+'/',{headers:{Host:'attacker.invalid'}},response=>{response.resume();resolve(response.statusCode);});request.on('error',reject);});
  assert.equal(foreignHost,403);
  assert.equal((await fetch(base+'/package.json')).status,404);
  assert.deepEqual(await(await fetch(base+'/api/regions')).json(),{kind:'regions'});
  assert.equal((await fetch(base+'/api/unknown')).status,404);assert.deepEqual(calls,['regions']);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

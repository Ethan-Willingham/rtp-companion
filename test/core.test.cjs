const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseCoordinates,Tracker,normalize}=require('../public/core.js');
test('Java XYZ and Block rows retain signs and decimals',()=>{
  assert.deepEqual(parseCoordinates('XYZ: -12345.250 / 64.000 / 98765.125\n'),{x:-12345.25,y:64,z:98765.125});
  assert.deepEqual(parseCoordinates('Block: -12345 64 -98765 [1 0 2]'),{x:-12345,y:64,z:-98765});
  assert.deepEqual(parseCoordinates('Position: -123, 70, 456'),{x:-123,y:70,z:456});
  assert.deepEqual(parseCoordinates('X: -123 Y: 70 Z: 456'),{x:-123,y:70,z:456});
  assert.deepEqual(parseCoordinates('-123 70 -456'),{x:-123,y:70,z:-456});
  assert.deepEqual(parseCoordinates('XY2: -123 / 70 / -456'),{x:-123,y:70,z:-456});
});
test('rejects ambiguous, incomplete, implausible and unrelated debug text',()=>{
  for(const value of ['XYZ: -123 / 64','Chunk: 3 4 5','Facing north 2 3 4','XYZ: 123 9000 123','XYZ: 1 64 2\nBlock: 1 64 2','12O 64 456','1,234 64 5,678','Server: 20 10 30']) assert.equal(parseCoordinates(value),null,value);
});
test('confirms jumps twice and does not record a transient OCR sign error',()=>{
  const t=new Tracker(),a={x:-85000,y:64,z:42000},b={x:67000,y:80,z:-92000};
  assert.equal(t.read(a,95,1000),null);assert.ok(t.read(a,95,1600));
  assert.equal(t.read({x:85000,y:64,z:42000},95,2200),null);
  assert.equal(t.history.length,1);
  assert.equal(t.read(b,95,2800),null);
  assert.ok(t.read(b,95,3400).landing);assert.equal(t.history.length,2);
  assert.equal(t.read(a,20,4000),null);assert.deepEqual(t.position,b);
});
test('world projection is north up with X right and Z down',()=>{
  const g={minX:-225000,maxX:225000,minZ:-225000,maxZ:225000};
  assert.deepEqual(normalize({x:0,z:0},g),{x:.5,z:.5});
  assert.deepEqual(normalize({x:-225000,z:-225000},g),{x:0,z:0});
});

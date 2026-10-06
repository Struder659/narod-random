import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomIndex,shuffle,validateCatalog} from '../site/catalog.js';
const site=(name)=>({url:`https://${name}.narod.ru/`,title:name,checkedAt:'2026-10-07T00:00:00Z',preview:'previews/0123456789abcdef.jpg'});
test('catalog rejects foreign hosts, credentials, bad preview paths and duplicate domains',()=>{
 const a=site('a');const rows=[a,{...a,url:'https://www.a.narod.ru/'},{...a,url:'https://evil.example/'},{...a,url:'https://user:pass@b.narod.ru/'},{...site('c'),preview:'https://evil.example/image.jpg'},site('b')];
 assert.deepEqual(validateCatalog({sites:rows}),[a,site('b')]);
 assert.throws(()=>validateCatalog({sites:[]}));
});
test('random deck includes all sites once and avoids repeating the last site at the boundary',()=>{
 const sites=[site('a'),site('b'),site('c')];
 for(let n=0;n<30;n++){
  const deck=shuffle(sites,sites[0].url);
  assert.equal(new Set(deck.map(s=>s.url)).size,3);
  assert.notEqual(deck.at(-1).url,sites[0].url);
 }
});
test('random index rejects invalid ranges and removes modulo bias',()=>{
 assert.throws(()=>randomIndex(0));let calls=0;
 assert.equal(randomIndex(3,{getRandomValues(array){array[0]=calls++?4:0xffffffff;}}),1);
 assert.equal(calls,2);
});

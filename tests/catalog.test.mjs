import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomIndex,shuffle,validateCatalog,createHistory} from '../site/catalog.js';
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

test('viewed hosts survive reloads, normalize protocol/www and exhaust without repeats',()=>{
 let saved=null;
 const storage={getItem:()=>saved,setItem:(key,value)=>{saved=value;}};
 const first=createHistory(()=>storage);
 first.remember(site('a'));
 const reloaded=createHistory(()=>storage);
 assert.deepEqual(reloaded.unseen([{...site('a'),url:'http://www.a.narod.ru/other.html'},site('b')]),[site('b')]);
 reloaded.remember(site('b'));
 assert.deepEqual(first.unseen([site('a'),site('b')]),[]);
 assert.deepEqual(first.unseen([site('a'),site('b'),site('c')]),[site('c')]);
});

test('malformed or blocked browser storage does not break session history',()=>{
 for(const storage of [()=>{throw Error('blocked');},()=>({getItem:()=>'{broken',setItem:()=>{throw Error('quota');}})]) {
  const history=createHistory(storage);
  history.remember(site('a'));
  assert.deepEqual(history.unseen([site('a'),site('b')]),[site('b')]);
 }
});

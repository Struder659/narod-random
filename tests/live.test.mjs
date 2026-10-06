import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHistory} from '../site/history.js';
import {cors,readJSON,validExclusions} from '../server/lib/http.mjs';
import random from '../api/random.js';
import preview from '../api/preview.js';
const origin='https://struder659.github.io';
const request=(path,body,from=origin)=>new Request('https://api.example/api/'+path,{method:'POST',headers:{origin:from,'content-type':'application/json'},body:JSON.stringify(body)});
test('Pages preflight works; unrelated origins cannot start discovery or capture',async()=>{
 const preflight=cors(new Request('https://api.example',{method:'OPTIONS',headers:{origin}})).response;
 assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),origin);
 for(const handler of [random,preview])assert.equal((await handler.fetch(request('random',{},'https://evil.example'))).status,403);
});
test('invalid request bodies and off-domain preview targets are rejected before network access',async()=>{
 assert.equal((await random.fetch(request('random',{exclude:['https://evil.example']}))).status,400);
 for(const url of ['http://127.0.0.1/','https://narod.ru/','https://a.narod.ru@evil.example/','https://a.narod.ru:8080/'])assert.equal((await preview.fetch(request('preview',{url}))).status,400);
 assert.equal(validExclusions(['a.narod.ru','www.b.narod.ru']),true);
 assert.equal(validExclusions(Array(10001).fill('a.narod.ru')),false);
 await assert.rejects(readJSON(request('random',{exclude:['a.narod.ru']}),5));
});
test('history survives reloads, merges other tabs, and treats HTTP/www as the same site',()=>{
 let saved=null;const store={getItem:()=>saved,setItem:(key,value)=>{saved=value;}};
 const first=createHistory(()=>store);first.remember({url:'https://a.narod.ru/'});
 const second=createHistory(()=>store);second.remember({url:'http://www.a.narod.ru/other'});second.remember({url:'https://b.narod.ru/'});
 assert.deepEqual(first.exclusions(),['a.narod.ru','b.narod.ru']);
});
test('unavailable browser storage still excludes viewed sites in this session',()=>{
 const history=createHistory(()=>{throw Error('blocked');});history.remember({url:'https://a.narod.ru/'});
 assert.deepEqual(history.exclusions(),['a.narod.ru']);
});

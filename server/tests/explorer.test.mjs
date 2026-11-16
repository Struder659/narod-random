import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIndexHosts, parseBlock, inspectHTML, readPage, indexResource, latestCollection } from '../lib/explorer.mjs';

test('official collection listing selects the latest crawl regardless of row order', () => {
  assert.equal(latestCollection(`
    <a href="/crawl-data/CC-MAIN-2025-51/index.html">older</a>
    <a href='/crawl-data/CC-MAIN-2026-43/index.html'>newer</a>
    <a href="/crawl-data/CC-MAIN-2026-39/index.html">older</a>
    <a href="https://evil.example/crawl-data/CC-MAIN-9999-01/index.html">ignore</a>
    <a href="/crawl-data/CC-MAIN-9999-99/index.html">invalid week</a>
  `),'CC-MAIN-2026-43');
  assert.throws(()=>latestCollection('<html>Service unavailable</html>'),/No crawl index/);
});

test('a temporary upstream 503 is retried and preserves the requested byte range', async () => {
  const original=globalThis.fetch; const requests=[];
  try {
    globalThis.fetch=async (url,options)=>{
      requests.push({url,range:options.headers.Range,time:Date.now()});
      return requests.length===1 ? new Response('Unavailable',{status:503}) : new Response('test',{
        status:206,headers:{'Content-Range':'bytes 20-23/100'}
      });
    };
    const result=await indexResource('https://data.commoncrawl.org/test',Date.now()+5000,{start:20,end:23});
    assert.equal(new TextDecoder().decode(result.bytes),'test');
    assert.equal(result.total,100);
    assert.equal(requests.length,2);
    assert(requests[1].time-requests[0].time>=950,'retry must pause before repeating the upstream request');
    assert(requests.every(request=>request.range==='bytes=20-23'));
  } finally {globalThis.fetch=original;}
});

test('permanent errors and Retry-After beyond the deadline do not trigger more requests', async () => {
  const original=globalThis.fetch;
  try {
    for(const status of [404,429]){
      let calls=0;
      globalThis.fetch=async ()=>{calls++;return new Response(null,{status,headers:{'Retry-After':'3600'}});};
      await assert.rejects(indexResource('https://data.commoncrawl.org/test',Date.now()+5000),new RegExp(`HTTP ${status}`));
      assert.equal(calls,1);
    }
  } finally {globalThis.fetch=original;}
});

test('one candidate per domain; only HTML narod.ru addresses survive index parsing', () => {
  const records = [
    {url:'http://alpha.narod.ru/a.htm', status:'200', mime:'text/html'},
    {url:'https://www.alpha.narod.ru/b.htm', status:'200', mime:'text/html'},
    {url:'https://beta.narod.ru/', status:'200', mime:'application/xhtml+xml'},
    {url:'https://invalid.narod.ru/', status:'404', mime:'text/html'},
    {url:'https://binary.narod.ru/', status:'200', mime:'image/jpeg'},
    {url:'https://evil.example/', status:'200'},
    {url:'https://alpha.narod.ru@127.0.0.1/', status:'200'},
    {url:'https://alpha.narod.ru.evil.example/', status:'200'},
    {url:'https://alpha.narod.ru:8080/', status:'200'},
  ];
  const input = records.map(row=>'ru,narod)/ 20261007 '+JSON.stringify(row)).join('\n')+'\nbroken row';
  assert.deepEqual([...parseIndexHosts(input)], [['alpha.narod.ru','https://alpha.narod.ru/'],['beta.narod.ru','https://beta.narod.ru/']]);
});

test('sparse index cannot request arbitrary files or unbounded byte ranges', () => {
  assert.deepEqual(parseBlock('ru,narod,a)/ 2026\tcdx-00270.gz\t12345\t987\t42'), {file:'cdx-00270.gz',offset:12345,length:987});
  for(const row of ['x\t../../private\t0\t100', 'x\tcdx-00270.gz\t-1\t100','x\tcdx-00270.gz\t0\t9000000','broken']) assert.equal(parseBlock(row),null);
});

test('closed sites and redirect placeholders are rejected', () => {
  assert.equal(inspectHTML('<title>Nelt-Site.Narod.ru-Сайт закрыт</title><p>Сайт больше не доступен</p>'),null);
  assert.equal(inspectHTML('<title>Website is closed</title>'),null);
  assert.equal(inspectHTML('<title>Сайт удалён</title>'),null);
  assert.equal(inspectHTML('<meta http-equiv="refresh" content="0;url=https://other.example">'),null);
  assert(inspectHTML('<title>Старый сайт</title><p>'+ 'Архив фотографий и рассказов. '.repeat(5)+'</p>'));
});

test('a narod.ru redirect cannot turn the verifier into an off-domain fetcher', async () => {
  const original=globalThis.fetch; const requests=[];
  try {
    globalThis.fetch=async url=>{requests.push(url);return new Response(null,{status:302,headers:{Location:'http://127.0.0.1/private'}});};
    assert.equal(await readPage('https://alpha.narod.ru/'),null);
    assert.equal(requests.length,1);
  } finally {globalThis.fetch=original;}
});

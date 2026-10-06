// Discover addresses from random Common Crawl index blocks; no fixed site list.
// The bounded candidate pool, index metadata and cooldowns exist only in RAM.
const blockedHosts = new Set(['www.narod.ru', 'narod.ru', 'www.www.narod.ru']);
export function allowedURL(value        , base         )             {
  try {
    const url = new URL(value.replace(/&amp;/gi, '&'), base);
    if (!/^https?:$/.test(url.protocol) || url.port || url.username || url.password || url.href.length > 500) return null;
    if (!/^(?:www\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.narod\.ru$/i.test(url.hostname) || blockedHosts.has(url.hostname)) return null;
    if (/\.(?:zip|rar|exe|pdf|mp3|mp4|jpg|png|gif|css|js|docx?|xlsx?)$/i.test(url.pathname)) return null;
    url.hash = ''; url.search = '';
    return url;
  } catch { return null; }
}
export const hostKey = (url        ) => new URL(url).hostname.replace(/^www\./, '');
export function extractLinks(html        , base        )           {
  const links = new Set        ();
  for (const match of html.matchAll(/\b(?:href|src)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)) {
    const url = allowedURL(match[1] || match[2] || match[3], base);
    if (url) links.add(url.href);
  }
  return [...links].slice(0, 250);
}
function clean(text        ) {
  return text.replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|#160);/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#(\d+);/g, (_,n)=>String.fromCodePoint(Math.min(Number(n),0x10ffff))).replace(/\s+/g, ' ').trim();
}
export function inspectHTML(html        ) {
  const title = clean(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').slice(0, 180);
  if (/сайт\s+(?:(?:временно|навсегда)\s+)?закрыт|(?:site|website)\s+(?:is\s+)?closed/i.test(title)) return null;
  const text = clean(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ''));
  const rejection = /(?:site|website|account) (?:is |was |has been )?(?:not found|deleted|disabled|blocked|suspended)|сайт (?:был |временно )?(?:удал[её]н|заблокирован|не найден|не существует)|страница (?:не найдена|удалена)|домен (?:прода[её]тся|припаркован)|domain (?:is )?for sale|access denied|checking your browser|just a moment|verify you are human|доступ (?:запрещ[её]н|ограничен)/i;
  if (rejection.test(title) || rejection.test(text.slice(0, 800)) || /^(?:404|403|error)\b/i.test(title)) return null;
  // Do not open refresh redirects, which can silently leave narod.ru.
  if (/<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i.test(html)) return null;
  if (text.length < 60 && !/<frameset\b/i.test(html)) return null;
  return { title };
}
export async function readPage(input        , timeout = 5500) {
  let url = allowedURL(input);
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    for (let redirects = 0; redirects < 4; redirects++) {
      const response           = await fetch(url.href, { redirect:'manual', signal:controller.signal, headers:{ Accept:'text/html,application/xhtml+xml', 'User-Agent':'NarodWander/1.0 (link availability check)' } });
      if (response.status >= 300 && response.status < 400) {
        const location                = response.headers.get('location');
        await response.body?.cancel();
        url = location ? allowedURL(location, url.href) : null;
        if (!url) return null;
        continue;
      }
      if (!response.ok || !/text\/html|application\/xhtml\+xml/i.test(response.headers.get('content-type') || '')) { await response.body?.cancel(); return null; }
      const reader = response.body?.getReader();
      if (!reader) return null;
      const chunks               = []; let total = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.length;
          if (total > 600_000) { await reader.cancel(); return null; }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(total); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const sample = new TextDecoder('latin1').decode(bytes.slice(0, 5000));
      const encoding = (response.headers.get('content-type') || '').match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] || sample.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] || 'windows-1251';
      let html        ;
      try { html = new TextDecoder(encoding).decode(bytes); } catch { html = new TextDecoder().decode(bytes); }
      const info = inspectHTML(html);
      return info ? { url:url.href, html, ...info } : null;
    }
    return null;
  } catch { return null; } finally { clearTimeout(timer); }
}
const candidates = new Map                ();
const cooldowns = new Map                ();

const USER_AGENT = 'NarodWander/2.0 (local old-web discovery prototype)';
let indexState                                                                                       = null;
let discoveryInFlight                       = null;

let retryDiscoveryAt = 0;

export function randomIndex(length        )         {
  if (!Number.isSafeInteger(length) || length < 1 || length > 0x100000000) throw new Error('Invalid random range');
  const limit = Math.floor(0x100000000 / length) * length;
  const buffer = new Uint32Array(1);
  do { crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
  return buffer[0] % length;
}
function shuffled   (values     )      {
  for(let i=values.length-1;i>0;i--){ const j=randomIndex(i+1); [values[i],values[j]]=[values[j],values[i]]; }
  return values;
}

// Deduplicate by host BEFORE sampling: a site with 10,000 pages gets one entry.
export function parseIndexHosts(text        )                      {
  const hosts = new Map                ();
  for (const line of text.split('\n')) {
    try {
      const jsonStart = line.indexOf('{');
      if(jsonStart<0) continue;
      const record = JSON.parse(line.slice(jsonStart));
      if (record.status && String(record.status) !== '200') continue;
      if (record.mime && !['text/html','application/xhtml+xml'].includes(record.mime)) continue;
      const url = typeof record.url === 'string' ? allowedURL(record.url) : null;
      if (!url) continue;
      const key = hostKey(url.href);
      hosts.set(key, `https://${key}/`);
    } catch { /* Skip malformed index records. */ }
  }
  return hosts;
}

async function limitedBytes(stream                            , limit        )                      {
  const reader = stream.getReader(); const chunks              =[]; let total=0;
  try {
    while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>limit){await reader.cancel();throw new Error('Index response too large');}chunks.push(value);}
  } finally {reader.releaseLock();}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}

                                                              
export function parseBlock(line        )                    {
  const [,file,offsetText,lengthText]=line.split('\t');
  const offset=Number(offsetText),length=Number(lengthText);
  if(!/^cdx-\d{5}\.gz$/.test(file||'')||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(length)||length<1||length>2_000_000) return null;
  return {file,offset,length};
}

async function indexResource(url        , deadline       , range                           ) {
  const remaining=deadline-Date.now();if(remaining<=0)throw new Error('Index discovery timed out');
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),Math.min(8000,remaining));
  try {
    const response=await fetch(url,{redirect:'manual',signal:controller.signal,headers:{'User-Agent':USER_AGENT,...(range?{Range:`bytes=${range.start}-${range.end}`}:{})}});
    if(response.status!==(range?206:200)){await response.body?.cancel();throw new Error(`Index HTTP ${response.status}`);}
    const match=response.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
    const total=match?Number(match[3]):0;
    if(range&&(!match||Number(match[1])!==range.start||Number(match[2])>range.end||!Number.isSafeInteger(total))){await response.body?.cancel();throw new Error('Invalid index byte range');}
    if(!response.body)throw new Error('Empty index response');
    const bytes=await limitedBytes(response.body,range?range.end-range.start+1:200_000);
    return {bytes,total};
  } finally {clearTimeout(timer);}
}

async function locateBlocks(base       ,deadline       )                       {
  // Binary search the sparse index with byte ranges; never download the full index.
  const file=base+'cluster.idx';const decoder=new TextDecoder('latin1');
  const first=await indexResource(file,deadline,{start:0,end:4095});
  let low=0,high=first.total;
  for(let step=0;high-low>32768&&step<24;step++){
    const mid=Math.floor((low+high)/2);
    const part=await indexResource(file,deadline,{start:mid,end:Math.min(first.total-1,mid+8191)});
    const text=decoder.decode(part.bytes);const begin=text.indexOf('\n')+1;const end=text.indexOf('\n',begin);
    if(begin<1||end<begin)throw new Error('Incomplete sparse index row');
    const key=text.slice(begin,end).split('\t')[0];
    if(key<'ru,narod,')low=mid+end+1;else high=mid+begin;
  }
  const start=Math.max(0,low-16384);let end=Math.min(first.total-1,high+131072);
  let text=decoder.decode((await indexResource(file,deadline,{start,end})).bytes);
  while(text.slice(0,text.lastIndexOf('\n')).split('\n').at(-1) .split('\t')[0]<'ru,narod-'&&end<first.total-1){
    if(text.length>500_000)throw new Error('Narod index section too large');
    const next=Math.min(first.total-1,end+65536);text+=decoder.decode((await indexResource(file,deadline,{start:end+1,end:next})).bytes);end=next;
  }
  const rows=text.slice(start?text.indexOf('\n')+1:0,text.lastIndexOf('\n')).split('\n');
  const firstMatch=rows.findIndex(row=>row.startsWith('ru,narod,'));
  if(firstMatch<0)throw new Error('No Narod blocks found');
  const selected=rows.filter(row=>row.startsWith('ru,narod,'));
  // The preceding block can contain the first Narod records across its boundary.
  if(firstMatch>0)selected.unshift(rows[firstMatch-1]);
  const blocks=selected.map(parseBlock).filter((block)                    =>block!==null);
  if(!blocks.length)throw new Error('No valid index blocks');
  return blocks;
}

async function discoverFromIndex() {
  const deadline=Date.now()+22_000;
  if(!indexState||indexState.expires<Date.now()){
    const metadata=await indexResource('https://index.commoncrawl.org/collinfo.json',deadline);
    const records        =JSON.parse(new TextDecoder().decode(metadata.bytes));
    if(!Array.isArray(records))throw new Error('Invalid crawl metadata');
    const latest=records.find(record=>record&&typeof record.id==='string'&&/^CC-MAIN-\d{4}-\d{2}$/.test(record.id));
    if(!latest)throw new Error('No crawl index found');
    const base=`https://data.commoncrawl.org/cc-index/collections/${latest.id}/indexes/`;
    const blocks=await locateBlocks(base,deadline);
    indexState={base,blocks,expires:Date.now()+12*60*60_000,visited:new Set()};
  }
  // Mix several unrelated index regions on a cold start, avoiding one-letter clusters.
  const samples=candidates.size?1:3;let loaded=0;
  for(let attempt=0;attempt<samples+1;attempt++){
    if(indexState.visited.size>=indexState.blocks.length)indexState.visited.clear();
    const available=indexState.blocks.map((_,i)=>i).filter(i=>!indexState .visited.has(i));
    const chosen=available[randomIndex(available.length)];indexState.visited.add(chosen);
    const block=indexState.blocks[chosen];
    try {
      const compressed=await indexResource(indexState.base+block.file,deadline,{start:block.offset,end:block.offset+block.length-1});
      const stream=new Response(new Uint8Array(compressed.bytes).buffer).body .pipeThrough(new DecompressionStream('gzip'));
      const plain=new TextDecoder().decode(await limitedBytes(stream,8_000_000));
      const hosts=parseIndexHosts(plain);
      for(const [key,url] of hosts)candidates.set(key,url);
      if(hosts.size&&++loaded>=samples)break;
    }catch(error){if(attempt===samples||Date.now()+2000>=deadline)throw error;}
  }
  if(candidates.size>8000){const keep=shuffled([...candidates.entries()]).slice(0,8000);candidates.clear();for(const [key,url]of keep)candidates.set(key,url);}
  for(const [key,expires] of cooldowns)if(expires<Date.now())cooldowns.delete(key);
}

async function refreshCandidates() {
  if (discoveryInFlight) return discoveryInFlight;
  if (retryDiscoveryAt > Date.now()) return;
  discoveryInFlight = discoverFromIndex().catch((error         ) => {
    console.warn('Narod index discovery:', error instanceof Error ? error.message : 'Unknown error');
    retryDiscoveryAt = Math.max(retryDiscoveryAt, Date.now()+30_000);
  }).finally(() => { discoveryInFlight = null; });
  return discoveryInFlight;
}

export class IndexUnavailableError extends Error {
  constructor(){super('Индекс временно не ответил. Попробуй ещё раз через полминуты.');}
}

export async function findRandom(exclude          ) {
  const excluded = new Set(exclude.map(h=>h.replace(/^www\./,'')));
  await refreshCandidates();
  if (!candidates.size) {
    throw new IndexUnavailableError();
  }
  const options = shuffled([...candidates.entries()].filter(([key])=>!excluded.has(key)&&(cooldowns.get(key)||0)<Date.now()));
  for(let batch=0;batch<3;batch++) {
    const results = await Promise.all(options.slice(batch*3,batch*3+3).map(async ([key,url])=>{
      // Try HTTPS first, then legacy HTTP when needed. Total candidate budget is bounded.
      let page=await readPage(url,2800);
      if(!page && url.startsWith('https:')) page=await readPage(url.replace(/^https:/,'http:'),2200);
      if(!page){cooldowns.set(key,Date.now()+10*60_000);return null;}
      if(excluded.has(hostKey(page.url))) return null;
      return {url:page.url,title:page.title,checkedAt:new Date().toISOString()};
    }));
    const valid=results.filter(result=>result!==null);
    if(valid.length) return valid[randomIndex(valid.length)];
    if((batch+1)*3>=options.length) break;
  }
  return null;
}


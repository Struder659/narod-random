import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';
import {findRandom,hostKey} from '../server/lib/explorer.ts';
import {createPreviewRenderer} from '../server/scripts/preview.mjs';
import {retainedSites,mergeCatalog} from './catalog-history.mjs';

const target=Number(process.env.BUILD_TARGET || 100);
const minimum=Number(process.env.BUILD_MINIMUM || 12);
const budget=Number(process.env.BUILD_BUDGET_MS || 600000);
if(!Number.isInteger(target)||target<1||target>200||!Number.isInteger(minimum)||minimum<1||minimum>target||budget<10000||budget>900000)throw Error('Invalid build limits');
const renderer=createPreviewRenderer({launch:()=>chromium.launch({channel:'chrome',headless:true,chromiumSandbox:true})});
const sites=[];
const exclude=[];
await mkdir('site/data',{recursive:true});
await mkdir('site/previews',{recursive:true});
const previous=[];
if(process.env.PREVIOUS_SITE_URL) {
  const base=new URL(process.env.PREVIOUS_SITE_URL);
  // Failure to load an existing collection must not replace it with a tiny fresh batch.
  const response=await fetch(new URL('data/sites.json',base),{signal:AbortSignal.timeout(20000),cache:'no-store'});
  if(!response.ok)throw new Error(`Previous catalog unavailable: ${response.status}`);
  const retained=retainedSites(await response.json());
  exclude.push(...retained.map(site=>hostKey(site.url)));
  let cursor=0;
  await Promise.all(Array.from({length:4},async()=>{
    while(cursor<retained.length) {
      const site=retained[cursor++];
      try {
        const response=await fetch(new URL(site.preview,base),{signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw new Error(`HTTP ${response.status}`);
        const bytes=Buffer.from(await response.arrayBuffer());
        if(bytes.length>200000 || bytes[0]!==0xff || bytes[1]!==0xd8)throw new Error('Invalid JPEG');
        await writeFile('site/'+site.preview,bytes);
        previous.push(site);
      } catch(error) { console.warn(`Old preview skipped: ${site.url}: ${error.message}`); }
    }
  }));
  previous.sort((a,b)=>Date.parse(b.checkedAt)-Date.parse(a.checkedAt));
  console.log(`Retained ${previous.length} sites; excluding ${exclude.length} previous hosts from discovery.`);
}
const deadline=Date.now()+budget;
let attempts=0;
try {
  while(sites.length<target && Date.now()<deadline && attempts++<target*4){
    try {
      const site=await findRandom(exclude);
      if(!site)continue;
      const key=hostKey(site.url);
      if(exclude.includes(key))continue;
      exclude.push(key);
      const bytes=await renderer.capture(site.url,AbortSignal.timeout(10000));
      const id=createHash('sha256').update(site.url).digest('hex').slice(0,16);
      const preview=`previews/${id}.jpg`;
      await writeFile('site/'+preview,bytes);
      sites.push({...site,preview});
      console.log(`${sites.length}/${target} ${site.url} (${bytes.length} bytes)`);
    } catch(error) {
      console.warn('Skipped:',error.message.split('\n')[0]);
      if(sites.length===0 && attempts>=5)throw new Error('No sites captured; keep previous deployment.');
    }
  }
} finally {await renderer.close();}
if(sites.length<minimum)throw new Error(`Only ${sites.length} verified previews; need ${minimum}. Previous deployment is preserved.`);
const data={version:1,generatedAt:new Date().toISOString(),sites:mergeCatalog(sites,previous)};
await writeFile('site/data/sites.json',JSON.stringify(data));
await writeFile('site/.nojekyll','');
console.log(`Ready: ${data.sites.length} sites with local previews, including ${sites.length} new hosts.`);

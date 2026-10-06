import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';
import {findRandom,hostKey} from '../server/lib/explorer.ts';
import {createPreviewRenderer} from '../server/scripts/preview.mjs';

const target=Number(process.env.BUILD_TARGET || 60);
const minimum=Number(process.env.BUILD_MINIMUM || 12);
const budget=Number(process.env.BUILD_BUDGET_MS || 420000);
if(!Number.isInteger(target)||target<1||target>200||!Number.isInteger(minimum)||minimum<1||minimum>target||budget<10000||budget>900000)throw Error('Invalid build limits');
const renderer=createPreviewRenderer({launch:()=>chromium.launch({channel:'chrome',headless:true,chromiumSandbox:true})});
const sites=[];
const exclude=[];
const deadline=Date.now()+budget;
await mkdir('site/data',{recursive:true});
await mkdir('site/previews',{recursive:true});
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
const data={version:1,generatedAt:new Date().toISOString(),sites};
await writeFile('site/data/sites.json',JSON.stringify(data));
await writeFile('site/.nojekyll','');
console.log(`Ready: ${sites.length} checked sites with local previews.`);

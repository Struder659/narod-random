import {mkdir,copyFile,cp,writeFile} from 'node:fs/promises';
import {API_BASE} from '../site/config.js';
const api=new URL(process.env.API_BASE || API_BASE);
if(api.protocol!=='https:' || !api.hostname.endsWith('.vercel.app') || api.username || api.password || api.pathname!=='/')throw Error('Set API_BASE to the deployed Vercel origin.');
await mkdir('dist-pages',{recursive:true});
for(const file of ['index.html','app.js','history.js','style.css','favicon.svg'])await copyFile('site/'+file,'dist-pages/'+file);
await cp('site/narod','dist-pages/narod',{recursive:true});
await writeFile('dist-pages/config.js',`export const API_BASE=${JSON.stringify(api.origin)};\n`);
await writeFile('dist-pages/.nojekyll','');

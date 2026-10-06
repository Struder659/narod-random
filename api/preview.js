import {chromium} from 'playwright-core';
import serverChromium from '@sparticuz/chromium';
import {createPreviewRenderer} from '../server/scripts/preview.mjs';
import {allowedURL} from '../server/lib/explorer.mjs';
import {cors,readJSON} from '../server/lib/http.mjs';
const renderer=createPreviewRenderer({launch:async()=>process.env.VERCEL
  ? chromium.launch({args:serverChromium.args,executablePath:await serverChromium.executablePath(),headless:true})
  : chromium.launch({channel:'chrome',headless:true,chromiumSandbox:true})});
export default {async fetch(request) {
  const {headers,response}=cors(request);if(response)return response;
  let url;
  try {const body=await readJSON(request,2000);url=typeof body?.url==='string' && allowedURL(body.url);if(!url)throw Error();}
  catch {return Response.json({error:'Некорректный адрес сайта.'},{status:400,headers});}
  try {
    const bytes=await renderer.capture(url.href,AbortSignal.any([request.signal,AbortSignal.timeout(25000)]));
    return new Response(bytes,{headers:{...headers,'Content-Type':'image/jpeg'}});
  } catch(error) {
    console.warn('Preview:',error.message.split('\n')[0]);
    return Response.json({error:'Превью не загрузилось. Сайт можно открыть по ссылке.'},{status:503,headers});
  }
}};

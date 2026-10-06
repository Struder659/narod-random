import {createServer} from 'node:http';
import random from '../api/random.js';
import preview from '../api/preview.js';
import health from '../api/health.js';
const handlers={'/api/random':random,'/api/preview':preview,'/api/health':health};
createServer(async(req,res)=>{
  try {
    const handler=handlers[new URL(req.url,'http://127.0.0.1').pathname];
    if(!handler){res.writeHead(404).end();return;}
    const controller=new AbortController();
    res.on('close',()=>{if(!res.writableEnded)controller.abort();});
    const init={method:req.method,headers:req.headers,signal:controller.signal};
    if(!['GET','HEAD'].includes(req.method)){init.body=req;init.duplex='half';}
    const response=await handler.fetch(new Request('http://127.0.0.1:5176'+req.url,init));
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){console.error(error);if(!res.headersSent)res.writeHead(500);res.end();}
}).listen(5176,'127.0.0.1',()=>console.log('Live API: http://127.0.0.1:5176'));

const pagesOrigin='https://struder659.github.io';
export function cors(request) {
  const origin=request.headers.get('origin');
  const headers={'Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
  const local=!process.env.VERCEL && /^http:\/\/(?:127\.0\.0\.1|localhost):5175$/.test(origin||'');
  if(origin && origin!==pagesOrigin && !local) return {response:Response.json({error:'Недопустимый источник запроса.'},{status:403,headers})};
  if(origin) headers['Access-Control-Allow-Origin']=origin;
  headers['Access-Control-Allow-Methods']='POST, OPTIONS';
  headers['Access-Control-Allow-Headers']='Content-Type';
  headers['Access-Control-Max-Age']='600';
  if(request.method==='OPTIONS')return {response:new Response(null,{status:204,headers})};
  if(request.method!=='POST')return {response:Response.json({error:'Используй POST.'},{status:405,headers:{...headers,Allow:'POST, OPTIONS'}})};
  return {headers};
}
export async function readJSON(request,limit=800000) {
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw Error('Ожидается JSON.');
  if(Number(request.headers.get('content-length')||0)>limit)throw Error('Слишком большой запрос.');
  const reader=request.body?.getReader();
  if(!reader)throw Error('Пустой запрос.');
  let total=0;const chunks=[];
  try {
    while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>limit){await reader.cancel();throw Error('Слишком большой запрос.');}chunks.push(value);}
  } finally {reader.releaseLock();}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function validExclusions(value) {
  return Array.isArray(value) && value.length<=10000 && value.every(host=>typeof host==='string' && /^(?:www\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.narod\.ru$/.test(host));
}

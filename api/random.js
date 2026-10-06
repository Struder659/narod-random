import {findRandom,IndexUnavailableError} from '../server/lib/explorer.mjs';
import {cors,readJSON,validExclusions} from '../server/lib/http.mjs';
export default {async fetch(request) {
  const {headers,response}=cors(request);if(response)return response;
  let body;
  try {body=await readJSON(request);if(!validExclusions(body?.exclude))throw Error();}
  catch {return Response.json({error:'Некорректный список просмотренных сайтов.'},{status:400,headers});}
  try {
    const site=await findRandom(body.exclude);
    return site ? Response.json(site,{headers}) : Response.json({error:'Пока не нашёл живой непросмотренный сайт. Нажми ещё раз — продолжу поиск.'},{status:503,headers});
  } catch(error) {
    console.warn('Discovery:',error.message);
    return Response.json({error:error instanceof IndexUnavailableError?error.message:'Поиск временно недоступен. Попробуй ещё раз.'},{status:503,headers});
  }
}};

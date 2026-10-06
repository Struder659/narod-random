import {createHistory} from './history.js';
import {API_BASE} from './config.js';
const local=['127.0.0.1','localhost'].includes(location.hostname);
const api=local?'http://127.0.0.1:5176':API_BASE;
const button=document.querySelector('#discover'),status=document.querySelector('#status');
const result=document.querySelector('#result'),image=document.querySelector('#thumbnail');
const imageLink=document.querySelector('#preview-link'),previewStatus=document.querySelector('#preview-status');
const siteLink=document.querySelector('#site-url'),siteTitle=document.querySelector('#site-title'),checked=document.querySelector('#checked');
const history=createHistory(()=>window.localStorage);
let previewController,objectURL,selection=0;
function message(text){status.textContent=text;status.hidden=!text;}
async function post(path,body,signal) {
  if(!api)throw Error('Сервер поиска ещё не подключён.');
  const response=await fetch(api+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal,cache:'no-store'});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.error||'Сервер временно недоступен. Попробуй ещё раз.');}
  return response;
}
async function showPreview(site,id) {
  previewController=new AbortController();
  try {
    const response=await post('/api/preview',{url:site.url},AbortSignal.any([previewController.signal,AbortSignal.timeout(35000)]));
    const blob=await response.blob();
    if(id!==selection)return;
    if(!blob.type.startsWith('image/jpeg'))throw Error();
    if(objectURL)URL.revokeObjectURL(objectURL);
    objectURL=URL.createObjectURL(blob);
    image.onload=()=>{if(id===selection){previewStatus.hidden=true;imageLink.hidden=false;}};
    image.onerror=()=>{if(id===selection)previewStatus.textContent='Превью не загрузилось. Сайт можно открыть по ссылке.';};
    image.src=objectURL;
  } catch {
    if(id===selection)previewStatus.textContent='Превью не загрузилось. Сайт можно открыть по ссылке.';
  }
}
button.addEventListener('click',async()=>{
  button.disabled=true;
  const id=++selection;
  previewController?.abort();
  if(!result.hidden && !previewStatus.hidden)previewStatus.textContent='';
  message('Ищу живой сайт…');
  try {
    const response=await post('/api/random',{exclude:history.exclusions()},AbortSignal.timeout(55000));
    const site=await response.json();
    const url=new URL(site.url);
    if(!/^https?:$/.test(url.protocol)||!/^(?:www\.)?[a-z0-9-]+\.narod\.ru$/.test(url.hostname)||url.username||url.password||url.port)throw Error('Сервер вернул некорректный адрес.');
    history.remember(site);
    siteLink.href=site.url;siteLink.textContent=site.url;
    imageLink.href=site.url;imageLink.setAttribute('aria-label','Открыть '+site.url);
    image.alt='Превью '+url.hostname;
    imageLink.hidden=true;previewStatus.hidden=false;previewStatus.textContent='Создаю превью…';
    siteTitle.textContent=typeof site.title==='string'?site.title:'';siteTitle.hidden=!siteTitle.textContent;
    checked.dateTime=site.checkedAt;
    checked.textContent='Проверен: '+new Date(site.checkedAt).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
    result.hidden=false;message('');button.textContent='Найти ещё один сайт';
    void showPreview(site,id);
  } catch(error) {message(error.name==='TimeoutError'?'Поиск занял слишком много времени. Нажми ещё раз.':error.message||'Не удалось найти сайт. Попробуй ещё раз.');}
  finally {button.disabled=false;}
});

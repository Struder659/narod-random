import {shuffle,validateCatalog,createHistory} from './catalog.js';
const button=document.querySelector('#discover');
const status=document.querySelector('#status');
const result=document.querySelector('#result');
const image=document.querySelector('#thumbnail');
const imageLink=document.querySelector('#preview-link');
const previewStatus=document.querySelector('#preview-status');
const siteLink=document.querySelector('#site-url');
const siteTitle=document.querySelector('#site-title');
const checked=document.querySelector('#checked');
let catalogJob=null,sites=[],deck=[],loadedAt=0;
const history=createHistory(()=>window.localStorage);
function message(text){status.textContent=text;status.hidden=!text;}
function loadCatalog(){
  return catalogJob ??= fetch('./data/sites.json',{cache:'no-cache',signal:AbortSignal.timeout(15000)})
    .then(response=>{if(!response.ok)throw new Error('Unavailable');return response.json();})
    .then(data=>{sites=validateCatalog(data);loadedAt=Date.now();deck=shuffle(history.unseen(sites));preload();})
    .finally(()=>{catalogJob=null;});
}
function preload(){const next=deck.at(-1);if(next){const img=new Image();img.src='./'+next.preview;}}
button.addEventListener('click',async()=>{
  button.disabled=true;
  try {
    if(!sites.length){message('Загружаю сайты…');await loadCatalog();}
    deck=history.unseen(deck);
    if(!deck.length || Date.now()-loadedAt>5*60*1000) {
      message('Проверяю новые сайты…');await loadCatalog();
    }
    if(!deck.length) {
      message('Все сайты из текущей подборки уже просмотрены. Новые появятся после обновления.');
      button.textContent='Проверить новые сайты';return;
    }
    const site=deck.pop();history.remember(site);
    siteLink.href=site.url;siteLink.textContent=site.url;
    imageLink.href=site.url;imageLink.setAttribute('aria-label','Открыть '+site.url);
    image.alt='Превью '+new URL(site.url).hostname;
    previewStatus.hidden=true;imageLink.hidden=false;
    image.onerror=()=>{imageLink.hidden=true;previewStatus.textContent='Превью не загрузилось. Сайт можно открыть по ссылке.';previewStatus.hidden=false;};
    image.src='./'+site.preview;
    siteTitle.textContent=typeof site.title==='string'?site.title:'';siteTitle.hidden=!siteTitle.textContent;
    checked.dateTime=site.checkedAt;
    checked.textContent='Проверен: '+new Date(site.checkedAt).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
    result.hidden=false;message('');button.textContent='Найти ещё один сайт';preload();
  } catch {message('Не удалось загрузить сайты. Нажми ещё раз.');}
  finally {button.disabled=false;}
});
void loadCatalog().catch(()=>{});

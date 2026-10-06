import {validateCatalog,siteKey} from '../site/catalog.js';

export function retainedSites(data, now=Date.now()) {
  return validateCatalog(data).filter(site=> {
    const age=now-Date.parse(site.checkedAt);
    return age>=0 && age<7*24*60*60*1000;
  }).sort((a,b)=>Date.parse(b.checkedAt)-Date.parse(a.checkedAt));
}

export function mergeCatalog(fresh,previous,limit=1000) {
  const seen=new Set();
  return [...fresh,...previous].filter(site=>{
    const key=siteKey(site.url);
    if(seen.has(key))return false;
    seen.add(key);return true;
  }).slice(0,limit);
}

export function siteKey(url) { return new URL(url).hostname.replace(/^www\./,''); }
export function createHistory(storage) {
  const storageKey='narod-viewed-v1',seen=new Set();
  function sync() {
    try {
      const saved=JSON.parse(storage()?.getItem(storageKey)||'[]');
      if(Array.isArray(saved))for(const key of saved)if(typeof key==='string' && /^[a-z0-9-]+\.narod\.ru$/.test(key))seen.add(key);
    } catch {}
  }
  return {
    exclusions() {sync();return [...seen].slice(-10000);},
    remember(site) {sync();seen.add(siteKey(site.url));try{storage()?.setItem(storageKey,JSON.stringify([...seen].slice(-10000)));}catch{}}
  };
}

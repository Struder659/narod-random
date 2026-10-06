export function randomIndex(length, random = crypto) {
  if (!Number.isSafeInteger(length) || length < 1 || length > 0x100000000) throw new Error('Invalid range');
  const limit = Math.floor(0x100000000 / length) * length;
  const bytes = new Uint32Array(1);
  do { random.getRandomValues(bytes); } while (bytes[0] >= limit);
  return bytes[0] % length;
}
export function shuffle(values, lastURL) {
  const result = [...values];
  for(let i=result.length-1;i>0;i--){const j=randomIndex(i+1);[result[i],result[j]]=[result[j],result[i]];}
  if(result.length>1 && result.at(-1).url === lastURL) [result[0],result[result.length-1]]=[result[result.length-1],result[0]];
  return result;
}
export function validateCatalog(data) {
  if (!Array.isArray(data?.sites)) throw new Error('Invalid catalog');
  const seen = new Set();
  const sites = data.sites.filter(site => {
    try {
      const url = new URL(site.url);
      const key = url.hostname.replace(/^www\./,'');
      if (!/^https?:$/.test(url.protocol) || url.port || url.username || url.password || !/^(?:www\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.narod\.ru$/.test(url.hostname) || key==='www.narod.ru' || !/^previews\/[a-f0-9]{16}\.jpg$/.test(site.preview) || !Number.isFinite(Date.parse(site.checkedAt)) || seen.has(key)) return false;
      seen.add(key); return true;
    } catch {return false;}
  }).slice(0,500);
  if (!sites.length) throw new Error('Empty catalog');
  return sites;
}

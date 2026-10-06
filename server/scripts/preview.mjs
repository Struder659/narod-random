import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { lookup } from 'node:dns/promises';
import { allowedURL } from '../lib/explorer.ts';

// A separate temporary profile; never connects to the user's browser.
export function createPreviewRenderer({launch = () => chromium.launch({channel:'chrome', headless:true})} = {}) {
  let browserJob;
  let active = 0;
  const waiters = [];
  const cache = new Map();
  function browser() {
    return browserJob ??= launch().then(instance => {
      instance.on('disconnected', () => { browserJob = undefined; });
      return instance;
    }).catch(error => { browserJob = undefined; throw error; });
  }
  async function acquire(signal) {
    signal.throwIfAborted();
    if (active < 2) { active++; return; }
    await new Promise((resolve,reject) => {
      const waiter = () => { signal.removeEventListener('abort',abort); resolve(); };
      const abort = () => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index,1);
        reject(signal.reason);
      };
      waiters.push(waiter);
      signal.addEventListener('abort',abort,{once:true});
    });
  }
  function release() {
    const next = waiters.shift();
    if (next) next(); else active--;
  }
  return {
    warm: browser,
    async close() { const instance = await browserJob?.catch(()=>null); await instance?.close(); },
    async capture(input, signal = new AbortController().signal) {
      const url = allowedURL(input);
      if (!url) throw new Error('Invalid preview URL');
      const cached = cache.get(url.href);
      if (cached && cached.expires > Date.now()) return cached.bytes;
      await acquire(signal);
      let context;
      const cancel = () => { void context?.close().catch(()=>{}); };
      signal.addEventListener('abort',cancel,{once:true});
      try {
        signal.throwIfAborted();
        const instance = await browser();
        signal.throwIfAborted();
        context = await instance.newContext({
          viewport:{width:960,height:720}, deviceScaleFactor:1,
          javaScriptEnabled:false, serviceWorkers:'block', acceptDownloads:false,
        });
        signal.throwIfAborted();
        const hosts = new Map();
        await context.route('**/*',async route => {
          const request = route.request();
          if (!['document','stylesheet','image'].includes(request.resourceType()) || !allowedAsset(request.url())) return route.abort();
          try {
            let target = request.url();
            for (let hop=0; hop<4; hop++) {
              if (!allowedAsset(target)) return await route.abort();
              const host = new URL(target).hostname;
              let safe = hosts.get(host);
              if (!safe) {
                safe = lookup(host,{all:true}).then(addresses => addresses.length > 0 && addresses.every(({address}) => publicAddress(address))).catch(()=>false);
                hosts.set(host,safe);
              }
              if (!await safe) return await route.abort();
              // Validate every redirect; route.continue can otherwise follow it off-domain.
              const response = await route.fetch({url:target,maxRedirects:0,timeout:3500});
              if (response.status()>=300 && response.status()<400) {
                const location = response.headers().location;
                await response.dispose();
                if (!location) return await route.abort();
                target = new URL(location,target).href;
                continue;
              }
              if (Number(response.headers()['content-length'] || 0)>3_000_000) { await response.dispose(); return await route.abort(); }
              const body = await response.body();
              if (body.length>3_000_000) { await response.dispose(); return await route.abort(); }
              await route.fulfill({response,body});
              await response.dispose();
              return;
            }
            await route.abort();
          } catch { await route.abort().catch(()=>{}); }
        });
        const page = await context.newPage();
        const response = await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:5000});
        if (!response?.ok() || !allowedURL(page.url())) throw new Error('Site unavailable');
        // Broken counters and slow images must not hold up a useful first view.
        await page.waitForLoadState('load',{timeout:1000}).catch(()=>{});
        signal.throwIfAborted();
        const screenshot = await page.screenshot({type:'jpeg',quality:45,timeout:1800});
        const bytes = await sharp(screenshot).resize(320,240).jpeg({quality:45}).toBuffer();
        signal.throwIfAborted();
        cache.set(url.href,{bytes,expires:Date.now()+600_000});
        if (cache.size > 20) cache.delete(cache.keys().next().value);
        return bytes;
      } finally {
        signal.removeEventListener('abort',cancel);
        await context?.close().catch(()=>{});
        release();
      }
    },
  };
}

export function allowedAsset(input) {
  try {
    const url = new URL(input);
    return /^https?:$/.test(url.protocol) && !url.port && !url.username && !url.password &&
      /^(?:www\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.narod\.ru$/i.test(url.hostname);
  } catch { return false; }
}
export function publicAddress(address) {
  if (address.includes(':')) return /^2[0-9a-f]{3}:/i.test(address) && !/^2001:(?:0:|db8:)/i.test(address);
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n<0 || n>255)) return false;
  const [a,b] = parts;
  return !(a===0 || a===10 || a===127 || a>=224 || (a===169&&b===254) ||
    (a===172&&b>=16&&b<=31) || (a===192&&(b===168||b===0)) ||
    (a===100&&b>=64&&b<=127) || (a===198&&(b===18||b===19)));
}

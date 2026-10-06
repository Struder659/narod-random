import {test} from 'node:test';
import assert from 'node:assert/strict';
import {retainedSites,mergeCatalog} from '../scripts/catalog-history.mjs';
const now=Date.parse('2026-10-07T00:00:00Z');
const site=(name,age=0)=>({url:`https://${name}.narod.ru/`,checkedAt:new Date(now-age*86400000).toISOString(),preview:'previews/0123456789abcdef.jpg'});
test('retained catalog keeps original check times and removes stale/future entries',()=>{
 assert.deepEqual(retainedSites({sites:[site('old',8),site('yesterday',1),site('fresh'),site('future',-1)]},now),[site('fresh'),site('yesterday',1)]);
});
test('successive builds accumulate new hosts, deduplicate and evict oldest at limit',()=>{
 const previous=[site('a',1),site('b',2),site('c',3)];
 assert.deepEqual(mergeCatalog([site('d')],previous),[site('d'),...previous]);
 assert.deepEqual(mergeCatalog([{...site('b'),url:'http://www.b.narod.ru/'}],previous,3).map(s=>new URL(s.url).hostname),['www.b.narod.ru','a.narod.ru','c.narod.ru']);
 assert.deepEqual(mergeCatalog([site('d')],previous,2),[site('d'),site('a',1)]);
});

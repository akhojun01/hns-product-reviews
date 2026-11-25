export function collapseProducts(batches) {
  const combined = new Map();
  for (const batch of batches) {
    for (const {count,...product} of batch.products) {
      const days = combined.get(product.id)?.days ?? {};
      days[batch.day] = count;
      combined.set(product.id,{...product,days});
    }
  }
  return [...combined.values()];
}

export function getStats(products,{from,to,shop='',category='',search=''}) {
  const phrase = search.trim().toLocaleLowerCase('ko');
  const groups = new Map();
  const channels = new Map();
  const daily = new Map();
  const ranking = [];
  let checked = 0;
  let total = 0;
  for (const product of products) {
    if (shop && shop !== product.shop || category && category !== product.category) continue;
    if (phrase && ![product.name,product.id].some(value=>value.toLocaleLowerCase('ko').includes(phrase))) continue;
    checked++;
    let count = 0;
    for (const [date,n] of Object.entries(product.days)) {
      if (date < from || date > to) continue;
      count += n;
      daily.set(date,(daily.get(date) ?? 0) + n);
    }
    if (!count) continue;
    total += count;
    groups.set(product.category,(groups.get(product.category) ?? 0) + count);
    channels.set(product.shop,(channels.get(product.shop) ?? 0) + count);
    ranking.push({...product,count});
  }
  const sorted = items=>[...items].sort(([nameA,countA],[nameB,countB])=>countB-countA || nameA.localeCompare(nameB,'ko'));
  ranking.sort((a,b)=>b.count-a.count || a.name.localeCompare(b.name,'ko') || a.id.localeCompare(b.id));
  return {total, checked, reviewed:ranking.length, categories:sorted(groups), byShop:channels, daily:[...daily].sort(), ranking:ranking.slice(0,100)};
}

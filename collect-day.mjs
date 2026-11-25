import { readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { collect } from './collect.mjs';
import { shops } from './shops.mjs';
import { isDate, previousDay, koreanToday } from './dates.mjs';

const day = process.argv[2] || previousDay();
if (!isDate(day) || day >= koreanToday()) throw new Error('완료된 날짜를 YYYY-MM-DD 형식으로 입력하세요.');

const path = new URL('./data.json', import.meta.url);
const data = JSON.parse(await readFile(path, 'utf8'));
const ordered = [...data.batches].sort((a, b) => a.day.localeCompare(b.day));
const old = ordered.find(batch => batch.day === day);
const preceding = ordered.findLast(batch => batch.day < day);
const store = {salt: randomUUID(), products: {}, status: {...preceding?.status}, targets: {}};
let error = '';
try {
  await collect(store, async () => {}, () => {}, day);
} catch (failure) {
  error = failure.message;
  console.error('수집 오류:', error);
}

const collectedAt = new Date().toISOString();
const status = {};
const products = [];
for (const shop of shops) {
  const result = store.status[shop.id];
  const current = result?.at && result !== preceding?.status?.[shop.id] ? result : null;
  const confirmed = Object.values(store.products).filter(product => product.shop === shop.id);
  const previous = (old?.products ?? []).filter(product => product.shop === shop.id);
  const merged = new Map(previous.map(product => [product.id, product]));
  for (const product of confirmed) {
    const count = Object.values(product.reviews).filter(value => value === day).length;
    merged.set(product.id, {
      id: product.id, shop: product.shop, url: product.url, name: product.name,
      category: product.category, count: Math.max(count, merged.get(product.id)?.count ?? 0),
    });
  }
  products.push(...merged.values());
  status[shop.id] = {
    attempted: current?.checked ?? 0,
    confirmed: merged.size,
    unavailable: (current?.failures ?? 0) + (current?.unreadable ?? 0),
    offset: current?.offset ?? old?.status?.[shop.id]?.offset ?? preceding?.status?.[shop.id]?.offset ?? 0,
    at: collectedAt,
  };
  console.log(shop.name + ': ' + merged.size + '개 확인 / ' + (current?.checked ?? 0) + '개 시도');
}
const batches = ordered.filter(batch => batch.day !== day).concat({day, collectedAt, error, status, products});
batches.sort((a, b) => a.day.localeCompare(b.day));
const temporary = new URL('./data.json.tmp', import.meta.url);
await writeFile(temporary, JSON.stringify({batches}) + '\n', 'utf8');
await rename(temporary, path);
console.log(day + ' 등록 상품평 ' + products.reduce((total, product) => total + product.count, 0) + '건 저장');

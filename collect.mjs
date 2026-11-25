import { createHash } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { shops, productLink } from './shops.mjs';
import { openEdge } from './edge.mjs';

const dateFormat = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'});
const maxProducts = 30;
const maxReviewPages = 20;

function findPublicLinks() {
  return [...document.querySelectorAll('a[href]')].map(anchor => anchor.href).slice(0,4000);
}

export function readProduct() {
  const out = {url:location.href, title:'', category:'', reviews:[], empty:false};
  const structured = [];
  function visit(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 7) return;
    if (Array.isArray(value)) { value.forEach(item=>visit(item,depth + 1)); return; }
    structured.push(value);
    for (const field of ['@graph','mainEntity','item']) visit(value[field],depth + 1);
  }
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { visit(JSON.parse(script.textContent)); } catch {}
  }
  const product = structured.find(value => [value['@type']].flat().includes('Product'));
  const breadcrumbs = structured.find(value => [value['@type']].flat().includes('BreadcrumbList'))?.itemListElement;
  out.title = String(product?.name || document.querySelector('meta[property="og:title"]')?.content ||
    [...document.querySelectorAll('h1')].at(-1)?.innerText || '');
  const category = product?.category || document.querySelector('meta[property="product:category"]')?.content ||
    breadcrumbs?.slice(1,-1).map(item=>item.name || item.item?.name).filter(Boolean).at(0);
  if (typeof category === 'string') out.category = category.split(/\s*>\s*/)[0].trim();

  const fullDate = /\b(20\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})(?:일)?\b/;
  const dateOnly = /^\s*(?:(?:등록일|작성일|작성일자)\s*:?\s*)?(20\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})(?:일)?\s*\.?(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\s*$/;
  const iso = match => [match[1],match[2].padStart(2,'0'),match[3].padStart(2,'0')].join('-');
  const types = value=>[value?.['@type']].flat();
  const productReviews = [product?.review].flat();
  const otherReviews = structured.filter(v=>types(v).includes('Review') &&
    (v.itemReviewed === product || Boolean(product?.['@id']) && v.itemReviewed?.['@id'] === product['@id']));
  for (const item of [...productReviews,...otherReviews]) {
    const date = String(item?.datePublished ?? '').match(fullDate);
    if (!date || !item?.reviewBody) continue;
    out.reviews.push({date:iso(date),body:String(item.reviewBody),author:String(item.author?.name ?? ''),source:'schema'});
  }

  const isVisible = element => Boolean(element?.getClientRects().length) && getComputedStyle(element).visibility !== 'hidden';
  const inSheet = element => element.closest('[class*="qna" i],[id*="qna" i],[class*="photoLayer" i],[role="dialog"]');
  const markers = [...document.querySelectorAll('[id*="review" i],[class*="review" i],[id*="reveiw" i],[class*="reveiw" i],[id*="assmt" i],[class*="assmt" i],[id*="eval" i]')];
  const scopes = markers.filter(node => isVisible(node) && !inSheet(node) && fullDate.test(node.innerText || ''));
  const seen = new Set();
  const bodySelector = '[class*="review-txt" i],[class*="review_text" i],[class*="review-content" i],[class*="review_cont" i],[class*="comment" i],[itemprop="reviewBody"],[class*="cont" i],p';
  for (const scope of scopes) {
    const walker = document.createTreeWalker(scope,NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (seen.has(node) || !isVisible(node.parentElement) || inSheet(node.parentElement)) continue;
      seen.add(node);
      const date = node.nodeValue.match(dateOnly);
      if (!date) continue;
      let parent = node.parentElement;
      while (parent && parent !== document.body) {
        const value = (parent.innerText ?? '').trim();
        if (value.length > 8000 || (value.match(new RegExp(fullDate.source,'g')) ?? []).length > 1) break;
        const rowName = (parent.className?.toString() || '') + ' ' + parent.id;
        const evidence = /신고하기|도움이\s*돼요|리뷰\s*신고|작성일|별점|평점|신고|구매정보|구매옵션/.test(value);
        const author = value.match(/[가-힣a-zA-Z0-9_.@-]+\*{2,}/)?.[0] || '';
        const reviewItem = /(?:review|reveiw|assmt)[_\s-]*(?:item|row|box|card)/i.test(rowName) ||
          parent.hasAttribute('data-review-id');
        if (value.length > 16 && (evidence || reviewItem) && (author || reviewItem || /신고|도움이/.test(value))) {
          const comments = [...parent.querySelectorAll(bodySelector)].filter(element=>isVisible(element));
          const body = comments.map(element=>(element.innerText || '').trim()).filter(text=>
            text.length >= 2 && !fullDate.test(text) && !/^(도움이|신고|답글|리뷰 더보기|평점|구매정보|작성일)/.test(text)
          ).sort((a,b)=>b.length-a.length)[0] || value.split('\n').map(line=>line.trim()).filter(line=>
            line && !fullDate.test(line) && !/^(도움이|신고|답글|리뷰 더보기|평점|별점|구매정보|작성일|작성자)/.test(line) &&
            !(author && line.includes(author)) && /[가-힣A-Za-z]/.test(line)
          ).join(' ');
          if (body) {
            out.reviews.push({date:iso(date),body,author,source:'visible'});
            break;
          }
        }
        parent = parent.parentElement;
      }
    }
  }
  if (out.reviews.some(review=>review.source==='visible')) out.reviews = out.reviews.filter(review=>review.source==='visible');
  out.empty = markers.some(element => isVisible(element) &&
    /^(등록된\s*(상품평|리뷰|구매후기)가?\s*없습니다[.!]?|상품평\s*[\[(]?0[\])]?\s*(건|개)?)$/.test((element.innerText || '').trim()));
  return out;
}

function clickReviewControl(mode) {
  const labels = {
    tab:/^(?:상품\s*평|구매\s*(?:후기|리뷰)|상품\s*리뷰|리뷰|구매\s*평)(?:\s*[\[(]?\s*[\d,]+\+?\s*(건|개)?\s*[\])]?)*$/,
    latest:/^(최신순|최근등록순|최근순|등록일순|작성일순|최신\s*등록순)$/,
    sort:/^(베스트순|추천순|랭킹순|선호도순|인기순|도움순|정렬)$/,
    more:/^(?:(?:전체|상품평|리뷰)\s*)?(?:더\s*보기|더\s*불러오기|다음(?:\s*페이지)?)(?:\s*[+＋>›])?$/,
  };
  const nodes = [...document.querySelectorAll('a,button,[role="button"],[role="tab"],[role="option"],label,select,li,span')];
  for (const element of nodes) {
    if (!element.getClientRects().length || getComputedStyle(element).visibility === 'hidden') continue;
    if (element.closest('[role="dialog"],[class*="qna" i],[id*="qna" i]')) continue;
    if (element.matches('select') && mode === 'latest') {
      const option = [...element.options].find(candidate=>labels.latest.test(candidate.textContent.trim()));
      if (!option) continue;
      if (option.selected) return true;
      element.value = option.value;
      element.dispatchEvent(new Event('change',{bubbles:true}));
      return true;
    }
    const label = (element.innerText || '').replace(/[\uE000-\uF8FF]/g,'').trim();
    const ariaLabel = element.getAttribute('aria-label') || '';
    if (!labels[mode].test(label) && !labels[mode].test(ariaLabel)) continue;
    const container = element.closest('[id*="review" i],[class*="review" i],[id*="reveiw" i],[class*="reveiw" i],[class*="assmt" i]');
    if (mode === 'more' && !container) continue;
    const control = element.closest('a,button,[role="button"],[role="tab"],[role="option"],label') || element;
    if (control.matches('[disabled],[aria-disabled="true"]')) continue;
    const href = control.getAttribute('href');
    if (href?.startsWith('https:') && new URL(href).origin !== location.origin) continue;
    control.click();
    return true;
  }
  return false;
}

function reviewEntries(snap, salt) {
  const today = dateFormat.format(new Date());
  const entries = {};
  for (const review of snap.reviews) {
    if (review.date > today || !Number.isFinite(Date.parse(review.date)) ||
      new Date(review.date).toISOString().slice(0,10) !== review.date) continue;
    const body = review.body.normalize('NFC').replace(/\s+/g,' ').trim();
    if (!body) continue;
    const key = createHash('sha256').update(JSON.stringify([salt,review.date,review.author,body])).digest('hex');
    entries[key] = review.date;
  }
  return entries;
}

async function inspectProduct(page, link, shop, remember, salt, targetDay) {
  await page.navigate(link.url);
  await pause(1250);
  let snap = await page.inspect(readProduct);
  if (snap.url === 'about:blank') {
    await pause(400);
    snap = await page.inspect(readProduct);
    if (snap.url === 'about:blank') throw new Error('상품 페이지를 열지 못했습니다.');
  }
  let source = productLink(snap.url,shop) || productLink(link.url,shop);
  const host = new URL(snap.url).hostname;
  if (!source || host !== shop.host && !host.endsWith('.' + shop.host)) throw new Error('공식 상품 주소 확인 실패');
  for (let attempt=0; attempt<3; attempt++) {
    if (await page.inspect(clickReviewControl,'tab')) break;
    await pause(600);
  }
  await pause(750);
  let latest = await page.inspect(clickReviewControl,'latest');
  if (!latest && await page.inspect(clickReviewControl,'sort')) {
    await pause(200);
    latest = await page.inspect(clickReviewControl,'latest');
  }
  if (latest) await pause(650);
  let entries = {};
  for (let step=0; step<maxReviewPages; step++) {
    snap = await page.inspect(readProduct);
    const newEntries = reviewEntries(snap,salt);
    const added = Object.keys(newEntries).some(key=>!Object.hasOwn(entries,key));
    Object.assign(entries,newEntries);
    const pageDays = Object.values(newEntries);
    if (targetDay && latest && pageDays.length && pageDays.every(date=>date < targetDay)) break;
    if (!added || step === maxReviewPages-1 || !await page.inspect(clickReviewControl,'more')) break;
    await pause(750);
  }
  const count = Object.keys(entries).length;
  if (!count && !snap.empty) return 'unreadable';
  const name = snap.title.trim().slice(0,200) || '상품 ' + source.id.split(':')[1];
  const category = snap.category.trim().slice(0,80) || '미분류';
  remember(source,{name,category,entries});
  return count ? 'found' : 'zero';
}

export async function collect(store, save, report, targetDay) {
  const edge = await openEdge();
  const results = await Promise.allSettled(shops.map(async shop => {
    const page = await edge.page();
    const run = {checked:0, found:0, zero:0, unreadable:0, failures:0, discoveryFailed:false};
    try {
      const links = new Map();
      for (const url of shop.seeds) {
        const link = productLink(url,shop);
        links.set(link?.id ?? url,link ?? {id:null,url});
      }
      const manual = store.targets?.[shop.id] ?? [];
      for (const url of manual) {
        const link = productLink(url,shop);
        if (link) links.set(link.id,link);
      }
      try {
        await page.navigate(shop.home);
        await pause(1700);
        const linksFromHome = await page.inspect(findPublicLinks);
        for (const url of linksFromHome) {
          const link = productLink(url,shop);
          if (link) links.set(link.id,link);
        }
      } catch { run.discoveryFailed = true; }
      const list = [...links.values()];
      if (!list.length) run.discoveryFailed = true;
      const pinnedCount = Math.min(shop.seeds.length + Math.min(manual.length,2),Math.floor(maxProducts/2));
      const remaining = list.slice(pinnedCount);
      const rotation = store.status[shop.id]?.offset ?? 0;
      const offset = remaining.length ? rotation % remaining.length : 0;
      const rotated = remaining.slice(offset).concat(remaining.slice(0,offset));
      const queue = list.slice(0,pinnedCount).concat(rotated).slice(0,maxProducts);
      run.offset = rotation + Math.max(0,queue.length-pinnedCount);
      for (const link of queue) {
        run.checked++;
        report(shop,run);
        try {
          const result = await inspectProduct(page,link,shop,(source,{name,category,entries})=>{
            const previous = store.products[source.id];
            store.products[source.id] = {id:source.id,shop:shop.id,url:source.url,name,
              category:category==='미분류' ? previous?.category ?? category : category,
              reviews:{...previous?.reviews,...entries},checkedAt:new Date().toISOString()};
          },store.salt,targetDay);
          run[result]++;
        } catch { run.failures++; }
      }
    } finally {
      await page.close();
      store.status[shop.id] = {...run,at:new Date().toISOString()};
      await save();
      report(shop,run);
    }
  }));
  await edge.close();
  if (results.every(result=>result.status==='rejected')) throw new Error('공개 상품 수집을 시작하지 못했습니다.');
}

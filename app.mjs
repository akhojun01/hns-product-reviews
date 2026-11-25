import { shops } from './shops.mjs';
import { collapseProducts, getStats } from './stats.mjs';
import { previousDay } from './dates.mjs';

const byId = id=>document.getElementById(id);
const [from,to,category,search] = ['from','to','category','search'].map(byId);
const digits = new Intl.NumberFormat('ko-KR');
const timestamp = new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'});
const names = new Map(shops.map(shop=>[shop.id,shop.name]));
const state = {products:[],batches:[],loaded:false,loading:false,error:''};
let selected = '';
let activeStats;

function node(tag,content,cls) {
  const element = document.createElement(tag);
  if (content !== undefined) element.textContent = content;
  if (cls) element.className = cls;
  return element;
}

function formatCount(value) {
  return digits.format(value) + '건';
}

function makeLink(text,href) {
  const element = node('a',text);
  element.href = href;
  return element;
}

function chooseRange(mode) {
  const lastCompleteDay = previousDay();
  const day = new Date(lastCompleteDay);
  const thisMonth = lastCompleteDay.slice(0,7) + '-01';
  to.value = lastCompleteDay;
  if (mode==='yesterday') from.value = lastCompleteDay;
  else if (mode==='month') from.value = thisMonth;
  else if (mode==='last') {
    const lastDay = new Date(Date.parse(thisMonth) - 86_400_000).toISOString().slice(0,10);
    from.value = lastDay.slice(0,7) + '-01';
    to.value = lastDay;
  } else if (mode==='all') {
    const dates = state.batches.map(batch=>batch.day).sort();
    from.value = dates[0] ?? lastCompleteDay;
  } else {
    day.setUTCDate(day.getUTCDate() - (Number(mode) - 1));
    from.value = day.toISOString().slice(0,10);
  }
  render();
}

function categoryFilters() {
  const before = category.value;
  const categories = [...new Set(state.products.filter(p=>!selected || p.shop===selected).map(p=>p.category))];
  categories.sort((a,b)=>a.localeCompare(b,'ko'));
  category.replaceChildren(new Option('전체 카테고리',''),...categories.map(name=>new Option(name,name)));
  if (categories.includes(before)) category.value = before;
}

function route(initial = false) {
  const shop = shops.find(candidate=>location.hash.slice(1)===candidate.id);
  selected = shop?.id ?? '';
  byId('title').textContent = shop ? shop.name + ' 상품평' : '상품평 대시보드';
  const tabs = [['','전체'],...shops.map(candidate=>[candidate.id,candidate.name])];
  byId('tabs').replaceChildren(...tabs.map(([id,name])=>{
    const link = makeLink(name,'#' + (id || 'all'));
    if (id===selected) link.setAttribute('aria-current','page');
    return link;
  }));
  if (!initial) {
    category.value = '';
    search.value = '';
    window.scrollTo(0,0);
    byId('title').focus({preventScroll:true});
  }
  categoryFilters();
  render();
}

function coverage(stats,batches) {
  byId('collection-status').textContent = state.error ||
    (state.loading ? '불러오는 중' : batches.length ? batches.length+'일 수집 기록' : '수집 기록 없음');
  byId('refresh').disabled = state.loading;
  const rows = shops.map(shop=>{
    const runs = batches.map(batch=>batch.status[shop.id]).filter(Boolean);
    const checkedDays = runs.filter(run=>run.confirmed>0);
    const found = checkedDays.length>0;
    const row = node('div',undefined,'coverage-row');
    const name = makeLink(shop.name,'#'+shop.id);
    let description = '수집 기록 없음';
    if (runs.length && !found) description = '공개 상품평 미확인';
    if (found) {
      const latest = checkedDays.at(-1);
      const confirmed = new Set(batches.flatMap(batch=>batch.products.filter(item=>item.shop===shop.id).map(item=>item.id))).size;
      description = '상품 ' + confirmed + '개 · ' + checkedDays.length + '일 확인';
      row.title = '최근 확인 ' + timestamp.format(new Date(latest.at));
    }
    const count = node('span',found ? formatCount(stats.byShop.get(shop.id) || 0) : '—','count');
    if (selected && selected!==shop.id) count.textContent = '—';
    row.append(name,node('span',description),count);
    return row;
  });
  byId('coverage').replaceChildren(...rows);
}

function chart(stats, missing) {
  const categories = stats.categories;
  byId('category-count').textContent = categories.length ? categories.length + '개 분류' : '';
  if (!categories.length) {
    byId('category-chart').replaceChildren(node('p',missing,'empty'));
    return;
  }
  const max = categories[0][1];
  byId('category-chart').replaceChildren(...categories.map(([name,count])=>{
    const row = node('div',undefined,'category-row');
    const label = node('button',name);
    label.type = 'button';
    label.addEventListener('click',()=>{category.value=name;render();});
    const bar = node('div',undefined,'bar');
    const fill = node('span');
    fill.style.width = (100 * count / max) + '%';
    bar.append(fill);
    row.append(label,bar,node('span',formatCount(count),'count'));
    return row;
  }));
}

function rankTable(stats,missing) {
  byId('ranking-count').textContent = stats.ranking.length ? digits.format(stats.ranking.length) + '개 상품' : '';
  if (!stats.ranking.length) {
    byId('ranking').replaceChildren(node('p',missing,'empty'));
    return;
  }
  const table = node('table');
  const head = table.createTHead().insertRow();
  ['순위','상품명','홈쇼핑사','카테고리','기간 내 상품평'].forEach((label,i)=>{
    const th = node('th',label,i===2 || i===3 ? 'desktop-meta' : '');
    th.scope='col';
    head.append(th);
  });
  const body = table.createTBody();
  stats.ranking.forEach((item,index)=>{
    const tr = body.insertRow();
    tr.insertCell().textContent = index + 1;
    const title = tr.insertCell();
    const link = makeLink(item.name,item.url);
    link.target='_blank';
    link.rel='noopener noreferrer';
    title.append(link,node('span',names.get(item.shop)+' · '+item.category,'mobile-meta'));
    [['desktop-meta',names.get(item.shop)],['desktop-meta',item.category],['count',formatCount(item.count)]].forEach(([cls,value])=>{
      const cell = tr.insertCell();
      cell.className=cls;
      cell.textContent=value;
    });
  });
  byId('ranking').replaceChildren(table);
}

function render() {
  const invalid = !from.value || !to.value || from.value > to.value || to.value>previousDay();
  byId('period-error').hidden = !invalid;
  const batches = state.batches.filter(batch=>batch.day>=from.value && batch.day<=to.value);
  const inRange = collapseProducts(batches);
  activeStats = getStats(inRange,{
    from:invalid ? '9999-12-31' : from.value,to:invalid ? '' : to.value,
    shop:selected,category:category.value,search:search.value,
  });
  const sourceHasData = inRange.some(item=>!selected || selected===item.shop);
  const verifiedShops = shops.filter(shop=>batches.some(batch=>batch.status[shop.id]?.confirmed>0)).length;
  byId('data-note').textContent = state.error || (state.loading ? '일배치 데이터를 불러오는 중입니다.' :
    batches.length ? '조회기간 중 '+verifiedShops+'/7개사의 공개 상품평을 확인했습니다. 확인된 상품의 기간 내 등록 건수입니다.' :
    '선택한 날짜에 저장된 일배치 결과가 없습니다.');
  for (const [id,value,suffix] of [['total',activeStats.total,'건'],['skuCount',activeStats.reviewed,'개'],['checkedCount',activeStats.checked,'개']]) {
    byId(id).textContent = sourceHasData && !invalid ? digits.format(value) + suffix : '—';
  }
  const missing = invalid ? '조회기간을 확인해 주세요.' :
    !state.loaded ? state.error || '수집 결과를 불러오는 중입니다.' :
    !sourceHasData ? '등록일이 확인된 상품평을 아직 확보하지 못했습니다.' :
    '조회 조건에 맞는 상품평이 없습니다.';
  chart(activeStats,missing);
  rankTable(activeStats,missing);
  coverage(activeStats,batches);
  byId('export').disabled = !activeStats.total || invalid;
}

async function load() {
  if (state.loading) return;
  state.loading = true;
  render();
  try {
    const response = await fetch('./data.json',{cache:'no-store'});
    if (!response.ok) throw new Error('수집 결과를 불러오지 못했습니다.');
    const data = await response.json();
    const batches = data.batches.sort((a,b)=>a.day.localeCompare(b.day));
    Object.assign(state,{batches,products:collapseProducts(batches),loaded:true,error:''});
    categoryFilters();
  } catch { state.error = '일배치 데이터를 불러오지 못했습니다.'; }
  finally {state.loading = false;render();}
}

byId('refresh').addEventListener('click',load);

function csvField(value) {
  let text = String(value ?? '');
  if (/^[\s\uFEFF]*[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"','""') + '"';
}

byId('export').addEventListener('click',()=>{
  const {total,reviewed,checked,categories,ranking,byShop} = activeStats;
  const records = [
    ['조회 시작일',from.value],['조회 종료일',to.value],['홈쇼핑사',names.get(selected) || '전체'],
    ['카테고리',category.value || '전체'],['검색어',search.value],
    ['기간 내 등록 상품평',total],['상품평이 달린 상품',reviewed],['상품평 확인 상품',checked],[],
    ['카테고리','상품평 수'],...categories.map(item=>item),[],
    ['홈쇼핑사','상품평 수'],...shops.filter(shop=>!selected || selected===shop.id).map(shop=>[shop.name,byShop.get(shop.id) || 0]),[],
    ['순위','상품명','홈쇼핑사','카테고리','상품평 수','상품코드','공개 상품 URL'],
    ...ranking.map((item,index)=>[index+1,item.name,names.get(item.shop),item.category,item.count,item.id.split(':')[1],item.url]),
  ];
  const file = new Blob(['\uFEFF',records.map(row=>row.map(csvField).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(file);
  const link = makeLink('',url);
  link.download = 'product-reviews_' + from.value + '_' + to.value + '.csv';
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});

window.addEventListener('hashchange',()=>route());
for (const control of [from,to,category,search]) control.addEventListener('input',render);
document.querySelectorAll('[data-period]').forEach(button=>button.addEventListener('click',()=>chooseRange(button.dataset.period)));
for (const input of [from,to]) input.max=previousDay();
chooseRange('yesterday');
route(true);
await load();

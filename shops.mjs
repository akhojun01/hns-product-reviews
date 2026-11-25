export const shops = [
  {id:'gs', name:'GS샵', mark:'GS', color:'#007963', host:'gsshop.com', home:'https://m.gsshop.com/index.gs', seeds:['https://m.gsshop.com/prd/prd.gs?prdid=67724019','https://m.gsshop.com/prd/prd.gs?prdid=67723420'], key:'prdid'},
  {id:'cj', name:'CJ온스타일', mark:'CJ', color:'#8a2d6c', host:'cjonstyle.com', home:'https://display.cjonstyle.com/p/homeTab/main?hmtabMenuId=H00005&mdId=6783', seeds:['https://display.cjonstyle.com/p/item/2092077403'], key:'itemCode'},
  {id:'hyundai', name:'현대홈쇼핑', mark:'현대', color:'#004d81', host:'hmall.com', home:'https://www.hmall.com/', seeds:['https://www.hmall.com/md/pda/itemPtc?slitmCd=2073328035'], key:'slitmCd'},
  {id:'lotte', name:'롯데홈쇼핑', mark:'롯데', color:'#bc3f48', host:'lotteimall.com', home:'https://m.lotteimall.com/', seeds:['https://m.lotteimall.com/goods/viewGoodsDetail.lotte?goods_no=12721052','https://m.lotteimall.com/goods/viewGoodsDetail.lotte?goods_no=1183967694'], key:'goods_no'},
  {id:'hns', name:'홈앤쇼핑', mark:'홈앤', color:'#7552a1', host:'hnsmall.com', home:'https://m.hnsmall.com/main', seeds:['https://m.hnsmall.com/goods/view/77392042'], key:null},
  {id:'ns', name:'NS홈쇼핑', mark:'NS', color:'#99522d', host:'nsmall.com', home:'https://m.nsmall.com/', seeds:['https://m.nsmall.com/goods/35999364','https://m.nsmall.com/goods/36088515'], key:'productId'},
  {id:'public', name:'공영홈쇼핑', mark:'공영', color:'#456e3a', host:'gongyoungshop.kr', home:'https://www.gongyoungshop.kr/display/selectBest.do', seeds:['https://www.gongyoungshop.kr/goods/selectGoodsDetail.do?prdId=11923107'], key:'prdId'},
];

export function productLink(input, shop, base = shop.home) {
  let url;
  try { url = new URL(input, base); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  if (url.hostname !== shop.host && !url.hostname.endsWith('.' + shop.host)) return null;
  const pairs = ['prdid', 'itemCode', 'slitmCd', 'goods_no', 'productId', 'prdId', 'goodsNo', 'prdNo', 'productNo'];
  const entries = [...url.searchParams];
  const key = [shop.key, ...pairs].filter(Boolean).map(name =>
    entries.find(([actual]) => actual.toLowerCase() === name.toLowerCase())
  ).find(entry => entry && /^\d{4,}$/.test(entry[1]));
  const route = /(?:\/|^)(?:prd|item|product|goods|detail|itemPtc|viewGoodsDetail|selectGoodsDetail)/i;
  const pathCode = route.test(url.pathname) && url.pathname.match(/\/(\d{4,})\/?$/)?.[1];
  if (!key && !pathCode) return null;
  if (key && !route.test(url.pathname)) return null;
  url.hash = '';
  if (key && (key[0].toLowerCase() === shop.key?.toLowerCase() || shop.id === 'ns')) {
    url.search = '';
    url.searchParams.set(key[0], key[1]);
  }
  return {id: shop.id + ':' + (key?.[1] ?? pathCode), url:url.href};
}

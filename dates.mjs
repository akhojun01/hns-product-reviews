const koreanDate = new Intl.DateTimeFormat('en-CA',{
  timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',
});

export function koreanToday(now = new Date()) {
  return koreanDate.format(now);
}

export function previousDay(now = new Date()) {
  return new Date(Date.parse(koreanToday(now))-86_400_000).toISOString().slice(0,10);
}

export function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0,10)===value;
}

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { setTimeout as pause } from 'node:timers/promises';

export async function openEdge() {
  const candidates = [process.env['ProgramFiles(x86)'],process.env.ProgramFiles,process.env.LOCALAPPDATA]
    .filter(Boolean).map(folder => join(folder,'Microsoft','Edge','Application','msedge.exe'));
  const executable = [process.env.HNS_REVIEW_BROWSER,...candidates,'/usr/bin/google-chrome','/usr/bin/chromium']
    .filter(Boolean).find(existsSync);
  if (!executable) throw new Error('상품평 수집에 사용할 Chrome 또는 Edge를 찾을 수 없습니다.');
  const profile = await mkdtemp(join(tmpdir(),'hns-review-'));
  const child = spawn(executable, [
    '--headless=new','--remote-debugging-port=0','--no-first-run','--no-default-browser-check',
    '--disable-background-networking','--disable-extensions','--disable-dev-shm-usage','--user-data-dir=' + profile,'about:blank',
  ],{stdio:['ignore','ignore','ignore'],windowsHide:true});
  let socket;
  let counter = 0;
  const pending = new Map();
  let startupError;
  function rejectPending(error) {
    for (const request of pending.values()) request.reject(error);
  }
  child.on('error',error=>{startupError=error;rejectPending(error);});
  child.on('exit',()=>rejectPending(new Error('Edge 연결이 종료됐습니다.')));
  function call(method,params = {},sessionId) {
    const id = ++counter;
    return new Promise((resolve,reject)=>{
      const timer = setTimeout(()=>reject(new Error('Edge 응답 시간 초과')),12_000);
      pending.set(id,{resolve,reject,timer});
      socket.send(JSON.stringify({id,method,params,sessionId}));
    }).finally(()=>{
      const request = pending.get(id);
      if (request) {
        clearTimeout(request.timer);
        pending.delete(id);
      }
    });
  }
  async function close() {
    socket?.close();
    const exit = child.exitCode === null && child.pid ? once(child,'exit').catch(()=>{}) : Promise.resolve();
    if (child.exitCode === null && child.pid) child.kill();
    await exit;
    await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200}).catch(()=>{});
  }
  try {
    let address;
    for (let attempt=0; attempt<45; attempt++) {
      if (startupError) throw startupError;
      if (child.exitCode!==null) break;
      const file = await readFile(join(profile,'DevToolsActivePort'),'utf8').catch(()=>null);
      const [port, path] = file?.trim().split(/\r?\n/) ?? [];
      if (/^\d+$/.test(port) && path?.startsWith('/devtools/browser/')) {
        address = 'ws://127.0.0.1:' + port + path;
        break;
      }
      await pause(200);
    }
    if (!address) throw new Error('수집용 Edge를 시작하지 못했습니다.');
    socket = new WebSocket(address);
    await new Promise((resolve,reject)=>{
      const timer = setTimeout(()=>reject(new Error('수집용 Edge 연결 시간 초과')),5000);
      socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
      socket.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('수집용 Edge 연결 실패'));},{once:true});
    });
    socket.addEventListener('message',event=>{
      const response = JSON.parse(event.data);
      const request = pending.get(response.id);
      if (!request) return;
      if (response.error) request.reject(new Error(response.error.message));
      else request.resolve(response.result);
    });
    socket.addEventListener('close',()=>rejectPending(new Error('Edge 연결이 종료됐습니다.')));
    await call('Browser.getVersion');
  } catch (error) { await close(); throw error; }
  return {
    close,
    async page() {
      const {targetId} = await call('Target.createTarget',{url:'about:blank'});
      const {sessionId} = await call('Target.attachToTarget',{targetId,flatten:true});
      const send = (method,params) => call(method,params,sessionId);
      await send('Page.enable');
      return {
        async navigate(url) {
          const result = await send('Page.navigate',{url});
          if (result.errorText) throw new Error('상품 페이지 접속 실패');
        },
        async inspect(fn,arg = null) {
          const {result,exceptionDetails} = await send('Runtime.evaluate',{
            expression:'(' + fn.toString() + ')(' + JSON.stringify(arg) + ')',
            returnByValue:true, awaitPromise:true,
          });
          if (exceptionDetails) throw new Error('상품 페이지 확인 중 브라우저 응답 오류');
          return result.value;
        },
        close:()=>call('Target.closeTarget',{targetId}).catch(()=>{}),
      };
    },
  };
}

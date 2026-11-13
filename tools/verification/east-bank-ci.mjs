// Own the dev server and browser used by the real east-bank interaction review.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const origin='http://127.0.0.1:5187',cdp='http://127.0.0.1:9333';
const out=path.resolve(process.env.EVIDENCE_DIR??'/tmp/how-east-bank-evidence');
const playwrightModule=process.env.PLAYWRIGHT_MODULE??'playwright';
const abort=new AbortController(),children=[];
const report={result:'running',startedAt:new Date().toISOString(),origin,cdp,flow:'all',sourceRevision:null};
let profile;
fs.mkdirSync(out,{recursive:true});
const onSignal=signal=>abort.abort(new Error(`East-bank review interrupted by ${signal}`));
const onInt=()=>onSignal('SIGINT'),onTerm=()=>onSignal('SIGTERM');
process.once('SIGINT',onInt);process.once('SIGTERM',onTerm);

function start(name,command,args,env=process.env){
  const record={name,result:null};
  // Each process has its own group so cleanup also stops its owned helpers.
  const child=spawn(command,args,{cwd:root,env,stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'});
  record.child=child;children.push(record);
  const log=path.join(out,`${name}.log`);fs.writeFileSync(log,'');
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{
    fs.appendFileSync(log,chunk);
    if(name==='east-bank')process.stdout.write(chunk);
  });
  record.done=new Promise(resolve=>{
    child.once('error',error=>{record.result={error:String(error)};resolve(record.result);});
    child.once('close',(code,signal)=>{record.result??={code,signal};resolve(record.result);});
  });
  return record;
}

async function freePort(port){
  await new Promise((resolve,reject)=>{
    const server=net.createServer();
    server.once('error',reject);
    server.listen(port,'127.0.0.1',()=>server.close(error=>error?reject(error):resolve()));
  });
}

async function ready(record,url,isCdp=false){
  const deadline=Date.now()+45000;
  while(Date.now()<deadline){
    abort.signal.throwIfAborted();
    if(record.result)throw new Error(`${record.name} exited before becoming ready: ${JSON.stringify(record.result)}`);
    try{
      const response=await fetch(url,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(1500)])});
      if(response.ok&&(!isCdp||(await response.json()).webSocketDebuggerUrl))return;
    }catch{abort.signal.throwIfAborted();}
    await delay(250,undefined,{signal:abort.signal});
  }
  throw new Error(`${record.name} did not become ready at ${url} within 45 seconds`);
}

function signalChild(record,signal){
  if(!record.child.pid)return;
  try{
    if(process.platform==='win32')record.child.kill(signal);
    else process.kill(-record.child.pid,signal);
  }catch(error){if(error.code!=='ESRCH')throw error;}
}

async function stop(record){
  signalChild(record,'SIGTERM');
  const result=await Promise.race([record.done,delay(5000,'timeout',{ref:false})]);
  if(result==='timeout'){
    signalChild(record,'SIGKILL');
    await Promise.race([record.done,delay(2000,undefined,{ref:false})]);
  }
}

try{
  report.sourceRevision=process.env.SOURCE_REVISION??execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  fs.accessSync(path.join(root,'tools/verification/east-bank.mjs'));
  const {chromium}=await import(playwrightModule);
  await freePort(5187);await freePort(9333);
  report.phase='dev-server';
  // The existing review stepper is DEV-only and advances the normal simulation owner.
  const vite=start('vite',process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5187','--strictPort']);
  await ready(vite,origin);
  report.phase='browser';
  profile=fs.mkdtempSync(path.join(os.tmpdir(),'how-east-chromium-'));
  const chrome=start('chromium',chromium.executablePath(),[
    '--headless=new','--no-sandbox','--disable-dev-shm-usage',
    '--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',
    '--no-first-run','--no-default-browser-check',
    '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
    '--remote-debugging-address=127.0.0.1','--remote-debugging-port=9333',
    `--user-data-dir=${profile}`,'about:blank',
  ]);
  await ready(chrome,`${cdp}/json/version`,true);
  report.phase='interaction-review';
  const env={...process.env,TEST_ORIGIN:origin,CHROME_CDP_URL:cdp,EVIDENCE_DIR:out,SOURCE_REVISION:report.sourceRevision,TEST_FLOW:'all',PLAYWRIGHT_MODULE:playwrightModule};
  delete env.BASELINE_ORIGIN;
  const review=start('east-bank',process.execPath,[path.join(root,'tools/verification/east-bank.mjs')],env);
  const result=await Promise.race([
    review.done,
    delay(15*60*1000,undefined,{signal:abort.signal}).then(()=>{throw new Error('East-bank interaction review exceeded 15 minutes');}),
  ]);
  assert.equal(result.code,0,`East-bank interaction review failed: ${JSON.stringify(result)}`);
  const evidence=JSON.parse(fs.readFileSync(path.join(out,'report.json'),'utf8'));
  assert.equal(evidence.sourceRevision,report.sourceRevision);
  assert.equal(evidence.result,'passed');
  assert.equal(evidence.flows.length,6,'Every east-bank interaction flow must finish');
  assert.equal(evidence.frames.length,13,'All desktop and mobile review frames must be captured');
  assert.deepEqual(evidence.errors,[]);assert.deepEqual(evidence.failedRequests,[]);
  for(const frame of evidence.frames){
    assert.equal(frame.shaderErrors,0,`${frame.name}: shader errors`);
    assert.ok(frame.drawCalls>0&&frame.triangles>0,`${frame.name}: no rendered scene`);
  }
  report.result='passed';report.flows=evidence.flows.length;report.frames=evidence.frames.length;
  console.log(`East-bank review passed: ${report.flows} flows, ${report.frames} frames at ${report.sourceRevision}`);
}catch(error){
  report.result='failed';report.failure=String(error);report.stack=error.stack;
  console.error(error);process.exitCode=1;
}finally{
  abort.abort();
  for(const child of children.reverse())try{await stop(child);}catch(error){
    (report.cleanupErrors??=[]).push(`${child.name}: ${error}`);process.exitCode=1;report.result='failed';
  }
  if(profile)try{fs.rmSync(profile,{recursive:true,force:true});}catch(error){
    (report.cleanupErrors??=[]).push(`browser profile: ${error}`);process.exitCode=1;report.result='failed';
  }
  report.finishedAt=new Date().toISOString();
  fs.writeFileSync(path.join(out,'runner-report.json'),JSON.stringify(report,null,2));
  process.removeListener('SIGINT',onInt);process.removeListener('SIGTERM',onTerm);
}

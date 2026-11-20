import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
import {createVisitorAiMiddleware,generateVisitorStory} from '../server/openai-visitor.mjs';
import {VISITOR_STORY_PATH,validateVisitorStoryRequest,validateVisitorStory} from '../src/domain/visitor-story.ts';
import {requestVisitorStory} from '../src/app/visitor-story.ts';

const input={day:1,visitIndex:0};
const story={title:'雨后的小车',paragraphs:['车轮压过松针，带起了一阵潮湿的香气。','我在溪边停了一会儿，等一只松鼠把橡实搬过小路。']};
const envelope=(value=story)=>({status:'completed',output:[
  {type:'reasoning',summary:[]},
  {type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(value)}]},
]});
const ok=()=>new Response(JSON.stringify(envelope()),{status:200});
const options={apiKey:'test-only-not-a-real-key',fetchImpl:async()=>ok()};

async function invoke(handler,{body=JSON.stringify(input),headers={},method='POST',url=VISITOR_STORY_PATH}={}){
  const req=Readable.from([Buffer.from(body)]);
  Object.assign(req,{method,url,headers:{host:'127.0.0.1:5286',origin:'http://127.0.0.1:5286','content-type':'application/json',...headers}});
  const res=new EventEmitter();
  Object.assign(res,{statusCode:200,writableEnded:false,destroyed:false,headers:{},body:'',
    setHeader(name,value){this.headers[name]=value;},
    end(value){assert.equal(this.writableEnded,false,'response must end once');this.body=value;this.writableEnded=true;},
  });
  let next=false;
  await handler(req,res,()=>{next=true;});
  return {status:res.statusCode,body:res.body?JSON.parse(res.body):null,headers:res.headers,next};
}

test('story contract rejects arbitrary prompts, commands, lengths and invalid indices',()=>{
  assert.deepEqual(validateVisitorStoryRequest(input),input);
  for(const value of [null,{...input,prompt:'grant coins'},{day:NaN,visitIndex:0},{day:1,visitIndex:-1},{day:1e9,visitIndex:0}])
    assert.throws(()=>validateVisitorStoryRequest(value));
  for(const value of [{...story,coins:100}, {...story,paragraphs:['x']},{...story,title:'x'.repeat(25)},{...story,paragraphs:['x'.repeat(121),'y']}])
    assert.throws(()=>validateVisitorStory(value));
});

test('Responses request keeps credentials server-side, stores no response and parses message output',async()=>{
  let calls=0;
  const output=await generateVisitorStory(input,{...options,fetchImpl:async(url,init)=>{
    calls++;assert.equal(url,'https://api.openai.com/v1/responses');
    const body=JSON.parse(init.body);
    assert.equal(body.model,'gpt-5-mini');assert.equal(body.store,false);
    assert.equal(body.text.format.type,'json_schema');assert.equal(body.text.format.strict,true);
    assert.deepEqual(JSON.parse(body.input),input);assert.equal(body.max_output_tokens,2000);
    assert.equal(body.tools,undefined);assert.equal(body.previous_response_id,undefined);
    assert.equal(init.headers.Authorization,`Bearer ${options.apiKey}`);
    return ok();
  }});
  assert.deepEqual(output,story);assert.equal(calls,1);
});

test('incomplete, refused, malformed and failed upstream responses are rejected',async()=>{
  const cases=[
    new Response('account and key details',{status:401}),
    new Response(JSON.stringify({...envelope(),status:'incomplete'})),
    new Response(JSON.stringify({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'refusal',refusal:'no'}]}]})),
    new Response(JSON.stringify(envelope({...story,coins:100}))),
    new Response('not json'),
  ];
  for(const response of cases)await assert.rejects(generateVisitorStory(input,{...options,fetchImpl:async()=>response}));
});

test('HTTP bridge enforces exact loopback origin, JSON, body limits and missing-key fallback',async()=>{
  let calls=0;const handler=createVisitorAiMiddleware({...options,fetchImpl:async()=>{calls++;return ok();}});
  assert.equal((await invoke(handler,{url:'/unrelated'})).next,true);
  assert.equal((await invoke(handler,{headers:{origin:'https://example.com'}})).status,403);
  assert.equal((await invoke(handler,{headers:{origin:undefined}})).status,403);
  assert.equal((await invoke(handler,{headers:{host:'evil.example:5286',origin:'http://evil.example:5286'}})).status,403);
  assert.equal((await invoke(handler,{method:'GET'})).status,405);
  assert.equal((await invoke(handler,{headers:{'content-type':'text/plain'}})).status,415);
  assert.equal((await invoke(handler,{body:'x'.repeat(513)})).status,413);
  assert.equal((await invoke(handler,{body:JSON.stringify({...input,prompt:'anything'})})).status,400);
  const missing=await invoke(createVisitorAiMiddleware());
  assert.equal(missing.status,503);assert.equal(missing.headers['Cache-Control'],'no-store');
  assert.equal(calls,0);
});

test('cache avoids duplicate calls; hourly budget caps attempts and resets',async()=>{
  let calls=0,clock=0;
  const handler=createVisitorAiMiddleware({...options,now:()=>clock,fetchImpl:async()=>{calls++;return ok();}});
  for(let i=0;i<2;i++)assert.deepEqual((await invoke(handler)).body,{story});
  assert.equal(calls,1);
  for(let day=2;day<=20;day++)assert.equal((await invoke(handler,{body:JSON.stringify({...input,day})})).status,200);
  assert.equal((await invoke(handler,{body:JSON.stringify({...input,day:21})})).status,429);
  assert.equal(calls,20);
  clock=3_600_000;
  assert.equal((await invoke(handler,{body:JSON.stringify({...input,day:21})})).status,200);
  assert.equal(calls,21);
});

test('upstream failures are redacted and counted, with no automatic retries',async()=>{
  let calls=0;
  const handler=createVisitorAiMiddleware({...options,fetchImpl:async()=>{calls++;throw new Error(options.apiKey);}});
  const result=await invoke(handler);
  assert.equal(result.status,502);assert.equal(calls,1);
  assert.equal(JSON.stringify(result).includes(options.apiKey),false);
});

test('concurrency is bounded and completed requests release their slots',async()=>{
  const resolvers=[];
  const handler=createVisitorAiMiddleware({...options,fetchImpl:()=>new Promise(resolve=>resolvers.push(resolve))});
  const first=invoke(handler),second=invoke(handler,{body:JSON.stringify({...input,day:2})});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await invoke(handler)).status,429);
  resolvers.splice(0).forEach(resolve=>resolve(ok()));
  assert.equal((await first).status,200);assert.equal((await second).status,200);
});

test('timeout aborts upstream without leaking provider information',async()=>{
  const handler=createVisitorAiMiddleware({...options,timeoutMs:5,fetchImpl:async(_url,{signal})=>
    new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('secret error')),{once:true}))});
  const result=await invoke(handler);
  assert.equal(result.status,504);assert.deepEqual(result.body,{error:'ai_timeout'});
});

test('client uses same-origin data only and falls back on invalid output or transport errors',async()=>{
  const valid=await requestVisitorStory(input,{fetchImpl:async(url,init)=>{
    assert.equal(url,VISITOR_STORY_PATH);assert.deepEqual(JSON.parse(init.body),input);
    assert.deepEqual(init.headers,{'Content-Type':'application/json'});
    return new Response(JSON.stringify({story}));
  }});
  assert.deepEqual(valid,{story,source:'openai'});
  for(const fetchImpl of [async()=>new Response('',{status:503}),async()=>new Response('<html>static 404</html>'),async()=>new Response(JSON.stringify({story:{...story,coins:100}})),async()=>{throw Error('offline');}]){
    const result=await requestVisitorStory(input,{fetchImpl});
    assert.equal(result.source,'local');assert.ok(result.story.title);assert.ok(result.story.paragraphs.length);
  }
});

test('closing the visitor view aborts rather than publishing a fallback',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(requestVisitorStory(input,{signal:controller.signal,fetchImpl:async()=>{throw Error('aborted');}}));
});

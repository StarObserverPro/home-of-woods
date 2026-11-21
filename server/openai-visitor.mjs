import {VISITOR_STORY_PATH,VISITOR_STORY_SCHEMA,validateVisitorStoryRequest,validateVisitorStory} from '../src/domain/visitor-story.ts';

const INSTRUCTIONS=`你是《森林之家》中赶着小货车来访的林间行商。用自然简体中文讲一件路上的小见闻。
世界是温带针阔混交林、山间营地、溪谷、帐篷和正在修缮的旧木屋；日常有木作、菌菇、干粮、铜币和含蓄的森林奇趣。
输出一个短标题和2–3段正文，正文总计不超过300字。语气温和、有具体小事，不说教，不用现代科技、网络梗或仙侠战斗。
这是讲述外地见闻，不是当前玩家经历。不要声称记得玩家上次做过什么，不许作出送货、报酬、任务、交易或资源承诺。
只生成故事，不改变库存、经济、时间、地图或人物关系。输入只给当前游戏日和来访序号，用于变化话题。`;

/** Exported separately so transport tests can stub fetch without using a real key. */
export async function generateVisitorStory(input,{apiKey,model='gpt-5-mini',fetchImpl=fetch,signal}) {
  const response=await fetchImpl('https://api.openai.com/v1/responses',{
    method:'POST',signal,headers:{'Authorization':`Bearer ${apiKey}`,'Content-Type':'application/json'},
    body:JSON.stringify({model,store:false,instructions:INSTRUCTIONS,
      input:JSON.stringify(validateVisitorStoryRequest(input)),max_output_tokens:2000,
      reasoning:{effort:'low'},text:{format:{type:'json_schema',name:'visitor_story',strict:true,schema:VISITOR_STORY_SCHEMA}}}),
  });
  // Do not forward provider error bodies: they can contain account or request details.
  if(!response.ok)throw new Error('AI upstream unavailable');
  const data=await response.json();
  if(data.status!=='completed'||!Array.isArray(data.output))throw new Error('AI response incomplete');
  const content=data.output.filter(item=>item.type==='message'&&item.role==='assistant').flatMap(item=>item.content??[]);
  if(content.some(part=>part.type==='refusal'))throw new Error('AI response refused');
  const output=content.filter(part=>part.type==='output_text').map(part=>part.text).join('');
  return validateVisitorStory(JSON.parse(output));
}

const reply=(res,status,body)=>{
  res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));
};
/** Local single-player bridge, shared by Vite dev and preview. No remote access or CORS. */
export function createVisitorAiMiddleware({apiKey='',model='gpt-5-mini',fetchImpl=fetch,timeoutMs=20_000,now=Date.now}={}) {
  const cache=new Map();let active=0,attempts=0,windowStart=now();
  return async(req,res,next)=>{
    if(req.url?.split('?')[0]!==VISITOR_STORY_PATH){next();return;}
    const host=req.headers.host??'';
    // Exact loopback Host + Origin rejects cross-site requests and DNS rebinding.
    if(!/^(127\.0\.0\.1|localhost):\d+$/.test(host)||req.headers.origin!==`http://${host}`){
      reply(res,403,{error:'local_origin_required'});return;
    }
    if(req.method!=='POST'){res.setHeader('Allow','POST');reply(res,405,{error:'method_not_allowed'});return;}
    if(req.headers['content-type']?.split(';')[0].trim()!=='application/json'){
      reply(res,415,{error:'json_required'});return;
    }
    if(!apiKey.trim()){reply(res,503,{error:'ai_unavailable'});return;}
    if(active>=2){reply(res,429,{error:'ai_busy'});return;}
    // Includes body reading, so slow senders also occupy a bounded slot.
    active++;
    const controller=new AbortController();
    const abort=()=>controller.abort();
    const timer=setTimeout(()=>{controller.abort();if(!res.writableEnded)reply(res,504,{error:'ai_timeout'});},timeoutMs);
    req.once('aborted',abort);res.once('close',abort);
    try{
      const pieces=[];let bytes=0;
      for await(const chunk of req){
        bytes+=Buffer.byteLength(chunk);
        if(bytes>512){reply(res,413,{error:'request_too_large'});return;}
        if(controller.signal.aborted)return;
        pieces.push(Buffer.from(chunk));
      }
      let input;
      try{input=validateVisitorStoryRequest(JSON.parse(Buffer.concat(pieces).toString('utf8')));}
      catch{reply(res,400,{error:'invalid_request'});return;}
      const key=JSON.stringify(input),cached=cache.get(key);
      if(cached){reply(res,200,{story:cached});return;}
      if(now()-windowStart>=3_600_000){attempts=0;windowStart=now();}
      if(attempts>=20){reply(res,429,{error:'ai_limit'});return;}
      attempts++;
      const story=await generateVisitorStory(input,{apiKey,model,fetchImpl,signal:controller.signal});
      if(controller.signal.aborted)return;
      cache.set(key,story);
      if(cache.size>64)cache.delete(cache.keys().next().value);
      reply(res,200,{story});
    }catch{
      if(!res.writableEnded&&!res.destroyed)reply(res,502,{error:'ai_unavailable'});
    }finally{
      clearTimeout(timer);req.off('aborted',abort);res.off('close',abort);active--;
    }
  };
}

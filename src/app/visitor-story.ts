import {forestStoryForDay} from '../content/forest-stories.ts';
import {VISITOR_STORY_PATH,validateVisitorStory,validateVisitorStoryRequest} from '../domain/visitor-story.ts';
import type {VisitorStory,VisitorStoryRequest} from '../domain/visitor-story.ts';

export type VisitorStoryResult={story:VisitorStory;source:'openai'|'local'};
/** No credentials, automatic retries, world writes or unbounded conversation transcript. */
export async function requestVisitorStory(input:VisitorStoryRequest,{
  signal,fetchImpl=fetch,
}:{signal?:AbortSignal;fetchImpl?:typeof fetch}={}):Promise<VisitorStoryResult>{
  validateVisitorStoryRequest(input);
  try{
    const response=await fetchImpl(VISITOR_STORY_PATH,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),
      signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25_000)]):AbortSignal.timeout(25_000),
    });
    if(!response.ok)throw new Error('Story unavailable');
    const data=await response.json();
    const story=validateVisitorStory(data.story);
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    return {story,source:'openai'};
  }catch(error){
    if(signal?.aborted)throw error;
    const local=forestStoryForDay(0,input.day,input.visitIndex);
    return {story:{title:local.title,paragraphs:[...local.pages]},source:'local'};
  }
}

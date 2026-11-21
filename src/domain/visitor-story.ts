/** Bounded narrative data only; this contract cannot issue world-state commands. */
export const VISITOR_STORY_PATH='/api/ai/visitor-story';
export type VisitorStoryRequest={day:number;visitIndex:number};
export type VisitorStory={title:string;paragraphs:string[]};
const record=(value:unknown):value is Record<string,unknown>=>
  !!value&&typeof value==='object'&&!Array.isArray(value);
export function validateVisitorStoryRequest(value:unknown):VisitorStoryRequest {
  if(!record(value)||Object.keys(value).length!==2||
    !Number.isSafeInteger(value.day)||(value.day as number)<1||(value.day as number)>1_000_000||
    !Number.isSafeInteger(value.visitIndex)||(value.visitIndex as number)<0||(value.visitIndex as number)>1_000_000)
    throw new Error('Invalid visitor story request');
  return {day:value.day as number,visitIndex:value.visitIndex as number};
}
export function validateVisitorStory(value:unknown):VisitorStory {
  const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
  if(!record(value)||Object.keys(value).length!==2||!text(value.title,24)||
    !Array.isArray(value.paragraphs)||value.paragraphs.length<2||value.paragraphs.length>3||
    !value.paragraphs.every(p=>text(p,120))||value.paragraphs.join('').length>300)
    throw new Error('Invalid visitor story');
  return {title:value.title.trim(),paragraphs:value.paragraphs.map(p=>p.trim())};
}
export const VISITOR_STORY_SCHEMA={
  type:'object',additionalProperties:false,required:['title','paragraphs'],
  properties:{
    title:{type:'string',minLength:1,maxLength:24},
    paragraphs:{type:'array',minItems:2,maxItems:3,items:{type:'string',minLength:1,maxLength:120}},
  },
} as const;

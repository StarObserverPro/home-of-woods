import type {Plugin} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
/** Local dev evidence only; never included by preview/production middleware. */
export function sceneEvidencePlugin():Plugin{return {name:'local-scene-evidence',configureServer(server){server.middlewares.use('/__scene-capture',async(req,res)=>{
  if(req.method!=='POST'||req.headers.origin!==`http://${req.headers.host}`||!req.headers.host?.startsWith('127.0.0.1:')){res.statusCode=403;res.end('Local same-origin POST required');return;}
  try{const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>8_000_000)throw new Error('Capture too large');chunks.push(chunk);}
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8')) as {name:string;image:string;stats:unknown};
    if(!/^scene-(desktop|mobile)-[a-z]+-\d{1,2}-[a-z]+-\d+$/.test(body.name)||!body.image.startsWith('data:image/png;base64,'))throw new Error('Invalid scene capture');
    const bytes=Buffer.from(body.image.slice('data:image/png;base64,'.length),'base64');if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('Expected PNG');
    const folder=resolve(server.config.root,'evidence/scene-r5/captures');await mkdir(folder,{recursive:true});
    await writeFile(resolve(folder,body.name+'.png'),bytes);await writeFile(resolve(folder,body.name+'.json'),JSON.stringify(body.stats,null,2));res.end('Saved');
  }catch(error){res.statusCode=400;res.end(error instanceof Error?error.message:'Capture failed');}
});}};}

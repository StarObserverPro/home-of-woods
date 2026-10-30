import {defineConfig} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export default defineConfig({server:{host:'127.0.0.1',port:4215,strictPort:true},build:{target:'es2022'},plugins:[{name:'local-review-evidence',configureServer(server){server.middlewares.use('/__review-capture',async(req,res)=>{
  if(req.method!=='POST'||req.headers.origin!==`http://${req.headers.host}`||!req.headers.host?.startsWith('127.0.0.1:')){res.statusCode=403;res.end();return;}
  try{const chunks:Buffer[]=[];let size=0;for await(const c of req){size+=c.length;if(size>12_000_000)throw new Error('Capture too large');chunks.push(c);}
    const body=JSON.parse(Buffer.concat(chunks).toString());if(!/^[a-z0-9-]{1,80}$/.test(body.name)||!body.image.startsWith('data:image/png;base64,'))throw new Error('Invalid capture');
    const bytes=Buffer.from(body.image.split(',')[1],'base64');if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('Expected PNG');
    const folder=resolve(server.config.root,'evidence/captures');await mkdir(folder,{recursive:true});await writeFile(resolve(folder,body.name+'.png'),bytes);await writeFile(resolve(folder,body.name+'.json'),JSON.stringify(body.stats,null,2));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({saved:body.name,bytes:bytes.length}));
  }catch(e){res.statusCode=400;res.end(e instanceof Error?e.message:'Capture failed');}
});}}]});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {mkdir,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {sceneEvidencePlugin} from './tools/scene-evidence-plugin.ts';
export default defineConfig({
  plugins: [react(),sceneEvidencePlugin(),{
    name:'local-development-evidence',
    configureServer(server){
      server.middlewares.use('/__evidence/',async(req,res)=>{
        const mode=req.url?.split('?')[0].replace(/^\//,'');
        if(mode!=='walkthrough'&&mode!=='forestry'&&mode!=='gathering'){res.statusCode=404;res.end('Unknown evidence capture');return;}
        if(req.method!=='POST'||req.headers.origin!==`http://${req.headers.host}`||!req.headers.host?.startsWith('127.0.0.1:')){
          res.statusCode=403;res.end('Local same-origin POST required');return;
        }
        const pieces:Buffer[]=[];let size=0;
        try{
          for await(const chunk of req){size+=chunk.length;if(size>20_000_000)throw new Error('Recording too large');pieces.push(chunk);}
          const bytes=Buffer.concat(pieces);
          if(bytes.length<1000||bytes.subarray(0,4).toString('hex')!=='1a45dfa3')throw new Error('Expected WebM recording');
          const relativeFolder=mode==='gathering'?'evidence/gathering/captures':'evidence/integration/captures';
          const folder=resolve(server.config.root,relativeFolder);await mkdir(folder,{recursive:true});
          const filename=mode==='gathering'?'gathering.webm':mode==='forestry'?'forestry.webm':'walk-and-camera.webm';
          const target=resolve(folder,filename);await writeFile(target+'.tmp',bytes);await rename(target+'.tmp',target);
          res.setHeader('Content-Type','application/json');res.end(JSON.stringify({saved:`${relativeFolder}/${filename}`,bytes:size}));
        }catch(e){res.statusCode=400;res.end(e instanceof Error?e.message:'Unable to save');}
      });
    }
  }],
  build: { target: "es2022" },
});

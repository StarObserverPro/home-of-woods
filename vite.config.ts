import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {sceneEvidencePlugin} from './tools/scene-evidence-plugin.ts';
import {visitorAiPlugin} from './server/vite-visitor-ai.mjs';
import {LOCAL_CHARACTER_MODELS,LOCAL_CHARACTER_PREFIX} from './src/content/characters.ts';
export default defineConfig({
  // A preview can share node_modules with the game while serving different modules.
  cacheDir:resolve(import.meta.dirname,'.cache/vite'),
  plugins: [react(),sceneEvidencePlugin(),visitorAiPlugin(),{
    name:'local-development-evidence',
    configureServer(server){
      const localModels=new Set(LOCAL_CHARACTER_MODELS.map(model=>`${model}.glb`));
      server.middlewares.use(LOCAL_CHARACTER_PREFIX,async(req,res)=>{
        const name=(req.url??'').split('?')[0].replace(/^\//,'');
        if(!localModels.has(name)||req.method!=='GET'||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress??'')){
          res.statusCode=404;res.end();return;
        }
        try{
          const asset=await readFile(resolve(server.config.root,'.cache/j01-player',name));
          res.setHeader('Content-Type','model/gltf-binary');
          res.setHeader('Cache-Control','no-store');
          res.end(asset);
        }catch(error){
          res.statusCode=(error as NodeJS.ErrnoException).code==='ENOENT'?204:500;
          res.end();
        }
      });
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
  server: { host: "127.0.0.1", port: 5286, strictPort: true },
  build: { target: "es2022", rolldownOptions: { input: { game: resolve(import.meta.dirname,'index.html'), cabin: resolve(import.meta.dirname,'sandbox/cabin-interior/index.html'), timber: resolve(import.meta.dirname,'sandbox/timber-ui/index.html'), forest: resolve(import.meta.dirname,'sandbox/forest-expedition/index.html') } } },
});

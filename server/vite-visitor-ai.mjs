import {loadEnv} from 'vite';
import {createVisitorAiMiddleware} from './openai-visitor.mjs';

/** Server configuration only: never import this module from src or expose its env. */
export function visitorAiPlugin(){
  let config;
  const install=server=>{
    const env=loadEnv(config.mode,config.envDir,'');
    server.middlewares.use(createVisitorAiMiddleware({
      apiKey:env.OPENAI_API_KEY,model:env.HOW_OPENAI_MODEL||'gpt-5-mini',
    }));
  };
  return {name:'local-visitor-ai',configResolved(value){config=value;},
    configureServer:install,configurePreviewServer:install};
}

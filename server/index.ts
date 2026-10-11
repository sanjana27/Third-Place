import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { connectDatabase, migrate } from './db.js';
import { GeminiGateway } from './ai.js';
import { errorCode } from './errors.js';

async function main() {
  const config=loadConfig();
  const database=await connectDatabase(config);
  if (config.MIGRATE_ON_START==='true') await migrate(database.pool);
  const ai=new GeminiGateway(config.GEMINI_MODEL,config.GOOGLE_CLOUD_PROJECT,config.GOOGLE_CLOUD_LOCATION);
  const app=createApp({
    pool:database.pool,ai,production:config.NODE_ENV==='production',demoEnabled:config.DEMO_ENABLED==='true',
  });
  const server=app.listen(config.PORT,'0.0.0.0',()=>{
    console.log(JSON.stringify({event:'third_place_ready',port:config.PORT,model:ai.model,demo:config.DEMO_ENABLED==='true'}));
  });
  const close=()=>{
    server.close(()=>{void database.close().then(()=>{process.exitCode=0;});});
    setTimeout(()=>process.exit(1),10_000).unref();
  };
  process.once('SIGTERM',close);
  process.once('SIGINT',close);
}
main().catch((error:unknown)=>{
  console.error(JSON.stringify({
    event:'startup_failed',code:errorCode(error),
    message:error instanceof Error && error.message.startsWith('Configuration is incomplete')?error.message:'Database or application initialization failed. Check configuration and service permissions.',
  }));
  process.exit(1);
});

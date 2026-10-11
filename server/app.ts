import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Pool } from 'pg';
import { z } from 'zod';
import { actor, authenticate, checkCsrf, checkOrigin, createAssistantToken, getCafes, getProfiles, limitRequests, sessionView, userSession } from './auth.js';
import { createDemoWorld, hashToken } from './seed.js';
import { discover, parseIntent } from './discovery.js';
import { listIntroductions, respondToIntroduction, sendIntroduction, setConsent } from './connections.js';
import { ApiError, errorCode } from './errors.js';
import { openapi } from './openapi.js';
import type { AiGateway } from './ai.js';
import { discoveryRequestSchema, introductionSchema, parseRequestSchema, responseSchema, type DiscoveryView } from '../shared/contracts.js';

export function createApp(options:{pool:Pool;ai:AiGateway;production?:boolean;demoEnabled:boolean;serveClient?:boolean}) {
  const { pool,ai } = options;
  const app = express();
  app.set('trust proxy',1);
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy:{directives:{
      styleSrc:["'self'","'unsafe-inline'","https://fonts.googleapis.com"],
      fontSrc:["'self'",'data:',"https://fonts.gstatic.com"],
      upgradeInsecureRequests:options.production?[]:null,
    }},
    referrerPolicy:{policy:'no-referrer'},
  }));
  app.use(express.json({limit:'12kb'}));
  app.use(cookieParser());
  app.use((request,response,next)=>{
    request.requestId=randomUUID();
    response.setHeader('X-Request-Id',request.requestId);
    response.setHeader('Permissions-Policy','geolocation=(), camera=(), microphone=()');
    next();
  });
  app.get('/healthz',async(_request,response)=>{
    await pool.query('SELECT 1');
    response.json({status:'ready',database:'postgresql',demo:options.demoEnabled,model:ai.model});
  });
  app.get('/openapi.json',(_request,response)=>response.json(openapi));
  app.use('/api',(_request,response,next)=>{response.setHeader('Cache-Control','no-store');next();});
  app.options('/api/v1/{*path}',(request,response)=>{
    if ((request.get('access-control-request-headers') || '').toLowerCase().includes('authorization')) {
      response.setHeader('Access-Control-Allow-Origin','*');
      response.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
      response.setHeader('Access-Control-Allow-Methods','GET, POST, PATCH, DELETE, OPTIONS');
      response.sendStatus(204);
    } else {
      checkOrigin(request);
      response.sendStatus(204);
    }
  });
  app.post('/api/v1/demo/session',async(request,response)=>{
    if (!options.demoEnabled) throw new ApiError(404,'DEMO_DISABLED','The fictional demo is disabled.');
    checkOrigin(request);
    z.object({}).strict().parse(request.body);
    try {
      const current=await authenticate(pool,request);
      response.json(await sessionView(pool,current,ai.model));
      return;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status!==401) throw error;
    }
    await limitRequests(pool,'demo-create',hashToken(request.ip || 'unknown'),40);
    const created=await createDemoWorld(pool);
    response.cookie('tp_session',created.token,{
      httpOnly:true,secure:options.production===true,sameSite:'lax',path:'/',expires:created.expiresAt,
    });
    response.status(201).json(await sessionView(pool,{
      worldId:created.worldId,profileId:created.profileId,kind:'session',
      credentialHash:hashToken(created.token),csrfToken:created.csrfToken,expiresAt:created.expiresAt,
    },ai.model));
  });
  app.use('/api/v1',async(request,response,next)=>{
    request.actor=await authenticate(pool,request);
    if (request.actor.kind==='session') checkOrigin(request);
    else response.setHeader('Access-Control-Allow-Origin','*');
    if (!['GET','HEAD','OPTIONS'].includes(request.method)) checkCsrf(request);
    next();
  });
  app.get('/api/v1/demo/session',async(request,response)=>{
    response.json(await sessionView(pool,userSession(request),ai.model));
  });
  app.post('/api/v1/demo/identity',async(request,response)=>{
    const current=userSession(request);
    const {profileId}=z.object({profileId:z.string().uuid()}).strict().parse(request.body);
    const updated=await pool.query(`UPDATE sessions SET profile_id=$1 WHERE token_hash=$2 AND world_id=$3
      AND EXISTS(SELECT 1 FROM profiles WHERE id=$1 AND world_id=$3 AND fictional) RETURNING profile_id`,
    [profileId,current.credentialHash,current.worldId]);
    if (!updated.rowCount) throw new ApiError(404,'PROFILE_NOT_FOUND','Choose a fictional identity from this demo, not another session.');
    response.json(await sessionView(pool,{...current,profileId},ai.model));
  });
  app.get('/api/v1/me',async(request,response)=>{
    const current=actor(request);
    const profile=(await getProfiles(pool,current.worldId)).find((p)=>p.id===current.profileId);
    if (!profile) throw new ApiError(404,'PROFILE_NOT_FOUND','This identity is no longer available.');
    response.json(profile);
  });
  app.patch('/api/v1/me/consent',async(request,response)=>{
    const current=userSession(request);
    const input=z.object({discoverable:z.boolean(),introductionsAllowed:z.boolean()}).strict().parse(request.body);
    await setConsent(pool,current,input);
    response.json(await sessionView(pool,current,ai.model));
  });
  app.get('/api/v1/cafes',async(_request,response)=>response.json({cafes:await getCafes(pool)}));
  app.post('/api/v1/intents',async(request,response)=>{
    const current=actor(request);
    const input=parseRequestSchema.parse(request.body);
    await limitRequests(pool,'gemini-intent',current.profileId,40);
    response.status(201).json(await parseIntent(pool,ai,current,input));
  });
  app.post('/api/v1/discoveries',async(request,response)=>{
    const current=actor(request);
    const input=discoveryRequestSchema.parse(request.body);
    await limitRequests(pool,'gemini-discovery',current.profileId,40);
    response.status(201).json(await discover(pool,ai,current,input.intentId,input.goal));
  });
  app.get('/api/v1/discoveries',async(request,response)=>{
    const current=actor(request);
    const result=await pool.query<{result:DiscoveryView}>('SELECT result FROM discoveries WHERE world_id=$1 AND profile_id=$2 ORDER BY created_at DESC LIMIT 20',[current.worldId,current.profileId]);
    response.json({discoveries:result.rows.map((row)=>row.result)});
  });
  app.get('/api/v1/introductions',async(request,response)=>{
    response.json({requests:await listIntroductions(pool,actor(request))});
  });
  app.post('/api/v1/introductions',async(request,response)=>{
    const current=actor(request);
    const input=introductionSchema.parse(request.body);
    await limitRequests(pool,'introductions',current.profileId,30);
    response.status(201).json(await sendIntroduction(pool,current,input));
  });
  app.post('/api/v1/introductions/:id/respond',async(request,response)=>{
    const id=z.string().uuid().parse(request.params.id);
    const {action}=responseSchema.parse(request.body);
    response.json(await respondToIntroduction(pool,actor(request),id,action));
  });
  app.get('/api/v1/connections',async(request,response)=>{
    const requests=await listIntroductions(pool,actor(request));
    response.json({connections:requests.filter((r)=>r.status==='accepted')});
  });
  app.post('/api/v1/assistant-tokens',async(request,response)=>{
    const current=userSession(request);
    const {label}=z.object({label:z.string().trim().min(1).max(60)}).strict().parse(request.body);
    await limitRequests(pool,'token-creation',current.profileId,10);
    response.status(201).json(await createAssistantToken(pool,current,label));
  });
  app.delete('/api/v1/assistant-tokens/:id',async(request,response)=>{
    const current=userSession(request);
    const id=z.string().uuid().parse(request.params.id);
    const result=await pool.query('UPDATE assistant_tokens SET revoked_at=now() WHERE id=$1 AND world_id=$2 AND profile_id=$3 RETURNING id',[id,current.worldId,current.profileId]);
    if (!result.rowCount) throw new ApiError(404,'TOKEN_NOT_FOUND','That token does not belong to this identity.');
    response.sendStatus(204);
  });
  app.use('/api',()=>{throw new ApiError(404,'ENDPOINT_NOT_FOUND','This API endpoint does not exist. See /openapi.json.');});
  if (options.serveClient!==false) {
    const clientRoot=resolve('dist','client');
    app.use(express.static(clientRoot,{index:false,maxAge:options.production?'1h':0}));
    app.get('/{*path}',(_request,response)=>{
      if (!existsSync(resolve(clientRoot,'index.html'))) throw new ApiError(503,'CLIENT_NOT_BUILT','Run npm run build to create the web application.');
      response.setHeader('Cache-Control','no-cache');
      response.sendFile(resolve(clientRoot,'index.html'));
    });
  }
  app.use((error:unknown,request:Request,response:Response,_next:NextFunction)=>{
    if (response.headersSent) return _next(error);
    const code=errorCode(error);
    const failure=error instanceof ApiError?error:
      error instanceof z.ZodError?new ApiError(422,'INVALID_INPUT',error.issues[0]?.message || 'Check the request fields.'):
      error instanceof SyntaxError?new ApiError(400,'INVALID_JSON','Send a valid JSON request.'):
      new ApiError(500,'INTERNAL_ERROR','This request could not be completed. Please try again; no unconfirmed connection was made.');
    console.error(JSON.stringify({event:'request_failed',requestId:request.requestId,code,status:failure.status}));
    response.status(failure.status).json({error:{code:failure.code,message:failure.message,requestId:request.requestId}});
  });
  return app;
}

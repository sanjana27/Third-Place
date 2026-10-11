const json = (schema: object) => ({ 'application/json': { schema } });
const response = { description: 'Validated JSON response. All profiles and schedules in this deployment are fictional demo records.' };
const error = { description: 'Explicit API error', content: json({ type:'object',properties:{error:{type:'object',properties:{code:{type:'string'},message:{type:'string'},requestId:{type:'string'}}}} }) };
const uuid = { type:'string',format:'uuid' };
const location = {
  type:'object',
  description:'Supply exactly one cafeId or user-provided coarseLocation. No GPS or precise location is collected.',
  properties:{ cafeId:uuid,coarseLocation:{type:'string',minLength:2,maxLength:100} },
  oneOf:[{required:['cafeId']},{required:['coarseLocation']}],
  additionalProperties:false,
};
const goal = { type:'string',enum:['exchange_ideas','make_friends','collaborate','shared_activity'] };
function post(operationId:string,summary:string,schema:object) {
  return { operationId,summary,security:[{userToken:[]}],requestBody:{required:true,content:json(schema)},
    responses:{'200':response,'201':response,'401':error,'403':error,'409':error,'422':error,'429':error,'503':error} };
}
export const openapi = {
  openapi:'3.1.0',
  info:{
    title:'Third Place — assistant-facing discovery API',version:'0.1.0',
    description:'Assistant-agnostic, consent-based connection infrastructure. This deployment is a fictional demo. A user must explicitly mint a token in the web demo. Tokens are bound to that identity and world; clients cannot choose an actor id. Understand intent, confirm it with the user, discover eligible records, then request an introduction only with user approval. The recipient separately accepts or declines. No official messaging-provider integration is implied.',
  },
  servers:[{url:'/'}],
  components:{securitySchemes:{userToken:{type:'http',scheme:'bearer',description:'Short-lived, revocable token minted by the demo user. Never embed a token in a public client bundle or URL.'}}},
  security:[{userToken:[]}],
  paths:{
    '/api/v1/me':{get:{operationId:'getCurrentIdentity',summary:'Read the identity bound to the token',responses:{'200':response,'401':error}}},
    '/api/v1/cafes':{get:{operationId:'listParticipatingCafes',summary:'List fictional participating cafes',responses:{'200':response,'401':error}}},
    '/api/v1/intents':{post:post('interpretConnectionIntent','Parse a natural-language request with Gemini',{
      type:'object',required:['message','location','timeZone'],additionalProperties:false,
      properties:{message:{type:'string',minLength:8,maxLength:600},location,timeZone:{type:'string',example:'Asia/Kolkata'},goal},
    })},
    '/api/v1/discoveries':{
      post:post('discoverConnections','After user confirmation, match opted-in SQL records and explain them with Gemini',{
        type:'object',required:['intentId','goal'],additionalProperties:false,properties:{intentId:uuid,goal},
      }),
      get:{operationId:'listDiscoveries',summary:'Read this identity’s persisted discovery history',responses:{'200':response,'401':error}},
    },
    '/api/v1/introductions':{
      post:post('requestIntroduction','Send an introduction only after the user explicitly asks',{
        type:'object',required:['discoveryId','matchId','message'],additionalProperties:false,
        properties:{discoveryId:uuid,matchId:uuid,message:{type:'string',minLength:1,maxLength:400}},
      }),
      get:{operationId:'listIntroductions',summary:'Read only this identity’s received and sent requests',responses:{'200':response,'401':error}},
    },
    '/api/v1/introductions/{id}/respond':{
      parameters:[{in:'path',name:'id',required:true,schema:uuid}],
      post:post('respondToIntroduction','Recipient accepts/declines; sender may cancel a pending request',{
        type:'object',required:['action'],additionalProperties:false,properties:{action:{type:'string',enum:['accept','decline','cancel']}},
      }),
    },
    '/api/v1/connections':{get:{operationId:'listConnections',summary:'Read persisted, mutually accepted connections',responses:{'200':response,'401':error}}},
  },
};

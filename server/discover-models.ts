import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

const project = process.env.GOOGLE_CLOUD_PROJECT;
const location = process.env.GOOGLE_CLOUD_LOCATION;
if (!project || !location) throw new Error('Set GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION before discovering models.');
const ai = new GoogleGenAI({ enterprise: true, project, location });
const pager = await ai.models.list({ config: { pageSize: 100, queryBase: true } });
let found = 0;
for await (const model of pager) {
  if (model.name?.includes('gemini') && !/image|embedding|live|tts|vision/i.test(model.name)) {
    console.log(JSON.stringify({ name: model.name, displayName: model.displayName, supportedActions: model.supportedActions }));
    found++;
  }
  if (found >= 40) break;
}
if (found === 0) throw new Error('No Gemini text models were returned for the authenticated project/location. Check API enablement and model-list permissions.');

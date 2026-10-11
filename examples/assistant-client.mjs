const base = process.env.THIRD_PLACE_URL;
const token = process.env.THIRD_PLACE_TOKEN;
const cafeId = process.env.THIRD_PLACE_CAFE_ID;
if (!base || !token || !cafeId) {
  throw new Error('Set THIRD_PLACE_URL, THIRD_PLACE_TOKEN, and THIRD_PLACE_CAFE_ID. Mint a user-scoped fictional-demo token in the web interface.');
}
async function call(path, body) {
  const response = await fetch(new URL(path, base), {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${data.error?.message || 'Third Place API request failed'}`);
  return data;
}
const message = process.argv.slice(2).join(' ') || 'Anyone nearby interested in AI startups over coffee?';
const interpreted = await call('/api/v1/intents', {
  message, location: { cafeId }, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
});
console.log('Interpreted intent (confirm this with the user before discovering):');
console.log(JSON.stringify(interpreted, null, 2));
if (process.env.THIRD_PLACE_CONFIRM_INTENT === 'true') {
  const discovery = await call('/api/v1/discoveries', { intentId: interpreted.id, goal: interpreted.intent.goal });
  console.log(JSON.stringify(discovery, null, 2));
}
// Sending an introduction is deliberately a separate, explicitly user-approved API action.

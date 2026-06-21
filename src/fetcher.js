const fetch = require('node-fetch');

const API_URL = 'https://hagizra.news/api/v2/messages?offset=0&limit=50&direction=desc';

async function tryFetchOnce(){
  const res = await fetch(API_URL, { timeout: 10000 });
  if (!res.ok) throw new Error('Fetch failed: ' + res.status);
  const json = await res.json();
  return json.messages || [];
}

async function fetchMessages(options) {
  const retries = (options && options.retries) || 2;
  let attempt = 0;
  let lastErr;
  while(attempt <= retries){
    try{
      return await tryFetchOnce();
    }catch(e){
      lastErr = e;
      attempt++;
      const backoff = 200 * attempt;
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

module.exports = { fetchMessages };

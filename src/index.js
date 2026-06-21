require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { fetchMessages } = require('./fetcher');
const { sendMessages } = require('./mailer');
const { downloadAllMedia, cleanupTempFiles } = require('./media');

const DATA_FILE = path.resolve(__dirname, '..', 'data', 'last_id.json');
const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

function readLastId(){
  try{
    const txt = fs.readFileSync(DATA_FILE, 'utf8');
    const j = JSON.parse(txt);
    return Number(j.lastId || 0);
  }catch(e){
    return 0;
  }
}

function writeLastId(id){
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify({ lastId: id }, null, 2));
}

async function job(){
  const timeStr = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`⏰ [${timeStr}] Starting poll...`);
  console.log(`${'═'.repeat(50)}`);

  const lastId = readLastId();
  console.log(`📌 Last known ID: ${lastId}`);

  let messages = [];
  try{
    messages = await fetchMessages();
    console.log(`📡 Fetched ${messages.length} messages from API`);
  }catch(e){
    console.error('❌ Fetch error:', e.message);
    return;
  }

  // Filter messages newer than lastId
  const newMsgs = messages.filter(m => Number(m.id) > lastId).reverse(); // oldest-first

  // Also allow time-based fallback: include messages from last 15 minutes
  const now = Date.now();
  const timeBased = messages.filter(m => {
    const t = Date.parse(m.timestamp);
    return !isNaN(t) && (now - t) <= INTERVAL_MS;
  }).reverse();

  // Merge unique by id, keep order
  const map = new Map();
  [...newMsgs, ...timeBased].forEach(m => map.set(Number(m.id), m));
  const toSend = Array.from(map.values());

  if (toSend.length > 0){
    console.log(`📨 ${toSend.length} new messages to process`);
    console.log(`   IDs: ${toSend.map(m => m.id).join(', ')}`);

    // Download media (images as attachments, videos as links)
    let attachments = [];
    let videoLinks = [];
    try {
      console.log(`🖼️  Downloading media...`);
      const media = await downloadAllMedia(toSend);
      attachments = media.attachments;
      videoLinks = media.videoLinks;
    } catch (e) {
      console.error('⚠️ Media download error (continuing without media):', e.message);
    }

    try{
      await sendMessages(process.env, toSend, attachments, videoLinks);
      const maxId = Math.max(...toSend.map(m => Number(m.id)));
      writeLastId(maxId);
      console.log(`💾 Updated lastId → ${maxId}`);
    }catch(e){
      console.error('❌ Mail error:', e && e.message || e);
    }

    // Always clean up temp files after sending
    cleanupTempFiles();
  }else{
    console.log('✅ No new messages');
  }

  console.log(`⏳ Next poll in 15 minutes...`);
}

// Startup banner
console.log(`
╔══════════════════════════════════════════════════╗
║       🔔 Hagizra to Mail - Started               ║
║       Polling every 15 minutes                   ║
║       Images: inline attachments                 ║
║       Videos: direct links                       ║
╚══════════════════════════════════════════════════╝
`);

// Decide mode: run once (for CI / GitHub Actions) or run continuously (local server)
const runOnce = process.env.RUN_ONCE === '1' || process.env.GITHUB_ACTIONS === 'true';

if (runOnce) {
  // Run single job and exit (GitHub Actions / scheduled run)
  job()
    .then(() => {
      console.log('✅ Run-once finished, exiting.');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Run-once job failed:', err && err.message || err);
      process.exit(1);
    });
} else {
  // Run immediately, then every 15 minutes (local daemon)
  job();
  setInterval(job, INTERVAL_MS);
}

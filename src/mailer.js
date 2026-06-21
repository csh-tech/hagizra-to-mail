const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const MarkdownIt = require('markdown-it');

function createTransportFromEnv(env) {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 587),
    secure: Number(env.SMTP_PORT || 587) === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS
    }
  });
}

function formatTimestamp(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch (e) {
    return ts;
  }
}

/**
 * Build the HTML email body.
 * @param {Array} messages - array of message objects
 * @param {Array} attachments - downloaded image attachments with cid
 * @param {Array} videoLinks - video URLs (not downloaded)
 */
function buildHtml(messages, attachments, videoLinks) {
  // Build a map: messageId -> [attachments for inline images]
  const attachmentsByMsg = {};
  for (const att of (attachments || [])) {
    if (!attachmentsByMsg[att.messageId]) attachmentsByMsg[att.messageId] = [];
    attachmentsByMsg[att.messageId].push(att);
  }

  // Build a map: messageId -> [video links]
  const videosByMsg = {};
  for (const vid of (videoLinks || [])) {
    if (!videosByMsg[vid.messageId]) videosByMsg[vid.messageId] = [];
    videosByMsg[vid.messageId].push(vid);
  }

  const md = new MarkdownIt({ html: true, linkify: true });

  const rows = messages.map(m => {
    const time = formatTimestamp(m.timestamp);
    // Clean specific embedded markers we handle differently; keep other text and allow inline HTML
    let cleanText = (m.text || '')
      .replace(/\[image-embedded#\]\([^)]*\)/g, '')
      .replace(/\[video-embedded#\]\([^)]*\)/g, '')
      .replace(/\[quote-embedded#\]\([^)]*\)/g, '')
      .replace(/\[file-embedded#\]\([^)]*\)/g, '')
      .trim();

    // Handle audio embeds: [audio-embedded#](https://...file.mp3) -> render a play button / audio tag
    // We'll replace with an inline HTML block that markdown-it will pass through (html: true)
    cleanText = cleanText.replace(/\[audio-embedded#\]\(([^)]+)\)/g, (m, url) => {
      const safeUrl = escapeHtml(url);
      return `\n\n<div style="margin:8px 0;">\n  <a href="${safeUrl}" style="display:inline-block; padding:8px 14px; background:#e94560; color:#fff; border-radius:6px; text-decoration:none; font-size:13px;">🔊 השמעת אודיו</a>\n  <audio controls style="display:block; margin-top:8px; width:100%; max-width:420px;">\n    <source src="${safeUrl}" type="audio/mpeg">\n    הדפדפן אינו תומך בנגן אודיו\n  </audio>\n</div>\n\n`;
    });

    // Now convert Markdown -> HTML (allow inline HTML like <span> to remain)
    let textHtml = md.render(cleanText);
    const reactions = m.reactions ? Object.entries(m.reactions).map(([emoji, count]) => `${emoji} ${count}`).join('  ') : '';

    // Inline images for this message
    const msgAttachments = attachmentsByMsg[m.id] || [];
    const imagesHtml = msgAttachments.map(att => {
      return `<div style="margin:8px 0;">
        <img src="cid:${att.cid}" alt="${escapeHtml(att.fileName)}" style="max-width:100%; border-radius:8px; border:1px solid #ddd;"/>
      </div>`;
    }).join('\n');

    // Video links for this message
    const msgVideos = videosByMsg[m.id] || [];
    const videosHtml = msgVideos.map(vid => {
      const name = decodeURIComponent(vid.name || 'video');
      return `<div style="margin:8px 0;">
        <a href="${escapeHtml(vid.url)}" style="display:inline-block; padding:8px 16px; background:linear-gradient(135deg, #e94560, #c23152); color:#fff; border-radius:6px; text-decoration:none; font-size:13px;">
          🎬 צפה בסרטון: ${escapeHtml(name)}
        </a>
      </div>`;
    }).join('\n');

    return `
    <tr>
      <td style="padding:12px 16px; border-bottom:1px solid #f0f0f0; vertical-align:top; color:#888; white-space:nowrap; font-size:13px;">
        ${time}
      </td>
      <td style="padding:12px 16px; border-bottom:1px solid #f0f0f0; vertical-align:top; color:#222; font-size:15px; line-height:1.6;">
        ${textHtml}
        ${imagesHtml}
        ${videosHtml}
        ${reactions ? `<div style="margin-top:6px; font-size:12px; color:#888;">${reactions}</div>` : ''}
      </td>
    </tr>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"/></head>
<body style="margin:0; padding:0; background:#f6f7f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; direction: rtl; text-align: right; color:#222;">
    <div style="max-width:700px; margin:0 auto; padding:20px;">
    <div style="background:#fff; border-radius:12px; overflow:hidden; border:1px solid #e6e6e6; box-shadow:0 2px 6px rgba(20,20,20,0.04);">
      <div style="background:linear-gradient(90deg, #e94560, #0f3460); padding:16px 24px;">
        <h1 style="margin:0; color:#fff; font-size:20px; font-weight:600;">🔔 הגיזרה – ${messages.length} הודעות חדשות</h1>
        <p style="margin:4px 0 0 0; color:rgba(255,255,255,0.9); font-size:13px;">${formatTimestamp(new Date().toISOString())}</p>
      </div>
      <table style="width:100%; border-collapse:collapse; direction: rtl; text-align: right; background:transparent;">
        ${rows}
      </table>
      <div style="padding:12px 24px; text-align:center; color:#555; font-size:11px;">
         Hagizra to Mail • Auto-generated every 15 minutes<br>Created by CSH-Tech
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Send messages as email with inline image attachments.
 * @param {Object} env - process.env
 * @param {Array} messages - message objects
 * @param {Array} attachments - downloaded files [{filePath, fileName, contentType, cid, messageId}]
 * @param {Array} videoLinks - video URLs [{url, messageId, name}]
 */
async function sendMessages(env, messages, attachments, videoLinks) {
  if (!messages || messages.length === 0) return;

  attachments = attachments || [];
  videoLinks = videoLinks || [];

  const html = buildHtml(messages, attachments, videoLinks);
  // Build a concise subject that includes a timestamp (or range) so mail clients don't thread
  const timestamps = (messages || []).map(m => {
    try { return new Date(m.timestamp); } catch (e) { return null; }
  }).filter(Boolean).map(d => +d);
  let timeLabel = formatTimestamp(new Date().toISOString());
  if (timestamps.length) {
    const min = new Date(Math.min(...timestamps));
    const max = new Date(Math.max(...timestamps));
    if (min.getTime() !== max.getTime()) {
      // Same date → show date once, then time range
      const dateStr = min.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric' });
      const minTime = min.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });
      const maxTime = max.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });
      if (min.toDateString() === max.toDateString()) {
        timeLabel = `${dateStr} ${minTime}-${maxTime}`;
      } else {
        timeLabel = `${formatTimestamp(min.toISOString())} – ${formatTimestamp(max.toISOString())}`;
      }
    } else {
      timeLabel = formatTimestamp(max.toISOString());
    }
  }
  const subject = `🔔 הגיזרה: ${messages.length} הודעות חדשות — ${timeLabel}`;

  // Basic env validation
  if (!env.SMTP_HOST || !env.MAIL_TO) {
    const out = {
      createdAt: new Date().toISOString(),
      to: env.MAIL_TO || null,
      subject,
      htmlLength: html.length,
      attachmentCount: attachments.length,
      videoLinkCount: videoLinks.length,
      messages
    };
    const fileName = `outbox-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const outDir = path.resolve(__dirname, '..', 'data');
    try {
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, fileName), JSON.stringify(out, null, 2));
      console.log('SMTP not configured or MAIL_TO missing — saved messages to', path.join('data', fileName));
    } catch (e) {
      console.error('Failed to write outbox file', e.message);
    }
    return;
  }

  // Build nodemailer attachments (inline images)
  const mailAttachments = attachments
    .filter(att => att.filePath && fs.existsSync(att.filePath))
    .map(att => ({
      filename: att.fileName,
      path: att.filePath,
      cid: att.cid,
      contentType: att.contentType,
      contentDisposition: 'inline'
    }));

  const transporter = createTransportFromEnv(env);
  try {
    const info = await transporter.sendMail({
      from: env.MAIL_FROM || env.SMTP_USER,
      to: env.MAIL_TO,
      subject,
      html,
      attachments: mailAttachments
    });
    console.log(`✅ Email sent! ${messages.length} messages, ${mailAttachments.length} images, ${videoLinks.length} video links`);
    console.log(`   MessageId: ${info.messageId}`);
    return info;
  } catch (e) {
    console.error('❌ Mail send error:', e && e.message || e);
    const out = {
      error: e && e.message,
      createdAt: new Date().toISOString(),
      to: env.MAIL_TO,
      subject,
      htmlLength: html.length,
      messages
    };
    const fileName = `outbox-failed-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const outDir = path.resolve(__dirname, '..', 'data');
    try {
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, fileName), JSON.stringify(out, null, 2));
      console.log('Saved failed email to', path.join('data', fileName));
    } catch (e2) {
      console.error('Also failed to write outbox file', e2 && e2.message || e2);
    }
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = { sendMessages, __buildHtml: buildHtml };

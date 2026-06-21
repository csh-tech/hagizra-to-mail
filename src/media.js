const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const TEMP_DIR = path.resolve(__dirname, '..', 'data', 'temp_media');
const MAX_FILE_SIZE = 8 * 1024 * 1024;       // 8MB per file
const MAX_TOTAL_SIZE = 20 * 1024 * 1024;      // 20MB total attachments
const DOWNLOAD_TIMEOUT = 30000;               // 30 seconds

// Media URL patterns in hagizra message text
const IMAGE_PATTERN = /\[image-embedded#\]\(([^)#]+)/g;
const VIDEO_PATTERN = /\[video-embedded#\]\(([^)#]+)/g;

/**
 * Extract all media URLs from a message
 */
function extractMediaUrls(message) {
  const media = [];
  const text = message.text || '';

  let match;

  // Images
  const imgRe = new RegExp(IMAGE_PATTERN.source, 'g');
  while ((match = imgRe.exec(text)) !== null) {
    media.push({ url: match[1], type: 'image', messageId: message.id });
  }

  // Videos
  const vidRe = new RegExp(VIDEO_PATTERN.source, 'g');
  while ((match = vidRe.exec(text)) !== null) {
    media.push({ url: match[1], type: 'video', messageId: message.id });
  }

  // file field (if present)
  if (message.file && message.file.url) {
    const ft = (message.file.filetype || '').toLowerCase();
    const type = ft.startsWith('image') ? 'image' :
                 ft.startsWith('video') ? 'video' : 'file';
    media.push({
      url: message.file.url,
      type,
      messageId: message.id,
      originalName: message.file.filename
    });
  }

  return media;
}

/**
 * Download a single file to temp directory.
 * Returns { filePath, fileName, contentType, size } or null on failure.
 */
async function downloadFile(url, index) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      console.log(`  ⚠️ Download failed (${res.status}): ${url}`);
      return null;
    }

    // Check content-length before downloading
    const contentLength = Number(res.headers.get('content-length') || 0);
    if (contentLength > MAX_FILE_SIZE) {
      console.log(`  ⚠️ File too large (${(contentLength / 1024 / 1024).toFixed(1)}MB), skipping: ${url}`);
      return null;
    }

    const contentType = res.headers.get('content-type') || 'application/octet-stream';

    // Determine filename from URL
    const urlPath = new URL(url).pathname;
    const baseName = decodeURIComponent(urlPath.split('/').pop()) || `media_${index}`;
    const fileName = `${index}_${baseName}`;
    const filePath = path.join(TEMP_DIR, fileName);

    const buffer = await res.buffer();

    // Double-check size after download
    if (buffer.length > MAX_FILE_SIZE) {
      console.log(`  ⚠️ File too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB), skipping: ${url}`);
      return null;
    }

    fs.writeFileSync(filePath, buffer);

    return {
      filePath,
      fileName: baseName,
      contentType,
      size: buffer.length,
      url
    };
  } catch (e) {
    if (e.name === 'AbortError') {
      console.log(`  ⚠️ Download timed out: ${url}`);
    } else {
      console.log(`  ⚠️ Download error: ${e.message} — ${url}`);
    }
    return null;
  }
}

/**
 * Download all media for a list of messages.
 * Returns { attachments: [...], videoLinks: [...] }
 * - Images are downloaded as attachments (inline)
 * - Videos are only linked (too large for email)
 */
async function downloadAllMedia(messages) {
  // Ensure temp dir exists
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  const attachments = [];
  const videoLinks = [];
  let totalSize = 0;
  let fileIndex = 0;

  for (const msg of messages) {
    const mediaItems = extractMediaUrls(msg);

    for (const item of mediaItems) {
      // Videos: add as link only (too large for email attachment)
      if (item.type === 'video') {
        videoLinks.push({
          url: item.url,
          messageId: item.messageId,
          name: item.originalName || item.url.split('/').pop()
        });
        console.log(`  🎬 Video link saved (not downloading): ${item.url.split('/').pop()}`);
        continue;
      }

      // Images & files: download
      if (totalSize >= MAX_TOTAL_SIZE) {
        console.log(`  ⚠️ Total attachment size limit reached (${(MAX_TOTAL_SIZE / 1024 / 1024).toFixed(0)}MB), skipping remaining`);
        break;
      }

      fileIndex++;
      const result = await downloadFile(item.url, fileIndex);
      if (result) {
        if (totalSize + result.size > MAX_TOTAL_SIZE) {
          console.log(`  ⚠️ Adding this file would exceed limit, skipping: ${result.fileName}`);
          // Clean up this file
          try { fs.unlinkSync(result.filePath); } catch (e) {}
          continue;
        }
        totalSize += result.size;
        attachments.push({
          ...result,
          messageId: item.messageId,
          cid: `media_${fileIndex}_${item.messageId}` // Content-ID for inline display
        });
        console.log(`  📷 Downloaded: ${result.fileName} (${(result.size / 1024).toFixed(0)}KB)`);
      }
    }
  }

  console.log(`  📊 Total: ${attachments.length} attachments (${(totalSize / 1024).toFixed(0)}KB), ${videoLinks.length} video links`);

  return { attachments, videoLinks };
}

/**
 * Clean up all downloaded temp files
 */
function cleanupTempFiles() {
  try {
    if (fs.existsSync(TEMP_DIR)) {
      const files = fs.readdirSync(TEMP_DIR);
      for (const f of files) {
        fs.unlinkSync(path.join(TEMP_DIR, f));
      }
      fs.rmdirSync(TEMP_DIR);
      if (files.length > 0) {
        console.log(`🧹 Cleaned up ${files.length} temp files`);
      }
    }
  } catch (e) {
    console.error('⚠️ Cleanup error:', e.message);
  }
}

module.exports = { extractMediaUrls, downloadAllMedia, cleanupTempFiles };

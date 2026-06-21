const { spawnSync } = require('child_process');
const path = require('path');
const mailer = require('../src/mailer');

const sample = [{
  id: 'm1',
  timestamp: Date.now(),
  text: "**סערת הסרטון |** הנשיא טראמפ ביקש ...\nשורה שניה",
  reactions: { '👍': 1, '😂': 2 }
}];

const html = mailer.sendMessages ? (() => {
  // sendMessages expects env and will try to send; instead call internal builder by requiring file directly
  const build = require('../src/mailer').__buildHtml;
  if (!build) {
    console.error('No buildHtml export available.');
    process.exit(1);
  }
  return build(sample, [], []);
})() : null;

console.log(html);

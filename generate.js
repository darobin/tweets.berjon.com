
import { join } from 'node:path';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';

const srcDir = '/Users/robin/Data/twitter-2024-11-14';
const outDir = rel('site');
const mediaDir = join(outDir, 'media');
const threads = [
  '1212591424002306048',
  '1348485686731616260',
  '1477498379047473153',
  '1611798722215657472',
];

// profile
const name = 'Robin Berjon';
const user = 'robinberjon';
const account = await loadData('account');
const profile = await loadData('profile');
const accountID = account.accountId;
const avatarSrc = join(srcDir, 'profile_media', `${accountID}-${profile.avatarMediaUrl.replace(/,*\//, '')}`);
await mkdir(mediaDir, { recursive: true });
await cp(avatarSrc, join(mediaDir, 'avatar.jpg'), { force: true });
const avatarURL = '/media/avatar.jpg';

const tweets = await loadData('tweets');
const tweetMap = {};
const replyMap = {};

tweets.forEach(t => {
  tweetMap[t.id_str] = t;
  if (t.in_reply_to_status_id_str) {
    const id = t.in_reply_to_status_id_str;
    if (!replyMap[id]) replyMap[id] = [];
    replyMap[id].push(t.id_str);
  }
});
console.warn(`TWMP: ${Object.keys(tweetMap).length}`);
console.warn(`RPMP: ${Object.keys(replyMap).length}`);

const threadMessages = {};
threads.forEach(id => {
  threadMessages[id] = [];
  const stack = [id];
  while (stack.length) {
    const top = stack.shift();
    threadMessages[id].push(top);
    if (replyMap[top]) stack.push(...replyMap[top]);
  }
});

// redirect pages

// XXX
// - for each ID, if it's not the top generate a page that just redirects to the top+#tweet-id
// - generate the big thread for each
// - include images, copy them over
// - process entities for links, hashtags, mentions
// - sometimes images are mp4s (have to check the extension), that's for gifs (poster is given, don't autoplay)


async function loadData (key) {
  return JSON.parse(
      (await readFile(join(srcDir, `data/${key}.js`), 'utf8')).replace(`window.YTD.${key}.part0 = `, '')
    )
    .map(t => t[key])
  ;
}

function rel (pth) {
  return new URL(pth, import.meta.url).toString().replace(/^file:\/\//, '');
}

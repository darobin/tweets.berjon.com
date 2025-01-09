
import { join } from 'node:path';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import redirect from './templates/redirect.js';
import post from './templates/post.js';
import threadPage from './templates/thread-page.js';

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
const account = (await loadData('account'))[0];
const profile = (await loadData('profile'))[0];
const accountID = account.accountId;
const avatarSrc = join(srcDir, 'data/profile_media', `${accountID}-${profile.avatarMediaUrl.replace(/.*\//, '')}`);
await mkdir(mediaDir, { recursive: true });
await cp(avatarSrc, join(mediaDir, 'avatar.jpg'), { force: true });
const avatarURL = '/media/avatar.jpg';

const tweets = await loadData('tweets', 'tweet');
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

for (const top of Object.keys(threadMessages)) {
  const submessages = threadMessages[top];
  // redirect pages
  for (const id of submessages) {
    if (id === top) continue;
    const page = redirect({ top, id });
    await writeFile(join(outDir, `${id}.html`), page, 'utf8');
  }

  // generate the big thread
  const content = submessages
    .map(id => {
      return post({
        id,
        avatarURL,
        date: tweetMap[id].created_at,
      });
    })
    .join('\n')
  ;
  const page = threadPage({
    title: `Thread for ${top}`,
    content,
  });
  await writeFile(join(outDir, `${top}.html`), page, 'utf8');
}

// XXX
// - generate the big thread for each
// - include images, copy them over
// - process entities for links, hashtags, mentions
// - sometimes images are mp4s (have to check the extension), that's for gifs (poster is given, don't autoplay)


async function loadData (key, dataKey) {
  if (!dataKey) dataKey = key;
  return JSON.parse(
      (await readFile(join(srcDir, `data/${key}.js`), 'utf8')).replace(`window.YTD.${key}.part0 = `, '')
    )
    .map(t => t[dataKey])
  ;
}

function rel (pth) {
  return new URL(pth, import.meta.url).toString().replace(/^file:\/\//, '');
}


export default function ({ top, id }) {
  const link = `${top}.html#tweet-${id}`;
  return `<!doctype html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="0; url=${link}">
    <title>Redirecting to ${top}…</title>
  </head>
  <body>
    If you aren't redirected, click <a href="${link}">here</a>.
  </body>
</html>
`;
}

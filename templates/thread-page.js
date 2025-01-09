
export default function ({ title, content }) {
  return `<!doctype html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>${title}</title>
    <link rel="stylesheet" href="/css/tweets.css">
  </head>
  <body>
    <header>
      tk
    </header>
    <main>
      ${content}
    </main>
  </body>
</html>
`;
}

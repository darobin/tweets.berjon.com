
export default function ({ title, content }) {
  return `<!doctype html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>${title}</title>
    <link rel="stylesheet" href="/css/tweets.css">
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%220.9em%22 font-size=%22105%22>🦤</text></svg>">
  </head>
  <body>
    <header>
      <h1>Robin Berjon</h1>
      <p>tweets archive</p>
    </header>
    <main>
      ${content}
    </main>
  </body>
</html>
`;
}

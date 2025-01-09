
export default function ({ id, avatarURL, date }) {
  return `<section id="tweet-${id}">
  <div class="avatar">
    <a href="https://robin.berjon.com/"><img src="${avatarURL}" alt="Robin Berjon"></a>
  </div>
  <div class="post">
    <div class="meta">
      <a href="https://berjon.com/">Robin Berjon</a>
      <a href="https://robin.berjon.com/">@robinberjon</a>
      ·
      <a href="#tweet-${id}"><time>${date}</time></a>
    </div>

  </div>
</section>
`;
}

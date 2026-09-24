# Caddy file_server for tweets.berjon.com. Unlike sm's default static
# template this does NOT bake the site into the image: the site (200MB+ of
# it media) is rsynced into the service's data volume (/data) by
# `npm run publish:site`. `sm deploy` is only needed when this Dockerfile or
# the Caddyfile change.
FROM caddy:2.11.2-alpine
COPY Caddyfile /etc/caddy/Caddyfile

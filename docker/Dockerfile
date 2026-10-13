FROM nginx:1.27-alpine

# Demo estática: HTML + CSS + JS vanilla, sin paso de build.
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html styles.css *.js /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

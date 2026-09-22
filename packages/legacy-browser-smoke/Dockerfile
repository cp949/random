# floor 빌드 Chromium을 정적 서버 + headless로 구동하는 smoke 이미지.
# 버전·revision·sha256 값은 이미지에 리터럴로 적지 않는다 — baseline.json이 출처이고
# runner가 --build-arg로만 넘긴다(scripts/check-baseline.mjs가 리터럴 부재를 검사한다).
FROM node:24-bullseye-slim

ARG CHROMIUM_PLATFORM
ARG CHROMIUM_REVISION
ARG CHROMIUM_SHA256
RUN test -n "$CHROMIUM_PLATFORM" && test -n "$CHROMIUM_REVISION" && test -n "$CHROMIUM_SHA256"

# deb.debian.org의 bullseye-security pool은 Packages 색인과 실제 파일이 어긋나 있어(파일이
# 404, 함정: TRP-006 후보) 이미지가 미리 담아 둔 snapshot.debian.org 고정 라인을 쓴다. 색인·pool이
# 같은 스냅샷에서 나와 항상 일치한다(geul docker/chrome83/Dockerfile과 같은 기법).
RUN sed -i \
    -e 's|^deb http://deb.debian.org|# deb http://deb.debian.org|' \
    -e 's|^# deb http://snapshot.debian.org|deb http://snapshot.debian.org|' \
    /etc/apt/sources.list \
    && echo 'Acquire::Check-Valid-Until "false";' > /etc/apt/apt.conf.d/99snapshot

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    unzip \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    libgtk-3-0 \
    libxss1 \
    libx11-xcb1 \
    libxtst6 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL -o /tmp/chrome-linux.zip \
    "https://commondatastorage.googleapis.com/chromium-browser-snapshots/${CHROMIUM_PLATFORM}/${CHROMIUM_REVISION}/chrome-linux.zip" \
    && echo "${CHROMIUM_SHA256}  /tmp/chrome-linux.zip" | sha256sum -c - \
    && unzip -q /tmp/chrome-linux.zip -d /opt/chromium \
    && rm /tmp/chrome-linux.zip

ENV SMOKE_CHROME=/opt/chromium/chrome-linux/chrome

COPY src/serve.mjs src/container-entry.mjs src/chrome-flags.mjs src/spawn-async.mjs /smoke/src/

ENTRYPOINT ["node", "/smoke/src/container-entry.mjs"]

# syntax=docker/dockerfile:1

# 빌드 단계
#
# 락파일이 바뀌지 않으면 의존성 설치 레이어를 재사용하도록 소스보다 먼저 복사합니다.
FROM node:22-alpine AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

# 동일 origin 배포이므로 백엔드 주소를 비웁니다. Nginx 가 /api 와 /ws 를
# 백엔드로 넘기므로 브라우저는 상대 경로로 요청합니다.
ENV VITE_API_BASE_URL=""
ENV VITE_PUBLIC_PATH=""

RUN pnpm run build

# 실행 단계
FROM nginx:1.27-alpine AS runtime

# 프록시 대상입니다. 컨테이너 기동 시 nginx.conf.template 에 치환됩니다.
ENV BACKEND_UPSTREAM="http://mopl-app:8080"

# 이미지의 기본 server 블록을 지우고 우리 템플릿만 남깁니다.
RUN rm /etc/nginx/conf.d/default.conf

# /etc/nginx/templates 의 *.template 은 nginx 공식 이미지의 entrypoint 가
# envsubst 로 치환해 /etc/nginx/conf.d 에 배치합니다.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

# localhost 는 컨테이너에서 IPv6 ::1 로 먼저 해석되는데 listen 8080 은 IPv4 만
# 바인딩하므로 연결이 거부됩니다. 주소를 직접 지정합니다.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/health || exit 1

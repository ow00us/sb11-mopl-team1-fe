# MOPL 프론트엔드 이미지 실행

이 문서는 프론트엔드 정적 파일과 백엔드 프록시를 한 컨테이너에서 제공하는 이미지를 빌드하고 실행하는 데 필요한 계약을 정리합니다. 이미지 게시와 실제 배포 자동화는 별도 작업에서 다룹니다.

## 동일 origin 구성

Nginx가 정적 파일을 제공하고 `/api`, `/oauth2`, `/ws`를 백엔드로 넘깁니다. 브라우저 입장에서 프론트엔드와 API가 같은 origin이므로 다음이 성립합니다.

- CORS preflight가 발생하지 않습니다.
- 백엔드가 내려주는 `XSRF-TOKEN` 쿠키를 프론트엔드 JavaScript가 읽을 수 있습니다. 다른 호스트에 두면 host-only 쿠키라 `document.cookie`로 접근할 수 없습니다.

이미지는 `VITE_API_BASE_URL`을 빈 값으로 빌드하므로 브라우저는 상대 경로로 요청합니다.

## 이미지 빌드

```bash
docker build --pull -t mopl-fe:local .
```

Dockerfile은 Vite 빌드 단계와 Nginx 실행 단계를 분리합니다. 실행 이미지에는 `dist` 산출물과 Nginx 설정만 포함됩니다.

## 환경 변수

| 변수 | 설명 |
| --- | --- |
| `BACKEND_UPSTREAM` | 프록시 대상 백엔드 주소. 기본값 `http://mopl-app:8080` |
| `NGINX_RESOLVER` | 백엔드 주소를 다시 조회할 DNS 서버. 기본값 `127.0.0.11` |

컨테이너 기동 시 Nginx 공식 이미지의 entrypoint가 `nginx.conf.template`의 `${BACKEND_UPSTREAM}`과 `${NGINX_RESOLVER}`를 치환합니다.

`BACKEND_UPSTREAM`은 **끝에 `/`를 두지 않습니다.** 설정이 원본 URI를 직접 이어 붙이므로 슬래시가 겹칩니다.

### 백엔드 주소 재조회

`proxy_pass`에 호스트명을 직접 쓰면 Nginx는 기동 시점에 한 번만 DNS를 조회하고 그 주소를 계속 사용합니다. 백엔드 컨테이너나 ECS task를 새로 만들면 주소가 바뀌는데 Nginx는 옛 주소로 보내 `502`가 이어집니다.

그래서 `resolver`와 변수 형태의 `proxy_pass`를 함께 사용해 요청 시점에 다시 조회합니다. `valid=10s`로 짧게 캐시해 매 요청마다 조회하지는 않습니다.

`NGINX_RESOLVER` 기본값은 Docker 내장 DNS인 `127.0.0.11`입니다. ECS에서는 해당 VPC의 resolver 주소를 지정합니다.

빌드 시점 값인 `VITE_API_BASE_URL`과 `VITE_PUBLIC_PATH`는 Dockerfile에서 빈 값으로 고정합니다. 동일 origin 배포가 아닌 구성이 필요하면 별도 이슈에서 다룹니다.

## 실행 예시

백엔드가 같은 Docker 네트워크에서 `mopl-app`이라는 이름으로 실행 중인 경우 다음과 같이 기동할 수 있습니다.

```bash
docker run --rm \
  --network <docker-network> \
  -p 8080:8080 \
  -e BACKEND_UPSTREAM=http://mopl-app:8080 \
  mopl-fe:local
```

백엔드의 `CORS_ALLOWED_ORIGINS`와 `WS_ALLOWED_ORIGINS`에는 이 컨테이너를 노출하는 origin을 지정합니다. 위 예시라면 `http://localhost:8080`입니다.

## 확인

```bash
curl --fail http://localhost:8080/health
```

`ok`를 반환하며 Docker 컨테이너 상태도 `healthy`로 전환되어야 합니다. 이 경로는 백엔드에 의존하지 않으므로 백엔드가 없어도 응답합니다.

백엔드까지 연결한 뒤에는 다음 흐름이 성공해야 합니다.

```bash
curl -c cookie.txt -o /dev/null -w '%{http_code}\n' \
  http://localhost:8080/api/auth/csrf-token
```

`204`와 함께 `XSRF-TOKEN` 쿠키가 설정되고, 이어지는 회원가입과 로그인이 각각 `201`, `200`을 반환합니다. SockJS handshake는 `GET /ws/info`가 `200`과 `"websocket":true`를, WebSocket transport 요청이 `101 Switching Protocols`를 반환합니다.

## 캐시 정책

| 경로 | 정책 | 이유 |
| --- | --- | --- |
| `/assets/*` | `max-age=31536000, immutable` | 내용이 바뀌면 파일명 해시가 바뀝니다 |
| `/index.html` | `no-cache` | 캐시하면 새 배포 후에도 옛 자산 해시를 참조합니다 |

## SPA 라우팅

존재하지 않는 경로는 `index.html`로 넘겨 새로고침과 직접 진입이 동작합니다. 다만 `/assets/` 아래는 fallback하지 않고 `404`를 반환하므로, 자산 경로 오류가 HTML 응답으로 가려지지 않습니다.

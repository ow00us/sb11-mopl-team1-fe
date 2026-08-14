/**
 * 백엔드 계약(YAML)을 api.json 으로 변환합니다.
 *
 * api.json 은 타입 생성과 계약 대조의 입력입니다. 손으로 갱신하면 백엔드가
 * 계약을 바꿔도 이 저장소는 옛 스냅샷을 그대로 들고 있게 되고, 그 어긋남은
 * check:contract 가 실패할 때까지 드러나지 않습니다.
 *
 * 사용:
 *   node scripts/generate-api-json.js <mopl-api.yaml 경로>
 *   pnpm generate:api-json ../sb11-mopl-team1/openapi/mopl-api.yaml
 *
 * 변환 후에는 타입도 함께 다시 만듭니다.
 *   pnpm generate:api-types
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'api.json');

const source = process.argv[2];

if (!source) {
  console.error('계약 파일 경로가 필요합니다.');
  console.error('예: node scripts/generate-api-json.js ../sb11-mopl-team1/openapi/mopl-api.yaml');
  process.exit(1);
}

if (!fs.existsSync(source)) {
  console.error(`계약 파일을 찾을 수 없습니다: ${source}`);
  process.exit(1);
}

const document = load(fs.readFileSync(source, 'utf8'));

if (!document?.paths || !document?.components?.schemas) {
  console.error('OpenAPI 문서로 보이지 않습니다. paths 와 components.schemas 가 필요합니다.');
  process.exit(1);
}

fs.writeFileSync(OUTPUT, `${JSON.stringify(document, null, 2)}\n`);

console.log(`api.json 생성 완료 — 경로 ${Object.keys(document.paths).length}건, 스키마 ${Object.keys(document.components.schemas).length}건`);
console.log('타입도 함께 갱신하세요: pnpm generate:api-types');

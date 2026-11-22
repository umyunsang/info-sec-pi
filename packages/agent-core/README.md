# @info-sec-pi/agent-core

`info-sec-pi`의 에이전트 코어입니다. `src/`에 모델 스트리밍, 도구 실행, 턴 전환, 취소와 이벤트 발행 코드가 있습니다. 모델 공급자 어댑터와 스키마 검증기는 Pi AI와 Pi Schema 1.6.0을 사용합니다.

## 빌드와 패키징

Node.js 22.19 이상이 필요합니다.

```sh
npm ci
npm test
npm pack
```

패키지 이름은 `@info-sec-pi/agent-core`입니다. 진입점은 `Agent`, 저수준 에이전트 루프, 스트리밍 함수와 TypeScript 타입을 내보냅니다. `Agent`에 모델과 `streamFn`을 제공해 실행합니다.

## 연구 기준

코어 소스는 공식 `@earendil-works/pi-agent-core@1.6.0`의 공개 npm 패키지에 포함된 TypeScript 원본을 사용합니다. MIT 라이선스와 기존 저작권 고지는 `LICENSE`에 있습니다. [Pi 1.6.0 릴리스](https://github.com/earendil-works/pi/releases/tag/v1.6.0) · [코어 원본](https://github.com/earendil-works/pi/tree/faac585884ae2c013a6b1400f3e9e77f10b34bac/packages/agent)

첫 버전은 후속 연구의 기준으로 원본 코어의 동작을 보존합니다. 테스트는 동일한 로컬 공급자와 도구를 각 코어에 주고 모델 호출 횟수, 도구 결과, 최종 응답과 이벤트 순서를 비교합니다.

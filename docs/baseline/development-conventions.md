# AIO-ICPT 개발 컨벤션 기준 문서

이 문서는 AIO-ICPT의 개발 운영 규칙을 정의한다. 기준 문서는 코드보다 먼저 확인해야 하며, 구현 완료 후 변경된 사실은 문서에 동기화해야 한다.

## 1. 문서 우선 개발 흐름

공식 개발 루프:

```text
1. 기준 문서 확인
2. GitHub Issue 선택 또는 작성
3. 실패하는 테스트 작성
4. 최소 구현
5. 테스트와 빌드 검증
6. 기준 문서 동기화
7. ADR 또는 학습노트 필요 여부 판단
```

Phase 진행 원칙:

- 구현은 반드시 Phase 단위로 진행한다.
- Phase 시작 전에는 구현 대상의 핵심 개념과 주요 장단점을 먼저 설명한다.
- 구현 중 컨벤션과 충돌하는 예외가 있으면 이유를 먼저 설명하고 진행한다.
- 자동 커밋하지 않는다.

각 문서의 역할:

- `feature-definition.md`: 무엇을 만들 제품인가.
- `system-architecture.md`: 어떤 구조와 흐름으로 만들 것인가.
- `data-model.md`: 무엇을 어떻게 저장할 것인가.
- `development-conventions.md`: 어떤 규칙으로 개발할 것인가.
- `docs/adr/`: 왜 그렇게 결정했는가.
- `docs/learning-notes/`: 무엇을 배웠고 어떻게 설명할 수 있는가.

문서와 코드가 충돌하면, 먼저 어떤 것이 기준이어야 하는지 판단한다. 기능 범위나 구조가 바뀐 것이라면 문서를 갱신한다. 코드가 기준을 어긴 것이라면 코드를 수정한다.

## 2. GitHub Issues 운영 규칙

GitHub Issues는 실행 관리 도구이다. 기준 문서를 대체하지 않는다.

규칙:

- Milestone은 Phase와 1:1로 맞춘다.
- Issue는 기준 문서의 기능 또는 작업 단위를 참조한다.
- Issue는 하나의 검증 가능한 결과를 가져야 한다.
- PR이 생기면 관련 Issue를 연결한다.
- 완료 전 문서 동기화 여부를 확인한다.

권장 Label:

- `phase:1`, `phase:2`, ...
- `type:feature`
- `type:bug`
- `type:docs`
- `type:test`
- `area:renderer`
- `area:core`
- `area:protocol`
- `area:db`
- `area:ipc`

권장 Issue 본문:

```md
## 기준 문서
- docs/baseline/feature-definition.md#...
- docs/baseline/system-architecture.md#...

## 목표

## 완료 기준
- [ ] ...

## 테스트 계획
- [ ] npm test
- [ ] npm run build, UI/Electron/build 설정 변경 시

## 문서 동기화
- [ ] 기준 문서 갱신 또는 변경 없음 확인
- [ ] ADR 필요 여부 확인
- [ ] 학습노트 필요 여부 확인
```

## 3. 코드 컨벤션

기본 규칙:

- 앱 코드는 TypeScript를 사용한다.
- 레이어 경계의 입력/출력 타입은 명시적으로 둔다.
- 함수는 직접 테스트할 수 있을 만큼 작게 유지한다.
- 이름은 구현 방식보다 도메인 행동을 표현한다.
- 단일 사용 사례만을 위한 추상화는 만들지 않는다.
- 불필요한 기능, 추상화, 설정 가능성을 추가하지 않는다.
- 기존 코드와 무관한 정리, 포맷 변경, 리팩터링을 섞지 않는다.
- 의미 없는 대규모 리팩터링을 한 번에 진행하지 않는다.
- 리뷰 피드백은 옳고 그름을 먼저 분석한 뒤 반영한다.
- 코드 작성 후에는 보안, 데이터 정합성, 장애 복구 가능성을 한 번 더 검토한다.

주석과 문서화:

- 외부로 공개되는 함수와 클래스, 레이어 경계에 해당하는 함수와 클래스, 핵심 도메인 로직에는 역할과 주요 판단 기준을 설명하는 docstring을 작성한다.
- 단번에 의도를 파악하기 어려운 로직에는 왜 그렇게 처리했는지 설명하는 인라인 주석을 남긴다.
- 명백한 로직에는 주석을 추가하지 않는다.

선호:

- 명시적인 use case 함수.
- Core에서 테스트 가능한 순수 로직.
- Protocol별 frame builder/parser 단위 테스트.
- Repository를 통한 DB 접근.

피해야 할 것:

- Renderer에서 Node API 사용.
- IPC handler에 비즈니스 로직 추가.
- Main Process에 SQL 또는 protocol parsing 추가.
- “나중에 쓸 수 있을 것 같은” 범용 추상화.

## 4. 파일 구조

현재 기준 구조:

```text
src/
  main/        Electron app lifecycle, BrowserWindow, IPC handlers
  preload/     Renderer에 노출되는 안전 API
  renderer/    React UI
  core/
    app/       Application root와 use case facade
    db/        SQLite repository
    protocols/ Protocol 구현과 Mock Server

tests/         Node test runner 기반 테스트

docs/
  baseline/       기준 문서
  adr/            설계 결정 기록
  design/         설계 노트와 수직 슬라이스 설명
  learning-notes/ 학습노트
```

규칙:

- Renderer 관련 코드는 `src/renderer` 아래에 둔다.
- Electron 전용 코드는 `src/main` 또는 `src/preload` 아래에 둔다.
- 비즈니스 흐름과 use case는 `src/core` 아래에 둔다.
- 프로토콜 frame/session/mock 코드는 `src/core/protocols/<protocol>` 아래에 둔다.
- DB 접근 코드는 `src/core/db` 아래에 둔다.
- 테스트는 구현 파일 구조보다 행동 기준으로 작성한다.

## 5. 보안 규칙

Electron 보안 기준:

- `nodeIntegration`은 비활성화한다.
- `contextIsolation`은 활성화한다.
- Renderer에는 최소한의 `window.aioIcpt` API만 노출한다.
- Renderer에서 파일 시스템, DB, TCP, Serial Port에 직접 접근하지 않는다.
- 파일 경로, Export, Import는 Main/Core를 통해 처리한다.

입력 검증 기준:

- IPC 입력은 Core에서 검증한 뒤 Protocol 또는 DB 로직으로 전달한다.
- 현재 수직 슬라이스는 완전한 runtime schema validation이 없다.
- 사용자 입력이 늘어나기 전에 validation 전용 Issue를 만든다.

## 6. 테스트 규칙

기본 원칙:

- 새 동작은 실패하는 테스트로 먼저 표현한다.
- Core 로직은 Electron 없이 테스트 가능해야 한다.
- Protocol frame 생성/파싱은 직접 단위 테스트한다.
- Protocol session은 Mock Server 또는 fake transport로 검증한다.
- Repository는 SQLite test DB로 검증한다.
- UI/Electron 경계는 복잡도가 올라가면 별도 테스트를 추가한다.

검증 명령:

- 기능 또는 Core 변경 후: `npm test`
- Renderer, Electron, Vite, TypeScript 설정 변경 후: `npm run build`
- 완료 주장 전에는 fresh verification을 실행한다.

## 7. 문서 동기화 규칙

기능 또는 동작 변경 후 다음 기준으로 문서를 갱신한다.

- 기능 범위가 바뀌면 `feature-definition.md`.
- 레이어 책임이나 호출 흐름이 바뀌면 `system-architecture.md`.
- schema, 저장 규칙, 관계가 바뀌면 `data-model.md`.
- 개발 흐름이나 규칙이 바뀌면 `development-conventions.md`.
- 의미 있는 결정이 생기면 ADR.
- 사용자가 재사용할 학습 개념이 생기면 학습노트.

문서 동기화는 선택 작업이 아니라 완료 기준의 일부이다.

## 8. ADR 작성 기준

ADR은 중요한 결정의 이유를 남기는 문서이다.

ADR을 작성해야 하는 경우:

- 기술 스택 결정.
- 레이어 경계 변경.
- 저장 방식 변경.
- 프로토콜 구현 방식 변경.
- 보안 정책 변경.
- 테스트 전략 변경.
- 여러 선택지 사이의 tradeoff가 있는 결정.

권장 구조:

```md
# ADR 번호: 제목

## 상태

## 배경

## 결정

## 결과와 tradeoff
```

## 9. 학습노트 작성 기준

학습노트는 사용자가 나중에 개념을 다시 설명하고 응용할 수 있도록 남기는 문서이다. 기준 문서를 반복 요약하지 않고, 구현 과정에서 새로 이해한 개념, 헷갈렸던 지점, 디버깅으로 얻은 판단 기준을 정리한다.

작성 대상:

- 반복해서 등장할 개념.
- 현재 프로젝트 코드로 설명할 수 있는 개념.
- 사용자가 직접 구현을 확장할 때 필요한 개념.
- Phase를 시작, 진행, 마무리하며 실제로 배운 내용.

예:

- Electron Main/Preload/Renderer 경계.
- Modbus TCP MBAP Header.
- SQLite local storage.
- Mock Server 기반 테스트.
- Byte Order와 Word Order.
- Scenario Runner 상태 관리.

Phase 종료 시에는 `docs/learning-notes/phase-N-learning-note.md` 형식의 회고형 학습노트를 작성한다.

회고형 학습노트에는 다음 내용을 포함한다.

- 반드시 이해해야 하는 것.
- 지금은 몰라도 되는 것.
- 중간 확인 질문.
- 오늘 배운 것.
- 아직 모호한 것.
- 다음에 복습할 것.

상세 디버깅 기록은 필요하면 별도 문서로 분리하고, Phase learning note에서는 핵심 교훈만 연결한다.

학습노트는 짧고 구체적으로 작성한다. 긴 이론보다 현재 프로젝트 예시와 사용자가 직접 다시 설명할 수 있는 질문을 우선한다.

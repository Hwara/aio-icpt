# Phase 1 Learning Note

이 문서는 Phase 1을 진행하며 새로 이해한 내용을 복습하기 위한 회고형 학습노트이다. 기준 문서의 기능 범위나 아키텍처를 다시 요약하기보다, 실제로 구현하고 실행하면서 헷갈렸던 지점과 앞으로 직접 설명할 수 있어야 하는 개념을 정리한다.

## 시작 전 헷갈릴 수 있는 부분

- React 화면이 보인다고 해서 Electron 기능이 모두 연결된 것은 아니다.
- `window.aioIcpt`는 Core 객체 자체가 아니라 Renderer가 호출할 수 있는 제한된 API이다.
- TypeScript의 `declare global`은 런타임에서 값을 만들어 주지 않는다.
- SQLite 파일은 프로젝트 폴더가 아니라 Electron의 `userData` 경로에 저장된다.
- Mock server는 임시 장난감 기능이 아니라 반복 가능한 테스트 환경을 만들기 위한 장치이다.

확인 질문: UI가 보이는데 버튼이 비활성화되어 있다면, 먼저 React 코드와 Preload 로딩 중 어느 쪽을 의심해야 할까?

## 진행하며 배운 핵심 개념

### Electron 경계

Electron 앱에서는 화면을 그리는 Renderer와 데스크톱 앱을 관리하는 Main이 분리된다. Renderer는 Node API, SQLite, TCP에 직접 접근하지 않고, Preload가 노출한 API만 사용한다.

```text
Renderer
-> window.aioIcpt
-> Preload IPC wrapper
-> Main IPC handler
-> Core
```

반드시 이해해야 하는 것: Renderer가 직접 강한 권한을 갖지 않도록 경계를 둔다. 이 경계 덕분에 UI 코드는 화면과 입력에 집중하고, 실제 작업은 Main과 Core 쪽에서 처리한다.

지금은 몰라도 되는 것: Electron의 모든 보안 옵션, sandbox의 세부 동작, 패키징 후 preload 로딩 방식의 모든 예외까지는 아직 깊게 알 필요가 없다.

확인 질문: Renderer가 SQLite에 직접 접근하지 않아야 하는 이유를 한 문장으로 설명할 수 있는가?

### Preload API

`window.aioIcpt`는 Preload에서 `contextBridge.exposeInMainWorld(...)`로 주입한다. 이 API는 Core 인스턴스를 넘겨주는 통로가 아니라, IPC 호출을 감싼 안전한 명령 목록이다.

```text
window.aioIcpt.modbus.readHoldingRegisters(...)
= Renderer가 호출하는 공개 API

ipcRenderer.invoke("modbus:readHoldingRegisters", input)
= Preload 내부에서 Main으로 보내는 IPC 요청
```

반드시 이해해야 하는 것: Renderer는 `AioIcptApp`, DB repository, Modbus session을 직접 알 필요가 없다. Renderer는 "read를 실행해줘"라는 요청만 보낸다.

지금은 몰라도 되는 것: 모든 API 타입을 완벽하게 일반화하거나 protocol plugin interface를 미리 설계하는 것은 Phase 1의 학습 목표가 아니다.

확인 질문: `window.aioIcpt`가 Core 인스턴스가 아니라 API 표면이라는 말은 무슨 뜻인가?

### TypeScript 타입 선언과 런타임 값

`declare global`과 `interface Window`는 TypeScript에게 `window.aioIcpt`의 형태를 알려준다. 하지만 실제 값을 생성하지는 않는다.

```ts
declare global {
  interface Window {
    aioIcpt?: unknown;
  }
}
```

반드시 이해해야 하는 것: 타입 선언은 컴파일러를 위한 설명이고, 런타임 값 주입은 Preload 코드가 한다.

지금은 몰라도 되는 것: TypeScript의 declaration merging 전체 규칙이나 `.d.ts` 파일 분리 전략은 나중에 코드가 커질 때 다뤄도 된다.

확인 질문: `declare global`이 없어도 런타임에서 `window.aioIcpt`가 생길 수 있는가?

### Promise 결과와 React state

Read 버튼을 누르면 Renderer는 `window.aioIcpt` API를 호출하고 `await`로 결과를 기다린다. Core가 작업을 끝내고 결과를 반환하면, Renderer는 그 값을 `setResult`, `setLogs`, `setStatus`에 넣어 화면을 다시 그린다.

```text
버튼 클릭
-> async 함수 실행
-> await window.aioIcpt...
-> 결과 반환
-> setResult(...)
-> 화면 갱신
```

반드시 이해해야 하는 것: Core나 Main이 Renderer에게 직접 "화면을 바꿔라"라고 명령하지 않는다. Renderer가 요청의 결과를 받아 자기 state를 바꾼다.

지금은 몰라도 되는 것: React 렌더링 최적화, state management library, Suspense 같은 고급 주제는 아직 필요하지 않다.

확인 질문: Read 결과가 UI에 표시되는 마지막 책임은 Core, Main, Renderer 중 어디에 있는가?

### SQLite와 userData

SQLite는 별도 서버 없이 로컬 파일 하나로 데이터를 저장할 수 있다. Electron의 `app.getPath("userData")`는 OS가 정해주는 앱 전용 사용자 데이터 폴더를 반환한다.

Windows 개발 환경에서는 예를 들어 다음과 같은 위치가 된다.

```text
C:\Users\<user>\AppData\Roaming\aio-icpt\aio-icpt.sqlite
```

반드시 이해해야 하는 것: 데이터베이스 파일은 `D:\project\aio-icpt` 같은 프로젝트 폴더 안에 생기는 것이 아니다. 앱을 다시 실행해도 저장된 profile, test run, log가 남는 이유가 여기에 있다.

지금은 몰라도 되는 것: SQLite migration 전략, PostgreSQL 선택 연동, 대용량 로그 저장 최적화는 이후 Phase에서 다뤄도 된다.

확인 질문: 프로젝트 폴더를 삭제하지 않았는데도 앱 데이터가 남아 있다면, 어떤 경로를 확인해야 할까?

### Mock server

Mock server는 실제 장비 없이 Modbus TCP read 흐름을 반복해서 확인하게 해준다. 정해진 register 값을 돌려주기 때문에, 통신 결과와 raw frame을 안정적으로 비교할 수 있다.

반드시 이해해야 하는 것: Mock server는 테스트를 쉽게 하기 위한 우회가 아니라, 실제 장비 의존성을 줄이고 같은 결과를 반복해서 얻기 위한 검증 도구이다.

지금은 몰라도 되는 것: 실제 산업 장비의 모든 예외 응답, 네트워크 장애 패턴, 장비별 register map 차이는 아직 깊게 다루지 않아도 된다.

확인 질문: Mock server가 없다면 Phase 1 테스트는 어떤 외부 조건에 의존하게 될까?

## 디버깅을 통해 배운 점

Preload가 로드되지 않으면 Renderer는 일반 브라우저 미리보기와 비슷한 상태가 된다. 화면은 보이지만 `window.aioIcpt`가 없어서 실제 기능 버튼은 비활성화된다.

이번 문제에서는 Preload 산출물이 `out/preload/index.mjs`로 생성되었지만, Main에서 `../preload/index.js`를 찾고 있어서 API가 주입되지 않았다.

핵심 교훈:

- 증상은 버튼 비활성화였지만 원인은 React 버튼 코드가 아니라 Preload 경로 불일치였다.
- `apiAvailable === false`는 "API를 사용하는 쪽"보다 "API를 주입하는 쪽"을 먼저 확인해야 하는 신호일 수 있다.
- 타입 선언과 런타임 주입을 구분해야 디버깅 방향이 흐려지지 않는다.

자세한 기록은 `docs/learning-notes/electron-preload-api-debugging.md`를 참고한다.

확인 질문: Preload가 로드되지 않으면 UI는 보이지만 버튼이 비활성화되는 이유는 무엇인가?

## 오늘 배운 것

- Electron 앱은 Renderer, Preload, Main의 역할을 나누어 생각해야 한다.
- Renderer는 Core에 직접 접근하지 않고 `window.aioIcpt` API를 통해 요청한다.
- Preload는 IPC 호출을 안전하게 감싼 API를 Renderer에 노출한다.
- TypeScript 타입 선언은 런타임 객체 생성과 다르다.
- React 화면 갱신은 Renderer가 Promise 결과를 받아 state를 변경하면서 일어난다.
- SQLite 저장 위치는 Electron `userData` 경로이다.
- Mock server는 실제 장비 없이 같은 동작을 반복 검증하게 해준다.

## 아직 모호한 것

- IPC 입력 검증을 어느 계층에서 어떤 방식으로 강화할지.
- Preload API 타입을 별도 공유 타입으로 분리해야 하는 시점.
- 실제 장비 연결 실패, timeout, 예외 응답을 UI에서 어떻게 표현할지.
- Phase가 커질 때 `AioIcptApp`이 어디까지 use case facade 역할을 유지할 수 있을지.

## 다음에 복습할 것

- `src/main/index.ts`에서 BrowserWindow와 IPC handler가 어떻게 연결되는지 다시 읽기.
- `src/preload/index.ts`에서 `window.aioIcpt` API가 어떤 채널로 매핑되는지 확인하기.
- `src/renderer/src/App.tsx`에서 버튼 클릭부터 `setResult`까지 흐름을 따라가기.
- `src/core/app/aioIcptApp.ts`에서 Core가 protocol과 DB를 어떻게 조율하는지 확인하기.
- `electron-preload-api-debugging.md`를 다시 보며 증상에서 원인까지 추적한 순서를 말로 설명해보기.

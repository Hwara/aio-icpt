# ADR 0008: Keep Renderer Sandbox Disabled Until Preload Is Sandbox-Compatible

## 상태

Accepted

## 배경

Electron 20부터 renderer sandbox는 기본적으로 활성화되며, 보안상 sandbox 활성화가 권장된다. AIO-ICPT도 Renderer가 파일 시스템, DB, TCP, Serial Port에 직접 접근하지 않고 Preload/IPC/Main/Core 흐름을 통해 privileged 작업을 위임하는 구조를 유지한다.

다만 현재 앱은 Electron Vite 빌드 결과로 preload script를 `out/preload/index.mjs` ESM 파일로 생성한다. Electron 문서에 따르면 sandboxed preload scripts는 ESM import를 사용할 수 없고 plain JavaScript로 실행된다. 현재 preload는 `import { contextBridge, ipcRenderer } from "electron"` 형태이며, `sandbox: true`로 실행했을 때 `window.aioIcpt` API가 노출되지 않는 문제가 있었다.

## 결정

Phase 2에서는 `BrowserWindow.webPreferences.sandbox`를 `false`로 유지한다.

이 결정은 sandbox 비활성화를 장기 보안 정책으로 채택한다는 뜻이 아니다. 현재 ESM preload 구조에서 앱 기능을 유지하기 위한 임시 호환성 결정이다.

현재 유지하는 보안 경계:

- `nodeIntegration: false`
- `contextIsolation: true`
- Renderer는 Node, Electron, 파일 시스템, SQLite, TCP, Serial Port API에 직접 접근하지 않는다.
- Renderer는 `window.aioIcpt`로 제한된 use case API만 호출한다.
- 파일 Import/Export는 Main process dialog와 Core validation을 통해 수행한다.

## 결과와 tradeoff

- 장점: 기존 preload API와 Renderer 기능을 깨뜨리지 않고 Phase 2 기능을 유지한다.
- 장점: privileged 작업은 계속 Main/Core 경계 뒤에 있으므로 Renderer 직접 권한 노출은 피한다.
- 비용: Chromium renderer sandbox의 추가 격리 이점을 당장은 사용하지 못한다.
- 후속 작업: preload를 sandbox-compatible 형태로 전환할 방법을 검토한다. 후보는 CommonJS preload 출력, sandboxed preload에서 허용되는 `require("electron")` 형태, 또는 Electron Vite preload 번들 설정 조정이다. 전환 후 `sandbox: true`를 다시 활성화하고 `window.aioIcpt` 동작을 검증한다.

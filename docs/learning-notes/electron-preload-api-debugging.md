# Electron Preload API 디버깅 기록

## 배경

Phase 1에서는 Renderer UI에서 Modbus TCP Read Holding Registers를 실행하고, 결과를 SQLite와 로그에 저장하는 최소 수직 슬라이스를 구현했다.

정상 흐름은 다음과 같다.

```text
Renderer
-> window.aioIcpt API 호출
-> Preload
-> ipcRenderer.invoke(...)
-> Main ipcMain.handle(...)
-> Core AioIcptApp
-> Protocol / DB
-> 결과 반환
-> Renderer state 갱신
```

Renderer는 Node API, SQLite, TCP, Serial Port에 직접 접근하지 않는다. 대신 Preload가 window.aioIcpt라는 제한된 API를 노출하고, Renderer는 이 API만 호출한다.

## 증상

npm run dev로 Electron 앱을 실행했지만 UI에서 테스트 버튼이 비활성화되었다.

화면에는 다음 메시지가 표시되었다.

```text
Electron preload API가 없어서 UI 미리보기 모드로 실행 중입니다.
```

Renderer 코드에서는 다음 값이 false였다.

```ts
const apiAvailable = Boolean(window.aioIcpt);
```

즉, Electron 앱으로 실행했음에도 window.aioIcpt가 존재하지 않았다.

## 조사 과정

처음에는 src/renderer/src/App.tsx의 declare global 및 interface Window 코드가 window.aioIcpt를 가져오지 못하는 문제인지 의심했다.

하지만 이 코드는 런타임에서 값을 생성하는 코드가 아니라 TypeScript 타입 선언이다.

```ts
declare global {
  interface Window {
    aioIcpt?: {
      // ...
    };
  }
}
```

이 선언은 TypeScript에게 “window 객체에 aioIcpt라는 속성이 있을 수 있다”고 알려줄 뿐이다. 실제로 window.aioIcpt를 생성하는 코드는 Preload에 있다.

```ts
contextBridge.exposeInMainWorld("aioIcpt", api);
```

따라서 문제는 타입 선언이 아니라 Preload가 정상적으로 로드되지 않았는지 확인하는 방향으로 좁혀졌다.

## 원인

빌드 산출물을 확인한 결과 Preload 파일은 다음 경로에 생성되어 있었다.

```text
out/preload/index.mjs
```

하지만 Main Process에서는 Preload 경로를 다음처럼 지정하고 있었다.

```ts
preload: join(__dirname, "../preload/index.js")
```

즉, Electron은 out/preload/index.js를 찾고 있었지만 실제 파일은 out/preload/index.mjs였다.

이 때문에 Preload가 로드되지 않았고, 다음 코드도 실행되지 않았다.

```ts
contextBridge.exposeInMainWorld("aioIcpt", api);
```

그 결과 Renderer에서 window.aioIcpt가 undefined가 되었고, apiAvailable이 false가 되어 테스트 버튼이 비활성화되었다.

## 왜 mjs로 생성되었는가

package.json에 다음 설정이 있다.

```json
"type": "module"
```

이 설정 때문에 프로젝트는 ES Module 기반으로 동작한다.

electron-vite는 이 설정을 보고 Preload 번들을 ES Module 형식으로 출력하며, ES Module preload 출력 파일명을 .mjs로 생성한다.

따라서 .mjs가 생성된 것 자체는 문제가 아니었다. 문제는 Main Process가 .js 파일을 찾고 있었다는 점이다.

## 해결

Main Process의 Preload 경로를 실제 출력 파일명에 맞게 수정했다.

```ts
preload: join(__dirname, "../preload/index.mjs")
```

수정 후 npm run dev로 실행했을 때 window.aioIcpt가 정상적으로 주입되었고, 테스트 버튼이 활성화되었다.

Mock server 시작, Modbus TCP Read 실행, Raw Frame 및 Decoded Value 표시, SQLite 저장까지 정상 동작을 확인했다.

## 배운 점

declare global과 interface Window는 런타임 객체를 만드는 코드가 아니다. TypeScript 타입 시스템에 window.aioIcpt의 형태를 알려주는 선언이다.

실제로 Renderer의 window에 API를 주입하는 것은 Electron Preload의 역할이다.

```text
TypeScript interface Window
= 타입 선언

contextBridge.exposeInMainWorld(...)
= 런타임 API 주입
```

Renderer는 Core 인스턴스를 직접 받지 않는다. Preload가 window.aioIcpt라는 안전한 API 표면을 만들고, 그 내부에서 IPC를 통해 Main Process에 요청을 보낸다.

```text
Renderer
-> window.aioIcpt.modbus.readHoldingRegisters(...)
-> Preload ipcRenderer.invoke(...)
-> Main ipcMain.handle(...)
-> Core AioIcptApp
```

Preload가 로드되지 않으면 Renderer는 일반 브라우저 미리보기와 비슷한 상태가 된다. UI는 보일 수 있지만 Electron API가 없으므로 실제 기능 버튼은 동작하지 않는다.

## 확인 방법

Preload API가 정상 주입되었는지는 Electron DevTools Console에서 다음으로 확인할 수 있다.

```js
window.aioIcpt
Boolean(window.aioIcpt)
```

정상이라면 객체가 출력되고 true가 나온다.

빌드 산출물과 Main의 preload 경로도 함께 확인해야 한다.

```text
out/preload/index.mjs
src/main/index.ts의 preload 경로
```

두 경로가 일치하지 않으면 Preload가 로드되지 않을 수 있다.

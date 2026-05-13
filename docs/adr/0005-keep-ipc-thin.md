# ADR 0005: IPC를 얇게 유지

## 상태

승인됨

## 배경

Electron 앱은 IPC handler나 Renderer code에 비즈니스 로직이 쌓이면 테스트하기 어려워진다. AIO-ICPT는 데스크톱 shell 없이도 프로토콜 동작을 테스트할 수 있어야 한다.

## 결정

Preload를 통해 작은 `window.aioIcpt` API만 노출한다. IPC handler는 Core service로 위임하고, protocol 또는 persistence logic을 직접 담지 않는다.

## 결과와 tradeoff

- Core 동작은 Node.js test runner로 테스트할 수 있다.
- Renderer code는 사용자 입력과 화면 표시 책임에 집중한다.
- 향후 HTTP/WebSocket 구조로 확장할 때 Core service를 더 쉽게 재사용할 수 있다.

# ADR 0001: Electron, React, Node.js, TypeScript 사용

## 상태

승인됨

## 배경

AIO-ICPT는 TCP socket, 향후 Serial Port, SQLite, 로그, Export 파일, 데스크톱 패키징에 접근해야 한다. 순수 웹 앱은 로컬 장비 접근을 어렵게 만든다. Tauri/Rust 구조도 가치가 있지만, 첫 학습 부담이 프로토콜 테스트 도구 아키텍처가 아니라 Rust 쪽으로 이동한다.

## 결정

데스크톱 shell에는 Electron을 사용하고, Renderer UI에는 React를 사용한다. Core runtime은 Node.js로 구성하며, 앱 전체 코드는 TypeScript로 작성한다.

## 결과와 tradeoff

- 첫 MVP는 IPC 경계, 프로토콜 실행, 로컬 저장 흐름에 집중할 수 있다.
- Node.js의 TCP 및 SQLite 지원은 첫 수직 슬라이스에 충분하다.
- 앱 크기와 메모리 사용량 증가는 구현 속도와 로컬 하드웨어 접근성을 위한 tradeoff로 받아들인다.

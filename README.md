# AIO-ICPT

AIO-ICPT는 **All-In-One Industrial Communication Protocol Tester**의 약자입니다.

산업용 장비 개발과 현장 디버깅을 위해 PC에서 다양한 산업용 통신 프로토콜을 테스트하고, Raw Frame 확인, 로그 분석, 테스트 자동화, 데이터 저장, Export까지 지원하는 데스크톱 애플리케이션을 목표로 합니다.

## 프로젝트 목표

AIO-ICPT는 단순한 프로토콜 클라이언트가 아니라 다음 기능을 갖춘 확장형 통신 테스트/디버깅 도구를 지향합니다.

- 산업용 프로토콜 테스트
- 통신 디버깅과 Raw Frame 확인
- 테스트 자동화와 반복 Polling
- 구조화된 로그 분석
- 테스트 결과 저장과 히스토리 조회
- CSV/JSON Export
- 새로운 프로토콜을 추가하기 쉬운 확장 구조

상세 기능 범위는 [기능 정의 기준 문서](docs/baseline/feature-definition.md)를 기준으로 관리합니다.

## 진행 단계

현재 단계: **Phase 2 준비 - 프로젝트와 연결 관리 기반**

| Phase | 이름 | 목표 | 상태 |
| --- | --- | --- | --- |
| Phase 1 | Modbus TCP 수직 슬라이스 | UI에서 Modbus TCP read를 실행하고 결과를 SQLite와 로그에 저장하는 최소 수직 흐름 검증 | 완료 |
| Phase 2 | 프로젝트와 연결 관리 기반 | 프로젝트 단위와 connection profile 관리 기능 확장 | 예정 |
| Phase 3 | Modbus MVP 기능 확장 | Modbus TCP/RTU 기반 read/write, data type 변환, polling 확장 | 예정 |
| Phase 4 | 로그, 히스토리, 필터링 | 로그 조회, 필터링, 테스트 이력 분석 강화 | 예정 |
| Phase 5 | 테스트 자동화 | scenario 저장/실행, expected value 검증, retry, polling 자동화 | 예정 |
| Phase 6 | Export | 저장된 테스트 결과를 CSV/JSON으로 내보내기 | 예정 |
| Phase 7 | 확장 기능 | MQTT, OPC UA, PostgreSQL 선택 저장, Trend Chart, Report 확장 | 예정 |

세부 작업 현황은 GitHub Issues에서 관리하고, 상세 기준은 `docs/baseline/` 문서를 따릅니다.

## 문서 안내

개발 전에는 관련 기준 문서를 먼저 확인합니다.

- [기능 정의 기준 문서](docs/baseline/feature-definition.md): 제품 정체성, 전체 기능 범위, MVP 범위, 로드맵
- [전체 구조 기준 문서](docs/baseline/system-architecture.md): 런타임 구조, 레이어 책임, 호출 흐름, 확장 방향
- [데이터 모델 기준 문서](docs/baseline/data-model.md): ERD, SQLite schema, JSON 확장 규칙, migration 규칙
- [개발 컨벤션 기준 문서](docs/baseline/development-conventions.md): 개발 흐름, GitHub Issues 운영, 테스트, 보안, 문서 동기화 규칙

보조 문서:

- `docs/adr/`: 주요 설계 결정 기록
- `docs/learning-notes/`: 구현 중 학습한 개념 정리
- `docs/design/`: 설계 노트와 수직 슬라이스 설명

## 실행 명령

```bash
npm install
```

의존성을 설치합니다.

```bash
npm run dev
```

Electron 개발 앱을 실행합니다.

```bash
npm test
```

Node test runner 기반 테스트를 실행합니다.

```bash
npm run build
```

Electron main, preload, renderer 번들을 빌드합니다.

## 개발 운영 원칙

- 기준 문서가 프로젝트의 source of truth입니다.
- GitHub Issues는 실행 관리를 담당합니다.
- 구현 전에는 기준 문서를 확인하고, 구현 후에는 변경된 내용을 문서에 동기화합니다.
- 새 동작은 테스트로 먼저 표현하고, 검증 후 구현합니다.
- 중요한 설계 결정은 ADR로 남깁니다.
- 사용자가 학습하고 응용해야 할 개념은 learning notes에 기록합니다.

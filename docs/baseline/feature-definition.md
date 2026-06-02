# AIO-ICPT 기능 정의 기준 문서

이 문서는 AIO-ICPT가 최종적으로 어떤 제품이어야 하는지를 정의하는 기준 문서이다. 개발 Phase, GitHub Issue, 현재 구현 상태는 이 문서의 하위 실행 정보이며, 기능 정의 자체를 대체하지 않는다.

개발 전에는 이 문서에서 관련 기능의 전체 의도와 범위를 먼저 확인한다. 개발 후 기능 범위, 사용자 흐름, 완료 기준이 바뀌었다면 이 문서를 함께 갱신한다.

## 1. 제품 정체성

AIO-ICPT는 산업용 장비 개발과 현장 디버깅을 위한 PC 기반 산업용 통신 프로토콜 테스트 프로그램이다.

단순한 프로토콜 클라이언트가 아니라 다음 능력을 갖춘 확장형 통신 테스트/디버깅 도구를 목표로 한다.

```text
산업용 프로토콜 테스트
+ 디버깅
+ 테스트 자동화
+ 로그 분석
+ 데이터 저장
+ 결과 Export
+ 프로토콜 확장 구조
```

기본 실행 경험은 다음과 같아야 한다.

```text
설치 파일 다운로드
-> 설치 또는 실행
-> AIO-ICPT 실행
-> 로컬 SQLite DB 자동 생성
-> 통신 테스트 수행
```

PostgreSQL 같은 외부 인프라는 선택 기능이어야 하며, 기본 사용자는 별도 서버나 DB 설치 없이 앱을 사용할 수 있어야 한다.

## 2. 대상 사용자

### 2.1 산업용 장비 개발자

- 장비 펌웨어 또는 제어 로직 개발 중 프로토콜 통신을 확인한다.
- 특정 address/register/tag에 대한 읽기/쓰기 결과를 빠르게 확인한다.
- Raw Frame과 decoded value를 함께 보며 프로토콜 문제를 추적한다.

### 2.2 현장 엔지니어

- 설비와 PC를 연결해 통신 상태를 점검한다.
- 반복 polling과 로그 필터링으로 간헐적 오류를 추적한다.
- 테스트 결과를 CSV/JSON으로 저장해 공유한다.

### 2.3 학습자/포트폴리오 사용자

- Electron, IPC, Core Layer, Protocol Layer, SQLite, 테스트 자동화 구조를 학습한다.
- 주요 설계 결정은 ADR로, 구현 중 배운 개념은 학습노트로 남긴다.
- 기능 구현보다 “설명 가능한 구조와 문서화된 판단”을 우선한다.

## 3. 전체 기능 범위

이 섹션은 최종 제품 기준의 기능 범위이다. MVP 또는 현재 구현 여부와 무관하게 AIO-ICPT가 장기적으로 제공해야 할 기능을 정의한다.

### 3.1 프로젝트 관리

사용자는 통신 테스트 작업을 프로젝트 단위로 관리할 수 있어야 한다.

포함 기능:

- 프로젝트 생성, 조회, 수정, 삭제.
- 프로젝트별 connection profile 관리.
- 프로젝트 설정 Import/Export.
- 프로젝트별 test scenario 관리.
- 프로젝트별 register map 관리.
- 프로젝트별 test run/history 조회.

성공 기준:

- 사용자는 장비 또는 현장 단위로 테스트 자산을 분리할 수 있다.
- 프로젝트를 다시 열었을 때 이전 연결 설정, 시나리오, 결과를 이어서 볼 수 있다.
- 프로젝트 설정 Import/Export는 테스트 이력과 로그가 아니라 프로젝트 기본 정보와 연결 설정 이동을 목적으로 한다.

### 3.2 연결 설정 관리

사용자는 프로토콜별 연결 설정을 저장하고 재사용할 수 있어야 한다.

포함 기능:

- Modbus TCP 연결 설정.
- Modbus RTU 연결 설정.
- 향후 MQTT, OPC UA, EtherNet/IP 연결 설정.
- 여러 산업 기기를 하나의 프로젝트 안에 등록하기 위한 장비 연결 목록.
- 연결 테스트.
- 연결 상태 표시.
- 프로토콜별 설정 검증.

성공 기준:

- Renderer는 입력만 담당하고, 실제 검증은 Core에서 수행한다.
- 프로토콜별 설정 차이는 JSON 확장 필드로 수용하되, 공통 식별자와 관계는 고정한다.
- Phase 2에서는 별도 `Device` 테이블 없이 `connection_profiles`를 장비 연결 목록처럼 사용한다.
- 장기적으로 `Device`는 실제 산업 장비 한 대를 표현하고, connection profile은 그 장비에 접속하기 위한 설정으로 분리할 수 있다.

### 3.3 프로토콜 테스트 작업 공간

사용자는 프로토콜별 읽기/쓰기/구독/탐색 작업을 실행하고 결과를 확인할 수 있어야 한다.

포함 기능:

- 단일 읽기 테스트.
- 단일 쓰기 테스트.
- 반복 읽기/Polling.
- 응답 시간 측정.
- 성공/실패 카운트.
- 프로토콜별 operation capability 표시.
- decoded value와 raw frame 동시 표시.

성공 기준:

- Modbus 전용 UI 구조로 전체 앱이 고정되지 않는다.
- 공통 operation 모델은 `READ`, `WRITE`, `SUBSCRIBE`, `PUBLISH`, `BROWSE`, `SCAN`, `CUSTOM` 같은 확장 가능한 형태를 고려한다.

### 3.4 디버깅과 Raw Frame 확인

사용자는 통신 요청과 응답을 Raw Frame으로 확인할 수 있어야 한다.

포함 기능:

- TX/RX Raw Frame 표시.
- function code, address, unit/slave id 같은 프로토콜 메타데이터 표시.
- 프로토콜 exception/error 표시.
- 요청/응답 시간과 실패 원인 표시.

성공 기준:

- Raw Frame은 단순 문자열 출력이 아니라 structured log와 연결되어야 한다.
- 디버깅 정보는 테스트 실행 이력과 함께 저장되어야 한다.

### 3.5 로그와 필터링

사용자는 테스트 중 발생한 이벤트와 Raw Frame을 조회하고 필터링할 수 있어야 한다.

포함 로그 레벨:

```text
TRACE
DEBUG
INFO
WARN
ERROR
RAW
```

포함 필터:

- 프로토콜.
- 연결 세션.
- 성공/실패.
- 로그 레벨.
- TX/RX 방향.
- function code.
- address 범위.
- 키워드.
- 시간 범위.

성공 기준:

- 로그는 `ProtocolLog` 데이터로 저장된다.
- 자주 필터링하는 값은 장기적으로 JSON 내부가 아니라 컬럼 승격을 검토한다.

### 3.6 데이터 저장과 히스토리

사용자는 테스트 실행 결과, 로그, 측정값을 나중에 다시 조회할 수 있어야 한다.

포함 기능:

- SQLite 기본 저장.
- TestRun 조회.
- ProtocolLog 조회.
- MeasurementRecord 조회.
- 테스트 성공/실패 요약.
- 평균 응답 시간, 실패 카운트 같은 요약 정보.
- PostgreSQL 선택 저장.

성공 기준:

- SQLite만으로 기본 기능이 동작해야 한다.
- PostgreSQL은 선택 기능이며 MVP 실행 필수 조건이 아니다.

### 3.7 테스트 시나리오와 자동화

사용자는 여러 테스트 단계를 scenario로 저장하고 실행할 수 있어야 한다.

포함 기능:

- 단일 테스트 실행.
- 반복 테스트 실행.
- 주기적 polling.
- 조건 기반 테스트.
- 예상값 검증.
- 응답 시간 검증.
- 실패 시 재시도.
- step별 성공/실패 표시.
- 테스트 결과 저장.

성공 기준:

- Scenario Runner는 실제 장비 없이 Mock Session으로 테스트 가능해야 한다.
- 시나리오 정의는 프로토콜별 차이를 JSON으로 수용하되, 실행 이력은 공통 TestRun으로 기록한다.

### 3.8 Register Map과 Data Monitor

사용자는 address/register/tag를 이름과 데이터 타입으로 관리하고 현재값을 모니터링할 수 있어야 한다.

포함 기능:

- Register Map 생성/수정/삭제.
- Register Map Item 관리.
- address, function code, data type, byte order, word order, scale, unit 설정.
- 반복 polling 결과 표시.
- tag/address별 현재값 표시.
- 향후 trend chart 확장.

성공 기준:

- Register Map은 Modbus에 유용하지만 Modbus에만 종속되지 않도록 metadata 확장 지점을 둔다.

### 3.9 Export와 Report

사용자는 저장된 테스트 결과와 로그를 외부 파일로 내보낼 수 있어야 한다.

이 섹션의 Export는 테스트 실행 결과와 로그에 대한 Export이다. Phase 2의 프로젝트 설정 Import/Export는 프로젝트와 연결 설정 이동을 위한 별도 기능이며, TestRun, ProtocolLog, MeasurementRecord를 포함하지 않는다.

포함 기능:

- CSV Export.
- JSON Export.
- TestRun 기준 Export.
- Export 경로 설정.
- 향후 report generation.

성공 기준:

- Export는 현재 화면 상태가 아니라 저장된 데이터 기준으로 수행한다.
- CSV/JSON 스키마 변경은 문서화한다.

### 3.10 프로토콜 확장 구조

새 프로토콜을 추가하기 쉬운 구조를 제공해야 한다.

지원 대상 범위:

- MVP: Modbus TCP, Modbus RTU.
- 2차 후보: MQTT, OPC UA.
- 이후 확장 후보: EtherNet/IP.
- 장기/외부 SDK 후보: PROFINET, EtherCAT, PROFIBUS, CC-Link.

성공 기준:

- Core Layer와 Protocol Layer를 분리한다.
- 프로토콜별 capability를 명시한다.
- 특정 프로토콜에만 있는 기능은 optional capability로 처리한다.
- 두 번째 프로토콜 도입 시 공통 plugin interface를 구체화한다.

### 3.11 설정과 로컬 실행 환경

사용자는 앱 설정과 저장 위치를 관리할 수 있어야 한다.

포함 기능:

- 앱 설정.
- DB 설정.
- 로그 보관 정책.
- Export 경로 설정.
- Mock server 실행 옵션.
- 향후 PostgreSQL 연결 설정.

성공 기준:

- 기본 설정만으로 앱이 실행되어야 한다.
- 고급 설정은 선택 기능이어야 한다.

## 4. 지원 프로토콜 범위

### 4.1 MVP 지원 대상

- Modbus TCP.
- Modbus RTU.

현재 구현은 Modbus TCP Function Code 03의 얇은 수직 슬라이스만 포함한다. 이는 MVP 전체가 아니라 MVP를 검증하기 위한 첫 구현 단위이다.

### 4.2 2차 지원 후보

- MQTT.
- OPC UA.

### 4.3 이후 확장 후보

- EtherNet/IP.

### 4.4 장기 지원 또는 외부 SDK/Driver 연동 후보

- PROFINET.
- EtherCAT.
- PROFIBUS.
- CC-Link.

이 그룹은 전용 하드웨어, 드라이버, 벤더 SDK가 필요할 수 있으므로 초기 구현 대상이 아니라 확장 구조 검증 대상으로 둔다.

## 5. MVP 범위

MVP는 전체 기능의 축소판이다. 전체 기능 정의를 모두 구현하지 않지만, 제품 정체성이 드러나는 최소 흐름은 포함해야 한다.

MVP 포함 기능:

1. 프로젝트 생성/저장.
2. 프로토콜 연결 설정 관리.
3. Modbus TCP 연결/해제.
4. Modbus RTU 연결/해제.
5. 단일 읽기 테스트.
6. 단일 쓰기 테스트.
7. 반복 읽기/Polling 테스트.
8. 응답 시간 측정.
9. 성공/실패 카운트.
10. Raw Frame 로그 표시.
11. 상세 로그 확인.
12. 로그 필터링.
13. 테스트 결과 SQLite 저장.
14. CSV Export.
15. JSON Export.
16. 테스트 시나리오 저장 및 실행.

MVP 제외 또는 선택 기능:

- PostgreSQL 저장.
- MQTT.
- OPC UA.
- EtherNet/IP.
- Trend Chart.
- Report generation.

## 6. 현재 구현 기준선

현재 구현 기준선은 Phase 1의 Modbus TCP 수직 슬라이스에 Phase 2의 프로젝트와 연결 관리 기반 일부가 더해진 상태이다. 이는 MVP 전체가 아니라 MVP를 검증하기 위한 단계적 구현 기준이다.

포함된 기능:

- Electron + React + TypeScript 기반 앱 골격.
- Main/Preload/Renderer 분리.
- `window.aioIcpt` preload API.
- Project CRUD.
- 프로젝트별 Connection Profile CRUD.
- Modbus TCP profile validation.
- 저장된 Connection Profile 기반 connection test.
- 최근 프로젝트/최근 연결 표시.
- Modbus TCP Mock Server.
- Modbus TCP Function Code 03 request/response 처리.
- Read Holding Registers 실행.
- SQLite 저장소.
- `connection_profiles`, `test_runs`, `protocol_logs`, `measurement_records` 테이블.
- 3패널 Protocol Test Workspace.
- Core 단위 테스트와 build 검증.

제외된 기능:

- Modbus RTU.
- Write operation.
- 로그 필터 UI.
- Scenario Runner.
- CSV/JSON Export.
- PostgreSQL.

## 7. 구현 로드맵

로드맵은 전체 기능 정의를 구현 가능한 순서로 나눈 것이다. GitHub Milestone은 Phase와 1:1로 맞춘다.

### Phase 1 - Modbus TCP 수직 슬라이스

상태: 완료.

목표: UI에서 Modbus TCP read를 실행하고 결과를 SQLite와 로그에 저장하는 최소 수직 흐름을 완성한다.

완료 기준:

- Mock 서버에 대해 read operation이 성공한다.
- Raw Frame과 decoded value가 UI에 표시된다.
- 실행 결과가 SQLite에 저장된다.
- 관련 테스트가 통과한다.
- 기준 문서, ADR, 학습노트가 현재 동작과 모순되지 않는다.

### Phase 2 - 프로젝트와 연결 관리 기반

상태: 진행 중.

목표: 프로젝트 단위와 connection profile 관리 기능을 실제 사용 흐름으로 확장한다.

포함 기능:

- Project CRUD.
- Connection Profile CRUD.
- Connection test action.
- Profile validation.
- 최근 프로젝트/최근 연결 표시.
- 프로젝트 설정 Import/Export v1.
- 선택 중심 UI와 Create/Edit modal.

현재 구현 기준:

- Project CRUD가 SQLite, Core, IPC, Renderer 흐름으로 연결되어 있다.
- Connection Profile은 Project에 연결되어 저장, 조회, 수정, 삭제된다.
- Phase 2 UI에서 Connection Profile은 장비 연결 목록으로 표현한다.
- Phase 2 validation은 Modbus TCP profile을 대상으로 Core에서 수행된다.
- 저장된 profile로 Modbus TCP connection test를 실행할 수 있다.
- 최근 프로젝트와 최근 연결은 `updated_at` 기준 목록으로 표시한다.
- 프로젝트 설정 Export는 `schemaVersion`, `exportedAt`, project name/description, connection profiles name/protocol/config만 JSON으로 저장한다.
- 프로젝트 설정 Import는 항상 새 프로젝트로 가져오며 기존 프로젝트와 connection profile을 덮어쓰지 않는다.
- Phase 2에서는 별도 `devices` 테이블과 multi-device sequential request 실행을 구현하지 않는다.

### Phase 3 - Modbus MVP 기능 확장

목표: Modbus TCP/RTU 기반의 기본 read/write 기능을 MVP 수준으로 확장한다.

포함 기능:

- 주요 Modbus Function Code.
- Modbus RTU serial 연결.
- data type 변환.
- 성공/실패 카운트.
- 반복 polling.
- 여러 장비 연결을 대상으로 한 순차 요청 실행의 기본 실행 모델 검토.

### Phase 4 - 로그, 히스토리, 필터링

목표: 디버깅 도구로서 로그 조회와 히스토리 분석 기능을 강화한다.

포함 기능:

- Log Viewer.
- 로그 필터링.
- TestRun 상세 조회.
- MeasurementRecord 조회.
- 실패 테스트 요약.

### Phase 5 - 테스트 자동화

목표: 단일 테스트를 넘어 scenario 저장/실행과 자동화 흐름을 제공한다.

포함 기능:

- TestScenario 저장/조회.
- Scenario Runner.
- Polling.
- 여러 장비에 순차적으로 요청을 보내는 multi-device scenario 실행.
- expected value 검증.
- response time 검증.
- retry.

### Phase 6 - Export

목표: 저장된 결과를 CSV/JSON으로 내보낸다.

포함 기능:

- CSV Export.
- JSON Export.
- Export path 설정.
- TestRun 기준 결과 묶음 내보내기.

### Phase 7 - 확장 기능

목표: MVP 구조가 다른 프로토콜과 선택 저장소에도 확장되는지 검증한다.

포함 기능:

- MQTT.
- OPC UA.
- PostgreSQL 선택 저장.
- Trend Chart.
- Report generation.

## 8. GitHub Issue 분해 기준

GitHub Issues는 실행 관리 도구이며 기능 정의의 source of truth가 아니다. Issue는 이 문서의 기능 범위와 Phase를 참조해야 한다.

좋은 Issue는 하나의 검증 가능한 결과를 가진다.

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

권장 Milestone 예시:

- `Phase 1 - Modbus TCP 수직 슬라이스`
- `Phase 2 - 프로젝트와 연결 관리 기반`
- `Phase 3 - Modbus MVP 기능 확장`

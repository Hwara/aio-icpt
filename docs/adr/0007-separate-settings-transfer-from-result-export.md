# ADR 0007: Separate Settings Transfer From Result Export

## 상태

Accepted

## 배경

Phase 2는 프로젝트와 연결 관리 기반을 실제 사용 흐름으로 정리한다. 사용자는 프로젝트와 장비 연결 설정을 다른 PC나 현장 환경으로 옮길 수 있어야 하지만, 기준 문서의 기존 Export 범위는 TestRun, ProtocolLog, MeasurementRecord 같은 실행 결과 공유에 초점이 있었다.

또한 현장 테스트에서는 여러 산업 장비에 순차적으로 요청을 보내야 한다. 그러나 Phase 2의 현재 데이터 모델은 `projects`와 `connection_profiles`만 구현되어 있으며, 별도 장비 엔티티는 아직 없다.

## 결정

Phase 2의 Import/Export v1은 설정 이동 기능으로 정의한다. Export payload는 `schemaVersion`, `exportedAt`, project name/description, connection profile name/protocol/config만 포함한다. Import는 항상 새 project를 만들며 기존 project나 connection profile을 덮어쓰지 않는다.

Phase 2에서는 별도 `devices` 테이블을 추가하지 않는다. UI에서는 `connection_profiles`를 장비 연결 목록처럼 표현하고, 실제 `Device` 엔티티와 multi-device sequential request runner는 이후 Phase에서 구체화한다.

## 결과와 tradeoff

- 장점: Phase 2 범위 안에서 설정 이동을 제공하면서 TestRun 결과 Export와 schema를 섞지 않는다.
- 장점: DB migration 없이 UI 혼란을 줄이고 장비 연결 관리 흐름을 먼저 검증할 수 있다.
- 비용: 같은 장비에 여러 연결 설정, register map, scenario target을 연결하는 모델은 아직 표현하지 못한다.
- 제한: 여러 장비 순차 실행은 Phase 3~5의 polling/scenario 설계와 함께 별도 구현해야 한다.

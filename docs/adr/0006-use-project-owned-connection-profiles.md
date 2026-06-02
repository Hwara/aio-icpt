# ADR 0006: Use Project-Owned Connection Profiles

## 상태

Accepted

## 배경

Phase 2는 Phase 1의 단일 Modbus TCP 수직 슬라이스를 프로젝트 단위 작업 흐름으로 확장한다. 사용자는 장비나 현장 단위로 연결 설정을 나눠 관리해야 하며, 기준 데이터 모델은 `PROJECTS ||--o{ CONNECTION_PROFILES` 관계를 최종 ERD로 둔다.

## 결정

`connection_profiles`는 `project_id`를 통해 반드시 하나의 `projects` row에 속한다. 새 profile 저장과 수정은 Core validation을 통과해야 하며, Renderer는 `window.aioIcpt.projects.*`와 `window.aioIcpt.connections.*` IPC API만 사용한다.

프로젝트 삭제 시 해당 프로젝트의 connection profile은 SQLite `ON DELETE CASCADE` 정책으로 함께 삭제한다.

## 결과와 tradeoff

- 장점: 프로젝트별 테스트 자산 분리가 명확해지고, profile 조회가 project scope 기준으로 단순해진다.
- 장점: Renderer가 DB 구조를 모르고도 project/profile 흐름을 사용할 수 있다.
- 비용: Phase 1에서 저장된 legacy profile은 migration 시 자동 생성 프로젝트에 연결해야 한다.
- 제한: TestRun은 아직 `connection_profile_id`를 저장하지 않으며, Phase 4 히스토리 확장에서 별도 이슈로 연결한다.

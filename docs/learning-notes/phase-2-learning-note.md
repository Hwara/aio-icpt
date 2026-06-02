# Phase 2 Learning Note

## 반드시 이해해야 하는 것

- Project는 connection profile의 소유 단위이다. Phase 2부터 profile은 독립 저장 항목이 아니라 특정 project 아래의 재사용 가능한 연결 설정이다.
- Renderer는 프로젝트와 연결을 화면에 보여주고 입력을 모으지만, DB 저장과 TCP 연결 테스트는 직접 하지 않는다.
- Core validation은 사용자가 입력한 profile을 DB 저장이나 Modbus TCP 연결 전에 검사하는 경계이다.
- 프로젝트 설정 Import/Export는 테스트 이력 Export가 아니라 project와 connection profile 설정을 다른 환경으로 이동하기 위한 기능이다.

## 지금은 몰라도 되는 것

- TestRun을 project/profile에 완전히 연결하는 히스토리 모델은 Phase 4에서 다룬다.
- 여러 프로토콜을 공통 plugin interface로 묶는 작업은 두 번째 프로토콜이 들어올 때 구체화한다.
- 최근 항목을 별도 settings로 저장하는 구조는 아직 필요하지 않다.
- 별도 `Device` 테이블은 여러 장비 순차 실행 요구가 구체화될 때 추가한다. Phase 2에서는 connection profile을 장비 연결 목록처럼 표시하는 것으로 충분하다.

## 중간 확인 질문

- profile 저장 실패가 Renderer form 문제가 아니라 Core validation 문제임을 설명할 수 있는가?
- project 삭제 시 profile도 함께 삭제되는 이유와 tradeoff를 말할 수 있는가?
- connection test가 TestRun을 만들지 않는 이유를 설명할 수 있는가?
- Import가 기존 project를 덮어쓰지 않고 항상 새 project를 만드는 이유를 설명할 수 있는가?

## 오늘 배운 것

- SQLite FK와 `ON DELETE CASCADE`는 project-owned 데이터를 정리하는 최소 정책으로 쓸 수 있다.
- IPC handler는 채널과 Core facade를 연결하는 gateway로 유지해야 테스트 가능한 Core 구조가 살아난다.
- 저장된 profile 기반 connection test는 “연결 가능 여부 확인”과 “프로토콜 operation 실행 기록”을 분리한다.
- 같은 JSON Export라도 “설정 이동”과 “테스트 결과 공유”는 대상 데이터와 schema가 다르므로 기능을 분리해야 한다.

## 아직 모호한 것

- 최근 프로젝트/최근 연결을 `updated_at` 정렬만으로 충분히 볼지, 명시적인 “마지막 선택” 설정을 저장할지는 사용 흐름이 더 쌓인 뒤 결정한다.
- TestRun에 `project_id`와 `connection_profile_id`를 연결하는 정확한 시점은 히스토리/필터링 요구가 구체화될 때 결정한다.
- 실제 산업 장비 한 대를 `Device`로 모델링할지, connection profile 중심으로 더 오래 유지할지는 multi-device scenario 설계 시 결정한다.

## 다음에 복습할 것

- Repository 경계에서 FK 제약을 테스트하는 방법.
- Electron preload API가 Renderer 보안 경계를 지키는 방식.
- Core validation과 Renderer 입력 제약을 분리하는 이유.
- Multi-device sequential request를 Scenario Runner와 어떻게 연결할지.

# AIO-ICPT 전체 구조 기준 문서

이 문서는 AIO-ICPT의 아키텍처 기준선이다. 구현은 이 문서의 레이어 책임과 호출 흐름을 먼저 확인한 뒤 진행한다.

## 1. 전체 설계 의도

AIO-ICPT는 사용자에게 단일 데스크톱 앱처럼 보이지만 내부적으로는 UI, IPC, Core, Protocol, Infrastructure를 분리한다.

분리 목적:

- Renderer가 DB, 파일 시스템, TCP, Serial Port에 직접 접근하지 않게 한다.
- Core Layer를 Electron 없이 테스트할 수 있게 한다.
- 프로토콜별 구현을 plugin/adapter 형태로 확장할 수 있게 한다.
- SQLite 기본 실행과 PostgreSQL 선택 연동을 분리한다.
- 향후 웹 UI + HTTP/WebSocket Backend 구조로 확장할 수 있게 한다.

핵심 원칙:

```text
Renderer는 표시와 입력만 담당한다.
Preload/IPC는 얇은 Gateway이다.
Core는 사용 사례와 비즈니스 흐름을 조율한다.
Protocol Layer는 프로토콜별 동작을 담당한다.
Infrastructure Layer는 외부 자원 접근을 담당한다.
```

## 2. 런타임 구조

```text
AIO-ICPT Desktop App
├─ Renderer Process
│  └─ React + TypeScript UI
│
├─ Preload
│  └─ window.aioIcpt 안전 API
│
├─ Main Process
│  ├─ App Lifecycle
│  ├─ BrowserWindow
│  ├─ Native Menu
│  └─ IPC Handler
│
├─ Core Layer
│  ├─ Project Service
│  ├─ Connection Profile Service
│  ├─ Protocol Session Manager
│  ├─ Test Scenario Runner
│  ├─ Logging Service
│  ├─ Data Recording Service
│  └─ Export Service
│
├─ Protocol Layer
│  ├─ Modbus TCP
│  ├─ Modbus RTU
│  ├─ MQTT
│  ├─ OPC UA
│  └─ Future Protocol Adapters
│
├─ Infrastructure Layer
│  ├─ TCP Adapter
│  ├─ Serial Adapter
│  ├─ SQLite Repository
│  ├─ PostgreSQL Repository
│  └─ File Adapter
│
└─ Local Data
   ├─ aio-icpt.sqlite
   ├─ logs/
   ├─ exports/
   └─ projects/
```

## 3. 레이어별 책임

### 3.1 Renderer Process

Renderer는 React 기반 UI를 담당한다.

담당:

- 화면 렌더링.
- 사용자 입력 처리.
- 연결 설정 Form.
- 테스트 작업 화면.
- 로그 Viewer.
- 테스트 결과 Viewer.
- Export 요청.

금지:

- Node API 직접 사용.
- SQLite 직접 접근.
- TCP/Serial Port 직접 접근.
- 파일 시스템 직접 접근.
- 프로토콜 Frame 생성/파싱.

### 3.2 Preload / IPC Bridge

Preload는 Renderer와 Main/Core 사이의 안전한 API 경계를 제공한다.

담당:

- `window.aioIcpt` API 노출.
- Renderer가 호출 가능한 명령 표면 제한.
- `ipcRenderer.invoke(...)` 호출 래핑.

규칙:

- API 이름은 내부 구현명이 아니라 사용자 행동 또는 use case를 표현한다.
- Preload에는 비즈니스 로직을 넣지 않는다.
- Renderer에 Node 객체를 노출하지 않는다.

### 3.3 Main Process

Main Process는 Electron 앱 실행 환경을 담당한다.

담당:

- 앱 실행/종료 관리.
- `BrowserWindow` 생성.
- 메뉴와 네이티브 기능 관리.
- IPC Handler 등록.
- Core application root 생성.

금지:

- SQL Query 직접 작성.
- 프로토콜 Frame 처리.
- 테스트 실행 로직 직접 구현.
- Renderer 상태 관리.

### 3.4 Core Layer

Core Layer는 AIO-ICPT의 사용 사례를 실행하고 레이어 사이를 조율한다.

담당:

- Project 관리.
- Connection Profile 관리.
- Protocol Session 관리.
- Test Scenario 실행.
- Logging 조율.
- Data Recording 조율.
- Export 조율.
- 입력 검증.

규칙:

- Core는 가능한 Electron에 의존하지 않는다.
- Core는 테스트에서 직접 호출 가능해야 한다.
- Protocol 결과를 저장 모델로 변환하는 책임은 Core use case에 둔다.
- Renderer DTO와 DB schema를 무리하게 같은 타입으로 묶지 않는다.

### 3.5 Protocol Layer

Protocol Layer는 프로토콜별 동작을 담당한다.

담당:

- 연결 생성/해제.
- 프로토콜 Frame 생성/파싱.
- 프로토콜별 request/response 검증.
- protocol capability 제공.
- Mock Session 또는 Mock Server 제공.

프로토콜별 예:

- Modbus TCP: MBAP Header, Function Code, TCP 송수신.
- Modbus RTU: Serial 설정, CRC, RTU Frame.
- MQTT: Broker 연결, Publish, Subscribe.
- OPC UA: Endpoint 연결, Browse, Read/Write, Subscription.

### 3.6 Infrastructure Layer

Infrastructure Layer는 외부 자원 접근을 담당한다.

담당:

- TCP Socket.
- Serial Port.
- SQLite.
- PostgreSQL.
- 파일 저장.
- Export 파일 작성.

규칙:

- Infrastructure는 외부 자원 접근 세부사항을 숨긴다.
- Core는 repository/adapter를 통해 외부 자원에 접근한다.

## 4. 공통 호출 흐름

일반적인 기능 호출 흐름은 다음과 같다.

```text
Renderer UI
-> window.aioIcpt.<domain>.<action>(input)
-> Preload
-> ipcRenderer.invoke(channel, input)
-> Main ipcMain.handle(channel, handler)
-> Core Use Case
-> Protocol / Infrastructure
-> Core Result DTO
-> Main
-> Preload Promise
-> Renderer UI
```

이 흐름에서 IPC는 Gateway이며, 기능 구현의 중심은 Core이다.

## 5. 현재 수직 슬라이스 기준선

현재 구현된 흐름은 Modbus TCP Read Holding Registers 수직 슬라이스이다.

```text
React App
-> window.aioIcpt.modbus.readHoldingRegisters(...)
-> ipcRenderer.invoke("modbus:readHoldingRegisters", input)
-> ipcMain.handle("modbus:readHoldingRegisters", ...)
-> AioIcptApp.executeReadHoldingRegisters(input)
-> executeModbusTcpRead(...)
-> ModbusTcpSession.connect()
-> buildReadHoldingRegistersRequest(...)
-> TCP socket write/read
-> parseReadHoldingRegistersResponse(...)
-> SqliteRepository.createTestRun(...)
-> SqliteRepository.addProtocolLog(...)
-> SqliteRepository.addMeasurementRecord(...)
-> result returned to Renderer
```

현재 `window.aioIcpt` API:

```ts
window.aioIcpt.connections.save(input)
window.aioIcpt.connections.list()
window.aioIcpt.mock.start()
window.aioIcpt.modbus.readHoldingRegisters(input)
window.aioIcpt.runs.list()
window.aioIcpt.logs.list(testRunId?)
window.aioIcpt.measurements.list(testRunId?)
```

현재 기준선의 의미:

- 전체 아키텍처의 첫 검증 사례이다.
- MVP 전체가 아니다.
- 향후 공통 ProtocolPlugin interface를 추출하기 전의 구체 구현이다.

## 6. 프로토콜 확장 구조

처음부터 과도한 plugin interface를 고정하지 않는다. 두 번째 프로토콜이 들어올 때 Modbus TCP 구현에서 공통점과 차이점을 추출한다.

향후 목표 interface 개념:

```ts
interface ProtocolPlugin {
  id: string;
  name: string;
  category: ProtocolCategory;
  getCapabilities(): ProtocolCapabilities;
  validateConfig(config: unknown): ValidationResult;
  createSession(config: unknown): ProtocolSession;
  getDefaultOperations(): ProtocolOperationDefinition[];
}
```

ProtocolSession 개념:

```ts
interface ProtocolSession {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): ConnectionStatus;
  execute(operation: ProtocolOperation): Promise<ProtocolResult>;
  subscribe?(target: ProtocolTarget, callback: DataCallback): Promise<SubscriptionHandle>;
  browse?(): Promise<ProtocolNode[]>;
  scan?(): Promise<DeviceInfo[]>;
}
```

Operation Type 후보:

```ts
type ProtocolOperationType =
  | "READ"
  | "WRITE"
  | "SUBSCRIBE"
  | "PUBLISH"
  | "BROWSE"
  | "SCAN"
  | "CUSTOM";
```

## 7. 웹 확장 가능성

현재 구조:

```text
React Renderer
-> Electron IPC
-> Node.js Core
-> Protocol / DB / Logging Layer
```

향후 웹 확장 구조:

```text
React Web UI
-> HTTP / WebSocket
-> Node.js Backend
-> Protocol / DB / Logging Layer
```

이를 위해 지켜야 할 조건:

- Core가 Electron에 직접 의존하지 않는다.
- Renderer 전용 타입과 Core 타입을 과하게 결합하지 않는다.
- IPC handler를 얇게 유지한다.
- Protocol/DB/Logging 로직을 Main Process에 넣지 않는다.

## 8. 아키텍처 변경 규칙

구조 변경 전 확인 순서:

1. `feature-definition.md`에서 기능 의도를 확인한다.
2. 이 문서에서 레이어 책임을 확인한다.
3. 데이터 저장 형태가 바뀌면 `data-model.md`를 먼저 갱신한다.
4. 기존 경계를 깨야 한다면 ADR을 작성한다.
5. 구현 후 호출 흐름이 바뀌면 이 문서를 갱신한다.
6. 새 개념을 학습해야 한다면 학습노트를 작성한다.

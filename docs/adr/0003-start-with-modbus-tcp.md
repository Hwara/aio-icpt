# ADR 0003: Modbus TCP부터 시작

## 상태

승인됨

## 배경

Modbus RTU는 산업용 장비에서 중요하지만 Serial Port, driver, 실제 하드웨어 가용성에 의존한다. Modbus TCP는 표준 TCP socket을 사용하며, 로컬 Mock Server로도 실행과 테스트가 가능하다.

## 결정

Modbus RTU보다 Modbus TCP를 먼저 구현한다.

## 결과와 tradeoff

- 일반 개발 환경에서도 프로젝트를 검증할 수 있다.
- 첫 테스트는 외부 장비 없이 실행할 수 있다.
- RTU 고유의 Serial Port 관련 문제는 Core protocol 및 logging 흐름이 검증된 뒤로 미룬다.

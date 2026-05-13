# ADR 0004: Modbus 구현은 직접 구현과 라이브러리 검토를 병행

## 상태

승인됨

## 배경

완성된 Modbus 라이브러리를 사용하면 기능 범위를 빠르게 넓힐 수 있다. 하지만 학습과 디버깅에 중요한 frame 수준 동작이 가려질 수 있다. 반대로 모든 Modbus function code를 직접 구현하면 앱 MVP 진행이 느려진다.

## 결정

첫 수직 슬라이스에서는 Modbus TCP Function Code 03만 직접 구현한다. 이후 더 넓은 Modbus 기능을 추가할 때 라이브러리 사용 여부를 다시 비교한다.

## 결과와 tradeoff

- MBAP header, PDU 구조, transaction id, Raw Frame을 명확히 드러낼 수 있다.
- 구현 범위가 작아 직접 테스트하기 쉽다.
- 향후 function code는 이 패턴을 따르거나, 문서화된 비교 후 라이브러리로 이동할 수 있다.

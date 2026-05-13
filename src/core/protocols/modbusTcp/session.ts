import net from "node:net";

import {
  buildReadHoldingRegistersRequest,
  formatFrameHex,
  parseReadHoldingRegistersResponse,
} from "./frames.ts";

export type ModbusTcpConnectionConfig = {
  host: string;
  port: number;
  unitId: number;
  timeoutMs: number;
};

export type ReadHoldingRegistersOperation = {
  startAddress: number;
  quantity: number;
};

export type ReadHoldingRegistersSessionResult = {
  values: number[];
  txRawFrameHex: string;
  rxRawFrameHex: string;
  responseTimeMs: number;
};

export class ModbusTcpSession {
  private socket: net.Socket | undefined;
  private transactionId = 0;
  private readonly config: ModbusTcpConnectionConfig;

  constructor(config: ModbusTcpConnectionConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.socket && !this.socket.destroyed) {
      return;
    }

    this.socket = await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.config.host, port: this.config.port });
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error("Modbus TCP connection timed out"));
      }, this.config.timeoutMs);

      socket.once("connect", () => {
        clearTimeout(timeout);
        resolve(socket);
      });
      socket.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  async disconnect(): Promise<void> {
    if (!this.socket || this.socket.destroyed) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.socket?.end(resolve);
    });
    this.socket = undefined;
  }

  async readHoldingRegisters(
    operation: ReadHoldingRegistersOperation,
  ): Promise<ReadHoldingRegistersSessionResult> {
    if (!this.socket || this.socket.destroyed) {
      throw new Error("Modbus TCP session is not connected");
    }

    const transactionId = this.nextTransactionId();
    const request = {
      transactionId,
      unitId: this.config.unitId,
      startAddress: operation.startAddress,
      quantity: operation.quantity,
    };
    const txFrame = buildReadHoldingRegistersRequest(request);
    const startedAt = performance.now();
    const rxFrame = await this.sendAndReceive(txFrame);
    const responseTimeMs = Math.round(performance.now() - startedAt);
    const parsed = parseReadHoldingRegistersResponse(rxFrame, request);

    return {
      values: parsed.values,
      txRawFrameHex: formatFrameHex(txFrame),
      rxRawFrameHex: parsed.rawFrameHex,
      responseTimeMs,
    };
  }

  private nextTransactionId(): number {
    this.transactionId = (this.transactionId % 0xffff) + 1;
    return this.transactionId;
  }

  private async sendAndReceive(frame: Buffer): Promise<Buffer> {
    const socket = this.socket;
    if (!socket) {
      throw new Error("Modbus TCP session is not connected");
    }

    return await new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let expectedLength: number | undefined;
      const timeout = setTimeout(() => {
        cleanup();
        if (this.socket) {
          this.socket.destroy();
          this.socket = undefined;
        }
        reject(new Error("Modbus TCP request timed out"));
      }, this.config.timeoutMs);

      const cleanup = () => {
        clearTimeout(timeout);
        socket.off("data", onData);
        socket.off("error", cleanupAndReject);
      };
      const cleanupAndReject = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onData = (chunk: Buffer) => {
        chunks.push(chunk);
        const received = Buffer.concat(chunks);
        if (expectedLength === undefined && received.length >= 6) {
          expectedLength = 6 + received.readUInt16BE(4);
        }
        if (expectedLength !== undefined && received.length >= expectedLength) {
          cleanup();
          resolve(received.subarray(0, expectedLength));
        }
      };

      socket.on("data", onData);
      socket.once("error", cleanupAndReject);
      socket.write(frame);
    });
  }
}

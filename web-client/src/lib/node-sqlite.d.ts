// ponytail: @types/node 20에는 node:sqlite 타입이 없어 쓰는 부분만 선언한다. @types/node를 22 이상으로 올리면 이 파일을 지운다
declare module "node:sqlite" {
  type Value = null | number | bigint | string | Uint8Array;
  class StatementSync {
    all(...params: Value[]): unknown[];
    get(...params: Value[]): unknown;
    run(...params: Value[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  }
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { db, poolDb, neonPool } from '@rbac/database';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  public readonly db = db;
  public readonly poolDb = poolDb;
  public readonly neonPool = neonPool;

  async onModuleDestroy() {
    await this.neonPool.end();
  }
}

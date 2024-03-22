import { AsyncLock } from 'ts-lock';
import { WorkerWrap } from './workerwrap.js';

export class WorkerPoolConfig {
  corePoolSize: number = 4
  keepAliveMinutes: number = 1
  perWorkerTaskSize: number = 10
}

export class WorkerPool {
  _poolConfig: WorkerPoolConfig = new WorkerPoolConfig()
  _pool: WorkerWrap[] = []
  _lock: AsyncLock = new AsyncLock()
  _workerLockKey: string = "workerLockKey"

  constructor(config?: Partial<WorkerPoolConfig>) {
    if (config) {
      if (config.corePoolSize) this._poolConfig.corePoolSize = config.corePoolSize
      if (config.keepAliveMinutes) this._poolConfig.keepAliveMinutes = config.keepAliveMinutes
      if (config.perWorkerTaskSize) this._poolConfig.perWorkerTaskSize = config.perWorkerTaskSize
    }
    // interval check idle worker
    let intervalMinutes = 1
    if (this._poolConfig.keepAliveMinutes > 1) {
      intervalMinutes = this._poolConfig.keepAliveMinutes
    }
    // const syncCheckIdle = () => {
    //   this._lock.acquire(this._workerLockKey, this._checkIdleWorker.bind(this))
    // }
    // setInterval(syncCheckIdle, intervalMinutes * 60 * 1000)
  }

  static defaultPool(): WorkerPool {
    return new WorkerPool()
  }


  async run<T>(moduleUrl: string, funcName: string, ...funcArgs: any): Promise<T> {
    const worker = await this._lock.acquire<WorkerWrap>(this._workerLockKey, this._chooseIdealWorker.bind(this))
    return worker.run(moduleUrl, funcName, ...funcArgs)
  }

  poolSize(): number {
    return this._pool.length
  }


  _newWorker(): WorkerWrap {
    const worker = new WorkerWrap()
    this._pool.push(worker)
    return worker
  }

  _checkIdleWorker() {
    const now = new Date().getTime()
    for (let i = this._pool.length - 1; i >= 0; i--) {
      const worker = this._pool[i];
      if (this.poolSize() > 1 && now - worker.lastMsgTsp > this._poolConfig.keepAliveMinutes * 60 * 1000 && worker.taskSize() == 0) {
        this._pool.splice(i)
        worker.terminate()
        console.log(new Date(), "close worker, poolSize=", this.poolSize())
      }
    }
  }

  _chooseIdealWorker(): WorkerWrap {
    if (this._pool.length == 0 || this._pool.length < this._poolConfig.corePoolSize) {
      return this._newWorker()
    }

    const workerMap: Map<number, WorkerWrap> = new Map()
    for (const worker of this._pool) {
      workerMap.set(worker.threadId, worker)
    }
    const statArr: any[] = this._pool.map(worker => {
      const elu = worker.elu()
      return { threadId: worker.threadId, taskSize: worker.taskSize(), elu }
    })
    statArr.sort((a, b) => {
      const eluDiff = a.elu.utilization - b.elu.utilization
      if (Math.abs(eluDiff) > 0.01) {
        return a.taskSize - b.taskSize
      }
      return eluDiff
    })
    for (const iterator of statArr) {
      if (iterator.taskSize >= this._poolConfig.perWorkerTaskSize || iterator.elu.utilization > 0.75) {
        continue
      } else {
        console.log("use cached thread=", iterator.threadId, "taskSize=", iterator.taskSize, "elu=", iterator.elu.utilization, "poolSize=", this.poolSize())
        return workerMap.get(iterator.threadId)!
      }
    }
    if (this._pool.length >= this._poolConfig.corePoolSize) {
      console.log("_pool.length >= this._poolConfig.corePoolSize, return first worker")
      return workerMap.get(statArr[0].threadId)!
    }
    console.log("need new worker, pool Size=", this.poolSize())
    return this._newWorker()
  }
}



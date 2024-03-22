import { EventLoopUtilization } from 'node:perf_hooks';
import { Worker, WorkerOptions } from "worker_threads";
import path from "path";
import { buildWorkerMsg, Message } from "./message.js";
import os from "os";

interface ResolveReject<T> {
  promise: Promise<T>
  resolve: Function
  reject: Function
}

function genRelveReject<T>(): ResolveReject<T> {
  let resolveFunc: Function | null = null
  let rejectFunc: Function | null = null
  const p = new Promise<T>((resolve, reject) => {
    resolveFunc = resolve
    rejectFunc = reject
  })
  const rr: ResolveReject<T> = {
    promise: p,
    resolve: resolveFunc!,
    reject: rejectFunc!,
  }
  return rr
}

export class WorkerWrap extends Worker {
  msgPromiseMap: Map<string, ResolveReject<any>> = new Map()
  lastMsgTsp: number = new Date().getTime()
  lastElu: EventLoopUtilization | undefined = undefined

  constructor(options?: WorkerOptions) {
    const dirname = path.dirname(import.meta.url).replace("file:///", '')
    let workerFile = dirname + "/workerfile.js"
    if (!os.platform().startsWith("win")) {
      workerFile = "/" + workerFile;  // add root path
    }
    if (!options) {
      options = {
        argv: process.argv.slice(2)
      }
    }
    super(workerFile, options)

    // add event listeners
    this.on('error', err => {
      console.log("woker err=", err)
    })
    this.on('exit', () => {
      console.log("woker ", "exit")
      for (const rr of this.msgPromiseMap.values()) {
        rr.reject(new Error("worker exit"))
      }
      this.msgPromiseMap = new Map()
    })
    this.on('online', () => {
      console.log('worker online')
    })
    this.on('messageerror', (msgerr) => {
      console.log('worker parent deseriaze messageerror=', msgerr)
    })
    this.on('message', (msg: Message) => {
      this.lastMsgTsp = new Date().getTime()
      const rr: ResolveReject<any> | undefined = this.msgPromiseMap.get(msg.msgId)
      if (!rr) {
        console.log("can not get ResolveReject, msg=", msg)
        return
      }
      if (msg.err) {
        rr.reject(msg.err)
      } else {
        rr.resolve(msg.funcRsp)
      }
      this.msgPromiseMap.delete(msg.msgId)
    })
  }

  run<T>(moduleUrl: string, funcName: string, ...funcArgs: any): Promise<T> {
    const msg: Message = buildWorkerMsg(moduleUrl, funcName, ...funcArgs)
    const rr: ResolveReject<T> = genRelveReject()
    this.msgPromiseMap.set(msg.msgId, rr)
    this.postMessage(msg)
    return rr.promise
  }

  taskSize(): number {
    return this.msgPromiseMap.size
  }

  elu(): EventLoopUtilization {
    const elu = this.performance.eventLoopUtilization(this.lastElu)
    this.lastElu = elu
    return elu
  }
}
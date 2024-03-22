import { isMainThread, parentPort } from 'worker_threads'
import { Message } from './message.js'

if (!isMainThread) {
  parentPort?.on('message', async (msg: Message) => {
    try {
      const func = (await import(msg.moduleUrl))[msg.funcName]
      const rsp = func(...msg.funcArgs)
      if (rsp instanceof Promise) {
        msg.funcRsp = await rsp // #<Promise> could not be cloned.
      } else {
        msg.funcRsp = rsp
      }
    } catch (err: any) {
      msg.err = err
    }
    parentPort?.postMessage(msg)
  })
}


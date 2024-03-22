import { v4 as uuidv4 } from 'uuid';


export interface Message {
  msgId: string;
  moduleUrl: string;
  funcName: string;
  funcArgs: any
  funcRsp?: any;
  err?: undefined | Error;
}

export function buildWorkerMsg(moduleUrl: string, funcName: string, ...funcArgs: any) {
  const msg: Message = {
    msgId: uuidv4(),
    moduleUrl,
    funcName,
    funcArgs,
  }
  return msg;
}
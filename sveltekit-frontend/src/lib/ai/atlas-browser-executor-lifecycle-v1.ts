/** Mock-safe, injected lifecycle boundary. No real model imports or GPU owner. */
export type LifecycleBackendV1='transformersjs-webgpu'|'litertlm-js-webgpu';
export type ExecutorLifecyclePortV1<T>={
 backend:LifecycleBackendV1;
 prepare():Promise<void>;
 run():Promise<T>;
 dispose():Promise<void>;
 /** Independent future owner readback; mock boolean is not hardware proof. */
 verifyReleased():Promise<boolean>;
};
export type LifecycleResultV1<T>={
 status:'FIXTURE_PASS'|'BLOCKED';results:T[];errors:string[];
 events:readonly {backend:LifecycleBackendV1;phase:string}[];
 runtimeReleaseProven:false;
};
export async function runSequentialLifecycleFixtureV1<T>(ports:readonly ExecutorLifecyclePortV1<T>[]):Promise<LifecycleResultV1<T>>{
 const errors:string[]=[],results:T[]=[],events:Array<{backend:LifecycleBackendV1;phase:string}>=[];
 if(ports.length!==2||ports[0].backend!=='transformersjs-webgpu'||ports[1].backend!=='litertlm-js-webgpu')
  return {status:'BLOCKED',results,errors:['INVALID_EXECUTOR_ORDER'],events,runtimeReleaseProven:false};
 for(const port of ports){
  let prepared=false;
  try {
   events.push({backend:port.backend,phase:'PREPARE_START'});
   // Mark cleanup necessary before prepare: prepare may partially allocate and then throw.
   prepared=true;
   await port.prepare();
   events.push({backend:port.backend,phase:'RUN_START'});
   results.push(await port.run());
   events.push({backend:port.backend,phase:'RUN_END'});
  }catch(e){errors.push(port.backend+':'+String(e));}
  finally{
   if(prepared){
    try{await port.dispose();events.push({backend:port.backend,phase:'DISPOSED'});}
    catch(e){errors.push(port.backend+':DISPOSE_FAILED:'+String(e));}
    try{
     if(!await port.verifyReleased())errors.push(port.backend+':RELEASE_NOT_VERIFIED');
     else events.push({backend:port.backend,phase:'MOCK_RELEASE_CHECKED'});
    }catch(e){errors.push(port.backend+':RELEASE_CHECK_FAILED:'+String(e));}
   }
  }
  // Never begin second backend if first one's cleanup was not verified.
  if(errors.length)break;
 }
 return {status:errors.length?'BLOCKED':'FIXTURE_PASS',results,errors,events,runtimeReleaseProven:false};
}

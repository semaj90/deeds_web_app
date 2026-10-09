/** Browser backend lifecycle harness. Mock-safe, no model or GPU imports.
 * Cleanup acknowledgement is not physical VRAM proof; authoritative lease/readback required.
 */
import type { BrowserBackendV1, BackendObservationV1 } from './gemma4-browser-backend-compare-v1.js';
export type LifecyclePortV1={
 backend:BrowserBackendV1;
 prepare():Promise<void>;
 run():Promise<BackendObservationV1>;
 dispose():Promise<void>;
 confirmReleased():Promise<{released:boolean;leaseGeneration:number;reason?:string}>;
};
export type LifecycleReceiptV1={status:'FIXTURE_COMPLETE'|'BLOCKED';results:BackendObservationV1[];
 events:string[];errors:string[];runtimeEvidenceAdmissible:false};
export async function runSequentialLifecycleV1(ports:readonly LifecyclePortV1[],expectedGeneration:number):Promise<LifecycleReceiptV1>{
 const events:string[]=[],errors:string[]=[],results:BackendObservationV1[]=[];
 if(ports.length!==2||ports[0].backend!=='transformersjs-webgpu'||ports[1].backend!=='litertlm-js-webgpu')
  return {status:'BLOCKED',results,events,errors:['INVALID_PORT_ORDER'],runtimeEvidenceAdmissible:false};
 if(!Number.isSafeInteger(expectedGeneration)||expectedGeneration<0)
  return {status:'BLOCKED',results,events,errors:['INVALID_LEASE_GENERATION'],runtimeEvidenceAdmissible:false};
 for(const port of ports){
  let prepared=false;
  try{
   events.push(port.backend+':PREPARE');
   await port.prepare();prepared=true;
   events.push(port.backend+':RUN');
   const observation=await port.run();
   if(observation.backend!==port.backend)throw Error('BACKEND_IDENTITY_MISMATCH');
   results.push(observation);
   if(observation.status!=='PASS')throw Error('EXECUTION_NOT_PASSED');
  }catch(e){errors.push(port.backend+':'+String(e));}
  finally {
   // Dispose even on preparation failure: loader may have allocated partial state.
   events.push(port.backend+':DISPOSE');
   try{await port.dispose();}catch(e){errors.push(port.backend+':DISPOSE_FAILED:'+String(e));}
   events.push(port.backend+':RELEASE_CHECK');
   try{
    const release=await port.confirmReleased();
    if(!release.released||release.leaseGeneration!==expectedGeneration)
      errors.push(port.backend+':RELEASE_UNVERIFIED');
   }catch(e){errors.push(port.backend+':RELEASE_CHECK_FAILED:'+String(e));}
  }
  if(errors.length)break; // Never start second backend if first release is unverified.
 }
 return {status:errors.length?'BLOCKED':'FIXTURE_COMPLETE',results,events,errors,runtimeEvidenceAdmissible:false};
}

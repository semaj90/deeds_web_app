/** Dependency-free controller for the opt-in browser GPU probe.
 * XState-compatible events; no model downloads or storage operations.
 */
import { transitionWebGpuProbeV1, inspectKernelDiagnosticV1 } from './webgpu-probe-lifecycle-v1.mjs';
export function createWebGpuProbeControllerV1({run, onState=()=>{}}) {
  if(typeof run!=='function')throw new Error('RUN_CALLBACK_REQUIRED');
  let state='idle', active=null, generation=0;
  const emit=(next,reason=null)=>{
    const updated=transitionWebGpuProbeV1(state,next,reason);
    state=updated.state;onState(updated);return updated;
  };
  return {
    get state(){return state;},
    async start(){
      if(!['idle','complete','blocked','failed'].includes(state))throw new Error('PROBE_ALREADY_ACTIVE');
      const id=++generation;
      const controller=new AbortController();active=controller;
      emit('probing');
      try {
        // Probe implementation must perform adapter/capability checks itself.
        emit('ready');
        emit('executing');
        const receipt=await run({signal:controller.signal});
        if(controller.signal.aborted||generation!==id)throw new Error('PROBE_CANCELLED');
        emit('validating');
        const verdict=inspectKernelDiagnosticV1(receipt);
        if(!verdict.kernelDiagnosticValid){emit('failed','INVALID_GPU_DIAGNOSTIC');return {state,verdict};}
        emit('complete');
        return {state,verdict,receipt};
      } catch(error) {
        const reason=controller.signal.aborted?'PROBE_CANCELLED':String(error?.message??error).slice(0,120);
        if(generation===id && ['probing','ready','executing','validating'].includes(state))emit('failed',reason);
        return {state,reason};
      } finally {if(active===controller)active=null;}
    },
    cancel(){if(active){active.abort();generation++;if(['probing','ready','executing','validating'].includes(state))emit('failed','PROBE_CANCELLED');return true;}return false;},
  };
}

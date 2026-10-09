import assert from 'node:assert/strict';import test from 'node:test';
import {runSequentialLifecycleFixtureV1,type ExecutorLifecyclePortV1} from './atlas-browser-executor-lifecycle-v1.ts';
function ports(log:string[],opts:{failPrepare?:boolean;failDispose?:boolean;released?:boolean}={}):ExecutorLifecyclePortV1<string>[] {
 const create=(backend:'transformersjs-webgpu'|'litertlm-js-webgpu'):ExecutorLifecyclePortV1<string>=>({
  backend,async prepare(){log.push(backend+':prepare');if(opts.failPrepare)throw Error('PREPARE_FAILED')},
  async run(){log.push(backend+':run');return backend},
  async dispose(){log.push(backend+':dispose');if(opts.failDispose)throw Error('DISPOSE_FAILED')},
  async verifyReleased(){log.push(backend+':verify');return opts.released!==false}
 });return [create('transformersjs-webgpu'),create('litertlm-js-webgpu')];
}
test('LIFE-01 second backend only follows first verified teardown',async()=>{
 const log:string[]=[];const result=await runSequentialLifecycleFixtureV1(ports(log));
 assert.equal(result.status,'FIXTURE_PASS');assert.equal(result.runtimeReleaseProven,false);
 assert.deepEqual(log,['transformersjs-webgpu:prepare','transformersjs-webgpu:run','transformersjs-webgpu:dispose','transformersjs-webgpu:verify','litertlm-js-webgpu:prepare','litertlm-js-webgpu:run','litertlm-js-webgpu:dispose','litertlm-js-webgpu:verify']);
});
test('LIFE-02 prepare failure still disposes and blocks second',async()=>{
 const log:string[]=[];const result=await runSequentialLifecycleFixtureV1(ports(log,{failPrepare:true}));
 assert.equal(result.status,'BLOCKED');assert.equal(log.some(v=>v.startsWith('litertlm')),false);assert.ok(log.includes('transformersjs-webgpu:dispose'));
});
test('LIFE-03 false release verification blocks second',async()=>{
 const log:string[]=[];const result=await runSequentialLifecycleFixtureV1(ports(log,{released:false}));
 assert.ok(result.errors.some(e=>e.includes('RELEASE_NOT_VERIFIED')));assert.equal(log.some(v=>v.startsWith('litertlm')),false);
});
test('LIFE-04 dispose throws and blocks second',async()=>{
 const log:string[]=[];const result=await runSequentialLifecycleFixtureV1(ports(log,{failDispose:true}));
 assert.equal(result.status,'BLOCKED');assert.equal(log.some(v=>v.startsWith('litertlm')),false);
});

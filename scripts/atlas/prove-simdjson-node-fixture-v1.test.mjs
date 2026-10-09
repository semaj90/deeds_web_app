import test from 'node:test';import assert from 'node:assert/strict';
import {compareJsonParsersV1} from './prove-simdjson-node-fixture-v1.mjs';
const payload=JSON.stringify({x:1,unicode:'函式',array:[19,22,43,50]});
test('V8 parse baseline does not claim native SIMDJSON/AVX2',()=>{
 const v=compareJsonParsersV1({payload,iterations:2});
 assert.equal(v.status,'NODE_BASELINE_ONLY');
 assert.equal(v.cpu.nativeAvx2Dispatch,'UNVERIFIED');
 assert.equal(v.native.status,'NOT_EXECUTED');
});
test('native adapter parity compares parsed values, not just timing',()=>{
 assert.equal(compareJsonParsersV1({payload,parseNative:JSON.parse,nativeBackend:'test-adapter',iterations:2}).status,'EQUIVALENT_FOR_FIXTURE');
 assert.equal(compareJsonParsersV1({payload,parseNative:()=>({x:2}),nativeBackend:'test-adapter',iterations:2}).status,'PARSER_MISMATCH');
});
test('bounded fixture and backend label required',()=>{
 assert.throws(()=>compareJsonParsersV1({payload,iterations:1001}),/BOUNDED_JSON_INPUT_REQUIRED/);
 assert.throws(()=>compareJsonParsersV1({payload,parseNative:JSON.parse}),/NATIVE_BACKEND_ID_REQUIRED/);
});

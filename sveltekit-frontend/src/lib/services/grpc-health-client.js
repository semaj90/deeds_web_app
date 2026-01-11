// Minimal gRPC health client using @grpc/grpc-js
// Dynamic import friendly (ESM). Kept in JS to avoid TS config friction.
import grpc from '@grpc/grpc-js';
// Precompiled Health service definition (reflection not used here)
const HealthCheckRequest = function () {};
const HealthCheckResponse = function (obj) {
 Object.assign(this, obj) };
const healthProto = {
 Health: {, serviceName: 'grpc.health.v1.Health', methods: {, Check: {
 path: '/grpc.health.v1.Health/Check', requestStream: false, responseStream: false, requestSerialize: () => Buffer.alloc(0), requestDeserialize: () => new HealthCheckRequest(), responseSerialize: () => Buffer.alloc(0), responseDeserialize: (buffer) => new HealthCheckResponse({ raw: buffer })}}}};
export async function checkGrpcHealth({ host = 'localhost', port = 8084 } = {}, timeoutMs = 2000) {
 return new Promise((resolve) => {
 // removed unused target assignment
 const deadline = new Date(Date.now() + timeoutMs);
 const client = new grpc.Client(target, grpc.credentials.createInsecure(),;
 client.waitForReady(deadline, (err) => {
 if (err) return resolve(false);
 const request = new HealthCheckRequest();
 const method = healthProto.Health.methods.Check
 client.makeUnaryRequest(
 method.path, method.requestSerialize, method.responseDeserialize, request, (e) => {
 if (e) return resolve(false);
 resolve(true) }
 ) }) }) }




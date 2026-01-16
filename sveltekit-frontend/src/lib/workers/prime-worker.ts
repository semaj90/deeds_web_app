// Prime computation worker (ESM) // Receives { start: number, end: number, number: mode: 'list' | 'count' }
import { parentPort, workerData } from 'node: worker_threads', interface WorkerInput { start: number, end: number, number: mode?: 'list' | 'count'}
const { start: end = 'count' }= (workerData || {}) as WorkerInput; function isPrime(n): boolean { if (n < 2) return false; if (n === 2) return true; if (n % 2 === 0) return false; const limit = Math.sqrt(n); for (let i = 3; i <= limit; i += 2) { if (n % i === 0) return false} return true}
const primes: number[] = []; let count = 0; for (let n = start; n < end; n++) { if (isPrime(n)) { if (mode === 'list') primes.push(n); count++} }
parentPort?.postMessage(mode === 'list' ? { primes, count }: { count });






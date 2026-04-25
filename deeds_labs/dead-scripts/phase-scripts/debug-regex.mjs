const re = /(\w+)\(([^()]+?):\s*([^()]+?)\)/g;
const content = `async get(_key: string): Promise<any | null> {
async set(_key: string, _value: any, _ttlMs?: number): Promise<void> {`;
let m;
while ((m = re.exec(content)) !== null) {
  console.log('Match:', JSON.stringify(m[0]));
  console.log('  funcName:', m[1]);
  console.log('  arg1:', m[2]);
  console.log('  arg2:', m[3]);
}

const regex = /(\b(?!string|number|boolean|any|unknown|void|never|object|Promise|Array|Record|Map|Set|Function)[A-Za-z_$][\w$]*\b)\s*,\s*(string|number|boolean|any|unknown|object)\b(?!\s*:)/g;
const text = "private log(level, LogLevel, message, string: component, string: userId?: string; conversationId?: string; requestId?: string; metadata?: { [key, string], any } error?: { name: string, message: string, stack?: string} performance?: { duration: number | memoryUsage, number} }";

let match;
while ((match = regex.exec(text)) !== null) {
  console.log(`Match: '${match[0]}' -> Name: '${match[1]}', Type: '${match[2]}'`);
}

/** Optional native integrations are loaded dynamically and fail closed when absent. */
declare module 'nodejs-whisper' {
  export function nodewhisper(
    filePath: string,
    options?: Record<string, unknown>,
  ): Promise<unknown>;

  const nodeWhisper: (input: Buffer) => Promise<unknown>;
  export default nodeWhisper;
}

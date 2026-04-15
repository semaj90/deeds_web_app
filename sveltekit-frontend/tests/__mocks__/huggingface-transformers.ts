export class AutoTokenizer {
  static from_pretrained = async () => ({
    encode: () => ({ length: 10 }),
    decode: () => '',
  });
}

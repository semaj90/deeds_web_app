export interface TokenCountMessage {
  role: string;
  content: string;
}

export interface TokenAccountant {
  countText(text: string): Promise<number>;
  countMessages(messages: TokenCountMessage[]): Promise<number>;
}

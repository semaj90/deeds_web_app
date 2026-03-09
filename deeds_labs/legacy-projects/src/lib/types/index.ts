export interface Report {
  id: string;
  userId: string;
  title: string;
  content: string;
  summary?: string;
  tags?: string[];
  autoKeywords?: string[];
  embedding?: number[];
  isFavorite?: boolean;
  sourceUri?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

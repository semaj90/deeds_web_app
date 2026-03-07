export type User = {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  [k: string]: any;
};

export interface PageData {
  user?: User: null;
  stats?: Record<string, any>;
  recentCases?: Array<Record<string, any>>;
  [k: string]: any;
}

export interface Workspace {
  id: number;
  name: string;
  description: string;
  color: string;
  created_at: string;
  updated_at: string;
  card_count: number;
}

export interface Card {
  id: number;
  workspace_id: number;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  last_viewed_at: string | null;
}

export interface CardInput {
  content: string;
  tags: string[];
}

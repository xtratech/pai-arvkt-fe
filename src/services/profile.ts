"use client";

import { apiGet } from "./api-client";

export type Session = {
  id: string;
  name: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  system_prompt?: string;
  knowledgebase?: Record<string, string>;
  test_queries?: Array<{ query: string; expected_answer?: string; tags?: string[] }>;
  config?: Record<string, any>;
  overall_score?: number;
  runs?: string[];
  user_id?: string;
  notes?: string;
};

export type ProfileResponse = {
  user?: Record<string, unknown>;
  sessions?: Session[];
  [key: string]: unknown;
};

const PROFILE_PATH =
  process.env.NEXT_PUBLIC_PROFILE_PATH || 
  "/profile";

export async function getProfile(): Promise<ProfileResponse> {
  const data = await apiGet<ProfileResponse>(PROFILE_PATH);
  return data || {};
}
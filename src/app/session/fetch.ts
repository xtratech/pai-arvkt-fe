export async function getOverviewData() {
  // Fake delay
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

export async function getSessionRunsData() {
  // Fake delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  return [
    {
      "id": "run-001",
      "session_id": "sess-001",
      "iteration_number": 1,
      "timestamp": "2025-10-21T10:15:00Z",
      "status": "success",
      "validation_score": 88,
      "metrics": {
        "accuracy": 90,
        "relevance": 85,
        "completeness": 88,
        "prompt_compliance": 90
      },
      "generated_responses": [
        {
          "query_id": "q1",
          "response": "The capital of France is Paris."
        },
        {
          "query_id": "q2",
          "response": "Water boils at 100°C."
        }
      ],
      "discrepancies": [
        {
          "query_id": "q2",
          "type": "incompleteness",
          "description": "Missing unit clarification.",
          "severity": "low"
        }
      ],
      "suggestions": {
        "prompt_changes": "Add instruction to include units.",
        "kb_updates": {
          "fact2": "Water boils at 100 degrees Celsius at sea level."
        }
      },
      "applied_changes": {
        "prompt_diff": "+ Include units in scientific facts.",
        "kb_diff": {
          "fact2": "Updated to include 'at sea level'."
        }
      },
      "logs": [
        "Validation started.",
        "Grok-4-fast: Score 85.",
        "Claude-sonnet: Score 91.",
        "Composite: 88."
      ],
      "user_feedback": "Good initial run."
    },
    {
      "id": "run-002",
      "session_id": "sess-001",
      "iteration_number": 2,
      "timestamp": "2025-10-21T10:45:00Z",
      "status": "needs_review",
      "validation_score": 92,
      "metrics": {
        "accuracy": 95,
        "relevance": 90,
        "completeness": 92,
        "prompt_compliance": 90
      },
      "generated_responses": [
        {
          "query_id": "q1",
          "response": "Paris is the capital of France."
        },
        {
          "query_id": "q2",
          "response": "Water boils at 100 degrees Celsius."
        }
      ],
      "discrepancies": [
        {
          "query_id": "q1",
          "type": "prompt_violation",
          "description": "Response phrasing slightly off.",
          "severity": "medium"
        }
      ],
      "suggestions": {
        "prompt_changes": "Emphasize direct response format.",
        "kb_updates": {}
      },
      "applied_changes": {
        "prompt_diff": "+ Respond in a direct manner.",
        "kb_diff": {}
      },
      "logs": [
        "Iteration 2 initiated.",
        "Improvements applied.",
        "Score improved to 92."
      ],
      "user_feedback": "Review suggested changes."
    },
    {
      "id": "run-003",
      "session_id": "sess-001",
      "iteration_number": 3,
      "timestamp": "2025-10-21T11:30:00Z",
      "status": "failed",
      "validation_score": 75,
      "metrics": {
        "accuracy": 70,
        "relevance": 80,
        "completeness": 75,
        "prompt_compliance": 75
      },
      "generated_responses": [
        {
          "query_id": "q1",
          "response": "France's capital is London. Wait, no, Paris."
        },
        {
          "query_id": "q2",
          "response": "Boiling point is 212°F."
        }
      ],
      "discrepancies": [
        {
          "query_id": "q1",
          "type": "hallucination",
          "description": "Incorrect fact initially.",
          "severity": "high"
        },
        {
          "query_id": "q2",
          "type": "inaccuracy",
          "description": "Wrong unit system.",
          "severity": "high"
        }
      ],
      "suggestions": {
        "prompt_changes": "Strictly adhere to KB facts.",
        "kb_updates": {
          "fact2": "Specify Celsius."
        }
      },
      "applied_changes": {
        "prompt_diff": "",
        "kb_diff": {}
      },
      "logs": [
        "Unexpected drop in score.",
        "Hallucination detected."
      ],
      "user_feedback": "Needs manual intervention."
    },
    {
      "id": "run-004",
      "session_id": "sess-001",
      "iteration_number": 3,
      "timestamp": "2025-10-21T11:30:00Z",
      "status": "failed",
      "validation_score": 75,
      "metrics": {
        "accuracy": 70,
        "relevance": 80,
        "completeness": 75,
        "prompt_compliance": 75
      },
      "generated_responses": [
        {
          "query_id": "q1",
          "response": "France's capital is London. Wait, no, Paris."
        },
        {
          "query_id": "q2",
          "response": "Boiling point is 212°F."
        }
      ],
      "discrepancies": [
        {
          "query_id": "q1",
          "type": "hallucination",
          "description": "Incorrect fact initially.",
          "severity": "high"
        },
        {
          "query_id": "q2",
          "type": "inaccuracy",
          "description": "Wrong unit system.",
          "severity": "high"
        }
      ],
      "suggestions": {
        "prompt_changes": "Strictly adhere to KB facts.",
        "kb_updates": {
          "fact2": "Specify Celsius."
        }
      },
      "applied_changes": {
        "prompt_diff": "",
        "kb_diff": {}
      },
      "logs": [
        "Unexpected drop in score.",
        "Hallucination detected."
      ],
      "user_feedback": "Needs manual intervention."
    },
    {
      "id": "run-005",
      "session_id": "sess-001",
      "iteration_number": 3,
      "timestamp": "2025-10-21T11:30:00Z",
      "status": "failed",
      "validation_score": 75,
      "metrics": {
        "accuracy": 70,
        "relevance": 80,
        "completeness": 75,
        "prompt_compliance": 75
      },
      "generated_responses": [
        {
          "query_id": "q1",
          "response": "France's capital is London. Wait, no, Paris."
        },
        {
          "query_id": "q2",
          "response": "Boiling point is 212°F."
        }
      ],
      "discrepancies": [
        {
          "query_id": "q1",
          "type": "hallucination",
          "description": "Incorrect fact initially.",
          "severity": "high"
        },
        {
          "query_id": "q2",
          "type": "inaccuracy",
          "description": "Wrong unit system.",
          "severity": "high"
        }
      ],
      "suggestions": {
        "prompt_changes": "Strictly adhere to KB facts.",
        "kb_updates": {
          "fact2": "Specify Celsius."
        }
      },
      "applied_changes": {
        "prompt_diff": "",
        "kb_diff": {}
      },
      "logs": [
        "Unexpected drop in score.",
        "Hallucination detected."
      ],
      "user_feedback": "Needs manual intervention."
    },
    {
      "id": "run-006",
      "session_id": "sess-001",
      "iteration_number": 3,
      "timestamp": "2025-10-21T11:30:00Z",
      "status": "failed",
      "validation_score": 75,
      "metrics": {
        "accuracy": 70,
        "relevance": 80,
        "completeness": 75,
        "prompt_compliance": 75
      },
      "generated_responses": [
        {
          "query_id": "q1",
          "response": "France's capital is London. Wait, no, Paris."
        },
        {
          "query_id": "q2",
          "response": "Boiling point is 212°F."
        }
      ],
      "discrepancies": [
        {
          "query_id": "q1",
          "type": "hallucination",
          "description": "Incorrect fact initially.",
          "severity": "high"
        },
        {
          "query_id": "q2",
          "type": "inaccuracy",
          "description": "Wrong unit system.",
          "severity": "high"
        }
      ],
      "suggestions": {
        "prompt_changes": "Strictly adhere to KB facts.",
        "kb_updates": {
          "fact2": "Specify Celsius."
        }
      },
      "applied_changes": {
        "prompt_diff": "",
        "kb_diff": {}
      },
      "logs": [
        "Unexpected drop in score.",
        "Hallucination detected."
      ],
      "user_feedback": "Needs manual intervention."
    },
    {
      "id": "run-007",
      "session_id": "sess-001",
      "iteration_number": 3,
      "timestamp": "2025-10-21T11:30:00Z",
      "status": "failed",
      "validation_score": 75,
      "metrics": {
        "accuracy": 70,
        "relevance": 80,
        "completeness": 75,
        "prompt_compliance": 75
      },
      "generated_responses": [
        {
          "query_id": "q1",
          "response": "France's capital is London. Wait, no, Paris."
        },
        {
          "query_id": "q2",
          "response": "Boiling point is 212°F."
        }
      ],
      "discrepancies": [
        {
          "query_id": "q1",
          "type": "hallucination",
          "description": "Incorrect fact initially.",
          "severity": "high"
        },
        {
          "query_id": "q2",
          "type": "inaccuracy",
          "description": "Wrong unit system.",
          "severity": "high"
        }
      ],
      "suggestions": {
        "prompt_changes": "Strictly adhere to KB facts.",
        "kb_updates": {
          "fact2": "Specify Celsius."
        }
      },
      "applied_changes": {
        "prompt_diff": "",
        "kb_diff": {}
      },
      "logs": [
        "Unexpected drop in score.",
        "Hallucination detected."
      ],
      "user_feedback": "Needs manual intervention."
    }
  ]
}

type Session = {
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

export async function getSessionById(sessionId: string): Promise<Session | undefined> {
  const { getSessionsData } = await import("../sessions/fetch");
  const all = await getSessionsData();
  return (all as any[]).find((s) => s.id === sessionId) as Session | undefined;
}

export async function getSessionRunsBySessionId(sessionId: string) {
  const runs = await getSessionRunsData();
  return runs.filter((r) => r.session_id === sessionId);
}

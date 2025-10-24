export async function getOverviewData() {
  // Fake delay
  await new Promise((resolve) => setTimeout(resolve, 2000));

  return {
    views: {
      value: 3456,
      growthRate: 0.43,
    },
    profit: {
      value: 4220,
      growthRate: 4.35,
    },
    products: {
      value: 3456,
      growthRate: 2.59,
    },
    users: {
      value: 3456,
      growthRate: -0.95,
    },
  };
}

export async function getSessionsData() {
  // Fake delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  return [
    {
      "id": "sess-001",
      "name": "Basic Chatbot Tuning",
      "status": "completed",
      "created_at": "2025-10-21T10:00:00Z",
      "updated_at": "2025-10-20T12:00:00Z",
      "system_prompt": "You are a helpful assistant. Respond accurately based on the provided knowledgebase.",
      "knowledgebase": {
        "fact1": "The capital of France is Paris.",
        "fact2": "Water boils at 100°C."
      },
      "test_queries": [
        {
          "query": "What is the capital of France?",
          "expected_answer": "Paris",
          "tags": ["geography"]
        },
        {
          "query": "At what temperature does water boil?",
          "expected_answer": "100°C",
          "tags": ["science"]
        }
      ],
      "config": {
        "satisfaction_threshold": 90,
        "max_iterations": 5,
        "mode": "automated",
        "primary_llm": "grok-4-fast",
        "secondary_llm": "claude-sonnet"
      },
      "overall_score": 95,
      "runs": ["run-001", "run-002", "run-003"],
      "user_id": "user-abc123",
      "notes": "Initial tuning for general knowledge chatbot."
    },
    {
      "id": "sess-002",
      "name": "Advanced Medical Query Tuning",
      "status": "in_progress",
      "created_at": "2025-10-21T14:00:00Z",
      "updated_at": "2025-10-21T15:30:00Z",
      "system_prompt": "You are a medical advisor. Provide responses based solely on verified facts from the KB. Do not give medical advice.",
      "knowledgebase": {
        "symptom1": "Headache can be caused by dehydration.",
        "treatment1": "Drink water for mild dehydration."
      },
      "test_queries": [
        {
          "query": "What causes headaches?",
          "expected_answer": "Dehydration, among other things.",
          "tags": ["health"]
        },
        {
          "query": "How to treat mild dehydration?",
          "expected_answer": "Drink water."
        }
      ],
      "config": {
        "satisfaction_threshold": 95,
        "max_iterations": 10,
        "mode": "manual",
        "primary_llm": "grok-4-fast",
        "secondary_llm": "claude-sonnet"
      },
      "overall_score": 85,
      "runs": ["run-004", "run-005"],
      "user_id": "user-def456",
      "notes": "Focusing on accuracy for health-related responses."
    },
    {
      "id": "sess-003",
      "name": "Tech Support Bot Optimization",
      "status": "failed",
      "created_at": "2025-10-21T16:00:00Z",
      "updated_at": "2025-10-21T17:00:00Z",
      "system_prompt": "Assist with tech issues. Use step-by-step instructions from KB.",
      "knowledgebase": {
        "issue1": "Restart device for connectivity problems.",
        "issue2": "Update software for bugs."
      },
      "test_queries": [
        {
          "query": "How to fix WiFi connection?",
          "expected_answer": "Restart your device."
        },
        {
          "query": "What to do for software bugs?",
          "expected_answer": "Update the software.",
          "tags": ["tech"]
        }
      ],
      "config": {
        "satisfaction_threshold": 80,
        "max_iterations": 3,
        "mode": "automated",
        "primary_llm": "grok-4-fast",
        "secondary_llm": "claude-sonnet"
      },
      "overall_score": 70,
      "runs": ["run-006"],
      "user_id": "user-ghi789",
      "notes": "Session failed due to persistent hallucinations."
    },
    {
      "id": "sess-004",
      "name": "Tech Support Bot Optimization",
      "status": "failed",
      "created_at": "2025-10-21T16:00:00Z",
      "updated_at": "2025-10-21T17:00:00Z",
      "system_prompt": "Assist with tech issues. Use step-by-step instructions from KB.",
      "knowledgebase": {
        "issue1": "Restart device for connectivity problems.",
        "issue2": "Update software for bugs."
      },
      "test_queries": [
        {
          "query": "How to fix WiFi connection?",
          "expected_answer": "Restart your device."
        },
        {
          "query": "What to do for software bugs?",
          "expected_answer": "Update the software.",
          "tags": ["tech"]
        }
      ],
      "config": {
        "satisfaction_threshold": 80,
        "max_iterations": 3,
        "mode": "automated",
        "primary_llm": "grok-4-fast",
        "secondary_llm": "claude-sonnet"
      },
      "overall_score": 70,
      "runs": ["run-006"],
      "user_id": "user-ghi789",
      "notes": "Session failed due to persistent hallucinations."
    },
    {
      "id": "sess-005",
      "name": "Tech Support Bot Optimization",
      "status": "failed",
      "created_at": "2025-10-21T16:00:00Z",
      "updated_at": "2025-10-21T17:00:00Z",
      "system_prompt": "Assist with tech issues. Use step-by-step instructions from KB.",
      "knowledgebase": {
        "issue1": "Restart device for connectivity problems.",
        "issue2": "Update software for bugs."
      },
      "test_queries": [
        {
          "query": "How to fix WiFi connection?",
          "expected_answer": "Restart your device."
        },
        {
          "query": "What to do for software bugs?",
          "expected_answer": "Update the software.",
          "tags": ["tech"]
        }
      ],
      "config": {
        "satisfaction_threshold": 80,
        "max_iterations": 3,
        "mode": "automated",
        "primary_llm": "grok-4-fast",
        "secondary_llm": "claude-sonnet"
      },
      "overall_score": 70,
      "runs": ["run-006"],
      "user_id": "user-ghi789",
      "notes": "Session failed due to persistent hallucinations."
    },
    {
      "id": "sess-006",
      "name": "Tech Support Bot Optimization",
      "status": "failed",
      "created_at": "2025-10-21T16:00:00Z",
      "updated_at": "2025-10-21T17:00:00Z",
      "system_prompt": "Assist with tech issues. Use step-by-step instructions from KB.",
      "knowledgebase": {
        "issue1": "Restart device for connectivity problems.",
        "issue2": "Update software for bugs."
      },
      "test_queries": [
        {
          "query": "How to fix WiFi connection?",
          "expected_answer": "Restart your device."
        },
        {
          "query": "What to do for software bugs?",
          "expected_answer": "Update the software.",
          "tags": ["tech"]
        }
      ],
      "config": {
        "satisfaction_threshold": 80,
        "max_iterations": 3,
        "mode": "automated",
        "primary_llm": "grok-4-fast",
        "secondary_llm": "claude-sonnet"
      },
      "overall_score": 70,
      "runs": ["run-006"],
      "user_id": "user-ghi789",
      "notes": "Session failed due to persistent hallucinations."
    },
    {
      "id": "sess-007",
      "name": "Tech Support Bot Optimization",
      "status": "failed",
      "created_at": "2025-10-21T16:00:00Z",
      "updated_at": "2025-10-21T17:00:00Z",
      "system_prompt": "Assist with tech issues. Use step-by-step instructions from KB.",
      "knowledgebase": {
        "issue1": "Restart device for connectivity problems.",
        "issue2": "Update software for bugs."
      },
      "test_queries": [
        {
          "query": "How to fix WiFi connection?",
          "expected_answer": "Restart your device."
        },
        {
          "query": "What to do for software bugs?",
          "expected_answer": "Update the software.",
          "tags": ["tech"]
        }
      ],
      "config": {
        "satisfaction_threshold": 80,
        "max_iterations": 3,
        "mode": "automated",
        "primary_llm": "grok-4-fast",
        "secondary_llm": "claude-sonnet"
      },
      "overall_score": 70,
      "runs": ["run-006"],
      "user_id": "user-ghi789",
      "notes": "Session failed due to persistent hallucinations."
    },
    {
      "id": "sess-008",
      "name": "Tech Support Bot Optimization",
      "status": "failed",
      "created_at": "2025-10-21T16:00:00Z",
      "updated_at": "2025-10-21T17:00:00Z",
      "system_prompt": "Assist with tech issues. Use step-by-step instructions from KB.",
      "knowledgebase": {
        "issue1": "Restart device for connectivity problems.",
        "issue2": "Update software for bugs."
      },
      "test_queries": [
        {
          "query": "How to fix WiFi connection?",
          "expected_answer": "Restart your device."
        },
        {
          "query": "What to do for software bugs?",
          "expected_answer": "Update the software.",
          "tags": ["tech"]
        }
      ],
      "config": {
        "satisfaction_threshold": 80,
        "max_iterations": 3,
        "mode": "automated",
        "primary_llm": "grok-4-fast",
        "secondary_llm": "claude-sonnet"
      },
      "overall_score": 70,
      "runs": ["run-006"],
      "user_id": "user-ghi789",
      "notes": "Session failed due to persistent hallucinations."
    }
  ]
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
    }
  ]
}
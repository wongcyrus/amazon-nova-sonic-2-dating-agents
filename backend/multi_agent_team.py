"""Strands multi-agent team for oral-practice turn analysis."""

from __future__ import annotations

from dataclasses import dataclass, field
import json
import re

from strands import Agent
from strands.models import BedrockModel


JSON_BLOCK_RE = re.compile(r"\{.*\}", re.DOTALL)


COACH_PROMPT = """
You are the Coach Agent for a spoken-English practice game.
Your job is to help the learner improve their next answer.

Rules:
- Focus on encouragement, clarity, fluency, and one practical correction.
- Keep feedback short and actionable.
- Stay aligned with the current mission.
- Return plain text only.
"""


JUDGE_PROMPT = """
You are the Judge Agent for a spoken-English practice game.
Your job is to assess whether the learner is covering the mission goal.

Rules:
- Evaluate only the learner transcript against the mission.
- Mention what is already covered and what is still missing.
- Keep the answer concise and concrete.
- Return plain text only.
"""


DIRECTOR_PROMPT = """
You are the Director Agent and orchestrator for a spoken-English roleplay game.
You must call both tool agents before finalizing your answer:
1. coach_agent
2. judge_agent

Then return JSON only with this exact schema:
{
  "coach_feedback": "short coaching message",
  "coach_example": "one short model sentence for the learner",
  "judge_summary": "summary of mission coverage and missing parts",
  "mission_completed": true,
  "mission_coverage_score": 85,
  "missing_requirements": ["one short missing item"],
  "director_scene_brief": "one short description of the next scene beat",
  "director_assistant_goal": "one short instruction for the visible voice agent",
  "director_next_question": "one short follow-up question the voice agent can ask"
}

Rules:
- No markdown.
- No prose outside JSON.
- Keep every field short enough for realtime play.
"""


@dataclass
class MultiAgentTurnResult:
    coach_feedback: str
    coach_example: str
    judge_summary: str
    mission_completed: bool
    mission_coverage_score: int
    missing_requirements: list[str]
    director_scene_brief: str
    director_assistant_goal: str
    director_next_question: str
    model_id: str
    raw_response: str = ""


def _extract_json(text: str) -> dict:
    stripped = text.strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        match = JSON_BLOCK_RE.search(stripped)
        if not match:
            raise ValueError("Director agent did not return JSON.")
        return json.loads(match.group(0))


def _build_model(*, model_id: str, region_name: str, temperature: float) -> BedrockModel:
    return BedrockModel(
        model_id=model_id,
        region_name=region_name,
        temperature=temperature,
        streaming=False,
        max_tokens=600,
    )


def analyze_turn(
    *,
    model_id: str,
    region_name: str,
    selected_characters: list[str],
    mission_title: str,
    mission_objective: str,
    coach_tip: str,
    last_feedback: str,
    transcript: str,
    stage_index: int,
    total_stages: int,
    turns_remaining: int,
    overall_score: int,
    status: str,
    target_language_code: str,
    target_language_label: str,
) -> MultiAgentTurnResult:
    route_name = (
        "Shizuku and Chitose"
        if len(selected_characters) != 1
        else selected_characters[0].capitalize()
    )

    shared_context = f"""
Route: {route_name}
Game status: {status}
Stage: {stage_index}/{total_stages}
Target learning language: {target_language_label} ({target_language_code})
Mission title: {mission_title}
Mission objective: {mission_objective}
Coach tip: {coach_tip}
Turns remaining: {turns_remaining}
Deterministic score after this turn: {overall_score}
Current backend feedback: {last_feedback}
Learner transcript:
{transcript}
""".strip()

    coach_agent = Agent(
        model=_build_model(model_id=model_id, region_name=region_name, temperature=0.3),
        system_prompt=COACH_PROMPT,
        callback_handler=None,
    )
    judge_agent = Agent(
        model=_build_model(model_id=model_id, region_name=region_name, temperature=0.1),
        system_prompt=JUDGE_PROMPT,
        callback_handler=None,
    )
    director_agent = Agent(
        model=_build_model(model_id=model_id, region_name=region_name, temperature=0.2),
        system_prompt=DIRECTOR_PROMPT,
        tools=[
            coach_agent.as_tool(
                name="coach_agent",
                description="Provides short spoken-English coaching feedback for the current mission.",
            ),
            judge_agent.as_tool(
                name="judge_agent",
                description="Evaluates mission coverage and highlights what is still missing.",
            ),
        ],
        callback_handler=None,
    )

    response = director_agent(shared_context)
    response_text = str(response)
    payload = _extract_json(response_text)

    return MultiAgentTurnResult(
        coach_feedback=str(payload.get("coach_feedback", "")).strip(),
        coach_example=str(payload.get("coach_example", "")).strip(),
        judge_summary=str(payload.get("judge_summary", "")).strip(),
        mission_completed=bool(payload.get("mission_completed", False)),
        mission_coverage_score=max(0, min(100, int(payload.get("mission_coverage_score", 0) or 0))),
        missing_requirements=[
            str(item).strip()
            for item in payload.get("missing_requirements", [])
            if str(item).strip()
        ],
        director_scene_brief=str(payload.get("director_scene_brief", "")).strip(),
        director_assistant_goal=str(payload.get("director_assistant_goal", "")).strip(),
        director_next_question=str(payload.get("director_next_question", "")).strip(),
        model_id=model_id,
        raw_response=response_text,
    )

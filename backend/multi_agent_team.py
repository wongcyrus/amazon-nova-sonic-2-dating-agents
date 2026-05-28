"""Strands multi-agent team for oral-practice turn analysis."""

from __future__ import annotations

from dataclasses import dataclass
import json
import logging
import re

from strands import Agent, tool
from strands.models import BedrockModel


JSON_BLOCK_RE = re.compile(r"\{.*\}", re.DOTALL)
INTEGER_RE = re.compile(r"-?\d+")
logger = logging.getLogger("multi_agent_team")


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
  "fluency_score": 78,
  "vocabulary_score": 74,
  "grammar_score": 80,
  "confidence_score": 76,
  "missing_requirements": ["one short missing item"],
  "director_scene_brief": "one short description of the next scene beat",
  "director_assistant_goal": "one short instruction for the visible voice agent",
  "director_next_question": "one short follow-up question the voice agent can ask"
}

Rules:
- No markdown.
- No prose outside JSON.
- Keep every field short enough for realtime play.
- All score fields must be integers from 0 to 100.
- Score only from the learner transcript and current mission.
- Never leave score fields out.
"""


@dataclass
class MultiAgentTurnResult:
    coach_feedback: str
    coach_example: str
    judge_summary: str
    mission_completed: bool
    mission_coverage_score: int
    fluency_score: int
    vocabulary_score: int
    grammar_score: int
    confidence_score: int
    missing_requirements: list[str]
    director_scene_brief: str
    director_assistant_goal: str
    director_next_question: str
    model_id: str
    raw_response: str = ""


def _extract_json(text: str) -> dict:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*|\s*```$", "", stripped).strip()

    decoder = json.JSONDecoder()
    try:
        payload, _ = decoder.raw_decode(stripped)
        if isinstance(payload, dict):
            return payload
    except json.JSONDecodeError:
        pass

    for match in re.finditer(r"\{", stripped):
        try:
            payload, _ = decoder.raw_decode(stripped[match.start() :])
            if isinstance(payload, dict):
                return payload
        except json.JSONDecodeError:
            continue

    match = JSON_BLOCK_RE.search(stripped)
    if not match:
        raise ValueError("Director agent did not return JSON.")
    return json.loads(match.group(0))


def _parse_score_value(raw_candidate, *, key: str) -> int:
    if isinstance(raw_candidate, bool):
        raise ValueError(f"Director agent returned an invalid score for '{key}'.")

    try:
        if isinstance(raw_candidate, (int, float)):
            raw_value = int(raw_candidate)
        else:
            match = INTEGER_RE.search(str(raw_candidate))
            if not match:
                raise ValueError(key)
            raw_value = int(match.group(0))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Director agent returned an invalid score for '{key}'.") from exc

    return max(0, min(100, raw_value))


def _read_score(payload: dict, key: str, *, fallback_key: str | None = None) -> int:
    if key in payload:
        return _parse_score_value(payload[key], key=key)

    if fallback_key and fallback_key in payload:
        fallback_value = _parse_score_value(payload[fallback_key], key=fallback_key)
        logger.warning(
            "Director agent omitted %s; reusing %s=%s.",
            key,
            fallback_key,
            fallback_value,
        )
        return fallback_value

    logger.warning("Director agent omitted %s; defaulting to 0.", key)
    return 0


def _read_bool(payload: dict, key: str, *, default: bool = False) -> bool:
    if key not in payload:
        logger.warning("Director agent omitted %s; defaulting to %s.", key, default)
        return default

    value = payload[key]
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "yes", "y", "1"}:
            return True
        if normalized in {"false", "no", "n", "0"}:
            return False
    if isinstance(value, (int, float)) and value in {0, 1}:
        return bool(value)
    logger.warning(
        "Director agent returned an invalid boolean for %s; defaulting to %s.",
        key,
        default,
    )
    return default


def _read_missing_requirements(payload: dict) -> list[str]:
    value = payload.get("missing_requirements", [])
    if isinstance(value, list):
        items = value
    elif value in (None, ""):
        items = []
    else:
        items = [value]

    return [str(item).strip() for item in items if str(item).strip()]


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
    overall_score: int | None,
    status: str,
    target_language_code: str,
    target_language_label: str,
) -> MultiAgentTurnResult:
    route_name = (
        selected_characters[0].capitalize() if selected_characters else "Shizuku"
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
Last known overall score: {overall_score if overall_score is not None else "not available yet"}
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

    @tool
    def coach_agent_tool(query: str) -> str:
        """
        Provides short spoken-language coaching feedback for the current mission.
        """
        return str(coach_agent(query))

    @tool
    def judge_agent_tool(query: str) -> str:
        """
        Evaluates mission coverage and highlights what is still missing.
        """
        return str(judge_agent(query))

    director_agent = Agent(
        model=_build_model(model_id=model_id, region_name=region_name, temperature=0.2),
        system_prompt=DIRECTOR_PROMPT,
        tools=[
            coach_agent_tool,
            judge_agent_tool,
        ],
        callback_handler=None,
    )

    response = director_agent(shared_context)
    response_text = str(response)
    payload = _extract_json(response_text)
    logger.debug("Director raw response: %s", response_text)

    return MultiAgentTurnResult(
        coach_feedback=str(payload.get("coach_feedback", "")).strip(),
        coach_example=str(payload.get("coach_example", "")).strip(),
        judge_summary=str(payload.get("judge_summary", "")).strip(),
        mission_completed=_read_bool(payload, "mission_completed"),
        mission_coverage_score=_read_score(payload, "mission_coverage_score"),
        fluency_score=_read_score(
            payload, "fluency_score", fallback_key="mission_coverage_score"
        ),
        vocabulary_score=_read_score(
            payload, "vocabulary_score", fallback_key="mission_coverage_score"
        ),
        grammar_score=_read_score(
            payload, "grammar_score", fallback_key="mission_coverage_score"
        ),
        confidence_score=_read_score(
            payload, "confidence_score", fallback_key="mission_coverage_score"
        ),
        missing_requirements=_read_missing_requirements(payload),
        director_scene_brief=str(payload.get("director_scene_brief", "")).strip(),
        director_assistant_goal=str(payload.get("director_assistant_goal", "")).strip(),
        director_next_question=str(payload.get("director_next_question", "")).strip(),
        model_id=model_id,
        raw_response=response_text,
    )

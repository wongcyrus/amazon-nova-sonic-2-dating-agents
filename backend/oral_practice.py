"""Oral-practice game state and AI scoring helpers."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
import re

from language_support import (
    get_language,
    get_localized_sample_answer,
    get_supported_languages_payload,
)


TOTAL_ALLOWED_TURNS = 16


@dataclass(frozen=True)
class Mission:
    id: str
    title: str
    objective: str
    coach_tip: str
    how_to_play: list[str]
    sample_answer: str
    success_signals: list[str]
    required_groups: list[list[str]]
    required_group_labels: list[str]
    min_words: int
    clear_score: int
    quick_win_tip: str
    required_questions: int = 0


@dataclass
class AgentTeamInsights:
    status: str = "pending"
    model_id: str = ""
    coach_feedback: str = "The coach agent is waiting for your first scored turn."
    coach_example: str = ""
    judge_summary: str = "The judge agent will explain mission coverage after your answer is scored."
    director_scene_brief: str = "The director agent will set the next roleplay beat after your answer."
    director_assistant_goal: str = ""
    director_next_question: str = ""
    error_message: str = ""


MISSIONS: list[Mission] = [
    Mission(
        id="intro",
        title="Day 1 - First Meeting",
        objective="Introduce yourself naturally on a first date: say your name, where you are from or study, and one hobby.",
        coach_tip="Make it sound like a real first-date introduction, not a school presentation.",
        how_to_play=[
            "Press Start Practice and listen to the greeting like you are meeting someone cute for the first time.",
            "Say your name in one full sentence.",
            "Add where you study or where you are from.",
            "Finish with one hobby that makes you sound interesting.",
            "Press Stop Practice after your full answer to score this turn.",
        ],
        sample_answer=(
            "Hi, my name is Cyrus. I study at HKIIT in Hong Kong, and I enjoy listening to music after class. It helps me relax."
        ),
        success_signals=[
            "You introduce yourself naturally.",
            "You mention your school, city, or background.",
            "You mention one hobby or interest.",
        ],
        required_groups=[
            ["my name is", "i am", "i'm"],
            ["i'm from", "i am from", "i live in", "i study at", "i study in"],
            ["i like", "i love", "i enjoy", "my hobby is"],
        ],
        required_group_labels=[
            "Say your name.",
            "Say where you study, live, or come from.",
            "Say one hobby or interest.",
        ],
        min_words=12,
        clear_score=72,
        quick_win_tip=(
            "Say your name, where you study or live, and one hobby in one natural first-date answer. "
            "Then press Stop Practice to score the turn."
        ),
    ),
    Mission(
        id="questions",
        title="Day 2 - Get to Know Them",
        objective="Ask at least two natural date-style questions about hobbies, daily life, or study.",
        coach_tip="Sound curious and interested, like you want to know the other person better.",
        how_to_play=[
            "Listen to the character's reply like you are looking for a real connection.",
            "Ask one question with 'what', 'how', 'where', or 'why'.",
            "Ask a second question about hobbies, study, or daily life.",
            "Keep both questions natural and interested, not robotic.",
            "Press Stop Practice after you finish both questions.",
        ],
        sample_answer=(
            "What do you like to do after school? How do you usually spend your weekends?"
        ),
        success_signals=[
            "You ask at least two real questions.",
            "Your questions help the date feel more personal.",
            "You use natural follow-up wording.",
        ],
        required_groups=[
            ["what", "how", "when", "where", "why"],
            ["do you", "are you", "can you", "would you"],
        ],
        required_group_labels=[
            "Use a real question word like what, how, where, or why.",
            "Use full question form such as 'do you' or 'can you'.",
        ],
        min_words=10,
        clear_score=70,
        quick_win_tip=(
            "Ask two full questions that show real interest in the other person. "
            "Then press Stop Practice."
        ),
        required_questions=2,
    ),
    Mission(
        id="plan",
        title="Day 3 - Ask for Another Date",
        objective="Suggest a fun activity together and mention a time or day.",
        coach_tip="Make it sound like a genuine invitation, not just a task prompt.",
        how_to_play=[
            "Respond to the character's mood or suggestion.",
            "Invite the character to do one activity together.",
            "Say when the activity can happen.",
            "Keep the invitation friendly, confident, and specific.",
            "Press Stop Practice after one complete invitation.",
        ],
        sample_answer=(
            "Would you like to get coffee with me tomorrow after class? I think it would be fun to talk more at the cafe."
        ),
        success_signals=[
            "You invite the character to an activity.",
            "You mention a time or day.",
            "Your invitation sounds clear and natural.",
        ],
        required_groups=[
            ["let's", "let us", "can we", "we should", "would you like to"],
            ["tomorrow", "tonight", "this weekend", "after class", "at", "on saturday", "on sunday"],
            ["cafe", "coffee", "movie", "walk", "study", "dessert", "music"],
        ],
        required_group_labels=[
            "Invite the character to do something together.",
            "Say a time or day.",
            "Mention a specific activity.",
        ],
        min_words=12,
        clear_score=74,
        quick_win_tip=(
            "Say one clear invitation with an activity and a time, like asking for coffee tomorrow after class. "
            "Then press Stop Practice."
        ),
    ),
    Mission(
        id="resolve",
        title="Final Day - Save the Mood",
        objective="Handle a date misunderstanding politely, give a reason, and suggest a compromise.",
        coach_tip="Protect the relationship energy: be gentle, explain yourself, and offer a warm solution.",
        how_to_play=[
            "A small misunderstanding appears in the date scene.",
            "Reply politely instead of arguing.",
            "Explain your reason with 'because'.",
            "End with a compromise or solution that keeps the connection alive.",
            "Press Stop Practice after your full explanation.",
        ],
        sample_answer=(
            "I think we had a misunderstanding because I was nervous. I'm sorry if I sounded awkward. Can we talk again and choose a better plan together?"
        ),
        success_signals=[
            "You sound polite and calm.",
            "You explain your reason clearly.",
            "You suggest a compromise or next step.",
        ],
        required_groups=[
            ["i think", "i feel", "sorry", "i understand"],
            ["because", "so", "the reason is"],
            ["can we", "let's", "maybe we can", "instead", "together"],
        ],
        required_group_labels=[
            "Use a polite opinion or apology.",
            "Give a reason.",
            "Suggest a compromise or next step.",
        ],
        min_words=16,
        clear_score=76,
        quick_win_tip=(
            "Say your opinion politely, explain the reason, and offer a warm solution in one answer. "
            "Then press Stop Practice."
        ),
    ),
]


SCORE_KEYS = (
    "taskCompletion",
    "fluency",
    "vocabulary",
    "grammar",
    "confidence",
)

WORD_RE = re.compile(r"\b[\w']+\b", re.UNICODE)
QUESTION_START_RE = re.compile(
    r"(?:^|[.!]\s+)(what|how|when|where|why|do|are|can|would|will|did|is|am|could|should)\b",
    re.IGNORECASE,
)


def _clip_score(value: float) -> int:
    return max(0, min(100, int(round(value))))


def _empty_breakdown() -> dict[str, int | None]:
    return {key: None for key in SCORE_KEYS}


@dataclass(frozen=True)
class MissionRequirementCheck:
    passed: bool
    unmet_requirements: list[str]
    word_count: int
    question_count: int


def _normalize_transcript(text: str) -> str:
    return " ".join(text.lower().split())


def _count_words(text: str) -> int:
    return len(WORD_RE.findall(text))


def _count_questions(text: str) -> int:
    question_marks = text.count("?")
    question_starts = len(QUESTION_START_RE.findall(text))
    return max(question_marks, question_starts)


def _check_mission_requirements(mission: Mission, transcript: str) -> MissionRequirementCheck:
    normalized = _normalize_transcript(transcript)
    word_count = _count_words(transcript)
    question_count = _count_questions(normalized)
    unmet_requirements: list[str] = []

    for phrases, label in zip(mission.required_groups, mission.required_group_labels):
        if not any(phrase in normalized for phrase in phrases):
            unmet_requirements.append(label)

    if mission.required_questions > 0 and question_count < mission.required_questions:
        unmet_requirements.append(
            f"Ask at least {mission.required_questions} full questions in this turn."
        )

    if word_count < mission.min_words:
        unmet_requirements.append(
            f"Use at least {mission.min_words} words in one complete answer."
        )

    return MissionRequirementCheck(
        passed=len(unmet_requirements) == 0,
        unmet_requirements=unmet_requirements,
        word_count=word_count,
        question_count=question_count,
    )


def _build_clear_checklist(mission: Mission) -> list[str]:
    checklist = list(mission.success_signals)
    if mission.required_questions > 0:
        checklist.append(f"Ask at least {mission.required_questions} full questions.")
    checklist.append(f"Use at least {mission.min_words} words in one answer.")
    checklist.append("Press Stop Practice after your full answer to score the turn.")
    return checklist


@dataclass
class PracticeSession:
    selected_characters: list[str]
    target_language_code: str = "en-US"
    stage_index: int = 0
    turns_used: int = 0
    overall_score: int | None = None
    status: str = "in_progress"
    last_feedback: str = (
        "Press Start Practice, stay in character, give one natural reply, then press Stop Practice to score the scene."
    )
    last_transcript: str = ""
    last_breakdown: dict[str, int | None] = field(default_factory=_empty_breakdown)
    agent_team: AgentTeamInsights = field(default_factory=AgentTeamInsights)

    @property
    def current_mission(self) -> Mission | None:
        if 0 <= self.stage_index < len(MISSIONS):
            return MISSIONS[self.stage_index]
        return None

    @property
    def turns_remaining(self) -> int:
        return max(0, TOTAL_ALLOWED_TURNS - self.turns_used)

    @property
    def total_stages(self) -> int:
        return len(MISSIONS)

    @property
    def target_language(self):
        return get_language(self.target_language_code)

    def build_system_prompt_block(self) -> str:
        mission = self.current_mission
        if self.status == "won":
            return (
                "Game state: the player has cleared all oral-practice levels. "
                "Celebrate warmly, keep chatting in English, and offer short extension challenges."
            )
        if self.status == "lost":
            return (
                "Game state: the player has run out of turns. "
                "Stay kind, explain the missed target briefly, and encourage a restart with one model answer."
            )
        if mission is None:
            return "Game state: no mission is active."

        route_name = (
            self.selected_characters[0].capitalize()
            if self.selected_characters
            else "Shizuku"
        )
        character_mode = f"{route_name} route - {mission.title}"
        return (
            f"Current oral-practice stage: {character_mode}.\n"
            "Mode: romantic date-style roleplay with light coaching.\n"
            f"Target learning language: {self.target_language.label} ({self.target_language.code}).\n"
            f"Objective: {mission.objective}\n"
            f"Coach tip: {mission.coach_tip}\n"
            f"Turns remaining: {self.turns_remaining}\n"
            f"Most recent coach feedback: {self.last_feedback}\n"
            f"Coach agent insight: {self.agent_team.coach_feedback}\n"
            f"Judge agent insight: {self.agent_team.judge_summary}\n"
            f"Director scene brief: {self.agent_team.director_scene_brief}\n"
            f"Director assistant goal: {self.agent_team.director_assistant_goal}\n"
            f"Director next question: {self.agent_team.director_next_question}\n"
            "Response style rules:\n"
            f"- Speak mainly in {self.target_language.label}.\n"
            "- Only switch away from the target learning language if the user explicitly asks.\n"
            "- Keep spoken replies short: usually 1-3 sentences.\n"
            "- Stay playful, emotionally warm, and in character like a dating-sim companion.\n"
            "- After the user speaks, give one short natural reply and only a tiny coaching hint when needed.\n"
            "- Do not reveal hidden numeric scoring unless the user asks for it."
        )

    def apply_multi_agent_result(self, result) -> None:
        self.agent_team = AgentTeamInsights(
            status="ready",
            model_id=result.model_id,
            coach_feedback=result.coach_feedback or self.agent_team.coach_feedback,
            coach_example=result.coach_example,
            judge_summary=result.judge_summary or self.agent_team.judge_summary,
            director_scene_brief=(
                result.director_scene_brief or self.agent_team.director_scene_brief
            ),
            director_assistant_goal=result.director_assistant_goal,
            director_next_question=result.director_next_question,
        )

    def apply_multi_agent_error(self, *, model_id: str, error_message: str) -> None:
        self.agent_team = AgentTeamInsights(
            status="error",
            model_id=model_id,
            coach_feedback=self.agent_team.coach_feedback,
            coach_example=self.agent_team.coach_example,
            judge_summary=self.agent_team.judge_summary,
            director_scene_brief=self.agent_team.director_scene_brief,
            director_assistant_goal=self.agent_team.director_assistant_goal,
            director_next_question=self.agent_team.director_next_question,
            error_message=error_message,
        )

    def mark_scoring_unavailable(self, transcript: str) -> None:
        cleaned = transcript.strip()
        if not cleaned:
            return

        self.last_transcript = cleaned
        self.overall_score = None
        self.last_breakdown = _empty_breakdown()
        self.last_feedback = (
            "AI scoring is temporarily unavailable. This answer was not scored, "
            "so your stage progress and turn count did not change."
        )

    def record_user_turn(self, transcript: str, agent_analysis=None) -> None:
        if self.status != "in_progress":
            return

        mission = self.current_mission
        if mission is None:
            self.status = "won"
            return

        cleaned = transcript.strip()
        if not cleaned:
            return

        if agent_analysis is None:
            self.mark_scoring_unavailable(cleaned)
            return

        requirement_check = _check_mission_requirements(mission, cleaned)
        self.turns_used += 1
        self.last_transcript = cleaned

        task_completion = _clip_score(agent_analysis.mission_coverage_score)
        fluency = _clip_score(agent_analysis.fluency_score)
        vocabulary = _clip_score(agent_analysis.vocabulary_score)
        grammar = _clip_score(agent_analysis.grammar_score)
        confidence = _clip_score(agent_analysis.confidence_score)
        missing_groups = list(agent_analysis.missing_requirements)
        mission_completed = bool(agent_analysis.mission_completed)
        overall = _clip_score(
            task_completion * 0.38
            + fluency * 0.20
            + vocabulary * 0.16
            + grammar * 0.14
            + confidence * 0.12
        )

        self.last_breakdown = {
            "taskCompletion": task_completion,
            "fluency": fluency,
            "vocabulary": vocabulary,
            "grammar": grammar,
            "confidence": confidence,
        }
        self.overall_score = overall

        unmet_requirements = list(requirement_check.unmet_requirements)
        for item in missing_groups:
            cleaned_item = str(item).strip()
            if cleaned_item and cleaned_item not in unmet_requirements:
                unmet_requirements.append(cleaned_item)

        cleared = overall >= mission.clear_score and (
            mission_completed or requirement_check.passed
        )

        if cleared:
            self.stage_index += 1
            if self.stage_index >= len(MISSIONS):
                self.status = "won"
                self.last_feedback = (
                    f"Excellent work. You cleared the final speaking mission with a score of {overall}. "
                    "You win the oral-practice game."
                )
            else:
                next_mission = MISSIONS[self.stage_index]
                self.last_feedback = (
                    f"Stage cleared with {overall}/100. "
                    f"Next mission: {next_mission.objective}"
                )
        else:
            feedback_parts: list[str] = [f"Current AI score: {overall}/100."]
            if unmet_requirements:
                feedback_parts.append(
                    "To clear this stage, still do: "
                    + "; ".join(unmet_requirements[:3])
                    + "."
                )
            feedback_parts.append(agent_analysis.coach_feedback or mission.coach_tip)
            self.last_feedback = " ".join(feedback_parts)

        if self.status == "in_progress" and self.turns_used >= TOTAL_ALLOWED_TURNS:
            self.status = "lost"
            self.last_feedback = (
                "Challenge over. You ran out of turns before clearing every speaking mission. "
                "Try again and give longer, clearer answers."
            )

    def to_payload(self) -> dict:
        mission = self.current_mission
        return {
            "status": self.status,
            "stageIndex": min(self.stage_index + 1, self.total_stages),
            "totalStages": self.total_stages,
            "turnsUsed": self.turns_used,
            "turnsRemaining": self.turns_remaining,
            "overallScore": self.overall_score,
            "lastFeedback": self.last_feedback,
            "lastTranscript": self.last_transcript,
            "lastBreakdown": self.last_breakdown,
            "agentTeam": asdict(self.agent_team),
            "targetLanguage": {
                "code": self.target_language.code,
                "label": self.target_language.label,
                "recommendedVoice": self.target_language.recommended_voice,
            },
            "supportedLanguages": get_supported_languages_payload(),
            "currentMission": (
                {
                    "id": mission.id,
                    "title": mission.title,
                    "objective": mission.objective,
                    "coachTip": mission.coach_tip,
                    "howToPlay": mission.how_to_play,
                    "sampleAnswer": get_localized_sample_answer(
                        mission_id=mission.id,
                        language_code=self.target_language.code,
                    ),
                    "successSignals": mission.success_signals,
                    "clearChecklist": _build_clear_checklist(mission),
                    "quickWinTip": mission.quick_win_tip,
                    "passingScore": mission.clear_score,
                }
                if mission is not None
                else None
            ),
        }

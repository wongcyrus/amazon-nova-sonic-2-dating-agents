"""Oral-practice game state and transcript scoring helpers."""

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
    min_words: int
    clear_score: int
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
        title="Level 1 - Introduce Yourself",
        objective="Say your name, where you are from or study, and one hobby.",
        coach_tip="Use one smooth answer with 2-3 short sentences.",
        how_to_play=[
            "Wait for the character to greet you.",
            "Say your name in one full sentence.",
            "Add where you study or where you are from.",
            "Finish with one hobby you enjoy.",
        ],
        sample_answer=(
            "Hi, my name is Cyrus. I study at VTC in Hong Kong, and I enjoy listening to music after class."
        ),
        success_signals=[
            "You mention your name.",
            "You mention your school, city, or background.",
            "You mention one hobby or interest.",
        ],
        required_groups=[
            ["my name is", "i am", "i'm"],
            ["i'm from", "i am from", "i live in", "i study at", "i study in"],
            ["i like", "i love", "i enjoy", "my hobby is"],
        ],
        min_words=12,
        clear_score=72,
    ),
    Mission(
        id="questions",
        title="Level 2 - Ask Questions",
        objective="Ask at least two questions about hobbies, daily life, or study.",
        coach_tip="Ask natural follow-up questions instead of one-word prompts.",
        how_to_play=[
            "Listen to the character's reply.",
            "Ask one question with 'what', 'how', 'where', or 'why'.",
            "Ask a second question about hobbies, study, or daily life.",
            "Keep both questions in natural spoken English.",
        ],
        sample_answer=(
            "What do you like to do after school? How do you usually practice English?"
        ),
        success_signals=[
            "You ask at least two real questions.",
            "Your questions match the conversation topic.",
            "You use natural follow-up wording.",
        ],
        required_groups=[
            ["what", "how", "when", "where", "why"],
            ["do you", "are you", "can you", "would you"],
        ],
        min_words=10,
        clear_score=70,
        required_questions=2,
    ),
    Mission(
        id="plan",
        title="Level 3 - Make a Plan",
        objective="Suggest an activity and mention a time or day.",
        coach_tip="Try a clear invitation like 'Let's ... tomorrow after class.'",
        how_to_play=[
            "Respond to the character's mood or suggestion.",
            "Invite the character to do one activity together.",
            "Say when the activity can happen.",
            "Keep the invitation friendly and specific.",
        ],
        sample_answer=(
            "Let's get coffee tomorrow after class. We can practice English together at the cafe."
        ),
        success_signals=[
            "You invite the character to an activity.",
            "You mention a time or day.",
            "Your plan sounds clear and natural.",
        ],
        required_groups=[
            ["let's", "let us", "can we", "we should", "would you like to"],
            ["tomorrow", "tonight", "this weekend", "after class", "at", "on saturday", "on sunday"],
            ["cafe", "coffee", "movie", "walk", "study", "dessert", "music"],
        ],
        min_words=12,
        clear_score=74,
    ),
    Mission(
        id="resolve",
        title="Final Level - Solve a Misunderstanding",
        objective="Explain your opinion politely, give a reason, and suggest a compromise.",
        coach_tip="Use 'I think...', 'because...', and 'can we...' in one answer.",
        how_to_play=[
            "A small problem or misunderstanding appears in the roleplay.",
            "Reply politely instead of arguing.",
            "Explain your reason with 'because'.",
            "End with a compromise or solution.",
        ],
        sample_answer=(
            "I think we had a misunderstanding because I was nervous. Can we talk again and choose a better plan together?"
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
        min_words=16,
        clear_score=76,
    ),
]


WORD_RE = re.compile(r"[a-zA-Z']+")
SENTENCE_SPLIT_RE = re.compile(r"[.!?]+")
SUBJECT_WORDS = {"i", "you", "we", "they", "he", "she"}
VERB_WORDS = {
    "am",
    "is",
    "are",
    "was",
    "were",
    "be",
    "like",
    "love",
    "enjoy",
    "study",
    "live",
    "want",
    "prefer",
    "think",
    "feel",
    "go",
    "can",
    "would",
    "will",
    "plan",
}
FILLER_WORDS = {"um", "uh", "hmm", "er", "ah", "like"}


def _clip_score(value: float) -> int:
    return max(0, min(100, int(round(value))))


def _tokenize(text: str) -> list[str]:
    return WORD_RE.findall(text.lower())


def _normalize(text: str) -> str:
    lowered = text.lower().strip()
    return re.sub(r"\s+", " ", lowered)


def _count_questions(text: str) -> int:
    question_marks = text.count("?")
    starters = {"what", "how", "when", "where", "why", "do", "are", "can", "would"}
    sentence_starts = 0
    for chunk in SENTENCE_SPLIT_RE.split(text.lower()):
        stripped = chunk.strip()
        if not stripped:
            continue
        first_word_match = WORD_RE.search(stripped)
        if first_word_match and first_word_match.group(0) in starters:
            sentence_starts += 1
    return max(question_marks, sentence_starts)


@dataclass
class PracticeSession:
    selected_characters: list[str]
    target_language_code: str = "en-US"
    stage_index: int = 0
    turns_used: int = 0
    overall_score: int = 0
    status: str = "in_progress"
    last_feedback: str = "Press Start, speak in English, and clear each mission before the challenge ends."
    last_transcript: str = ""
    last_breakdown: dict[str, int] = field(
        default_factory=lambda: {
            "taskCompletion": 0,
            "fluency": 0,
            "vocabulary": 0,
            "grammar": 0,
            "confidence": 0,
        }
    )
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

        character_mode = (
            mission.title
            if len(self.selected_characters) != 1
            else f"{self.selected_characters[0].capitalize()} route - {mission.title}"
        )
        return (
            f"Current oral-practice stage: {character_mode}.\n"
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
            "- Stay playful and in character, but always act like an oral-English coach.\n"
            "- After the user speaks, give one short natural response and one tiny coaching hint.\n"
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

    def record_user_turn(self, transcript: str, agent_analysis=None) -> None:
        if self.status != "in_progress":
            return

        mission = self.current_mission
        if mission is None:
            self.status = "won"
            return

        normalized = _normalize(transcript)
        tokens = _tokenize(transcript)
        if not tokens:
            return

        self.turns_used += 1
        self.last_transcript = transcript.strip()

        word_count = len(tokens)
        unique_count = len(set(tokens))
        sentence_count = len([part for part in SENTENCE_SPLIT_RE.split(transcript) if part.strip()]) or 1
        filler_count = sum(1 for token in tokens if token in FILLER_WORDS)
        filler_ratio = filler_count / max(1, word_count)
        question_count = _count_questions(transcript)

        if agent_analysis is not None:
            task_completion = _clip_score(agent_analysis.mission_coverage_score)
            missing_groups = list(agent_analysis.missing_requirements)
            mission_completed = bool(agent_analysis.mission_completed)
        else:
            matched_groups = 0
            missing_groups: list[str] = []
            for group in mission.required_groups:
                matched = any(phrase in normalized for phrase in group)
                if matched:
                    matched_groups += 1
                else:
                    missing_groups.append(group[0])

            task_completion = _clip_score(100 * matched_groups / len(mission.required_groups))
            if mission.required_questions:
                task_completion = _clip_score(
                    (task_completion * 0.55)
                    + (min(question_count, mission.required_questions) / mission.required_questions) * 45
                )
            mission_completed = (
                matched_groups == len(mission.required_groups)
                and question_count >= mission.required_questions
            )

        fluency = _clip_score(
            30
            + min(word_count, mission.min_words + 8) * 3
            + min(sentence_count, 3) * 8
            - max(0, filler_ratio - 0.12) * 100
        )
        vocabulary = _clip_score(25 + unique_count * 5)
        grammar = _clip_score(
            25
            + min(sentence_count, 3) * 12
            + min(word_count, mission.min_words + 4) * 1.8
            + (12 if filler_ratio < 0.18 else 0)
        )
        confidence = _clip_score(
            35
            + (25 if word_count >= mission.min_words else word_count * 1.8)
            + (20 if filler_ratio < 0.15 else 0)
            + (20 if sentence_count >= 2 else 0)
        )
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

        cleared = mission_completed and overall >= mission.clear_score

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
            feedback_parts: list[str] = [f"Current score: {overall}/100."]
            if word_count < mission.min_words:
                feedback_parts.append(
                    f"Speak a little longer: aim for at least {mission.min_words} words."
                )
            if (
                agent_analysis is None
                and mission.required_questions
                and question_count < mission.required_questions
            ):
                feedback_parts.append(
                    f"Ask {mission.required_questions - question_count} more question(s)."
                )
            if missing_groups:
                feedback_parts.append(
                    "Still missing: " + ", ".join(f"'{phrase}'" for phrase in missing_groups[:2]) + "."
                )
            feedback_parts.append(mission.coach_tip)
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
                    "passingScore": mission.clear_score,
                }
                if mission is not None
                else None
            ),
        }

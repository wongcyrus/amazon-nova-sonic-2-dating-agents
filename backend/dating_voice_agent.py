"""FastAPI server and Strands BidiAgent for the oral-practice game."""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

import boto3
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from strands.experimental.bidi import BidiAgent
from strands.experimental.bidi.models import BidiNovaSonicModel
from strands.experimental.bidi.types.events import (
    BidiAudioInputEvent,
    BidiImageInputEvent,
    BidiTextInputEvent,
)

from multi_agent_team import analyze_turn
from oral_practice import PracticeSession
from tools import get_all_tools

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("dating_voice_agent")


class EndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if record.args and len(record.args) >= 3:
            path = record.args[2]
            if path == "/ping" or path == "/":
                return False
        return True


logging.getLogger("uvicorn.access").addFilter(EndpointFilter())

COGNITO_REGION = os.environ.get("CognitoRegion", "us-east-1")
AWS_BEDROCK_REGION = os.environ.get("AWS_BEDROCK_REGION", "us-east-1")
MULTI_AGENT_MODEL_ID = os.environ.get("MULTI_AGENT_MODEL_ID", "amazon.nova-pro-v1:0")
VALID_CHARACTERS = {"shizuku", "chitose"}


def merge_transcript_chunks(existing: str, incoming: str) -> str:
    existing = existing.strip()
    incoming = incoming.strip()

    if not incoming:
        return existing
    if not existing:
        return incoming
    if incoming.startswith(existing):
        return incoming
    if existing.startswith(incoming):
        return existing
    if incoming in existing:
        return existing

    separator = "" if existing.endswith((" ", "\n")) else " "
    return f"{existing}{separator}{incoming}".strip()


def load_system_prompt() -> str:
    prompt_dir = Path(__file__).parent / "prompts"
    for prompt_name in ("oral_practice_prompt.txt", "dating_sim_prompt.txt"):
        prompt_path = prompt_dir / prompt_name
        if prompt_path.exists():
            return prompt_path.read_text(encoding="utf-8")

    return (
        "You are a warm anime-style cafe partner in a spoken English practice game. "
        "Keep the conversation lively, helpful, and concise."
    )


def normalize_characters(value) -> list[str]:
    if isinstance(value, str):
        raw_values = [part.strip().lower() for part in value.split(",")]
    elif isinstance(value, list):
        raw_values = [str(part).strip().lower() for part in value]
    else:
        raw_values = []

    if not raw_values or "all" in raw_values:
        return ["shizuku", "chitose"]

    selected = [name for name in raw_values if name in VALID_CHARACTERS]
    return selected or ["shizuku", "chitose"]


def normalize_target_language(value) -> str:
    from language_support import get_language

    return get_language(str(value).strip() if value else None).code


def generate_dynamic_prompt(characters: list[str], practice_session: PracticeSession) -> str:
    base_prompt = load_system_prompt().strip()
    practice_block = practice_session.build_system_prompt_block()
    if characters == ["shizuku", "chitose"]:
        return (
            f"{base_prompt}\n\n"
            "Scene context: this is a cozy anime-style oral English adventure in a cafe. "
            "Shizuku and Chitose can both react, but the conversation must stay focused on helping the player speak English.\n\n"
            f"{practice_block}"
        )

    focus = characters[0].capitalize()
    return (
        f"{base_prompt}\n\n"
        f"Scene context: this route is focused on {focus}. "
        f"Keep the conversation playful, immersive, and centered on helping the player practice English with {focus}.\n\n"
        f"{practice_block}"
    )


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("Dating Game AgentCore service starting up...")
    logging.getLogger("uvicorn.access").addFilter(EndpointFilter())
    yield
    logger.info("Dating Game AgentCore service shutting down...")


app = FastAPI(
    title="Dating Game AgentCore Service",
    description="Python Strands microservice for bidirectional dating game voice streaming",
    version="2.0.0",
    lifespan=lifespan,
)


@app.get("/ping")
async def health_check():
    return JSONResponse(
        content={"status": "healthy", "service": "dating-game-agentcore"},
        status_code=200,
    )


@app.get("/api/auth/config")
async def get_auth_config():
    return JSONResponse(
        content={
            "userPoolId": os.environ.get("CognitoUserPoolId"),
            "clientId": os.environ.get("CognitoUserPoolClientId"),
            "region": COGNITO_REGION,
        }
    )


@app.post("/api/auth/login")
async def login(payload: dict):
    username = payload.get("username")
    password = payload.get("password")

    if not username or not password:
        return JSONResponse(
            status_code=400,
            content={"message": "Username and password are required."},
        )

    try:
        client = boto3.client("cognito-idp", region_name=COGNITO_REGION)
        response = client.initiate_auth(
            ClientId=os.environ.get("CognitoUserPoolClientId"),
            AuthFlow="USER_PASSWORD_AUTH",
            AuthParameters={
                "USERNAME": username,
                "PASSWORD": password,
            },
        )
        auth_result = response.get("AuthenticationResult")
        if auth_result:
            return JSONResponse(
                content={
                    "accessToken": auth_result.get("AccessToken"),
                    "idToken": auth_result.get("IdToken"),
                    "refreshToken": auth_result.get("RefreshToken"),
                }
            )
        return JSONResponse(
            status_code=401,
            content={"message": "Authentication failed."},
        )
    except Exception as exc:
        logger.error("Cognito authentication error: %s", exc)
        return JSONResponse(status_code=401, content={"message": str(exc)})


@app.get("/login.html")
async def serve_login():
    return FileResponse(Path(__file__).parent.parent / "frontend" / "login.html")


@app.get("/favicon.ico")
async def serve_favicon():
    return FileResponse(Path(__file__).parent.parent / "frontend" / "favicon.ico")


@app.get("/")
async def serve_index():
    return FileResponse(Path(__file__).parent.parent / "frontend" / "index.html")


@app.get("/background_hk.jpg")
async def serve_background():
    return FileResponse(Path(__file__).parent.parent / "frontend" / "background_hk.jpg")


app.mount("/src", StaticFiles(directory=Path(__file__).parent.parent / "frontend" / "src"), name="src")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    logger.info("Incoming WebSocket connection request...")
    await websocket.accept()
    logger.info("WebSocket connection established via Bedrock AgentCore IAM.")

    voice_id = websocket.query_params.get("voice_id", "tiffany")
    selected_characters = normalize_characters(
        websocket.query_params.get("characters", "all")
    )
    practice_session = PracticeSession(
        selected_characters=list(selected_characters),
        target_language_code=normalize_target_language(
            websocket.query_params.get("target_language", "en-US")
        ),
    )
    first_message = None

    try:
        first_message = await websocket.receive_json()
        if first_message.get("type") == "character":
            selected_characters = normalize_characters(
                first_message.get("characters", ["all"])
            )
            practice_session.selected_characters = list(selected_characters)
            logger.info("Handshake - Initial selected characters: %s", selected_characters)
        elif first_message.get("type") == "target_language":
            practice_session.target_language_code = normalize_target_language(
                first_message.get("target_language")
            )
        else:
            logger.warning(
                "Handshake - Unexpected initial event: %s. Using query/default characters.",
                first_message.get("type"),
            )
    except Exception as exc:
        logger.warning("Handshake - Falling back to default characters: %s", exc)

    try:
        system_prompt = generate_dynamic_prompt(selected_characters, practice_session)
        tools = get_all_tools()
        logger.info(
            "Loaded %s tools. Initial system prompt compiled for: %s",
            len(tools),
            selected_characters,
        )

        model = BidiNovaSonicModel(
            region=AWS_BEDROCK_REGION,
            model_id="amazon.nova-2-sonic-v1:0",
            provider_config={
                "audio": {
                    "input_sample_rate": 16000,
                    "output_sample_rate": 16000,
                    "voice": voice_id,
                }
            },
            tools=tools,
        )

        agent = BidiAgent(
            model=model,
            tools=tools,
            system_prompt=system_prompt,
        )
        logger.info("Strands BidiAgent instantiated successfully.")

        async def send_game_state():
            await websocket.send_json(
                {
                    "type": "game_state",
                    "state": practice_session.to_payload(),
                }
            )

        await send_game_state()

        current_user_transcript = ""
        pending_user_turn = False

        async def score_pending_user_turn():
            nonlocal current_user_transcript, pending_user_turn
            if not pending_user_turn or not current_user_transcript.strip():
                return

            mission = practice_session.current_mission
            try:
                multi_agent_result = await asyncio.to_thread(
                    analyze_turn,
                    model_id=MULTI_AGENT_MODEL_ID,
                    region_name=AWS_BEDROCK_REGION,
                    selected_characters=list(selected_characters),
                    mission_title=mission.title if mission else "Challenge Complete",
                    mission_objective=(
                        mission.objective
                        if mission
                        else "All oral-practice missions have been cleared."
                    ),
                    coach_tip=mission.coach_tip if mission else "",
                    last_feedback=practice_session.last_feedback,
                    transcript=current_user_transcript,
                    stage_index=min(
                        practice_session.stage_index + 1, practice_session.total_stages
                    ),
                    total_stages=practice_session.total_stages,
                    turns_remaining=practice_session.turns_remaining,
                    overall_score=practice_session.overall_score,
                    status=practice_session.status,
                    target_language_code=practice_session.target_language.code,
                    target_language_label=practice_session.target_language.label,
                )
                practice_session.record_user_turn(
                    current_user_transcript, agent_analysis=multi_agent_result
                )
                practice_session.apply_multi_agent_result(multi_agent_result)
            except Exception as exc:
                logger.exception("Multi-agent team analysis failed")
                practice_session.record_user_turn(current_user_transcript)
                practice_session.apply_multi_agent_error(
                    model_id=MULTI_AGENT_MODEL_ID,
                    error_message=str(exc),
                )
            agent.system_prompt = generate_dynamic_prompt(
                selected_characters, practice_session
            )
            await send_game_state()
            pending_user_turn = False

        async def receive_and_convert():
            nonlocal first_message, selected_characters
            while True:
                if first_message is not None:
                    data = first_message
                    first_message = None
                else:
                    try:
                        data = await websocket.receive_json()
                    except WebSocketDisconnect:
                        logger.info("WebSocket client disconnected abruptly.")
                        raise
                    except Exception as exc:
                        logger.error("Error receiving websocket JSON: %s", exc)
                        raise

                event_type = data.get("type")
                if not event_type:
                    continue

                logger.info("Inbound client event: %s", event_type)

                if event_type == "character":
                    selected_characters = normalize_characters(
                        data.get("characters", ["all"])
                    )
                    practice_session.selected_characters = list(selected_characters)
                    agent.system_prompt = generate_dynamic_prompt(
                        selected_characters, practice_session
                    )
                    logger.info(
                        "Selected characters updated mid-session to: %s",
                        selected_characters,
                    )
                    await websocket.send_json(
                        {
                            "type": "character_received",
                            "characters": selected_characters,
                        }
                    )
                    continue

                if event_type == "target_language":
                    practice_session.target_language_code = normalize_target_language(
                        data.get("target_language")
                    )
                    agent.system_prompt = generate_dynamic_prompt(
                        selected_characters, practice_session
                    )
                    await send_game_state()
                    continue

                event_data = {k: v for k, v in data.items() if k != "type"}

                if event_type == "bidi_audio_input":
                    return BidiAudioInputEvent(**event_data)
                if event_type == "bidi_text_input":
                    return BidiTextInputEvent(**event_data)
                if event_type == "bidi_image_input":
                    return BidiImageInputEvent(**event_data)
                if event_type in ["audioStart", "promptStart", "systemPrompt"]:
                    logger.info("Signal received: %s", event_type)
                    continue
                if event_type == "stopAudio":
                    logger.info("Client requested audio stream termination.")
                    return None

        async def output_adapter(event):
            nonlocal current_user_transcript, pending_user_turn
            event_type = type(event).__name__
            logger.info("Outbound agent event: %s", event_type)

            if event_type == "BidiTranscriptStreamEvent":
                text = getattr(event, "text", "")
                if not text and hasattr(event, "delta"):
                    delta = event.delta
                    if hasattr(delta, "text"):
                        text = delta.text
                    elif isinstance(delta, str):
                        text = delta

                role_name = getattr(event, "role", "assistant").upper()
                if role_name == "USER" and text:
                    current_user_transcript = merge_transcript_chunks(
                        current_user_transcript, text
                    )
                    pending_user_turn = True

                await websocket.send_json(
                    {
                        "event": {
                            "textOutput": {
                                "content": text,
                                "role": role_name,
                            }
                        }
                    }
                )
            elif event_type == "BidiAudioStreamEvent":
                await websocket.send_json(
                    {
                        "event": {
                            "audioOutput": {
                                "content": getattr(event, "audio", ""),
                            }
                        }
                    }
                )
            elif event_type in ["BidiResponseStartEvent", "ResponseStartEvent"]:
                await score_pending_user_turn()

                await websocket.send_json(
                    {
                        "event": {
                            "contentStart": {
                                "type": "TEXT",
                                "role": "ASSISTANT",
                            }
                        }
                    }
                )
            elif event_type in ["BidiResponseCompleteEvent", "ResponseCompleteEvent"]:
                await score_pending_user_turn()
                current_user_transcript = ""
                await websocket.send_json(
                    {
                        "event": {
                            "contentEnd": {
                                "type": "TEXT",
                                "stopReason": "END_TURN",
                            }
                        }
                    }
                )
            else:
                try:
                    if hasattr(event, "to_dict"):
                        await websocket.send_json(event.to_dict())
                    elif hasattr(event, "__dict__"):
                        await websocket.send_json(event.__dict__)
                    else:
                        await websocket.send_json(event)
                except Exception as exc:
                    logger.error("Failed to serialize outbound event %s: %s", event_type, exc)

        await agent.run(inputs=[receive_and_convert], outputs=[output_adapter])
        logger.info("BidiAgent session run complete.")

    except WebSocketDisconnect:
        logger.info("WebSocket disconnect handled.")
    except Exception as exc:
        logger.exception("Error during active WebSocket session execution")
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
            await websocket.close(code=1011, reason=str(exc)[:120])
        except Exception:
            pass
    finally:
        logger.info("WebSocket session lifecycle finished.")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    host = os.environ.get("HOST", "0.0.0.0")
    logger.info("Starting FastAPI Dating Game service on %s:%s", host, port)
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info",
        access_log=True,
    )

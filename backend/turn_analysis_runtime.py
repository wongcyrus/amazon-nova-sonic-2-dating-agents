"""Dedicated AgentCore runtime for Director/Judge/Coach turn analysis."""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from dataclasses import asdict

import uvicorn
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from multi_agent_team import analyze_turn

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("turn_analysis_runtime")


class TurnAnalysisRequest(BaseModel):
    model_id: str
    region_name: str
    selected_characters: list[str]
    mission_title: str
    mission_objective: str
    coach_tip: str
    last_feedback: str
    transcript: str
    stage_index: int
    total_stages: int
    turns_remaining: int
    overall_score: int | None
    status: str
    target_language_code: str
    target_language_label: str


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("Turn analysis AgentCore runtime starting up...")
    yield
    logger.info("Turn analysis AgentCore runtime shutting down...")


app = FastAPI(
    title="Turn Analysis AgentCore Service",
    description="Dedicated runtime for multi-agent oral-practice scoring",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/ping")
async def health_check():
    return JSONResponse(
        content={"status": "healthy", "service": "turn-analysis-agentcore"},
        status_code=200,
    )


async def _handle_turn_analysis(payload: TurnAnalysisRequest) -> JSONResponse:
    result = await asyncio.to_thread(
        analyze_turn,
        **payload.model_dump(),
    )
    return JSONResponse(content=asdict(result), status_code=200)


@app.post("/")
async def invoke_default(payload: TurnAnalysisRequest):
    return await _handle_turn_analysis(payload)


@app.post("/invocations")
async def invoke_runtime(payload: TurnAnalysisRequest):
    return await _handle_turn_analysis(payload)


@app.post("/analyze-turn")
async def analyze_turn_endpoint(payload: TurnAnalysisRequest):
    return await _handle_turn_analysis(payload)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    host = os.environ.get("HOST", "0.0.0.0")
    logger.info("Starting turn analysis runtime on %s:%s", host, port)
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info",
        access_log=True,
    )

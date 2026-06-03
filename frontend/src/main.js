
import { AudioPlayer } from './lib/play/AudioPlayer.js';
import { ChatHistoryManager } from "./lib/util/ChatHistoryManager.js";
import { setupCharacterModal } from './characterModal.js';
import { initLive2DAvatar } from './live2d-avatar.js?v=1.0.23';
// Setup character modal popup on page load
document.addEventListener('DOMContentLoaded', () => {
    setupCharacterModal();
});

// Connect to the serverless AWS Bedrock AgentCore with authentication via SigV4 signed WebSocket
const HIDDEN_SOCKET_CLOSE_DELAY_MS = 60 * 1000;
const SOCKET_INACTIVITY_CLOSE_DELAY_MS = 5 * 60 * 1000;

class NativeSocketEmulator {
    constructor() {
        this.listeners = {};
        this.connected = false;
        this.ws = null;
        this.connectPromise = null;
        this.hiddenCloseTimeoutId = null;
        this.inactivityTimeoutId = null;

        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
        this.handlePageHide = this.handlePageHide.bind(this);
        this.handleBeforeUnload = this.handleBeforeUnload.bind(this);

        document.addEventListener('visibilitychange', this.handleVisibilityChange);
        window.addEventListener('pagehide', this.handlePageHide);
        window.addEventListener('beforeunload', this.handleBeforeUnload);
        
        // Auto-connect in background on load
        this.connect().catch(err => {
            console.error("Auto-connection error on load:", err);
        });
    }
    
    async connect() {
        if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.resetInactivityTimer();
            return;
        }
        
        // If there's already an active connection attempt, reuse it
        if (this.connectPromise) {
            return this.connectPromise;
        }

        // Close and clean up any existing WebSocket to prevent duplicate message handlers or audio streams
        if (this.ws) {
            try {
                this.ws.onopen = null;
                this.ws.onclose = null;
                this.ws.onerror = null;
                this.ws.onmessage = null;
                this.ws.close();
            } catch (e) {
                console.warn("Error cleaning up previous WebSocket connection:", e);
            }
            this.ws = null;
        }
        this.clearHiddenCloseTimeout();
        this.clearInactivityTimer();
        
        this.connectPromise = new Promise(async (resolve, reject) => {
            const timeoutDuration = 12000; // 12 second global timeout for establishing connection
            let timeoutId = setTimeout(() => {
                console.error("Connection attempt timed out globally!");
                if (this.ws) {
                    try { this.ws.close(); } catch(e) {}
                    this.ws = null;
                }
                this.connected = false;
                this.connectPromise = null;
                reject(new Error("Connection timed out. Please check your network and try again."));
            }, timeoutDuration);

            try {
                this.trigger('connecting');
                
                // 1. Fetch config with timeout
                console.log("Fetching serverless config.json...");
                const configResp = await Promise.race([
                    fetch('/config.json'),
                    new Promise((_, r) => setTimeout(() => r(new Error("Config fetch timed out")), 5000))
                ]);
                if (!configResp.ok) throw new Error("Could not fetch serverless config.json");
                const config = await configResp.json();
                
                // 2. Retrieve identity ID token from storage
                const idToken = localStorage.getItem('idToken');
                if (!idToken) {
                    console.warn("No ID Token found. Redirecting to login.");
                    window.location.href = '/login.html';
                    clearTimeout(timeoutId);
                    this.connectPromise = null;
                    return;
                }
                
                // 3. Authenticate with Federated Identity Pool and get credentials with timeout
                const providerName = `cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`;
                console.log("Retrieving temporary AWS credentials from Identity Pool...");
                
                const cognitoPromise = (async () => {
                    const idResponse = await fetch(`https://cognito-identity.${config.region}.amazonaws.com/`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/x-amz-json-1.1",
                            "X-Amz-Target": "AWSCognitoIdentityService.GetId"
                        },
                        body: JSON.stringify({
                            IdentityPoolId: config.identityPoolId,
                            Logins: { [providerName]: idToken }
                        })
                    });
                    if (!idResponse.ok) throw new Error("Failed to retrieve Identity ID from Cognito.");
                    const { IdentityId } = await idResponse.json();

                    const credsResponse = await fetch(`https://cognito-identity.${config.region}.amazonaws.com/`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/x-amz-json-1.1",
                            "X-Amz-Target": "AWSCognitoIdentityService.GetCredentialsForIdentity"
                        },
                        body: JSON.stringify({
                            IdentityId: IdentityId,
                            Logins: { [providerName]: idToken }
                        })
                    });
                    if (!credsResponse.ok) throw new Error("Failed to retrieve credentials from Cognito.");
                    const { Credentials } = await credsResponse.json();
                    return {
                        accessKeyId: Credentials.AccessKeyId,
                        secretAccessKey: Credentials.SecretKey,
                        sessionToken: Credentials.SessionToken
                    };
                })();

                const credentials = await Promise.race([
                    cognitoPromise,
                    new Promise((_, r) => setTimeout(() => r(new Error("Cognito credentials fetch timed out")), 5000))
                ]);

                // 4. Load ESM SigV4 signer modules dynamically from ESM CDN with timeout
                console.log("Loading ESM Signature modules...");
                const esmPromise = (async () => {
                    const SignatureV4 = (await import('https://esm.sh/@smithy/signature-v4')).SignatureV4;
                    const Sha256 = (await import('https://esm.sh/@aws-crypto/sha256-browser')).Sha256;
                    const HttpRequest = (await import('https://esm.sh/@smithy/protocol-http')).HttpRequest;
                    return { SignatureV4, Sha256, HttpRequest };
                })();

                const { SignatureV4, Sha256, HttpRequest } = await Promise.race([
                    esmPromise,
                    new Promise((_, r) => setTimeout(() => r(new Error("ESM modules load timed out (esm.sh network issue)")), 6000))
                ]);

                // 5. Presign the AWS Bedrock AgentCore websocket URL
                const encodedArn = encodeURIComponent(config.runtimeArn);
                const host = `bedrock-agentcore.${config.region}.amazonaws.com`;
                const path = `/runtimes/${encodedArn}/ws`;
                const selectedCharacters = getSelectedCharacters();
                const voiceId = getAssistantVoiceId(selectedCharacters);
                const charactersParam = selectedCharacters.length > 0 ? selectedCharacters.join(',') : 'all';

                const request = new HttpRequest({
                    method: 'GET',
                    protocol: 'https:',
                    hostname: host,
                    path: path,
                    headers: { host },
                    query: { voice_id: voiceId, characters: charactersParam },
                });

                const signer = new SignatureV4({
                    service: 'bedrock-agentcore',
                    region: config.region,
                    credentials,
                    sha256: Sha256,
                });

                console.log("Generating IAM SigV4 pre-signed signature...");
                const signedRequest = await signer.presign(request, { expiresIn: 300 });
                const queryParams = new URLSearchParams(signedRequest.query);
                const wsUrl = `wss://${host}${path}?${queryParams.toString()}`;

                console.log(`Connecting to serverless AWS Bedrock AgentCore WebSocket...`);
                const ws = new WebSocket(wsUrl);
                this.ws = ws;
                
                let isConnectionSettled = false;
                
                ws.onopen = () => {
                    console.log("WebSocket connection established!");
                    clearTimeout(timeoutId);
                    this.connected = true;
                    this.resetInactivityTimer();
                    if (document.visibilityState === 'hidden') {
                        this.scheduleHiddenClose();
                    }
                    this.trigger('connect');
                    if (!isConnectionSettled) {
                        isConnectionSettled = true;
                        resolve(ws);
                    }
                };
                
                ws.onclose = (event) => {
                    console.log(`WebSocket connection closed: code=${event.code}, reason=${event.reason}`);
                    clearTimeout(timeoutId);
                    this.connected = false;
                    this.clearHiddenCloseTimeout();
                    this.clearInactivityTimer();
                    this.trigger('disconnect');
                    this.connectPromise = null;
                    this.ws = null;
                    if (!isConnectionSettled) {
                        isConnectionSettled = true;
                        reject(new Error(`WebSocket connection closed: code=${event.code}`));
                    }
                };
                
                ws.onerror = (error) => {
                    console.error("WebSocket transport error:", error);
                    clearTimeout(timeoutId);
                    this.connected = false;
                    this.clearHiddenCloseTimeout();
                    this.clearInactivityTimer();
                    this.trigger('error', error);
                    this.connectPromise = null;
                    if (!isConnectionSettled) {
                        isConnectionSettled = true;
                        reject(error);
                    }
                };
                
                ws.onmessage = (event) => {
                    try {
                        this.resetInactivityTimer();
                        console.log("📥 Raw WebSocket Message from Bedrock AgentCore:", event.data);
                        const payload = JSON.parse(event.data);
                        if (payload.type) {
                            this.trigger(payload.type, payload);
                        } else if (payload.event) {
                            const eventKey = Object.keys(payload.event)[0];
                            if (eventKey) {
                                const eventData = payload.event[eventKey];
                                console.log(`👉 Extracted native event '${eventKey}':`, eventData);
                                this.trigger(eventKey, eventData);
                            }
                        }
                    } catch (err) {
                        console.error("Error parsing WebSocket message JSON:", err);
                    }
                };

            } catch (err) {
                console.error("Failed to establish serverless AgentCore connection:", err);
                clearTimeout(timeoutId);
                this.connected = false;
                this.connectPromise = null;
                this.trigger('connect_error', err);
                reject(err);
            }
        });
        
        return this.connectPromise;
    }
    
    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }
    
    emit(event, data = {}) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn(`WebSocket is not open. Packet dropped.`);
            return;
        }
        
        let payload = {};
        if (event === 'audioInput') {
            payload = {
                type: 'bidi_audio_input',
                audio: data,
                format: 'pcm',
                sample_rate: 16000,
                channels: 1
            };
        } else if (event === 'character') {
            payload = {
                type: 'character',
                characters: data
            };
        } else if (event === 'stopAudio') {
            payload = {
                type: 'stopAudio'
            };
        } else if (event === 'audioStart' || event === 'promptStart' || event === 'systemPrompt') {
            payload = {
                type: event
            };
        } else {
            payload = {
                type: event,
                data: data
            };
        }
        
        this.resetInactivityTimer();
        this.ws.send(JSON.stringify(payload));
    }

    disconnect(reason = 'client shutdown') {
        this.clearHiddenCloseTimeout();
        this.clearInactivityTimer();

        if (!this.ws) {
            this.connected = false;
            this.connectPromise = null;
            return;
        }

        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
            try {
                this.ws.close(1000, reason.slice(0, 120));
            } catch (e) {
                console.warn("Error closing WebSocket connection:", e);
            }
            return;
        }

        this.ws = null;
        this.connected = false;
        this.connectPromise = null;
    }

    handleVisibilityChange() {
        if (document.visibilityState === 'hidden') {
            this.scheduleHiddenClose();
            return;
        }

        this.clearHiddenCloseTimeout();
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.resetInactivityTimer();
        }
    }

    handlePageHide() {
        this.disconnect('page hidden');
    }

    handleBeforeUnload() {
        this.disconnect('page unloading');
    }

    scheduleHiddenClose() {
        this.clearHiddenCloseTimeout();
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }

        this.hiddenCloseTimeoutId = window.setTimeout(() => {
            console.log("Closing WebSocket after tab stayed hidden.");
            this.disconnect('tab hidden');
        }, HIDDEN_SOCKET_CLOSE_DELAY_MS);
    }

    clearHiddenCloseTimeout() {
        if (this.hiddenCloseTimeoutId) {
            window.clearTimeout(this.hiddenCloseTimeoutId);
            this.hiddenCloseTimeoutId = null;
        }
    }

    resetInactivityTimer() {
        this.clearInactivityTimer();
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }

        this.inactivityTimeoutId = window.setTimeout(() => {
            if (isStreaming) {
                this.resetInactivityTimer();
                return;
            }

            console.log("Closing idle WebSocket after inactivity.");
            this.disconnect('inactive session');
        }, SOCKET_INACTIVITY_CLOSE_DELAY_MS);
    }

    clearInactivityTimer() {
        if (this.inactivityTimeoutId) {
            window.clearTimeout(this.inactivityTimeoutId);
            this.inactivityTimeoutId = null;
        }
    }
    
    trigger(event, data) {
        const callbacks = this.listeners[event];
        if (callbacks) {
            callbacks.forEach(cb => {
                try {
                    cb(data);
                } catch (e) {
                    console.error(`Error in event listener for ${event}:`, e);
                }
            });
        }
    }
}

const socket = new NativeSocketEmulator();

// DOM elements
const startButton = document.getElementById('start');
const stopButton = document.getElementById('stop');
const statusElement = document.getElementById('status');
const chatContainer = document.getElementById('chat-container');
const characterSelect = document.getElementById('character-select');
const missionStageElement = document.getElementById('mission-stage');
const missionTurnsElement = document.getElementById('mission-turns');
const overallScoreElement = document.getElementById('overall-score-value');
const missionTitleElement = document.getElementById('mission-title');
const missionObjectiveElement = document.getElementById('mission-objective');
const missionFeedbackElement = document.getElementById('mission-feedback');
const gameBannerElement = document.getElementById('game-banner');
const targetLanguageSelect = document.getElementById('target-language-select');
const targetLanguageNoteElement = document.getElementById('target-language-note');
const missionStepsElement = document.getElementById('mission-steps');
const missionSampleElement = document.getElementById('mission-sample');
const missionSuccessElement = document.getElementById('mission-success');
const missionQuickWinElement = document.getElementById('mission-quick-win');
const missionClearChecklistElement = document.getElementById('mission-clear-checklist');
const agentTeamStatusElement = document.getElementById('agent-team-status');
const agentCoachFeedbackElement = document.getElementById('agent-coach-feedback');
const agentCoachExampleElement = document.getElementById('agent-coach-example');
const agentJudgeSummaryElement = document.getElementById('agent-judge-summary');
const agentDirectorBriefElement = document.getElementById('agent-director-brief');
const agentDirectorGoalElement = document.getElementById('agent-director-goal');
const SUPPORTED_ROUTE_VOICE_IDS = new Set([
    'tiffany',
    'matthew',
    'amy',
    'olivia',
    'kiara',
    'ambre',
    'beatrice',
    'tina',
    'lupe',
    'carolina'
]);
const DEFAULT_ROUTE_VOICE_IDS = {
    shizuku: 'tiffany',
    chitose: 'matthew'
};

function formatScoreValue(value) {
    return typeof value === 'number' && Number.isFinite(value) ? String(value) : '--';
}

// Chat history management
let chat = { history: [] };
const chatRef = { current: chat };
const chatHistoryManager = ChatHistoryManager.getInstance(
    chatRef,
    (newChat) => {
        chat = { ...newChat };
        chatRef.current = chat;
        updateChatUI();
    }
);

// Audio processing variables
let audioContext;
let audioStream;
let isStreaming = false;
let processor;
let sourceNode;
let waitingForAssistantResponse = false;
let waitingForUserTranscription = false;
let userThinkingIndicator = null;
let assistantThinkingIndicator = null;
let transcriptionReceived = false;
let displayAssistantText = false;
let role;
const audioPlayer = new AudioPlayer();
let sessionInitialized = false;
let gameState = null;

// Voice-Text Real-time Lip-Sync and Typewriter synchronization variables
let totalSamplesReceived = 0;
let currentFullText = "";
let isSpeakingTurn = false;
let assistantTurnEnded = false;
let syncLoopId = null;

function stopSyncLoop() {
    isSpeakingTurn = false;
    if (syncLoopId) {
        clearInterval(syncLoopId);
        syncLoopId = null;
    }
    // Cleanly seal and finalize the active typewriter block
    chatHistoryManager.finalizeTypewriterMessage();
}

function startSyncLoop() {
    if (syncLoopId) return;

    syncLoopId = setInterval(() => {
        if (!isSpeakingTurn) {
            stopSyncLoop();
            return;
        }

        const played = audioPlayer.getSamplesPlayed();

        // If we haven't received any audio packet count yet from WebSocket, hold back
        if (totalSamplesReceived === 0) {
            return;
        }

        const progress = Math.min(1, played / totalSamplesReceived);

        // Map progress to exact characters to reveal
        const visibleLength = Math.floor(progress * currentFullText.length);
        const visibleText = currentFullText.substring(0, visibleLength);

        if (visibleText) {
            // High performance, target-pointed direct element text content updates
            chatHistoryManager.updateTypewriterMessage(visibleText);
            
            // Update RPG Dialogue Box
            const rpgDialogueText = document.getElementById('dialogue-text');
            if (rpgDialogueText) {
                rpgDialogueText.textContent = visibleText;
            }
        }

        // If playback of all received audio samples has completed (and the server has finished sending the sentence blocks)
        if (progress >= 1 && played >= totalSamplesReceived && assistantTurnEnded) {
            stopSyncLoop();

            // Final safety snap to make sure full text is flushed
            chatHistoryManager.updateTypewriterMessage(currentFullText);
        }
    }, 50); // Fluid polling every 50ms for seamless subtitle typewriter effect
}

function getSelectedCharacters() {
    const selected = Array.from(characterSelect.selectedOptions).map(opt => opt.value);

    const normalized = selected.filter(val => ['shizuku', 'chitose'].includes(val));
    if (normalized.length === 0) {
        return ['shizuku'];
    }
    return [normalized[0]];
}

function getDefaultAssistantVoiceId(selectedCharacters = getSelectedCharacters()) {
    if (selectedCharacters.length === 1) {
        return DEFAULT_ROUTE_VOICE_IDS[selectedCharacters[0]] || 'tiffany';
    }
    return DEFAULT_ROUTE_VOICE_IDS.shizuku;
}

function getAssistantVoiceId(selectedCharacters = getSelectedCharacters()) {
    const requestedVoiceId = (getQueryParams().voice_id || '').trim().toLowerCase();
    if (requestedVoiceId && SUPPORTED_ROUTE_VOICE_IDS.has(requestedVoiceId)) {
        return requestedVoiceId;
    }
    return getDefaultAssistantVoiceId(selectedCharacters);
}

function formatVoiceLabel(voiceId) {
    if (!voiceId) {
        return 'Tiffany';
    }
    return voiceId.charAt(0).toUpperCase() + voiceId.slice(1);
}

function renderGameState(state) {
    if (!state) return;

    gameState = state;

    if (missionStageElement) {
        missionStageElement.textContent = `${state.stageIndex} / ${state.totalStages}`;
    }

    if (missionTurnsElement) {
        missionTurnsElement.textContent = String(state.turnsRemaining);
    }

    if (overallScoreElement) {
        overallScoreElement.textContent = formatScoreValue(state.overallScore);
    }

    if (missionTitleElement) {
        missionTitleElement.textContent = state.currentMission?.title || 'Challenge Complete';
    }

    if (missionObjectiveElement) {
        missionObjectiveElement.textContent =
            state.currentMission?.objective || 'All speaking missions are cleared.';
    }

    if (missionFeedbackElement) {
        missionFeedbackElement.textContent = state.lastFeedback || '';
    }

    if (missionStepsElement) {
        const steps = state.currentMission?.howToPlay || [];
        missionStepsElement.innerHTML = '';
        steps.forEach((step) => {
            const item = document.createElement('li');
            item.textContent = step;
            missionStepsElement.appendChild(item);
        });
    }

    if (missionSampleElement) {
        missionSampleElement.textContent =
            state.currentMission?.sampleAnswer || 'Follow the mission prompt with a short spoken answer.';
    }

    if (missionQuickWinElement) {
        missionQuickWinElement.textContent =
            state.currentMission?.quickWinTip
            || 'Say one full answer that covers the mission objective, then press Stop Practice to score the turn.';
    }

    if (missionSuccessElement) {
        const signals = state.currentMission?.successSignals || [];
        missionSuccessElement.innerHTML = '';
        signals.forEach((signal) => {
            const item = document.createElement('li');
            item.textContent = signal;
            missionSuccessElement.appendChild(item);
        });
    }

    if (missionClearChecklistElement) {
        const checklist = state.currentMission?.clearChecklist || [];
        missionClearChecklistElement.innerHTML = '';
        checklist.forEach((entry) => {
            const item = document.createElement('li');
            item.textContent = entry;
            missionClearChecklistElement.appendChild(item);
        });
    }

    const targetLanguage = state.targetLanguage || {};
    const supportedLanguages = state.supportedLanguages || [];
    if (targetLanguageSelect) {
        if (supportedLanguages.length > 0 && targetLanguageSelect.options.length !== supportedLanguages.length) {
            targetLanguageSelect.innerHTML = '';
            supportedLanguages.forEach((language) => {
                const option = document.createElement('option');
                option.value = language.code;
                option.textContent = language.label;
                targetLanguageSelect.appendChild(option);
            });
        }
        if (targetLanguage.code) {
            targetLanguageSelect.value = targetLanguage.code;
        }
    }
    if (targetLanguageNoteElement) {
        const recommendedVoice = formatVoiceLabel(targetLanguage.recommendedVoice || 'tiffany');
        const activeVoice = formatVoiceLabel(getAssistantVoiceId());
        targetLanguageNoteElement.textContent = recommendedVoice === activeVoice
            ? `Recommended Nova Sonic voice: ${recommendedVoice}.`
            : `Recommended Nova Sonic voice: ${recommendedVoice}. Current route voice: ${activeVoice}.`;
    }

    const agentTeam = state.agentTeam || {};
    if (agentTeamStatusElement) {
        agentTeamStatusElement.classList.remove('is-ready', 'is-error');
        if (agentTeam.status === 'ready') {
            agentTeamStatusElement.classList.add('is-ready');
            agentTeamStatusElement.textContent = `Multi-agent team active (${agentTeam.model_id || 'configured model'}).`;
        } else if (agentTeam.status === 'error') {
            agentTeamStatusElement.classList.add('is-error');
            agentTeamStatusElement.textContent = `Multi-agent team error: ${agentTeam.error_message || 'unknown error'}`;
        } else {
            agentTeamStatusElement.textContent = 'Waiting for the first AI-scored turn...';
        }
    }

    if (agentCoachFeedbackElement) {
        agentCoachFeedbackElement.textContent =
            agentTeam.coach_feedback || 'The coach agent will suggest how to improve your next answer.';
    }
    if (agentCoachExampleElement) {
        agentCoachExampleElement.textContent = agentTeam.coach_example
            ? `Model line: ${agentTeam.coach_example}`
            : '';
    }
    if (agentJudgeSummaryElement) {
        agentJudgeSummaryElement.textContent =
            agentTeam.judge_summary || 'The judge agent will explain mission coverage after your answer.';
    }
    if (agentDirectorBriefElement) {
        agentDirectorBriefElement.textContent =
            agentTeam.director_scene_brief || 'The director agent will decide the next roleplay beat.';
    }
    if (agentDirectorGoalElement) {
        agentDirectorGoalElement.textContent = agentTeam.director_assistant_goal
            ? `Visible agent goal: ${agentTeam.director_assistant_goal}${agentTeam.director_next_question ? ` Next question: ${agentTeam.director_next_question}` : ''}`
            : '';
    }

    const breakdown = state.lastBreakdown || {};
    ['taskCompletion', 'fluency', 'vocabulary', 'grammar', 'confidence'].forEach((key) => {
        const node = document.getElementById(`score-${key}`);
        if (node) {
            node.textContent = formatScoreValue(breakdown[key]);
        }
    });

    if (gameBannerElement) {
        gameBannerElement.classList.remove('is-won', 'is-lost');
        if (state.status === 'won') {
            gameBannerElement.classList.add('is-won');
            gameBannerElement.textContent = 'You win! All oral-practice missions are cleared.';
        } else if (state.status === 'lost') {
            gameBannerElement.classList.add('is-lost');
            gameBannerElement.textContent = 'Challenge failed. Restart and clear all speaking missions next time.';
        } else {
            const passingScore = state.currentMission?.passingScore;
            const quickWinTip = state.currentMission?.quickWinTip;
            gameBannerElement.textContent = passingScore
                ? `Pass score: ${passingScore}. ${quickWinTip || 'Finish the mission objective and press Stop Practice to score the turn.'}`
                : 'Finish the mission objective, then press Stop Practice to score the turn.';
        }
    }

    if (state.status === 'won' || state.status === 'lost') {
        const speakerNameEl = document.getElementById('current-speaker');
        const rpgDialogueText = document.getElementById('dialogue-text');
        if (speakerNameEl) {
            speakerNameEl.textContent = 'Narrator';
        }
        if (rpgDialogueText) {
            rpgDialogueText.textContent = state.lastFeedback;
        }
    }
}

function applyCharacterSelection(values) {
    const normalized = values
        .map(value => value.trim().toLowerCase())
        .filter(value => ['shizuku', 'chitose'].includes(value));

    Array.from(characterSelect.options).forEach(option => {
        option.selected = false;
    });

    const nextValue = normalized[0] || 'shizuku';
    const match = characterSelect.querySelector(`option[value="${nextValue}"]`);
    if (match) match.selected = true;

    characterSelect.dispatchEvent(new Event('change'));
}

function getAssistantSpeakerName() {
    return getSelectedCharacters()[0].toUpperCase();
}

function syncCharacterVisibility() {
    const charLeft = document.getElementById('char-left');
    const charRight = document.getElementById('char-right');
    const selectedCharacters = getSelectedCharacters();
    const isChitoseRoute = selectedCharacters[0] === 'chitose';

    if (!charLeft || !charRight) {
        return;
    }

    charLeft.classList.toggle('is-hidden', isChitoseRoute);
    charRight.classList.toggle('is-hidden', !isChitoseRoute);

    if (isChitoseRoute) {
        charLeft.classList.remove('active');
    } else {
        charRight.classList.remove('active');
    }
}

characterSelect.addEventListener('change', () => {
    console.log(`Selected characters updated: ${getSelectedCharacters().join(', ')}`);
    syncCharacterVisibility();
});

targetLanguageSelect?.addEventListener('change', () => {
    if (!targetLanguageSelect.value) return;
    socket.emit('target_language', targetLanguageSelect.value);
});

// Initialize WebSocket audio
async function initAudio() {
    try {
        statusElement.textContent = "Requesting microphone access...";
        statusElement.className = "connecting";

        // Request microphone access
        audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        audioContext = new AudioContext({
            sampleRate: 16000
        });

        await audioPlayer.start();

        statusElement.textContent = "Microphone ready. Click Start to begin.";
        statusElement.className = "ready";
        startButton.disabled = false;
    } catch (error) {
        console.error("Error accessing microphone:", error);
        statusElement.textContent = "Error: " + error.message;
        statusElement.className = "error";
    }
}

// Initialize the session with Bedrock
async function initializeSession() {
    if (sessionInitialized) return;

    statusElement.textContent = "Initializing session...";

    try {
        // Ensure WebSocket is connected
        await socket.connect();
        
        // Send events in sequence 
        const characters = getSelectedCharacters();
        socket.emit('character', characters);
        if (targetLanguageSelect?.value) {
            socket.emit('target_language', targetLanguageSelect.value);
        }
        await new Promise(resolve => setTimeout(resolve, 250));
        socket.emit('promptStart');
        socket.emit('systemPrompt');
        await new Promise(resolve => setTimeout(resolve, 1000));

        socket.emit('audioStart');

        // Mark session as initialized
        sessionInitialized = true;
        statusElement.textContent = "Session initialized successfully";
    } catch (error) {
        console.error("Failed to initialize session:", error);
        statusElement.textContent = "Error: " + error.message;
        statusElement.className = "error";
    }
}

async function startStreaming() {
    if (isStreaming) return;

    // Instantly halt any running AI typewriter/synchronization loop
    stopSyncLoop();

    try {
        // Lazily initialize microphone and audio context upon first user-click interaction!
        // This complies 100% with iOS Safari user gesture requirements.
        if (!audioContext || !audioStream) {
            await initAudio();
            if (!audioContext || !audioStream) {
                return; // Error status is already set inside initAudio()
            }
        }

        // First, make sure the session is initialized
        if (!sessionInitialized) {
            await initializeSession();
        }

        // Create audio processor
        sourceNode = audioContext.createMediaStreamSource(audioStream);

        // Use ScriptProcessorNode for audio processing
        if (audioContext.createScriptProcessor) {
            processor = audioContext.createScriptProcessor(512, 1, 1);

            processor.onaudioprocess = (e) => {
                if (!isStreaming) return;

                const inputData = e.inputBuffer.getChannelData(0);

                // Calculate real-time input volume for user character lip-sync
                let sum = 0;
                for (let i = 0; i < inputData.length; i++) {
                    sum += inputData[i] * inputData[i];
                }
                const rms = Math.sqrt(sum / inputData.length);
                audioPlayer.setInputVolume(rms);

                // Update Voice Status HUD for microphone
                const voiceBar = document.getElementById('voice-bar-fill');
                if (voiceBar) {
                    voiceBar.style.width = `${Math.min(rms * 500, 100)}%`;
                }

                // Convert to 16-bit PCM
                const pcmData = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
                }

                // Convert to base64 (browser-safe way)
                const base64Data = arrayBufferToBase64(pcmData.buffer);

                // Send to server
                socket.emit('audioInput', base64Data);
            };

            sourceNode.connect(processor);
            processor.connect(audioContext.destination);
        }

        isStreaming = true;
        startButton.disabled = true;
        stopButton.disabled = false;
        statusElement.textContent = "Streaming... Speak now";
        statusElement.className = "recording";

        // Show user thinking indicator when starting to record
        transcriptionReceived = false;
        showUserThinkingIndicator();

    } catch (error) {
        console.error("Error starting recording:", error);
        statusElement.textContent = "Error: " + error.message;
        statusElement.className = "error";
    }
}

// Convert ArrayBuffer to base64 string
function arrayBufferToBase64(buffer) {
    const binary = [];
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary.push(String.fromCharCode(bytes[i]));
    }
    return btoa(binary.join(''));
}

// Parse URL query parameters
function getQueryParams() {
    const params = {};
    const queryString = window.location.search.substring(1);
    const pairs = queryString.split('&');

    for (let i = 0; i < pairs.length; i++) {
        if (!pairs[i]) continue;
        const pair = pairs[i].split('=');
        params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || '');
    }

    return params;
}

function stopStreaming() {
    if (!isStreaming) return;

    isStreaming = false;

    // Clean up audio processing
    if (processor) {
        processor.disconnect();
        sourceNode.disconnect();
    }

    startButton.disabled = false;
    stopButton.disabled = true;
    statusElement.textContent = "Processing...";
    statusElement.className = "processing";

    audioPlayer.stop();
    // Tell server to finalize processing
    socket.emit('stopAudio');

    // End the current turn in chat history
    chatHistoryManager.endTurn();
}

// Base64 to Float32Array conversion with robust WAV header stripping
function base64ToFloat32Array(base64String) {
    try {
        const binaryString = window.atob(base64String);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        let pcmDataBytes = bytes;

        // Check if this is a WAV container file (RIFF...WAVE)
        if (bytes.length > 44 && 
            bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // "RIFF"
            bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45  // "WAVE"
        ) {
            console.log("ℹ️ WAV container detected. Stripping header...");
            // Scan for the "data" subchunk marker to locate raw PCM payload
            let dataOffset = -1;
            for (let i = 12; i < bytes.length - 8; i++) {
                if (bytes[i] === 0x64 && bytes[i+1] === 0x61 && bytes[i+2] === 0x74 && bytes[i+3] === 0x61) { // "data"
                    dataOffset = i + 8; // skip 4 bytes of "data" and 4 bytes of subchunk size
                    break;
                }
            }
            if (dataOffset !== -1) {
                console.log(`🎯 Raw PCM payload located at byte offset: ${dataOffset}`);
                pcmDataBytes = new Uint8Array(bytes.buffer, dataOffset);
            } else {
                console.warn("⚠️ WAV 'data' subchunk not found. Falling back to byte offset 44.");
                pcmDataBytes = new Uint8Array(bytes.buffer, 44);
            }
        }

        // Int16Array representing the raw pcm data samples
        const int16Array = new Int16Array(pcmDataBytes.buffer, pcmDataBytes.byteOffset, pcmDataBytes.byteLength / 2);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768.0;
        }

        return float32Array;
    } catch (error) {
        console.error('Error in base64ToFloat32Array:', error);
        throw error;
    }
}

// Process message data and add to chat history
function handleTextOutput(data) {
    console.log("Processing text output:", data);
    if (data.content) {
        const messageData = {
            role: data.role,
            message: data.content
        };
        chatHistoryManager.addTextMessage(messageData);
    }
}

// Update the UI based on the current chat history
function updateChatUI() {
    if (!chatContainer) {
        console.error("Chat container not found");
        return;
    }

    // Select only standard message blocks, ignoring any thinking placeholder divs
    const existingMessageDivs = Array.from(chatContainer.querySelectorAll('.message:not(.thinking)'));
    const history = chat.history || [];

    // Incrementally reconcile elements
    history.forEach((item, index) => {
        if (item.endOfConversation) {
            if (index < existingMessageDivs.length) {
                const el = existingMessageDivs[index];
                if (!el.classList.contains('system')) {
                    el.className = 'message system';
                    el.textContent = "Conversation ended";
                }
            } else {
                const endDiv = document.createElement('div');
                endDiv.className = 'message system';
                endDiv.textContent = "Conversation ended";
                chatContainer.appendChild(endDiv);
            }
            return;
        }

        if (item.role) {
            const roleLowerCase = item.role.toLowerCase();
            let messageDiv;

            if (index < existingMessageDivs.length) {
                // Reuse existing DOM node
                messageDiv = existingMessageDivs[index];
                
                // Ensure proper css styling classes are mirrored
                if (!messageDiv.classList.contains(roleLowerCase)) {
                    messageDiv.className = `message ${roleLowerCase}`;
                }

                // Update text content of content element only
                const contentDiv = messageDiv.querySelector('.message-content');
                if (contentDiv) {
                    if (contentDiv.textContent !== item.message) {
                        contentDiv.textContent = item.message || "";
                    }
                } else {
                    // Fallback structural reset
                    messageDiv.innerHTML = '';
                    const roleLabel = document.createElement('div');
                    roleLabel.className = 'role-label';
                    roleLabel.textContent = item.role;
                    messageDiv.appendChild(roleLabel);

                    const content = document.createElement('div');
                    content.className = 'message-content';
                    content.textContent = item.message || "No content";
                    messageDiv.appendChild(content);
                }
            } else {
                // Create brand new element on overflow
                messageDiv = document.createElement('div');
                messageDiv.className = `message ${roleLowerCase}`;

                const roleLabel = document.createElement('div');
                roleLabel.className = 'role-label';
                roleLabel.textContent = item.role;
                messageDiv.appendChild(roleLabel);

                const content = document.createElement('div');
                content.className = 'message-content';
                content.textContent = item.message || "No content";
                messageDiv.appendChild(content);

                chatContainer.appendChild(messageDiv);
            }
        }
    });

    // Remove obsolete messages from DOM if history shrank
    if (existingMessageDivs.length > history.length) {
        for (let i = history.length; i < existingMessageDivs.length; i++) {
            existingMessageDivs[i].remove();
        }
    }

    // Re-add thinking indicators if we're still waiting
    if (waitingForUserTranscription) {
        showUserThinkingIndicator();
    }

    if (waitingForAssistantResponse) {
        showAssistantThinkingIndicator();
    }

    // Scroll to bottom
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Show the "Listening" indicator for user
function showUserThinkingIndicator() {
    waitingForUserTranscription = true;
    if (userThinkingIndicator && userThinkingIndicator.parentNode === chatContainer) {
        return; // Node already active in container, skip recreation to avoid flashing
    }
    hideUserThinkingIndicator();

    waitingForUserTranscription = true;
    userThinkingIndicator = document.createElement('div');
    userThinkingIndicator.className = 'message user thinking';

    const roleLabel = document.createElement('div');
    roleLabel.className = 'role-label';
    roleLabel.textContent = 'USER';
    userThinkingIndicator.appendChild(roleLabel);

    const listeningText = document.createElement('div');
    listeningText.className = 'thinking-text';
    listeningText.textContent = 'Listening';
    userThinkingIndicator.appendChild(listeningText);

    const dotContainer = document.createElement('div');
    dotContainer.className = 'thinking-dots';

    for (let i = 0; i < 3; i++) {
        const dot = document.createElement('span');
        dot.className = 'dot';
        dotContainer.appendChild(dot);
    }

    userThinkingIndicator.appendChild(dotContainer);
    chatContainer.appendChild(userThinkingIndicator);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Show the "Thinking" indicator for assistant
function showAssistantThinkingIndicator() {
    waitingForAssistantResponse = true;
    if (assistantThinkingIndicator && assistantThinkingIndicator.parentNode === chatContainer) {
        return; // Node already active in container, skip recreation to avoid flashing
    }
    hideAssistantThinkingIndicator();

    waitingForAssistantResponse = true;
    assistantThinkingIndicator = document.createElement('div');
    assistantThinkingIndicator.className = 'message assistant thinking';

    const roleLabel = document.createElement('div');
    roleLabel.className = 'role-label';
    roleLabel.textContent = 'ASSISTANT';
    assistantThinkingIndicator.appendChild(roleLabel);

    const thinkingText = document.createElement('div');
    thinkingText.className = 'thinking-text';
    thinkingText.textContent = 'Thinking';
    assistantThinkingIndicator.appendChild(thinkingText);

    const dotContainer = document.createElement('div');
    dotContainer.className = 'thinking-dots';

    for (let i = 0; i < 3; i++) {
        const dot = document.createElement('span');
        dot.className = 'dot';
        dotContainer.appendChild(dot);
    }

    assistantThinkingIndicator.appendChild(dotContainer);
    chatContainer.appendChild(assistantThinkingIndicator);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Hide the user thinking indicator
function hideUserThinkingIndicator() {
    waitingForUserTranscription = false;
    if (userThinkingIndicator && userThinkingIndicator.parentNode) {
        userThinkingIndicator.parentNode.removeChild(userThinkingIndicator);
    }
    userThinkingIndicator = null;
}

// Hide the assistant thinking indicator
function hideAssistantThinkingIndicator() {
    waitingForAssistantResponse = false;
    if (assistantThinkingIndicator && assistantThinkingIndicator.parentNode) {
        assistantThinkingIndicator.parentNode.removeChild(assistantThinkingIndicator);
    }
    assistantThinkingIndicator = null;
}

// EVENT HANDLERS
// --------------

// Handle content start from the server
socket.on('contentStart', (data) => {
    console.log('Content start received:', data);

    if (data.type === 'TEXT') {
        role = data.role;
        if (data.role === 'USER') {
            // When user's text content starts, hide user thinking indicator
            hideUserThinkingIndicator();
        }
        else if (data.role === 'ASSISTANT') {
            // When assistant's text content starts, hide both user and assistant thinking indicators
            hideUserThinkingIndicator();
            hideAssistantThinkingIndicator();
        }
    }
    else if (data.type === 'AUDIO') {
        // When audio content starts, we may need to show user thinking indicator
        if (isStreaming) {
            showUserThinkingIndicator();
        }
    }
});

// Handle text output from the server
socket.on('textOutput', (data) => {
    console.log('Received text output:', data);

    // Use current message role primarily, fallback to tracked role
    const currentRole = data.role || role;

    if (currentRole === 'USER') {
        // Stop any active typewriter synchronizers immediately
        stopSyncLoop();

        // When user text is received, show thinking indicator for assistant response
        transcriptionReceived = true;
        hideUserThinkingIndicator();

        // Add user message to chat
        handleTextOutput({
            role: data.role || 'USER',
            content: data.content
        });

        // Update RPG UI for User
        updateRpgSpeaker('USER', data.content);

        // Show assistant thinking indicator after user text appears
        showAssistantThinkingIndicator();
    }
    else if (currentRole === 'ASSISTANT') {
        hideUserThinkingIndicator();
        hideAssistantThinkingIndicator();
        
        // Boot up typewriter synchronizer for assistant responses
        if (!isSpeakingTurn) {
            isSpeakingTurn = true;
            assistantTurnEnded = false;
            totalSamplesReceived = 0;
            audioPlayer.resetSamplesPlayed();

            // Create a brand new active typewriter message bubble for this speech turn
            chatHistoryManager.addTextMessage({
                role: 'ASSISTANT',
                message: '',
                isTypewriterActive: true
            });

            startSyncLoop();
        }

        // Cache the latest cumulative transcription
        currentFullText = data.content || "";
        updateRpgSpeaker('ASSISTANT', currentFullText);
    }
});

function updateRpgSpeaker(role, text) {
    const speakerNameEl = document.getElementById('current-speaker');
    const charLeft = document.getElementById('char-left');
    const charRight = document.getElementById('char-right');
    const selectedCharacters = getSelectedCharacters();

    if (speakerNameEl) {
        speakerNameEl.textContent = role === 'USER' ? 'YOU' : getAssistantSpeakerName();
    }

    if (role === 'ASSISTANT') {
        if (selectedCharacters[0] === 'chitose') {
            charLeft.classList.remove('active');
            charRight.classList.add('active');
        } else {
            charLeft.classList.add('active');
            charRight.classList.remove('active');
        }
    } else {
        charLeft.classList.remove('active');
        charRight.classList.add('active');
    }

    const rpgDialogueText = document.getElementById('dialogue-text');
    if (rpgDialogueText && text) {
        rpgDialogueText.textContent = text;
    }
}

// Handle audio output
socket.on('audioOutput', (data) => {
    // Securely hide thinking indicators as audio streams in
    hideUserThinkingIndicator();
    hideAssistantThinkingIndicator();

    if (data.content) {
        try {
            const audioData = base64ToFloat32Array(data.content);
            
            // Real-time direct WebSocket volume calculation for flawless lip sync
            let sum = 0;
            for (let i = 0; i < audioData.length; i++) {
                sum += audioData[i] * audioData[i];
            }
            const rmsVolume = Math.sqrt(sum / audioData.length);
            audioPlayer.setWebSocketVolume(rmsVolume);

            // Track total samples received for real-time playhead progress calculation
            totalSamplesReceived += audioData.length;

            audioPlayer.playAudio(audioData);

            // Update Voice Status HUD
            const voiceBar = document.getElementById('voice-bar-fill');
            if (voiceBar) {
                const vol = audioPlayer.getVolume();
                voiceBar.style.width = `${Math.min(vol * 500, 100)}%`;
            }
        } catch (error) {
            console.error('Error processing audio data:', error);
        }
    }
});

socket.on('game_state', (data) => {
    renderGameState(data.state || data);
});

// Handle content end events
socket.on('contentEnd', (data) => {
    console.log('Content end received:', data);

    if (data.type === 'TEXT') {
        if (role === 'USER') {
            // When user's text content ends, make sure assistant thinking is shown
            hideUserThinkingIndicator();
            showAssistantThinkingIndicator();
        }
        else if (role === 'ASSISTANT') {
            // When assistant's text content ends, prepare for user input in next turn
            hideAssistantThinkingIndicator();
            assistantTurnEnded = true;
            updateRpgSpeaker('ASSISTANT', currentFullText);
            if (totalSamplesReceived === 0 && currentFullText) {
                chatHistoryManager.updateTypewriterMessage(currentFullText);
                chatHistoryManager.finalizeTypewriterMessage();
            }
        }

        // Handle stop reasons
        if (data.stopReason && data.stopReason.toUpperCase() === 'END_TURN') {
            chatHistoryManager.endTurn();
            assistantTurnEnded = true;
        } else if (data.stopReason && data.stopReason.toUpperCase() === 'INTERRUPTED') {
            console.log("Interrupted by user");
            audioPlayer.bargeIn();
            stopSyncLoop();
        }
    }
    else if (data.type === 'AUDIO') {
        // When audio content ends, we may need to show user thinking indicator
        if (isStreaming) {
            showUserThinkingIndicator();
        }
    }
});

// Stream completion event
socket.on('streamComplete', () => {
    if (isStreaming) {
        stopStreaming();
    }
    statusElement.textContent = "Ready";
    statusElement.className = "ready";
});

// Handle connection status updates
socket.on('connect', () => {
    statusElement.textContent = "Connected to server";
    statusElement.className = "connected";
    sessionInitialized = false;
});

socket.on('disconnect', () => {
    console.log("WebSocket disconnected. Cleaning up streaming state...");
    
    // Clean up audio processing if active
    if (isStreaming) {
        isStreaming = false;
        if (processor) {
            try {
                processor.disconnect();
                sourceNode.disconnect();
            } catch (e) {
                console.warn("Error disconnecting audio nodes:", e);
            }
        }
        audioPlayer.stop();
    }

    statusElement.textContent = "Session ended (finished or timed out). Click Start to resume.";
    statusElement.className = "disconnected";
    startButton.disabled = false; // Keep start button enabled for instant reconnection!
    stopButton.disabled = true;
    sessionInitialized = false;
    hideUserThinkingIndicator();
    hideAssistantThinkingIndicator();
});

socket.on('connect_error', (error) => {
    console.error("Connection error:", error);
    if (error && error.message && error.message.includes('Authentication error')) {
        // Authentication failed, redirect to login
        localStorage.clear();
        window.location.href = '/login.html';
    } else {
        statusElement.textContent = "Connection error: " + (error.message || error);
        statusElement.className = "error";
        startButton.disabled = false; // Allow retrying connection
        stopButton.disabled = true;
    }
});

// Handle errors
socket.on('error', (error) => {
    console.error("Server error:", error);
    statusElement.textContent = "Error: " + (error.message || JSON.stringify(error).substring(0, 100));
    statusElement.className = "error";
    startButton.disabled = false; // Allow restarting session on error
    stopButton.disabled = true;
    hideUserThinkingIndicator();
    hideAssistantThinkingIndicator();
});

// Button event listeners
startButton.addEventListener('click', startStreaming);
stopButton.addEventListener('click', stopStreaming);

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize the Live2D speaking avatar (falls back to Voice Orb automatically on load error)
    initLive2DAvatar(audioPlayer);

    renderGameState({
        status: 'in_progress',
        stageIndex: 1,
        totalStages: 4,
        turnsRemaining: 16,
        overallScore: null,
        lastFeedback: 'Press Start Practice, stay in character, give one natural reply, then press Stop Practice to score the scene.',
        lastBreakdown: {
            taskCompletion: null,
            fluency: null,
            vocabulary: null,
            grammar: null,
            confidence: null
        },
        agentTeam: {
            status: 'pending',
            model_id: '',
            coach_feedback: 'The coach agent is waiting for your first scored turn.',
            coach_example: '',
            judge_summary: 'The judge agent will explain mission coverage after your answer is scored.',
            director_scene_brief: 'The director agent will set the next roleplay beat after your answer.',
            director_assistant_goal: '',
            director_next_question: '',
            error_message: ''
        },
        targetLanguage: {
            code: 'en-US',
            label: 'English (US)',
            recommendedVoice: 'tiffany'
        },
        supportedLanguages: [
            { code: 'en-US', label: 'English (US)', recommendedVoice: 'tiffany' },
            { code: 'en-GB', label: 'English (UK)', recommendedVoice: 'tiffany' },
            { code: 'en-AU', label: 'English (Australia)', recommendedVoice: 'tiffany' },
            { code: 'en-IN', label: 'English / Hindi (India)', recommendedVoice: 'tiffany' },
            { code: 'fr-FR', label: 'French', recommendedVoice: 'tiffany' },
            { code: 'it-IT', label: 'Italian', recommendedVoice: 'tiffany' },
            { code: 'de-DE', label: 'German', recommendedVoice: 'tiffany' },
            { code: 'es-US', label: 'Spanish (US)', recommendedVoice: 'tiffany' },
            { code: 'pt-BR', label: 'Portuguese (Brazil)', recommendedVoice: 'tiffany' },
            { code: 'hi-IN', label: 'Hindi', recommendedVoice: 'tiffany' }
        ],
        currentMission: {
            title: 'Day 1 - First Meeting',
            objective: 'Introduce yourself naturally on a first date: say your name, where you are from or study, and one hobby.',
            howToPlay: [
                'Press Start Practice and listen to the greeting like you are meeting someone cute for the first time.',
                'Say your name in one full sentence.',
                'Add where you study or where you are from.',
                'Finish with one hobby that makes you sound interesting.',
                'Press Stop Practice after your full answer to score this turn.'
            ],
            sampleAnswer: 'Hi, my name is Cyrus. I study at HKIIT in Hong Kong, and I enjoy listening to music after class. It helps me relax.',
            quickWinTip: 'Say your name, where you study or live, and one hobby in one natural first-date answer. Then press Stop Practice to score the turn.',
            successSignals: [
                'You introduce yourself naturally.',
                'You mention your school, city, or background.',
                'You mention one hobby or interest.'
            ],
            clearChecklist: [
                'Introduce yourself naturally.',
                'Mention your school or background.',
                'Mention one hobby or interest.',
                'Use at least 12 words in one answer.',
                'Press Stop Practice after your full answer.'
            ],
            passingScore: 72
        }
    });

    // Check for character parameter in URL
    const params = getQueryParams();
    const requestedCharacters = (params.characters || params.character || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);

    if (requestedCharacters.length > 0) {
        applyCharacterSelection(requestedCharacters);
        console.log(`Auto-selected route: ${requestedCharacters.join(', ')}`);

        setTimeout(() => {
            console.log("Auto-starting streaming...");
            startStreaming();
        }, 3000);
    }
    else {
        applyCharacterSelection(['shizuku']);
    }
});

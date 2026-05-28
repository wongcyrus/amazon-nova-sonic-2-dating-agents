# Amazon Nova Sonic Dating Game

An independent, conversational AI experience powered by **Amazon Nova 2 Sonic**.
This project features high-fidelity Live2D avatars in a cozy anime dating-game environment.

## Features
- **Nova 2 Sonic Integration**: Real-time voice interaction with ultra-low latency.
- **Dual Live2D Characters**: Shizuku and Chitose respond with synchronized mouth movements and emotional expressions.
- **Cozy RPG UI**: A beautiful, glassmorphic anime cafe interface designed for immersive conversation.
- **Independent Deployment**: Fully self-contained AWS CDK infrastructure.

## Getting Started

### Prerequisites
- AWS Account with Bedrock Nova 2 Sonic access.
- Node.js & NPM (for CDK).
- Python 3.12+ (for local backend testing).

### Deployment
Run the included deployment script:
```bash
./deploy.sh
```

### Create a Web User
After deployment, create a Cognito user for the login page:
```bash
python scripts/create_web_user.py \
  --email you@example.com \
  --password 'ChooseAStrongPassword123!'
```

The script reads the user pool ID from `cdk/output.json` by default, so it works right after `./deploy.sh`.

### Local Development
1. Navigate to `backend/` and install dependencies: `pip install -r requirements.txt`
2. Run the server: `python dating_voice_agent.py`
3. Open `frontend/index.html` in your browser (use a local web server like Live Server).

## License
MIT

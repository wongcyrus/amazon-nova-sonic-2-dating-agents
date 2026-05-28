"""Admin utility for creating Cognito users for the web app."""

import argparse
import json
import os
import sys
from pathlib import Path

import boto3
from botocore.exceptions import ClientError


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUTS_PATH = REPO_ROOT / "cdk" / "output.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create a Cognito user for the dating game web login."
    )
    parser.add_argument("--email", required=True, help="Email address for the user.")
    parser.add_argument(
        "--password",
        required=True,
        help="Permanent password to assign to the user.",
    )
    parser.add_argument(
        "--username",
        help="Optional Cognito username. Defaults to the email address.",
    )
    parser.add_argument(
        "--user-pool-id",
        help="Cognito user pool ID. Defaults to env or cdk/output.json.",
    )
    parser.add_argument(
        "--region",
        help="AWS region. Defaults to the pool prefix or AWS_REGION/AWS_DEFAULT_REGION.",
    )
    parser.add_argument(
        "--outputs-file",
        default=str(DEFAULT_OUTPUTS_PATH),
        help="Path to a CDK outputs JSON file for auto-discovering the user pool.",
    )
    return parser.parse_args()


def load_outputs(outputs_path: Path) -> dict:
    if not outputs_path.exists():
        return {}

    with outputs_path.open(encoding="utf-8") as file:
        return json.load(file)


def find_user_pool_id(outputs: dict) -> str | None:
    for stack_outputs in outputs.values():
        if not isinstance(stack_outputs, dict):
            continue

        pool_id = stack_outputs.get("CognitoUserPoolId")
        if pool_id:
            return pool_id

    return None


def resolve_user_pool_id(args: argparse.Namespace) -> str:
    explicit_pool_id = (
        args.user_pool_id
        or os.environ.get("COGNITO_USER_POOL_ID")
        or os.environ.get("CognitoUserPoolId")
    )
    if explicit_pool_id:
        return explicit_pool_id

    discovered_pool_id = find_user_pool_id(load_outputs(Path(args.outputs_file)))
    if discovered_pool_id:
        return discovered_pool_id

    raise ValueError(
        "Could not determine Cognito user pool ID. Pass --user-pool-id or provide cdk/output.json."
    )


def resolve_region(args: argparse.Namespace, user_pool_id: str) -> str:
    if args.region:
        return args.region

    if "_" in user_pool_id:
        return user_pool_id.split("_", maxsplit=1)[0]

    env_region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION")
    if env_region:
        return env_region

    raise ValueError(
        "Could not determine AWS region. Pass --region or set AWS_REGION/AWS_DEFAULT_REGION."
    )


def create_user(
    *,
    email: str,
    password: str,
    username: str,
    user_pool_id: str,
    region: str,
) -> None:
    client = boto3.client("cognito-idp", region_name=region)

    client.admin_create_user(
        UserPoolId=user_pool_id,
        Username=username,
        UserAttributes=[
            {"Name": "email", "Value": email},
            {"Name": "email_verified", "Value": "true"},
        ],
        MessageAction="SUPPRESS",
    )

    client.admin_set_user_password(
        UserPoolId=user_pool_id,
        Username=username,
        Password=password,
        Permanent=True,
    )


def main() -> int:
    args = parse_args()
    username = args.username or args.email

    try:
        user_pool_id = resolve_user_pool_id(args)
        region = resolve_region(args, user_pool_id)
        create_user(
            email=args.email,
            password=args.password,
            username=username,
            user_pool_id=user_pool_id,
            region=region,
        )
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "UnknownException")
        message = exc.response.get("Error", {}).get("Message", str(exc))
        print(f"AWS error ({code}): {message}", file=sys.stderr)
        return 1

    print(
        f"Created web user '{username}' in pool '{user_pool_id}'. "
        "They can sign in with the password you provided."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

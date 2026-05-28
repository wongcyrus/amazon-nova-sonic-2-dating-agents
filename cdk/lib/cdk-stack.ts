import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { DatingGameAgentcoreConstruct } from "./construct/dating-game-agentcore";
import { DatabaseConstruct } from "./construct/datebase";
import { Authenticator } from "./construct/authenticator";

export class AmazonNovaSonicDatingAgentsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. Authentication Layer
    const authenticator = new Authenticator(this, "Authenticator");

    // 2. Database for conversation persistence
    const databaseConstruct = new DatabaseConstruct(this, "DatabaseConstruct");

    // 3. Core Dating Agents Construct (Frontend + Bedrock Backend)
    const datingGameAgentcoreConstruct = new DatingGameAgentcoreConstruct(
      this,
      "DatingAgentsConstruct",
      {
        database: databaseConstruct,
        userPoolId: authenticator.userPool.userPoolId,
        userPoolClientId: authenticator.userPoolClient.userPoolClientId,
        identityPoolId: authenticator.identityPool.ref,
      }
    );

    // 4. Grant Cognito users permission to invoke the Bedrock AgentCore Runtime
    authenticator.authenticatedRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "bedrock-agentcore:InvokeAgentRuntime",
          "bedrock-agentcore:InvokeAgentRuntimeWithWebSocketStream",
        ],
        resources: [
          datingGameAgentcoreConstruct.runtimeArn,
          `${datingGameAgentcoreConstruct.runtimeArn}/*`,
        ],
      })
    );

    // Outputs
    new cdk.CfnOutput(this, "DatingAgentsUrl", {
      description: "The URL of the Amazon Nova Sonic 2 Dating Agents Website",
      value: "https://" + datingGameAgentcoreConstruct.serviceUrl,
    });

    new cdk.CfnOutput(this, "CognitoUserPoolId", {
      value: authenticator.userPool.userPoolId,
    });

    new cdk.CfnOutput(this, "CognitoUserPoolClientId", {
      value: authenticator.userPoolClient.userPoolClientId,
    });
  }
}

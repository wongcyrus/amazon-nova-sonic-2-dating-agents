"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AmazonNovaSonicDatingAgentsStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const dating_game_agentcore_1 = require("./construct/dating-game-agentcore");
const datebase_1 = require("./construct/datebase");
const authenticator_1 = require("./construct/authenticator");
class AmazonNovaSonicDatingAgentsStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // 1. Authentication Layer
        const authenticator = new authenticator_1.Authenticator(this, "Authenticator");
        // 2. Database for conversation persistence
        const databaseConstruct = new datebase_1.DatabaseConstruct(this, "DatabaseConstruct");
        // 3. Core Dating Agents Construct (Frontend + Bedrock Backend)
        const datingGameAgentcoreConstruct = new dating_game_agentcore_1.DatingGameAgentcoreConstruct(this, "DatingAgentsConstruct", {
            database: databaseConstruct,
            userPoolId: authenticator.userPool.userPoolId,
            userPoolClientId: authenticator.userPoolClient.userPoolClientId,
            identityPoolId: authenticator.identityPool.ref,
        });
        // 4. Grant Cognito users permission to invoke the Bedrock AgentCore Runtime
        authenticator.authenticatedRole.addToPrincipalPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                "bedrock-agentcore:InvokeAgentRuntime",
                "bedrock-agentcore:InvokeAgentRuntimeWithWebSocketStream",
            ],
            resources: [
                datingGameAgentcoreConstruct.runtimeArn,
                `${datingGameAgentcoreConstruct.runtimeArn}/*`,
            ],
        }));
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
        new cdk.CfnOutput(this, "TurnAnalysisRuntimeArn", {
            value: datingGameAgentcoreConstruct.analysisRuntimeArn,
        });
    }
}
exports.AmazonNovaSonicDatingAgentsStack = AmazonNovaSonicDatingAgentsStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2RrLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQyx5REFBMkM7QUFFM0MsNkVBQWlGO0FBQ2pGLG1EQUF5RDtBQUN6RCw2REFBMEQ7QUFFMUQsTUFBYSxnQ0FBaUMsU0FBUSxHQUFHLENBQUMsS0FBSztJQUM3RCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLDBCQUEwQjtRQUMxQixNQUFNLGFBQWEsR0FBRyxJQUFJLDZCQUFhLENBQUMsSUFBSSxFQUFFLGVBQWUsQ0FBQyxDQUFDO1FBRS9ELDJDQUEyQztRQUMzQyxNQUFNLGlCQUFpQixHQUFHLElBQUksNEJBQWlCLENBQUMsSUFBSSxFQUFFLG1CQUFtQixDQUFDLENBQUM7UUFFM0UsK0RBQStEO1FBQy9ELE1BQU0sNEJBQTRCLEdBQUcsSUFBSSxvREFBNEIsQ0FDbkUsSUFBSSxFQUNKLHVCQUF1QixFQUN2QjtZQUNFLFFBQVEsRUFBRSxpQkFBaUI7WUFDM0IsVUFBVSxFQUFFLGFBQWEsQ0FBQyxRQUFRLENBQUMsVUFBVTtZQUM3QyxnQkFBZ0IsRUFBRSxhQUFhLENBQUMsY0FBYyxDQUFDLGdCQUFnQjtZQUMvRCxjQUFjLEVBQUUsYUFBYSxDQUFDLFlBQVksQ0FBQyxHQUFHO1NBQy9DLENBQ0YsQ0FBQztRQUVGLDRFQUE0RTtRQUM1RSxhQUFhLENBQUMsaUJBQWlCLENBQUMsb0JBQW9CLENBQ2xELElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztZQUN0QixNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLO1lBQ3hCLE9BQU8sRUFBRTtnQkFDUCxzQ0FBc0M7Z0JBQ3RDLHlEQUF5RDthQUMxRDtZQUNELFNBQVMsRUFBRTtnQkFDVCw0QkFBNEIsQ0FBQyxVQUFVO2dCQUN2QyxHQUFHLDRCQUE0QixDQUFDLFVBQVUsSUFBSTthQUMvQztTQUNGLENBQUMsQ0FDSCxDQUFDO1FBRUYsVUFBVTtRQUNWLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUU7WUFDekMsV0FBVyxFQUFFLDBEQUEwRDtZQUN2RSxLQUFLLEVBQUUsVUFBVSxHQUFHLDRCQUE0QixDQUFDLFVBQVU7U0FDNUQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUMzQyxLQUFLLEVBQUUsYUFBYSxDQUFDLFFBQVEsQ0FBQyxVQUFVO1NBQ3pDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUseUJBQXlCLEVBQUU7WUFDakQsS0FBSyxFQUFFLGFBQWEsQ0FBQyxjQUFjLENBQUMsZ0JBQWdCO1NBQ3JELENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsd0JBQXdCLEVBQUU7WUFDaEQsS0FBSyxFQUFFLDRCQUE0QixDQUFDLGtCQUFrQjtTQUN2RCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF2REQsNEVBdURDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtaWFtXCI7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tIFwiY29uc3RydWN0c1wiO1xuaW1wb3J0IHsgRGF0aW5nR2FtZUFnZW50Y29yZUNvbnN0cnVjdCB9IGZyb20gXCIuL2NvbnN0cnVjdC9kYXRpbmctZ2FtZS1hZ2VudGNvcmVcIjtcbmltcG9ydCB7IERhdGFiYXNlQ29uc3RydWN0IH0gZnJvbSBcIi4vY29uc3RydWN0L2RhdGViYXNlXCI7XG5pbXBvcnQgeyBBdXRoZW50aWNhdG9yIH0gZnJvbSBcIi4vY29uc3RydWN0L2F1dGhlbnRpY2F0b3JcIjtcblxuZXhwb3J0IGNsYXNzIEFtYXpvbk5vdmFTb25pY0RhdGluZ0FnZW50c1N0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBjZGsuU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8gMS4gQXV0aGVudGljYXRpb24gTGF5ZXJcbiAgICBjb25zdCBhdXRoZW50aWNhdG9yID0gbmV3IEF1dGhlbnRpY2F0b3IodGhpcywgXCJBdXRoZW50aWNhdG9yXCIpO1xuXG4gICAgLy8gMi4gRGF0YWJhc2UgZm9yIGNvbnZlcnNhdGlvbiBwZXJzaXN0ZW5jZVxuICAgIGNvbnN0IGRhdGFiYXNlQ29uc3RydWN0ID0gbmV3IERhdGFiYXNlQ29uc3RydWN0KHRoaXMsIFwiRGF0YWJhc2VDb25zdHJ1Y3RcIik7XG5cbiAgICAvLyAzLiBDb3JlIERhdGluZyBBZ2VudHMgQ29uc3RydWN0IChGcm9udGVuZCArIEJlZHJvY2sgQmFja2VuZClcbiAgICBjb25zdCBkYXRpbmdHYW1lQWdlbnRjb3JlQ29uc3RydWN0ID0gbmV3IERhdGluZ0dhbWVBZ2VudGNvcmVDb25zdHJ1Y3QoXG4gICAgICB0aGlzLFxuICAgICAgXCJEYXRpbmdBZ2VudHNDb25zdHJ1Y3RcIixcbiAgICAgIHtcbiAgICAgICAgZGF0YWJhc2U6IGRhdGFiYXNlQ29uc3RydWN0LFxuICAgICAgICB1c2VyUG9vbElkOiBhdXRoZW50aWNhdG9yLnVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICAgIHVzZXJQb29sQ2xpZW50SWQ6IGF1dGhlbnRpY2F0b3IudXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgICAgaWRlbnRpdHlQb29sSWQ6IGF1dGhlbnRpY2F0b3IuaWRlbnRpdHlQb29sLnJlZixcbiAgICAgIH1cbiAgICApO1xuXG4gICAgLy8gNC4gR3JhbnQgQ29nbml0byB1c2VycyBwZXJtaXNzaW9uIHRvIGludm9rZSB0aGUgQmVkcm9jayBBZ2VudENvcmUgUnVudGltZVxuICAgIGF1dGhlbnRpY2F0b3IuYXV0aGVudGljYXRlZFJvbGUuYWRkVG9QcmluY2lwYWxQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgIFwiYmVkcm9jay1hZ2VudGNvcmU6SW52b2tlQWdlbnRSdW50aW1lXCIsXG4gICAgICAgICAgXCJiZWRyb2NrLWFnZW50Y29yZTpJbnZva2VBZ2VudFJ1bnRpbWVXaXRoV2ViU29ja2V0U3RyZWFtXCIsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIGRhdGluZ0dhbWVBZ2VudGNvcmVDb25zdHJ1Y3QucnVudGltZUFybixcbiAgICAgICAgICBgJHtkYXRpbmdHYW1lQWdlbnRjb3JlQ29uc3RydWN0LnJ1bnRpbWVBcm59LypgLFxuICAgICAgICBdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gT3V0cHV0c1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiRGF0aW5nQWdlbnRzVXJsXCIsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBcIlRoZSBVUkwgb2YgdGhlIEFtYXpvbiBOb3ZhIFNvbmljIDIgRGF0aW5nIEFnZW50cyBXZWJzaXRlXCIsXG4gICAgICB2YWx1ZTogXCJodHRwczovL1wiICsgZGF0aW5nR2FtZUFnZW50Y29yZUNvbnN0cnVjdC5zZXJ2aWNlVXJsLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJDb2duaXRvVXNlclBvb2xJZFwiLCB7XG4gICAgICB2YWx1ZTogYXV0aGVudGljYXRvci51c2VyUG9vbC51c2VyUG9vbElkLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJDb2duaXRvVXNlclBvb2xDbGllbnRJZFwiLCB7XG4gICAgICB2YWx1ZTogYXV0aGVudGljYXRvci51c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJUdXJuQW5hbHlzaXNSdW50aW1lQXJuXCIsIHtcbiAgICAgIHZhbHVlOiBkYXRpbmdHYW1lQWdlbnRjb3JlQ29uc3RydWN0LmFuYWx5c2lzUnVudGltZUFybixcbiAgICB9KTtcbiAgfVxufVxuIl19
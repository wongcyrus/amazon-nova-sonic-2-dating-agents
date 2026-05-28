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
    }
}
exports.AmazonNovaSonicDatingAgentsStack = AmazonNovaSonicDatingAgentsStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2RrLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQyx5REFBMkM7QUFFM0MsNkVBQWlGO0FBQ2pGLG1EQUF5RDtBQUN6RCw2REFBMEQ7QUFFMUQsTUFBYSxnQ0FBaUMsU0FBUSxHQUFHLENBQUMsS0FBSztJQUM3RCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLDBCQUEwQjtRQUMxQixNQUFNLGFBQWEsR0FBRyxJQUFJLDZCQUFhLENBQUMsSUFBSSxFQUFFLGVBQWUsQ0FBQyxDQUFDO1FBRS9ELDJDQUEyQztRQUMzQyxNQUFNLGlCQUFpQixHQUFHLElBQUksNEJBQWlCLENBQUMsSUFBSSxFQUFFLG1CQUFtQixDQUFDLENBQUM7UUFFM0UsK0RBQStEO1FBQy9ELE1BQU0sNEJBQTRCLEdBQUcsSUFBSSxvREFBNEIsQ0FDbkUsSUFBSSxFQUNKLHVCQUF1QixFQUN2QjtZQUNFLFFBQVEsRUFBRSxpQkFBaUI7WUFDM0IsVUFBVSxFQUFFLGFBQWEsQ0FBQyxRQUFRLENBQUMsVUFBVTtZQUM3QyxnQkFBZ0IsRUFBRSxhQUFhLENBQUMsY0FBYyxDQUFDLGdCQUFnQjtZQUMvRCxjQUFjLEVBQUUsYUFBYSxDQUFDLFlBQVksQ0FBQyxHQUFHO1NBQy9DLENBQ0YsQ0FBQztRQUVGLDRFQUE0RTtRQUM1RSxhQUFhLENBQUMsaUJBQWlCLENBQUMsb0JBQW9CLENBQ2xELElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztZQUN0QixNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLO1lBQ3hCLE9BQU8sRUFBRTtnQkFDUCxzQ0FBc0M7Z0JBQ3RDLHlEQUF5RDthQUMxRDtZQUNELFNBQVMsRUFBRTtnQkFDVCw0QkFBNEIsQ0FBQyxVQUFVO2dCQUN2QyxHQUFHLDRCQUE0QixDQUFDLFVBQVUsSUFBSTthQUMvQztTQUNGLENBQUMsQ0FDSCxDQUFDO1FBRUYsVUFBVTtRQUNWLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUU7WUFDekMsV0FBVyxFQUFFLDBEQUEwRDtZQUN2RSxLQUFLLEVBQUUsVUFBVSxHQUFHLDRCQUE0QixDQUFDLFVBQVU7U0FDNUQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUMzQyxLQUFLLEVBQUUsYUFBYSxDQUFDLFFBQVEsQ0FBQyxVQUFVO1NBQ3pDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUseUJBQXlCLEVBQUU7WUFDakQsS0FBSyxFQUFFLGFBQWEsQ0FBQyxjQUFjLENBQUMsZ0JBQWdCO1NBQ3JELENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQW5ERCw0RUFtREMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1pYW1cIjtcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5pbXBvcnQgeyBEYXRpbmdHYW1lQWdlbnRjb3JlQ29uc3RydWN0IH0gZnJvbSBcIi4vY29uc3RydWN0L2RhdGluZy1nYW1lLWFnZW50Y29yZVwiO1xuaW1wb3J0IHsgRGF0YWJhc2VDb25zdHJ1Y3QgfSBmcm9tIFwiLi9jb25zdHJ1Y3QvZGF0ZWJhc2VcIjtcbmltcG9ydCB7IEF1dGhlbnRpY2F0b3IgfSBmcm9tIFwiLi9jb25zdHJ1Y3QvYXV0aGVudGljYXRvclwiO1xuXG5leHBvcnQgY2xhc3MgQW1hem9uTm92YVNvbmljRGF0aW5nQWdlbnRzU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAvLyAxLiBBdXRoZW50aWNhdGlvbiBMYXllclxuICAgIGNvbnN0IGF1dGhlbnRpY2F0b3IgPSBuZXcgQXV0aGVudGljYXRvcih0aGlzLCBcIkF1dGhlbnRpY2F0b3JcIik7XG5cbiAgICAvLyAyLiBEYXRhYmFzZSBmb3IgY29udmVyc2F0aW9uIHBlcnNpc3RlbmNlXG4gICAgY29uc3QgZGF0YWJhc2VDb25zdHJ1Y3QgPSBuZXcgRGF0YWJhc2VDb25zdHJ1Y3QodGhpcywgXCJEYXRhYmFzZUNvbnN0cnVjdFwiKTtcblxuICAgIC8vIDMuIENvcmUgRGF0aW5nIEFnZW50cyBDb25zdHJ1Y3QgKEZyb250ZW5kICsgQmVkcm9jayBCYWNrZW5kKVxuICAgIGNvbnN0IGRhdGluZ0dhbWVBZ2VudGNvcmVDb25zdHJ1Y3QgPSBuZXcgRGF0aW5nR2FtZUFnZW50Y29yZUNvbnN0cnVjdChcbiAgICAgIHRoaXMsXG4gICAgICBcIkRhdGluZ0FnZW50c0NvbnN0cnVjdFwiLFxuICAgICAge1xuICAgICAgICBkYXRhYmFzZTogZGF0YWJhc2VDb25zdHJ1Y3QsXG4gICAgICAgIHVzZXJQb29sSWQ6IGF1dGhlbnRpY2F0b3IudXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgICAgdXNlclBvb2xDbGllbnRJZDogYXV0aGVudGljYXRvci51c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgICBpZGVudGl0eVBvb2xJZDogYXV0aGVudGljYXRvci5pZGVudGl0eVBvb2wucmVmLFxuICAgICAgfVxuICAgICk7XG5cbiAgICAvLyA0LiBHcmFudCBDb2duaXRvIHVzZXJzIHBlcm1pc3Npb24gdG8gaW52b2tlIHRoZSBCZWRyb2NrIEFnZW50Q29yZSBSdW50aW1lXG4gICAgYXV0aGVudGljYXRvci5hdXRoZW50aWNhdGVkUm9sZS5hZGRUb1ByaW5jaXBhbFBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgXCJiZWRyb2NrLWFnZW50Y29yZTpJbnZva2VBZ2VudFJ1bnRpbWVcIixcbiAgICAgICAgICBcImJlZHJvY2stYWdlbnRjb3JlOkludm9rZUFnZW50UnVudGltZVdpdGhXZWJTb2NrZXRTdHJlYW1cIixcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgZGF0aW5nR2FtZUFnZW50Y29yZUNvbnN0cnVjdC5ydW50aW1lQXJuLFxuICAgICAgICAgIGAke2RhdGluZ0dhbWVBZ2VudGNvcmVDb25zdHJ1Y3QucnVudGltZUFybn0vKmAsXG4gICAgICAgIF0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBPdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJEYXRpbmdBZ2VudHNVcmxcIiwge1xuICAgICAgZGVzY3JpcHRpb246IFwiVGhlIFVSTCBvZiB0aGUgQW1hem9uIE5vdmEgU29uaWMgMiBEYXRpbmcgQWdlbnRzIFdlYnNpdGVcIixcbiAgICAgIHZhbHVlOiBcImh0dHBzOi8vXCIgKyBkYXRpbmdHYW1lQWdlbnRjb3JlQ29uc3RydWN0LnNlcnZpY2VVcmwsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIkNvZ25pdG9Vc2VyUG9vbElkXCIsIHtcbiAgICAgIHZhbHVlOiBhdXRoZW50aWNhdG9yLnVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIkNvZ25pdG9Vc2VyUG9vbENsaWVudElkXCIsIHtcbiAgICAgIHZhbHVlOiBhdXRoZW50aWNhdG9yLnVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==
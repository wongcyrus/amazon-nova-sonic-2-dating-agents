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
exports.DatingGameAgentcoreConstruct = void 0;
const constructs_1 = require("constructs");
const agentcore = __importStar(require("@aws-cdk/aws-bedrock-agentcore-alpha"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const s3deploy = __importStar(require("aws-cdk-lib/aws-s3-deployment"));
const cloudfront = __importStar(require("aws-cdk-lib/aws-cloudfront"));
const origins = __importStar(require("aws-cdk-lib/aws-cloudfront-origins"));
const path = __importStar(require("path"));
const aws_ecr_assets_1 = require("aws-cdk-lib/aws-ecr-assets");
const aws_cdk_lib_1 = require("aws-cdk-lib");
class DatingGameAgentcoreConstruct extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const runtimeAssetPath = path.join(__dirname, "../../../");
        const runtimeAssetOptions = {
            platform: aws_ecr_assets_1.Platform.LINUX_ARM64,
            exclude: [".venv", "__pycache__", "tests", "cdk"],
        };
        // 1. Package dedicated runtime images so the latency-sensitive voice path
        // and the slower multi-agent scoring path can scale independently.
        const realtimeRuntimeArtifact = agentcore.AgentRuntimeArtifact.fromAsset(runtimeAssetPath, {
            ...runtimeAssetOptions,
            file: "Dockerfile.realtime",
        });
        const analysisRuntimeArtifact = agentcore.AgentRuntimeArtifact.fromAsset(runtimeAssetPath, {
            ...runtimeAssetOptions,
            file: "Dockerfile.analysis",
        });
        // 2. Create the dedicated hidden turn-analysis runtime.
        const analysisRuntime = new agentcore.Runtime(this, "TurnAnalysisRuntime", {
            runtimeName: "dating_game_turn_analysis",
            agentRuntimeArtifact: analysisRuntimeArtifact,
            authorizerConfiguration: agentcore.RuntimeAuthorizerConfiguration.usingIAM(),
            environmentVariables: {
                IsInCloud: "yes",
                AWS_BEDROCK_REGION: "us-east-1",
            },
        });
        this.analysisRuntimeArn = analysisRuntime.agentRuntimeArn;
        // 3. Reuse the original logical ID so CloudFormation updates the existing
        // realtime runtime instead of attempting a conflicting replacement.
        const realtimeRuntime = new agentcore.Runtime(this, "Runtime", {
            runtimeName: "dating_game_agentcore",
            agentRuntimeArtifact: realtimeRuntimeArtifact,
            authorizerConfiguration: agentcore.RuntimeAuthorizerConfiguration.usingIAM(),
            environmentVariables: {
                IsInCloud: "yes",
                AWS_BEDROCK_REGION: "us-east-1",
                DatingGameTable: props.database.datingGameTable.tableName,
                MULTI_AGENT_MODEL_ID: "us.amazon.nova-2-lite-v1:0",
                TURN_ANALYSIS_RUNTIME_ARN: analysisRuntime.agentRuntimeArn,
            },
        });
        this.runtimeArn = realtimeRuntime.agentRuntimeArn;
        // 4. Grant the realtime runtime access to game state storage.
        props.database.datingGameTable.grantFullAccess(realtimeRuntime.role);
        // 5. Grant the realtime runtime access only to the realtime voice models.
        realtimeRuntime.role.addToPrincipalPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                "bedrock:InvokeModel",
                "bedrock:InvokeModelWithResponseStream",
            ],
            resources: [
                "arn:aws:bedrock:*::foundation-model/amazon.nova-sonic-v1:0",
                "arn:aws:bedrock:*::foundation-model/amazon.nova-2-sonic-v1:0",
            ],
        }));
        // 6. Grant the turn-analysis runtime access only to the non-realtime judge model.
        analysisRuntime.role.addToPrincipalPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                "bedrock:InvokeModel",
                "bedrock:InvokeModelWithResponseStream",
                "bedrock:Converse",
                "bedrock:ConverseStream",
            ],
            resources: [
                "arn:aws:bedrock:*::foundation-model/amazon.nova-2-lite-v1:0",
                "arn:aws:bedrock:*:*:inference-profile/us.amazon.nova-2-lite-v1:0",
                "arn:aws:bedrock:*:*:inference-profile/global.amazon.nova-2-lite-v1:0",
            ],
        }));
        // 7. Allow the realtime runtime to invoke the internal turn-analysis runtime.
        realtimeRuntime.role.addToPrincipalPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["bedrock-agentcore:InvokeAgentRuntime"],
            resources: [
                analysisRuntime.agentRuntimeArn,
                `${analysisRuntime.agentRuntimeArn}/*`,
            ],
        }));
        // 8. Serverless Frontend S3 Website Bucket
        const websiteBucket = new s3.Bucket(this, "DatingGameWebsiteBucket", {
            websiteIndexDocument: "index.html",
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            publicReadAccess: true,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS_ONLY,
            cors: [
                {
                    allowedHeaders: ["*"],
                    allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
                    allowedOrigins: ["*"],
                    exposedHeaders: ["Date", "ETag", "x-amz-request-id"],
                    maxAge: 3000,
                },
            ],
        });
        websiteBucket.addToResourcePolicy(new iam.PolicyStatement({
            actions: ["s3:GetObject"],
            resources: [websiteBucket.arnForObjects("*")],
            principals: [new iam.AnyPrincipal()],
        }));
        // 9. Cost-Efficient CloudFront Distribution (Price Class 100)
        const oai = new cloudfront.OriginAccessIdentity(this, "DatingGameOAI");
        websiteBucket.grantRead(oai);
        const distribution = new cloudfront.Distribution(this, "DatingGameDistribution", {
            defaultRootObject: "index.html",
            priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
            defaultBehavior: {
                origin: origins.S3BucketOrigin.withOriginAccessIdentity(websiteBucket, { originAccessIdentity: oai }),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
                cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
            },
        });
        this.serviceUrl = distribution.distributionDomainName;
        // 10. Deploy static web files and dynamic config.json to website bucket
        new s3deploy.BucketDeployment(this, "DeployDatingGameWebsiteAndConfig", {
            sources: [
                s3deploy.Source.asset(path.join(__dirname, "../../../frontend")),
                s3deploy.Source.jsonData("config.json", {
                    region: aws_cdk_lib_1.Stack.of(this).region,
                    userPoolId: props.userPoolId,
                    clientId: props.userPoolClientId,
                    identityPoolId: props.identityPoolId,
                    runtimeArn: realtimeRuntime.agentRuntimeArn,
                }),
            ],
            destinationBucket: websiteBucket,
            distribution,
            distributionPaths: ["/*"],
        });
    }
}
exports.DatingGameAgentcoreConstruct = DatingGameAgentcoreConstruct;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGF0aW5nLWdhbWUtYWdlbnRjb3JlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZGF0aW5nLWdhbWUtYWdlbnRjb3JlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDJDQUF1QztBQUN2QyxnRkFBa0U7QUFDbEUseURBQTJDO0FBQzNDLHVEQUF5QztBQUN6Qyx3RUFBMEQ7QUFDMUQsdUVBQXlEO0FBQ3pELDRFQUE4RDtBQUM5RCwyQ0FBNkI7QUFDN0IsK0RBQXNEO0FBRXRELDZDQUFtRDtBQVNuRCxNQUFhLDRCQUE2QixTQUFRLHNCQUFTO0lBS3pELFlBQ0UsS0FBZ0IsRUFDaEIsRUFBVSxFQUNWLEtBQXdDO1FBRXhDLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUMzRCxNQUFNLG1CQUFtQixHQUFHO1lBQzFCLFFBQVEsRUFBRSx5QkFBUSxDQUFDLFdBQVc7WUFDOUIsT0FBTyxFQUFFLENBQUMsT0FBTyxFQUFFLGFBQWEsRUFBRSxPQUFPLEVBQUUsS0FBSyxDQUFDO1NBQ2xELENBQUM7UUFFRiwwRUFBMEU7UUFDMUUsbUVBQW1FO1FBQ25FLE1BQU0sdUJBQXVCLEdBQUcsU0FBUyxDQUFDLG9CQUFvQixDQUFDLFNBQVMsQ0FDdEUsZ0JBQWdCLEVBQ2hCO1lBQ0UsR0FBRyxtQkFBbUI7WUFDdEIsSUFBSSxFQUFFLHFCQUFxQjtTQUM1QixDQUNGLENBQUM7UUFDRixNQUFNLHVCQUF1QixHQUFHLFNBQVMsQ0FBQyxvQkFBb0IsQ0FBQyxTQUFTLENBQ3RFLGdCQUFnQixFQUNoQjtZQUNFLEdBQUcsbUJBQW1CO1lBQ3RCLElBQUksRUFBRSxxQkFBcUI7U0FDNUIsQ0FDRixDQUFDO1FBRUYsd0RBQXdEO1FBQ3hELE1BQU0sZUFBZSxHQUFH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LENBQUMsc0JBQXNCO2dCQUNoRSxhQUFhLEVBQUUsVUFBVSxDQUFDLGFBQWEsQ0FBQyxjQUFjO2dCQUN0RCxXQUFXLEVBQUUsVUFBVSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUI7YUFDdEQ7U0FDRixDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsVUFBVSxHQUFHLFlBQVksQ0FBQyxzQkFBc0IsQ0FBQztRQUV0RCx3RUFBd0U7UUFDeEUsSUFBSSxRQUFRLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLGtDQUFrQyxFQUFFO1lBQ3RFLE9BQU8sRUFBRTtnQkFDUCxRQUFRLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO2dCQUNoRSxRQUFRLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxhQUFhLEVBQUU7b0JBQ3RDLE1BQU0sRUFBRSxtQkFBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNO29CQUM3QixVQUFVLEVBQUUsS0FBSyxDQUFDLFVBQVU7b0JBQzVCLFFBQVEsRUFBRSxLQUFLLENBQUMsZ0JBQWdCO29CQUNoQyxjQUFjLEVBQUUsS0FBSyxDQUFDLGNBQWM7b0JBQ3BDLFVBQVUsRUFBRSxlQUFlLENBQUMsZUFBZTtpQkFDNUMsQ0FBQzthQUNIO1lBQ0QsaUJBQWlCLEVBQUUsYUFBYTtZQUNoQyxZQUFZO1lBQ1osaUJBQWlCLEVBQUUsQ0FBQyxJQUFJLENBQUM7U0FDMUIsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBOUtELG9FQThLQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5pbXBvcnQgKiBhcyBhZ2VudGNvcmUgZnJvbSBcIkBhd3MtY2RrL2F3cy1iZWRyb2NrLWFnZW50Y29yZS1hbHBoYVwiO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtaWFtXCI7XG5pbXBvcnQgKiBhcyBzMyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXMzXCI7XG5pbXBvcnQgKiBhcyBzM2RlcGxveSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXMzLWRlcGxveW1lbnRcIjtcbmltcG9ydCAqIGFzIGNsb3VkZnJvbnQgZnJvbSBcImF3cy1jZGstbGliL2F3cy1jbG91ZGZyb250XCI7XG5pbXBvcnQgKiBhcyBvcmlnaW5zIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtY2xvdWRmcm9udC1vcmlnaW5zXCI7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gXCJwYXRoXCI7XG5pbXBvcnQgeyBQbGF0Zm9ybSB9IGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtZWNyLWFzc2V0c1wiO1xuaW1wb3J0IHsgRGF0YWJhc2VDb25zdHJ1Y3QgfSBmcm9tIFwiLi9kYXRlYmFzZVwiO1xuaW1wb3J0IHsgU3RhY2ssIFJlbW92YWxQb2xpY3kgfSBmcm9tIFwiYXdzLWNkay1saWJcIjtcblxuZXhwb3J0IGludGVyZmFjZSBEYXRpbmdHYW1lQWdlbnRjb3JlQ29uc3RydWN0UHJvcHMge1xuICByZWFkb25seSBkYXRhYmFzZTogRGF0YWJhc2VDb25zdHJ1Y3Q7XG4gIHJlYWRvbmx5IHVzZXJQb29sSWQ6IHN0cmluZztcbiAgcmVhZG9ubHkgdXNlclBvb2xDbGllbnRJZDogc3RyaW5nO1xuICByZWFkb25seSBpZGVudGl0eVBvb2xJZDogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgRGF0aW5nR2FtZUFnZW50Y29yZUNvbnN0cnVjdCBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSBydW50aW1lQXJuOiBzdHJpbmc7XG4gIHB1YmxpYyByZWFkb25seSBhbmFseXNpc1J1bnRpbWVBcm46IHN0cmluZztcbiAgcHVibGljIHJlYWRvbmx5IHNlcnZpY2VVcmw6IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihcbiAgICBzY29wZTogQ29uc3RydWN0LFxuICAgIGlkOiBzdHJpbmcsXG4gICAgcHJvcHM6IERhdGluZ0dhbWVBZ2VudGNvcmVDb25zdHJ1Y3RQcm9wc1xuICApIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3QgcnVudGltZUFzc2V0UGF0aCA9IHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi4vLi4vLi4vXCIpO1xuICAgIGNvbnN0IHJ1bnRpbWVBc3NldE9wdGlvbnMgPSB7XG4gICAgICBwbGF0Zm9ybTogUGxhdGZvcm0uTElOVVhfQVJNNjQsXG4gICAgICBleGNsdWRlOiBbXCIudmVudlwiLCBcIl9fcHljYWNoZV9fXCIsIFwidGVzdHNcIiwgXCJjZGtcIl0sXG4gICAgfTtcblxuICAgIC8vIDEuIFBhY2thZ2UgZGVkaWNhdGVkIHJ1bnRpbWUgaW1hZ2VzIHNvIHRoZSBsYXRlbmN5LXNlbnNpdGl2ZSB2b2ljZSBwYXRoXG4gICAgLy8gYW5kIHRoZSBzbG93ZXIgbXVsdGktYWdlbnQgc2NvcmluZyBwYXRoIGNhbiBzY2FsZSBpbmRlcGVuZGVudGx5LlxuICAgIGNvbnN0IHJlYWx0aW1lUnVudGltZUFydGlmYWN0ID0gYWdlbnRjb3JlLkFnZW50UnVudGltZUFydGlmYWN0LmZyb21Bc3NldChcbiAgICAgIHJ1bnRpbWVBc3NldFBhdGgsXG4gICAgICB7XG4gICAgICAgIC4uLnJ1bnRpbWVBc3NldE9wdGlvbnMsXG4gICAgICAgIGZpbGU6IFwiRG9ja2VyZmlsZS5yZWFsdGltZVwiLFxuICAgICAgfVxuICAgICk7XG4gICAgY29uc3QgYW5hbHlzaXNSdW50aW1lQXJ0aWZhY3QgPSBhZ2VudGNvcmUuQWdlbnRSdW50aW1lQXJ0aWZhY3QuZnJvbUFzc2V0KFxuICAgICAgcnVudGltZUFzc2V0UGF0aCxcbiAgICAgIHtcbiAgICAgICAgLi4ucnVudGltZUFzc2V0T3B0aW9ucyxcbiAgICAgICAgZmlsZTogXCJEb2NrZXJmaWxlLmFuYWx5c2lzXCIsXG4gICAgICB9XG4gICAgKTtcblxuICAgIC8vIDIuIENyZWF0ZSB0aGUgZGVkaWNhdGVkIGhpZGRlbiB0dXJuLWFuYWx5c2lzIHJ1bnRpbWUuXG4gICAgY29uc3QgYW5hbHlzaXNSdW50aW1lID0gbmV3IGFnZW50Y29yZS5SdW50aW1lKHRoaXMsIFwiVHVybkFuYWx5c2lzUnVudGltZVwiLCB7XG4gICAgICBydW50aW1lTmFtZTogXCJkYXRpbmdfZ2FtZV90dXJuX2FuYWx5c2lzXCIsXG4gICAgICBhZ2VudFJ1bnRpbWVBcnRpZmFjdDogYW5hbHlzaXNSdW50aW1lQXJ0aWZhY3QsXG4gICAgICBhdXRob3JpemVyQ29uZmlndXJhdGlvbjogYWdlbnRjb3JlLlJ1bnRpbWVBdXRob3JpemVyQ29uZmlndXJhdGlvbi51c2luZ0lBTSgpLFxuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXM6IHtcbiAgICAgICAgSXNJbkNsb3VkOiBcInllc1wiLFxuICAgICAgICBBV1NfQkVEUk9DS19SRUdJT046IFwidXMtZWFzdC0xXCIsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5hbmFseXNpc1J1bnRpbWVBcm4gPSBhbmFseXNpc1J1bnRpbWUuYWdlbnRSdW50aW1lQXJuO1xuXG4gICAgLy8gMy4gUmV1c2UgdGhlIG9yaWdpbmFsIGxvZ2ljYWwgSUQgc28gQ2xvdWRGb3JtYXRpb24gdXBkYXRlcyB0aGUgZXhpc3RpbmdcbiAgICAvLyByZWFsdGltZSBydW50aW1lIGluc3RlYWQgb2YgYXR0ZW1wdGluZyBhIGNvbmZsaWN0aW5nIHJlcGxhY2VtZW50LlxuICAgIGNvbnN0IHJlYWx0aW1lUnVudGltZSA9IG5ldyBhZ2VudGNvcmUuUnVudGltZSh0aGlzLCBcIlJ1bnRpbWVcIiwge1xuICAgICAgcnVudGltZU5hbWU6IFwiZGF0aW5nX2dhbWVfYWdlbnRjb3JlXCIsXG4gICAgICBhZ2VudFJ1bnRpbWVBcnRpZmFjdDogcmVhbHRpbWVSdW50aW1lQXJ0aWZhY3QsXG4gICAgICBhdXRob3JpemVyQ29uZmlndXJhdGlvbjogYWdlbnRjb3JlLlJ1bnRpbWVBdXRob3JpemVyQ29uZmlndXJhdGlvbi51c2luZ0lBTSgpLFxuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXM6IHtcbiAgICAgICAgSXNJbkNsb3VkOiBcInllc1wiLFxuICAgICAgICBBV1NfQkVEUk9DS19SRUdJT046IFwidXMtZWFzdC0xXCIsXG4gICAgICAgIERhdGluZ0dhbWVUYWJsZTogcHJvcHMuZGF0YWJhc2UuZGF0aW5nR2FtZVRhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgTVVMVElfQUdFTlRfTU9ERUxfSUQ6IFwidXMuYW1hem9uLm5vdmEtMi1saXRlLXYxOjBcIixcbiAgICAgICAgVFVSTl9BTkFMWVNJU19SVU5USU1FX0FSTjogYW5hbHlzaXNSdW50aW1lLmFnZW50UnVudGltZUFybixcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLnJ1bnRpbWVBcm4gPSByZWFsdGltZVJ1bnRpbWUuYWdlbnRSdW50aW1lQXJuO1xuXG4gICAgLy8gNC4gR3JhbnQgdGhlIHJlYWx0aW1lIHJ1bnRpbWUgYWNjZXNzIHRvIGdhbWUgc3RhdGUgc3RvcmFnZS5cbiAgICBwcm9wcy5kYXRhYmFzZS5kYXRpbmdHYW1lVGFibGUuZ3JhbnRGdWxsQWNjZXNzKHJlYWx0aW1lUnVudGltZS5yb2xlKTtcblxuICAgIC8vIDUuIEdyYW50IHRoZSByZWFsdGltZSBydW50aW1lIGFjY2VzcyBvbmx5IHRvIHRoZSByZWFsdGltZSB2b2ljZSBtb2RlbHMuXG4gICAgcmVhbHRpbWVSdW50aW1lLnJvbGUuYWRkVG9QcmluY2lwYWxQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgIFwiYmVkcm9jazpJbnZva2VNb2RlbFwiLFxuICAgICAgICAgIFwiYmVkcm9jazpJbnZva2VNb2RlbFdpdGhSZXNwb25zZVN0cmVhbVwiLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBcImFybjphd3M6YmVkcm9jazoqOjpmb3VuZGF0aW9uLW1vZGVsL2FtYXpvbi5ub3ZhLXNvbmljLXYxOjBcIixcbiAgICAgICAgICBcImFybjphd3M6YmVkcm9jazoqOjpmb3VuZGF0aW9uLW1vZGVsL2FtYXpvbi5ub3ZhLTItc29uaWMtdjE6MFwiLFxuICAgICAgICBdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gNi4gR3JhbnQgdGhlIHR1cm4tYW5hbHlzaXMgcnVudGltZSBhY2Nlc3Mgb25seSB0byB0aGUgbm9uLXJlYWx0aW1lIGp1ZGdlIG1vZGVsLlxuICAgIGFuYWx5c2lzUnVudGltZS5yb2xlLmFkZFRvUHJpbmNpcGFsUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICBcImJlZHJvY2s6SW52b2tlTW9kZWxcIixcbiAgICAgICAgICBcImJlZHJvY2s6SW52b2tlTW9kZWxXaXRoUmVzcG9uc2VTdHJlYW1cIixcbiAgICAgICAgICBcImJlZHJvY2s6Q29udmVyc2VcIixcbiAgICAgICAgICBcImJlZHJvY2s6Q29udmVyc2VTdHJlYW1cIixcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgXCJhcm46YXdzOmJlZHJvY2s6Kjo6Zm91bmRhdGlvbi1tb2RlbC9hbWF6b24ubm92YS0yLWxpdGUtdjE6MFwiLFxuICAgICAgICAgIFwiYXJuOmF3czpiZWRyb2NrOio6KjppbmZlcmVuY2UtcHJvZmlsZS91cy5hbWF6b24ubm92YS0yLWxpdGUtdjE6MFwiLFxuICAgICAgICAgIFwiYXJuOmF3czpiZWRyb2NrOio6KjppbmZlcmVuY2UtcHJvZmlsZS9nbG9iYWwuYW1hem9uLm5vdmEtMi1saXRlLXYxOjBcIixcbiAgICAgICAgXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIDcuIEFsbG93IHRoZSByZWFsdGltZSBydW50aW1lIHRvIGludm9rZSB0aGUgaW50ZXJuYWwgdHVybi1hbmFseXNpcyBydW50aW1lLlxuICAgIHJlYWx0aW1lUnVudGltZS5yb2xlLmFkZFRvUHJpbmNpcGFsUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcImJlZHJvY2stYWdlbnRjb3JlOkludm9rZUFnZW50UnVudGltZVwiXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgYW5hbHlzaXNSdW50aW1lLmFnZW50UnVudGltZUFybixcbiAgICAgICAgICBgJHthbmFseXNpc1J1bnRpbWUuYWdlbnRSdW50aW1lQXJufS8qYCxcbiAgICAgICAgXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIDguIFNlcnZlcmxlc3MgRnJvbnRlbmQgUzMgV2Vic2l0ZSBCdWNrZXRcbiAgICBjb25zdCB3ZWJzaXRlQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCBcIkRhdGluZ0dhbWVXZWJzaXRlQnVja2V0XCIsIHtcbiAgICAgIHdlYnNpdGVJbmRleERvY3VtZW50OiBcImluZGV4Lmh0bWxcIixcbiAgICAgIHJlbW92YWxQb2xpY3k6IFJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxuICAgICAgcHVibGljUmVhZEFjY2VzczogdHJ1ZSxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BQ0xTX09OTFksXG4gICAgICBjb3JzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhbGxvd2VkSGVhZGVyczogW1wiKlwiXSxcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogW3MzLkh0dHBNZXRob2RzLkdFVCwgczMuSHR0cE1ldGhvZHMuSEVBRF0sXG4gICAgICAgICAgYWxsb3dlZE9yaWdpbnM6IFtcIipcIl0sXG4gICAgICAgICAgZXhwb3NlZEhlYWRlcnM6IFtcIkRhdGVcIiwgXCJFVGFnXCIsIFwieC1hbXotcmVxdWVzdC1pZFwiXSxcbiAgICAgICAgICBtYXhBZ2U6IDMwMDAsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgd2Vic2l0ZUJ1Y2tldC5hZGRUb1Jlc291cmNlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbXCJzMzpHZXRPYmplY3RcIl0sXG4gICAgICAgIHJlc291cmNlczogW3dlYnNpdGVCdWNrZXQuYXJuRm9yT2JqZWN0cyhcIipcIildLFxuICAgICAgICBwcmluY2lwYWxzOiBbbmV3IGlhbS5BbnlQcmluY2lwYWwoKV0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyA5LiBDb3N0LUVmZmljaWVudCBDbG91ZEZyb250IERpc3RyaWJ1dGlvbiAoUHJpY2UgQ2xhc3MgMTAwKVxuICAgIGNvbnN0IG9haSA9IG5ldyBjbG91ZGZyb250Lk9yaWdpbkFjY2Vzc0lkZW50aXR5KHRoaXMsIFwiRGF0aW5nR2FtZU9BSVwiKTtcbiAgICB3ZWJzaXRlQnVja2V0LmdyYW50UmVhZChvYWkpO1xuXG4gICAgY29uc3QgZGlzdHJpYnV0aW9uID0gbmV3IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uKHRoaXMsIFwiRGF0aW5nR2FtZURpc3RyaWJ1dGlvblwiLCB7XG4gICAgICBkZWZhdWx0Um9vdE9iamVjdDogXCJpbmRleC5odG1sXCIsXG4gICAgICBwcmljZUNsYXNzOiBjbG91ZGZyb250LlByaWNlQ2xhc3MuUFJJQ0VfQ0xBU1NfMTAwLFxuICAgICAgZGVmYXVsdEJlaGF2aW9yOiB7XG4gICAgICAgIG9yaWdpbjogb3JpZ2lucy5TM0J1Y2tldE9yaWdpbi53aXRoT3JpZ2luQWNjZXNzSWRlbnRpdHkod2Vic2l0ZUJ1Y2tldCwgeyBvcmlnaW5BY2Nlc3NJZGVudGl0eTogb2FpIH0pLFxuICAgICAgICB2aWV3ZXJQcm90b2NvbFBvbGljeTogY2xvdWRmcm9udC5WaWV3ZXJQcm90b2NvbFBvbGljeS5SRURJUkVDVF9UT19IVFRQUyxcbiAgICAgICAgYWxsb3dlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQWxsb3dlZE1ldGhvZHMuQUxMT1dfR0VUX0hFQURfT1BUSU9OUyxcbiAgICAgICAgY2FjaGVkTWV0aG9kczogY2xvdWRmcm9udC5DYWNoZWRNZXRob2RzLkNBQ0hFX0dFVF9IRUFELFxuICAgICAgICBjYWNoZVBvbGljeTogY2xvdWRmcm9udC5DYWNoZVBvbGljeS5DQUNISU5HX09QVElNSVpFRCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLnNlcnZpY2VVcmwgPSBkaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uRG9tYWluTmFtZTtcblxuICAgIC8vIDEwLiBEZXBsb3kgc3RhdGljIHdlYiBmaWxlcyBhbmQgZHluYW1pYyBjb25maWcuanNvbiB0byB3ZWJzaXRlIGJ1Y2tldFxuICAgIG5ldyBzM2RlcGxveS5CdWNrZXREZXBsb3ltZW50KHRoaXMsIFwiRGVwbG95RGF0aW5nR2FtZVdlYnNpdGVBbmRDb25maWdcIiwge1xuICAgICAgc291cmNlczogW1xuICAgICAgICBzM2RlcGxveS5Tb3VyY2UuYXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi8uLi8uLi9mcm9udGVuZFwiKSksXG4gICAgICAgIHMzZGVwbG95LlNvdXJjZS5qc29uRGF0YShcImNvbmZpZy5qc29uXCIsIHtcbiAgICAgICAgICByZWdpb246IFN0YWNrLm9mKHRoaXMpLnJlZ2lvbixcbiAgICAgICAgICB1c2VyUG9vbElkOiBwcm9wcy51c2VyUG9vbElkLFxuICAgICAgICAgIGNsaWVudElkOiBwcm9wcy51c2VyUG9vbENsaWVudElkLFxuICAgICAgICAgIGlkZW50aXR5UG9vbElkOiBwcm9wcy5pZGVudGl0eVBvb2xJZCxcbiAgICAgICAgICBydW50aW1lQXJuOiByZWFsdGltZVJ1bnRpbWUuYWdlbnRSdW50aW1lQXJuLFxuICAgICAgICB9KSxcbiAgICAgIF0sXG4gICAgICBkZXN0aW5hdGlvbkJ1Y2tldDogd2Vic2l0ZUJ1Y2tldCxcbiAgICAgIGRpc3RyaWJ1dGlvbixcbiAgICAgIGRpc3RyaWJ1dGlvblBhdGhzOiBbXCIvKlwiXSxcbiAgICB9KTtcbiAgfVxufVxuIl19
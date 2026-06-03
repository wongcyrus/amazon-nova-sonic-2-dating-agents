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
        const realtimeRuntimeLifecycleConfiguration = {
            idleRuntimeSessionTimeout: aws_cdk_lib_1.Duration.minutes(10),
            maxLifetime: aws_cdk_lib_1.Duration.minutes(30),
        };
        const analysisRuntimeLifecycleConfiguration = {
            idleRuntimeSessionTimeout: aws_cdk_lib_1.Duration.minutes(5),
            maxLifetime: aws_cdk_lib_1.Duration.minutes(10),
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
            lifecycleConfiguration: analysisRuntimeLifecycleConfiguration,
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
            lifecycleConfiguration: realtimeRuntimeLifecycleConfiguration,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGF0aW5nLWdhbWUtYWdlbnRjb3JlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZGF0aW5nLWdhbWUtYWdlbnRjb3JlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDJDQUF1QztBQUN2QyxnRkFBa0U7QUFDbEUseURBQTJDO0FBQzNDLHVEQUF5QztBQUN6Qyx3RUFBMEQ7QUFDMUQsdUVBQXlEO0FBQ3pELDRFQUE4RDtBQUM5RCwyQ0FBNkI7QUFDN0IsK0RBQXNEO0FBRXRELDZDQUE2RDtBQVM3RCxNQUFhLDRCQUE2QixTQUFRLHNCQUFTO0lBS3pELFlBQ0UsS0FBZ0IsRUFDaEIsRUFBVSxFQUNWLEtBQXdDO1FBRXhDLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUMzRCxNQUFNLG1CQUFtQixHQUFHO1lBQzFCLFFBQVEsRUFBRSx5QkFBUSxDQUFDLFdBQVc7WUFDOUIsT0FBTyxFQUFFLENBQUMsT0FBTyxFQUFFLGFBQWEsRUFBRSxPQUFPLEVBQUUsS0FBSyxDQUFDO1NBQ2xELENBQUM7UUFDRixNQUFNLHFDQUFxQyxHQUFHO1lBQzVDLHlCQUF5QixFQUFFLHNCQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUMvQyxXQUFXLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1NBQ2xDLENBQUM7UUFDRixNQUFNLHFDQUFxQyxHQUFHO1lBQzVDLHlCQUF5QixFQUFFLHNCQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUM5QyxXQUFXLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1NBQ2xDLENBQUM7UUFFRiwwRUFBMEU7UUFDMUUsbUVBQW1FO1FBQ25FLE1BQU0sdUJBQXVCLEdBQUcs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QkFBaUIsRUFBRSxhQUFhO1lBQ2hDLFlBQVk7WUFDWixpQkFBaUIsRUFBRSxDQUFDLElBQUksQ0FBQztTQUMxQixDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF4TEQsb0VBd0xDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSBcImNvbnN0cnVjdHNcIjtcbmltcG9ydCAqIGFzIGFnZW50Y29yZSBmcm9tIFwiQGF3cy1jZGsvYXdzLWJlZHJvY2stYWdlbnRjb3JlLWFscGhhXCI7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1pYW1cIjtcbmltcG9ydCAqIGFzIHMzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtczNcIjtcbmltcG9ydCAqIGFzIHMzZGVwbG95IGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtczMtZGVwbG95bWVudFwiO1xuaW1wb3J0ICogYXMgY2xvdWRmcm9udCBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnRcIjtcbmltcG9ydCAqIGFzIG9yaWdpbnMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1jbG91ZGZyb250LW9yaWdpbnNcIjtcbmltcG9ydCAqIGFzIHBhdGggZnJvbSBcInBhdGhcIjtcbmltcG9ydCB7IFBsYXRmb3JtIH0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1lY3ItYXNzZXRzXCI7XG5pbXBvcnQgeyBEYXRhYmFzZUNvbnN0cnVjdCB9IGZyb20gXCIuL2RhdGViYXNlXCI7XG5pbXBvcnQgeyBEdXJhdGlvbiwgU3RhY2ssIFJlbW92YWxQb2xpY3kgfSBmcm9tIFwiYXdzLWNkay1saWJcIjtcblxuZXhwb3J0IGludGVyZmFjZSBEYXRpbmdHYW1lQWdlbnRjb3JlQ29uc3RydWN0UHJvcHMge1xuICByZWFkb25seSBkYXRhYmFzZTogRGF0YWJhc2VDb25zdHJ1Y3Q7XG4gIHJlYWRvbmx5IHVzZXJQb29sSWQ6IHN0cmluZztcbiAgcmVhZG9ubHkgdXNlclBvb2xDbGllbnRJZDogc3RyaW5nO1xuICByZWFkb25seSBpZGVudGl0eVBvb2xJZDogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgRGF0aW5nR2FtZUFnZW50Y29yZUNvbnN0cnVjdCBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSBydW50aW1lQXJuOiBzdHJpbmc7XG4gIHB1YmxpYyByZWFkb25seSBhbmFseXNpc1J1bnRpbWVBcm46IHN0cmluZztcbiAgcHVibGljIHJlYWRvbmx5IHNlcnZpY2VVcmw6IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihcbiAgICBzY29wZTogQ29uc3RydWN0LFxuICAgIGlkOiBzdHJpbmcsXG4gICAgcHJvcHM6IERhdGluZ0dhbWVBZ2VudGNvcmVDb25zdHJ1Y3RQcm9wc1xuICApIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3QgcnVudGltZUFzc2V0UGF0aCA9IHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi4vLi4vLi4vXCIpO1xuICAgIGNvbnN0IHJ1bnRpbWVBc3NldE9wdGlvbnMgPSB7XG4gICAgICBwbGF0Zm9ybTogUGxhdGZvcm0uTElOVVhfQVJNNjQsXG4gICAgICBleGNsdWRlOiBbXCIudmVudlwiLCBcIl9fcHljYWNoZV9fXCIsIFwidGVzdHNcIiwgXCJjZGtcIl0sXG4gICAgfTtcbiAgICBjb25zdCByZWFsdGltZVJ1bnRpbWVMaWZlY3ljbGVDb25maWd1cmF0aW9uID0ge1xuICAgICAgaWRsZVJ1bnRpbWVTZXNzaW9uVGltZW91dDogRHVyYXRpb24ubWludXRlcygxMCksXG4gICAgICBtYXhMaWZldGltZTogRHVyYXRpb24ubWludXRlcygzMCksXG4gICAgfTtcbiAgICBjb25zdCBhbmFseXNpc1J1bnRpbWVMaWZlY3ljbGVDb25maWd1cmF0aW9uID0ge1xuICAgICAgaWRsZVJ1bnRpbWVTZXNzaW9uVGltZW91dDogRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIG1heExpZmV0aW1lOiBEdXJhdGlvbi5taW51dGVzKDEwKSxcbiAgICB9O1xuXG4gICAgLy8gMS4gUGFja2FnZSBkZWRpY2F0ZWQgcnVudGltZSBpbWFnZXMgc28gdGhlIGxhdGVuY3ktc2Vuc2l0aXZlIHZvaWNlIHBhdGhcbiAgICAvLyBhbmQgdGhlIHNsb3dlciBtdWx0aS1hZ2VudCBzY29yaW5nIHBhdGggY2FuIHNjYWxlIGluZGVwZW5kZW50bHkuXG4gICAgY29uc3QgcmVhbHRpbWVSdW50aW1lQXJ0aWZhY3QgPSBhZ2VudGNvcmUuQWdlbnRSdW50aW1lQXJ0aWZhY3QuZnJvbUFzc2V0KFxuICAgICAgcnVudGltZUFzc2V0UGF0aCxcbiAgICAgIHtcbiAgICAgICAgLi4ucnVudGltZUFzc2V0T3B0aW9ucyxcbiAgICAgICAgZmlsZTogXCJEb2NrZXJmaWxlLnJlYWx0aW1lXCIsXG4gICAgICB9XG4gICAgKTtcbiAgICBjb25zdCBhbmFseXNpc1J1bnRpbWVBcnRpZmFjdCA9IGFnZW50Y29yZS5BZ2VudFJ1bnRpbWVBcnRpZmFjdC5mcm9tQXNzZXQoXG4gICAgICBydW50aW1lQXNzZXRQYXRoLFxuICAgICAge1xuICAgICAgICAuLi5ydW50aW1lQXNzZXRPcHRpb25zLFxuICAgICAgICBmaWxlOiBcIkRvY2tlcmZpbGUuYW5hbHlzaXNcIixcbiAgICAgIH1cbiAgICApO1xuXG4gICAgLy8gMi4gQ3JlYXRlIHRoZSBkZWRpY2F0ZWQgaGlkZGVuIHR1cm4tYW5hbHlzaXMgcnVudGltZS5cbiAgICBjb25zdCBhbmFseXNpc1J1bnRpbWUgPSBuZXcgYWdlbnRjb3JlLlJ1bnRpbWUodGhpcywgXCJUdXJuQW5hbHlzaXNSdW50aW1lXCIsIHtcbiAgICAgIHJ1bnRpbWVOYW1lOiBcImRhdGluZ19nYW1lX3R1cm5fYW5hbHlzaXNcIixcbiAgICAgIGFnZW50UnVudGltZUFydGlmYWN0OiBhbmFseXNpc1J1bnRpbWVBcnRpZmFjdCxcbiAgICAgIGF1dGhvcml6ZXJDb25maWd1cmF0aW9uOiBhZ2VudGNvcmUuUnVudGltZUF1dGhvcml6ZXJDb25maWd1cmF0aW9uLnVzaW5nSUFNKCksXG4gICAgICBsaWZlY3ljbGVDb25maWd1cmF0aW9uOiBhbmFseXNpc1J1bnRpbWVMaWZlY3ljbGVDb25maWd1cmF0aW9uLFxuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXM6IHtcbiAgICAgICAgSXNJbkNsb3VkOiBcInllc1wiLFxuICAgICAgICBBV1NfQkVEUk9DS19SRUdJT046IFwidXMtZWFzdC0xXCIsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5hbmFseXNpc1J1bnRpbWVBcm4gPSBhbmFseXNpc1J1bnRpbWUuYWdlbnRSdW50aW1lQXJuO1xuXG4gICAgLy8gMy4gUmV1c2UgdGhlIG9yaWdpbmFsIGxvZ2ljYWwgSUQgc28gQ2xvdWRGb3JtYXRpb24gdXBkYXRlcyB0aGUgZXhpc3RpbmdcbiAgICAvLyByZWFsdGltZSBydW50aW1lIGluc3RlYWQgb2YgYXR0ZW1wdGluZyBhIGNvbmZsaWN0aW5nIHJlcGxhY2VtZW50LlxuICAgIGNvbnN0IHJlYWx0aW1lUnVudGltZSA9IG5ldyBhZ2VudGNvcmUuUnVudGltZSh0aGlzLCBcIlJ1bnRpbWVcIiwge1xuICAgICAgcnVudGltZU5hbWU6IFwiZGF0aW5nX2dhbWVfYWdlbnRjb3JlXCIsXG4gICAgICBhZ2VudFJ1bnRpbWVBcnRpZmFjdDogcmVhbHRpbWVSdW50aW1lQXJ0aWZhY3QsXG4gICAgICBhdXRob3JpemVyQ29uZmlndXJhdGlvbjogYWdlbnRjb3JlLlJ1bnRpbWVBdXRob3JpemVyQ29uZmlndXJhdGlvbi51c2luZ0lBTSgpLFxuICAgICAgbGlmZWN5Y2xlQ29uZmlndXJhdGlvbjogcmVhbHRpbWVSdW50aW1lTGlmZWN5Y2xlQ29uZmlndXJhdGlvbixcbiAgICAgIGVudmlyb25tZW50VmFyaWFibGVzOiB7XG4gICAgICAgIElzSW5DbG91ZDogXCJ5ZXNcIixcbiAgICAgICAgQVdTX0JFRFJPQ0tfUkVHSU9OOiBcInVzLWVhc3QtMVwiLFxuICAgICAgICBEYXRpbmdHYW1lVGFibGU6IHByb3BzLmRhdGFiYXNlLmRhdGluZ0dhbWVUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIE1VTFRJX0FHRU5UX01PREVMX0lEOiBcInVzLmFtYXpvbi5ub3ZhLTItbGl0ZS12MTowXCIsXG4gICAgICAgIFRVUk5fQU5BTFlTSVNfUlVOVElNRV9BUk46IGFuYWx5c2lzUnVudGltZS5hZ2VudFJ1bnRpbWVBcm4sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5ydW50aW1lQXJuID0gcmVhbHRpbWVSdW50aW1lLmFnZW50UnVudGltZUFybjtcblxuICAgIC8vIDQuIEdyYW50IHRoZSByZWFsdGltZSBydW50aW1lIGFjY2VzcyB0byBnYW1lIHN0YXRlIHN0b3JhZ2UuXG4gICAgcHJvcHMuZGF0YWJhc2UuZGF0aW5nR2FtZVRhYmxlLmdyYW50RnVsbEFjY2VzcyhyZWFsdGltZVJ1bnRpbWUucm9sZSk7XG5cbiAgICAvLyA1LiBHcmFudCB0aGUgcmVhbHRpbWUgcnVudGltZSBhY2Nlc3Mgb25seSB0byB0aGUgcmVhbHRpbWUgdm9pY2UgbW9kZWxzLlxuICAgIHJlYWx0aW1lUnVudGltZS5yb2xlLmFkZFRvUHJpbmNpcGFsUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICBcImJlZHJvY2s6SW52b2tlTW9kZWxcIixcbiAgICAgICAgICBcImJlZHJvY2s6SW52b2tlTW9kZWxXaXRoUmVzcG9uc2VTdHJlYW1cIixcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgXCJhcm46YXdzOmJlZHJvY2s6Kjo6Zm91bmRhdGlvbi1tb2RlbC9hbWF6b24ubm92YS1zb25pYy12MTowXCIsXG4gICAgICAgICAgXCJhcm46YXdzOmJlZHJvY2s6Kjo6Zm91bmRhdGlvbi1tb2RlbC9hbWF6b24ubm92YS0yLXNvbmljLXYxOjBcIixcbiAgICAgICAgXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIDYuIEdyYW50IHRoZSB0dXJuLWFuYWx5c2lzIHJ1bnRpbWUgYWNjZXNzIG9ubHkgdG8gdGhlIG5vbi1yZWFsdGltZSBqdWRnZSBtb2RlbC5cbiAgICBhbmFseXNpc1J1bnRpbWUucm9sZS5hZGRUb1ByaW5jaXBhbFBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgXCJiZWRyb2NrOkludm9rZU1vZGVsXCIsXG4gICAgICAgICAgXCJiZWRyb2NrOkludm9rZU1vZGVsV2l0aFJlc3BvbnNlU3RyZWFtXCIsXG4gICAgICAgICAgXCJiZWRyb2NrOkNvbnZlcnNlXCIsXG4gICAgICAgICAgXCJiZWRyb2NrOkNvbnZlcnNlU3RyZWFtXCIsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIFwiYXJuOmF3czpiZWRyb2NrOio6OmZvdW5kYXRpb24tbW9kZWwvYW1hem9uLm5vdmEtMi1saXRlLXYxOjBcIixcbiAgICAgICAgICBcImFybjphd3M6YmVkcm9jazoqOio6aW5mZXJlbmNlLXByb2ZpbGUvdXMuYW1hem9uLm5vdmEtMi1saXRlLXYxOjBcIixcbiAgICAgICAgICBcImFybjphd3M6YmVkcm9jazoqOio6aW5mZXJlbmNlLXByb2ZpbGUvZ2xvYmFsLmFtYXpvbi5ub3ZhLTItbGl0ZS12MTowXCIsXG4gICAgICAgIF0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyA3LiBBbGxvdyB0aGUgcmVhbHRpbWUgcnVudGltZSB0byBpbnZva2UgdGhlIGludGVybmFsIHR1cm4tYW5hbHlzaXMgcnVudGltZS5cbiAgICByZWFsdGltZVJ1bnRpbWUucm9sZS5hZGRUb1ByaW5jaXBhbFBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXCJiZWRyb2NrLWFnZW50Y29yZTpJbnZva2VBZ2VudFJ1bnRpbWVcIl0sXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIGFuYWx5c2lzUnVudGltZS5hZ2VudFJ1bnRpbWVBcm4sXG4gICAgICAgICAgYCR7YW5hbHlzaXNSdW50aW1lLmFnZW50UnVudGltZUFybn0vKmAsXG4gICAgICAgIF0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyA4LiBTZXJ2ZXJsZXNzIEZyb250ZW5kIFMzIFdlYnNpdGUgQnVja2V0XG4gICAgY29uc3Qgd2Vic2l0ZUJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgXCJEYXRpbmdHYW1lV2Vic2l0ZUJ1Y2tldFwiLCB7XG4gICAgICB3ZWJzaXRlSW5kZXhEb2N1bWVudDogXCJpbmRleC5odG1sXCIsXG4gICAgICByZW1vdmFsUG9saWN5OiBSZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICAgIHB1YmxpY1JlYWRBY2Nlc3M6IHRydWUsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUNMU19PTkxZLFxuICAgICAgY29yczogW1xuICAgICAgICB7XG4gICAgICAgICAgYWxsb3dlZEhlYWRlcnM6IFtcIipcIl0sXG4gICAgICAgICAgYWxsb3dlZE1ldGhvZHM6IFtzMy5IdHRwTWV0aG9kcy5HRVQsIHMzLkh0dHBNZXRob2RzLkhFQURdLFxuICAgICAgICAgIGFsbG93ZWRPcmlnaW5zOiBbXCIqXCJdLFxuICAgICAgICAgIGV4cG9zZWRIZWFkZXJzOiBbXCJEYXRlXCIsIFwiRVRhZ1wiLCBcIngtYW16LXJlcXVlc3QtaWRcIl0sXG4gICAgICAgICAgbWF4QWdlOiAzMDAwLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIHdlYnNpdGVCdWNrZXQuYWRkVG9SZXNvdXJjZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogW1wiczM6R2V0T2JqZWN0XCJdLFxuICAgICAgICByZXNvdXJjZXM6IFt3ZWJzaXRlQnVja2V0LmFybkZvck9iamVjdHMoXCIqXCIpXSxcbiAgICAgICAgcHJpbmNpcGFsczogW25ldyBpYW0uQW55UHJpbmNpcGFsKCldLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gOS4gQ29zdC1FZmZpY2llbnQgQ2xvdWRGcm9udCBEaXN0cmlidXRpb24gKFByaWNlIENsYXNzIDEwMClcbiAgICBjb25zdCBvYWkgPSBuZXcgY2xvdWRmcm9udC5PcmlnaW5BY2Nlc3NJZGVudGl0eSh0aGlzLCBcIkRhdGluZ0dhbWVPQUlcIik7XG4gICAgd2Vic2l0ZUJ1Y2tldC5ncmFudFJlYWQob2FpKTtcblxuICAgIGNvbnN0IGRpc3RyaWJ1dGlvbiA9IG5ldyBjbG91ZGZyb250LkRpc3RyaWJ1dGlvbih0aGlzLCBcIkRhdGluZ0dhbWVEaXN0cmlidXRpb25cIiwge1xuICAgICAgZGVmYXVsdFJvb3RPYmplY3Q6IFwiaW5kZXguaHRtbFwiLFxuICAgICAgcHJpY2VDbGFzczogY2xvdWRmcm9udC5QcmljZUNsYXNzLlBSSUNFX0NMQVNTXzEwMCxcbiAgICAgIGRlZmF1bHRCZWhhdmlvcjoge1xuICAgICAgICBvcmlnaW46IG9yaWdpbnMuUzNCdWNrZXRPcmlnaW4ud2l0aE9yaWdpbkFjY2Vzc0lkZW50aXR5KHdlYnNpdGVCdWNrZXQsIHsgb3JpZ2luQWNjZXNzSWRlbnRpdHk6IG9haSB9KSxcbiAgICAgICAgdmlld2VyUHJvdG9jb2xQb2xpY3k6IGNsb3VkZnJvbnQuVmlld2VyUHJvdG9jb2xQb2xpY3kuUkVESVJFQ1RfVE9fSFRUUFMsXG4gICAgICAgIGFsbG93ZWRNZXRob2RzOiBjbG91ZGZyb250LkFsbG93ZWRNZXRob2RzLkFMTE9XX0dFVF9IRUFEX09QVElPTlMsXG4gICAgICAgIGNhY2hlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQ2FjaGVkTWV0aG9kcy5DQUNIRV9HRVRfSEVBRCxcbiAgICAgICAgY2FjaGVQb2xpY3k6IGNsb3VkZnJvbnQuQ2FjaGVQb2xpY3kuQ0FDSElOR19PUFRJTUlaRUQsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5zZXJ2aWNlVXJsID0gZGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbkRvbWFpbk5hbWU7XG5cbiAgICAvLyAxMC4gRGVwbG95IHN0YXRpYyB3ZWIgZmlsZXMgYW5kIGR5bmFtaWMgY29uZmlnLmpzb24gdG8gd2Vic2l0ZSBidWNrZXRcbiAgICBuZXcgczNkZXBsb3kuQnVja2V0RGVwbG95bWVudCh0aGlzLCBcIkRlcGxveURhdGluZ0dhbWVXZWJzaXRlQW5kQ29uZmlnXCIsIHtcbiAgICAgIHNvdXJjZXM6IFtcbiAgICAgICAgczNkZXBsb3kuU291cmNlLmFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi4vLi4vLi4vZnJvbnRlbmRcIikpLFxuICAgICAgICBzM2RlcGxveS5Tb3VyY2UuanNvbkRhdGEoXCJjb25maWcuanNvblwiLCB7XG4gICAgICAgICAgcmVnaW9uOiBTdGFjay5vZih0aGlzKS5yZWdpb24sXG4gICAgICAgICAgdXNlclBvb2xJZDogcHJvcHMudXNlclBvb2xJZCxcbiAgICAgICAgICBjbGllbnRJZDogcHJvcHMudXNlclBvb2xDbGllbnRJZCxcbiAgICAgICAgICBpZGVudGl0eVBvb2xJZDogcHJvcHMuaWRlbnRpdHlQb29sSWQsXG4gICAgICAgICAgcnVudGltZUFybjogcmVhbHRpbWVSdW50aW1lLmFnZW50UnVudGltZUFybixcbiAgICAgICAgfSksXG4gICAgICBdLFxuICAgICAgZGVzdGluYXRpb25CdWNrZXQ6IHdlYnNpdGVCdWNrZXQsXG4gICAgICBkaXN0cmlidXRpb24sXG4gICAgICBkaXN0cmlidXRpb25QYXRoczogW1wiLypcIl0sXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==
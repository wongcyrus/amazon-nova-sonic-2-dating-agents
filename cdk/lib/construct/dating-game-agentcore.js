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
            waitForDistributionInvalidation: false,
        });
    }
}
exports.DatingGameAgentcoreConstruct = DatingGameAgentcoreConstruct;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGF0aW5nLWdhbWUtYWdlbnRjb3JlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZGF0aW5nLWdhbWUtYWdlbnRjb3JlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDJDQUF1QztBQUN2QyxnRkFBa0U7QUFDbEUseURBQTJDO0FBQzNDLHVEQUF5QztBQUN6Qyx3RUFBMEQ7QUFDMUQsdUVBQXlEO0FBQ3pELDRFQUE4RDtBQUM5RCwyQ0FBNkI7QUFDN0IsK0RBQXNEO0FBRXRELDZDQUE2RDtBQVM3RCxNQUFhLDRCQUE2QixTQUFRLHNCQUFTO0lBS3pELFlBQ0UsS0FBZ0IsRUFDaEIsRUFBVSxFQUNWLEtBQXdDO1FBRXhDLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUMzRCxNQUFNLG1CQUFtQixHQUFHO1lBQzFCLFFBQVEsRUFBRSx5QkFBUSxDQUFDLFdBQVc7WUFDOUIsT0FBTyxFQUFFLENBQUMsT0FBTyxFQUFFLGFBQWEsRUFBRSxPQUFPLEVBQUUsS0FBSyxDQUFDO1NBQ2xELENBQUM7UUFDRixNQUFNLHFDQUFxQyxHQUFHO1lBQzVDLHlCQUF5QixFQUFFLHNCQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUMvQyxXQUFXLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1NBQ2xDLENBQUM7UUFDRixNQUFNLHFDQUFxQyxHQUFHO1lBQzVDLHlCQUF5QixFQUFFLHNCQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUM5QyxXQUFXLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1NBQ2xDLENBQUM7UUFFRiwwRUFBMEU7UUFDMUUsbUVBQW1FO1FBQ25FLE1BQU0sdUJBQXVCLEdBQUcs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Q0FBQyxlQUFlO2lCQUM1QyxDQUFDO2FBQ0g7WUFDRCxpQkFBaUIsRUFBRSxhQUFhO1lBQ2hDLFlBQVk7WUFDWixpQkFBaUIsRUFBRSxDQUFDLElBQUksQ0FBQztZQUN6QiwrQkFBK0IsRUFBRSxLQUFLO1NBQ3ZDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXhMRCxvRUF3TEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tIFwiY29uc3RydWN0c1wiO1xuaW1wb3J0ICogYXMgYWdlbnRjb3JlIGZyb20gXCJAYXdzLWNkay9hd3MtYmVkcm9jay1hZ2VudGNvcmUtYWxwaGFcIjtcbmltcG9ydCAqIGFzIGlhbSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWlhbVwiO1xuaW1wb3J0ICogYXMgczMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zM1wiO1xuaW1wb3J0ICogYXMgczNkZXBsb3kgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zMy1kZXBsb3ltZW50XCI7XG5pbXBvcnQgKiBhcyBjbG91ZGZyb250IGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtY2xvdWRmcm9udFwiO1xuaW1wb3J0ICogYXMgb3JpZ2lucyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQtb3JpZ2luc1wiO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tIFwicGF0aFwiO1xuaW1wb3J0IHsgUGxhdGZvcm0gfSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWVjci1hc3NldHNcIjtcbmltcG9ydCB7IERhdGFiYXNlQ29uc3RydWN0IH0gZnJvbSBcIi4vZGF0ZWJhc2VcIjtcbmltcG9ydCB7IER1cmF0aW9uLCBTdGFjaywgUmVtb3ZhbFBvbGljeSB9IGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIERhdGluZ0dhbWVBZ2VudGNvcmVDb25zdHJ1Y3RQcm9wcyB7XG4gIHJlYWRvbmx5IGRhdGFiYXNlOiBEYXRhYmFzZUNvbnN0cnVjdDtcbiAgcmVhZG9ubHkgdXNlclBvb2xJZDogc3RyaW5nO1xuICByZWFkb25seSB1c2VyUG9vbENsaWVudElkOiBzdHJpbmc7XG4gIHJlYWRvbmx5IGlkZW50aXR5UG9vbElkOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBEYXRpbmdHYW1lQWdlbnRjb3JlQ29uc3RydWN0IGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcHVibGljIHJlYWRvbmx5IHJ1bnRpbWVBcm46IHN0cmluZztcbiAgcHVibGljIHJlYWRvbmx5IGFuYWx5c2lzUnVudGltZUFybjogc3RyaW5nO1xuICBwdWJsaWMgcmVhZG9ubHkgc2VydmljZVVybDogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHNjb3BlOiBDb25zdHJ1Y3QsXG4gICAgaWQ6IHN0cmluZyxcbiAgICBwcm9wczogRGF0aW5nR2FtZUFnZW50Y29yZUNvbnN0cnVjdFByb3BzXG4gICkge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCBydW50aW1lQXNzZXRQYXRoID0gcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi8uLi8uLi9cIik7XG4gICAgY29uc3QgcnVudGltZUFzc2V0T3B0aW9ucyA9IHtcbiAgICAgIHBsYXRmb3JtOiBQbGF0Zm9ybS5MSU5VWF9BUk02NCxcbiAgICAgIGV4Y2x1ZGU6IFtcIi52ZW52XCIsIFwiX19weWNhY2hlX19cIiwgXCJ0ZXN0c1wiLCBcImNka1wiXSxcbiAgICB9O1xuICAgIGNvbnN0IHJlYWx0aW1lUnVudGltZUxpZmVjeWNsZUNvbmZpZ3VyYXRpb24gPSB7XG4gICAgICBpZGxlUnVudGltZVNlc3Npb25UaW1lb3V0OiBEdXJhdGlvbi5taW51dGVzKDEwKSxcbiAgICAgIG1heExpZmV0aW1lOiBEdXJhdGlvbi5taW51dGVzKDMwKSxcbiAgICB9O1xuICAgIGNvbnN0IGFuYWx5c2lzUnVudGltZUxpZmVjeWNsZUNvbmZpZ3VyYXRpb24gPSB7XG4gICAgICBpZGxlUnVudGltZVNlc3Npb25UaW1lb3V0OiBEdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgbWF4TGlmZXRpbWU6IER1cmF0aW9uLm1pbnV0ZXMoMTApLFxuICAgIH07XG5cbiAgICAvLyAxLiBQYWNrYWdlIGRlZGljYXRlZCBydW50aW1lIGltYWdlcyBzbyB0aGUgbGF0ZW5jeS1zZW5zaXRpdmUgdm9pY2UgcGF0aFxuICAgIC8vIGFuZCB0aGUgc2xvd2VyIG11bHRpLWFnZW50IHNjb3JpbmcgcGF0aCBjYW4gc2NhbGUgaW5kZXBlbmRlbnRseS5cbiAgICBjb25zdCByZWFsdGltZVJ1bnRpbWVBcnRpZmFjdCA9IGFnZW50Y29yZS5BZ2VudFJ1bnRpbWVBcnRpZmFjdC5mcm9tQXNzZXQoXG4gICAgICBydW50aW1lQXNzZXRQYXRoLFxuICAgICAge1xuICAgICAgICAuLi5ydW50aW1lQXNzZXRPcHRpb25zLFxuICAgICAgICBmaWxlOiBcIkRvY2tlcmZpbGUucmVhbHRpbWVcIixcbiAgICAgIH1cbiAgICApO1xuICAgIGNvbnN0IGFuYWx5c2lzUnVudGltZUFydGlmYWN0ID0gYWdlbnRjb3JlLkFnZW50UnVudGltZUFydGlmYWN0LmZyb21Bc3NldChcbiAgICAgIHJ1bnRpbWVBc3NldFBhdGgsXG4gICAgICB7XG4gICAgICAgIC4uLnJ1bnRpbWVBc3NldE9wdGlvbnMsXG4gICAgICAgIGZpbGU6IFwiRG9ja2VyZmlsZS5hbmFseXNpc1wiLFxuICAgICAgfVxuICAgICk7XG5cbiAgICAvLyAyLiBDcmVhdGUgdGhlIGRlZGljYXRlZCBoaWRkZW4gdHVybi1hbmFseXNpcyBydW50aW1lLlxuICAgIGNvbnN0IGFuYWx5c2lzUnVudGltZSA9IG5ldyBhZ2VudGNvcmUuUnVudGltZSh0aGlzLCBcIlR1cm5BbmFseXNpc1J1bnRpbWVcIiwge1xuICAgICAgcnVudGltZU5hbWU6IFwiZGF0aW5nX2dhbWVfdHVybl9hbmFseXNpc1wiLFxuICAgICAgYWdlbnRSdW50aW1lQXJ0aWZhY3Q6IGFuYWx5c2lzUnVudGltZUFydGlmYWN0LFxuICAgICAgYXV0aG9yaXplckNvbmZpZ3VyYXRpb246IGFnZW50Y29yZS5SdW50aW1lQXV0aG9yaXplckNvbmZpZ3VyYXRpb24udXNpbmdJQU0oKSxcbiAgICAgIGxpZmVjeWNsZUNvbmZpZ3VyYXRpb246IGFuYWx5c2lzUnVudGltZUxpZmVjeWNsZUNvbmZpZ3VyYXRpb24sXG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlczoge1xuICAgICAgICBJc0luQ2xvdWQ6IFwieWVzXCIsXG4gICAgICAgIEFXU19CRURST0NLX1JFR0lPTjogXCJ1cy1lYXN0LTFcIixcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLmFuYWx5c2lzUnVudGltZUFybiA9IGFuYWx5c2lzUnVudGltZS5hZ2VudFJ1bnRpbWVBcm47XG5cbiAgICAvLyAzLiBSZXVzZSB0aGUgb3JpZ2luYWwgbG9naWNhbCBJRCBzbyBDbG91ZEZvcm1hdGlvbiB1cGRhdGVzIHRoZSBleGlzdGluZ1xuICAgIC8vIHJlYWx0aW1lIHJ1bnRpbWUgaW5zdGVhZCBvZiBhdHRlbXB0aW5nIGEgY29uZmxpY3RpbmcgcmVwbGFjZW1lbnQuXG4gICAgY29uc3QgcmVhbHRpbWVSdW50aW1lID0gbmV3IGFnZW50Y29yZS5SdW50aW1lKHRoaXMsIFwiUnVudGltZVwiLCB7XG4gICAgICBydW50aW1lTmFtZTogXCJkYXRpbmdfZ2FtZV9hZ2VudGNvcmVcIixcbiAgICAgIGFnZW50UnVudGltZUFydGlmYWN0OiByZWFsdGltZVJ1bnRpbWVBcnRpZmFjdCxcbiAgICAgIGF1dGhvcml6ZXJDb25maWd1cmF0aW9uOiBhZ2VudGNvcmUuUnVudGltZUF1dGhvcml6ZXJDb25maWd1cmF0aW9uLnVzaW5nSUFNKCksXG4gICAgICBsaWZlY3ljbGVDb25maWd1cmF0aW9uOiByZWFsdGltZVJ1bnRpbWVMaWZlY3ljbGVDb25maWd1cmF0aW9uLFxuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXM6IHtcbiAgICAgICAgSXNJbkNsb3VkOiBcInllc1wiLFxuICAgICAgICBBV1NfQkVEUk9DS19SRUdJT046IFwidXMtZWFzdC0xXCIsXG4gICAgICAgIERhdGluZ0dhbWVUYWJsZTogcHJvcHMuZGF0YWJhc2UuZGF0aW5nR2FtZVRhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgTVVMVElfQUdFTlRfTU9ERUxfSUQ6IFwidXMuYW1hem9uLm5vdmEtMi1saXRlLXYxOjBcIixcbiAgICAgICAgVFVSTl9BTkFMWVNJU19SVU5USU1FX0FSTjogYW5hbHlzaXNSdW50aW1lLmFnZW50UnVudGltZUFybixcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgdGhpcy5ydW50aW1lQXJuID0gcmVhbHRpbWVSdW50aW1lLmFnZW50UnVudGltZUFybjtcbiAgICB0aGlzLnJ1bnRpbWVBcm4gPSByZWFsdGltZVJ1bnRpbWUuYWdlbnRSdW50aW1lQXJuO1xuXG4gICAgLy8gNC4gR3JhbnQgdGhlIHJlYWx0aW1lIHJ1bnRpbWUgYWNjZXNzIHRvIGdhbWUgc3RhdGUgc3RvcmFnZS5cbiAgICBwcm9wcy5kYXRhYmFzZS5kYXRpbmdHYW1lVGFibGUuZ3JhbnRGdWxsQWNjZXNzKHJlYWx0aW1lUnVudGltZS5yb2xlKTtcblxuICAgIC8vIDUuIEdyYW50IHRoZSByZWFsdGltZSBydW50aW1lIGFjY2VzcyBvbmx5IHRvIHRoZSByZWFsdGltZSB2b2ljZSBtb2RlbHMuXG4gICAgcmVhbHRpbWVSdW50aW1lLnJvbGUuYWRkVG9QcmluY2lwYWxQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgIFwiYmVkcm9jazpJbnZva2VNb2RlbFwiLFxuICAgICAgICAgIFwiYmVkcm9jazpJbnZva2VNb2RlbFdpdGhSZXNwb25zZVN0cmVhbVwiLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBcImFybjphd3M6YmVkcm9jazoqOjpmb3VuZGF0aW9uLW1vZGVsL2FtYXpvbi5ub3ZhLXNvbmljLXYxOjBcIixcbiAgICAgICAgICBcImFybjphd3M6YmVkcm9jazoqOjpmb3VuZGF0aW9uLW1vZGVsL2FtYXpvbi5ub3ZhLTItc29uaWMtdjE6MFwiLFxuICAgICAgICBdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gNi4gR3JhbnQgdGhlIHR1cm4tYW5hbHlzaXMgcnVudGltZSBhY2Nlc3Mgb25seSB0byB0aGUgbm9uLXJlYWx0aW1lIGp1ZGdlIG1vZGVsLlxuICAgIGFuYWx5c2lzUnVudGltZS5yb2xlLmFkZFRvUHJpbmNpcGFsUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICBcImJlZHJvY2s6SW52b2tlTW9kZWxcIixcbiAgICAgICAgICBcImJlZHJvY2s6SW52b2tlTW9kZWxXaXRoUmVzcG9uc2VTdHJlYW1cIixcbiAgICAgICAgICBcImJlZHJvY2s6Q29udmVyc2VcIixcbiAgICAgICAgICBcImJlZHJvY2s6Q29udmVyc2VTdHJlYW1cIixcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgXCJhcm46YXdzOmJlZHJvY2s6Kjo6Zm91bmRhdGlvbi1tb2RlbC9hbWF6b24ubm92YS0yLWxpdGUtdjE6MFwiLFxuICAgICAgICAgIFwiYXJuOmF3czpiZWRyb2NrOio6KjppbmZlcmVuY2UtcHJvZmlsZS91cy5hbWF6b24ubm92YS0yLWxpdGUtdjE6MFwiLFxuICAgICAgICAgIFwiYXJuOmF3czpiZWRyb2NrOio6KjppbmZlcmVuY2UtcHJvZmlsZS9nbG9iYWwuYW1hem9uLm5vdmEtMi1saXRlLXYxOjBcIixcbiAgICAgICAgXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIDcuIEFsbG93IHRoZSByZWFsdGltZSBydW50aW1lIHRvIGludm9rZSB0aGUgaW50ZXJuYWwgdHVybi1hbmFseXNpcyBydW50aW1lLlxuICAgIHJlYWx0aW1lUnVudGltZS5yb2xlLmFkZFRvUHJpbmNpcGFsUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcImJlZHJvY2stYWdlbnRjb3JlOkludm9rZUFnZW50UnVudGltZVwiXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgYW5hbHlzaXNSdW50aW1lLmFnZW50UnVudGltZUFybixcbiAgICAgICAgICBgJHthbmFseXNpc1J1bnRpbWUuYWdlbnRSdW50aW1lQXJufS8qYCxcbiAgICAgICAgXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIDguIFNlcnZlcmxlc3MgRnJvbnRlbmQgUzMgV2Vic2l0ZSBCdWNrZXRcbiAgICBjb25zdCB3ZWJzaXRlQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCBcIkRhdGluZ0dhbWVXZWJzaXRlQnVja2V0XCIsIHtcbiAgICAgIHdlYnNpdGVJbmRleERvY3VtZW50OiBcImluZGV4Lmh0bWxcIixcbiAgICAgIHJlbW92YWxQb2xpY3k6IFJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxuICAgICAgcHVibGljUmVhZEFjY2VzczogdHJ1ZSxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BQ0xTX09OTFksXG4gICAgICBjb3JzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhbGxvd2VkSGVhZGVyczogW1wiKlwiXSxcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogW3MzLkh0dHBNZXRob2RzLkdFVCwgczMuSHR0cE1ldGhvZHMuSEVBRF0sXG4gICAgICAgICAgYWxsb3dlZE9yaWdpbnM6IFtcIipcIl0sXG4gICAgICAgICAgZXhwb3NlZEhlYWRlcnM6IFtcIkRhdGVcIiwgXCJFVGFnXCIsIFwieC1hbXotcmVxdWVzdC1pZFwiXSxcbiAgICAgICAgICBtYXhBZ2U6IDMwMDAsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgd2Vic2l0ZUJ1Y2tldC5hZGRUb1Jlc291cmNlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbXCJzMzpHZXRPYmplY3RcIl0sXG4gICAgICAgIHJlc291cmNlczogW3dlYnNpdGVCdWNrZXQuYXJuRm9yT2JqZWN0cyhcIipcIildLFxuICAgICAgICBwcmluY2lwYWxzOiBbbmV3IGlhbS5BbnlQcmluY2lwYWwoKV0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyA5LiBDb3N0LUVmZmljaWVudCBDbG91ZEZyb250IERpc3RyaWJ1dGlvbiAoUHJpY2UgQ2xhc3MgMTAwKVxuICAgIGNvbnN0IG9haSA9IG5ldyBjbG91ZGZyb250Lk9yaWdpbkFjY2Vzc0lkZW50aXR5KHRoaXMsIFwiRGF0aW5nR2FtZU9BSVwiKTtcbiAgICB3ZWJzaXRlQnVja2V0LmdyYW50UmVhZChvYWkpO1xuXG4gICAgY29uc3QgZGlzdHJpYnV0aW9uID0gbmV3IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uKHRoaXMsIFwiRGF0aW5nR2FtZURpc3RyaWJ1dGlvblwiLCB7XG4gICAgICBkZWZhdWx0Um9vdE9iamVjdDogXCJpbmRleC5odG1sXCIsXG4gICAgICBwcmljZUNsYXNzOiBjbG91ZGZyb250LlByaWNlQ2xhc3MuUFJJQ0VfQ0xBU1NfMTAwLFxuICAgICAgZGVmYXVsdEJlaGF2aW9yOiB7XG4gICAgICAgIG9yaWdpbjogb3JpZ2lucy5TM0J1Y2tldE9yaWdpbi53aXRoT3JpZ2luQWNjZXNzSWRlbnRpdHkod2Vic2l0ZUJ1Y2tldCwgeyBvcmlnaW5BY2Nlc3NJZGVudGl0eTogb2FpIH0pLFxuICAgICAgICB2aWV3ZXJQcm90b2NvbFBvbGljeTogY2xvdWRmcm9udC5WaWV3ZXJQcm90b2NvbFBvbGljeS5SRURJUkVDVF9UT19IVFRQUyxcbiAgICAgICAgYWxsb3dlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQWxsb3dlZE1ldGhvZHMuQUxMT1dfR0VUX0hFQURfT1BUSU9OUyxcbiAgICAgICAgY2FjaGVkTWV0aG9kczogY2xvdWRmcm9udC5DYWNoZWRNZXRob2RzLkNBQ0hFX0dFVF9IRUFELFxuICAgICAgICBjYWNoZVBvbGljeTogY2xvdWRmcm9udC5DYWNoZVBvbGljeS5DQUNISU5HX09QVElNSVpFRCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLnNlcnZpY2VVcmwgPSBkaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uRG9tYWluTmFtZTtcblxuICAgIG5ldyBzM2RlcGxveS5CdWNrZXREZXBsb3ltZW50KHRoaXMsIFwiRGVwbG95RGF0aW5nR2FtZVdlYnNpdGVBbmRDb25maWdcIiwge1xuICAgICAgc291cmNlczogW1xuICAgICAgICBzM2RlcGxveS5Tb3VyY2UuYXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi8uLi8uLi9mcm9udGVuZFwiKSksXG4gICAgICAgIHMzZGVwbG95LlNvdXJjZS5qc29uRGF0YShcImNvbmZpZy5qc29uXCIsIHtcbiAgICAgICAgICByZWdpb246IFN0YWNrLm9mKHRoaXMpLnJlZ2lvbixcbiAgICAgICAgICB1c2VyUG9vbElkOiBwcm9wcy51c2VyUG9vbElkLFxuICAgICAgICAgIGNsaWVudElkOiBwcm9wcy51c2VyUG9vbENsaWVudElkLFxuICAgICAgICAgIGlkZW50aXR5UG9vbElkOiBwcm9wcy5pZGVudGl0eVBvb2xJZCxcbiAgICAgICAgICBydW50aW1lQXJuOiByZWFsdGltZVJ1bnRpbWUuYWdlbnRSdW50aW1lQXJuLFxuICAgICAgICB9KSxcbiAgICAgIF0sXG4gICAgICBkZXN0aW5hdGlvbkJ1Y2tldDogd2Vic2l0ZUJ1Y2tldCxcbiAgICAgIGRpc3RyaWJ1dGlvbixcbiAgICAgIGRpc3RyaWJ1dGlvblBhdGhzOiBbXCIvKlwiXSxcbiAgICAgIHdhaXRGb3JEaXN0cmlidXRpb25JbnZhbGlkYXRpb246IGZhbHNlLFxuICAgIH0pO1xuICB9XG59XG4iXX0=
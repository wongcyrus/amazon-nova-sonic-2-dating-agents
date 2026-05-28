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
        // 1. Package container directly onto AWS Bedrock AgentCore Runtime
        const agentRuntimeArtifact = agentcore.AgentRuntimeArtifact.fromAsset(path.join(__dirname, "../../../"), {
            platform: aws_ecr_assets_1.Platform.LINUX_ARM64,
            exclude: [".venv", "__pycache__", "tests", "cdk"], // Prevent virtualenv and cache files from inflating container size, keeping the essential public directory
        });
        // 2. Create the AgentCore Runtime with IAM authentication (SigV4)
        const runtime = new agentcore.Runtime(this, "Runtime", {
            runtimeName: "dating_game_agentcore",
            agentRuntimeArtifact: agentRuntimeArtifact,
            authorizerConfiguration: agentcore.RuntimeAuthorizerConfiguration.usingIAM(),
            environmentVariables: {
                IsInCloud: "yes",
                AWS_BEDROCK_REGION: "us-east-1",
                DatingGameTable: props.database.datingGameTable.tableName,
            },
        });
        this.runtimeArn = runtime.agentRuntimeArn;
        // 3. Grant full access to DynamoDB tables
        props.database.datingGameTable.grantFullAccess(runtime.role);
        // 4. Grant access to invoke Bedrock models (Nova 2 Sonic)
        runtime.role.addToPrincipalPolicy(new iam.PolicyStatement({
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
        // 5. (Optional) Grant Lambda invocation for specialized tools if added later
        // 6. Serverless Frontend S3 Website Bucket
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
        // 7. Cost-Efficient CloudFront Distribution (Price Class 100)
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
        // 8. Deploy static web files and dynamic config.json to website bucket
        new s3deploy.BucketDeployment(this, "DeployDatingGameWebsiteAndConfig", {
            sources: [
                s3deploy.Source.asset(path.join(__dirname, "../../../frontend")),
                s3deploy.Source.jsonData("config.json", {
                    region: aws_cdk_lib_1.Stack.of(this).region,
                    userPoolId: props.userPoolId,
                    clientId: props.userPoolClientId,
                    identityPoolId: props.identityPoolId,
                    runtimeArn: runtime.agentRuntimeArn,
                }),
            ],
            destinationBucket: websiteBucket,
            distribution,
            distributionPaths: ["/*"],
        });
    }
}
exports.DatingGameAgentcoreConstruct = DatingGameAgentcoreConstruct;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGF0aW5nLWdhbWUtYWdlbnRjb3JlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZGF0aW5nLWdhbWUtYWdlbnRjb3JlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDJDQUF1QztBQUN2QyxnRkFBa0U7QUFDbEUseURBQTJDO0FBQzNDLHVEQUF5QztBQUN6Qyx3RUFBMEQ7QUFDMUQsdUVBQXlEO0FBQ3pELDRFQUE4RDtBQUM5RCwyQ0FBNkI7QUFDN0IsK0RBQXNEO0FBRXRELDZDQUFtRDtBQVNuRCxNQUFhLDRCQUE2QixTQUFRLHNCQUFTO0lBSXpELFlBQ0UsS0FBZ0IsRUFDaEIsRUFBVSxFQUNWLEtBQXdDO1FBRXhDLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsbUVBQW1FO1FBQ25FLE1BQU0sb0JBQW9CLEdBQUcsU0FBUyxDQUFDLG9CQUFvQixDQUFDLFNBQVMsQ0FDbkUsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsV0FBVyxDQUFDLEVBQ2pDO1lBQ0UsUUFBUSxFQUFFLHlCQUFRLENBQUMsV0FBVztZQUM5QixPQUFPLEVBQUUsQ0FBQyxPQUFPLEVBQUUsYUFBYSxFQUFFLE9BQU8sRUFBRSxLQUFLLENBQUMsRUFBRSwyR0FBMkc7U0FDL0osQ0FDRixDQUFDO1FBRUYsa0VBQWtFO1FBQ2xFLE1BQU0sT0FBTyxHQUFHLElBQUksU0FBUyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFO1lBQ3JELFdBQVcsRUFBRSx1QkFBdUI7WUFDcEMsb0JBQW9CLEVBQUUsb0JBQW9CO1lBQzFDLHVCQUF1QixFQUFFLFNBQVMsQ0FBQyw4QkFBOEIsQ0FBQyxRQUFRLEVBQUU7WUFDNUUsb0JBQW9CLEVBQUU7Z0JBQ3BCLFNBQVMsRUFBRSxLQUFLO2dCQUNoQixrQkFBa0IsRUFBRSxXQUFXO2dCQUMvQixlQUFlLEVBQUUsS0FBSyxDQUFD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QWtDLEVBQUU7WUFDdEUsT0FBTyxFQUFFO2dCQUNQLFFBQVEsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLG1CQUFtQixDQUFDLENBQUM7Z0JBQ2hFLFFBQVEsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFBRTtvQkFDdEMsTUFBTSxFQUFFLG1CQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU07b0JBQzdCLFVBQVUsRUFBRSxLQUFLLENBQUMsVUFBVTtvQkFDNUIsUUFBUSxFQUFFLEtBQUssQ0FBQyxnQkFBZ0I7b0JBQ2hDLGNBQWMsRUFBRSxLQUFLLENBQUMsY0FBYztvQkFDcEMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxlQUFlO2lCQUNwQyxDQUFDO2FBQ0g7WUFDRCxpQkFBaUIsRUFBRSxhQUFhO1lBQ2hDLFlBQVk7WUFDWixpQkFBaUIsRUFBRSxDQUFDLElBQUksQ0FBQztTQUMxQixDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFuSEQsb0VBbUhDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSBcImNvbnN0cnVjdHNcIjtcbmltcG9ydCAqIGFzIGFnZW50Y29yZSBmcm9tIFwiQGF3cy1jZGsvYXdzLWJlZHJvY2stYWdlbnRjb3JlLWFscGhhXCI7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1pYW1cIjtcbmltcG9ydCAqIGFzIHMzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtczNcIjtcbmltcG9ydCAqIGFzIHMzZGVwbG95IGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtczMtZGVwbG95bWVudFwiO1xuaW1wb3J0ICogYXMgY2xvdWRmcm9udCBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnRcIjtcbmltcG9ydCAqIGFzIG9yaWdpbnMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1jbG91ZGZyb250LW9yaWdpbnNcIjtcbmltcG9ydCAqIGFzIHBhdGggZnJvbSBcInBhdGhcIjtcbmltcG9ydCB7IFBsYXRmb3JtIH0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1lY3ItYXNzZXRzXCI7XG5pbXBvcnQgeyBEYXRhYmFzZUNvbnN0cnVjdCB9IGZyb20gXCIuL2RhdGViYXNlXCI7XG5pbXBvcnQgeyBTdGFjaywgUmVtb3ZhbFBvbGljeSB9IGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIERhdGluZ0dhbWVBZ2VudGNvcmVDb25zdHJ1Y3RQcm9wcyB7XG4gIHJlYWRvbmx5IGRhdGFiYXNlOiBEYXRhYmFzZUNvbnN0cnVjdDtcbiAgcmVhZG9ubHkgdXNlclBvb2xJZDogc3RyaW5nO1xuICByZWFkb25seSB1c2VyUG9vbENsaWVudElkOiBzdHJpbmc7XG4gIHJlYWRvbmx5IGlkZW50aXR5UG9vbElkOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBEYXRpbmdHYW1lQWdlbnRjb3JlQ29uc3RydWN0IGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcHVibGljIHJlYWRvbmx5IHJ1bnRpbWVBcm46IHN0cmluZztcbiAgcHVibGljIHJlYWRvbmx5IHNlcnZpY2VVcmw6IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihcbiAgICBzY29wZTogQ29uc3RydWN0LFxuICAgIGlkOiBzdHJpbmcsXG4gICAgcHJvcHM6IERhdGluZ0dhbWVBZ2VudGNvcmVDb25zdHJ1Y3RQcm9wc1xuICApIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gMS4gUGFja2FnZSBjb250YWluZXIgZGlyZWN0bHkgb250byBBV1MgQmVkcm9jayBBZ2VudENvcmUgUnVudGltZVxuICAgIGNvbnN0IGFnZW50UnVudGltZUFydGlmYWN0ID0gYWdlbnRjb3JlLkFnZW50UnVudGltZUFydGlmYWN0LmZyb21Bc3NldChcbiAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi4vLi4vLi4vXCIpLFxuICAgICAge1xuICAgICAgICBwbGF0Zm9ybTogUGxhdGZvcm0uTElOVVhfQVJNNjQsXG4gICAgICAgIGV4Y2x1ZGU6IFtcIi52ZW52XCIsIFwiX19weWNhY2hlX19cIiwgXCJ0ZXN0c1wiLCBcImNka1wiXSwgLy8gUHJldmVudCB2aXJ0dWFsZW52IGFuZCBjYWNoZSBmaWxlcyBmcm9tIGluZmxhdGluZyBjb250YWluZXIgc2l6ZSwga2VlcGluZyB0aGUgZXNzZW50aWFsIHB1YmxpYyBkaXJlY3RvcnlcbiAgICAgIH1cbiAgICApO1xuXG4gICAgLy8gMi4gQ3JlYXRlIHRoZSBBZ2VudENvcmUgUnVudGltZSB3aXRoIElBTSBhdXRoZW50aWNhdGlvbiAoU2lnVjQpXG4gICAgY29uc3QgcnVudGltZSA9IG5ldyBhZ2VudGNvcmUuUnVudGltZSh0aGlzLCBcIlJ1bnRpbWVcIiwge1xuICAgICAgcnVudGltZU5hbWU6IFwiZGF0aW5nX2dhbWVfYWdlbnRjb3JlXCIsXG4gICAgICBhZ2VudFJ1bnRpbWVBcnRpZmFjdDogYWdlbnRSdW50aW1lQXJ0aWZhY3QsXG4gICAgICBhdXRob3JpemVyQ29uZmlndXJhdGlvbjogYWdlbnRjb3JlLlJ1bnRpbWVBdXRob3JpemVyQ29uZmlndXJhdGlvbi51c2luZ0lBTSgpLFxuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXM6IHtcbiAgICAgICAgSXNJbkNsb3VkOiBcInllc1wiLFxuICAgICAgICBBV1NfQkVEUk9DS19SRUdJT046IFwidXMtZWFzdC0xXCIsXG4gICAgICAgIERhdGluZ0dhbWVUYWJsZTogcHJvcHMuZGF0YWJhc2UuZGF0aW5nR2FtZVRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLnJ1bnRpbWVBcm4gPSBydW50aW1lLmFnZW50UnVudGltZUFybjtcblxuICAgIC8vIDMuIEdyYW50IGZ1bGwgYWNjZXNzIHRvIER5bmFtb0RCIHRhYmxlc1xuICAgIHByb3BzLmRhdGFiYXNlLmRhdGluZ0dhbWVUYWJsZS5ncmFudEZ1bGxBY2Nlc3MocnVudGltZS5yb2xlKTtcblxuICAgIC8vIDQuIEdyYW50IGFjY2VzcyB0byBpbnZva2UgQmVkcm9jayBtb2RlbHMgKE5vdmEgMiBTb25pYylcbiAgICBydW50aW1lLnJvbGUuYWRkVG9QcmluY2lwYWxQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgIFwiYmVkcm9jazpJbnZva2VNb2RlbFwiLFxuICAgICAgICAgIFwiYmVkcm9jazpJbnZva2VNb2RlbFdpdGhSZXNwb25zZVN0cmVhbVwiLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBcImFybjphd3M6YmVkcm9jazoqOjpmb3VuZGF0aW9uLW1vZGVsL2FtYXpvbi5ub3ZhLXNvbmljLXYxOjBcIixcbiAgICAgICAgICBcImFybjphd3M6YmVkcm9jazoqOjpmb3VuZGF0aW9uLW1vZGVsL2FtYXpvbi5ub3ZhLTItc29uaWMtdjE6MFwiLFxuICAgICAgICBdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gNS4gKE9wdGlvbmFsKSBHcmFudCBMYW1iZGEgaW52b2NhdGlvbiBmb3Igc3BlY2lhbGl6ZWQgdG9vbHMgaWYgYWRkZWQgbGF0ZXJcblxuICAgIC8vIDYuIFNlcnZlcmxlc3MgRnJvbnRlbmQgUzMgV2Vic2l0ZSBCdWNrZXRcbiAgICBjb25zdCB3ZWJzaXRlQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCBcIkRhdGluZ0dhbWVXZWJzaXRlQnVja2V0XCIsIHtcbiAgICAgIHdlYnNpdGVJbmRleERvY3VtZW50OiBcImluZGV4Lmh0bWxcIixcbiAgICAgIHJlbW92YWxQb2xpY3k6IFJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxuICAgICAgcHVibGljUmVhZEFjY2VzczogdHJ1ZSxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BQ0xTX09OTFksXG4gICAgICBjb3JzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhbGxvd2VkSGVhZGVyczogW1wiKlwiXSxcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogW3MzLkh0dHBNZXRob2RzLkdFVCwgczMuSHR0cE1ldGhvZHMuSEVBRF0sXG4gICAgICAgICAgYWxsb3dlZE9yaWdpbnM6IFtcIipcIl0sXG4gICAgICAgICAgZXhwb3NlZEhlYWRlcnM6IFtcIkRhdGVcIiwgXCJFVGFnXCIsIFwieC1hbXotcmVxdWVzdC1pZFwiXSxcbiAgICAgICAgICBtYXhBZ2U6IDMwMDAsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgd2Vic2l0ZUJ1Y2tldC5hZGRUb1Jlc291cmNlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbXCJzMzpHZXRPYmplY3RcIl0sXG4gICAgICAgIHJlc291cmNlczogW3dlYnNpdGVCdWNrZXQuYXJuRm9yT2JqZWN0cyhcIipcIildLFxuICAgICAgICBwcmluY2lwYWxzOiBbbmV3IGlhbS5BbnlQcmluY2lwYWwoKV0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyA3LiBDb3N0LUVmZmljaWVudCBDbG91ZEZyb250IERpc3RyaWJ1dGlvbiAoUHJpY2UgQ2xhc3MgMTAwKVxuICAgIGNvbnN0IG9haSA9IG5ldyBjbG91ZGZyb250Lk9yaWdpbkFjY2Vzc0lkZW50aXR5KHRoaXMsIFwiRGF0aW5nR2FtZU9BSVwiKTtcbiAgICB3ZWJzaXRlQnVja2V0LmdyYW50UmVhZChvYWkpO1xuXG4gICAgY29uc3QgZGlzdHJpYnV0aW9uID0gbmV3IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uKHRoaXMsIFwiRGF0aW5nR2FtZURpc3RyaWJ1dGlvblwiLCB7XG4gICAgICBkZWZhdWx0Um9vdE9iamVjdDogXCJpbmRleC5odG1sXCIsXG4gICAgICBwcmljZUNsYXNzOiBjbG91ZGZyb250LlByaWNlQ2xhc3MuUFJJQ0VfQ0xBU1NfMTAwLFxuICAgICAgZGVmYXVsdEJlaGF2aW9yOiB7XG4gICAgICAgIG9yaWdpbjogb3JpZ2lucy5TM0J1Y2tldE9yaWdpbi53aXRoT3JpZ2luQWNjZXNzSWRlbnRpdHkod2Vic2l0ZUJ1Y2tldCwgeyBvcmlnaW5BY2Nlc3NJZGVudGl0eTogb2FpIH0pLFxuICAgICAgICB2aWV3ZXJQcm90b2NvbFBvbGljeTogY2xvdWRmcm9udC5WaWV3ZXJQcm90b2NvbFBvbGljeS5SRURJUkVDVF9UT19IVFRQUyxcbiAgICAgICAgYWxsb3dlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQWxsb3dlZE1ldGhvZHMuQUxMT1dfR0VUX0hFQURfT1BUSU9OUyxcbiAgICAgICAgY2FjaGVkTWV0aG9kczogY2xvdWRmcm9udC5DYWNoZWRNZXRob2RzLkNBQ0hFX0dFVF9IRUFELFxuICAgICAgICBjYWNoZVBvbGljeTogY2xvdWRmcm9udC5DYWNoZVBvbGljeS5DQUNISU5HX09QVElNSVpFRCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLnNlcnZpY2VVcmwgPSBkaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uRG9tYWluTmFtZTtcblxuICAgIC8vIDguIERlcGxveSBzdGF0aWMgd2ViIGZpbGVzIGFuZCBkeW5hbWljIGNvbmZpZy5qc29uIHRvIHdlYnNpdGUgYnVja2V0XG4gICAgbmV3IHMzZGVwbG95LkJ1Y2tldERlcGxveW1lbnQodGhpcywgXCJEZXBsb3lEYXRpbmdHYW1lV2Vic2l0ZUFuZENvbmZpZ1wiLCB7XG4gICAgICBzb3VyY2VzOiBbXG4gICAgICAgIHMzZGVwbG95LlNvdXJjZS5hc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uLy4uLy4uL2Zyb250ZW5kXCIpKSxcbiAgICAgICAgczNkZXBsb3kuU291cmNlLmpzb25EYXRhKFwiY29uZmlnLmpzb25cIiwge1xuICAgICAgICAgIHJlZ2lvbjogU3RhY2sub2YodGhpcykucmVnaW9uLFxuICAgICAgICAgIHVzZXJQb29sSWQ6IHByb3BzLnVzZXJQb29sSWQsXG4gICAgICAgICAgY2xpZW50SWQ6IHByb3BzLnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICAgICAgaWRlbnRpdHlQb29sSWQ6IHByb3BzLmlkZW50aXR5UG9vbElkLFxuICAgICAgICAgIHJ1bnRpbWVBcm46IHJ1bnRpbWUuYWdlbnRSdW50aW1lQXJuLFxuICAgICAgICB9KSxcbiAgICAgIF0sXG4gICAgICBkZXN0aW5hdGlvbkJ1Y2tldDogd2Vic2l0ZUJ1Y2tldCxcbiAgICAgIGRpc3RyaWJ1dGlvbixcbiAgICAgIGRpc3RyaWJ1dGlvblBhdGhzOiBbXCIvKlwiXSxcbiAgICB9KTtcbiAgfVxufVxuIl19
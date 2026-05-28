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
        // 4. Grant access to invoke Bedrock models used by the visible and hidden agents
        runtime.role.addToPrincipalPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                "bedrock:InvokeModel",
                "bedrock:InvokeModelWithResponseStream",
            ],
            resources: [
                "arn:aws:bedrock:*::foundation-model/amazon.nova-sonic-v1:0",
                "arn:aws:bedrock:*::foundation-model/amazon.nova-2-sonic-v1:0",
                "arn:aws:bedrock:*::foundation-model/amazon.nova-pro-v1:0",
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGF0aW5nLWdhbWUtYWdlbnRjb3JlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZGF0aW5nLWdhbWUtYWdlbnRjb3JlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDJDQUF1QztBQUN2QyxnRkFBa0U7QUFDbEUseURBQTJDO0FBQzNDLHVEQUF5QztBQUN6Qyx3RUFBMEQ7QUFDMUQsdUVBQXlEO0FBQ3pELDRFQUE4RDtBQUM5RCwyQ0FBNkI7QUFDN0IsK0RBQXNEO0FBRXRELDZDQUFtRDtBQVNuRCxNQUFhLDRCQUE2QixTQUFRLHNCQUFTO0lBSXpELFlBQ0UsS0FBZ0IsRUFDaEIsRUFBVSxFQUNWLEtBQXdDO1FBRXhDLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsbUVBQW1FO1FBQ25FLE1BQU0sb0JBQW9CLEdBQUcsU0FBUyxDQUFDLG9CQUFvQixDQUFDLFNBQVMsQ0FDbkUsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsV0FBVyxDQUFDLEVBQ2pDO1lBQ0UsUUFBUSxFQUFFLHlCQUFRLENBQUMsV0FBVztZQUM5QixPQUFPLEVBQUUsQ0FBQyxPQUFPLEVBQUUsYUFBYSxFQUFFLE9BQU8sRUFBRSxLQUFLLENBQUMsRUFBRSwyR0FBMkc7U0FDL0osQ0FDRixDQUFDO1FBRUYsa0VBQWtFO1FBQ2xFLE1BQU0sT0FBTyxHQUFHLElBQUksU0FBUyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFO1lBQ3JELFdBQVcsRUFBRSx1QkFBdUI7WUFDcEMsb0JBQW9CLEVBQUUsb0JBQW9CO1lBQzFDLHVCQUF1QixFQUFFLFNBQVMsQ0FBQyw4QkFBOEIsQ0FBQyxRQUFRLEVBQUU7WUFDNUUsb0JBQW9CLEVBQUU7Z0JBQ3BCLFNBQVMsRUFBRSxLQUFLO2dCQUNoQixrQkFBa0IsRUFBRSxXQUFXO2dCQUMvQixlQUFlLEVBQUUsS0FBSyxDQUFD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LElBQUksRUFBRSxrQ0FBa0MsRUFBRTtZQUN0RSxPQUFPLEVBQUU7Z0JBQ1AsUUFBUSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztnQkFDaEUsUUFBUSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsYUFBYSxFQUFFO29CQUN0QyxNQUFNLEVBQUUsbUJBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTTtvQkFDN0IsVUFBVSxFQUFFLEtBQUssQ0FBQyxVQUFVO29CQUM1QixRQUFRLEVBQUUsS0FBSyxDQUFDLGdCQUFnQjtvQkFDaEMsY0FBYyxFQUFFLEtBQUssQ0FBQyxjQUFjO29CQUNwQyxVQUFVLEVBQUUsT0FBTyxDQUFDLGVBQWU7aUJBQ3BDLENBQUM7YUFDSDtZQUNELGlCQUFpQixFQUFFLGFBQWE7WUFDaEMsWUFBWTtZQUNaLGlCQUFpQixFQUFFLENBQUMsSUFBSSxDQUFDO1NBQzFCLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXBIRCxvRUFvSEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tIFwiY29uc3RydWN0c1wiO1xuaW1wb3J0ICogYXMgYWdlbnRjb3JlIGZyb20gXCJAYXdzLWNkay9hd3MtYmVkcm9jay1hZ2VudGNvcmUtYWxwaGFcIjtcbmltcG9ydCAqIGFzIGlhbSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWlhbVwiO1xuaW1wb3J0ICogYXMgczMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zM1wiO1xuaW1wb3J0ICogYXMgczNkZXBsb3kgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zMy1kZXBsb3ltZW50XCI7XG5pbXBvcnQgKiBhcyBjbG91ZGZyb250IGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtY2xvdWRmcm9udFwiO1xuaW1wb3J0ICogYXMgb3JpZ2lucyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQtb3JpZ2luc1wiO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tIFwicGF0aFwiO1xuaW1wb3J0IHsgUGxhdGZvcm0gfSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWVjci1hc3NldHNcIjtcbmltcG9ydCB7IERhdGFiYXNlQ29uc3RydWN0IH0gZnJvbSBcIi4vZGF0ZWJhc2VcIjtcbmltcG9ydCB7IFN0YWNrLCBSZW1vdmFsUG9saWN5IH0gZnJvbSBcImF3cy1jZGstbGliXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGF0aW5nR2FtZUFnZW50Y29yZUNvbnN0cnVjdFByb3BzIHtcbiAgcmVhZG9ubHkgZGF0YWJhc2U6IERhdGFiYXNlQ29uc3RydWN0O1xuICByZWFkb25seSB1c2VyUG9vbElkOiBzdHJpbmc7XG4gIHJlYWRvbmx5IHVzZXJQb29sQ2xpZW50SWQ6IHN0cmluZztcbiAgcmVhZG9ubHkgaWRlbnRpdHlQb29sSWQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIERhdGluZ0dhbWVBZ2VudGNvcmVDb25zdHJ1Y3QgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICBwdWJsaWMgcmVhZG9ubHkgcnVudGltZUFybjogc3RyaW5nO1xuICBwdWJsaWMgcmVhZG9ubHkgc2VydmljZVVybDogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHNjb3BlOiBDb25zdHJ1Y3QsXG4gICAgaWQ6IHN0cmluZyxcbiAgICBwcm9wczogRGF0aW5nR2FtZUFnZW50Y29yZUNvbnN0cnVjdFByb3BzXG4gICkge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICAvLyAxLiBQYWNrYWdlIGNvbnRhaW5lciBkaXJlY3RseSBvbnRvIEFXUyBCZWRyb2NrIEFnZW50Q29yZSBSdW50aW1lXG4gICAgY29uc3QgYWdlbnRSdW50aW1lQXJ0aWZhY3QgPSBhZ2VudGNvcmUuQWdlbnRSdW50aW1lQXJ0aWZhY3QuZnJvbUFzc2V0KFxuICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi8uLi8uLi9cIiksXG4gICAgICB7XG4gICAgICAgIHBsYXRmb3JtOiBQbGF0Zm9ybS5MSU5VWF9BUk02NCxcbiAgICAgICAgZXhjbHVkZTogW1wiLnZlbnZcIiwgXCJfX3B5Y2FjaGVfX1wiLCBcInRlc3RzXCIsIFwiY2RrXCJdLCAvLyBQcmV2ZW50IHZpcnR1YWxlbnYgYW5kIGNhY2hlIGZpbGVzIGZyb20gaW5mbGF0aW5nIGNvbnRhaW5lciBzaXplLCBrZWVwaW5nIHRoZSBlc3NlbnRpYWwgcHVibGljIGRpcmVjdG9yeVxuICAgICAgfVxuICAgICk7XG5cbiAgICAvLyAyLiBDcmVhdGUgdGhlIEFnZW50Q29yZSBSdW50aW1lIHdpdGggSUFNIGF1dGhlbnRpY2F0aW9uIChTaWdWNClcbiAgICBjb25zdCBydW50aW1lID0gbmV3IGFnZW50Y29yZS5SdW50aW1lKHRoaXMsIFwiUnVudGltZVwiLCB7XG4gICAgICBydW50aW1lTmFtZTogXCJkYXRpbmdfZ2FtZV9hZ2VudGNvcmVcIixcbiAgICAgIGFnZW50UnVudGltZUFydGlmYWN0OiBhZ2VudFJ1bnRpbWVBcnRpZmFjdCxcbiAgICAgIGF1dGhvcml6ZXJDb25maWd1cmF0aW9uOiBhZ2VudGNvcmUuUnVudGltZUF1dGhvcml6ZXJDb25maWd1cmF0aW9uLnVzaW5nSUFNKCksXG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlczoge1xuICAgICAgICBJc0luQ2xvdWQ6IFwieWVzXCIsXG4gICAgICAgIEFXU19CRURST0NLX1JFR0lPTjogXCJ1cy1lYXN0LTFcIixcbiAgICAgICAgRGF0aW5nR2FtZVRhYmxlOiBwcm9wcy5kYXRhYmFzZS5kYXRpbmdHYW1lVGFibGUudGFibGVOYW1lLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMucnVudGltZUFybiA9IHJ1bnRpbWUuYWdlbnRSdW50aW1lQXJuO1xuXG4gICAgLy8gMy4gR3JhbnQgZnVsbCBhY2Nlc3MgdG8gRHluYW1vREIgdGFibGVzXG4gICAgcHJvcHMuZGF0YWJhc2UuZGF0aW5nR2FtZVRhYmxlLmdyYW50RnVsbEFjY2VzcyhydW50aW1lLnJvbGUpO1xuXG4gICAgLy8gNC4gR3JhbnQgYWNjZXNzIHRvIGludm9rZSBCZWRyb2NrIG1vZGVscyB1c2VkIGJ5IHRoZSB2aXNpYmxlIGFuZCBoaWRkZW4gYWdlbnRzXG4gICAgcnVudGltZS5yb2xlLmFkZFRvUHJpbmNpcGFsUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICBcImJlZHJvY2s6SW52b2tlTW9kZWxcIixcbiAgICAgICAgICBcImJlZHJvY2s6SW52b2tlTW9kZWxXaXRoUmVzcG9uc2VTdHJlYW1cIixcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgXCJhcm46YXdzOmJlZHJvY2s6Kjo6Zm91bmRhdGlvbi1tb2RlbC9hbWF6b24ubm92YS1zb25pYy12MTowXCIsXG4gICAgICAgICAgXCJhcm46YXdzOmJlZHJvY2s6Kjo6Zm91bmRhdGlvbi1tb2RlbC9hbWF6b24ubm92YS0yLXNvbmljLXYxOjBcIixcbiAgICAgICAgICBcImFybjphd3M6YmVkcm9jazoqOjpmb3VuZGF0aW9uLW1vZGVsL2FtYXpvbi5ub3ZhLXByby12MTowXCIsXG4gICAgICAgIF0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyA1LiAoT3B0aW9uYWwpIEdyYW50IExhbWJkYSBpbnZvY2F0aW9uIGZvciBzcGVjaWFsaXplZCB0b29scyBpZiBhZGRlZCBsYXRlclxuXG4gICAgLy8gNi4gU2VydmVybGVzcyBGcm9udGVuZCBTMyBXZWJzaXRlIEJ1Y2tldFxuICAgIGNvbnN0IHdlYnNpdGVCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsIFwiRGF0aW5nR2FtZVdlYnNpdGVCdWNrZXRcIiwge1xuICAgICAgd2Vic2l0ZUluZGV4RG9jdW1lbnQ6IFwiaW5kZXguaHRtbFwiLFxuICAgICAgcmVtb3ZhbFBvbGljeTogUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsXG4gICAgICBwdWJsaWNSZWFkQWNjZXNzOiB0cnVlLFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FDTFNfT05MWSxcbiAgICAgIGNvcnM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGFsbG93ZWRIZWFkZXJzOiBbXCIqXCJdLFxuICAgICAgICAgIGFsbG93ZWRNZXRob2RzOiBbczMuSHR0cE1ldGhvZHMuR0VULCBzMy5IdHRwTWV0aG9kcy5IRUFEXSxcbiAgICAgICAgICBhbGxvd2VkT3JpZ2luczogW1wiKlwiXSxcbiAgICAgICAgICBleHBvc2VkSGVhZGVyczogW1wiRGF0ZVwiLCBcIkVUYWdcIiwgXCJ4LWFtei1yZXF1ZXN0LWlkXCJdLFxuICAgICAgICAgIG1heEFnZTogMzAwMCxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICB3ZWJzaXRlQnVja2V0LmFkZFRvUmVzb3VyY2VQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFtcInMzOkdldE9iamVjdFwiXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbd2Vic2l0ZUJ1Y2tldC5hcm5Gb3JPYmplY3RzKFwiKlwiKV0sXG4gICAgICAgIHByaW5jaXBhbHM6IFtuZXcgaWFtLkFueVByaW5jaXBhbCgpXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIDcuIENvc3QtRWZmaWNpZW50IENsb3VkRnJvbnQgRGlzdHJpYnV0aW9uIChQcmljZSBDbGFzcyAxMDApXG4gICAgY29uc3Qgb2FpID0gbmV3IGNsb3VkZnJvbnQuT3JpZ2luQWNjZXNzSWRlbnRpdHkodGhpcywgXCJEYXRpbmdHYW1lT0FJXCIpO1xuICAgIHdlYnNpdGVCdWNrZXQuZ3JhbnRSZWFkKG9haSk7XG5cbiAgICBjb25zdCBkaXN0cmlidXRpb24gPSBuZXcgY2xvdWRmcm9udC5EaXN0cmlidXRpb24odGhpcywgXCJEYXRpbmdHYW1lRGlzdHJpYnV0aW9uXCIsIHtcbiAgICAgIGRlZmF1bHRSb290T2JqZWN0OiBcImluZGV4Lmh0bWxcIixcbiAgICAgIHByaWNlQ2xhc3M6IGNsb3VkZnJvbnQuUHJpY2VDbGFzcy5QUklDRV9DTEFTU18xMDAsXG4gICAgICBkZWZhdWx0QmVoYXZpb3I6IHtcbiAgICAgICAgb3JpZ2luOiBvcmlnaW5zLlMzQnVja2V0T3JpZ2luLndpdGhPcmlnaW5BY2Nlc3NJZGVudGl0eSh3ZWJzaXRlQnVja2V0LCB7IG9yaWdpbkFjY2Vzc0lkZW50aXR5OiBvYWkgfSksXG4gICAgICAgIHZpZXdlclByb3RvY29sUG9saWN5OiBjbG91ZGZyb250LlZpZXdlclByb3RvY29sUG9saWN5LlJFRElSRUNUX1RPX0hUVFBTLFxuICAgICAgICBhbGxvd2VkTWV0aG9kczogY2xvdWRmcm9udC5BbGxvd2VkTWV0aG9kcy5BTExPV19HRVRfSEVBRF9PUFRJT05TLFxuICAgICAgICBjYWNoZWRNZXRob2RzOiBjbG91ZGZyb250LkNhY2hlZE1ldGhvZHMuQ0FDSEVfR0VUX0hFQUQsXG4gICAgICAgIGNhY2hlUG9saWN5OiBjbG91ZGZyb250LkNhY2hlUG9saWN5LkNBQ0hJTkdfT1BUSU1JWkVELFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMuc2VydmljZVVybCA9IGRpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lO1xuXG4gICAgLy8gOC4gRGVwbG95IHN0YXRpYyB3ZWIgZmlsZXMgYW5kIGR5bmFtaWMgY29uZmlnLmpzb24gdG8gd2Vic2l0ZSBidWNrZXRcbiAgICBuZXcgczNkZXBsb3kuQnVja2V0RGVwbG95bWVudCh0aGlzLCBcIkRlcGxveURhdGluZ0dhbWVXZWJzaXRlQW5kQ29uZmlnXCIsIHtcbiAgICAgIHNvdXJjZXM6IFtcbiAgICAgICAgczNkZXBsb3kuU291cmNlLmFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi4vLi4vLi4vZnJvbnRlbmRcIikpLFxuICAgICAgICBzM2RlcGxveS5Tb3VyY2UuanNvbkRhdGEoXCJjb25maWcuanNvblwiLCB7XG4gICAgICAgICAgcmVnaW9uOiBTdGFjay5vZih0aGlzKS5yZWdpb24sXG4gICAgICAgICAgdXNlclBvb2xJZDogcHJvcHMudXNlclBvb2xJZCxcbiAgICAgICAgICBjbGllbnRJZDogcHJvcHMudXNlclBvb2xDbGllbnRJZCxcbiAgICAgICAgICBpZGVudGl0eVBvb2xJZDogcHJvcHMuaWRlbnRpdHlQb29sSWQsXG4gICAgICAgICAgcnVudGltZUFybjogcnVudGltZS5hZ2VudFJ1bnRpbWVBcm4sXG4gICAgICAgIH0pLFxuICAgICAgXSxcbiAgICAgIGRlc3RpbmF0aW9uQnVja2V0OiB3ZWJzaXRlQnVja2V0LFxuICAgICAgZGlzdHJpYnV0aW9uLFxuICAgICAgZGlzdHJpYnV0aW9uUGF0aHM6IFtcIi8qXCJdLFxuICAgIH0pO1xuICB9XG59XG4iXX0=
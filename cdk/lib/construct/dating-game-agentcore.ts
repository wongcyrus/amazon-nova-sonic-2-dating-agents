import { Construct } from "constructs";
import * as agentcore from "@aws-cdk/aws-bedrock-agentcore-alpha";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as path from "path";
import { Platform } from "aws-cdk-lib/aws-ecr-assets";
import { DatabaseConstruct } from "./datebase";
import { Stack, RemovalPolicy } from "aws-cdk-lib";

export interface DatingGameAgentcoreConstructProps {
  readonly database: DatabaseConstruct;
  readonly userPoolId: string;
  readonly userPoolClientId: string;
  readonly identityPoolId: string;
}

export class DatingGameAgentcoreConstruct extends Construct {
  public readonly runtimeArn: string;
  public readonly analysisRuntimeArn: string;
  public readonly serviceUrl: string;

  constructor(
    scope: Construct,
    id: string,
    props: DatingGameAgentcoreConstructProps
  ) {
    super(scope, id);

    const runtimeAssetPath = path.join(__dirname, "../../../");
    const runtimeAssetOptions = {
      platform: Platform.LINUX_ARM64,
      exclude: [".venv", "__pycache__", "tests", "cdk"],
    };

    // 1. Package dedicated runtime images so the latency-sensitive voice path
    // and the slower multi-agent scoring path can scale independently.
    const realtimeRuntimeArtifact = agentcore.AgentRuntimeArtifact.fromAsset(
      runtimeAssetPath,
      {
        ...runtimeAssetOptions,
        file: "Dockerfile.realtime",
      }
    );
    const analysisRuntimeArtifact = agentcore.AgentRuntimeArtifact.fromAsset(
      runtimeAssetPath,
      {
        ...runtimeAssetOptions,
        file: "Dockerfile.analysis",
      }
    );

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
    realtimeRuntime.role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
        ],
        resources: [
          "arn:aws:bedrock:*::foundation-model/amazon.nova-sonic-v1:0",
          "arn:aws:bedrock:*::foundation-model/amazon.nova-2-sonic-v1:0",
        ],
      })
    );

    // 6. Grant the turn-analysis runtime access only to the non-realtime judge model.
    analysisRuntime.role.addToPrincipalPolicy(
      new iam.PolicyStatement({
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
      })
    );

    // 7. Allow the realtime runtime to invoke the internal turn-analysis runtime.
    realtimeRuntime.role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["bedrock-agentcore:InvokeAgentRuntime"],
        resources: [
          analysisRuntime.agentRuntimeArn,
          `${analysisRuntime.agentRuntimeArn}/*`,
        ],
      })
    );

    // 8. Serverless Frontend S3 Website Bucket
    const websiteBucket = new s3.Bucket(this, "DatingGameWebsiteBucket", {
      websiteIndexDocument: "index.html",
      removalPolicy: RemovalPolicy.DESTROY,
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

    websiteBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [websiteBucket.arnForObjects("*")],
        principals: [new iam.AnyPrincipal()],
      })
    );

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
          region: Stack.of(this).region,
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

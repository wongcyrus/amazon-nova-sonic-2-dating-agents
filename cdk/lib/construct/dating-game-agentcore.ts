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
  public readonly serviceUrl: string;

  constructor(
    scope: Construct,
    id: string,
    props: DatingGameAgentcoreConstructProps
  ) {
    super(scope, id);

    // 1. Package container directly onto AWS Bedrock AgentCore Runtime
    const agentRuntimeArtifact = agentcore.AgentRuntimeArtifact.fromAsset(
      path.join(__dirname, "../../../"),
      {
        platform: Platform.LINUX_ARM64,
        exclude: [".venv", "__pycache__", "tests", "cdk"], // Prevent virtualenv and cache files from inflating container size, keeping the essential public directory
      }
    );

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
    runtime.role.addToPrincipalPolicy(
      new iam.PolicyStatement({
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
      })
    );

    // 5. (Optional) Grant Lambda invocation for specialized tools if added later

    // 6. Serverless Frontend S3 Website Bucket
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
          region: Stack.of(this).region,
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

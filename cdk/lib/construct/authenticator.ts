import { Construct } from "constructs";
import {
  UserPool,
  UserPoolClient,
  VerificationEmailStyle,
  CfnIdentityPool,
  CfnIdentityPoolRoleAttachment,
} from "aws-cdk-lib/aws-cognito";
import * as iam from "aws-cdk-lib/aws-iam";
import { RemovalPolicy } from "aws-cdk-lib";

export interface AuthenticatorProps {
  readonly userPoolName?: string;
}

export class Authenticator extends Construct {
  public readonly userPool: UserPool;
  public readonly userPoolClient: UserPoolClient;
  public readonly identityPool: CfnIdentityPool;
  public readonly authenticatedRole: iam.Role;

  constructor(scope: Construct, id: string, props?: AuthenticatorProps) {
    super(scope, id);

    this.userPool = new UserPool(this, "UserPool", {
      userPoolName: props?.userPoolName ?? "amazon-nova-dating-game-user-pool",
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      userVerification: {
        emailStyle: VerificationEmailStyle.CODE,
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.userPoolClient = new UserPoolClient(this, "UserPoolClient", {
      userPool: this.userPool,
      generateSecret: false,
      authFlows: {
        userPassword: true,
        adminUserPassword: true,
        userSrp: true,
      },
    });

    // Create the Cognito Identity Pool
    this.identityPool = new CfnIdentityPool(this, "IdentityPool", {
      identityPoolName: "AmazonNovaDatingGameIdentityPool",
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: this.userPoolClient.userPoolClientId,
          providerName: this.userPool.userPoolProviderName,
        },
      ],
    });

    // Create Authenticated IAM Role for Identity Pool users
    this.authenticatedRole = new iam.Role(this, "CognitoDefaultAuthenticatedRole", {
      assumedBy: new iam.FederatedPrincipal(
        "cognito-identity.amazonaws.com",
        {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": this.identityPool.ref,
          },
          "ForAnyValue:StringLike": {
            "cognito-identity.amazonaws.com:amr": "authenticated",
          },
        },
        "sts:AssumeRoleWithWebIdentity"
      ),
      description: "IAM Role allocated to authenticated Cognito identity pool users for SigV4 signing",
    });

    // Bind roles to the Identity Pool
    new iam.CfnRolePolicy(this, "IdentityPoolRolePolicy", {
      policyName: "CognitoIdentityPoolPolicy",
      policyDocument: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["cognito-identity:GetCredentialsForIdentity"],
            resources: ["*"],
          }),
        ],
      }),
      roleName: this.authenticatedRole.roleName,
    });

    // Attach role mappings to the identity pool using L1 construct
    new CfnIdentityPoolRoleAttachment(this, "IdentityPoolRoleAttachment", {
      identityPoolId: this.identityPool.ref,
      roles: {
        authenticated: this.authenticatedRole.roleArn,
      },
    });
  }
}

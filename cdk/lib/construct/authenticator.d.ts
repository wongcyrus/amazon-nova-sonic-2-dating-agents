import { Construct } from "constructs";
import { UserPool, UserPoolClient, CfnIdentityPool } from "aws-cdk-lib/aws-cognito";
import * as iam from "aws-cdk-lib/aws-iam";
export interface AuthenticatorProps {
    readonly userPoolName?: string;
}
export declare class Authenticator extends Construct {
    readonly userPool: UserPool;
    readonly userPoolClient: UserPoolClient;
    readonly identityPool: CfnIdentityPool;
    readonly authenticatedRole: iam.Role;
    constructor(scope: Construct, id: string, props?: AuthenticatorProps);
}

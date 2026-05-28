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
exports.Authenticator = void 0;
const constructs_1 = require("constructs");
const aws_cognito_1 = require("aws-cdk-lib/aws-cognito");
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const aws_cdk_lib_1 = require("aws-cdk-lib");
class Authenticator extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        this.userPool = new aws_cognito_1.UserPool(this, "UserPool", {
            userPoolName: props?.userPoolName ?? "amazon-nova-dating-game-user-pool",
            selfSignUpEnabled: false,
            signInAliases: { email: true },
            standardAttributes: {
                email: { required: true, mutable: true },
            },
            userVerification: {
                emailStyle: aws_cognito_1.VerificationEmailStyle.CODE,
            },
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
        });
        this.userPoolClient = new aws_cognito_1.UserPoolClient(this, "UserPoolClient", {
            userPool: this.userPool,
            generateSecret: false,
            authFlows: {
                userPassword: true,
                adminUserPassword: true,
                userSrp: true,
            },
        });
        // Create the Cognito Identity Pool
        this.identityPool = new aws_cognito_1.CfnIdentityPool(this, "IdentityPool", {
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
            assumedBy: new iam.FederatedPrincipal("cognito-identity.amazonaws.com", {
                StringEquals: {
                    "cognito-identity.amazonaws.com:aud": this.identityPool.ref,
                },
                "ForAnyValue:StringLike": {
                    "cognito-identity.amazonaws.com:amr": "authenticated",
                },
            }, "sts:AssumeRoleWithWebIdentity"),
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
        new aws_cognito_1.CfnIdentityPoolRoleAttachment(this, "IdentityPoolRoleAttachment", {
            identityPoolId: this.identityPool.ref,
            roles: {
                authenticated: this.authenticatedRole.roleArn,
            },
        });
    }
}
exports.Authenticator = Authenticator;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aGVudGljYXRvci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGhlbnRpY2F0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsMkNBQXVDO0FBQ3ZDLHlEQU1pQztBQUNqQyx5REFBMkM7QUFDM0MsNkNBQTRDO0FBTTVDLE1BQWEsYUFBYyxTQUFRLHNCQUFTO0lBTTFDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBMEI7UUFDbEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksc0JBQVEsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFO1lBQzdDLFlBQVksRUFBRSxLQUFLLEVBQUUsWUFBWSxJQUFJLG1DQUFtQztZQUN4RSxpQkFBaUIsRUFBRSxLQUFLO1lBQ3hCLGFBQWEsRUFBRSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUU7WUFDOUIsa0JBQWtCLEVBQUU7Z0JBQ2xCLEtBQUssRUFBRSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRTthQUN6QztZQUNELGdCQUFnQixFQUFFO2dCQUNoQixVQUFVLEVBQUUsb0NBQXNCLENBQUMsSUFBSTthQUN4QztZQUNELGFBQWEsRUFBRSwyQkFBYSxDQUFDLE9BQU87U0FDckMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLDRCQUFjLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO1lBQy9ELFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUTtZQUN2QixjQUFjLEVBQUUsS0FBSztZQUNyQixTQUFTLEVBQUU7Z0JBQ1QsWUFBWSxFQUFFLElBQUk7Z0JBQ2xCLGlCQUFpQixFQUFFLElBQUk7Z0JBQ3ZCLE9BQU8sRUFBRSxJQUFJO2FBQ2Q7U0FDRixDQUFDLENBQUM7UUFFSCxtQ0FBbUM7UUFDbkMsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLDZCQUFlLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtZQUM1RCxnQkFBZ0IsRUFBRSxrQ0FBa0M7WUFDcEQsOEJBQThCLEVBQUUsS0FBSztZQUNyQyx3QkFBd0IsRUFBRTtnQkFDeEI7b0JBQ0UsUUFBUSxFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsZ0JBQWdCO29CQUM5QyxZQUFZLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxvQkFBb0I7aUJBQ2pEO2FBQ0Y7U0FDRixDQUFDLENBQUM7UUFFSCx3REFBd0Q7UUFDeEQsSUFBSSxDQUFDLGlCQUFpQixHQUFHLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsaUNBQWlDLEVBQUU7WUFDN0UsU0FBUyxFQUFFLElBQUksR0FBRyxDQUFDLGtCQUFrQixDQUNuQyxnQ0FBZ0MsRUFDaEM7Z0JBQ0UsWUFBWSxFQUFFO29CQUNaLG9DQUFvQyxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRztpQkFDNUQ7Z0JBQ0Qsd0JBQXdCLEVBQUU7b0JBQ3hCLG9DQUFvQyxFQUFFLGVBQWU7aUJBQ3REO2FBQ0YsRUFDRCwrQkFBK0IsQ0FDaEM7WUFDRCxXQUFXLEVBQUUsbUZBQW1GO1NBQ2pHLENBQUMsQ0FBQztRQUVILGtDQUFrQztRQUNsQyxJQUFJLEdBQUcsQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLHdCQUF3QixFQUFFO1lBQ3BELFVBQVUsRUFBRSwyQkFBMkI7WUFDdkMsY0FBYyxFQUFFLElBQUksR0FBRyxDQUFDLGNBQWMsQ0FBQztnQkFDckMsVUFBVSxFQUFFO29CQUNWLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQzt3QkFDdEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSzt3QkFDeEIsT0FBTyxFQUFFLENBQUMsNENBQTRDLENBQUM7d0JBQ3ZELFNBQVMsRUFBRSxDQUFDLEdBQUcsQ0FBQztxQkFDakIsQ0FBQztpQkFDSDthQUNGLENBQUM7WUFDRixRQUFRLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFFBQVE7U0FDMUMsQ0FBQyxDQUFDO1FBRUgsK0RBQStEO1FBQy9ELElBQUksMkNBQTZCLENBQUMsSUFBSSxFQUFFLDRCQUE0QixFQUFFO1lBQ3BFLGNBQWMsRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUc7WUFDckMsS0FBSyxFQUFFO2dCQUNMLGFBQWEsRUFBRSxJQUFJLENBQUMsaUJBQWlCLENBQUMsT0FBTzthQUM5QztTQUNGLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXBGRCxzQ0FvRkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tIFwiY29uc3RydWN0c1wiO1xuaW1wb3J0IHtcbiAgVXNlclBvb2wsXG4gIFVzZXJQb29sQ2xpZW50LFxuICBWZXJpZmljYXRpb25FbWFpbFN0eWxlLFxuICBDZm5JZGVudGl0eVBvb2wsXG4gIENmbklkZW50aXR5UG9vbFJvbGVBdHRhY2htZW50LFxufSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWNvZ25pdG9cIjtcbmltcG9ydCAqIGFzIGlhbSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWlhbVwiO1xuaW1wb3J0IHsgUmVtb3ZhbFBvbGljeSB9IGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhlbnRpY2F0b3JQcm9wcyB7XG4gIHJlYWRvbmx5IHVzZXJQb29sTmFtZT86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIEF1dGhlbnRpY2F0b3IgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICBwdWJsaWMgcmVhZG9ubHkgdXNlclBvb2w6IFVzZXJQb29sO1xuICBwdWJsaWMgcmVhZG9ubHkgdXNlclBvb2xDbGllbnQ6IFVzZXJQb29sQ2xpZW50O1xuICBwdWJsaWMgcmVhZG9ubHkgaWRlbnRpdHlQb29sOiBDZm5JZGVudGl0eVBvb2w7XG4gIHB1YmxpYyByZWFkb25seSBhdXRoZW50aWNhdGVkUm9sZTogaWFtLlJvbGU7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBBdXRoZW50aWNhdG9yUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgdGhpcy51c2VyUG9vbCA9IG5ldyBVc2VyUG9vbCh0aGlzLCBcIlVzZXJQb29sXCIsIHtcbiAgICAgIHVzZXJQb29sTmFtZTogcHJvcHM/LnVzZXJQb29sTmFtZSA/PyBcImFtYXpvbi1ub3ZhLWRhdGluZy1nYW1lLXVzZXItcG9vbFwiLFxuICAgICAgc2VsZlNpZ25VcEVuYWJsZWQ6IGZhbHNlLFxuICAgICAgc2lnbkluQWxpYXNlczogeyBlbWFpbDogdHJ1ZSB9LFxuICAgICAgc3RhbmRhcmRBdHRyaWJ1dGVzOiB7XG4gICAgICAgIGVtYWlsOiB7IHJlcXVpcmVkOiB0cnVlLCBtdXRhYmxlOiB0cnVlIH0sXG4gICAgICB9LFxuICAgICAgdXNlclZlcmlmaWNhdGlvbjoge1xuICAgICAgICBlbWFpbFN0eWxlOiBWZXJpZmljYXRpb25FbWFpbFN0eWxlLkNPREUsXG4gICAgICB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgdGhpcy51c2VyUG9vbENsaWVudCA9IG5ldyBVc2VyUG9vbENsaWVudCh0aGlzLCBcIlVzZXJQb29sQ2xpZW50XCIsIHtcbiAgICAgIHVzZXJQb29sOiB0aGlzLnVzZXJQb29sLFxuICAgICAgZ2VuZXJhdGVTZWNyZXQ6IGZhbHNlLFxuICAgICAgYXV0aEZsb3dzOiB7XG4gICAgICAgIHVzZXJQYXNzd29yZDogdHJ1ZSxcbiAgICAgICAgYWRtaW5Vc2VyUGFzc3dvcmQ6IHRydWUsXG4gICAgICAgIHVzZXJTcnA6IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBDb2duaXRvIElkZW50aXR5IFBvb2xcbiAgICB0aGlzLmlkZW50aXR5UG9vbCA9IG5ldyBDZm5JZGVudGl0eVBvb2wodGhpcywgXCJJZGVudGl0eVBvb2xcIiwge1xuICAgICAgaWRlbnRpdHlQb29sTmFtZTogXCJBbWF6b25Ob3ZhRGF0aW5nR2FtZUlkZW50aXR5UG9vbFwiLFxuICAgICAgYWxsb3dVbmF1dGhlbnRpY2F0ZWRJZGVudGl0aWVzOiBmYWxzZSxcbiAgICAgIGNvZ25pdG9JZGVudGl0eVByb3ZpZGVyczogW1xuICAgICAgICB7XG4gICAgICAgICAgY2xpZW50SWQ6IHRoaXMudXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgICAgICBwcm92aWRlck5hbWU6IHRoaXMudXNlclBvb2wudXNlclBvb2xQcm92aWRlck5hbWUsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIEF1dGhlbnRpY2F0ZWQgSUFNIFJvbGUgZm9yIElkZW50aXR5IFBvb2wgdXNlcnNcbiAgICB0aGlzLmF1dGhlbnRpY2F0ZWRSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsIFwiQ29nbml0b0RlZmF1bHRBdXRoZW50aWNhdGVkUm9sZVwiLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uRmVkZXJhdGVkUHJpbmNpcGFsKFxuICAgICAgICBcImNvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbVwiLFxuICAgICAgICB7XG4gICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICBcImNvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbTphdWRcIjogdGhpcy5pZGVudGl0eVBvb2wucmVmLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJGb3JBbnlWYWx1ZTpTdHJpbmdMaWtlXCI6IHtcbiAgICAgICAgICAgIFwiY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmFtclwiOiBcImF1dGhlbnRpY2F0ZWRcIixcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBcInN0czpBc3N1bWVSb2xlV2l0aFdlYklkZW50aXR5XCJcbiAgICAgICksXG4gICAgICBkZXNjcmlwdGlvbjogXCJJQU0gUm9sZSBhbGxvY2F0ZWQgdG8gYXV0aGVudGljYXRlZCBDb2duaXRvIGlkZW50aXR5IHBvb2wgdXNlcnMgZm9yIFNpZ1Y0IHNpZ25pbmdcIixcbiAgICB9KTtcblxuICAgIC8vIEJpbmQgcm9sZXMgdG8gdGhlIElkZW50aXR5IFBvb2xcbiAgICBuZXcgaWFtLkNmblJvbGVQb2xpY3kodGhpcywgXCJJZGVudGl0eVBvb2xSb2xlUG9saWN5XCIsIHtcbiAgICAgIHBvbGljeU5hbWU6IFwiQ29nbml0b0lkZW50aXR5UG9vbFBvbGljeVwiLFxuICAgICAgcG9saWN5RG9jdW1lbnQ6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgYWN0aW9uczogW1wiY29nbml0by1pZGVudGl0eTpHZXRDcmVkZW50aWFsc0ZvcklkZW50aXR5XCJdLFxuICAgICAgICAgICAgcmVzb3VyY2VzOiBbXCIqXCJdLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdLFxuICAgICAgfSksXG4gICAgICByb2xlTmFtZTogdGhpcy5hdXRoZW50aWNhdGVkUm9sZS5yb2xlTmFtZSxcbiAgICB9KTtcblxuICAgIC8vIEF0dGFjaCByb2xlIG1hcHBpbmdzIHRvIHRoZSBpZGVudGl0eSBwb29sIHVzaW5nIEwxIGNvbnN0cnVjdFxuICAgIG5ldyBDZm5JZGVudGl0eVBvb2xSb2xlQXR0YWNobWVudCh0aGlzLCBcIklkZW50aXR5UG9vbFJvbGVBdHRhY2htZW50XCIsIHtcbiAgICAgIGlkZW50aXR5UG9vbElkOiB0aGlzLmlkZW50aXR5UG9vbC5yZWYsXG4gICAgICByb2xlczoge1xuICAgICAgICBhdXRoZW50aWNhdGVkOiB0aGlzLmF1dGhlbnRpY2F0ZWRSb2xlLnJvbGVBcm4sXG4gICAgICB9LFxuICAgIH0pO1xuICB9XG59XG4iXX0=
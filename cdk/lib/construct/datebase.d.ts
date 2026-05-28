import { Construct } from "constructs";
import { TableV2 } from "aws-cdk-lib/aws-dynamodb";
export declare class DatabaseConstruct extends Construct {
    /**
     * The DynamoDB table instance
     */
    readonly datingGameTable: TableV2;
    constructor(scope: Construct, id: string);
}

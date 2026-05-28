import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { RemovalPolicy } from "aws-cdk-lib";
import { AttributeType, Billing, TableV2 } from "aws-cdk-lib/aws-dynamodb";

export class DatabaseConstruct extends Construct {
  /**
   * The DynamoDB table instance
   */
  public readonly datingGameTable: TableV2;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    this.datingGameTable = new TableV2(this, "DatingGameTable", {
      partitionKey: {
        name: "id",
        type: AttributeType.STRING,
      },
      billing: Billing.onDemand(), // On-demand capacity
      removalPolicy: RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: false,
      },
    });

    new cdk.CfnOutput(this, "DatingGameTableName", {
      key: "DatingGameTable",
      value: this.datingGameTable.tableName,
      description: "The name of the DynamoDB table for dating game sessions",
    });
  }
}

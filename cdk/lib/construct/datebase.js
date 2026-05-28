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
exports.DatabaseConstruct = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const constructs_1 = require("constructs");
const aws_cdk_lib_1 = require("aws-cdk-lib");
const aws_dynamodb_1 = require("aws-cdk-lib/aws-dynamodb");
class DatabaseConstruct extends constructs_1.Construct {
    constructor(scope, id) {
        super(scope, id);
        this.datingGameTable = new aws_dynamodb_1.TableV2(this, "DatingGameTable", {
            partitionKey: {
                name: "id",
                type: aws_dynamodb_1.AttributeType.STRING,
            },
            billing: aws_dynamodb_1.Billing.onDemand(), // On-demand capacity
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
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
exports.DatabaseConstruct = DatabaseConstruct;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGF0ZWJhc2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJkYXRlYmFzZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsMkNBQXVDO0FBQ3ZDLDZDQUE0QztBQUM1QywyREFBMkU7QUFFM0UsTUFBYSxpQkFBa0IsU0FBUSxzQkFBUztJQU05QyxZQUFZLEtBQWdCLEVBQUUsRUFBVTtRQUN0QyxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2pCLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxzQkFBTyxDQUFDLElBQUksRUFBRSxpQkFBaUIsRUFBRTtZQUMxRCxZQUFZLEVBQUU7Z0JBQ1osSUFBSSxFQUFFLElBQUk7Z0JBQ1YsSUFBSSxFQUFFLDRCQUFhLENBQUMsTUFBTTthQUMzQjtZQUNELE9BQU8sRUFBRSxzQkFBTyxDQUFDLFFBQVEsRUFBRSxFQUFFLHFCQUFxQjtZQUNsRCxhQUFhLEVBQUUsMkJBQWEsQ0FBQyxPQUFPO1lBQ3BDLGdDQUFnQyxFQUFFO2dCQUNoQywwQkFBMEIsRUFBRSxLQUFLO2FBQ2xDO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxxQkFBcUIsRUFBRTtZQUM3QyxHQUFHLEVBQUUsaUJBQWlCO1lBQ3RCLEtBQUssRUFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLFNBQVM7WUFDckMsV0FBVyxFQUFFLHlEQUF5RDtTQUN2RSxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUExQkQsOENBMEJDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSBcImNvbnN0cnVjdHNcIjtcbmltcG9ydCB7IFJlbW92YWxQb2xpY3kgfSBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCB7IEF0dHJpYnV0ZVR5cGUsIEJpbGxpbmcsIFRhYmxlVjIgfSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiXCI7XG5cbmV4cG9ydCBjbGFzcyBEYXRhYmFzZUNvbnN0cnVjdCBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKlxuICAgKiBUaGUgRHluYW1vREIgdGFibGUgaW5zdGFuY2VcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBkYXRpbmdHYW1lVGFibGU6IFRhYmxlVjI7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG4gICAgdGhpcy5kYXRpbmdHYW1lVGFibGUgPSBuZXcgVGFibGVWMih0aGlzLCBcIkRhdGluZ0dhbWVUYWJsZVwiLCB7XG4gICAgICBwYXJ0aXRpb25LZXk6IHtcbiAgICAgICAgbmFtZTogXCJpZFwiLFxuICAgICAgICB0eXBlOiBBdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgICBiaWxsaW5nOiBCaWxsaW5nLm9uRGVtYW5kKCksIC8vIE9uLWRlbWFuZCBjYXBhY2l0eVxuICAgICAgcmVtb3ZhbFBvbGljeTogUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHtcbiAgICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IGZhbHNlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiRGF0aW5nR2FtZVRhYmxlTmFtZVwiLCB7XG4gICAgICBrZXk6IFwiRGF0aW5nR2FtZVRhYmxlXCIsXG4gICAgICB2YWx1ZTogdGhpcy5kYXRpbmdHYW1lVGFibGUudGFibGVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246IFwiVGhlIG5hbWUgb2YgdGhlIER5bmFtb0RCIHRhYmxlIGZvciBkYXRpbmcgZ2FtZSBzZXNzaW9uc1wiLFxuICAgIH0pO1xuICB9XG59XG4iXX0=
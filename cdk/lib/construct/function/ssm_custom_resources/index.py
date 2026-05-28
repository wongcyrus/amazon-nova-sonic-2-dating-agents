import os

import boto3
import cfnresponse

region = os.environ["REGION"]
ssm_service_role = os.environ["SSM_SERVICE_ROLE"]

CREATE = "Create"
DELETE = "Delete"
response_data = {}


ssm_client = boto3.client("ssm", region_name=region)


def lambda_handler(event, context):
    print(event)

    key_name_id = "ActivationId"
    key_name_code = "ActivationCode"
    physical_resource_id = ""
    try:
        thing_name = event["ResourceProperties"]["ThingName"]
        prefix = event["ResourceProperties"]["Prefix"]

        if event["RequestType"] == CREATE:
            
            ssm_response = ssm_client.create_activation(
                DefaultInstanceName=thing_name,
                IamRole=ssm_service_role,
                Description=thing_name,
                Tags=[
                    {
                        "Key": "Name",
                        "Value": f"{prefix}-{thing_name}",
                    },
                    {
                        "Key": "Prefix",
                        "Value": prefix,
                    },
                ],
            )

            physical_resource_id = ssm_response[key_name_id]
            response_data[key_name_id] = ssm_response[key_name_id]
            response_data[key_name_code] = ssm_response[key_name_code]

        elif event["RequestType"] == DELETE:
            physical_resource_id = event["PhysicalResourceId"]
            ssm_response = ssm_client.delete_activation(
                ActivationId=physical_resource_id
            )

        cfnresponse.send(
            event=event,
            context=context,
            responseStatus=cfnresponse.SUCCESS,
            responseData=response_data,
            physicalResourceId=physical_resource_id,
        )

    except Exception as e:
        print(f"Unexpected error: {e}")
        cfnresponse.send(event, context, cfnresponse.FAILED, response_data)

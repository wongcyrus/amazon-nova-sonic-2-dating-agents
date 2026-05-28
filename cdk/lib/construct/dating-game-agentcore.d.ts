import { Construct } from "constructs";
import { DatabaseConstruct } from "./datebase";
export interface DatingGameAgentcoreConstructProps {
    readonly database: DatabaseConstruct;
    readonly userPoolId: string;
    readonly userPoolClientId: string;
    readonly identityPoolId: string;
}
export declare class DatingGameAgentcoreConstruct extends Construct {
    readonly runtimeArn: string;
    readonly serviceUrl: string;
    constructor(scope: Construct, id: string, props: DatingGameAgentcoreConstructProps);
}

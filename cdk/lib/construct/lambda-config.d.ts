import { Runtime } from "aws-cdk-lib/aws-lambda";
import { BundlingOptions } from "@aws-cdk/aws-lambda-python-alpha";
/**
 * Single source of truth for the Python Runtime across all Lambdas.
 * Changing this single line will safely update the compiler version,
 * the SAM build Docker image, and partition the pip cache directories!
 */
export declare const SHARED_PYTHON_RUNTIME: Runtime;
/**
 * Shared Python bundling options with partitioned pip cache mount.
 */
export declare const SHARED_PYTHON_BUNDLING: BundlingOptions;

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
exports.SHARED_PYTHON_BUNDLING = exports.SHARED_PYTHON_RUNTIME = void 0;
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const aws_cdk_lib_1 = require("aws-cdk-lib");
const aws_lambda_1 = require("aws-cdk-lib/aws-lambda");
/**
 * Single source of truth for the Python Runtime across all Lambdas.
 * Changing this single line will safely update the compiler version,
 * the SAM build Docker image, and partition the pip cache directories!
 */
exports.SHARED_PYTHON_RUNTIME = aws_lambda_1.Runtime.PYTHON_3_12;
// Dynamically extract version name (e.g. "python3.12" or "python3.13")
const pythonVersionName = exports.SHARED_PYTHON_RUNTIME.name;
// Partition the host pip cache by Python version to prevent cross-version conflicts
const hostCachePath = path.join(os.homedir(), ".cache", "pip", pythonVersionName);
// Dynamically target the corresponding AWS SAM build image
const samDockerImageUri = `public.ecr.aws/sam/build-${pythonVersionName}`;
/**
 * Shared Python bundling options with partitioned pip cache mount.
 */
exports.SHARED_PYTHON_BUNDLING = {
    assetExcludes: [".venv", "__pycache__", "tests"],
    image: aws_cdk_lib_1.DockerImage.fromRegistry(samDockerImageUri),
    volumes: [
        {
            hostPath: hostCachePath,
            containerPath: "/cache",
        }
    ],
    environment: {
        PIP_CACHE_DIR: "/cache",
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFtYmRhLWNvbmZpZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImxhbWJkYS1jb25maWcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsdUNBQXlCO0FBQ3pCLDJDQUE2QjtBQUM3Qiw2Q0FBMEM7QUFDMUMsdURBQWlEO0FBR2pEOzs7O0dBSUc7QUFDVSxRQUFBLHFCQUFxQixHQUFHLG9CQUFPLENBQUMsV0FBVyxDQUFDO0FBRXpELHVFQUF1RTtBQUN2RSxNQUFNLGlCQUFpQixHQUFHLDZCQUFxQixDQUFDLElBQUksQ0FBQztBQUVyRCxvRkFBb0Y7QUFDcEYsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO0FBRWxGLDJEQUEyRDtBQUMzRCxNQUFNLGlCQUFpQixHQUFHLDRCQUE0QixpQkFBaUIsRUFBRSxDQUFDO0FBRTFFOztHQUVHO0FBQ1UsUUFBQSxzQkFBc0IsR0FBb0I7SUFDckQsYUFBYSxFQUFFLENBQUMsT0FBTyxFQUFFLGFBQWEsRUFBRSxPQUFPLENBQUM7SUFDaEQsS0FBSyxFQUFFLHlCQUFXLENBQUMsWUFBWSxDQUFDLGlCQUFpQixDQUFDO0lBQ2xELE9BQU8sRUFBRTtRQUNQO1lBQ0UsUUFBUSxFQUFFLGFBQWE7WUFDdkIsYUFBYSxFQUFFLFFBQVE7U0FDeEI7S0FDRjtJQUNELFdBQVcsRUFBRTtRQUNYLGFBQWEsRUFBRSxRQUFRO0tBQ3hCO0NBQ0YsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIG9zIGZyb20gXCJvc1wiO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tIFwicGF0aFwiO1xuaW1wb3J0IHsgRG9ja2VySW1hZ2UgfSBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCB7IFJ1bnRpbWUgfSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWxhbWJkYVwiO1xuaW1wb3J0IHsgQnVuZGxpbmdPcHRpb25zIH0gZnJvbSBcIkBhd3MtY2RrL2F3cy1sYW1iZGEtcHl0aG9uLWFscGhhXCI7XG5cbi8qKlxuICogU2luZ2xlIHNvdXJjZSBvZiB0cnV0aCBmb3IgdGhlIFB5dGhvbiBSdW50aW1lIGFjcm9zcyBhbGwgTGFtYmRhcy5cbiAqIENoYW5naW5nIHRoaXMgc2luZ2xlIGxpbmUgd2lsbCBzYWZlbHkgdXBkYXRlIHRoZSBjb21waWxlciB2ZXJzaW9uLFxuICogdGhlIFNBTSBidWlsZCBEb2NrZXIgaW1hZ2UsIGFuZCBwYXJ0aXRpb24gdGhlIHBpcCBjYWNoZSBkaXJlY3RvcmllcyFcbiAqL1xuZXhwb3J0IGNvbnN0IFNIQVJFRF9QWVRIT05fUlVOVElNRSA9IFJ1bnRpbWUuUFlUSE9OXzNfMTI7XG5cbi8vIER5bmFtaWNhbGx5IGV4dHJhY3QgdmVyc2lvbiBuYW1lIChlLmcuIFwicHl0aG9uMy4xMlwiIG9yIFwicHl0aG9uMy4xM1wiKVxuY29uc3QgcHl0aG9uVmVyc2lvbk5hbWUgPSBTSEFSRURfUFlUSE9OX1JVTlRJTUUubmFtZTtcblxuLy8gUGFydGl0aW9uIHRoZSBob3N0IHBpcCBjYWNoZSBieSBQeXRob24gdmVyc2lvbiB0byBwcmV2ZW50IGNyb3NzLXZlcnNpb24gY29uZmxpY3RzXG5jb25zdCBob3N0Q2FjaGVQYXRoID0gcGF0aC5qb2luKG9zLmhvbWVkaXIoKSwgXCIuY2FjaGVcIiwgXCJwaXBcIiwgcHl0aG9uVmVyc2lvbk5hbWUpO1xuXG4vLyBEeW5hbWljYWxseSB0YXJnZXQgdGhlIGNvcnJlc3BvbmRpbmcgQVdTIFNBTSBidWlsZCBpbWFnZVxuY29uc3Qgc2FtRG9ja2VySW1hZ2VVcmkgPSBgcHVibGljLmVjci5hd3Mvc2FtL2J1aWxkLSR7cHl0aG9uVmVyc2lvbk5hbWV9YDtcblxuLyoqXG4gKiBTaGFyZWQgUHl0aG9uIGJ1bmRsaW5nIG9wdGlvbnMgd2l0aCBwYXJ0aXRpb25lZCBwaXAgY2FjaGUgbW91bnQuXG4gKi9cbmV4cG9ydCBjb25zdCBTSEFSRURfUFlUSE9OX0JVTkRMSU5HOiBCdW5kbGluZ09wdGlvbnMgPSB7XG4gIGFzc2V0RXhjbHVkZXM6IFtcIi52ZW52XCIsIFwiX19weWNhY2hlX19cIiwgXCJ0ZXN0c1wiXSxcbiAgaW1hZ2U6IERvY2tlckltYWdlLmZyb21SZWdpc3RyeShzYW1Eb2NrZXJJbWFnZVVyaSksXG4gIHZvbHVtZXM6IFtcbiAgICB7XG4gICAgICBob3N0UGF0aDogaG9zdENhY2hlUGF0aCxcbiAgICAgIGNvbnRhaW5lclBhdGg6IFwiL2NhY2hlXCIsXG4gICAgfVxuICBdLFxuICBlbnZpcm9ubWVudDoge1xuICAgIFBJUF9DQUNIRV9ESVI6IFwiL2NhY2hlXCIsXG4gIH1cbn07XG4iXX0=
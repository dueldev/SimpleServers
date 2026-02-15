import type { ServerType } from "../domain/types.js";

export type PolicyFinding = {
  code: string;
  severity: "warning" | "critical";
  message: string;
};

export class PolicyService {
  evaluateServerCreatePolicy(input: {
    name: string;
    type: ServerType;
    allowCracked: boolean;
    maxMemoryMb: number;
    port: number;
  }): PolicyFinding[] {
    const findings: PolicyFinding[] = [];

    if (input.allowCracked) {
      findings.push({
        code: "offline_mode_risk",
        severity: "warning",
        message: "offline mode (non-premium access) increases impersonation risk"
      });
    }

    if (input.maxMemoryMb > 32_768) {
      findings.push({
        code: "high_memory_allocation",
        severity: "warning",
        message: "memory allocation exceeds 32 GB and can destabilize local systems"
      });
    }

    if (input.port < 1024) {
      findings.push({
        code: "privileged_port",
        severity: "critical",
        message: "ports below 1024 are privileged and not permitted"
      });
    }

    if (input.type === "vanilla" && input.maxMemoryMb > 8192) {
      findings.push({
        code: "vanilla_overprovisioning",
        severity: "warning",
        message: "vanilla servers rarely need more than 8GB memory"
      });
    }

    return findings;
  }
}

"use client";

import { useEffect, useState } from "react";

import { REMOTE_NAMES, type RemoteName } from "@mfa/contracts";
import { Badge, Panel, tokens } from "@mfa/ui";

import { REMOTE_ENTRIES } from "@/mf/runtime";

interface ProbeResult {
  remote: RemoteName;
  entry: string;
  status: "pending" | "ok" | "fail";
  detail: string;
}

/**
 * remote 가 안 뜰 때 원인을 빠르게 좁히기 위한 진단 화면.
 * MFA 에서 디버깅 시간을 가장 많이 잡아먹는 게 "누가 죽었는지" 파악이다.
 */
export function MfDiagnostics() {
  const [results, setResults] = useState<ProbeResult[]>(() =>
    REMOTE_NAMES.map((remote) => ({
      remote,
      entry: REMOTE_ENTRIES[remote],
      status: "pending" as const,
      detail: "확인 중…",
    })),
  );

  useEffect(() => {
    let cancelled = false;

    void Promise.all(
      REMOTE_NAMES.map(async (remote): Promise<ProbeResult> => {
        const entry = REMOTE_ENTRIES[remote];
        try {
          const res = await fetch(entry, { cache: "no-store" });
          if (!res.ok) {
            return { remote, entry, status: "fail", detail: `HTTP ${res.status}` };
          }
          const manifest: unknown = await res.json();
          const exposes =
            manifest &&
            typeof manifest === "object" &&
            "exposes" in manifest &&
            Array.isArray((manifest as { exposes: unknown[] }).exposes)
              ? (manifest as { exposes: { name?: string }[] }).exposes
                  .map((e) => e.name ?? "?")
                  .join(", ")
              : "(manifest 에 exposes 정보 없음)";
          return { remote, entry, status: "ok", detail: `exposes: ${exposes}` };
        } catch (error) {
          return {
            remote,
            entry,
            status: "fail",
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    ).then((next) => {
      if (!cancelled) setResults(next);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Panel origin="host · next 16" originHue={210} title="Module Federation 진단">
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", color: tokens.color.textMuted }}>
            <th style={{ padding: 8 }}>remote</th>
            <th style={{ padding: 8 }}>상태</th>
            <th style={{ padding: 8 }}>entry / 상세</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.remote} style={{ borderTop: `1px solid ${tokens.color.border}` }}>
              <td style={{ padding: 8, fontFamily: tokens.font.mono }}>{r.remote}</td>
              <td style={{ padding: 8 }}>
                <Badge hue={r.status === "ok" ? 140 : r.status === "fail" ? 0 : 45}>
                  {r.status}
                </Badge>
              </td>
              <td style={{ padding: 8, color: tokens.color.textMuted }}>
                <div style={{ fontFamily: tokens.font.mono, fontSize: 12 }}>{r.entry}</div>
                <div>{r.detail}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ margin: 0, color: tokens.color.textMuted, fontSize: 12, lineHeight: 1.7 }}>
        fail 이면 (1) 해당 remote dev 서버 미기동, (2) CORS 차단, (3) 포트 충돌 순으로 확인.
        <br />
        브라우저 콘솔에서 <code>__FEDERATION__</code> 전역으로 shared scope 실제 상태를 볼 수 있다.
      </p>
    </Panel>
  );
}
